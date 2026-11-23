import React, { useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  Camera,
  ImagePlus,
  Loader2,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import {
  addAlbumPhoto,
  deleteAlbumPhoto,
  fetchAlbumPhotos,
  subscribeRealtime,
} from '../supabaseClient';
import { soundFX } from '../sound';
import type { GalleryPhoto, Role } from '../types';

async function prepareImageForUpload(
  file: File,
  maxDim = 1280
): Promise<{ blob: Blob; fallbackDataUrl: string }> {
  const dataUrl = await new Promise<string>((resolve) => {
    const reader = new FileReader();
    reader.onload = () =>
      resolve(typeof reader.result === 'string' ? reader.result : '');
    reader.onerror = () => resolve('');
    reader.readAsDataURL(file);
  });

  // Pertahankan file asli jika GIF/SVG/WebP kecil atau FileReader gagal
  if (
    !dataUrl ||
    file.type === 'image/svg+xml' ||
    file.type === 'image/gif' ||
    file.size <= 350 * 1024
  ) {
    return { blob: file, fallbackDataUrl: dataUrl };
  }

  return new Promise<{ blob: Blob; fallbackDataUrl: string }>((resolve) => {
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
          resolve({ blob: file, fallbackDataUrl: dataUrl });
          return;
        }
        ctx.drawImage(img, 0, 0, w, h);
        const compressedUrl = canvas.toDataURL('image/jpeg', 0.82);
        canvas.toBlob(
          (blob) => {
            if (blob && blob.size > 0) {
              resolve({ blob, fallbackDataUrl: compressedUrl });
            } else {
              resolve({ blob: file, fallbackDataUrl: dataUrl });
            }
          },
          'image/jpeg',
          0.82
        );
      } catch {
        resolve({ blob: file, fallbackDataUrl: dataUrl });
      }
    };
    img.onerror = () => resolve({ blob: file, fallbackDataUrl: dataUrl });
    img.src = dataUrl;
  });
}

interface GaleriViewProps {
  currentUser: Role;
  onBack: () => void;
}

