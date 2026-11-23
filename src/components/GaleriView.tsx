import React, { useEffect, useState } from 'react';
import { ArrowLeft, Camera, ImagePlus, Loader2, Trash2, X } from 'lucide-react';
import {
  addAlbumPhoto,
  deleteAlbumPhoto,
  fetchAlbumPhotos,
  subscribeRealtime,
} from '../supabaseClient';
import { soundFX } from '../sound';
import type { GalleryPhoto, Role } from '../types';

async function compressImageFile(
  file: File,
  maxDim = 900
): Promise<{ dataUrl: string; blob: Blob | null }> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () =>
      resolve(typeof reader.result === 'string' ? reader.result : '');
    reader.onerror = () => reject(new Error('Gagal membaca file foto'));
    reader.readAsDataURL(file);
  });
  if (!dataUrl || file.type === 'image/svg+xml') {
    return { dataUrl, blob: file };
  }

  return new Promise<{ dataUrl: string; blob: Blob | null }>((resolve) => {
    const img = new Image();
    img.onload = () => {
      try {
        const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
        const w = Math.max(1, Math.round(img.width * scale));
        const h = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve({ dataUrl, blob: file });
          return;
        }
        ctx.drawImage(img, 0, 0, w, h);
        const compressedUrl = canvas.toDataURL('image/jpeg', 0.78);
        canvas.toBlob(
          async (blob) => {
            if (blob) {
              resolve({ dataUrl: compressedUrl, blob });
              return;
            }
            try {
              const res = await fetch(compressedUrl);
              const fallbackBlob = await res.blob();
              resolve({ dataUrl: compressedUrl, blob: fallbackBlob });
            } catch {
              resolve({ dataUrl: compressedUrl, blob: file });
            }
          },
          'image/jpeg',
          0.78
        );
      } catch {
        resolve({ dataUrl, blob: file });
      }
    };
    img.onerror = () => resolve({ dataUrl, blob: file });
    img.src = dataUrl;
  });
}

interface GaleriViewProps {
  currentUser: Role;
  onBack: () => void;
}

const ALBUM_INPUT_ID = 'keiz-album-photo-input';

