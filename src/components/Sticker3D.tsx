import React from 'react';

export const Sticker3D: React.FC<{
  kind:
    | 'key'
    | 'search'
    | 'chat'
    | 'nobar'
    | 'musik'
    | 'album'
    | 'unek'
    | 'call';
  className?: string;
}> = ({ kind, className = 'h-10 w-10' }) => {
  switch (kind) {
    case 'call':
      return (
        <svg viewBox="0 0 64 64" className={`${className} drop-shadow-[0_4px_8px_rgba(255,46,126,0.3)]`}>
          <defs>
            <linearGradient id="callPhoneGrad" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#FF7AB8" />
              <stop offset="100%" stopColor="#FF2E7E" />
            </linearGradient>
          </defs>
          <rect x="10" y="10" width="44" height="44" rx="14" fill="url(#callPhoneGrad)" stroke="#FFFFFF" strokeWidth="2.5" />
          <path
            d="M23 20 C21.5 20 20 21.5 20 23.5 C20 33.5 30.5 44 40.5 44 C42.5 44 44 42.5 44 41 L44 36.5 C44 35.3 43.2 34.4 42 34.1 L37.5 33.1 C36.5 32.9 35.4 33.3 34.8 34.1 L33.4 35.8 C30.8 34.4 29.6 33.2 28.2 30.6 L29.9 29.2 C30.7 28.6 31.1 27.5 30.9 26.5 L29.9 22 C29.6 20.8 28.7 20 27.5 20 Z"
            fill="#FFFFFF"
          />
          <circle cx="46" cy="19" r="5" fill="#3B82F6" stroke="#FFFFFF" strokeWidth="2" />
        </svg>
      );
    case 'key':
      return (
        <svg viewBox="0 0 64 64" className={`${className} drop-shadow-[0_4px_6px_rgba(183,121,31,0.3)]`}>
          <defs>
            <linearGradient id="goldKey" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#FFF7CC" />
              <stop offset="45%" stopColor="#FBBF24" />
              <stop offset="100%" stopColor="#B45309" />
            </linearGradient>
          </defs>
          <path
            d="M24 14 C16 14 10 20 10 28 C10 38 24 46 24 46 C24 46 38 38 38 28 C38 20 32 14 24 14 Z"
            fill="url(#goldKey)"
            stroke="#FFFBEB"
            strokeWidth="2"
          />
          <circle cx="24" cy="28" r="5" fill="#FFF7E6" />
          <rect x="35" y="25" width="20" height="6" rx="3" fill="url(#goldKey)" />
          <rect x="46" y="31" width="4" height="7" rx="1.5" fill="url(#goldKey)" />
          <rect x="52" y="31" width="4" height="5" rx="1.5" fill="url(#goldKey)" />
          <ellipse cx="19" cy="21" rx="4" ry="2" transform="rotate(-25 19 21)" fill="rgba(255,255,255,0.85)" />
        </svg>
      );
    case 'search':
      return (
        <svg viewBox="0 0 64 64" className={`${className} drop-shadow-[0_4px_8px_rgba(255,46,126,0.3)]`}>
          <defs>
            <radialGradient id="glassPink" cx="35%" cy="30%" r="70%">
              <stop offset="0%" stopColor="#FFFFFF" />
              <stop offset="40%" stopColor="#FFB6D5" />
              <stop offset="100%" stopColor="#FF2E7E" />
            </radialGradient>
          </defs>
          <line x1="39" y1="39" x2="54" y2="54" stroke="#E91E7A" strokeWidth="7" strokeLinecap="round" />
          <circle cx="27" cy="27" r="17" fill="url(#glassPink)" stroke="#FFFFFF" strokeWidth="3" />
          <path d="M27 35 C27 35 18 29 18 23.5 C18 20.5 20.5 18.5 23 18.5 C24.8 18.5 26.2 19.6 27 20.8 C27.8 19.6 29.2 18.5 31 18.5 C33.5 18.5 36 20.5 36 23.5 C36 29 27 35 27 35 Z" fill="#FFFFFF" />
          <ellipse cx="20" cy="18" rx="4" ry="2" transform="rotate(-30 20 18)" fill="rgba(255,255,255,0.9)" />
        </svg>
      );
    case 'chat':
      return (
        <svg viewBox="0 0 64 64" className={`${className} drop-shadow-[0_4px_8px_rgba(59,130,246,0.28)]`}>
          <defs>
            <linearGradient id="bubblePink" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#FFFFFF" />
              <stop offset="100%" stopColor="#FFC9DD" />
            </linearGradient>
          </defs>
          <path d="M10 28 C10 18 19 12 32 12 C45 12 54 18 54 28 C54 38 45 44 32 44 C27 44 22 43 18 41 L10 48 L13 38 C11 35 10 31.5 10 28 Z" fill="url(#bubblePink)" stroke="#FF7AB8" strokeWidth="2.5" />
          <path d="M32 35 C32 35 24 29.5 24 24.5 C24 21.8 26 20 28.4 20 C29.9 20 31.2 20.9 32 22.1 C32.8 20.9 34.1 20 35.6 20 C38 20 40 21.8 40 24.5 C40 29.5 32 35 32 35 Z" fill="#FF2E7E" />
          <circle cx="48" cy="18" r="7" fill="#3B82F6" stroke="#FFFFFF" strokeWidth="2" />
        </svg>
      );
    case 'nobar':
      return (
        <svg viewBox="0 0 64 64" className={`${className} drop-shadow-[0_4px_8px_rgba(180,83,9,0.28)]`}>
          <rect x="10" y="14" width="44" height="36" rx="9" fill="#2D0A1E" stroke="#FDE68A" strokeWidth="2.5" />
          <polygon points="27,23 27,41 43,32" fill="#FF2E7E" stroke="#FFFFFF" strokeWidth="1.5" strokeLinejoin="round" />
          <circle cx="17" cy="21" r="2.2" fill="#FDE68A" />
          <circle cx="17" cy="32" r="2.2" fill="#FDE68A" />
          <circle cx="17" cy="43" r="2.2" fill="#FDE68A" />
          <circle cx="47" cy="21" r="2.2" fill="#FDE68A" />
          <circle cx="47" cy="32" r="2.2" fill="#FDE68A" />
          <circle cx="47" cy="43" r="2.2" fill="#FDE68A" />
        </svg>
      );
    case 'musik':
      return (
        <svg viewBox="0 0 64 64" className={`${className} drop-shadow-[0_4px_8px_rgba(139,92,246,0.3)]`}>
          <defs>
            <linearGradient id="cassetteGrad" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#DDD6FE" />
              <stop offset="100%" stopColor="#A78BFA" />
            </linearGradient>
          </defs>
          <rect x="8" y="16" width="48" height="32" rx="8" fill="url(#cassetteGrad)" stroke="#FFFFFF" strokeWidth="2" />
          <rect x="14" y="21" width="36" height="12" rx="4" fill="#FFF2F7" />
          <circle cx="23" cy="27" r="4" fill="#FF2E7E" />
          <circle cx="41" cy="27" r="4" fill="#3B82F6" />
          <path d="M18 48 L22 40 L42 40 L46 48 Z" fill="#7C3AED" />
        </svg>
      );
    case 'album':
      return (
        <svg viewBox="0 0 64 64" className={`${className} drop-shadow-[0_4px_8px_rgba(255,46,126,0.28)]`}>
          <rect x="10" y="10" width="44" height="44" rx="9" fill="#FFFFFF" stroke="#FFD6E7" strokeWidth="2" />
          <rect x="15" y="15" width="34" height="26" rx="5" fill="#FF9EC7" />
          <circle cx="24" cy="24" r="4" fill="#FEF3C7" />
          <path d="M15 37 L25 27 L34 35 L40 30 L49 38 L49 41 L15 41 Z" fill="#FF2E7E" />
        </svg>
      );
    case 'unek':
      return (
        <svg viewBox="0 0 64 64" className={`${className} drop-shadow-[0_4px_8px_rgba(255,46,126,0.3)]`}>
          <defs>
            <linearGradient id="unekBubble" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#FF7AB8" />
              <stop offset="100%" stopColor="#FF2E7E" />
            </linearGradient>
          </defs>
          <path d="M12 28 C12 17 21 11 32 11 C43 11 52 17 52 28 C52 39 43 45 32 45 C28 45 24 44 20 42 L11 49 L14 39 C12.7 36 12 32.2 12 28 Z" fill="url(#unekBubble)" stroke="#FFFFFF" strokeWidth="2" />
          <path d="M32 35 C32 35 23 29 23 24 C23 21.3 25.2 19.5 27.6 19.5 C29.3 19.5 30.8 20.5 32 22 C33.2 20.5 34.7 19.5 36.4 19.5 C38.8 19.5 41 21.3 41 24 C41 29 32 35 32 35 Z" fill="#FFFFFF" />
        </svg>
      );
  }
};
