import React, { useState } from 'react';
import { Check, ImagePlus, X } from 'lucide-react';
import { uploadImageToKeizStorage } from '../supabaseClient';
import { soundFX } from '../sound';
import type { Role } from '../types';

export interface ChatWallpaperOption {
  id: string;
  name: string;
  backgroundColor: string;
  backgroundImage: string;
  backgroundSize: string;
}

function svgPatternUrl(svgInner: string, size = 180): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">${svgInner}</svg>`;
  return `url("data:image/svg+xml;utf8,${encodeURIComponent(svg)}")`;
}

export const CHAT_WALLPAPERS: readonly ChatWallpaperOption[] = [
  {
    id: 'awan-pelangi',
    name: 'awan pelangi',
    backgroundColor: '#FFF3F8',
    backgroundImage: `${svgPatternUrl(`
      <g opacity="0.9">
        <path d="M26 52 C26 42 36 36 45 39 C49 30 63 30 68 39 C76 37 84 43 84 52 Z" fill="#FFFFFF" stroke="#FFC2DC" stroke-width="2.2" stroke-linejoin="round"/>
        <circle cx="46" cy="48" r="1.6" fill="#6D2849"/><circle cx="62" cy="48" r="1.6" fill="#6D2849"/>
        <path d="M51 50 Q54 53 57 50" fill="none" stroke="#FF5E99" stroke-width="1.6" stroke-linecap="round"/>
        <circle cx="42" cy="49" r="2.2" fill="#FFB3D1" opacity="0.7"/><circle cx="66" cy="49" r="2.2" fill="#FFB3D1" opacity="0.7"/>
      </g>
      <g transform="translate(96, 86)" opacity="0.88">
        <path d="M12 42 C12 34 20 29 28 32 C32 24 44 24 48 32 C55 30 62 35 62 42 Z" fill="#FFFFFF" stroke="#BAE6FD" stroke-width="2.2" stroke-linejoin="round"/>
        <circle cx="30" cy="39" r="1.4" fill="#3B5998"/><circle cx="44" cy="39" r="1.4" fill="#3B5998"/>
        <path d="M35 41 Q37 43.5 39 41" fill="none" stroke="#60A5FA" stroke-width="1.5" stroke-linecap="round"/>
      </g>
      <path d="M135 28 L138 35 L145 36 L139 41 L141 48 L135 44 L129 48 L131 41 L125 36 L132 35 Z" fill="#FDE68A" stroke="#FBBF24" stroke-width="1.2"/>
      <path d="M40 132 L42 137 L47 138 L43 141 L44 146 L40 143 L36 146 L37 141 L33 138 L38 137 Z" fill="#FBCFE8"/>
      <circle cx="152" cy="148" r="4" fill="#C4B5FD" opacity="0.55"/>
      <circle cx="20" cy="100" r="3" fill="#FDE68A" opacity="0.8"/>
    `)}, linear-gradient(180deg, #FFF5FA 0%, #FFE9F4 55%, #F4F6FF 100%)`,
    backgroundSize: '180px 180px, 100% 100%',
  },
  {
    id: 'stroberi-susu',
    name: 'stroberi susu',
    backgroundColor: '#FFF5F7',
    backgroundImage: `${svgPatternUrl(`
      <g transform="translate(26,24) rotate(-8 20 20)">
        <path d="M20 12 C8 12 6 24 11 33 C15 40 25 40 29 33 C34 24 32 12 20 12 Z" fill="#FF7AA8" stroke="#FF4D8D" stroke-width="1.8"/>
        <path d="M13 13 Q20 7 27 13 Q22 16 20 13 Q18 16 13 13 Z" fill="#86EFAC" stroke="#34D399" stroke-width="1.3"/>
        <circle cx="16" cy="21" r="1.2" fill="#FFF5F7"/><circle cx="23" cy="22" r="1.2" fill="#FFF5F7"/><circle cx="19" cy="28" r="1.2" fill="#FFF5F7"/>
      </g>
      <g transform="translate(110,96) rotate(10 20 20)">
        <path d="M20 12 C8 12 6 24 11 33 C15 40 25 40 29 33 C34 24 32 12 20 12 Z" fill="#FF99BC" stroke="#FF5E99" stroke-width="1.8"/>
        <path d="M13 13 Q20 7 27 13 Q22 16 20 13 Q18 16 13 13 Z" fill="#86EFAC" stroke="#34D399" stroke-width="1.3"/>
        <circle cx="16" cy="22" r="1.2" fill="#FFF5F7"/><circle cx="24" cy="23" r="1.2" fill="#FFF5F7"/><circle cx="20" cy="29" r="1.2" fill="#FFF5F7"/>
      </g>
      <g transform="translate(116,28)">
        <circle cx="14" cy="14" r="5" fill="#FFFFFF" stroke="#FFD6E7" stroke-width="1.5"/>
        <circle cx="22" cy="14" r="5" fill="#FFFFFF" stroke="#FFD6E7" stroke-width="1.5"/>
        <circle cx="18" cy="8" r="5" fill="#FFFFFF" stroke="#FFD6E7" stroke-width="1.5"/>
        <circle cx="18" cy="20" r="5" fill="#FFFFFF" stroke="#FFD6E7" stroke-width="1.5"/>
        <circle cx="18" cy="14" r="3.5" fill="#FDE68A"/>
      </g>
      <circle cx="48" cy="126" r="5" fill="#FFE0EC"/>
      <circle cx="62" cy="140" r="3" fill="#FFCCE0"/>
      <circle cx="152" cy="64" r="3.5" fill="#FFE0EC"/>
    `)}, linear-gradient(180deg, #FFF7F9 0%, #FFEBF1 100%)`,
    backgroundSize: '180px 180px, 100% 100%',
  },
  {
    id: 'bintang-malam',
    name: 'bintang malam',
    backgroundColor: '#F2F0FF',
    backgroundImage: `${svgPatternUrl(`
      <path d="M44 26 C32 28 26 40 31 51 C36 62 49 65 59 58 C49 58 43 51 42 42 C41 35 42 30 44 26 Z" fill="#FDE68A" stroke="#FBBF24" stroke-width="1.6"/>
      <path d="M126 106 C116 108 111 118 115 127 C119 136 130 138 138 133 C130 133 125 127 124 120 C123 114 124 110 126 106 Z" fill="#FDE68A" stroke="#F59E0B" stroke-width="1.4"/>
      <path d="M128 36 Q131 44 139 47 Q131 50 128 58 Q125 50 117 47 Q125 44 128 36 Z" fill="#FFFFFF" stroke="#C4B5FD" stroke-width="1.4"/>
      <path d="M46 116 Q48 122 54 124 Q48 126 46 132 Q44 126 38 124 Q44 122 46 116 Z" fill="#FFFFFF" stroke="#F9A8D4" stroke-width="1.4"/>
      <circle cx="90" cy="78" r="3" fill="#DDD6FE"/>
      <circle cx="156" cy="78" r="2.5" fill="#FBCFE8"/>
      <circle cx="20" cy="86" r="2.2" fill="#BAE6FD"/>
      <circle cx="88" cy="154" r="2.8" fill="#FDE68A"/>
    `)}, linear-gradient(180deg, #F3F1FF 0%, #EAE6FF 55%, #FCEEFF 100%)`,
    backgroundSize: '180px 180px, 100% 100%',
  },
  {
    id: 'hati-coret',
    name: 'hati coret',
    backgroundColor: '#FFF9F5',
    backgroundImage: `${svgPatternUrl(`
      <path d="M44 48 C44 48 27 36 27 25 C27 19 32 15 37 15 C40.5 15 43 17.5 44 20 C45 17.5 47.5 15 51 15 C56 15 61 19 61 25 C61 36 44 48 44 48 Z" fill="#FFC2DC" stroke="#FF6B9E" stroke-width="1.8"/>
      <path d="M126 124 C126 124 112 114 112 105 C112 100 116 97 120 97 C123 97 125 99 126 101 C127 99 129 97 132 97 C136 97 140 100 140 105 C140 114 126 124 126 124 Z" fill="#BFDBFE" stroke="#60A5FA" stroke-width="1.8"/>
      <path d="M116 38 C116 38 107 32 107 26 C107 23 110 21 113 21 C114.5 21 115.6 22 116 23.5 C116.4 22 117.5 21 119 21 C122 21 125 23 125 26 C125 32 116 38 116 38 Z" fill="none" stroke="#FF85B3" stroke-width="1.7" stroke-dasharray="2.5 2"/>
      <path d="M36 126 Q48 116 58 126 T78 126" fill="none" stroke="#F9A8D4" stroke-width="2" stroke-linecap="round"/>
      <circle cx="88" cy="76" r="3" fill="#FDE68A"/>
      <circle cx="152" cy="64" r="2.5" fill="#A5F3FC"/>
      <circle cx="24" cy="84" r="2.5" fill="#FBCFE8"/>
    `)}, linear-gradient(180deg, #FFFAF7 0%, #FFF1F6 100%)`,
    backgroundSize: '180px 180px, 100% 100%',
  },
  {
    id: 'ceri-manis',
    name: 'ceri manis',
    backgroundColor: '#FFF5F8',
    backgroundImage: `${svgPatternUrl(`
      <g transform="translate(24,22)">
        <path d="M18 28 Q26 10 30 6 Q34 10 42 28" fill="none" stroke="#4ADE80" stroke-width="2.2" stroke-linecap="round"/>
        <ellipse cx="34" cy="9" rx="6" ry="3" transform="rotate(-18 34 9)" fill="#86EFAC"/>
        <circle cx="17" cy="31" r="8" fill="#FF5E93" stroke="#FFFFFF" stroke-width="1.5"/>
        <circle cx="42" cy="31" r="8" fill="#FF7AA8" stroke="#FFFFFF" stroke-width="1.5"/>
        <circle cx="14.5" cy="28.5" r="2" fill="#FFFFFF" opacity="0.75"/>
        <circle cx="39.5" cy="28.5" r="2" fill="#FFFFFF" opacity="0.75"/>
      </g>
      <g transform="translate(106,102) rotate(12 24 24)">
        <path d="M14 24 Q20 10 24 6 Q28 10 34 24" fill="none" stroke="#4ADE80" stroke-width="2" stroke-linecap="round"/>
        <circle cx="13" cy="27" r="7" fill="#FB7185" stroke="#FFFFFF" stroke-width="1.5"/>
        <circle cx="35" cy="27" r="7" fill="#FF85B3" stroke="#FFFFFF" stroke-width="1.5"/>
        <circle cx="11" cy="25" r="1.6" fill="#FFFFFF" opacity="0.75"/>
      </g>
      <path d="M126 36 C118 31 114 39 122 43 L126 39 L130 43 C138 39 134 31 126 36 Z" fill="#FBCFE8" stroke="#F472B6" stroke-width="1.4"/>
      <circle cx="48" cy="128" r="3" fill="#FDE68A"/>
      <circle cx="90" cy="84" r="2.5" fill="#FFCCE0"/>
    `)}, linear-gradient(180deg, #FFF7FA 0%, #FFEAF2 100%)`,
    backgroundSize: '180px 180px, 100% 100%',
  },
  {
    id: 'boba-lucu',
    name: 'boba lucu',
    backgroundColor: '#FDF6EE',
    backgroundImage: `${svgPatternUrl(`
      <g transform="translate(28,22)">
        <rect x="18" y="4" width="4" height="14" rx="2" transform="rotate(10 20 11)" fill="#FF7AB8"/>
        <path d="M10 18 L34 18 L30 48 C30 50 28 52 25 52 L19 52 C16 52 14 50 14 48 Z" fill="#FDE6C4" stroke="#E7B882" stroke-width="1.8"/>
        <rect x="8" y="15" width="28" height="5" rx="2.5" fill="#FFFFFF" stroke="#F9A8D4" stroke-width="1.4"/>
        <circle cx="18" cy="45" r="2.4" fill="#6D4C3D"/><circle cx="24" cy="46" r="2.4" fill="#6D4C3D"/><circle cx="27" cy="41" r="2.2" fill="#6D4C3D"/>
        <circle cx="18" cy="30" r="1.3" fill="#5C3A21"/><circle cx="26" cy="30" r="1.3" fill="#5C3A21"/>
        <path d="M20 33 Q22 35 24 33" fill="none" stroke="#E91E7A" stroke-width="1.4" stroke-linecap="round"/>
      </g>
      <g transform="translate(110,96) rotate(-8 20 28)">
        <rect x="18" y="4" width="4" height="14" rx="2" fill="#93C5FD"/>
        <path d="M10 18 L34 18 L30 48 C30 50 28 52 25 52 L19 52 C16 52 14 50 14 48 Z" fill="#FFE4EE" stroke="#F9A8D4" stroke-width="1.8"/>
        <rect x="8" y="15" width="28" height="5" rx="2.5" fill="#FFFFFF" stroke="#BFDBFE" stroke-width="1.4"/>
        <circle cx="18" cy="45" r="2.3" fill="#6D4C3D"/><circle cx="25" cy="45" r="2.3" fill="#6D4C3D"/>
        <circle cx="19" cy="30" r="1.2" fill="#5C3A21"/><circle cx="26" cy="30" r="1.2" fill="#5C3A21"/>
      </g>
      <circle cx="132" cy="42" r="4" fill="#FDE68A" opacity="0.8"/>
      <circle cx="48" cy="128" r="3.5" fill="#FFC2DC" opacity="0.8"/>
      <circle cx="90" cy="86" r="2.5" fill="#E7B882" opacity="0.5"/>
    `)}, linear-gradient(180deg, #FFF9F2 0%, #FCEFE1 100%)`,
    backgroundSize: '180px 180px, 100% 100%',
  },
  {
    id: 'bunga-daisy',
    name: 'bunga daisy',
    backgroundColor: '#F4FFF9',
    backgroundImage: `${svgPatternUrl(`
      <g transform="translate(26,24)">
        <circle cx="22" cy="11" r="6" fill="#FFFFFF" stroke="#BAE6FD" stroke-width="1.4"/>
        <circle cx="22" cy="33" r="6" fill="#FFFFFF" stroke="#BAE6FD" stroke-width="1.4"/>
        <circle cx="11" cy="22" r="6" fill="#FFFFFF" stroke="#BAE6FD" stroke-width="1.4"/>
        <circle cx="33" cy="22" r="6" fill="#FFFFFF" stroke="#BAE6FD" stroke-width="1.4"/>
        <circle cx="14" cy="14" r="5" fill="#FFFFFF"/><circle cx="30" cy="14" r="5" fill="#FFFFFF"/>
        <circle cx="14" cy="30" r="5" fill="#FFFFFF"/><circle cx="30" cy="30" r="5" fill="#FFFFFF"/>
        <circle cx="22" cy="22" r="6.5" fill="#FDE047"/>
      </g>
      <g transform="translate(108,104)">
        <circle cx="20" cy="10" r="5.5" fill="#FFF0F6" stroke="#FBCFE8" stroke-width="1.4"/>
        <circle cx="20" cy="30" r="5.5" fill="#FFF0F6" stroke="#FBCFE8" stroke-width="1.4"/>
        <circle cx="10" cy="20" r="5.5" fill="#FFF0F6" stroke="#FBCFE8" stroke-width="1.4"/>
        <circle cx="30" cy="20" r="5.5" fill="#FFF0F6" stroke="#FBCFE8" stroke-width="1.4"/>
        <circle cx="20" cy="20" r="5.5" fill="#FDE68A"/>
      </g>
      <ellipse cx="132" cy="40" rx="8" ry="4" transform="rotate(-24 132 40)" fill="#BBF7D0"/>
      <ellipse cx="48" cy="134" rx="7" ry="3.5" transform="rotate(20 48 134)" fill="#A7F3D0"/>
      <circle cx="92" cy="82" r="3" fill="#FDE68A"/>
    `)}, linear-gradient(180deg, #F3FFF9 0%, #FFFDF2 100%)`,
    backgroundSize: '180px 180px, 100% 100%',
  },
  {
    id: 'kupu-pastel',
    name: 'kupu pastel',
    backgroundColor: '#FAF2FF',
    backgroundImage: `${svgPatternUrl(`
      <g transform="translate(26,24) rotate(-10 24 22)">
        <ellipse cx="16" cy="16" rx="10" ry="8" fill="#F9A8D4" stroke="#FFFFFF" stroke-width="1.5"/>
        <ellipse cx="32" cy="16" rx="10" ry="8" fill="#F9A8D4" stroke="#FFFFFF" stroke-width="1.5"/>
        <ellipse cx="17" cy="27" rx="7" ry="6" fill="#DDD6FE" stroke="#FFFFFF" stroke-width="1.5"/>
        <ellipse cx="31" cy="27" rx="7" ry="6" fill="#DDD6FE" stroke="#FFFFFF" stroke-width="1.5"/>
        <rect x="22.5" y="13" width="3" height="19" rx="1.5" fill="#6D28D9"/>
        <path d="M23 13 Q20 7 17 8 M25 13 Q28 7 31 8" fill="none" stroke="#8B5CF6" stroke-width="1.3" stroke-linecap="round"/>
      </g>
      <g transform="translate(108,104) rotate(12 22 20)">
        <ellipse cx="15" cy="15" rx="9" ry="7" fill="#BAE6FD" stroke="#FFFFFF" stroke-width="1.4"/>
        <ellipse cx="29" cy="15" rx="9" ry="7" fill="#BAE6FD" stroke="#FFFFFF" stroke-width="1.4"/>
        <ellipse cx="16" cy="25" rx="6" ry="5" fill="#FBCFE8" stroke="#FFFFFF" stroke-width="1.4"/>
        <ellipse cx="28" cy="25" rx="6" ry="5" fill="#FBCFE8" stroke="#FFFFFF" stroke-width="1.4"/>
        <rect x="20.8" y="12" width="2.4" height="17" rx="1.2" fill="#4C1D95"/>
      </g>
      <circle cx="132" cy="40" r="3" fill="#F9A8D4" opacity="0.65"/>
      <circle cx="48" cy="134" r="3.5" fill="#BAE6FD" opacity="0.75"/>
      <path d="M90 76 L92 81 L97 82 L93 85 L94 90 L90 87 L86 90 L87 85 L83 82 L88 81 Z" fill="#FDE68A"/>
    `)}, linear-gradient(180deg, #FBF4FF 0%, #FFEFF7 100%)`,
    backgroundSize: '180px 180px, 100% 100%',
  },
  {
    id: 'surat-cinta',
    name: 'surat cinta',
    backgroundColor: '#F4F7FF',
    backgroundImage: `${svgPatternUrl(`
      <g transform="translate(24,26) rotate(-7 24 18)">
        <rect x="4" y="6" width="40" height="26" rx="6" fill="#FFFFFF" stroke="#F9A8D4" stroke-width="2"/>
        <path d="M5 8 L24 22 L43 8" fill="none" stroke="#F472B6" stroke-width="1.8" stroke-linejoin="round"/>
        <path d="M24 23 C24 23 19 19 19 16 C19 14.5 20.5 13.5 22 13.5 C23 13.5 23.7 14 24 15 C24.3 14 25 13.5 26 13.5 C27.5 13.5 29 14.5 29 16 C29 19 24 23 24 23 Z" fill="#FF4D8D"/>
      </g>
      <g transform="translate(106,104) rotate(8 22 16)">
        <rect x="4" y="6" width="36" height="24" rx="5" fill="#FFFFFF" stroke="#93C5FD" stroke-width="2"/>
        <path d="M5 8 L22 20 L39 8" fill="none" stroke="#60A5FA" stroke-width="1.8" stroke-linejoin="round"/>
        <circle cx="22" cy="18" r="3.5" fill="#FF7AB8"/>
      </g>
      <circle cx="136" cy="40" r="3" fill="#FF9EC7"/>
      <circle cx="48" cy="130" r="3" fill="#93C5FD"/>
      <circle cx="90" cy="84" r="2.5" fill="#FDE68A"/>
    `)}, linear-gradient(180deg, #F4F8FF 0%, #FFF2F7 100%)`,
    backgroundSize: '180px 180px, 100% 100%',
  },
  {
    id: 'pita-manis',
    name: 'pita manis',
    backgroundColor: '#FFF2F7',
    backgroundImage: `${svgPatternUrl(`
      <g transform="translate(26,26) rotate(-10 24 16)">
        <path d="M24 16 C12 4 4 12 10 20 C14 25 22 20 24 16 Z" fill="#FF9EC7" stroke="#FF5E99" stroke-width="1.6"/>
        <path d="M24 16 C36 4 44 12 38 20 C34 25 26 20 24 16 Z" fill="#FF9EC7" stroke="#FF5E99" stroke-width="1.6"/>
        <path d="M22 18 L15 32 M26 18 L33 32" stroke="#FF5E99" stroke-width="2.2" stroke-linecap="round"/>
        <circle cx="24" cy="16" r="4" fill="#FFFFFF" stroke="#FF5E99" stroke-width="1.6"/>
      </g>
      <g transform="translate(106,104) rotate(10 24 16)">
        <path d="M24 16 C14 6 6 13 11 19 C15 24 22 19 24 16 Z" fill="#BAE6FD" stroke="#60A5FA" stroke-width="1.6"/>
        <path d="M24 16 C34 6 42 13 37 19 C33 24 26 19 24 16 Z" fill="#BAE6FD" stroke="#60A5FA" stroke-width="1.6"/>
        <path d="M22 18 L16 30 M26 18 L32 30" stroke="#60A5FA" stroke-width="2" stroke-linecap="round"/>
        <circle cx="24" cy="16" r="3.5" fill="#FFFFFF" stroke="#60A5FA" stroke-width="1.5"/>
      </g>
      <circle cx="132" cy="40" r="3.5" fill="#FFFFFF" stroke="#FFC2DC" stroke-width="1.5"/>
      <circle cx="52" cy="134" r="3.5" fill="#FFFFFF" stroke="#BAE6FD" stroke-width="1.5"/>
      <circle cx="90" cy="84" r="2.5" fill="#FDE68A"/>
    `)}, linear-gradient(180deg, #FFF3F8 0%, #FFE6F0 100%)`,
    backgroundSize: '180px 180px, 100% 100%',
  },
] as const;

