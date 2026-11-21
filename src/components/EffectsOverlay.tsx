import React, { useEffect, useMemo, useState } from 'react';
import type { BurstParticle } from '../types';

interface FloatingHeart {
  id: number;
  left: string;
  size: number;
  duration: number;
  delay: number;
  color: string;
  opacity: number;
}

export const FloatingHeartsBg: React.FC = () => {
  const hearts = useMemo<FloatingHeart[]>(() => {
    return Array.from({ length: 18 }, (_, i) => ({
      id: i,
      left: `${(i * 5.4 + (i % 3) * 2.1) % 96}%`,
      size: 10 + (i % 4) * 4,
      duration: 9 + (i % 5) * 2.5,
      delay: -(i * 1.2),
      color: i % 2 === 0 ? '#3B82F6' : '#FF4D8D',
      opacity: 0.2 + (i % 3) * 0.08,
    }));
  }, []);

  return (
    <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden" aria-hidden="true">
      {hearts.map((h) => (
        <div
          key={h.id}
          className="animate-float-up absolute bottom-0"
          style={{
            left: h.left,
            animationDuration: `${h.duration}s`,
            animationDelay: `${h.delay}s`,
            opacity: h.opacity,
          }}
        >
          <svg
            width={h.size}
            height={h.size}
            viewBox="0 0 24 24"
            fill={h.color}
            className="drop-shadow-sm"
          >
            <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
          </svg>
        </div>
      ))}
    </div>
  );
};

interface SplashLoaderProps {
  onDone: () => void;
}

