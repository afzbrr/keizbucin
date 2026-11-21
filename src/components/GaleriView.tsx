import React, { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Camera, ImagePlus, Trash2, X } from 'lucide-react';
import {
  addPostingan,
  deletePostingan,
  fetchPostingan,
  subscribeRealtime,
} from '../supabaseClient';
import { soundFX } from '../sound';
import type { GalleryPhoto, Role } from '../types';

async function compressImageFile(file: File, maxDim = 960): Promise<string> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
    reader.onerror = () => reject(new Error('Failed to read image'));
    reader.readAsDataURL(file);
  });
  if (!dataUrl || file.type === 'image/svg+xml') return dataUrl;

  return new Promise<string>((resolve) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
      const w = Math.max(1, Math.round(img.width * scale));
      const h = Math.max(1, Math.round(img.height * scale));
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve(dataUrl);
        return;
      }
      ctx.drawImage(img, 0, 0, w, h);
      resolve(canvas.toDataURL('image/jpeg', 0.8));
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}

interface GaleriViewProps {
  currentUser: Role;
  onBack: () => void;
}

export const GaleriView: React.FC<GaleriViewProps> = ({ currentUser, onBack }) => {
  const [photos, setPhotos] = useState<GalleryPhoto[]>([]);
  const [selected, setSelected] = useState<GalleryPhoto | null>(null);
  const [captionInput, setCaptionInput] = useState('');
  const [failedIds, setFailedIds] = useState<Record<string, boolean>>({});
  const fileRef = useRef<HTMLInputElement | null>(null);

  const loadPosts = async () => {
    const data = await fetchPostingan();
    setPhotos(data);
  };

  useEffect(() => {
    loadPosts();
    const unsub = subscribeRealtime({
      onPostingan: () => loadPosts(),
    });
    return unsub;
  }, []);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const compressed = await compressImageFile(file, 960);
    if (!compressed) return;
    soundFX.playHeartBurst();
    const saved = await addPostingan({
      author: currentUser,
      caption: captionInput.trim() || 'momen gemes kita berdua 💖',
      image_url: compressed,
    });
    if (saved) {
      setPhotos((prev) => [saved, ...prev.filter((p) => p.id !== saved.id)]);
    }
    setCaptionInput('');
  };

  const handleDelete = async (id: string) => {
    soundFX.playClick();
    setSelected(null);
    setPhotos((prev) => prev.filter((p) => p.id !== id));
    await deletePostingan(id);
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
          <button
            type="button"
            onClick={() => {
              soundFX.playClick();
              fileRef.current?.click();
            }}
            className="btn-bucin flex min-h-[42px] shrink-0 items-center gap-1.5 rounded-full bg-gradient-to-r from-[#FF2E7E] to-[#FF7AB8] px-4 text-xs font-extrabold text-white shadow-sm cursor-pointer"
          >
            <ImagePlus className="h-4 w-4" />
            <span>Tambah</span>
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            onChange={handleUpload}
            className="hidden"
          />
        </div>
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
          <button
            type="button"
            onClick={() => {
              soundFX.playPop();
              fileRef.current?.click();
            }}
            className="keiz-btn-primary btn-bucin mt-3 min-h-[44px] px-6 text-xs cursor-pointer"
          >
            Upload Foto Pertama
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
                onClick={() => handleDelete(selected.id)}
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