export const DEFAULT_WALLPAPER_ID = 'awan-pelangi';

export const DEFAULT_NOBAR_WALLPAPER_ID = 'bintang-malam';

export interface SavedWallpaperConfig {
  mode: 'preset' | 'custom';
  presetId: string;
  customUrl?: string;
}

const WALLPAPER_STORAGE_KEY = 'keiz_chat_wallpaper_v1';
export const NOBAR_WALLPAPER_STORAGE_KEY = 'keiz_nobar_wallpaper_v1';

export function loadSavedWallpaper(
  storageKey = WALLPAPER_STORAGE_KEY,
  defaultPresetId = DEFAULT_WALLPAPER_ID
): SavedWallpaperConfig {
  try {
    const raw = localStorage.getItem(storageKey);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<SavedWallpaperConfig>;
      if (parsed.mode === 'custom' && parsed.customUrl) {
        return {
          mode: 'custom',
          presetId: parsed.presetId || defaultPresetId,
          customUrl: parsed.customUrl,
        };
      }
      if (
        parsed.presetId &&
        CHAT_WALLPAPERS.some((w) => w.id === parsed.presetId)
      ) {
        return {
          mode: 'preset',
          presetId: parsed.presetId,
        };
      }
    }
  } catch {
    // ignore
  }
  return {
    mode: 'preset',
    presetId: defaultPresetId,
  };
}

