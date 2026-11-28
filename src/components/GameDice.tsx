import React from 'react';

export function clampDiceValue(val: unknown): number {
  const n = Math.round(Number(val));
  if (!Number.isFinite(n) || n < 1) return 1;
  if (n > 6) return 6;
  return n;
}

export function rollFairDiceValue(): number {
  try {
    if (typeof window !== 'undefined' && window.crypto?.getRandomValues) {
      const buf = new Uint8Array(1);
      while (true) {
        window.crypto.getRandomValues(buf);
        if (buf[0] < 252) {
          return (buf[0] % 6) + 1;
        }
      }
    }
  } catch {
    // fallback below
  }
  return Math.floor(Math.random() * 6) + 1;
}

export function nextSpinDiceFace(prev: number): number {
  const candidate = rollFairDiceValue();
  return candidate === prev ? (candidate % 6) + 1 : candidate;
}

const DICE_PIP_COORDS: Record<number, ReadonlyArray<[number, number]>> = {
  1: [[50, 50]],
  2: [
    [30, 30],
    [70, 70],
  ],
  3: [
    [30, 30],
    [50, 50],
    [70, 70],
  ],
  4: [
    [30, 30],
    [70, 30],
    [30, 70],
    [70, 70],
  ],
  5: [
    [30, 30],
    [70, 30],
    [50, 50],
    [30, 70],
    [70, 70],
  ],
  6: [
    [30, 26],
    [70, 26],
    [30, 50],
    [70, 50],
    [30, 74],
    [70, 74],
  ],
};

interface DiceFaceSvgProps {
  value: number;
  muted?: boolean;
  sizeClass?: string;
}

export const DiceFaceSvg: React.FC<DiceFaceSvgProps> = ({
  value,
  muted = false,
  sizeClass = 'h-10 w-10',
}) => {
  const safeVal = clampDiceValue(value);
  const pips = DICE_PIP_COORDS[safeVal] || DICE_PIP_COORDS[1];
  const pipColor = muted ? '#94A3B8' : safeVal === 1 ? '#FF2E7E' : '#2D0A1E';

  return (
    <svg
      viewBox="0 0 100 100"
      className={`${sizeClass} drop-shadow-xs`}
      aria-hidden="true"
    >
      <rect
        x="6"
        y="6"
        width="88"
        height="88"
        rx="22"
        fill={muted ? '#F8FAFC' : '#FFFFFF'}
        stroke={muted ? '#CBD5E1' : '#FFD6E7'}
        strokeWidth="5"
      />
      {pips.map(([cx, cy], idx) => (
        <circle
          key={idx}
          cx={cx}
          cy={cy}
          r={safeVal === 1 ? 12 : 9.5}
          fill={pipColor}
        />
      ))}
    </svg>
  );
};