export const SplashLoader: React.FC<SplashLoaderProps> = ({ onDone }) => {
  const [progress, setProgress] = useState(0);
  const [exploding, setExploding] = useState(false);
  const [fading, setFading] = useState(false);

  const splashParticles = useMemo(() => {
    return Array.from({ length: 24 }, (_, i) => {
      const angle = (i / 24) * Math.PI * 2;
      const dist = 95 + (i % 3) * 50;
      return {
        id: i,
        tx: Math.cos(angle) * dist,
        ty: Math.sin(angle) * dist,
        color: i % 2 === 0 ? '#3B82F6' : '#FF4D8D',
        size: 14 + (i % 3) * 6,
      };
    });
  }, []);

  useEffect(() => {
    const start = performance.now();
    const duration = 2000;
    let rafId = 0;

    const tick = (now: number) => {
      const elapsed = now - start;
      const pct = Math.min(100, Math.round((elapsed / duration) * 100));
      setProgress(pct);
      if (elapsed < duration) {
        rafId = requestAnimationFrame(tick);
      } else {
        setExploding(true);
        setTimeout(() => setFading(true), 320);
        setTimeout(() => onDone(), 620);
      }
    };

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [onDone]);

  return (
    <div
      onClick={onDone}
      className={`fixed inset-0 z-50 flex flex-col items-center justify-center bg-[#FFE3EE] px-6 transition-opacity duration-300 ${
        fading ? 'opacity-0 pointer-events-none' : 'opacity-100'
      }`}
    >
      {/* 3D Glossy Twin Pink Hearts with Satin Ribbon, Pearls & 4-point Sparkles */}
      <div className="relative flex items-center justify-center">
        {exploding &&
          splashParticles.map((p) => (
            <div
              key={`boom-${p.id}`}
              className="pointer-events-none absolute transition-all duration-500 ease-out"
              style={{
                transform: `translate(${p.tx}px, ${p.ty}px) scale(1.15) rotate(${p.id * 25}deg)`,
                opacity: fading ? 0 : 0.95,
              }}
            >
              <svg width={p.size} height={p.size} viewBox="0 0 24 24" fill={p.color}>
                <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
              </svg>
            </div>
          ))}

        <div
          className={`animate-float-slow relative flex h-44 w-48 items-center justify-center transition-transform duration-300 ${
            exploding ? 'scale-125 opacity-0' : 'scale-100'
          }`}
        >
          <svg
            viewBox="0 0 220 200"
            className="h-full w-full overflow-visible drop-shadow-[0_18px_28px_rgba(233,30,122,0.28)]"
          >
            <defs>
              <radialGradient id="heartBackGrad" cx="35%" cy="30%" r="70%">
                <stop offset="0%" stopColor="#FFF5FA" />
                <stop offset="45%" stopColor="#FF9EC7" />
                <stop offset="100%" stopColor="#E91E7A" />
              </radialGradient>
              <radialGradient id="heartFrontGrad" cx="32%" cy="28%" r="72%">
                <stop offset="0%" stopColor="#FFFFFF" />
                <stop offset="28%" stopColor="#FFC2DC" />
                <stop offset="68%" stopColor="#FF4D97" />
                <stop offset="100%" stopColor="#C2185B" />
              </radialGradient>
              <linearGradient id="ribbonGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#FFE5F0" />
                <stop offset="50%" stopColor="#FF6AA8" />
                <stop offset="100%" stopColor="#D81B6E" />
              </linearGradient>
              <radialGradient id="pearlGrad" cx="35%" cy="30%" r="70%">
                <stop offset="0%" stopColor="#FFFFFF" />
                <stop offset="70%" stopColor="#FCE7F3" />
                <stop offset="100%" stopColor="#F9A8D4" />
              </radialGradient>
            </defs>

            {/* Back overlapping glossy heart */}
            <g transform="translate(88, 36) rotate(12) scale(0.86)">
              <path
                d="M60 108 C60 108 10 74 10 38 C10 18 26 6 42 6 C52 6 58 13 60 19 C62 13 68 6 78 6 C94 6 110 18 110 38 C110 74 60 108 60 108 Z"
                fill="url(#heartBackGrad)"
              />
              <ellipse cx="36" cy="28" rx="11" ry="6" transform="rotate(-25 36 28)" fill="rgba(255,255,255,0.65)" />
            </g>

            {/* Larger front chrome/glass pink heart */}
            <g transform="translate(26, 28) rotate(-8)">
              <path
                d="M72 130 C72 130 12 88 12 46 C12 22 30 8 50 8 C62 8 69 16 72 24 C75 16 82 8 94 8 C114 8 132 22 132 46 C132 88 72 130 72 130 Z"
                fill="url(#heartFrontGrad)"
              />
              {/* Glass specular shine */}
              <ellipse cx="42" cy="34" rx="15" ry="8" transform="rotate(-28 42 34)" fill="rgba(255,255,255,0.8)" />
              <circle cx="58" cy="24" r="4" fill="rgba(255,255,255,0.75)" />
            </g>

            {/* Shiny Satin Pink Ribbon wrapping around */}
            <path
              d="M22 128 C58 150, 152 142, 186 96 C202 74, 178 46, 150 56"
              fill="none"
              stroke="url(#ribbonGrad)"
              strokeWidth="9"
              strokeLinecap="round"
            />
            <path
              d="M36 62 C18 82, 34 114, 78 126 C122 138, 176 120, 194 148"
              fill="none"
              stroke="url(#ribbonGrad)"
              strokeWidth="7"
              strokeLinecap="round"
              opacity="0.92"
            />

            {/* White Pearls */}
            <circle cx="34" cy="126" r="6" fill="url(#pearlGrad)" />
            <circle cx="52" cy="144" r="5" fill="url(#pearlGrad)" />
            <circle cx="158" cy="134" r="6.5" fill="url(#pearlGrad)" />
            <circle cx="176" cy="118" r="4.5" fill="url(#pearlGrad)" />
            <circle cx="102" cy="30" r="4" fill="url(#pearlGrad)" />

            {/* 4-point Sparkle Stars */}
            <path
              d="M24 38 L27 46 L35 49 L27 52 L24 60 L21 52 L13 49 L21 46 Z"
              fill="#FFFFFF"
            />
            <path
              d="M190 42 L192 48 L198 50 L192 52 L190 58 L188 52 L182 50 L188 48 Z"
              fill="#FFFFFF"
            />
            <path
              d="M186 148 L188 153 L193 155 L188 157 L186 162 L184 157 L179 155 L184 153 Z"
              fill="#FF4D97"
              opacity="0.7"
            />
          </svg>

          {/* Traveling Shimmer across ribbon */}
          <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-full">
            <div className="animate-shimmer h-full w-10 bg-gradient-to-r from-transparent via-white/70 to-transparent" />
          </div>
        </div>
      </div>

      {/* Title 24px below illustration */}
      <h1 className="mt-6 text-center text-[32px] font-extrabold tracking-[2px] text-[#E91E7A]">
        KEIZ BUCIN
      </h1>
      <p className="mt-0.5 text-center text-[14px] font-bold text-[#8A6A7A]">V6</p>
      <p className="mt-1 text-center text-[13px] font-medium text-[#8A6A7A]">
        Selalu ada ruang untuk kita.
      </p>

      {/* Progress Bar 40px below */}
      <div className="mt-10 w-[80%] max-w-[300px]">
        <p className="mb-2 text-center text-[22px] font-extrabold tabular-nums text-[#D81B6E]">
          {progress}%
        </p>
        <div className="relative h-[6px] w-full rounded-full bg-[#FFC9DD]">
          <div
            className="relative h-full rounded-full bg-gradient-to-r from-[#FF2E7E] to-[#FF7AB8] transition-[width] duration-75"
            style={{ width: `${progress}%` }}
          >
            <svg
              viewBox="0 0 24 24"
              fill="#E91E7A"
              className="absolute -right-2 -top-[4px] h-[14px] w-[14px] drop-shadow"
            >
              <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
            </svg>
          </div>
        </div>
      </div>
    </div>
  );
};

interface BurstLayerProps {
  particles: BurstParticle[];
}

export const BurstLayer: React.FC<BurstLayerProps> = ({ particles }) => {
  if (particles.length === 0) return null;
  return (
    <div className="pointer-events-none fixed inset-0 z-50 overflow-hidden" aria-hidden="true">
      {particles.map((p) => (
        <span
          key={p.id}
          className="absolute select-none transition-none"
          style={{
            left: p.x,
            top: p.y,
            fontSize: `${p.size}px`,
            transform: `translate(-50%, -50%) rotate(${p.rotation}deg)`,
            color: p.color,
          }}
        >
          {p.emoji}
        </span>
      ))}
    </div>
  );
};

export const PelukOverlay: React.FC<{ active: boolean; senderName: string }> = ({
  active,
  senderName,
}) => {
  const drops = useMemo(
    () =>
      Array.from({ length: 30 }, (_, i) => ({
        id: i,
        left: `${(i * 3.4) % 98}%`,
        delay: `${(i % 7) * 0.14}s`,
        duration: `${1.8 + (i % 4) * 0.35}s`,
        emoji: i % 3 === 0 ? '💙' : i % 3 === 1 ? '💖' : '🫂',
        size: 20 + (i % 3) * 8,
      })),
    []
  );

  if (!active) return null;

  return (
    <div className="pointer-events-none fixed inset-0 z-50 flex flex-col items-center justify-center overflow-hidden bg-[#2D0A1E]/40 backdrop-blur-[3px]">
      {drops.map((d) => (
        <span
          key={d.id}
          className="animate-rain-fall absolute -top-10 select-none"
          style={{
            left: d.left,
            animationDelay: d.delay,
            animationDuration: d.duration,
            fontSize: `${d.size}px`,
          }}
        >
          {d.emoji}
        </span>
      ))}

      <div className="animate-bear-hug relative z-10 flex max-w-[330px] flex-col items-center rounded-[24px] border border-[#FFD6E7] bg-white px-7 py-6 text-center shadow-2xl">
        <div className="flex items-center gap-1 text-7xl leading-none">
          <span>🧸</span>
          <span>🫂</span>
        </div>
        <p className="mt-4 text-xl font-extrabold text-[#E91E7A]">
          PELUUUK ERATTT!!
        </p>
        <p className="mt-1.5 text-sm text-[#6E5460]">
          kiriman peluk paling anget dr {senderName}, awas sesek ya honeyy 💙💖
        </p>
      </div>
    </div>
  );
};

export const KangenOverlay: React.FC<{ active: boolean; senderName: string }> = ({
  active,
  senderName,
}) => {
  const cryingDrops = useMemo(
    () =>
      Array.from({ length: 32 }, (_, i) => ({
        id: i,
        left: `${(i * 3.2) % 98}%`,
        delay: `${(i % 6) * 0.13}s`,
        duration: `${1.7 + (i % 4) * 0.4}s`,
        emoji: i % 3 === 0 ? '😭' : i % 3 === 1 ? '💖' : '💙',
        size: 22 + (i % 3) * 8,
      })),
    []
  );

  if (!active) return null;

  return (
    <div className="pointer-events-none fixed inset-0 z-50 flex flex-col items-center justify-center overflow-hidden bg-[#FF4D8D]/45 backdrop-blur-[3px] transition-colors">
      {cryingDrops.map((d) => (
        <span
          key={d.id}
          className="animate-rain-fall absolute -top-10 select-none"
          style={{
            left: d.left,
            animationDelay: d.delay,
            animationDuration: d.duration,
            fontSize: `${d.size}px`,
          }}
        >
          {d.emoji}
        </span>
      ))}

      <div className="animate-kangen-wobble relative z-10 px-6 text-center">
        <p className="text-4xl font-extrabold tracking-tight text-white drop-shadow-[0_4px_18px_rgba(216,27,110,0.6)]">
          KANGEN BANGET 😭
        </p>
        <p className="mt-2.5 inline-block rounded-2xl bg-white/95 px-4 py-2 text-sm font-bold text-[#D81B6E] shadow-lg">
          {senderName} lagi kangen parah nihh, cepetan ketemu pliss 🥺💖
        </p>
      </div>
    </div>
  );
};