export function saveWallpaperConfig(
  cfg: SavedWallpaperConfig,
  storageKey = WALLPAPER_STORAGE_KEY
): void {
  try {
    localStorage.setItem(storageKey, JSON.stringify(cfg));
  } catch {
    // ignore
  }
}

export function getWallpaperCss(cfg: SavedWallpaperConfig): React.CSSProperties {
  if (cfg.mode === 'custom' && cfg.customUrl) {
    return {
      backgroundColor: '#FFF2F7',
      backgroundImage: `linear-gradient(rgba(255, 255, 255, 0.12), rgba(255, 255, 255, 0.12)), url("${cfg.customUrl}")`,
      backgroundSize: 'cover',
      backgroundPosition: 'center',
      backgroundRepeat: 'no-repeat',
    };
  }
  const found =
    CHAT_WALLPAPERS.find((w) => w.id === cfg.presetId) || CHAT_WALLPAPERS[0];
  return {
    backgroundColor: found.backgroundColor,
    backgroundImage: found.backgroundImage,
    backgroundSize: found.backgroundSize,
    backgroundRepeat: 'repeat',
  };
}

async function compressFileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const maxDim = 1080;
        const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
        const w = Math.max(1, Math.round(img.width * scale));
        const h = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(String(reader.result || ''));
          return;
        }
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', 0.82));
      };
      img.onerror = () => reject(new Error('gagal baca foto'));
      img.src = String(reader.result || '');
    };
    reader.onerror = () => reject(new Error('gagal baca file'));
    reader.readAsDataURL(file);
  });
}

