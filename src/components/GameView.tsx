import React, { useCallback, useEffect, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import {
  DEFAULT_KEIZ_GAME,
  createGame,
  fetchGameState,
  joinGame,
  makeMove,
  resetGame,
  subscribeGameRealtime,
  updateScore,
} from '../supabaseClient';
import { soundFX } from '../sound';
import type { GameRoomStatus, KeizGameState, Role } from '../types';

interface GameJoystickSvgProps {
  size?: number;
  className?: string;
}

export const GameJoystickSvg: React.FC<GameJoystickSvgProps> = ({
  size = 128,
  className = '',
}) => (
  <svg
    viewBox="0 0 140 140"
    width={size}
    height={size}
    className={className}
    aria-hidden="true"
  >
    <defs>
      <linearGradient id="keizPadBody" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stopColor="#FFFFFF" />
        <stop offset="55%" stopColor="#FFEAF3" />
        <stop offset="100%" stopColor="#FFC7DF" />
      </linearGradient>
      <linearGradient id="keizPadPink" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stopColor="#FF7AB8" />
        <stop offset="100%" stopColor="#FF2E7E" />
      </linearGradient>
      <linearGradient id="keizPadBlue" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stopColor="#93C5FD" />
        <stop offset="100%" stopColor="#3B82F6" />
      </linearGradient>
    </defs>

    {/* Soft aura circle */}
    <circle cx="70" cy="74" r="56" fill="#FFD6E7" opacity="0.45" />

    {/* Cable curve */}
    <path
      d="M70 38 C70 23, 86 22, 86 14"
      fill="none"
      stroke="#FF85B8"
      strokeWidth="4.5"
      strokeLinecap="round"
    />

    {/* Cute mini floating heart */}
    <path
      d="M70 28 C67 23, 60 25, 62 31 C64 35, 70 37, 70 37 C70 37, 76 35, 78 31 C80 25, 73 23, 70 28 Z"
      fill="url(#keizPadPink)"
      stroke="#FFFFFF"
      strokeWidth="1.5"
    />

    {/* Gamepad body */}
    <path
      d="M42 48 H98 C113 48, 124 62, 125 84 C126 99, 117 109, 106 108 C97 107, 92 98, 86 94 H54 C48 98, 43 107, 34 108 C23 109, 14 99, 15 84 C16 62, 27 48, 42 48 Z"
      fill="url(#keizPadBody)"
      stroke="#FF8CC0"
      strokeWidth="3.5"
      strokeLinejoin="round"
    />

    {/* Inner pastel rim highlight */}
    <path
      d="M44 54 H96 C106 54, 114 63, 116 77"
      fill="none"
      stroke="#FFFFFF"
      strokeWidth="3"
      strokeLinecap="round"
      opacity="0.85"
    />

    {/* D-pad base */}
    <circle cx="44" cy="75" r="14" fill="#FFE0EE" />
    <path
      d="M41 65 H47 V72 H54 V78 H47 V85 H41 V78 H34 V72 H41 Z"
      fill="url(#keizPadPink)"
      stroke="#FFFFFF"
      strokeWidth="1.5"
      strokeLinejoin="round"
    />

    {/* Center select/start pills */}
    <rect x="61" y="72" width="7" height="4" rx="2" fill="#FFA8CE" />
    <rect x="72" y="72" width="7" height="4" rx="2" fill="#93C5FD" />

    {/* Action buttons (4 cute pastel circles) */}
    <circle cx="96" cy="65" r="5" fill="url(#keizPadBlue)" stroke="#FFFFFF" strokeWidth="1.5" />
    <circle cx="105" cy="74" r="5" fill="url(#keizPadPink)" stroke="#FFFFFF" strokeWidth="1.5" />
    <circle cx="87" cy="74" r="5" fill="#FDE68A" stroke="#FFFFFF" strokeWidth="1.5" />
    <circle cx="96" cy="83" r="5" fill="#A7F3D0" stroke="#FFFFFF" strokeWidth="1.5" />

    {/* Cute kawaii eyes & smile */}
    <circle cx="64" cy="61" r="2.2" fill="#4A0E32" />
    <circle cx="76" cy="61" r="2.2" fill="#4A0E32" />
    <path
      d="M66.5 64.5 Q70 68 73.5 64.5"
      fill="none"
      stroke="#FF2E7E"
      strokeWidth="2"
      strokeLinecap="round"
    />
  </svg>
);

interface GameViewProps {
  currentUser: Role;
  partnerInGame: boolean;
  onGameStateChange?: (state: KeizGameState) => void;
  onRoomMembersChange?: (members: Role[]) => void;
  onBack: () => void;
}

export function useKeizGameRoom(
  currentUser: Role,
  onGameStateChange?: (state: KeizGameState) => void,
  onRoomMembersChange?: (members: Role[]) => void
) {
  const [gameState, setGameState] = useState<KeizGameState>(DEFAULT_KEIZ_GAME);
  const [roomMembers, setRoomMembers] = useState<Role[]>([currentUser]);

  useEffect(() => {
    let active = true;

    void fetchGameState().then((initial) => {
      if (!active) return;
      setGameState(initial);
      onGameStateChange?.(initial);
    });

    void joinGame(currentUser).then((joined) => {
      if (!active) return;
      setGameState(joined);
      onGameStateChange?.(joined);
    });

    const unsub = subscribeGameRealtime(
      currentUser,
      (nextState) => {
        if (!active) return;
        setGameState(nextState);
        onGameStateChange?.(nextState);
      },
      (members) => {
        if (!active) return;
        setRoomMembers(members);
        onRoomMembersChange?.(members);
      }
    );

    return () => {
      active = false;
      unsub();
    };
  }, [currentUser, onGameStateChange, onRoomMembersChange]);

  const startRoomGame = useCallback(
    async (gameType: string) => {
      const next = await createGame(gameType, currentUser);
      setGameState(next);
      return next;
    },
    [currentUser]
  );

  const sendRoomMove = useCallback(
    async (
      board: Record<string, unknown> | unknown[],
      nextTurn?: Role,
      status?: GameRoomStatus
    ) => {
      const next = await makeMove({
        by: currentUser,
        board,
        nextTurn,
        status,
      });
      setGameState(next);
      return next;
    },
    [currentUser]
  );

  const resetRoomGame = useCallback(async () => {
    const next = await resetGame(currentUser);
    setGameState(next);
    return next;
  }, [currentUser]);

  const syncRoomScore = useCallback(
    async (score_faiz?: number, score_kenat?: number) => {
      const next = await updateScore({
        score_faiz,
        score_kenat,
        by: currentUser,
      });
      setGameState(next);
      return next;
    },
    [currentUser]
  );

  return {
    gameState,
    roomMembers,
    startRoomGame,
    sendRoomMove,
    resetRoomGame,
    syncRoomScore,
  };
}

export const GameView: React.FC<GameViewProps> = ({
  currentUser,
  partnerInGame,
  onGameStateChange,
  onRoomMembersChange,
  onBack,
}) => {
  const { roomMembers } = useKeizGameRoom(
    currentUser,
    onGameStateChange,
    onRoomMembersChange
  );

  const partnerRole: Role = currentUser === 'faiz' ? 'kenat' : 'faiz';
  const partnerOnlineInRoom =
    partnerInGame || roomMembers.includes(partnerRole);

  return (
    <div className="flex min-h-full w-full flex-col justify-start">
      <header className="flex h-[72px] shrink-0 items-center justify-between gap-2.5">
        <div className="flex min-w-0 items-center gap-2.5">
          <button
            type="button"
            onClick={() => {
              soundFX.playClick();
              onBack();
            }}
            aria-label="Kembali"
            className="btn-bucin flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[#FFD6E7] bg-white text-[#2D0A1E] cursor-pointer"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div className="min-w-0">
            <h1 className="font-display truncate text-[20px] font-extrabold leading-tight text-[#2D0A1E]">
              Game
            </h1>
            <p className="truncate text-[12px] font-bold text-[#8A6A7A]">
              refreshing kenat dan faiz
            </p>
          </div>
        </div>

        {partnerOnlineInRoom && (
          <div className="flex shrink-0 items-center gap-1.5 rounded-full border border-emerald-200 bg-white px-3 py-1.5 shadow-sm">
            <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-[11px] font-extrabold text-emerald-700">
              {partnerRole} lagi online
            </span>
          </div>
        )}
      </header>

      <main className="flex flex-1 flex-col justify-start pt-2 pb-4">
        <div className="keiz-sticker-card flex flex-1 flex-col items-center justify-center rounded-3xl bg-gradient-to-b from-[#FFF8FB] to-[#FFE9F1] px-6 py-12 text-center">
          <div className="animate-float-slow flex items-center justify-center">
            <GameJoystickSvg size={132} />
          </div>

          <h2 className="font-display mt-5 text-[28px] font-extrabold tracking-wide text-[#D81B6E]">
            COMING SOON
          </h2>

          <p className="mt-2 text-[13px] font-bold text-[#8A6A7A]">
            masi proses pembuatan oleh faiz
          </p>
        </div>
      </main>
    </div>
  );
};
