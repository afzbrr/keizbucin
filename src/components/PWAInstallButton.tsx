import React, { useState } from 'react';
import { Download, PlusSquare, Share, Smartphone, X } from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';
import { soundFX } from '../sound';

interface PWAInstallButtonProps {
  variant?: 'card' | 'compact';
}

export const PWAInstallButton: React.FC<PWAInstallButtonProps> = ({
  variant = 'card',
}) => {
  const { canNativeInstall, isInstalled, isIOS, promptInstall } = usePWAInstall();
  const [showGuideModal, setShowGuideModal] = useState(false);

  // Jangan tampilkan tombol install jika sudah berjalan sebagai aplikasi standalone
  if (isInstalled) {
    return null;
  }

  const handleInstallClick = async () => {
    soundFX.playPop();
    if (canNativeInstall) {
      const res = await promptInstall();
      if (res !== 'unavailable') return;
    }
    setShowGuideModal(true);
  };

  return (
    <>
      {variant === 'compact' ? (
        <button
          type="button"
          onClick={handleInstallClick}
          className="btn-bucin flex w-full items-center justify-between gap-2.5 rounded-2xl border border-[#FFD6E7] bg-gradient-to-r from-[#FFF0F6] to-[#EFF6FF] px-3.5 py-2.5 text-left shadow-sm cursor-pointer"
        >
          <div className="flex min-w-0 items-center gap-2.5">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[#FF2E7E] to-[#FF7AB8] text-white shadow-sm">
              <Download className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <p className="truncate text-xs font-extrabold text-[#2D0A1E]">
                Install KEIZ BUCIN ke Home Screen
              </p>
              <p className="truncate text-[10px] font-semibold text-[#8A6A7A]">
                Biar musik tetap jalan &amp; buka kayak aplikasi
              </p>
            </div>
          </div>
          <span className="shrink-0 rounded-full bg-[#FF2E7E] px-3 py-1 text-[10px] font-extrabold text-white shadow-sm">
            Install
          </span>
        </button>
      ) : (
        <button
          type="button"
          onClick={handleInstallClick}
          className="keiz-sticker-card menu-card-bucin flex w-full items-center justify-between gap-3 bg-gradient-to-r from-[#FFF0F6] via-white to-[#EFF6FF] p-3.5 text-left cursor-pointer"
        >
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-[#FF2E7E] to-[#FF7AB8] text-white shadow-md shadow-pink-500/20">
              <Smartphone className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <p className="font-display text-[15px] font-extrabold leading-tight text-[#2D0A1E]">
                Install Aplikasi KEIZ BUCIN
              </p>
              <p className="mt-0.5 text-[11px] font-semibold leading-snug text-[#8A6A7A]">
                Pasang di Home Screen HP biar kayak app beneran
              </p>
            </div>
          </div>
          <span className="flex shrink-0 items-center gap-1 rounded-full bg-[#FF2E7E] px-3 py-1.5 text-[11px] font-extrabold text-white shadow-sm">
            <Download className="h-3.5 w-3.5" />
            <span>Install</span>
          </span>
        </button>
      )}

      {showGuideModal && (
        <div
          onClick={() => setShowGuideModal(false)}
          className="fixed inset-0 z-50 flex items-end justify-center bg-[#2D0A1E]/45 p-4 backdrop-blur-sm sm:items-center"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="keiz-card animate-bubble-pop w-full max-w-[390px] space-y-3 bg-white p-5"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-[#FFE3EE] text-[#FF2E7E]">
                  <Smartphone className="h-5 w-5" />
                </div>
                <h3 className="font-display text-base font-extrabold text-[#2D0A1E]">
                  Install ke Home Screen
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowGuideModal(false)}
                aria-label="Tutup"
                className="flex h-8 w-8 items-center justify-center rounded-full bg-[#FFF2F7] text-[#8A6A7A] cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {isIOS ? (
              <div className="space-y-2.5 rounded-2xl border border-[#FFD6E7] bg-[#FFF8FB] p-3.5 text-xs font-semibold text-[#2D0A1E]">
                <p className="font-extrabold text-[#D81B6E]">
                  Cara install di iPhone / iPad (Safari):
                </p>
                <div className="flex items-center gap-2.5">
                  <Share className="h-4 w-4 shrink-0 text-[#3B82F6]" />
                  <span>
                    1. Ketuk tombol <strong>Share</strong> (ikon kotak panah ke atas) di bawah layar Safari.
                  </span>
                </div>
                <div className="flex items-center gap-2.5">
                  <PlusSquare className="h-4 w-4 shrink-0 text-[#FF2E7E]" />
                  <span>
                    2. Pilih <strong>Add to Home Screen</strong> (Tambah ke Layar Utama), lalu ketuk <strong>Add</strong>.
                  </span>
                </div>
              </div>
            ) : (
              <div className="space-y-2 rounded-2xl border border-[#FFD6E7] bg-[#FFF8FB] p-3.5 text-xs font-semibold text-[#2D0A1E]">
                <p className="font-extrabold text-[#D81B6E]">
                  Cara install di Android / Browser:
                </p>
                <p>
                  1. Ketuk menu titik tiga (<strong>⋮</strong>) di pojok kanan atas Chrome.
                </p>
                <p>
                  2. Pilih <strong>Install app</strong> / <strong>Tambahkan ke Layar utama</strong>.
                </p>
              </div>
            )}

            <button
              type="button"
              onClick={() => setShowGuideModal(false)}
              className="keiz-btn-primary btn-bucin min-h-[42px] w-full text-xs cursor-pointer"
            >
              Oke, Ngerti 💖
            </button>
          </div>
        </div>
      )}
    </>
  );
};