export const GaleriView: React.FC<GaleriViewProps> = ({ currentUser, onBack }) => {
  const [photos, setPhotos] = useState<GalleryPhoto[]>([]);
  const [selected, setSelected] = useState<GalleryPhoto | null>(null);
  const [captionInput, setCaptionInput] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [failedIds, setFailedIds] = useState<Record<string, boolean>>({});

  const loadPosts = async () => {
    const data = await fetchAlbumPhotos();
    setPhotos(data);
  };

  useEffect(() => {
    void loadPosts();
    const unsub = subscribeRealtime({
      onAlbum: () => {
        void loadPosts();
      },
    });
    const poll = window.setInterval(() => {
      void loadPosts();
    }, 3000);
    return () => {
      unsub();
      window.clearInterval(poll);
    };
  }, []);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files ? Array.from(e.target.files) : [];
    e.target.value = '';
    if (fileList.length === 0) return;

    setUploading(true);
    setUploadError(null);
    const captionToUse = captionInput.trim() || 'momen gemes kita berdua 💖';

    try {
      for (const file of fileList) {
        const compressed = await compressImageFile(file, 900);
        if (!compressed.dataUrl) continue;
        const saved = await addAlbumPhoto({
          author: currentUser,
          caption: captionToUse,
          file: compressed.blob,
          fallbackDataUrl: compressed.dataUrl,
        });
        if (saved.failed) {
          setUploadError(
            saved.errorDetails || 'Gagal upload foto ke keiz_album, coba lagi ya.'
          );
        } else {
          soundFX.playHeartBurst();
          setPhotos((prev) => [saved, ...prev.filter((p) => p.id !== saved.id)]);
        }
      }
      setCaptionInput('');
    } catch (err) {
      setUploadError(
        err instanceof Error ? err.message : 'Gagal membaca/upload foto.'
      );
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (photo: GalleryPhoto) => {
    soundFX.playClick();
    setSelected(null);
    setPhotos((prev) => prev.filter((p) => p.id !== photo.id));
    await deleteAlbumPhoto(photo.id, photo.url);
  };

  return (
    <div className="animate-slide-in-right flex flex-col gap-4 pb-8">
      <div className="flex items-center gap-2.5">
        <button
          type="button"
          onClick={onBack}
          aria-label="Kembali"
          className="btn-bucin flex h-10 w-10 items-center justify-center rounded-full border border-[#FFD6E7] bg-white text-[#2D0A1E] cursor-pointer"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div>
          <h2 className="font-display text-[20px] font-extrabold leading-tight text-[#2D0A1E]">
            Album Polaroid
          </h2>
          <p className="text-[12px] font-semibold text-[#8A6A7A]">
            Simpan cerita &amp; foto gemes berdua
          </p>
        </div>
      </div>

      {/* Hidden Accessible File Input (sr-only so native <label> works on all mobile browsers & PWA) */}
      <input
        id={ALBUM_INPUT_ID}
        type="file"
        accept="image/*"
        multiple
        disabled={uploading}
        onChange={handleUpload}
        className="sr-only"
      />

      {/* Add Photo Bar */}
      <div className="keiz-sticker-card bg-white p-3.5">
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={captionInput}
            onChange={(e) => setCaptionInput(e.target.value)}
            placeholder="tulis caption lucu dulu sebelum upload..."
            className="min-h-[42px] flex-1 rounded-full border border-[#FFD6E7] bg-[#FFF2F7] px-3.5 text-xs font-medium text-[#2D0A1E] placeholder-[#9A7A8A] focus:outline-none"
          />
          <label
            htmlFor={ALBUM_INPUT_ID}
            onClick={() => soundFX.playClick()}
            className={`btn-bucin flex min-h-[42px] shrink-0 items-center gap-1.5 rounded-full bg-gradient-to-r from-[#FF2E7E] to-[#FF7AB8] px-4 text-xs font-extrabold text-white shadow-sm cursor-pointer select-none ${
              uploading ? 'pointer-events-none opacity-75' : ''
            }`}
          >
            {uploading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Upload...</span>
              </>
            ) : (
              <>
                <ImagePlus className="h-4 w-4" />
                <span>Tambah</span>
              </>
            )}
          </label>
        </div>

        {uploadError && (
          <div className="mt-2.5 flex items-center justify-between gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-[11px] font-bold text-rose-700">
            <span className="break-all">{uploadError}</span>
            <button
              type="button"
              onClick={() => setUploadError(null)}
              className="shrink-0 text-rose-500 cursor-pointer"
              aria-label="Tutup error upload"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
      </div>

      {/* Empty State or 2-Col Polaroid Grid */}
      {photos.length === 0 ? (
        <div className="keiz-card bg-white p-8 text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-[#FFF2F7] text-[#E91E7A]">
            <Camera className="h-8 w-8" />
          </div>
          <p className="mt-3 text-xs font-extrabold text-[#5C3A49]">
            Belum ada foto kita, yuk upload foto pertama
          </p>
          <label
            htmlFor={ALBUM_INPUT_ID}
            onClick={() => soundFX.playPop()}
            className={`keiz-btn-primary btn-bucin mt-3 inline-flex min-h-[44px] items-center justify-center px-6 text-xs cursor-pointer select-none ${
              uploading ? 'pointer-events-none opacity-75' : ''
            }`}
          >
            {uploading ? 'Mengupload foto...' : 'Upload Foto Pertama'}
          </label>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3.5 pt-1">
          {photos.map((photo, idx) => (
            <button
              key={photo.id}
              type="button"
              onClick={() => {
                soundFX.playPop();
                setSelected(photo);
              }}
              className={`keiz-sticker-card menu-card-bucin group relative bg-white p-2 pb-3 text-left cursor-pointer ${
                idx % 2 === 0 ? '-rotate-1' : 'rotate-1'
              }`}
            >
              <div className="washi-tape left-1/2 -top-2 -translate-x-1/2 scale-75" />
              <div className="relative aspect-[4/4.2] w-full overflow-hidden rounded-xl bg-[#FFF2F7]">
                {!failedIds[photo.id] ? (
                  <img
                    src={photo.url}
                    alt={photo.caption}
                    onError={() =>
                      setFailedIds((prev) => ({ ...prev, [photo.id]: true }))
                    }
                    className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                  />
                ) : (
                  <div className="flex h-full w-full flex-col items-center justify-center p-3 text-center">
                    <Camera className="h-6 w-6 text-[#E91E7A]" />
                    <span className="mt-1 text-[11px] text-[#8A6A7A]">
                      foto kenangan kita
                    </span>
                  </div>
                )}
                <div className="pointer-events-none absolute inset-x-0 bottom-0 h-14 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
                <span className="absolute bottom-1.5 left-2 text-[10px] font-bold text-white">
                  {photo.dateLabel}
                </span>
              </div>
              <div className="px-1 pt-2">
                <p className="font-hand line-clamp-2 text-[14px] font-bold leading-snug text-[#2D0A1E]">
                  {photo.caption}
                </p>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Lightbox Modal */}
      {selected && (
        <div
          onClick={() => setSelected(null)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#2D0A1E]/75 p-4 backdrop-blur-sm"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="animate-bubble-pop relative w-full max-w-[390px] overflow-hidden rounded-[22px] border-2 border-[#FFD6E7] bg-white p-3 shadow-2xl"
          >
            <button
              type="button"
              onClick={() => {
                soundFX.playClick();
                setSelected(null);
              }}
              aria-label="Tutup foto"
              className="btn-bucin absolute right-5 top-5 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-white/95 text-[#2D0A1E] shadow cursor-pointer"
            >
              <X className="h-4 w-4" />
            </button>
            <img
              src={selected.url}
              alt={selected.caption}
              className="max-h-[60vh] w-full rounded-2xl object-cover"
            />
            <div className="flex items-center justify-between px-2 pb-1 pt-3">
              <div>
                <p className="text-[11px] font-bold text-[#8A6A7A]">
                  {selected.dateLabel}
                </p>
                <p className="font-hand mt-0.5 text-lg font-bold text-[#2D0A1E]">
                  {selected.caption}
                </p>
              </div>
              <button
                type="button"
                onClick={() => handleDelete(selected)}
                aria-label="Hapus foto"
                className="flex h-9 w-9 items-center justify-center rounded-full bg-rose-50 text-rose-600 cursor-pointer"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