export const GaleriView: React.FC<GaleriViewProps> = ({ currentUser, onBack }) => {
  const [photos, setPhotos] = useState<GalleryPhoto[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [selected, setSelected] = useState<GalleryPhoto | null>(null);
  const [captionInput, setCaptionInput] = useState('');
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [failedIds, setFailedIds] = useState<Record<string, boolean>>({});
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const loadPosts = async () => {
    try {
      const data = await fetchAlbumPhotos();
      setPhotos(data);
    } finally {
      setLoadingList(false);
    }
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

  // Bersihkan object URL preview saat diganti / unmount
  useEffect(() => {
    return () => {
      if (previewUrl && previewUrl.startsWith('blob:')) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  const openGalleryPicker = () => {
    soundFX.playClick();
    if (uploading) return;
    setUploadError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
      fileInputRef.current.click();
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadError(null);
    setPendingFile(file);

    try {
      const objectUrl = URL.createObjectURL(file);
      setPreviewUrl(objectUrl);
    } catch {
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === 'string') {
          setPreviewUrl(reader.result);
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const clearPendingPreview = () => {
    if (uploading) return;
    setPendingFile(null);
    setPreviewUrl(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleConfirmUpload = async () => {
    if (!pendingFile || uploading) return;
    soundFX.playClick();
    setUploading(true);
    setUploadError(null);

    try {
      const { blob, fallbackDataUrl } = await prepareImageForUpload(pendingFile, 1280);
      const saved = await addAlbumPhoto({
        author: currentUser,
        caption: captionInput.trim(),
        file: blob,
        fileName: pendingFile.name,
        fallbackDataUrl: fallbackDataUrl || previewUrl || '',
      });

      if (saved.failed) {
        const errText =
          saved.errorDetails || 'Gagal upload foto ke keiz_album, coba lagi ya.';
        setUploadError(errText);
        return;
      }

      soundFX.playHeartBurst();
      setPhotos((prev) => [saved, ...prev.filter((p) => p.id !== saved.id)]);
      setCaptionInput('');
      setPendingFile(null);
      setPreviewUrl(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
      await loadPosts();
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : 'Gagal membaca/upload foto ke Supabase.';
      setUploadError(msg);
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (photo: GalleryPhoto) => {
    if (deleting) return;
    soundFX.playClick();
    setDeleting(true);
    setUploadError(null);

    const res = await deleteAlbumPhoto(photo.id, photo.url);
    setDeleting(false);

    if (!res.ok) {
      setUploadError(res.error || 'Gagal menghapus foto dari album.');
      return;
    }

    setSelected(null);
    setPhotos((prev) => prev.filter((p) => p.id !== photo.id));
    await loadPosts();
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

      {/* Hidden File Input (triggered via button onClick -> ref.click()) */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileSelect}
        className="hidden"
      />

      {/* Add Photo Bar + Preview */}
      <div className="keiz-sticker-card bg-white p-3.5">
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={captionInput}
            onChange={(e) => setCaptionInput(e.target.value)}
            placeholder="tulis caption lucu dulu..."
            disabled={uploading}
            className="min-h-[42px] flex-1 rounded-full border border-[#FFD6E7] bg-[#FFF2F7] px-3.5 text-xs font-medium text-[#2D0A1E] placeholder-[#9A7A8A] focus:outline-none disabled:opacity-60"
          />
          <button
            type="button"
            onClick={openGalleryPicker}
            disabled={uploading}
            className="btn-bucin flex min-h-[42px] shrink-0 items-center gap-1.5 rounded-full bg-gradient-to-r from-[#FF2E7E] to-[#FF7AB8] px-4 text-xs font-extrabold text-white shadow-sm cursor-pointer select-none disabled:opacity-75"
          >
            {uploading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Lagi upload...</span>
              </>
            ) : (
              <>
                <ImagePlus className="h-4 w-4" />
                <span>{pendingFile ? 'Ganti' : 'Tambah'}</span>
              </>
            )}
          </button>
        </div>

        {/* Preview Foto Sebelum Upload */}
        {pendingFile && previewUrl && (
          <div className="mt-3 rounded-2xl border-2 border-[#FFD6E7] bg-[#FFF7FA] p-2.5">
            <div className="flex items-start gap-3">
              <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-xl border border-[#FFD6E7] bg-white">
                <img
                  src={previewUrl}
                  alt="Preview foto terpilih"
                  className="h-full w-full object-cover"
                />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-[11px] font-extrabold text-[#E91E7A]">
                      Siap upload ke Album
                    </p>
                    <p className="truncate text-[11px] font-semibold text-[#5C3A49]">
                      {pendingFile.name}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={clearPendingPreview}
                    disabled={uploading}
                    aria-label="Batal pilih foto"
                    className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white text-[#8A6A7A] shadow-xs cursor-pointer disabled:opacity-50"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
                {captionInput.trim() && (
                  <p className="font-hand mt-1 line-clamp-2 text-[13px] font-bold text-[#2D0A1E]">
                    &ldquo;{captionInput.trim()}&rdquo;
                  </p>
                )}
                <button
                  type="button"
                  onClick={handleConfirmUpload}
                  disabled={uploading}
                  className="keiz-btn-primary btn-bucin mt-2 flex min-h-[36px] w-full items-center justify-center gap-1.5 px-3 text-xs cursor-pointer disabled:opacity-75"
                >
                  {uploading ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      <span>Lagi upload...</span>
                    </>
                  ) : (
                    <>
                      <Upload className="h-3.5 w-3.5" />
                      <span>Upload Foto</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Alert Error Asli dari Supabase */}
        {uploadError && (
          <div
            role="alert"
            className="mt-2.5 flex items-start justify-between gap-2 rounded-xl border border-rose-300 bg-rose-50 px-3 py-2.5 text-[11px] font-bold text-rose-700"
          >
            <div className="flex items-start gap-2 min-w-0">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" />
              <span className="break-all leading-relaxed">{uploadError}</span>
            </div>
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

      {/* Loading / Empty State / 2-Col Polaroid Grid */}
      {loadingList && photos.length === 0 ? (
        <div className="keiz-card flex flex-col items-center justify-center bg-white p-8 text-center">
          <Loader2 className="h-7 w-7 animate-spin text-[#E91E7A]" />
          <p className="mt-2 text-xs font-bold text-[#8A6A7A]">
            Lagi ngambil album foto...
          </p>
        </div>
      ) : photos.length === 0 ? (
        <div className="keiz-card bg-white p-8 text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-[#FFF2F7] text-[#E91E7A]">
            <Camera className="h-8 w-8" />
          </div>
          <p className="mt-3 text-xs font-extrabold text-[#5C3A49]">
            Belum ada foto kita, yuk upload foto pertama
          </p>
          <button
            type="button"
            onClick={openGalleryPicker}
            disabled={uploading}
            className="keiz-btn-primary btn-bucin mt-3 inline-flex min-h-[44px] items-center justify-center gap-1.5 px-6 text-xs cursor-pointer select-none disabled:opacity-75"
          >
            {uploading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Lagi upload...</span>
              </>
            ) : (
              <span>Upload Foto Pertama</span>
            )}
          </button>
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
                {!failedIds[photo.id] && photo.url ? (
                  <img
                    src={photo.url}
                    alt={photo.caption || 'Foto Album KEIZ'}
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
              <div className="min-h-[24px] px-1 pt-2">
                {photo.caption ? (
                  <p className="font-hand line-clamp-2 text-[14px] font-bold leading-snug text-[#2D0A1E]">
                    {photo.caption}
                  </p>
                ) : (
                  <p className="font-hand text-[12px] font-semibold text-[#B395A5]">
                    &nbsp;
                  </p>
                )}
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Lightbox Modal */}
      {selected && (
        <div
          onClick={() => !deleting && setSelected(null)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#2D0A1E]/75 p-4 backdrop-blur-sm"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="animate-bubble-pop relative w-full max-w-[390px] overflow-hidden rounded-[22px] border-2 border-[#FFD6E7] bg-white p-3 shadow-2xl"
          >
            <button
              type="button"
              onClick={() => {
                if (deleting) return;
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
              alt={selected.caption || 'Foto Album KEIZ'}
              className="max-h-[60vh] w-full rounded-2xl object-cover"
            />
            <div className="flex items-center justify-between px-2 pb-1 pt-3">
              <div>
                <p className="text-[11px] font-bold text-[#8A6A7A]">
                  {selected.dateLabel}
                </p>
                {selected.caption && (
                  <p className="font-hand mt-0.5 text-lg font-bold text-[#2D0A1E]">
                    {selected.caption}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => handleDelete(selected)}
                disabled={deleting}
                aria-label="Hapus foto"
                className="flex h-9 w-9 items-center justify-center rounded-full bg-rose-50 text-rose-600 cursor-pointer disabled:opacity-60"
              >
                {deleting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Trash2 className="h-4 w-4" />
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