interface ChatWallpaperModalProps {
  currentUser: Role;
  config: SavedWallpaperConfig;
  title?: string;
  subtitle?: string;
  onSelect: (next: SavedWallpaperConfig) => void;
  onClose: () => void;
}

export const ChatWallpaperModal: React.FC<ChatWallpaperModalProps> = ({
  currentUser,
  config,
  title = 'wallpaper chat',
  subtitle = 'pilih tema lucu atau pakai foto sendiri',
  onSelect,
  onClose,
}) => {
  const [uploading, setUploading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleCustomPhotoPick = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    e.currentTarget.value = '';
    if (!file) return;
    if (file.size === 0) {
      setErrorMsg('izinin akses foto dulu di pengaturan HP ya');
      return;
    }

    soundFX.playClick();
    setErrorMsg(null);
    setUploading(true);

    try {
      const uploaded = await uploadImageToKeizStorage(
        file,
        file.name,
        currentUser,
        'wallpaper'
      );
      if (uploaded.publicUrl) {
        onSelect({
          mode: 'custom',
          presetId: config.presetId,
          customUrl: uploaded.publicUrl,
        });
        soundFX.playPop();
        onClose();
        return;
      }

      const fallbackUrl = await compressFileToDataUrl(file);
      if (fallbackUrl) {
        onSelect({
          mode: 'custom',
          presetId: config.presetId,
          customUrl: fallbackUrl,
        });
        soundFX.playPop();
        onClose();
        return;
      }

      setErrorMsg(uploaded.error || 'gagal pasang foto wallpaper');
    } catch {
      setErrorMsg('gagal pasang foto wallpaper, coba foto lain');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#2D0A1E]/45 p-4 backdrop-blur-sm"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="keiz-card animate-bubble-pop flex max-h-[82dvh] w-full max-w-[395px] flex-col overflow-hidden bg-white p-4 shadow-2xl"
      >
        <div className="flex shrink-0 items-center justify-between pb-3">
          <div>
            <h3 className="font-display text-base font-extrabold text-[#2D0A1E]">
              {title}
            </h3>
            <p className="text-[11px] font-bold text-[#8A6A7A]">
              {subtitle}
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              soundFX.playClick();
              onClose();
            }}
            aria-label="Tutup pilihan wallpaper"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#FFF2F7] text-[#8A6A7A] cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto pr-0.5">
          {/* Upload Foto Bebas Sendiri */}
          <label className="relative flex min-h-[48px] w-full cursor-pointer items-center justify-center gap-2 overflow-hidden rounded-2xl border-2 border-dashed border-[#FF9EC7] bg-[#FFF5F9] px-3 py-2.5 text-xs font-extrabold text-[#D81B6E]">
            <input
              type="file"
              accept="image/*"
              disabled={uploading}
              onChange={handleCustomPhotoPick}
              aria-label="Pilih foto wallpaper sendiri"
              className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
            />
            <ImagePlus className="h-4 w-4 shrink-0" />
            <span>
              {uploading ? 'lagi pasang foto...' : 'pakai foto sendiri'}
            </span>
          </label>

          {config.mode === 'custom' && config.customUrl && (
            <div className="flex items-center justify-between gap-2 rounded-2xl border border-[#FFD6E7] bg-[#FFF8FB] p-2">
              <div className="flex min-w-0 items-center gap-2">
                <img
                  src={config.customUrl}
                  alt="Wallpaper foto"
                  className="h-10 w-10 shrink-0 rounded-xl object-cover"
                />
                <span className="truncate text-[11px] font-extrabold text-[#2D0A1E]">
                  foto pilihan kamu lagi aktif
                </span>
              </div>
              <Check className="h-4 w-4 shrink-0 text-[#FF2E7E]" />
            </div>
          )}

          {errorMsg && (
            <p className="rounded-xl bg-rose-50 px-3 py-2 text-[11px] font-bold text-rose-600">
              {errorMsg}
            </p>
          )}

          {/* 10 Pilihan Wallpaper Lucu */}
          <div className="grid grid-cols-2 gap-2.5 pb-1">
            {CHAT_WALLPAPERS.map((wp) => {
              const active =
                config.mode === 'preset' && config.presetId === wp.id;
              return (
                <button
                  key={wp.id}
                  type="button"
                  onClick={() => {
                    soundFX.playPop();
                    onSelect({
                      mode: 'preset',
                      presetId: wp.id,
                      customUrl: config.customUrl,
                    });
                    onClose();
                  }}
                  className={`btn-bucin relative flex flex-col overflow-hidden rounded-2xl border-2 text-left cursor-pointer ${
                    active
                      ? 'border-[#FF2E7E] ring-2 ring-[#FF9EC7]/50'
                      : 'border-[#FFD6E7]'
                  }`}
                >
                  <div
                    className="relative h-24 w-full"
                    style={{
                      backgroundColor: wp.backgroundColor,
                      backgroundImage: wp.backgroundImage,
                      backgroundSize: wp.backgroundSize,
                      backgroundRepeat: 'repeat',
                    }}
                  >
                    {/* Mini sample chat bubbles inside preview */}
                    <div className="flex h-full flex-col justify-end gap-1 p-2">
                      <span className="w-12 rounded-lg rounded-bl-sm bg-[#FF4D8D] px-1.5 py-0.5 text-[8px] font-bold text-white shadow-sm">
                        haloo
                      </span>
                      <span className="ml-auto w-12 rounded-lg rounded-br-sm bg-[#3B82F6] px-1.5 py-0.5 text-right text-[8px] font-bold text-white shadow-sm">
                        haloo
                      </span>
                    </div>
                    {active && (
                      <span className="absolute right-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-[#FF2E7E] text-white shadow">
                        <Check className="h-3 w-3 stroke-[3]" />
                      </span>
                    )}
                  </div>
                  <div className="bg-white px-2.5 py-1.5">
                    <p className="truncate text-[11px] font-extrabold text-[#2D0A1E]">
                      {wp.name}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};
