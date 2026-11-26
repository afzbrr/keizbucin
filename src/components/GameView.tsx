import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import EmojiPicker, {
  EmojiStyle,
  Theme,
  type EmojiClickData,
} from 'emoji-picker-react';
import {
  ArrowLeft,
  Bot,
  Check,
  Copy,
  LogOut,
  RotateCcw,
  Send,
  Smile,
  X,
} from 'lucide-react';
import {
  DEFAULT_KEIZ_GAME,
  createGame,
  fetchGameState,
  getSupabaseClient,
  joinGame,
  makeMove,
  resetGame,
  subscribeGameRealtime as subscribeKeizRoomRealtime,
  updateScore,
} from '../supabaseClient';
import { soundFX } from '../sound';
import { AppleEmoji, AppleTextWithEmojis, QUICK_REACT_EMOJIS } from './AppleEmoji';
import {
  getReactionEntries,
  getUserReaction,
  ReactionDetailsModal,
  ReactionPill,
  toggleUserReaction,
} from './ChatReactions';
import type {
  ChatMessage,
  CoupleProfile,
  GameRoomStatus,
  KeizGameState,
  Role,
} from '../types';

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
  profile?: CoupleProfile;
  onGameStateChange?: (state: KeizGameState) => void;
  onRoomMembersChange?: (members: Role[]) => void;
  onHeartBurstAt?: (x: number, y: number) => void;
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

    const unsub = subscribeKeizRoomRealtime(
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

// ---------- ULAR TANGGA CONSTANTS & TYPES ----------
type PlayerSlot = 'player1' | 'player2';

interface BoardSnakeLadderItem {
  from_pos: number;
  to_pos: number;
  type: 'ladder' | 'snake';
}

const DEFAULT_BOARD_SNAKES_LADDERS: BoardSnakeLadderItem[] = [
  // Tangga (exact required coordinates)
  { from_pos: 2, to_pos: 38, type: 'ladder' },
  { from_pos: 4, to_pos: 14, type: 'ladder' },
  { from_pos: 9, to_pos: 31, type: 'ladder' },
  { from_pos: 21, to_pos: 42, type: 'ladder' },
  { from_pos: 28, to_pos: 84, type: 'ladder' },
  { from_pos: 36, to_pos: 44, type: 'ladder' },
  { from_pos: 51, to_pos: 67, type: 'ladder' },
  { from_pos: 71, to_pos: 91, type: 'ladder' },
  // Ular (exact required coordinates)
  { from_pos: 16, to_pos: 6, type: 'snake' },
  { from_pos: 47, to_pos: 26, type: 'snake' },
  { from_pos: 49, to_pos: 11, type: 'snake' },
  { from_pos: 56, to_pos: 53, type: 'snake' },
  { from_pos: 62, to_pos: 19, type: 'snake' },
  { from_pos: 64, to_pos: 60, type: 'snake' },
  { from_pos: 87, to_pos: 24, type: 'snake' },
  { from_pos: 93, to_pos: 73, type: 'snake' },
  { from_pos: 95, to_pos: 75, type: 'snake' },
  { from_pos: 98, to_pos: 78, type: 'snake' },
];

interface UlarTanggaRoom {
  id: string;
  room_code: string;
  status: 'waiting' | 'playing' | 'finished';
  current_turn: PlayerSlot;
  winner: string | null;
}

interface UlarTanggaPlayer {
  id?: string;
  room_id: string;
  player_slot: PlayerSlot;
  name: string;
  avatar_emoji: string;
  position: number;
  is_ready: boolean;
}

interface UlarTanggaMove {
  id?: string;
  room_id: string;
  player_slot: PlayerSlot;
  dice_value: number;
  from_position: number;
  to_position: number;
  event_type: string;
  created_at?: string;
}

interface UlarTanggaRawChatRow {
  id: string;
  room_id: string;
  player_slot: string;
  sender_name: string;
  sender_emoji: string;
  message: string;
  created_at: string;
}

interface ParsedGameChat {
  id: string;
  player_slot: string;
  senderRole: Role;
  senderName: string;
  senderEmoji: string;
  text: string;
  replyToId?: string;
  replyToSender?: Role;
  replyToText?: string;
  react?: string;
  created_at: string;
}

interface SavedActiveRoom {
  roomId: string;
  roomCode: string;
  playerSlot: PlayerSlot;
  playerName: string;
}

const UT_ROOM_STORAGE_KEY = 'keiz_ular_tangga_active_room_v1';
const UT_REACT_MARKER = '__KEIZ_REACT__';
const UT_DELETED_MARKER = '__KEIZ_DELETED__';
const UT_REPLY_PREFIX = '__KEIZ_REPLY__';
const UT_DICE_FACES = ['⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];

function generateRoomCode(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let suffix = '';
  for (let i = 0; i < 4; i++) {
    suffix += chars[Math.floor(Math.random() * chars.length)];
  }
  return `KEIZ-${suffix}`;
}

function getSquareCoords(pos: number): { row: number; col: number; cx: number; cy: number } {
  const clamped = Math.max(1, Math.min(100, pos));
  const bottomRow = Math.floor((clamped - 1) / 10);
  const offset = (clamped - 1) % 10;
  const col = bottomRow % 2 === 0 ? offset : 9 - offset;
  const row = 9 - bottomRow;
  return {
    row,
    col,
    cx: col * 10 + 5,
    cy: row * 10 + 5,
  };
}

function buildZigZagCells(): number[] {
  const cells: number[] = [];
  for (let row = 0; row < 10; row++) {
    const bottomRow = 9 - row;
    const base = bottomRow * 10;
    for (let col = 0; col < 10; col++) {
      const num = bottomRow % 2 === 0 ? base + col + 1 : base + (10 - col);
      cells.push(num);
    }
  }
  return cells;
}

function loadSavedActiveRoom(): SavedActiveRoom | null {
  try {
    const raw = localStorage.getItem(UT_ROOM_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<SavedActiveRoom>;
    if (parsed.roomId && parsed.roomCode && parsed.playerSlot) {
      return {
        roomId: String(parsed.roomId),
        roomCode: String(parsed.roomCode),
        playerSlot: parsed.playerSlot === 'player2' ? 'player2' : 'player1',
        playerName: String(parsed.playerName || ''),
      };
    }
  } catch {
    // ignore
  }
  return null;
}

function saveActiveRoomToStorage(room: SavedActiveRoom | null): void {
  try {
    if (!room) {
      localStorage.removeItem(UT_ROOM_STORAGE_KEY);
    } else {
      localStorage.setItem(UT_ROOM_STORAGE_KEY, JSON.stringify(room));
    }
  } catch {
    // ignore
  }
}

function encodeChatMessagePayload(
  text: string,
  replyTo?: ParsedGameChat | null
): string {
  if (!replyTo) return text;
  return (
    UT_REPLY_PREFIX +
    JSON.stringify({
      rId: replyTo.id,
      rSender: replyTo.senderRole,
      rText: replyTo.text,
      text,
    })
  );
}

function inferSenderRole(
  row: { player_slot: string; sender_name: string; sender_emoji: string },
  currentUser: Role,
  mySlot: PlayerSlot | null
): Role {
  if (row.sender_emoji === 'faiz' || row.sender_emoji === '🐻') return 'faiz';
  if (row.sender_emoji === 'kenat' || row.sender_emoji === '🐰') return 'kenat';
  if (row.player_slot === 'faiz') return 'faiz';
  if (row.player_slot === 'kenat') return 'kenat';
  if (mySlot) {
    return row.player_slot === mySlot
      ? currentUser
      : currentUser === 'faiz'
      ? 'kenat'
      : 'faiz';
  }
  const lowerName = row.sender_name.toLowerCase();
  if (lowerName.includes('kenat')) return 'kenat';
  if (lowerName.includes('faiz')) return 'faiz';
  return currentUser;
}

function foldRawChatRows(
  rows: UlarTanggaRawChatRow[],
  currentUser: Role,
  mySlot: PlayerSlot | null
): ParsedGameChat[] {
  const reactStateByMsgId: Record<string, Partial<Record<Role, string>>> = {};
  const deletedIds = new Set<string>();
  const messages: ParsedGameChat[] = [];

  for (const row of rows) {
    if (row.sender_name === UT_REACT_MARKER) {
      try {
        const targetId = row.sender_emoji;
        const payload = JSON.parse(row.message) as {
          role?: Role;
          emoji?: string | null;
        };
        if (targetId && (payload.role === 'faiz' || payload.role === 'kenat')) {
          if (!reactStateByMsgId[targetId]) reactStateByMsgId[targetId] = {};
          if (payload.emoji) {
            reactStateByMsgId[targetId][payload.role] = payload.emoji;
          } else {
            delete reactStateByMsgId[targetId][payload.role];
          }
        }
      } catch {
        // ignore malformed react event
      }
      continue;
    }

    if (row.message === UT_DELETED_MARKER) {
      deletedIds.add(row.id);
      continue;
    }

    let text = row.message || '';
    let replyToId: string | undefined;
    let replyToSender: Role | undefined;
    let replyToText: string | undefined;

    if (text.startsWith(UT_REPLY_PREFIX)) {
      try {
        const parsed = JSON.parse(text.slice(UT_REPLY_PREFIX.length)) as {
          rId?: string;
          rSender?: Role;
          rText?: string;
          text?: string;
        };
        text = String(parsed.text ?? '');
        replyToId = parsed.rId;
        replyToSender = parsed.rSender;
        replyToText = parsed.rText;
      } catch {
        // fallback to raw text
      }
    }

    messages.push({
      id: row.id,
      player_slot: row.player_slot,
      senderRole: inferSenderRole(row, currentUser, mySlot),
      senderName: row.sender_name,
      senderEmoji: row.sender_emoji,
      text,
      replyToId,
      replyToSender,
      replyToText,
      created_at: row.created_at,
    });
  }

  return messages
    .filter((m) => !deletedIds.has(m.id))
    .map((m) => {
      const rMap = reactStateByMsgId[m.id];
      if (!rMap || (!rMap.faiz && !rMap.kenat)) return m;
      return { ...m, react: JSON.stringify(rMap) };
    });
}

const DEFAULT_FALLBACK_PROFILE: CoupleProfile = {
  faizName: 'faiz',
  kenatName: 'kenat',
  faizPhoto: '',
  kenatPhoto: '',
  faizBanner: '',
  kenatBanner: '',
  faizBio: '',
  kenatBio: '',
  anniversaryDate: '2026-08-28',
  faizSong: '',
  kenatSong: '',
};

const CONFETTI_PIECES = [
  { left: '8%', delay: '0s', duration: '2.4s', color: '#FF2E7E' },
  { left: '18%', delay: '0.3s', duration: '2.9s', color: '#3B82F6' },
  { left: '28%', delay: '0.1s', duration: '2.2s', color: '#FBBF24' },
  { left: '38%', delay: '0.5s', duration: '2.7s', color: '#10B981' },
  { left: '48%', delay: '0.2s', duration: '2.5s', color: '#FF7AB8' },
  { left: '58%', delay: '0.6s', duration: '2.3s', color: '#8B5CF6' },
  { left: '68%', delay: '0.15s', duration: '2.8s', color: '#F43F5E' },
  { left: '78%', delay: '0.4s', duration: '2.4s', color: '#38BDF8' },
  { left: '88%', delay: '0.25s', duration: '2.6s', color: '#F59E0B' },
];

const ZIGZAG_CELLS = buildZigZagCells();

const MINI_COVER_CELLS = Array.from({ length: 25 }, (_, i) => {
  const row = Math.floor(i / 5);
  const col = i % 5;
  const bottomRow = 4 - row;
  return bottomRow % 2 === 0 ? bottomRow * 5 + col + 1 : bottomRow * 5 + (5 - col);
});

const BoardStaticLayer = React.memo<{ snakesLadders: BoardSnakeLadderItem[] }>(
  ({ snakesLadders }) => (
    <>
      {/* 10x10 Zig-Zag Grid */}
      <div className="grid h-full w-full grid-cols-10 grid-rows-10">
        {ZIGZAG_CELLS.map((cellNum, idx) => {
          const row = Math.floor(idx / 10);
          const col = idx % 10;
          const isPink = (row + col) % 2 === 1;
          const isGoal = cellNum === 100;
          const isStart = cellNum === 1;

          return (
            <div
              key={cellNum}
              className={`relative flex items-start justify-start border-[0.5px] border-[#FFD6E7]/80 p-[2px] ${
                isGoal
                  ? 'bg-gradient-to-br from-[#FEF08A] to-[#FDE047]'
                  : isStart
                  ? 'bg-[#FFE3EE]'
                  : isPink
                  ? 'bg-[#FFF0F6]'
                  : 'bg-white'
              }`}
            >
              <span
                className={`text-[7.5px] font-extrabold leading-none ${
                  isGoal ? 'text-[#92400E]' : 'text-[#9A6A80]'
                }`}
              >
                {cellNum}
              </span>
              {isGoal && (
                <span className="pointer-events-none absolute inset-0 flex items-center justify-center">
                  <AppleEmoji emoji="🏆" size={14} />
                </span>
              )}
            </div>
          );
        })}
      </div>

      {/* SVG Curved Snakes & Ladders Overlay */}
      <svg
        viewBox="0 0 100 100"
        className="pointer-events-none absolute inset-0 z-10 h-full w-full"
        aria-hidden="true"
      >
        {snakesLadders.map((item, idx) => {
          const fromC = getSquareCoords(item.from_pos);
          const toC = getSquareCoords(item.to_pos);

          if (item.type === 'ladder') {
            const dx = toC.cx - fromC.cx;
            const dy = toC.cy - fromC.cy;
            const len = Math.hypot(dx, dy) || 1;
            const ux = (-dy / len) * 1.15;
            const uy = (dx / len) * 1.15;
            const steps = Math.max(3, Math.floor(len / 5));
            const rungs = Array.from({ length: steps - 1 }, (_, i) => {
              const t = (i + 1) / steps;
              const mx = fromC.cx + dx * t;
              const my = fromC.cy + dy * t;
              return {
                x1: mx - ux,
                y1: my - uy,
                x2: mx + ux,
                y2: my + uy,
              };
            });

            return (
              <g key={`ladder-${idx}`} opacity={0.82}>
                <line
                  x1={fromC.cx - ux}
                  y1={fromC.cy - uy}
                  x2={toC.cx - ux}
                  y2={toC.cy - uy}
                  stroke="#F59E0B"
                  strokeWidth="0.9"
                  strokeLinecap="round"
                />
                <line
                  x1={fromC.cx + ux}
                  y1={fromC.cy + uy}
                  x2={toC.cx + ux}
                  y2={toC.cy + uy}
                  stroke="#F59E0B"
                  strokeWidth="0.9"
                  strokeLinecap="round"
                />
                {rungs.map((r, rIdx) => (
                  <line
                    key={rIdx}
                    x1={r.x1}
                    y1={r.y1}
                    x2={r.x2}
                    y2={r.y2}
                    stroke="#D97706"
                    strokeWidth="0.7"
                    strokeLinecap="round"
                  />
                ))}
              </g>
            );
          }

          // Snake: smooth S-curve SVG path
          const mx = (fromC.cx + toC.cx) / 2;
          const my = (fromC.cy + toC.cy) / 2;
          const dx = toC.cx - fromC.cx;
          const dy = toC.cy - fromC.cy;
          const len = Math.hypot(dx, dy) || 1;
          const nx = (-dy / len) * 5.5;
          const ny = (dx / len) * 5.5;
          const c1x = (fromC.cx + mx) / 2 + nx;
          const c1y = (fromC.cy + my) / 2 + ny;
          const c2x = (mx + toC.cx) / 2 - nx;
          const c2y = (my + toC.cy) / 2 - ny;

          return (
            <g key={`snake-${idx}`} opacity={0.85}>
              <path
                d={`M ${fromC.cx} ${fromC.cy} Q ${c1x} ${c1y}, ${mx} ${my} Q ${c2x} ${c2y}, ${toC.cx} ${toC.cy}`}
                fill="none"
                stroke="#FB7185"
                strokeWidth="1.4"
                strokeLinecap="round"
              />
              <path
                d={`M ${fromC.cx} ${fromC.cy} Q ${c1x} ${c1y}, ${mx} ${my} Q ${c2x} ${c2y}, ${toC.cx} ${toC.cy}`}
                fill="none"
                stroke="#BE123C"
                strokeWidth="0.7"
                strokeDasharray="1.4 1.6"
                strokeLinecap="round"
              />
            </g>
          );
        })}
      </svg>

      {/* Emoji Markers at Ladder Base (🪜) & Snake Head (🐍) */}
      <div className="pointer-events-none absolute inset-0 z-10">
        {snakesLadders.map((item, idx) => {
          const { cx, cy } = getSquareCoords(item.from_pos);
          return (
            <span
              key={`em-${idx}`}
              style={{
                left: `${cx}%`,
                top: `${cy}%`,
                transform: 'translate(-15%, -15%)',
              }}
              className="absolute leading-none opacity-85"
            >
              <AppleEmoji
                emoji={item.type === 'ladder' ? '🪜' : '🐍'}
                size={12}
              />
            </span>
          );
        })}
      </div>
    </>
  )
);

export const GameView: React.FC<GameViewProps> = ({
  currentUser,
  partnerInGame,
  profile,
  onGameStateChange,
  onRoomMembersChange,
  onHeartBurstAt,
  onBack,
}) => {
  const { roomMembers } = useKeizGameRoom(
    currentUser,
    onGameStateChange,
    onRoomMembersChange
  );

  const resolvedProfile = profile ?? DEFAULT_FALLBACK_PROFILE;
  const partnerRole: Role = currentUser === 'faiz' ? 'kenat' : 'faiz';
  const partnerOnlineInRoom =
    partnerInGame || roomMembers.includes(partnerRole);

  // Page visibility inside Game ('menu' | 'ular-tangga' | 'ludo-king')
  const [savedRoomMeta, setSavedRoomMeta] = useState<SavedActiveRoom | null>(() =>
    loadSavedActiveRoom()
  );
  const [savedLudoMeta, setSavedLudoMeta] = useState<SavedActiveRoom | null>(() =>
    loadSavedLudoRoom()
  );
  const [activeGamePage, setActiveGamePage] = useState<'menu' | 'ular-tangga' | 'ludo-king'>(() => {
    if (loadSavedActiveRoom()) return 'ular-tangga';
    if (loadSavedLudoRoom()) return 'ludo-king';
    return 'menu';
  });

  const BOT_ROOM_ID = '__BOT_MODE__';

  // Ular Tangga Setup & Room States
  const defaultAccountName =
    currentUser === 'faiz'
      ? resolvedProfile.faizName || 'faiz'
      : resolvedProfile.kenatName || 'kenat';
  const myAvatarEmoji = currentUser;

  const [playerName, setPlayerName] = useState<string>(
    () => savedRoomMeta?.playerName || defaultAccountName
  );
  const [showJoinInput, setShowJoinInput] = useState(false);
  const [joinCodeInput, setJoinCodeInput] = useState('');
  const [setupError, setSetupError] = useState<string | null>(null);
  const [isRoomBusy, setIsRoomBusy] = useState(false);

  const [room, setRoom] = useState<UlarTanggaRoom | null>(null);
  const [mySlot, setMySlot] = useState<PlayerSlot | null>(
    () => savedRoomMeta?.playerSlot ?? null
  );
  const [players, setPlayers] = useState<UlarTanggaPlayer[]>([]);
  const [moves, setMoves] = useState<UlarTanggaMove[]>([]);
  const [snakesLadders, setSnakesLadders] = useState<BoardSnakeLadderItem[]>(
    DEFAULT_BOARD_SNAKES_LADDERS
  );

  // Visual / Animation States
  const [visualPositions, setVisualPositions] = useState<Record<PlayerSlot, number>>({
    player1: 1,
    player2: 1,
  });
  const [hoppingSlot, setHoppingSlot] = useState<PlayerSlot | null>(null);
  const [isRolling, setIsRolling] = useState(false);
  const [isAnimatingMove, setIsAnimatingMove] = useState(false);
  const [diceDisplay, setDiceDisplay] = useState<number>(1);
  const [bonusSixBanner, setBonusSixBanner] = useState(false);
  const [boardToast, setBoardToast] = useState<string | null>(null);
  const [copiedCodeToast, setCopiedCodeToast] = useState<string | null>(null);
  const [botTurnNonce, setBotTurnNonce] = useState(0);

  // Game Chat States (WhatsApp + Apple Emoji + React + Reply + Delete)
  const [rawChats, setRawChats] = useState<UlarTanggaRawChatRow[]>([]);
  const [setupChats, setSetupChats] = useState<ParsedGameChat[]>([]);
  const [botChats, setBotChats] = useState<ParsedGameChat[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [replyingTo, setReplyingTo] = useState<ParsedGameChat | null>(null);
  const [activeBubbleMenu, setActiveBubbleMenu] = useState<string | null>(null);
  const [reactTargetMsg, setReactTargetMsg] = useState<ParsedGameChat | null>(null);
  const [reactionDetailMsgId, setReactionDetailMsgId] = useState<string | null>(null);
  const [showInputEmojiPicker, setShowInputEmojiPicker] = useState(false);

  const chatEndRef = useRef<HTMLDivElement | null>(null);
  const boardToastTimerRef = useRef<number | null>(null);
  const lastAnimatedMoveKeyRef = useRef<string>('');
  const lastAnimatedAtRef = useRef<number>(0);
  const animCancelRef = useRef<boolean>(false);
  const roomRef = useRef<UlarTanggaRoom | null>(null);
  const mySlotRef = useRef<PlayerSlot | null>(mySlot);
  const playersRef = useRef<UlarTanggaPlayer[]>(players);
  const isAnimatingMoveRef = useRef<boolean>(isAnimatingMove);
  const isRollingRef = useRef<boolean>(isRolling);
  const setupChanRef = useRef<ReturnType<NonNullable<ReturnType<typeof getSupabaseClient>>['channel']> | null>(null);
  const roomBroadcastChanRef = useRef<ReturnType<NonNullable<ReturnType<typeof getSupabaseClient>>['channel']> | null>(null);
  const seenChatIdsRef = useRef<Set<string>>(new Set());
  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);
  const longPressTimer = useRef<number | null>(null);
  const longPressFiredRef = useRef(false);

  roomRef.current = room;
  mySlotRef.current = mySlot;
  playersRef.current = players;
  isAnimatingMoveRef.current = isAnimatingMove;
  isRollingRef.current = isRolling;

  const isBotRoom = room?.id === BOT_ROOM_ID;

  const parsedRoomChats = useMemo(
    () => foldRawChatRows(rawChats, currentUser, mySlot),
    [rawChats, currentUser, mySlot]
  );

  const activeChats = !room ? setupChats : isBotRoom ? botChats : parsedRoomChats;

  const showBoardToast = useCallback((msg: string, ms = 2000) => {
    setBoardToast(msg);
    if (boardToastTimerRef.current) {
      window.clearTimeout(boardToastTimerRef.current);
    }
    boardToastTimerRef.current = window.setTimeout(() => {
      setBoardToast(null);
    }, ms);
  }, []);

  // Load snakes & ladders configuration from Supabase (with exact required defaults)
  useEffect(() => {
    const sb = getSupabaseClient();
    if (!sb) return;
    void (async () => {
      try {
        const { data, error } = await sb
          .from('board_snakes_ladders')
          .select('from_pos, to_pos, type');
        if (!error && Array.isArray(data) && data.length > 0) {
          const valid = data
            .map((r) => ({
              from_pos: Number(r.from_pos),
              to_pos: Number(r.to_pos),
              type: (String(r.type) === 'snake' ? 'snake' : 'ladder') as
                | 'ladder'
                | 'snake',
            }))
            .filter((r) => r.from_pos >= 1 && r.to_pos >= 1);
          if (valid.length > 0) {
            setSnakesLadders(valid);
          }
        }
      } catch {
        // fallback to DEFAULT_BOARD_SNAKES_LADDERS
      }
    })();
  }, []);

  // Cleanup animation timers on unmount
  useEffect(() => {
    return () => {
      animCancelRef.current = true;
      if (boardToastTimerRef.current) {
        window.clearTimeout(boardToastTimerRef.current);
      }
    };
  }, []);

  // Close bubble action bar / inline emoji picker on outside pointer tap
  useEffect(() => {
    if (!activeBubbleMenu && !showInputEmojiPicker) return;
    const handleOutside = (e: PointerEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;
      if (
        activeBubbleMenu &&
        !target.closest('[data-ut-bubble-menu="true"]') &&
        !target.closest('[data-ut-chat-bubble="true"]')
      ) {
        setActiveBubbleMenu(null);
      }
      if (
        showInputEmojiPicker &&
        !target.closest('[data-ut-chat-input="true"]')
      ) {
        setShowInputEmojiPicker(false);
      }
    };
    document.addEventListener('pointerdown', handleOutside, true);
    return () => document.removeEventListener('pointerdown', handleOutside, true);
  }, [activeBubbleMenu, showInputEmojiPicker]);

  // Auto-scroll chat box on new messages
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [activeChats.length]);

  // Step-by-step piece animation
  const animatePieceMove = useCallback(
    async (
      slot: PlayerSlot,
      fromPos: number,
      toPos: number,
      diceValue: number,
      eventType: string
    ) => {
      const key = `${slot}-${fromPos}-${toPos}-${diceValue}`;
      const now = Date.now();
      if (
        lastAnimatedMoveKeyRef.current === key &&
        now - lastAnimatedAtRef.current < 2600
      ) {
        return;
      }
      lastAnimatedMoveKeyRef.current = key;
      lastAnimatedAtRef.current = now;

      animCancelRef.current = false;
      setIsAnimatingMove(true);

      const sleep = (ms: number) =>
        new Promise<void>((res) => window.setTimeout(res, ms));

      const rawTargetAfterDice = fromPos + diceValue;
      const isBounceStay = toPos === fromPos && rawTargetAfterDice > 100;

      if (isBounceStay) {
        showBoardToast(`Lewat 100! Tetap di ${fromPos}`, 2000);
        setVisualPositions((prev) => ({ ...prev, [slot]: toPos }));
        await sleep(420);
        setIsAnimatingMove(false);
        return;
      }

      const walkLimit =
        rawTargetAfterDice <= 100 ? rawTargetAfterDice : Math.min(100, toPos);
      const stepEnd =
        eventType === 'ladder' || eventType === 'snake' ? walkLimit : toPos;

      for (let pos = fromPos + 1; pos <= stepEnd; pos++) {
        if (animCancelRef.current) break;
        setHoppingSlot(slot);
        setVisualPositions((prev) => ({ ...prev, [slot]: pos }));
        soundFX.playClick();
        await sleep(360);
        setHoppingSlot(null);
        await sleep(70);
      }

      if (!animCancelRef.current && toPos !== stepEnd) {
        if (eventType === 'ladder' || toPos > stepEnd) {
          soundFX.playHeartBurst();
          showBoardToast(`Naik Tangga! 🪜 Dari ${stepEnd} ke ${toPos}`, 2200);
        } else if (eventType === 'snake' || toPos < stepEnd) {
          soundFX.playClick();
          showBoardToast(`Kena Ular! 🐍 Turun dari ${stepEnd} ke ${toPos}`, 2200);
        }
        await sleep(360);
        setHoppingSlot(slot);
        setVisualPositions((prev) => ({ ...prev, [slot]: toPos }));
        await sleep(460);
        setHoppingSlot(null);
      }

      setIsAnimatingMove(false);
    },
    [showBoardToast]
  );

  // ---------- CORE NAMED FUNCTIONS (REQUIRED BY SPEC) ----------
  const showUlarTanggaPage = () => {
    soundFX.playClick();
    setActiveGamePage('ular-tangga');
  };

  const showLudoKingPage = () => {
    soundFX.playClick();
    setActiveGamePage('ludo-king');
  };

  const loadChats = useCallback(async (roomId: string) => {
    const sb = getSupabaseClient();
    if (!sb || !roomId) return;
    const { data, error } = await sb
      .from('game_chats')
      .select('*')
      .eq('room_id', roomId)
      .order('created_at', { ascending: true });

    if (!error && Array.isArray(data)) {
      const rows = data as UlarTanggaRawChatRow[];
      rows.forEach((r) => seenChatIdsRef.current.add(r.id));
      setRawChats((prev) => {
        if (
          prev.length === rows.length &&
          prev[prev.length - 1]?.id === rows[rows.length - 1]?.id
        ) {
          return prev;
        }
        return rows;
      });
    }
  }, []);

  const fetchFullRoomSnapshot = useCallback(
    async (roomId: string) => {
      const sb = getSupabaseClient();
      if (!sb || !roomId) return;

      const [roomRes, playersRes, movesRes] = await Promise.all([
        sb.from('game_rooms').select('*').eq('id', roomId).maybeSingle(),
        sb.from('game_players').select('*').eq('room_id', roomId),
        sb
          .from('game_moves')
          .select('*')
          .eq('room_id', roomId)
          .order('created_at', { ascending: false })
          .limit(30),
      ]);

      if (!roomRes.error && roomRes.data) {
        const r = roomRes.data as UlarTanggaRoom;
        const mappedRoom: UlarTanggaRoom = {
          id: String(r.id),
          room_code: String(r.room_code),
          status: (r.status || 'waiting') as UlarTanggaRoom['status'],
          current_turn: r.current_turn === 'player2' ? 'player2' : 'player1',
          winner: r.winner ? String(r.winner) : null,
        };
        setRoom((prev) =>
          prev &&
          prev.id === mappedRoom.id &&
          prev.status === mappedRoom.status &&
          prev.current_turn === mappedRoom.current_turn &&
          prev.winner === mappedRoom.winner
            ? prev
            : mappedRoom
        );
      }

      if (!playersRes.error && Array.isArray(playersRes.data)) {
        const pList = (playersRes.data as UlarTanggaPlayer[]).map((p) => ({
          ...p,
          player_slot: (p.player_slot === 'player2'
            ? 'player2'
            : 'player1') as PlayerSlot,
          position: Number(p.position || 1),
          is_ready: Boolean(p.is_ready),
        }));
        setPlayers((prev) => {
          if (
            prev.length === pList.length &&
            prev.every(
              (oldP, i) =>
                oldP.player_slot === pList[i]?.player_slot &&
                oldP.position === pList[i]?.position &&
                oldP.is_ready === pList[i]?.is_ready &&
                oldP.name === pList[i]?.name
            )
          ) {
            return prev;
          }
          return pList;
        });
        if (!isAnimatingMoveRef.current) {
          setVisualPositions((prev) => {
            let changed = false;
            const next = { ...prev };
            for (const pl of pList) {
              if (next[pl.player_slot] !== pl.position) {
                next[pl.player_slot] = pl.position;
                changed = true;
              }
            }
            return changed ? next : prev;
          });
        }
      }

      if (!movesRes.error && Array.isArray(movesRes.data)) {
        const mList = movesRes.data as UlarTanggaMove[];
        setMoves((prev) => {
          if (prev.length === mList.length && prev[0]?.id === mList[0]?.id) {
            return prev;
          }
          return mList;
        });
      }

      await loadChats(roomId);
    },
    [loadChats]
  );

  const subscribeGameRealtime = useCallback(
    (roomId: string) => {
      const sb = getSupabaseClient();
      if (!sb || !roomId) return () => {};

      const channel = sb
        .channel(`keiz_ut_room_${roomId}`, {
          config: { broadcast: { self: false } },
        })
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'game_rooms',
            filter: `id=eq.${roomId}`,
          },
          (payload) => {
            const next = payload.new as Partial<UlarTanggaRoom> | undefined;
            if (!next || !next.id) return;
            setRoom((prev) => ({
              id: String(next.id),
              room_code: String(next.room_code ?? prev?.room_code ?? ''),
              status: (next.status ?? prev?.status ?? 'waiting') as UlarTanggaRoom['status'],
              current_turn:
                next.current_turn === 'player2' ? 'player2' : 'player1',
              winner:
                next.winner !== undefined
                  ? next.winner
                    ? String(next.winner)
                    : null
                  : prev?.winner ?? null,
            }));
          }
        )
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'game_players',
            filter: `room_id=eq.${roomId}`,
          },
          (payload) => {
            const row = payload.new as Partial<UlarTanggaPlayer> | undefined;
            if (payload.eventType === 'DELETE') {
              void fetchFullRoomSnapshot(roomId);
              return;
            }
            if (!row || !row.player_slot) return;
            const slot: PlayerSlot =
              row.player_slot === 'player2' ? 'player2' : 'player1';
            const mapped: UlarTanggaPlayer = {
              id: row.id,
              room_id: String(row.room_id ?? roomId),
              player_slot: slot,
              name: String(row.name ?? ''),
              avatar_emoji: String(row.avatar_emoji ?? (slot === 'player1' ? 'faiz' : 'kenat')),
              position: Number(row.position || 1),
              is_ready: Boolean(row.is_ready),
            };
            setPlayers((prev) => {
              const exists = prev.some((p) => p.player_slot === slot);
              return exists
                ? prev.map((p) => (p.player_slot === slot ? mapped : p))
                : [...prev, mapped];
            });
            if (!isAnimatingMoveRef.current) {
              setVisualPositions((prev) => ({
                ...prev,
                [slot]: mapped.position,
              }));
            }
          }
        )
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'game_moves',
            filter: `room_id=eq.${roomId}`,
          },
          (payload) => {
            const mv = payload.new as UlarTanggaMove | undefined;
            if (!mv) return;
            const slot: PlayerSlot =
              mv.player_slot === 'player2' ? 'player2' : 'player1';
            setMoves((prev) => {
              if (mv.id && prev.some((m) => m.id === mv.id)) return prev;
              return [mv, ...prev].slice(0, 30);
            });
            void animatePieceMove(
              slot,
              Number(mv.from_position),
              Number(mv.to_position),
              Number(mv.dice_value),
              String(mv.event_type || 'normal')
            );
          }
        )
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'game_chats',
            filter: `room_id=eq.${roomId}`,
          },
          (payload) => {
            if (payload.eventType === 'DELETE') {
              const oldRow = payload.old as { id?: string } | undefined;
              if (oldRow?.id) {
                setRawChats((prev) => prev.filter((c) => c.id !== oldRow.id));
              } else {
                void loadChats(roomId);
              }
              return;
            }
            const inserted = payload.new as UlarTanggaRawChatRow | undefined;
            if (!inserted || !inserted.id) return;
            setRawChats((prev) =>
              prev.some((c) => c.id === inserted.id) ? prev : [...prev, inserted]
            );
            if (
              inserted.sender_name !== UT_REACT_MARKER &&
              inserted.message !== UT_DELETED_MARKER &&
              !seenChatIdsRef.current.has(inserted.id)
            ) {
              seenChatIdsRef.current.add(inserted.id);
              const senderRole = inferSenderRole(
                inserted,
                currentUser,
                mySlotRef.current
              );
              if (senderRole !== currentUser) {
                soundFX.playPop();
              }
            }
          }
        )
        .on('broadcast', { event: 'chat_deleted' }, ({ payload }) => {
          const id = (payload as { id?: string } | undefined)?.id;
          if (id) {
            setRawChats((prev) => prev.filter((c) => c.id !== id));
          }
        })
        .subscribe();

      roomBroadcastChanRef.current = channel;

      return () => {
        roomBroadcastChanRef.current = null;
        sb.removeChannel(channel);
      };
    },
    [animatePieceMove, currentUser, fetchFullRoomSnapshot, loadChats]
  );

  // Hydrate active room from localStorage on mount & keep Realtime + 3s poll synced
  useEffect(() => {
    if (!savedRoomMeta?.roomId || savedRoomMeta.roomId === BOT_ROOM_ID) return;
    let active = true;
    void fetchFullRoomSnapshot(savedRoomMeta.roomId);
    const unsub = subscribeGameRealtime(savedRoomMeta.roomId);
    const poll = window.setInterval(() => {
      if (active && !isAnimatingMoveRef.current && !isRollingRef.current) {
        void fetchFullRoomSnapshot(savedRoomMeta.roomId);
      }
    }, 3000);
    return () => {
      active = false;
      window.clearInterval(poll);
      unsub();
    };
  }, [savedRoomMeta?.roomId, fetchFullRoomSnapshot, subscribeGameRealtime]);

  // Setup Chat Realtime Channel (works before joining a room!)
  useEffect(() => {
    const sb = getSupabaseClient();
    if (!sb) return;
    const chan = sb
      .channel('keiz_ular_tangga_setup_chat_room', {
        config: { broadcast: { self: false } },
      })
      .on('broadcast', { event: 'setup_chat' }, ({ payload }) => {
        const msg = payload as ParsedGameChat | undefined;
        if (!msg?.id) return;
        setSetupChats((prev) =>
          prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]
        );
        if (msg.senderRole !== currentUser) {
          soundFX.playPop();
        }
      })
      .on('broadcast', { event: 'setup_react' }, ({ payload }) => {
        const p = payload as { msgId?: string; react?: string } | undefined;
        if (!p?.msgId) return;
        setSetupChats((prev) =>
          prev.map((m) => (m.id === p.msgId ? { ...m, react: p.react } : m))
        );
      })
      .on('broadcast', { event: 'setup_delete' }, ({ payload }) => {
        const p = payload as { msgId?: string } | undefined;
        if (!p?.msgId) return;
        setSetupChats((prev) => prev.filter((m) => m.id !== p.msgId));
      })
      .subscribe();

    setupChanRef.current = chan;
    return () => {
      setupChanRef.current = null;
      sb.removeChannel(chan);
    };
  }, [currentUser]);

  const createRoom = async () => {
    const cleanName = playerName.trim();
    if (!cleanName) {
      setSetupError('Isi nama kamu dulu ya!');
      return;
    }
    const sb = getSupabaseClient();
    if (!sb) {
      setSetupError('Supabase belum terhubung.');
      return;
    }

    soundFX.playClick();
    setSetupError(null);
    setIsRoomBusy(true);

    try {
      const roomCode = generateRoomCode();
      const { data: roomData, error: roomErr } = await sb
        .from('game_rooms')
        .insert([{ room_code: roomCode, status: 'waiting' }])
        .select('*')
        .single();

      if (roomErr || !roomData) {
        setSetupError(roomErr?.message || 'Gagal membuat room.');
        return;
      }

      const newRoomId = String(roomData.id);
      const { error: playerErr } = await sb.from('game_players').insert([
        {
          room_id: newRoomId,
          player_slot: 'player1',
          name: cleanName,
          avatar_emoji: myAvatarEmoji,
          position: 1,
        },
      ]);

      if (playerErr) {
        setSetupError(playerErr.message || 'Gagal mendaftarkan pemain.');
        return;
      }

      const meta: SavedActiveRoom = {
        roomId: newRoomId,
        roomCode: String(roomData.room_code || roomCode),
        playerSlot: 'player1',
        playerName: cleanName,
      };
      saveActiveRoomToStorage(meta);
      setSavedRoomMeta(meta);
      setMySlot('player1');
      setRoom({
        id: newRoomId,
        room_code: meta.roomCode,
        status: 'waiting',
        current_turn: roomData.current_turn === 'player2' ? 'player2' : 'player1',
        winner: null,
      });
      setVisualPositions({ player1: 1, player2: 1 });
      await fetchFullRoomSnapshot(newRoomId);
    } finally {
      setIsRoomBusy(false);
    }
  };

  const joinRoom = async () => {
    const cleanName = playerName.trim();
    const cleanCode = joinCodeInput.trim().toUpperCase();
    if (!cleanName) {
      setSetupError('Isi nama kamu dulu ya!');
      return;
    }
    if (!cleanCode) {
      setSetupError('Isi kode room dulu ya!');
      return;
    }
    const sb = getSupabaseClient();
    if (!sb) {
      setSetupError('Supabase belum terhubung.');
      return;
    }

    soundFX.playClick();
    setSetupError(null);
    setIsRoomBusy(true);

    try {
      const { data: foundRoom, error: findErr } = await sb
        .from('game_rooms')
        .select('*')
        .eq('room_code', cleanCode)
        .maybeSingle();

      if (findErr || !foundRoom) {
        setSetupError('Room tidak ditemukan!');
        return;
      }

      const targetRoomId = String(foundRoom.id);
      const { data: existingPlayers } = await sb
        .from('game_players')
        .select('*')
        .eq('room_id', targetRoomId);

      const list = Array.isArray(existingPlayers)
        ? (existingPlayers as UlarTanggaPlayer[])
        : [];

      if (list.length >= 2) {
        setSetupError('Room sudah penuh!');
        return;
      }

      const { error: joinErr } = await sb.from('game_players').insert([
        {
          room_id: targetRoomId,
          player_slot: 'player2',
          name: cleanName,
          avatar_emoji: myAvatarEmoji,
          position: 1,
        },
      ]);

      if (joinErr) {
        setSetupError(joinErr.message || 'Gagal masuk room.');
        return;
      }

      const meta: SavedActiveRoom = {
        roomId: targetRoomId,
        roomCode: String(foundRoom.room_code || cleanCode),
        playerSlot: 'player2',
        playerName: cleanName,
      };
      saveActiveRoomToStorage(meta);
      setSavedRoomMeta(meta);
      setMySlot('player2');
      setRoom({
        id: targetRoomId,
        room_code: meta.roomCode,
        status: (foundRoom.status || 'waiting') as UlarTanggaRoom['status'],
        current_turn: foundRoom.current_turn === 'player2' ? 'player2' : 'player1',
        winner: foundRoom.winner ? String(foundRoom.winner) : null,
      });
      setShowJoinInput(false);
      setJoinCodeInput('');
      await fetchFullRoomSnapshot(targetRoomId);
    } finally {
      setIsRoomBusy(false);
    }
  };

  const setReady = async () => {
    if (!room || !mySlot) return;
    const sb = getSupabaseClient();
    if (!sb) return;
    soundFX.playPop();

    setPlayers((prev) =>
      prev.map((p) =>
        p.player_slot === mySlot ? { ...p, is_ready: true } : p
      )
    );

    await sb
      .from('game_players')
      .update({ is_ready: true })
      .eq('room_id', room.id)
      .eq('player_slot', mySlot);

    await fetchFullRoomSnapshot(room.id);
  };

  const startGame = async () => {
    if (!room) return;
    const sb = getSupabaseClient();
    if (!sb) return;
    soundFX.playHeartBurst();

    setRoom((prev) => (prev ? { ...prev, status: 'playing' } : prev));
    await sb
      .from('game_rooms')
      .update({ status: 'playing', current_turn: 'player1', winner: null })
      .eq('id', room.id);

    await fetchFullRoomSnapshot(room.id);
  };

  const leaveRoom = async () => {
    soundFX.playClick();
    animCancelRef.current = true;
    const curRoom = roomRef.current;
    const curSlot = mySlotRef.current;
    saveActiveRoomToStorage(null);
    setSavedRoomMeta(null);
    setRoom(null);
    setMySlot(null);
    setPlayers([]);
    setMoves([]);
    setRawChats([]);
    setBotChats([]);
    setVisualPositions({ player1: 1, player2: 1 });
    setBonusSixBanner(false);
    setBoardToast(null);
    setIsRolling(false);
    setIsAnimatingMove(false);

    if (curRoom?.id === BOT_ROOM_ID) return;

    const sb = getSupabaseClient();
    if (sb && curRoom && curSlot && curRoom.status === 'waiting') {
      await sb
        .from('game_players')
        .delete()
        .eq('room_id', curRoom.id)
        .eq('player_slot', curSlot);
    }
  };

  const resolveLocalRoll = useCallback(
    (fromPos: number) => {
      const dice = Math.floor(Math.random() * 6) + 1;
      const rawTarget = fromPos + dice;
      if (rawTarget > 100) {
        return { dice, from: fromPos, to: fromPos, event: 'overshoot' };
      }
      const match = snakesLadders.find((item) => item.from_pos === rawTarget);
      if (match) {
        return {
          dice,
          from: fromPos,
          to: match.to_pos,
          event: match.type,
        };
      }
      return { dice, from: fromPos, to: rawTarget, event: 'normal' };
    },
    [snakesLadders]
  );

  const startBotGame = () => {
    const cleanName = playerName.trim() || defaultAccountName;
    if (!cleanName) {
      setSetupError('Isi nama kamu dulu ya!');
      return;
    }
    soundFX.playHeartBurst();
    setSetupError(null);
    lastAnimatedMoveKeyRef.current = '';
    setMySlot('player1');
    setRoom({
      id: BOT_ROOM_ID,
      room_code: 'BOT-KEIZ',
      status: 'playing',
      current_turn: 'player1',
      winner: null,
    });
    setPlayers([
      {
        room_id: BOT_ROOM_ID,
        player_slot: 'player1',
        name: cleanName,
        avatar_emoji: currentUser,
        position: 1,
        is_ready: true,
      },
      {
        room_id: BOT_ROOM_ID,
        player_slot: 'player2',
        name: 'Bot Keiz',
        avatar_emoji: 'bot',
        position: 1,
        is_ready: true,
      },
    ]);
    setMoves([]);
    setBotChats([]);
    setVisualPositions({ player1: 1, player2: 1 });
    setBonusSixBanner(false);
    setBoardToast(null);
    setDiceDisplay(1);
    setBotTurnNonce(0);
  };

  // Bot Auto-Turn Runner when playing solo vs Bot Keiz
  useEffect(() => {
    if (
      !room ||
      room.id !== BOT_ROOM_ID ||
      room.status !== 'playing' ||
      room.current_turn !== 'player2'
    ) {
      return;
    }

    let cancelled = false;
    const sleep = (ms: number) =>
      new Promise<void>((res) => window.setTimeout(res, ms));

    void (async () => {
      await sleep(650);
      if (cancelled || roomRef.current?.id !== BOT_ROOM_ID) return;

      setIsRolling(true);
      setBonusSixBanner(false);
      const spinTimer = window.setInterval(() => {
        setDiceDisplay(Math.floor(Math.random() * 6) + 1);
      }, 125);

      await sleep(950);
      window.clearInterval(spinTimer);
      if (cancelled || roomRef.current?.id !== BOT_ROOM_ID) {
        setIsRolling(false);
        return;
      }
      setIsRolling(false);

      const botPlayer = playersRef.current.find((p) => p.player_slot === 'player2');
      const fromPos = botPlayer?.position ?? 1;
      const res = resolveLocalRoll(fromPos);

      setDiceDisplay(res.dice);
      setPlayers((prev) =>
        prev.map((p) =>
          p.player_slot === 'player2' ? { ...p, position: res.to } : p
        )
      );
      setMoves((prev) => [
        {
          id: `bot-mv-${Date.now()}`,
          room_id: BOT_ROOM_ID,
          player_slot: 'player2',
          dice_value: res.dice,
          from_position: res.from,
          to_position: res.to,
          event_type: res.event,
          created_at: new Date().toISOString(),
        },
        ...prev,
      ]);

      await animatePieceMove('player2', res.from, res.to, res.dice, res.event);
      if (cancelled || roomRef.current?.id !== BOT_ROOM_ID) return;

      if (res.to >= 100) {
        setRoom((prev) =>
          prev ? { ...prev, status: 'finished', winner: 'player2' } : prev
        );
        return;
      }

      if (res.dice === 6) {
        showBoardToast('Bot dapet 6! Bot lempar lagi!', 1500);
        await sleep(750);
        if (!cancelled) {
          setBotTurnNonce((n) => n + 1);
        }
        return;
      }

      setRoom((prev) => (prev ? { ...prev, current_turn: 'player1' } : prev));
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room?.id, room?.status, room?.current_turn, botTurnNonce]);

  const handlePlayAgain = async () => {
    if (!room) return;
    soundFX.playHeartBurst();
    lastAnimatedMoveKeyRef.current = '';
    setVisualPositions({ player1: 1, player2: 1 });
    setBonusSixBanner(false);
    setBoardToast(null);

    if (room.id === BOT_ROOM_ID) {
      setPlayers((prev) => prev.map((p) => ({ ...p, position: 1 })));
      setMoves([]);
      setRoom((prev) =>
        prev
          ? { ...prev, status: 'playing', current_turn: 'player1', winner: null }
          : prev
      );
      setBotTurnNonce(0);
      return;
    }

    const sb = getSupabaseClient();
    if (!sb) return;

    await sb
      .from('game_players')
      .update({ position: 1 })
      .eq('room_id', room.id);

    await sb
      .from('game_rooms')
      .update({ status: 'playing', current_turn: 'player1', winner: null })
      .eq('id', room.id);

    await fetchFullRoomSnapshot(room.id);
  };

  const handleBackToLobby = async () => {
    if (!room) return;
    if (room.id === BOT_ROOM_ID) {
      await leaveRoom();
      return;
    }
    const sb = getSupabaseClient();
    if (!sb) return;
    soundFX.playClick();
    lastAnimatedMoveKeyRef.current = '';
    setVisualPositions({ player1: 1, player2: 1 });
    setBonusSixBanner(false);

    await sb
      .from('game_players')
      .update({ position: 1, is_ready: false })
      .eq('room_id', room.id);

    await sb
      .from('game_rooms')
      .update({ status: 'waiting', current_turn: 'player1', winner: null })
      .eq('id', room.id);

    await fetchFullRoomSnapshot(room.id);
  };

  const rollDice = async () => {
    if (!room || !mySlot || isRolling || isAnimatingMove) return;
    if (room.status !== 'playing' || room.current_turn !== mySlot) return;

    // Bot solo testing mode
    if (room.id === BOT_ROOM_ID) {
      soundFX.playClick();
      setIsRolling(true);
      setBonusSixBanner(false);

      const spinTimer = window.setInterval(() => {
        setDiceDisplay(Math.floor(Math.random() * 6) + 1);
      }, 125);

      await new Promise<void>((res) => window.setTimeout(res, 1000));
      window.clearInterval(spinTimer);
      setIsRolling(false);

      const curMe = playersRef.current.find((p) => p.player_slot === 'player1');
      const fromPos = curMe?.position ?? visualPositions.player1;
      const res = resolveLocalRoll(fromPos);

      setDiceDisplay(res.dice);
      setPlayers((prev) =>
        prev.map((p) =>
          p.player_slot === 'player1' ? { ...p, position: res.to } : p
        )
      );
      setMoves((prev) => [
        {
          id: `p1-mv-${Date.now()}`,
          room_id: BOT_ROOM_ID,
          player_slot: 'player1',
          dice_value: res.dice,
          from_position: res.from,
          to_position: res.to,
          event_type: res.event,
          created_at: new Date().toISOString(),
        },
        ...prev,
      ]);

      await animatePieceMove('player1', res.from, res.to, res.dice, res.event);

      if (res.to >= 100) {
        setRoom((prev) =>
          prev ? { ...prev, status: 'finished', winner: 'player1' } : prev
        );
        return;
      }

      if (res.dice === 6) {
        setBonusSixBanner(true);
        soundFX.playPop();
        return;
      }

      setRoom((prev) => (prev ? { ...prev, current_turn: 'player2' } : prev));
      return;
    }

    const sb = getSupabaseClient();
    if (!sb) return;

    soundFX.playClick();
    setIsRolling(true);
    setBonusSixBanner(false);

    const spinTimer = window.setInterval(() => {
      setDiceDisplay(Math.floor(Math.random() * 6) + 1);
    }, 125);

    const minDelay = new Promise<void>((res) => window.setTimeout(res, 1000));
    const rpcCall = sb.rpc('roll_dice', {
      p_room_id: room.id,
      p_player_slot: mySlot,
    });

    const [, rpcResult] = await Promise.all([minDelay, rpcCall]);
    window.clearInterval(spinTimer);
    setIsRolling(false);

    if (rpcResult.error) {
      showBoardToast(rpcResult.error.message || 'Gagal lempar dadu!', 2200);
      return;
    }

    const raw = Array.isArray(rpcResult.data)
      ? (rpcResult.data[0] as Record<string, unknown> | undefined)
      : (rpcResult.data as Record<string, unknown> | null | undefined);

    if (raw) {
      const dice = Number(raw.dice ?? raw.dice_value ?? 1);
      const from = Number(raw.from ?? raw.from_position ?? 1);
      const to = Number(raw.to ?? raw.to_position ?? from);
      const evType = String(raw.event ?? raw.event_type ?? 'normal');

      setDiceDisplay(Math.max(1, Math.min(6, dice)));
      if (dice === 6 && to < 100) {
        setBonusSixBanner(true);
        soundFX.playPop();
      }
      await animatePieceMove(mySlot, from, to, dice, evType);
    }

    await fetchFullRoomSnapshot(room.id);
  };

  // ---------- CHAT HANDLERS (WORK IN SETUP, LOBBY, BOT, & PLAYING) ----------
  const sendChat = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const cleaned = chatInput.trim();
    if (!cleaned) return;

    soundFX.playPop();
    setChatInput('');
    setShowInputEmojiPicker(false);
    const activeReply = replyingTo;
    setReplyingTo(null);

    const cleanName = playerName.trim() || defaultAccountName;

    if (!room || room.id === BOT_ROOM_ID) {
      const msg: ParsedGameChat = {
        id: `${room ? 'bot' : 'setup'}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        player_slot: currentUser,
        senderRole: currentUser,
        senderName: cleanName,
        senderEmoji: myAvatarEmoji,
        text: cleaned,
        replyToId: activeReply?.id,
        replyToSender: activeReply?.senderRole,
        replyToText: activeReply?.text,
        created_at: new Date().toISOString(),
      };
      if (room?.id === BOT_ROOM_ID) {
        setBotChats((prev) => [...prev, msg]);
      } else {
        setSetupChats((prev) => [...prev, msg]);
        setupChanRef.current
          ?.send({
            type: 'broadcast',
            event: 'setup_chat',
            payload: msg,
          })
          .catch(() => {});
      }
      return;
    }

    const sb = getSupabaseClient();
    if (!sb) return;
    const encodedMsg = encodeChatMessagePayload(cleaned, activeReply);
    const slotToUse: PlayerSlot = mySlot || 'player1';

    const { data, error } = await sb
      .from('game_chats')
      .insert([
        {
          room_id: room.id,
          player_slot: slotToUse,
          sender_name: cleanName,
          sender_emoji: myAvatarEmoji,
          message: encodedMsg,
        },
      ])
      .select('*')
      .single();

    if (!error && data) {
      const row = data as UlarTanggaRawChatRow;
      seenChatIdsRef.current.add(row.id);
      setRawChats((prev) =>
        prev.some((c) => c.id === row.id) ? prev : [...prev, row]
      );
    }
  };

  const applyChatReaction = async (
    msg: ParsedGameChat,
    emoji: string,
    burstPoint?: { x: number; y: number }
  ) => {
    const { nextSerialized, addedEmoji } = toggleUserReaction(
      msg.react,
      currentUser,
      emoji,
      msg.senderRole
    );
    soundFX.playPop();
    if (addedEmoji === '❤️' && burstPoint) {
      onHeartBurstAt?.(burstPoint.x, burstPoint.y);
    }
    setActiveBubbleMenu(null);
    setReactTargetMsg(null);
    if (!nextSerialized && reactionDetailMsgId === msg.id) {
      setReactionDetailMsgId(null);
    }

    if (!room || room.id === BOT_ROOM_ID) {
      if (room?.id === BOT_ROOM_ID) {
        setBotChats((prev) =>
          prev.map((m) => (m.id === msg.id ? { ...m, react: nextSerialized } : m))
        );
      } else {
        setSetupChats((prev) =>
          prev.map((m) => (m.id === msg.id ? { ...m, react: nextSerialized } : m))
        );
        setupChanRef.current
          ?.send({
            type: 'broadcast',
            event: 'setup_react',
            payload: { msgId: msg.id, react: nextSerialized },
          })
          .catch(() => {});
      }
      return;
    }

    const sb = getSupabaseClient();
    if (!sb) return;
    const slotToUse: PlayerSlot = mySlot || 'player1';

    const { data, error } = await sb
      .from('game_chats')
      .insert([
        {
          room_id: room.id,
          player_slot: slotToUse,
          sender_name: UT_REACT_MARKER,
          sender_emoji: msg.id,
          message: JSON.stringify({
            role: currentUser,
            emoji: addedEmoji || null,
          }),
        },
      ])
      .select('*')
      .single();

    if (!error && data) {
      const row = data as UlarTanggaRawChatRow;
      setRawChats((prev) =>
        prev.some((c) => c.id === row.id) ? prev : [...prev, row]
      );
    }
  };

  const handleDeleteChatMsg = async (msgId: string) => {
    soundFX.playClick();
    setActiveBubbleMenu(null);

    if (!room || room.id === BOT_ROOM_ID) {
      if (room?.id === BOT_ROOM_ID) {
        setBotChats((prev) => prev.filter((m) => m.id !== msgId));
      } else {
        setSetupChats((prev) => prev.filter((m) => m.id !== msgId));
        setupChanRef.current
          ?.send({
            type: 'broadcast',
            event: 'setup_delete',
            payload: { msgId },
          })
          .catch(() => {});
      }
      return;
    }

    setRawChats((prev) => prev.filter((c) => c.id !== msgId));
    const sb = getSupabaseClient();
    if (!sb) return;

    const { error } = await sb.from('game_chats').delete().eq('id', msgId);
    if (error) {
      await sb
        .from('game_chats')
        .update({ message: UT_DELETED_MARKER })
        .eq('id', msgId);
    }
    roomBroadcastChanRef.current
      ?.send({
        type: 'broadcast',
        event: 'chat_deleted',
        payload: { id: msgId },
      })
      .catch(() => {});
  };

  const p1 = players.find((p) => p.player_slot === 'player1') || null;
  const p2 = players.find((p) => p.player_slot === 'player2') || null;
  const mePlayer = mySlot ? players.find((p) => p.player_slot === mySlot) || null : null;
  const partnerSlot: PlayerSlot = mySlot === 'player1' ? 'player2' : 'player1';
  const partnerPlayer = players.find((p) => p.player_slot === partnerSlot) || null;

  const myPos = mySlot ? visualPositions[mySlot] : 1;
  const partnerPos = visualPositions[partnerSlot];
  const isMyTurn = Boolean(room && mySlot && room.current_turn === mySlot && room.status === 'playing');
  const currentTurnPlayer = room
    ? players.find((p) => p.player_slot === room.current_turn)
    : null;
  const currentTurnName =
    currentTurnPlayer?.name ||
    (room?.current_turn === 'player1' ? 'Player 1' : 'Player 2');

  const bothReady = Boolean(p1 && p2 && p1.is_ready && p2.is_ready);
  const amIReady = Boolean(mePlayer?.is_ready);

  const winnerName = useMemo(() => {
    if (!room?.winner) {
      const winnerByPos = players.find((p) => p.position >= 100);
      return winnerByPos?.name || 'Pemenang';
    }
    const bySlot = players.find((p) => p.player_slot === room.winner);
    return bySlot?.name || room.winner;
  }, [room?.winner, players]);

  const formatTime = (iso: string) => {
    try {
      return new Date(iso).toLocaleTimeString('id-ID', {
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return '';
    }
  };

  const formatMoveLog = (mv: UlarTanggaMove) => {
    const actor =
      players.find((p) => p.player_slot === mv.player_slot)?.name ||
      (mv.player_slot === 'player1' ? 'Player 1' : 'Player 2');
    const ev = String(mv.event_type || 'normal');
    if (ev === 'snake' || mv.to_position < mv.from_position) {
      return `${actor} kena ular! Turun dari ${mv.from_position} ke ${mv.to_position}`;
    }
    if (ev === 'ladder' || mv.to_position > mv.from_position + mv.dice_value) {
      return `${actor} naik tangga! Dari ${mv.from_position} ke ${mv.to_position}`;
    }
    if (mv.to_position === mv.from_position && mv.from_position + mv.dice_value > 100) {
      return `${actor} lempar ${mv.dice_value}, lewat 100! Tetap di ${mv.from_position}`;
    }
    return `${actor} lempar ${mv.dice_value}, dari ${mv.from_position} ke ${mv.to_position}`;
  };

  // ---------- PROFILE AVATAR HELPER (KEIZ BUCIN PROFIL FOTO / BOT) ----------
  const resolvePlayerRoleFromMeta = (avatarKey?: string, name?: string): Role | 'bot' => {
    if (avatarKey === 'bot') return 'bot';
    if (avatarKey === 'faiz' || avatarKey === '🐻') return 'faiz';
    if (avatarKey === 'kenat' || avatarKey === '🐰') return 'kenat';
    const lower = (name || '').toLowerCase();
    if (lower.includes('bot')) return 'bot';
    if (lower.includes('kenat')) return 'kenat';
    if (lower.includes('faiz')) return 'faiz';
    return currentUser;
  };

  const renderProfileAvatar = (
    avatarKey: string | undefined,
    name: string,
    sizeClass = 'h-12 w-12'
  ) => {
    const kind = resolvePlayerRoleFromMeta(avatarKey, name);
    if (kind === 'bot') {
      return (
        <div
          className={`flex ${sizeClass} shrink-0 items-center justify-center rounded-full border-2 border-[#A78BFA] bg-gradient-to-br from-[#F3E8FF] to-[#E0E7FF] text-[#6D28D9] shadow-sm`}
        >
          <Bot className="h-[56%] w-[56%]" />
        </div>
      );
    }
    const photoUrl =
      kind === 'faiz' ? resolvedProfile.faizPhoto : resolvedProfile.kenatPhoto;
    const borderColor =
      kind === 'faiz' ? 'border-[#3B82F6]' : 'border-[#FF2E7E]';
    const fallbackInitial = (name || kind).slice(0, 1).toUpperCase();

    return (
      <div
        className={`flex ${sizeClass} shrink-0 items-center justify-center overflow-hidden rounded-full border-2 ${borderColor} bg-[#FFF2F7] shadow-sm`}
      >
        {photoUrl ? (
          <img
            src={photoUrl}
            alt={name || kind}
            referrerPolicy="no-referrer"
            className="h-full w-full object-cover"
          />
        ) : (
          <span className="text-xs font-extrabold text-[#D81B6E]">
            {fallbackInitial}
          </span>
        )}
      </div>
    );
  };

  // ---------- RENDER HELPERS (REQUIRED BY SPEC) ----------
  const renderPlayers = () => {
    const list: Array<{
      slot: PlayerSlot;
      pos: number;
      avatarKey: string;
      name: string;
    }> = [];
    if (p1) {
      list.push({
        slot: 'player1',
        pos: visualPositions.player1,
        avatarKey: p1.avatar_emoji || currentUser,
        name: p1.name,
      });
    }
    if (p2) {
      list.push({
        slot: 'player2',
        pos: visualPositions.player2,
        avatarKey: p2.avatar_emoji || (isBotRoom ? 'bot' : partnerRole),
        name: p2.name,
      });
    }

    const sameSquare = list.length === 2 && list[0].pos === list[1].pos;

    return (
      <div className="pointer-events-none absolute inset-0 z-20">
        {list.map((token, idx) => {
          const { row, col } = getSquareCoords(token.pos);
          const offsetPct = sameSquare ? (idx === 0 ? -18 : 18) : 0;
          const isHopping = hoppingSlot === token.slot;
          return (
            <div
              key={token.slot}
              style={{
                width: '10%',
                height: '10%',
                transform: `translate3d(${col * 100 + offsetPct}%, ${row * 100}%, 0)`,
              }}
              className="ut-token-move absolute left-0 top-0 flex items-center justify-center"
            >
              <div
                className={`rounded-full shadow-[0_4px_10px_rgba(45,10,30,0.34)] ${
                  isHopping ? 'ut-piece-hopping' : ''
                }`}
              >
                {renderProfileAvatar(token.avatarKey, token.name, 'h-7 w-7')}
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  const renderBoard = () => {
    return (
      <div className="relative aspect-square w-full overflow-hidden rounded-2xl border-2 border-[#FF9EC7] bg-white shadow-[0_8px_24px_rgba(255,46,126,0.14)]">
        <BoardStaticLayer snakesLadders={snakesLadders} />

        {/* Animated Player Tokens */}
        {renderPlayers()}
      </div>
    );
  };

  // ---------- RENDER: #page-ludo-king ----------
  if (activeGamePage === 'ludo-king') {
    return (
      <LudoKingPage
        currentUser={currentUser}
        resolvedProfile={resolvedProfile}
        onHeartBurstAt={onHeartBurstAt}
        onSavedRoomChange={setSavedLudoMeta}
        onBackToMenu={() => setActiveGamePage('menu')}
      />
    );
  }

  // ---------- RENDER: GAME MENU CARDS (DEFAULT VIEW WHEN OPENING GAME) ----------
  if (activeGamePage === 'menu') {
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

        <main className="grid flex-1 grid-cols-2 content-start items-start gap-3 pt-2 pb-4">
          {/* Kartu Game Ular Tangga (Grid 2 Kolom, max 200px tinggi - TIDAK DIUBAH) */}
          <div
            role="button"
            tabIndex={0}
            onClick={showUlarTanggaPage}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                showUlarTanggaPage();
              }
            }}
            className="menu-card-bucin flex max-h-[200px] flex-col overflow-hidden rounded-[18px] border border-[#FFD6E7] bg-white text-left shadow-[0_8px_20px_rgba(255,46,126,0.12)] cursor-pointer"
          >
            {/* Cover Gambar 94px (CSS + Emoji + Gradient) */}
            <div className="relative h-[94px] w-full shrink-0 overflow-hidden bg-gradient-to-br from-[#FF7AB8] via-[#F472B6] to-[#A855F7] px-2 py-1.5">
              <div className="pointer-events-none absolute -left-4 -top-4 h-14 w-14 rounded-full bg-white/20" />
              <div className="pointer-events-none absolute -bottom-5 -right-4 h-16 w-16 rounded-full bg-white/15" />

              {savedRoomMeta && (
                <span className="absolute right-1.5 top-1.5 z-20 rounded-full bg-[#FF2E7E] px-1.5 py-0.5 text-[8px] font-extrabold text-white shadow-sm ring-1 ring-white/80">
                  AKTIF
                </span>
              )}

              <div className="relative z-10 flex h-full w-full items-center justify-center gap-1.5">
                <div className="flex flex-col items-center gap-1">
                  <div className="flex h-6 w-6 -rotate-12 items-center justify-center rounded-lg bg-white/90 shadow-sm">
                    <AppleEmoji emoji="🐍" size={14} />
                  </div>
                  <div className="flex h-5 w-5 rotate-6 items-center justify-center rounded-lg bg-white/90 shadow-sm">
                    <AppleEmoji emoji="❤️" size={11} />
                  </div>
                </div>

                {/* Papan mini 5x5 */}
                <div className="relative grid h-[76px] w-[76px] shrink-0 grid-cols-5 grid-rows-5 overflow-hidden rounded-xl border border-white/90 bg-white/95 shadow-md">
                  {MINI_COVER_CELLS.map((num, idx) => (
                    <div
                      key={num}
                      className={`flex items-center justify-center border-[0.5px] border-[#FFD6E7] text-[6px] font-extrabold leading-none ${
                        num === 25
                          ? 'bg-[#FDE047] text-[#92400E]'
                          : idx % 2 === 0
                          ? 'bg-[#FFF0F6] text-[#D81B6E]'
                          : 'bg-white text-[#9A6A80]'
                      }`}
                    >
                      {num === 25 ? (
                        <AppleEmoji emoji="🏆" size={8} />
                      ) : num === 14 ? (
                        <AppleEmoji emoji="🪜" size={8} />
                      ) : num === 18 ? (
                        <AppleEmoji emoji="🐍" size={8} />
                      ) : (
                        num
                      )}
                    </div>
                  ))}
                </div>

                <div className="flex flex-col items-center gap-1">
                  <div className="flex h-6 w-6 rotate-12 items-center justify-center rounded-lg bg-white/90 shadow-sm">
                    <AppleEmoji emoji="🪜" size={14} />
                  </div>
                  <div className="flex h-5 w-5 -rotate-6 items-center justify-center rounded-lg bg-white/90 shadow-sm">
                    <AppleEmoji emoji="🎲" size={12} />
                  </div>
                </div>
              </div>
            </div>

            {/* Judul, Subtitle, dan Tombol Kecil di Bawah Cover */}
            <div className="flex flex-1 flex-col justify-between gap-1.5 p-2.5">
              <div className="min-w-0">
                <h2 className="font-display flex items-center gap-1 truncate text-[14px] font-extrabold leading-tight text-[#2D0A1E]">
                  <AppleTextWithEmojis text="🎲 Ular Tangga" emojiSize={14} />
                </h2>
                <p className="mt-0.5 truncate text-[11px] font-semibold leading-tight text-[#8A6A7A]">
                  keiz mabar seru
                </p>
              </div>

              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  showUlarTanggaPage();
                }}
                className="btn-bucin flex h-[32px] w-full shrink-0 items-center justify-center gap-1 rounded-full bg-gradient-to-r from-[#FF2E7E] to-[#FF62A4] px-3 text-[12px] font-extrabold text-white shadow-sm cursor-pointer"
              >
                <AppleTextWithEmojis text="▶️ Main" emojiSize={12} />
              </button>
            </div>
          </div>

          {/* Kartu Game Ludo King (Grid 2 Kolom, ukuran sama persis <= 200px) */}
          <div
            role="button"
            tabIndex={0}
            onClick={showLudoKingPage}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                showLudoKingPage();
              }
            }}
            className="menu-card-bucin flex max-h-[200px] flex-col overflow-hidden rounded-[18px] border border-[#FFD6E7] bg-white text-left shadow-[0_8px_20px_rgba(255,46,126,0.12)] cursor-pointer"
          >
            {/* Cover Gambar 94px (Gradient pink ke ungu + papan Ludo mini + 👑🎲) */}
            <div className="relative h-[94px] w-full shrink-0 overflow-hidden bg-gradient-to-br from-[#FF7AB8] via-[#F472B6] to-[#A855F7] px-2 py-1.5">
              <div className="pointer-events-none absolute -left-4 -top-4 h-14 w-14 rounded-full bg-white/20" />
              <div className="pointer-events-none absolute -bottom-5 -right-4 h-16 w-16 rounded-full bg-white/15" />

              {/* Badge pojok kanan atas: MAIN */}
              <span className="absolute right-1.5 top-1.5 z-20 rounded-full bg-[#FF2E7E] px-2 py-0.5 text-[10px] font-extrabold leading-none text-white shadow-sm ring-1 ring-white/80">
                {savedLudoMeta ? 'AKTIF' : 'MAIN'}
              </span>

              <div className="relative z-10 flex h-full w-full items-center justify-center gap-1.5">
                <div className="flex h-6 w-6 -rotate-12 items-center justify-center rounded-lg bg-white/90 shadow-sm">
                  <AppleEmoji emoji="👑" size={14} />
                </div>

                {/* Papan Ludo Mini 4 Base + Cross */}
                <div className="relative grid h-[74px] w-[74px] shrink-0 grid-cols-5 grid-rows-5 overflow-hidden rounded-xl border border-white/95 bg-white shadow-md">
                  {/* Kuning (kiri atas 2x2) */}
                  <div className="col-span-2 row-span-2 flex items-center justify-center border-[0.5px] border-white bg-[#FACC15] p-1">
                    <div className="grid h-full w-full grid-cols-2 gap-0.5 rounded bg-white/90 p-0.5">
                      <span className="rounded-full bg-[#FACC15]" />
                      <span className="rounded-full bg-[#FACC15]" />
                      <span className="rounded-full bg-[#FACC15]" />
                      <span className="rounded-full bg-[#FACC15]" />
                    </div>
                  </div>
                  {/* Jalur atas */}
                  <div className="flex items-center justify-center border-[0.5px] border-[#FFD6E7] bg-white">
                    <span className="h-1.5 w-1.5 rounded-full bg-[#22C55E]" />
                  </div>
                  {/* Hijau (kanan atas 2x2) */}
                  <div className="col-span-2 row-span-2 flex items-center justify-center border-[0.5px] border-white bg-[#22C55E] p-1">
                    <div className="grid h-full w-full grid-cols-2 gap-0.5 rounded bg-white/90 p-0.5">
                      <span className="rounded-full bg-[#22C55E]" />
                      <span className="rounded-full bg-[#22C55E]" />
                      <span className="rounded-full bg-[#22C55E]" />
                      <span className="rounded-full bg-[#22C55E]" />
                    </div>
                  </div>
                  {/* Baris tengah cross */}
                  <div className="border-[0.5px] border-[#FFD6E7] bg-white" />
                  <div className="border-[0.5px] border-[#FFD6E7] bg-[#FEF08A]" />
                  {/* Tengah finish */}
                  <div className="flex items-center justify-center bg-gradient-to-br from-[#EF4444] via-[#FACC15] to-[#3B82F6]">
                    <AppleEmoji emoji="👑" size={9} />
                  </div>
                  <div className="border-[0.5px] border-[#FFD6E7] bg-[#DBEAFE]" />
                  <div className="border-[0.5px] border-[#FFD6E7] bg-white" />
                  {/* Merah (kiri bawah 2x2) */}
                  <div className="col-span-2 row-span-2 flex items-center justify-center border-[0.5px] border-white bg-[#EF4444] p-1">
                    <div className="grid h-full w-full grid-cols-2 gap-0.5 rounded bg-white/90 p-0.5">
                      <span className="rounded-full bg-[#EF4444]" />
                      <span className="rounded-full bg-[#EF4444]" />
                      <span className="rounded-full bg-[#EF4444]" />
                      <span className="rounded-full bg-[#EF4444]" />
                    </div>
                  </div>
                  {/* Jalur bawah */}
                  <div className="flex items-center justify-center border-[0.5px] border-[#FFD6E7] bg-[#FEE2E2]">
                    <span className="h-1.5 w-1.5 rounded-full bg-[#EF4444]" />
                  </div>
                  {/* Biru (kanan bawah 2x2) */}
                  <div className="col-span-2 row-span-2 flex items-center justify-center border-[0.5px] border-white bg-[#3B82F6] p-1">
                    <div className="grid h-full w-full grid-cols-2 gap-0.5 rounded bg-white/90 p-0.5">
                      <span className="rounded-full bg-[#3B82F6]" />
                      <span className="rounded-full bg-[#3B82F6]" />
                      <span className="rounded-full bg-[#3B82F6]" />
                      <span className="rounded-full bg-[#3B82F6]" />
                    </div>
                  </div>
                </div>

                <div className="flex h-6 w-6 rotate-12 items-center justify-center rounded-lg bg-white/90 shadow-sm">
                  <AppleEmoji emoji="🎲" size={14} />
                </div>
              </div>
            </div>

            {/* Di bawah cover: padding 10px, 14px title, 11px subtitle, 32px tombol */}
            <div className="flex flex-1 flex-col justify-between gap-1.5 p-[10px]">
              <div className="min-w-0">
                <h2 className="font-display flex items-center gap-1 truncate text-[14px] font-extrabold leading-tight text-[#2D0A1E]">
                  <AppleTextWithEmojis text="👑 Ludo King" emojiSize={14} />
                </h2>
                <p className="mt-0.5 truncate text-[11px] font-semibold leading-tight text-[#8A6A7A]">
                  keiz mabar seru
                </p>
              </div>

              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  showLudoKingPage();
                }}
                className="btn-bucin flex h-[32px] w-full shrink-0 items-center justify-center gap-1 rounded-[10px] bg-gradient-to-r from-[#FF2E7E] to-[#FF62A4] px-3 text-[12px] font-extrabold text-white shadow-sm cursor-pointer"
              >
                <AppleTextWithEmojis text="▶️ Main" emojiSize={12} />
              </button>
            </div>
          </div>
        </main>
      </div>
    );
  }

  // ---------- RENDER: #page-ular-tangga ----------
  const activeDetailChat = reactionDetailMsgId
    ? activeChats.find((m) => m.id === reactionDetailMsgId)
    : undefined;

  return (
    <section
      id="page-ular-tangga"
      className="animate-slide-in-right flex min-h-full w-full flex-col gap-3 pb-4"
    >
      {/* Top Bar with [⬅️ Kembali] back to Halaman Game without resetting active room */}
      <div className="flex items-center justify-between gap-2 pt-1">
        <button
          type="button"
          onClick={() => {
            soundFX.playClick();
            setActiveGamePage('menu');
          }}
          className="btn-bucin flex items-center gap-1.5 rounded-full border border-[#FFD6E7] bg-white px-3.5 py-2 text-xs font-extrabold text-[#2D0A1E] shadow-sm cursor-pointer"
        >
          <AppleTextWithEmojis text="⬅️ Kembali" emojiSize={14} />
        </button>

        {room && (
          <span className="rounded-full border border-[#FFD6E7] bg-[#FFF5F9] px-3 py-1.5 text-[11px] font-extrabold text-[#D81B6E]">
            {isBotRoom ? 'Mode Bot Solo' : `Room ${room.room_code}`}
          </span>
        )}
      </div>

      {/* A. SETUP VIEW (No active room) */}
      {!room && (
        <div className="keiz-sticker-card space-y-3.5 rounded-3xl bg-white p-4">
          <div className="text-center">
            <h2 className="font-display text-[20px] font-extrabold text-[#D81B6E]">
              KEIZ BUCIN - Ular Tangga
            </h2>
            <p className="mt-0.5 text-[11px] font-bold text-[#8A6A7A]">
              Main bareng real-time berdua
            </p>
          </div>

          {/* Avatar sesuai foto profil web KEIZ BUCIN */}
          <div className="flex items-center gap-3 rounded-2xl border border-[#FFD6E7] bg-[#FFF5F9] p-3">
            {renderProfileAvatar(currentUser, playerName || currentUser, 'h-12 w-12')}
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-extrabold uppercase tracking-wide text-[#8A6A7A]">
                Akun: {currentUser}
              </p>
              <input
                type="text"
                value={playerName}
                onChange={(e) => {
                  setPlayerName(e.target.value);
                  setSetupError(null);
                }}
                placeholder="Nama kamu..."
                maxLength={24}
                className="mt-1 h-9 w-full rounded-xl border border-[#FFD6E7] bg-white px-3 text-xs font-bold text-[#2D0A1E] placeholder-[#9A7A8A] focus:border-[#FF2E7E] focus:outline-none"
              />
            </div>
          </div>

          {setupError && (
            <div className="rounded-2xl border border-rose-200 bg-rose-50 px-3 py-2 text-center text-xs font-extrabold text-rose-600">
              {setupError}
            </div>
          )}

          <div className="grid grid-cols-2 gap-2.5">
            <button
              type="button"
              disabled={isRoomBusy}
              onClick={() => void createRoom()}
              className="keiz-btn-primary btn-bucin flex min-h-[50px] items-center justify-center px-3 text-xs font-extrabold disabled:opacity-50 cursor-pointer"
            >
              {isRoomBusy ? 'Bikin room...' : 'Buat Room'}
            </button>
            <button
              type="button"
              disabled={isRoomBusy}
              onClick={() => {
                soundFX.playClick();
                setSetupError(null);
                setShowJoinInput((v) => !v);
              }}
              className="btn-bucin flex min-h-[50px] items-center justify-center rounded-full border-2 border-[#FF7AB8] bg-white px-3 text-xs font-extrabold text-[#D81B6E] shadow-sm cursor-pointer"
            >
              Join Room
            </button>
          </div>

          <button
            type="button"
            disabled={isRoomBusy}
            onClick={startBotGame}
            className="btn-bucin flex min-h-[46px] w-full items-center justify-center gap-2 rounded-full border border-[#FFD6E7] bg-[#FFF5F9] px-4 text-xs font-extrabold text-[#D81B6E] shadow-xs cursor-pointer"
          >
            <Bot className="h-4 w-4 text-[#FF2E7E]" />
            <span>Main Lawan Bot (Tes Solo)</span>
          </button>

          {showJoinInput && (
            <div className="animate-bubble-pop flex items-center gap-2 rounded-2xl border border-[#FFD6E7] bg-[#FFF5F9] p-2.5">
              <input
                type="text"
                value={joinCodeInput}
                onChange={(e) => {
                  setJoinCodeInput(e.target.value.toUpperCase());
                  setSetupError(null);
                }}
                placeholder="KEIZ-A1B2"
                maxLength={12}
                className="h-10 flex-1 rounded-xl border border-[#FFD6E7] bg-white px-3 text-xs font-extrabold uppercase tracking-wider text-[#2D0A1E] placeholder-[#9A7A8A] focus:border-[#FF2E7E] focus:outline-none"
              />
              <button
                type="button"
                disabled={isRoomBusy}
                onClick={() => void joinRoom()}
                className="btn-bucin h-10 rounded-xl bg-[#FF2E7E] px-4 text-xs font-extrabold text-white shadow cursor-pointer disabled:opacity-50"
              >
                Masuk
              </button>
            </div>
          )}
        </div>
      )}

      {/* B. LOBBY VIEW */}
      {room && room.status === 'waiting' && (
        <div className="keiz-sticker-card space-y-3.5 rounded-3xl bg-white p-4">
          <div className="rounded-2xl border border-[#FFD6E7] bg-gradient-to-br from-[#FFF2F7] to-[#FFE3EE] p-3.5 text-center">
            <p className="text-[10px] font-extrabold uppercase tracking-wider text-[#8A6A7A]">
              Kode Room Mabar
            </p>
            <p className="font-display mt-1 text-[28px] font-extrabold tracking-widest text-[#D81B6E]">
              {room.room_code}
            </p>
            <button
              type="button"
              onClick={() => {
                soundFX.playPop();
                navigator.clipboard?.writeText(room.room_code).catch(() => {});
                setCopiedCodeToast('Kode disalin!');
                window.setTimeout(() => setCopiedCodeToast(null), 1600);
              }}
              className="btn-bucin mt-2 inline-flex items-center gap-1.5 rounded-full border border-[#FFD6E7] bg-white px-3.5 py-1.5 text-[11px] font-extrabold text-[#2D0A1E] shadow-xs cursor-pointer"
            >
              <Copy className="h-3.5 w-3.5 text-[#D81B6E]" />
              <span>{copiedCodeToast || 'Salin Kode'}</span>
            </button>
          </div>

          {/* 2 Player Cards Side-by-Side */}
          <div className="grid grid-cols-2 gap-2.5">
            {([
              { slot: 'player1' as PlayerSlot, label: 'Player 1', data: p1 },
              { slot: 'player2' as PlayerSlot, label: 'Player 2', data: p2 },
            ]).map((item) => (
              <div
                key={item.slot}
                className="flex flex-col items-center rounded-2xl border border-[#FFD6E7] bg-[#FFF8FA] p-3 text-center"
              >
                <span className="text-[10px] font-extrabold text-[#8A6A7A]">
                  {item.label}
                </span>
                <div className="my-2">
                  {item.data ? (
                    renderProfileAvatar(
                      item.data.avatar_emoji,
                      item.data.name,
                      'h-12 w-12'
                    )
                  ) : (
                    <div className="flex h-12 w-12 items-center justify-center rounded-full border-2 border-[#FFD6E7] bg-white shadow-sm">
                      <AppleEmoji emoji="⏳" size={22} />
                    </div>
                  )}
                </div>
                <p className="w-full truncate text-xs font-extrabold text-[#2D0A1E]">
                  {item.data?.name || 'Menunggu...'}
                </p>
                <p className="mt-1 text-[11px] font-bold text-[#8A6A7A]">
                  <AppleTextWithEmojis
                    text={
                      item.data
                        ? item.data.is_ready
                          ? 'Ready ✅'
                          : 'Belum Ready ⏳'
                        : 'Kosong'
                    }
                    emojiSize={12}
                  />
                </p>
              </div>
            ))}
          </div>

          <div className="flex flex-col gap-2">
            <button
              type="button"
              disabled={amIReady}
              onClick={() => void setReady()}
              className={`btn-bucin flex min-h-[46px] w-full items-center justify-center rounded-full text-xs font-extrabold shadow-sm ${
                amIReady
                  ? 'border border-emerald-200 bg-emerald-50 text-emerald-700 cursor-default'
                  : 'bg-[#FF2E7E] text-white cursor-pointer'
              }`}
            >
              <AppleTextWithEmojis
                text={amIReady ? 'Udah Ready ✅' : 'Saya Ready'}
                emojiSize={15}
              />
            </button>

            {bothReady && (
              <button
                type="button"
                onClick={() => void startGame()}
                className="keiz-btn-primary btn-bucin animate-bubble-pop flex min-h-[50px] w-full items-center justify-center text-sm font-extrabold cursor-pointer"
              >
                <AppleTextWithEmojis text="MULAI MAIN 🎲" emojiSize={16} />
              </button>
            )}

            <button
              type="button"
              onClick={() => void leaveRoom()}
              className="flex min-h-[40px] w-full items-center justify-center gap-1.5 rounded-full border border-rose-200 bg-rose-50 text-xs font-extrabold text-rose-600 cursor-pointer"
            >
              <LogOut className="h-3.5 w-3.5" />
              <span>Keluar Room</span>
            </button>
          </div>
        </div>
      )}

      {/* C. PLAYING / FINISHED VIEW */}
      {room && (room.status === 'playing' || room.status === 'finished') && (
        <div className="relative space-y-2.5">
          {/* Status + Turn + Progress Bars */}
          <div className="keiz-card space-y-2 rounded-3xl bg-white p-3">
            <div className="flex items-center justify-between gap-2">
              <div
                className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-extrabold ${
                  isMyTurn
                    ? 'border border-[#FF9EC7] bg-[#FFE3EE] text-[#D81B6E]'
                    : 'border border-slate-200 bg-slate-100 text-slate-600'
                }`}
              >
                <span
                  className={`h-2 w-2 rounded-full ${
                    isMyTurn ? 'bg-[#FF2E7E] animate-pulse' : 'bg-slate-400'
                  }`}
                />
                <span>Giliran: {currentTurnName}</span>
              </div>

              <button
                type="button"
                onClick={() => void leaveRoom()}
                className="rounded-full border border-rose-200 bg-rose-50 px-2.5 py-1 text-[10px] font-extrabold text-rose-600 cursor-pointer"
              >
                {isBotRoom ? 'Keluar Bot' : 'Keluar Room'}
              </button>
            </div>

            <p className="text-center text-xs font-extrabold text-[#2D0A1E]">
              Posisi Kamu: {myPos} | {isBotRoom ? 'Posisi Bot' : 'Posisi Pasangan'}:{' '}
              {partnerPos}
            </p>

            {/* Progress Bars to 100 */}
            <div className="grid grid-cols-2 gap-2">
              {[
                {
                  label: mePlayer?.name || 'Kamu',
                  pos: myPos,
                  bar:
                    currentUser === 'faiz'
                      ? 'from-[#60A5FA] to-[#3B82F6]'
                      : 'from-[#FF7AB8] to-[#FF2E7E]',
                },
                {
                  label: partnerPlayer?.name || (isBotRoom ? 'Bot Keiz' : 'Pasangan'),
                  pos: partnerPos,
                  bar:
                    isBotRoom
                      ? 'from-[#A78BFA] to-[#7C3AED]'
                      : currentUser === 'faiz'
                      ? 'from-[#FF7AB8] to-[#FF2E7E]'
                      : 'from-[#60A5FA] to-[#3B82F6]',
                },
              ].map((item, idx) => (
                <div key={idx} className="space-y-1">
                  <div className="flex items-center justify-between text-[10px] font-bold text-[#8A6A7A]">
                    <span className="truncate">{item.label}</span>
                    <span className="tabular-nums">{item.pos}/100</span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-[#FFE3EE]">
                    <div
                      className={`h-full rounded-full bg-gradient-to-r ${item.bar} transition-all duration-300`}
                      style={{ width: `${Math.min(100, item.pos)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* 2-Second Snake/Ladder Toast Above Board */}
          {boardToast && (
            <div className="animate-bubble-pop rounded-2xl border border-[#FF9EC7] bg-white px-3 py-2 text-center text-xs font-extrabold text-[#D81B6E] shadow-md">
              <AppleTextWithEmojis text={boardToast} emojiSize={15} />
            </div>
          )}

          {/* 10x10 Board */}
          {renderBoard()}

          {/* Big 80x80+ Dice Control Centered Below Board */}
          <div className="keiz-card flex flex-col items-center justify-center gap-1.5 rounded-3xl bg-white p-3">
            {bonusSixBanner && (
              <p className="animate-bubble-pop text-xs font-extrabold text-[#D81B6E]">
                Dapet 6! Lempar lagi!
              </p>
            )}

            <button
              type="button"
              disabled={!isMyTurn || isRolling || isAnimatingMove}
              onClick={() => void rollDice()}
              aria-label="Lempar dadu"
              className={`btn-bucin flex h-[84px] min-h-[80px] w-[84px] min-w-[80px] flex-col items-center justify-center rounded-3xl shadow-lg ${
                isRolling ? 'ut-dice-rolling bg-[#FF2E7E] text-white' : ''
              } ${
                isMyTurn && !isRolling && !isAnimatingMove
                  ? 'bg-gradient-to-br from-[#FF2E7E] to-[#FF7AB8] text-white cursor-pointer'
                  : !isRolling
                  ? 'bg-slate-200 text-slate-400 cursor-not-allowed'
                  : ''
              }`}
            >
              <span className="text-[36px] leading-none">
                {UT_DICE_FACES[Math.max(0, Math.min(5, diceDisplay - 1))]}
              </span>
              <span className="mt-1 text-[10px] font-extrabold">
                {isRolling ? '...' : `Dadu ${diceDisplay}`}
              </span>
            </button>

            <p className="text-[11px] font-extrabold text-[#8A6A7A]">
              {isRolling
                ? 'Mengocok dadu...'
                : isMyTurn
                ? 'Tap dadu untuk lempar!'
                : isBotRoom
                ? 'Bot Keiz lagi jalan...'
                : 'Menunggu Giliran Pasangan...'}
            </p>
          </div>

          {/* Game Move Log */}
          <div className="keiz-card rounded-2xl bg-white p-3">
            <p className="mb-1.5 text-[11px] font-extrabold text-[#D81B6E]">
              Log Permainan
            </p>
            <div className="max-h-[110px] space-y-1 overflow-y-auto pr-1 text-[11px] font-semibold text-[#5C3A49]">
              {moves.length === 0 ? (
                <p className="text-[#9A7A8A]">Belum ada lemparan dadu.</p>
              ) : (
                moves.map((mv, idx) => (
                  <div
                    key={mv.id || idx}
                    className="rounded-lg bg-[#FFF5F9] px-2.5 py-1"
                  >
                    {formatMoveLog(mv)}
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Winner Overlay with Confetti */}
          {room.status === 'finished' && (
            <div className="fixed inset-0 z-50 flex items-center justify-center overflow-hidden bg-[#2D0A1E]/55 p-4 backdrop-blur-sm">
              {/* Falling Confetti */}
              {CONFETTI_PIECES.map((cf, i) => (
                <span
                  key={i}
                  style={{
                    left: cf.left,
                    top: '-24px',
                    backgroundColor: cf.color,
                    animationDelay: cf.delay,
                    animationDuration: cf.duration,
                  }}
                  className="ut-confetti-piece pointer-events-none fixed h-3 w-2 rounded-sm"
                />
              ))}

              <div className="keiz-card animate-slide-up-bounce relative w-full max-w-[360px] space-y-4 bg-white p-6 text-center shadow-2xl">
                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-[#FFF2F7] shadow-inner">
                  <AppleEmoji emoji="🏆" size={40} />
                </div>

                <h3 className="font-display text-[22px] font-extrabold text-[#D81B6E]">
                  <AppleTextWithEmojis
                    text={
                      room.winner === mySlot
                        ? 'KAMU MENANG! 🏆'
                        : `${String(winnerName).toUpperCase()} MENANG! 🏆`
                    }
                    emojiSize={22}
                  />
                </h3>

                <div className="flex flex-col gap-2">
                  <button
                    type="button"
                    onClick={() => void handlePlayAgain()}
                    className="keiz-btn-primary btn-bucin flex min-h-[46px] w-full items-center justify-center gap-1.5 text-xs font-extrabold cursor-pointer"
                  >
                    <RotateCcw className="h-4 w-4" />
                    <span>Main Lagi</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleBackToLobby()}
                    className="btn-bucin flex min-h-[44px] w-full items-center justify-center rounded-full border border-[#FFD6E7] bg-[#FFF5F9] text-xs font-extrabold text-[#2D0A1E] cursor-pointer"
                  >
                    {isBotRoom ? 'Kembali ke Setup' : 'Balik ke Lobby'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 3. CHAT MABAR ULAR TANGGA (ALWAYS VISIBLE BELOW, 320px SCROLLABLE BOX) */}
      <div className="keiz-card relative flex h-[320px] shrink-0 flex-col overflow-hidden bg-white">
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-[#FFD6E7] bg-[#FFF5F9] px-3 py-2">
          <p className="text-xs font-extrabold text-[#D81B6E]">
            <AppleTextWithEmojis text="💬 chat mabar ular tangga" emojiSize={14} />
          </p>
          <span className="rounded-full border border-[#FFD6E7] bg-white px-2 py-0.5 text-[9px] font-extrabold text-[#8A6A7A]">
            {room ? `Room ${room.room_code}` : 'Pra-Main'}
          </span>
        </div>

        {/* Scrollable Chat Messages */}
        <div
          onClick={() => {
            setActiveBubbleMenu(null);
            setShowInputEmojiPicker(false);
          }}
          className="flex min-h-0 flex-1 flex-col space-y-2 overflow-y-auto bg-[#FFFDFE] p-3"
        >
          {activeChats.length === 0 && (
            <div className="my-auto mx-auto rounded-2xl border border-[#FFD6E7] bg-[#FFF5F9] px-4 py-2.5 text-center">
              <p className="text-xs font-extrabold text-[#5C3A49]">
                Belum ada chat mabar nih
              </p>
              <p className="mt-0.5 text-[10px] font-semibold text-[#8A6A7A]">
                Ngobrol bebas kapan aja sambil main!
              </p>
            </div>
          )}

          {activeChats.map((msg) => {
            const isMine = msg.senderRole === currentUser;
            const bubbleColor =
              msg.senderRole === 'faiz' ? 'bg-[#3B82F6]' : 'bg-[#FF4D8D]';

            return (
              <div
                key={msg.id}
                onContextMenu={(e) => {
                  e.preventDefault();
                  soundFX.playClick();
                  setActiveBubbleMenu(msg.id);
                }}
                onTouchStart={(e) => {
                  longPressFiredRef.current = false;
                  touchStartX.current = e.touches[0].clientX;
                  touchStartY.current = e.touches[0].clientY;
                  longPressTimer.current = window.setTimeout(() => {
                    longPressFiredRef.current = true;
                    soundFX.playClick();
                    setActiveBubbleMenu(msg.id);
                  }, 500);
                }}
                onTouchMove={(e) => {
                  const startX = touchStartX.current;
                  const startY = touchStartY.current;
                  const curX = e.touches[0].clientX;
                  const curY = e.touches[0].clientY;
                  if (
                    longPressTimer.current &&
                    startX !== null &&
                    startY !== null &&
                    (Math.abs(curX - startX) > 8 || Math.abs(curY - startY) > 8)
                  ) {
                    clearTimeout(longPressTimer.current);
                    longPressTimer.current = null;
                  }
                  if (
                    startX !== null &&
                    startY !== null &&
                    curX - startX > 48 &&
                    Math.abs(curY - startY) < 32
                  ) {
                    touchStartX.current = null;
                    touchStartY.current = null;
                    soundFX.playClick();
                    setReplyingTo(msg);
                  }
                }}
                onTouchEnd={() => {
                  if (longPressTimer.current) {
                    clearTimeout(longPressTimer.current);
                    longPressTimer.current = null;
                  }
                  touchStartX.current = null;
                  touchStartY.current = null;
                }}
                className={`animate-pop-up relative flex flex-col ${
                  isMine ? 'items-end' : 'items-start'
                } ${msg.react ? 'mb-2' : ''}`}
              >
                <div
                  data-ut-chat-bubble="true"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (longPressFiredRef.current) {
                      longPressFiredRef.current = false;
                      return;
                    }
                    soundFX.playClick();
                    setActiveBubbleMenu((cur) => (cur === msg.id ? null : msg.id));
                  }}
                  className={`relative max-w-[84%] cursor-pointer rounded-2xl px-3 py-2 text-xs leading-relaxed text-white shadow-sm ${bubbleColor} ${
                    isMine ? 'rounded-br-[4px]' : 'rounded-bl-[4px]'
                  }`}
                >
                  {msg.replyToText && (
                    <div className="mb-1 rounded-lg border-l-[3px] border-white/80 bg-black/15 px-2 py-1 text-[10px]">
                      <p className="font-extrabold opacity-90">
                        {msg.replyToSender === 'faiz' ? 'faiz' : 'kenat'}
                      </p>
                      <p className="line-clamp-1 opacity-85">
                        <AppleTextWithEmojis text={msg.replyToText} emojiSize={13} />
                      </p>
                    </div>
                  )}

                  <span>
                    <AppleTextWithEmojis text={msg.text} emojiSize={17} />
                  </span>

                  <div className="mt-0.5 flex items-center justify-end gap-1 text-[9px] text-white/80">
                    <span>{formatTime(msg.created_at)}</span>
                    {isMine && <Check className="h-2.5 w-2.5 text-white/80" />}
                  </div>

                  <ReactionPill
                    rawReact={msg.react}
                    msgSender={msg.senderRole}
                    isMine={isMine}
                    onClick={() => {
                      soundFX.playClick();
                      setActiveBubbleMenu(null);
                      setReactionDetailMsgId(msg.id);
                    }}
                  />
                </div>

                {/* Quick React & Reply/Copy/Delete Bubble Menu */}
                {activeBubbleMenu === msg.id && (
                  <div
                    data-ut-bubble-menu="true"
                    onClick={(e) => e.stopPropagation()}
                    className={`animate-bubble-pop z-30 mt-1.5 flex max-w-[270px] flex-col gap-1.5 rounded-2xl border border-[#FFD6E7] bg-white p-2 text-[11px] font-bold shadow-xl ${
                      isMine ? 'items-end' : 'items-start'
                    }`}
                  >
                    <div className="flex flex-wrap items-center gap-1">
                      {QUICK_REACT_EMOJIS.map((em) => {
                        const myReact = getUserReaction(
                          msg.react,
                          currentUser,
                          msg.senderRole
                        );
                        return (
                          <button
                            key={em}
                            type="button"
                            onClick={(e) => {
                              const rect = e.currentTarget.getBoundingClientRect();
                              void applyChatReaction(msg, em, {
                                x: rect.left + rect.width / 2,
                                y: rect.top + rect.height / 2,
                              });
                            }}
                            className={`flex h-8 w-8 items-center justify-center rounded-full transition-transform active:scale-90 cursor-pointer ${
                              myReact === em
                                ? 'bg-[#FFE3EE] ring-1 ring-[#FF2E7E]'
                                : 'bg-[#FFF5F9]'
                            }`}
                          >
                            <AppleEmoji emoji={em} size={19} />
                          </button>
                        );
                      })}
                      <button
                        type="button"
                        onClick={() => {
                          soundFX.playClick();
                          setActiveBubbleMenu(null);
                          setReactTargetMsg(msg);
                        }}
                        aria-label="Pilih emot lainnya"
                        className="flex h-7 items-center gap-0.5 rounded-full bg-[#FFE3EE] px-2 text-[10px] font-extrabold text-[#D81B6E] cursor-pointer"
                      >
                        <Smile className="h-3.5 w-3.5" />
                        <span>+</span>
                      </button>
                    </div>

                    <div className="flex flex-wrap gap-1.5">
                      <button
                        type="button"
                        onClick={() => {
                          setReplyingTo(msg);
                          setActiveBubbleMenu(null);
                        }}
                        className="rounded-lg bg-[#FFF2F7] px-2.5 py-1 text-[#2D0A1E] cursor-pointer"
                      >
                        Balas
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard?.writeText(msg.text).catch(() => {});
                          setActiveBubbleMenu(null);
                        }}
                        className="rounded-lg bg-[#FFF2F7] px-2.5 py-1 text-[#2D0A1E] cursor-pointer"
                      >
                        Salin
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleDeleteChatMsg(msg.id)}
                        className="rounded-lg bg-rose-50 px-2.5 py-1 text-rose-600 cursor-pointer"
                      >
                        Hapus
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
          <div ref={chatEndRef} />
        </div>

        {/* Replying-to Banner */}
        {replyingTo && (
          <div className="flex shrink-0 items-center justify-between border-t border-[#FFD6E7] bg-[#FFF5F9] px-3 py-1.5 text-[11px]">
            <div className="min-w-0 flex-1 border-l-[3px] border-[#FF2E7E] pl-2">
              <p className="text-[10px] font-extrabold text-[#E91E7A]">
                Membalas {replyingTo.senderRole === 'faiz' ? 'faiz' : 'kenat'}
              </p>
              <p className="truncate text-[#8A6A7A]">
                <AppleTextWithEmojis text={replyingTo.text} emojiSize={13} />
              </p>
            </div>
            <button
              type="button"
              onClick={() => setReplyingTo(null)}
              className="ml-2 flex h-6 w-6 items-center justify-center rounded-full bg-white text-[#8A6A7A] cursor-pointer"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

        {/* Inline Apple Emoji Picker inside chat box */}
        {showInputEmojiPicker && (
          <div
            data-ut-chat-input="true"
            className="absolute inset-x-0 bottom-[56px] z-30 border-t border-[#FFD6E7] bg-white shadow-lg"
          >
            <EmojiPicker
              width="100%"
              height={220}
              searchPlaceholder="Cari emot..."
              emojiStyle={EmojiStyle.APPLE}
              theme={Theme.LIGHT}
              lazyLoadEmojis
              previewConfig={{ showPreview: false }}
              onEmojiClick={(emojiData: EmojiClickData) =>
                setChatInput((prev) => `${prev}${emojiData.emoji}`)
              }
            />
          </div>
        )}

        {/* Input Row */}
        <form
          data-ut-chat-input="true"
          onSubmit={(e) => void sendChat(e)}
          className="flex shrink-0 items-center gap-1.5 border-t border-[#FFD6E7] bg-white p-2"
        >
          <button
            type="button"
            onClick={() => {
              soundFX.playClick();
              setShowInputEmojiPicker((v) => !v);
            }}
            aria-label="Pilih emot chat mabar"
            className={`btn-bucin flex h-10 w-10 shrink-0 items-center justify-center rounded-full border cursor-pointer ${
              showInputEmojiPicker
                ? 'border-[#FF2E7E] bg-[#FFE3EE] text-[#D81B6E]'
                : 'border-[#FFD6E7] bg-[#FFF5F9] text-[#FF4D8D]'
            }`}
          >
            <Smile className="h-4 w-4" />
          </button>

          <input
            type="text"
            value={chatInput}
            onChange={(e) => setChatInput(e.target.value)}
            placeholder={
              currentUser === 'faiz' ? 'ketik buat kenat...' : 'ketik buat faiz...'
            }
            className="h-10 min-h-[40px] flex-1 rounded-full border border-[#FFD6E7] bg-[#FFF2F7] px-3.5 text-xs font-semibold text-[#2D0A1E] placeholder-[#9A7A8A] focus:border-[#FF2E7E] focus:outline-none"
          />

          <button
            type="submit"
            aria-label="Kirim chat mabar"
            className={`btn-bucin flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-white shadow-sm cursor-pointer ${
              currentUser === 'faiz' ? 'bg-[#3B82F6]' : 'bg-[#FF4D8D]'
            }`}
          >
            <Send className="h-4 w-4" />
          </button>
        </form>
      </div>

      {/* Full Apple Emoji Picker Modal for Reactions (ALL emojis!) */}
      {reactTargetMsg && (
        <div
          onClick={() => setReactTargetMsg(null)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#2D0A1E]/45 p-3 backdrop-blur-sm"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="animate-slide-up-bounce w-full max-w-[406px] overflow-hidden rounded-[24px] border border-[#FFD6E7] bg-white p-3 shadow-2xl"
          >
            <div className="mb-2 flex items-center justify-between px-1">
              <div className="min-w-0 flex-1 pr-2">
                <p className="text-xs font-extrabold text-[#D81B6E]">
                  Pilih react emot
                </p>
                <p className="truncate text-[11px] font-semibold text-[#8A6A7A]">
                  <AppleTextWithEmojis text={reactTargetMsg.text} emojiSize={14} />
                </p>
              </div>
              {(() => {
                const myReact = getUserReaction(
                  reactTargetMsg.react,
                  currentUser,
                  reactTargetMsg.senderRole
                );
                if (!myReact) return null;
                return (
                  <button
                    type="button"
                    onClick={() => void applyChatReaction(reactTargetMsg, myReact)}
                    className="mr-1.5 shrink-0 rounded-full border border-rose-200 bg-rose-50 px-2.5 py-1 text-[10px] font-extrabold text-rose-600 cursor-pointer"
                  >
                    Hapus react
                  </button>
                );
              })()}
              <button
                type="button"
                onClick={() => setReactTargetMsg(null)}
                aria-label="Tutup picker react"
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#FFF2F7] text-[#8A6A7A] cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <EmojiPicker
              width="100%"
              height={340}
              searchPlaceholder="Cari emot..."
              emojiStyle={EmojiStyle.APPLE}
              theme={Theme.LIGHT}
              lazyLoadEmojis
              previewConfig={{ showPreview: false }}
              onEmojiClick={(emojiData: EmojiClickData, event: MouseEvent) =>
                void applyChatReaction(reactTargetMsg, emojiData.emoji, {
                  x: event.clientX || 215,
                  y: event.clientY || 420,
                })
              }
            />
          </div>
        </div>
      )}

      {/* WhatsApp / Telegram Reaction Details Modal */}
      {activeDetailChat &&
        getReactionEntries(activeDetailChat.react, activeDetailChat.senderRole)
          .length > 0 && (
          <ReactionDetailsModal
            msg={{
              id: activeDetailChat.id,
              sender: activeDetailChat.senderRole,
              receiver: activeDetailChat.senderRole === 'faiz' ? 'kenat' : 'faiz',
              message: activeDetailChat.text,
              type: 'text',
              is_read: true,
              created_at: activeDetailChat.created_at,
              react: activeDetailChat.react,
            }}
            currentUser={currentUser}
            profile={resolvedProfile}
            onToggleMyReaction={(emoji, pt) =>
              void applyChatReaction(activeDetailChat, emoji, pt)
            }
            onOpenFullPicker={() => {
              setReactionDetailMsgId(null);
              setReactTargetMsg(activeDetailChat);
            }}
            onClose={() => setReactionDetailMsgId(null)}
          />
        )}
    </section>
  );
};

// =========================================================================
// LUDO KING (DITAMBAHKAN TANPA MENGUBAH ULAR TANGGA)
// =========================================================================

const LUDO_ROOM_STORAGE_KEY = 'keiz_ludo_king_active_room_v1';
const LUDO_BOT_ROOM_ID = '__LUDO_BOT_MODE__';
const LUDO_STATE_MARKER = '__KEIZ_LUDO_STATE__';
const LUDO_LOG_MARKER = '__KEIZ_LUDO_LOG__';

function loadSavedLudoRoom(): SavedActiveRoom | null {
  try {
    const raw = localStorage.getItem(LUDO_ROOM_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<SavedActiveRoom>;
    if (parsed.roomId && parsed.roomCode && parsed.playerSlot) {
      return {
        roomId: String(parsed.roomId),
        roomCode: String(parsed.roomCode),
        playerSlot: parsed.playerSlot === 'player2' ? 'player2' : 'player1',
        playerName: String(parsed.playerName || ''),
      };
    }
  } catch {
    // ignore
  }
  return null;
}

function saveLudoRoomToStorage(room: SavedActiveRoom | null): void {
  try {
    if (!room) {
      localStorage.removeItem(LUDO_ROOM_STORAGE_KEY);
    } else {
      localStorage.setItem(LUDO_ROOM_STORAGE_KEY, JSON.stringify(room));
    }
  } catch {
    // ignore
  }
}

// 52-square clockwise track on 15x15 Ludo board ([row, col], 0..14)
const LUDO_MAIN_TRACK: ReadonlyArray<readonly [number, number]> = [
  // 0..4: Merah arm going UP (col 6, row 13..9) - 0 is Merah START
  [13, 6], [12, 6], [11, 6], [10, 6], [9, 6],
  // 5..10: Left arm bottom going LEFT (row 8, col 5..0) - 8 is Safe Star
  [8, 5], [8, 4], [8, 3], [8, 2], [8, 1], [8, 0],
  // 11..12: Left edge going UP
  [7, 0], [6, 0],
  // 13..17: Left arm top going RIGHT (row 6, col 1..5) - 13 is Kuning START
  [6, 1], [6, 2], [6, 3], [6, 4], [6, 5],
  // 18..23: Top arm left going UP (col 6, row 5..0) - 21 is Safe Star
  [5, 6], [4, 6], [3, 6], [2, 6], [1, 6], [0, 6],
  // 24..25: Top edge going RIGHT
  [0, 7], [0, 8],
  // 26..30: Top arm right going DOWN (col 8, row 1..5) - 26 is Hijau START
  [1, 8], [2, 8], [3, 8], [4, 8], [5, 8],
  // 31..36: Right arm top going RIGHT (row 6, col 9..14) - 34 is Safe Star
  [6, 9], [6, 10], [6, 11], [6, 12], [6, 13], [6, 14],
  // 37..38: Right edge going DOWN
  [7, 14], [8, 14],
  // 39..43: Right arm bottom going LEFT (row 8, col 13..9) - 39 is Biru START
  [8, 13], [8, 12], [8, 11], [8, 10], [8, 9],
  // 44..49: Bottom arm right going DOWN (col 8, row 9..14) - 47 is Safe Star
  [9, 8], [10, 8], [11, 8], [12, 8], [13, 8], [14, 8],
  // 50..51: Bottom edge going LEFT
  [14, 7], [14, 6],
];

const LUDO_SAFE_INDICES = new Set<number>([0, 8, 13, 21, 26, 34, 39, 47]);
const LUDO_STAR_INDICES = new Set<number>([8, 21, 34, 47]);

const LUDO_START_OFFSET: Record<PlayerSlot, number> = {
  player1: 0,  // Merah (bottom-left)
  player2: 13, // Kuning (top-left)
};

// Colored 5-square Home Stretches (progress 51..55)
const LUDO_HOME_STRETCH: Record<PlayerSlot, ReadonlyArray<readonly [number, number]>> = {
  player1: [
    [13, 7], [12, 7], [11, 7], [10, 7], [9, 7],
  ],
  player2: [
    [7, 1], [7, 2], [7, 3], [7, 4], [7, 5],
  ],
};

// Base slot center coordinates in 0..15 grid units
const LUDO_BASE_CENTERS: Record<PlayerSlot, ReadonlyArray<{ cx: number; cy: number }>> = {
  player1: [
    { cx: 1.85, cy: 10.85 },
    { cx: 4.15, cy: 10.85 },
    { cx: 1.85, cy: 13.15 },
    { cx: 4.15, cy: 13.15 },
  ],
  player2: [
    { cx: 1.85, cy: 1.85 },
    { cx: 4.15, cy: 1.85 },
    { cx: 1.85, cy: 4.15 },
    { cx: 4.15, cy: 4.15 },
  ],
};

// Decorative bases (Hijau top-right, Biru bottom-right)
const LUDO_DECOR_BASES = [
  {
    color: '#22C55E',
    row: 0,
    col: 9,
    circles: [
      { cx: 10.85, cy: 1.85 },
      { cx: 13.15, cy: 1.85 },
      { cx: 10.85, cy: 4.15 },
      { cx: 13.15, cy: 4.15 },
    ],
  },
  {
    color: '#3B82F6',
    row: 9,
    col: 9,
    circles: [
      { cx: 10.85, cy: 10.85 },
      { cx: 13.15, cy: 10.85 },
      { cx: 10.85, cy: 13.15 },
      { cx: 13.15, cy: 13.15 },
    ],
  },
];

// Finish triangle centers in 0..15 grid units (inside center 3x3)
const LUDO_FINISH_CENTERS: Record<PlayerSlot, ReadonlyArray<{ cx: number; cy: number }>> = {
  player1: [
    { cx: 7.05, cy: 8.38 },
    { cx: 7.95, cy: 8.38 },
    { cx: 7.28, cy: 7.95 },
    { cx: 7.72, cy: 7.95 },
  ],
  player2: [
    { cx: 6.62, cy: 7.05 },
    { cx: 6.62, cy: 7.95 },
    { cx: 7.05, cy: 7.28 },
    { cx: 7.05, cy: 7.72 },
  ],
};

type LudoPiecesState = Record<PlayerSlot, [number, number, number, number]>;

interface LudoSyncPayload {
  version: number;
  pieces: LudoPiecesState;
  currentTurn: PlayerSlot;
  status: 'waiting' | 'playing' | 'finished';
  winner: string | null;
  lastDice?: number;
  lastMove?: {
    slot: PlayerSlot;
    pieceIndex: number;
    from: number;
    to: number;
    dice: number;
    captured?: Array<{ slot: PlayerSlot; pieceIndex: number }>;
  };
}

interface LudoMoveLogItem {
  id: string;
  text: string;
  created_at: string;
}

const DEFAULT_LUDO_PIECES: LudoPiecesState = {
  player1: [-1, -1, -1, -1],
  player2: [-1, -1, -1, -1],
};

function getLudoTrackIndex(slot: PlayerSlot, progress: number): number | null {
  if (progress < 0 || progress > 50) return null;
  return (LUDO_START_OFFSET[slot] + progress) % 52;
}

function getLudoTokenGridCenter(
  slot: PlayerSlot,
  pieceIndex: number,
  progress: number
): { cx: number; cy: number; key: string } {
  if (progress < 0) {
    const c = LUDO_BASE_CENTERS[slot][pieceIndex] ?? LUDO_BASE_CENTERS[slot][0];
    return { cx: c.cx, cy: c.cy, key: `base-${slot}-${pieceIndex}` };
  }
  if (progress >= 56) {
    const c = LUDO_FINISH_CENTERS[slot][pieceIndex] ?? LUDO_FINISH_CENTERS[slot][0];
    return { cx: c.cx, cy: c.cy, key: `fin-${slot}-${pieceIndex}` };
  }
  if (progress >= 51) {
    const stretch = LUDO_HOME_STRETCH[slot][progress - 51];
    if (stretch) {
      return {
        cx: stretch[1] + 0.5,
        cy: stretch[0] + 0.5,
        key: `home-${slot}-${progress}`,
      };
    }
  }
  const trackIdx = getLudoTrackIndex(slot, progress) ?? 0;
  const [r, c] = LUDO_MAIN_TRACK[trackIdx];
  return { cx: c + 0.5, cy: r + 0.5, key: `ring-${trackIdx}` };
}

function getLudoCellVisual(row: number, col: number): {
  bg: string;
  isStar: boolean;
  startColor?: string;
} {
  // Home stretches
  if (col === 7 && row >= 9 && row <= 13) return { bg: '#FEE2E2', isStar: false }; // Merah
  if (row === 7 && col >= 1 && col <= 5) return { bg: '#FEF9C3', isStar: false }; // Kuning
  if (col === 7 && row >= 1 && row <= 5) return { bg: '#DCFCE7', isStar: false }; // Hijau
  if (row === 7 && col >= 9 && col <= 13) return { bg: '#DBEAFE', isStar: false }; // Biru

  // Start squares
  if (row === 13 && col === 6) return { bg: '#EF4444', isStar: true, startColor: '#FFFFFF' };
  if (row === 6 && col === 1) return { bg: '#FACC15', isStar: true, startColor: '#FFFFFF' };
  if (row === 1 && col === 8) return { bg: '#22C55E', isStar: true, startColor: '#FFFFFF' };
  if (row === 8 && col === 13) return { bg: '#3B82F6', isStar: true, startColor: '#FFFFFF' };

  // Safe star squares on main ring
  const trackIdx = LUDO_MAIN_TRACK.findIndex(([r, c]) => r === row && c === col);
  if (trackIdx !== -1 && LUDO_STAR_INDICES.has(trackIdx)) {
    return { bg: '#FFF5F9', isStar: true };
  }

  return { bg: '#FFFFFF', isStar: false };
}

function foldLudoRawRows(
  rows: UlarTanggaRawChatRow[],
  currentUser: Role,
  mySlot: PlayerSlot | null
): {
  chats: ParsedGameChat[];
  latestState: LudoSyncPayload | null;
  logs: LudoMoveLogItem[];
} {
  const reactStateByMsgId: Record<string, Partial<Record<Role, string>>> = {};
  const deletedIds = new Set<string>();
  const messages: ParsedGameChat[] = [];
  let latestState: LudoSyncPayload | null = null;
  const logs: LudoMoveLogItem[] = [];

  for (const row of rows) {
    if (row.sender_name === LUDO_STATE_MARKER) {
      try {
        const parsed = JSON.parse(row.message) as LudoSyncPayload;
        if (parsed && parsed.pieces && typeof parsed.version === 'number') {
          if (!latestState || parsed.version >= latestState.version) {
            latestState = parsed;
          }
        }
      } catch {
        // ignore
      }
      continue;
    }

    if (row.sender_name === LUDO_LOG_MARKER) {
      logs.push({
        id: row.id,
        text: row.message,
        created_at: row.created_at,
      });
      continue;
    }

    if (row.sender_name === UT_REACT_MARKER) {
      try {
        const targetId = row.sender_emoji;
        const payload = JSON.parse(row.message) as {
          role?: Role;
          emoji?: string | null;
        };
        if (targetId && (payload.role === 'faiz' || payload.role === 'kenat')) {
          if (!reactStateByMsgId[targetId]) reactStateByMsgId[targetId] = {};
          if (payload.emoji) {
            reactStateByMsgId[targetId][payload.role] = payload.emoji;
          } else {
            delete reactStateByMsgId[targetId][payload.role];
          }
        }
      } catch {
        // ignore
      }
      continue;
    }

    if (row.message === UT_DELETED_MARKER) {
      deletedIds.add(row.id);
      continue;
    }

    let text = row.message || '';
    let replyToId: string | undefined;
    let replyToSender: Role | undefined;
    let replyToText: string | undefined;

    if (text.startsWith(UT_REPLY_PREFIX)) {
      try {
        const parsed = JSON.parse(text.slice(UT_REPLY_PREFIX.length)) as {
          rId?: string;
          rSender?: Role;
          rText?: string;
          text?: string;
        };
        text = String(parsed.text ?? '');
        replyToId = parsed.rId;
        replyToSender = parsed.rSender;
        replyToText = parsed.rText;
      } catch {
        // fallback
      }
    }

    messages.push({
      id: row.id,
      player_slot: row.player_slot,
      senderRole: inferSenderRole(row, currentUser, mySlot),
      senderName: row.sender_name,
      senderEmoji: row.sender_emoji,
      text,
      replyToId,
      replyToSender,
      replyToText,
      created_at: row.created_at,
    });
  }

  return {
    chats: messages
      .filter((m) => !deletedIds.has(m.id))
      .map((m) => {
        const rMap = reactStateByMsgId[m.id];
        if (!rMap || (!rMap.faiz && !rMap.kenat)) return m;
        return { ...m, react: JSON.stringify(rMap) };
      }),
    latestState,
    logs: logs.reverse().slice(0, 30),
  };
}

const LudoBoardStaticLayer = React.memo(() => {
  const trackCells: Array<{
    row: number;
    col: number;
    bg: string;
    isStar: boolean;
    startColor?: string;
  }> = [];

  for (let row = 0; row < 15; row++) {
    for (let col = 0; col < 15; col++) {
      const inTopLeft = row < 6 && col < 6;
      const inTopRight = row < 6 && col > 8;
      const inBottomLeft = row > 8 && col < 6;
      const inBottomRight = row > 8 && col > 8;
      const inCenter = row >= 6 && row <= 8 && col >= 6 && col <= 8;
      if (inTopLeft || inTopRight || inBottomLeft || inBottomRight || inCenter) {
        continue;
      }
      trackCells.push({ row, col, ...getLudoCellVisual(row, col) });
    }
  }

  return (
    <div className="relative h-full w-full select-none bg-white">
      {/* 52-square Cross Track + Home Stretches */}
      {trackCells.map((cell) => (
        <div
          key={`${cell.row}-${cell.col}`}
          style={{
            left: `${(cell.col / 15) * 100}%`,
            top: `${(cell.row / 15) * 100}%`,
            width: `${100 / 15}%`,
            height: `${100 / 15}%`,
            backgroundColor: cell.bg,
          }}
          className="absolute flex items-center justify-center border-[0.5px] border-[#E5D5DF]"
        >
          {cell.isStar && (
            <span
              style={{ color: cell.startColor || '#F59E0B' }}
              className="text-[11px] font-black leading-none drop-shadow-xs"
            >
              ★
            </span>
          )}
        </div>
      ))}

      {/* Active Corner Bases: Kuning (Top-Left) & Merah (Bottom-Left) */}
      {[
        { color: '#FACC15', row: 0, col: 0, circles: LUDO_BASE_CENTERS.player2 },
        { color: '#EF4444', row: 9, col: 0, circles: LUDO_BASE_CENTERS.player1 },
      ].map((base, idx) => (
        <React.Fragment key={`active-base-${idx}`}>
          <div
            style={{
              left: `${(base.col / 15) * 100}%`,
              top: `${(base.row / 15) * 100}%`,
              width: '40%',
              height: '40%',
              backgroundColor: base.color,
            }}
            className="absolute flex items-center justify-center border border-white/80 p-[11%]"
          >
            <div className="h-full w-full rounded-2xl border border-black/10 bg-white shadow-inner" />
          </div>
          {base.circles.map((c, cIdx) => (
            <div
              key={`active-circle-${idx}-${cIdx}`}
              style={{
                left: `${(c.cx / 15) * 100}%`,
                top: `${(c.cy / 15) * 100}%`,
                width: '9.5%',
                height: '9.5%',
                transform: 'translate(-50%, -50%)',
                borderColor: base.color,
              }}
              className="absolute rounded-full border-2 bg-[#FFF8FB] shadow-inner"
            />
          ))}
        </React.Fragment>
      ))}

      {/* Decorative Corner Bases: Hijau (Top-Right) & Biru (Bottom-Right) */}
      {LUDO_DECOR_BASES.map((base, idx) => (
        <React.Fragment key={`decor-base-${idx}`}>
          <div
            style={{
              left: `${(base.col / 15) * 100}%`,
              top: `${(base.row / 15) * 100}%`,
              width: '40%',
              height: '40%',
              backgroundColor: base.color,
            }}
            className="absolute flex items-center justify-center border border-white/80 p-[11%]"
          >
            <div className="h-full w-full rounded-2xl border border-black/10 bg-white shadow-inner" />
          </div>
          {base.circles.map((c, cIdx) => (
            <div
              key={`decor-circle-${idx}-${cIdx}`}
              style={{
                left: `${(c.cx / 15) * 100}%`,
                top: `${(c.cy / 15) * 100}%`,
                width: '9.5%',
                height: '9.5%',
                transform: 'translate(-50%, -50%)',
                borderColor: base.color,
              }}
              className="absolute flex items-center justify-center rounded-full border-2 bg-[#FFF8FB] shadow-inner"
            >
              <span
                style={{ backgroundColor: base.color }}
                className="h-[58%] w-[58%] rounded-full opacity-80 shadow-xs"
              />
            </div>
          ))}
        </React.Fragment>
      ))}

      {/* Center 3x3 Finish House (4 Colorful Triangles) */}
      <div
        style={{
          left: '40%',
          top: '40%',
          width: '20%',
          height: '20%',
        }}
        className="absolute overflow-hidden border border-[#E5D5DF]"
      >
        <svg viewBox="0 0 100 100" className="h-full w-full" aria-hidden="true">
          {/* Left = Kuning */}
          <polygon points="0,0 50,50 0,100" fill="#FACC15" stroke="#FFFFFF" strokeWidth="2" />
          {/* Top = Hijau */}
          <polygon points="0,0 100,0 50,50" fill="#22C55E" stroke="#FFFFFF" strokeWidth="2" />
          {/* Right = Biru */}
          <polygon points="100,0 100,100 50,50" fill="#3B82F6" stroke="#FFFFFF" strokeWidth="2" />
          {/* Bottom = Merah */}
          <polygon points="0,100 100,100 50,50" fill="#EF4444" stroke="#FFFFFF" strokeWidth="2" />
          <circle cx="50" cy="50" r="15" fill="#FFFFFF" opacity="0.92" />
        </svg>
        <span className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <AppleEmoji emoji="👑" size={14} />
        </span>
      </div>
    </div>
  );
});

interface LudoKingPageProps {
  currentUser: Role;
  resolvedProfile: CoupleProfile;
  onHeartBurstAt?: (x: number, y: number) => void;
  onSavedRoomChange: (meta: SavedActiveRoom | null) => void;
  onBackToMenu: () => void;
}

const LudoKingPage: React.FC<LudoKingPageProps> = ({
  currentUser,
  resolvedProfile,
  onHeartBurstAt,
  onSavedRoomChange,
  onBackToMenu,
}) => {
  const [savedMeta, setSavedMeta] = useState<SavedActiveRoom | null>(() =>
    loadSavedLudoRoom()
  );

  const defaultAccountName =
    currentUser === 'faiz'
      ? resolvedProfile.faizName || 'faiz'
      : resolvedProfile.kenatName || 'kenat';
  const myAvatarKey = currentUser;

  const [playerName, setPlayerName] = useState<string>(
    () => savedMeta?.playerName || defaultAccountName
  );
  const [showJoinInput, setShowJoinInput] = useState(false);
  const [joinCodeInput, setJoinCodeInput] = useState('');
  const [setupError, setSetupError] = useState<string | null>(null);
  const [isRoomBusy, setIsRoomBusy] = useState(false);

  const [room, setRoom] = useState<UlarTanggaRoom | null>(null);
  const [mySlot, setMySlot] = useState<PlayerSlot | null>(
    () => savedMeta?.playerSlot ?? null
  );
  const [players, setPlayers] = useState<UlarTanggaPlayer[]>([]);
  const [ludoPieces, setLudoPieces] = useState<LudoPiecesState>({
    player1: [-1, -1, -1, -1],
    player2: [-1, -1, -1, -1],
  });
  const [visualPieces, setVisualPieces] = useState<LudoPiecesState>({
    player1: [-1, -1, -1, -1],
    player2: [-1, -1, -1, -1],
  });
  const [stateVersion, setStateVersion] = useState(0);

  const [isRolling, setIsRolling] = useState(false);
  const [isAnimatingMove, setIsAnimatingMove] = useState(false);
  const [diceDisplay, setDiceDisplay] = useState<number>(6);
  const [pendingDice, setPendingDice] = useState<number | null>(null);
  const [selectablePieces, setSelectablePieces] = useState<number[]>([]);
  const [boardToast, setBoardToast] = useState<string | null>(null);
  const [copiedCodeToast, setCopiedCodeToast] = useState<string | null>(null);
  const [botTurnNonce, setBotTurnNonce] = useState(0);

  // Logs & Chat States
  const [rawChats, setRawChats] = useState<UlarTanggaRawChatRow[]>([]);
  const [botLogs, setBotLogs] = useState<LudoMoveLogItem[]>([]);
  const [setupChats, setSetupChats] = useState<ParsedGameChat[]>([]);
  const [botChats, setBotChats] = useState<ParsedGameChat[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [replyingTo, setReplyingTo] = useState<ParsedGameChat | null>(null);
  const [activeBubbleMenu, setActiveBubbleMenu] = useState<string | null>(null);
  const [reactTargetMsg, setReactTargetMsg] = useState<ParsedGameChat | null>(null);
  const [reactionDetailMsgId, setReactionDetailMsgId] = useState<string | null>(null);
  const [showInputEmojiPicker, setShowInputEmojiPicker] = useState(false);

  const roomRef = useRef<UlarTanggaRoom | null>(null);
  const mySlotRef = useRef<PlayerSlot | null>(mySlot);
  const playersRef = useRef<UlarTanggaPlayer[]>(players);
  const piecesRef = useRef<LudoPiecesState>(ludoPieces);
  const stateVersionRef = useRef<number>(stateVersion);
  const isAnimatingRef = useRef<boolean>(isAnimatingMove);
  const isRollingRef = useRef<boolean>(isRolling);
  const animCancelRef = useRef<boolean>(false);
  const lastAnimVersionRef = useRef<number>(-1);
  const boardToastTimerRef = useRef<number | null>(null);
  const chatEndRef = useRef<HTMLDivElement | null>(null);
  const setupChanRef = useRef<ReturnType<NonNullable<ReturnType<typeof getSupabaseClient>>['channel']> | null>(null);
  const roomChanRef = useRef<ReturnType<NonNullable<ReturnType<typeof getSupabaseClient>>['channel']> | null>(null);
  const seenChatIdsRef = useRef<Set<string>>(new Set());
  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);
  const longPressTimer = useRef<number | null>(null);
  const longPressFiredRef = useRef(false);

  roomRef.current = room;
  mySlotRef.current = mySlot;
  playersRef.current = players;
  piecesRef.current = ludoPieces;
  stateVersionRef.current = stateVersion;
  isAnimatingRef.current = isAnimatingMove;
  isRollingRef.current = isRolling;

  const isBotRoom = room?.id === LUDO_BOT_ROOM_ID;

  const foldedRemote = useMemo(
    () => foldLudoRawRows(rawChats, currentUser, mySlot),
    [rawChats, currentUser, mySlot]
  );

  const activeChats = !room
    ? setupChats
    : isBotRoom
    ? botChats
    : foldedRemote.chats;
  const activeLogs = isBotRoom ? botLogs : foldedRemote.logs;

  const showBoardToast = useCallback((msg: string, ms = 2200) => {
    setBoardToast(msg);
    if (boardToastTimerRef.current) {
      window.clearTimeout(boardToastTimerRef.current);
    }
    boardToastTimerRef.current = window.setTimeout(() => {
      setBoardToast(null);
    }, ms);
  }, []);

  useEffect(() => {
    return () => {
      animCancelRef.current = true;
      if (boardToastTimerRef.current) {
        window.clearTimeout(boardToastTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [activeChats.length]);

  useEffect(() => {
    if (!activeBubbleMenu && !showInputEmojiPicker) return;
    const handleOutside = (e: PointerEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;
      if (
        activeBubbleMenu &&
        !target.closest('[data-ludo-bubble-menu="true"]') &&
        !target.closest('[data-ludo-chat-bubble="true"]')
      ) {
        setActiveBubbleMenu(null);
      }
      if (showInputEmojiPicker && !target.closest('[data-ludo-chat-input="true"]')) {
        setShowInputEmojiPicker(false);
      }
    };
    document.addEventListener('pointerdown', handleOutside, true);
    return () => document.removeEventListener('pointerdown', handleOutside, true);
  }, [activeBubbleMenu, showInputEmojiPicker]);

  const animateLudoMove = useCallback(
    async (payload: LudoSyncPayload) => {
      if (payload.version <= lastAnimVersionRef.current) return;
      lastAnimVersionRef.current = payload.version;

      const mv = payload.lastMove;
      if (!mv) {
        setVisualPieces(payload.pieces);
        return;
      }

      animCancelRef.current = false;
      setIsAnimatingMove(true);

      const sleep = (ms: number) =>
        new Promise<void>((res) => window.setTimeout(res, ms));

      if (mv.from < 0 && mv.to === 0) {
        setVisualPieces((prev) => {
          const nextArr = [...prev[mv.slot]] as [number, number, number, number];
          nextArr[mv.pieceIndex] = 0;
          return { ...prev, [mv.slot]: nextArr };
        });
        soundFX.playPop();
        await sleep(340);
      } else {
        for (let step = mv.from + 1; step <= mv.to; step++) {
          if (animCancelRef.current) break;
          setVisualPieces((prev) => {
            const nextArr = [...prev[mv.slot]] as [number, number, number, number];
            nextArr[mv.pieceIndex] = step;
            return { ...prev, [mv.slot]: nextArr };
          });
          soundFX.playClick();
          await sleep(285);
        }
      }

      if (!animCancelRef.current) {
        setVisualPieces(payload.pieces);
        if (mv.captured && mv.captured.length > 0) {
          soundFX.playHeartBurst();
          await sleep(220);
        }
      }

      setIsAnimatingMove(false);
    },
    []
  );

  // Sync incoming remote Ludo state updates cleanly
  useEffect(() => {
    if (!room || isBotRoom) return;
    const remote = foldedRemote.latestState;
    if (!remote) return;
    if (remote.version > stateVersionRef.current) {
      const isInitialHydrate = stateVersionRef.current === 0 && remote.version > 1;
      setStateVersion(remote.version);
      setLudoPieces(remote.pieces);
      if (remote.lastDice) {
        setDiceDisplay(remote.lastDice);
      }
      setRoom((prev) =>
        prev
          ? {
              ...prev,
              status: remote.status,
              current_turn: remote.currentTurn,
              winner: remote.winner,
            }
          : prev
      );
      if (isInitialHydrate) {
        lastAnimVersionRef.current = remote.version;
        setVisualPieces(remote.pieces);
      } else {
        void animateLudoMove(remote);
      }
    }
  }, [foldedRemote.latestState, isBotRoom, room, animateLudoMove]);

  const loadRoomChats = useCallback(async (roomId: string) => {
    const sb = getSupabaseClient();
    if (!sb || !roomId) return;
    const { data, error } = await sb
      .from('game_chats')
      .select('*')
      .eq('room_id', roomId)
      .order('created_at', { ascending: true });

    if (!error && Array.isArray(data)) {
      const rows = data as UlarTanggaRawChatRow[];
      rows.forEach((r) => seenChatIdsRef.current.add(r.id));
      setRawChats((prev) => {
        if (
          prev.length === rows.length &&
          prev[prev.length - 1]?.id === rows[rows.length - 1]?.id
        ) {
          return prev;
        }
        return rows;
      });
    }
  }, []);

  const fetchLudoSnapshot = useCallback(
    async (roomId: string) => {
      const sb = getSupabaseClient();
      if (!sb || !roomId) return;

      const [roomRes, playersRes] = await Promise.all([
        sb.from('game_rooms').select('*').eq('id', roomId).maybeSingle(),
        sb.from('game_players').select('*').eq('room_id', roomId),
      ]);

      if (!roomRes.error && roomRes.data) {
        const r = roomRes.data as UlarTanggaRoom;
        const mappedRoom: UlarTanggaRoom = {
          id: String(r.id),
          room_code: String(r.room_code),
          status: (r.status || 'waiting') as UlarTanggaRoom['status'],
          current_turn: r.current_turn === 'player2' ? 'player2' : 'player1',
          winner: r.winner ? String(r.winner) : null,
        };
        setRoom((prev) =>
          prev &&
          prev.id === mappedRoom.id &&
          prev.status === mappedRoom.status &&
          prev.current_turn === mappedRoom.current_turn &&
          prev.winner === mappedRoom.winner
            ? prev
            : mappedRoom
        );
      }

      if (!playersRes.error && Array.isArray(playersRes.data)) {
        const pList = (playersRes.data as UlarTanggaPlayer[]).map((p) => ({
          ...p,
          player_slot: (p.player_slot === 'player2'
            ? 'player2'
            : 'player1') as PlayerSlot,
          position: Number(p.position || 0),
          is_ready: Boolean(p.is_ready),
        }));
        setPlayers((prev) => {
          if (
            prev.length === pList.length &&
            prev.every(
              (oldP, i) =>
                oldP.player_slot === pList[i]?.player_slot &&
                oldP.position === pList[i]?.position &&
                oldP.is_ready === pList[i]?.is_ready &&
                oldP.name === pList[i]?.name
            )
          ) {
            return prev;
          }
          return pList;
        });
      }

      await loadRoomChats(roomId);
    },
    [loadRoomChats]
  );

  const subscribeLudoRealtime = useCallback(
    (roomId: string) => {
      const sb = getSupabaseClient();
      if (!sb || !roomId) return () => {};

      const channel = sb
        .channel(`keiz_ludo_room_${roomId}`, {
          config: { broadcast: { self: false } },
        })
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'game_rooms',
            filter: `id=eq.${roomId}`,
          },
          (payload) => {
            const next = payload.new as Partial<UlarTanggaRoom> | undefined;
            if (!next || !next.id) return;
            setRoom((prev) => ({
              id: String(next.id),
              room_code: String(next.room_code ?? prev?.room_code ?? ''),
              status: (next.status ?? prev?.status ?? 'waiting') as UlarTanggaRoom['status'],
              current_turn:
                next.current_turn === 'player2' ? 'player2' : 'player1',
              winner:
                next.winner !== undefined
                  ? next.winner
                    ? String(next.winner)
                    : null
                  : prev?.winner ?? null,
            }));
          }
        )
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'game_players',
            filter: `room_id=eq.${roomId}`,
          },
          (payload) => {
            if (payload.eventType === 'DELETE') {
              void fetchLudoSnapshot(roomId);
              return;
            }
            const row = payload.new as Partial<UlarTanggaPlayer> | undefined;
            if (!row || !row.player_slot) return;
            const slot: PlayerSlot =
              row.player_slot === 'player2' ? 'player2' : 'player1';
            const mapped: UlarTanggaPlayer = {
              id: row.id,
              room_id: String(row.room_id ?? roomId),
              player_slot: slot,
              name: String(row.name ?? ''),
              avatar_emoji: String(row.avatar_emoji ?? (slot === 'player1' ? 'faiz' : 'kenat')),
              position: Number(row.position || 0),
              is_ready: Boolean(row.is_ready),
            };
            setPlayers((prev) => {
              const exists = prev.some((p) => p.player_slot === slot);
              return exists
                ? prev.map((p) => (p.player_slot === slot ? mapped : p))
                : [...prev, mapped];
            });
          }
        )
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'game_chats',
            filter: `room_id=eq.${roomId}`,
          },
          (payload) => {
            if (payload.eventType === 'DELETE') {
              const oldRow = payload.old as { id?: string } | undefined;
              if (oldRow?.id) {
                setRawChats((prev) => prev.filter((c) => c.id !== oldRow.id));
              } else {
                void loadRoomChats(roomId);
              }
              return;
            }
            const inserted = payload.new as UlarTanggaRawChatRow | undefined;
            if (!inserted || !inserted.id) return;
            setRawChats((prev) =>
              prev.some((c) => c.id === inserted.id) ? prev : [...prev, inserted]
            );
            if (
              inserted.sender_name !== LUDO_STATE_MARKER &&
              inserted.sender_name !== LUDO_LOG_MARKER &&
              inserted.sender_name !== UT_REACT_MARKER &&
              inserted.message !== UT_DELETED_MARKER &&
              !seenChatIdsRef.current.has(inserted.id)
            ) {
              seenChatIdsRef.current.add(inserted.id);
              const senderRole = inferSenderRole(
                inserted,
                currentUser,
                mySlotRef.current
              );
              if (senderRole !== currentUser) {
                soundFX.playPop();
              }
            }
          }
        )
        .on('broadcast', { event: 'ludo_sync' }, ({ payload }) => {
          const sync = payload as LudoSyncPayload | undefined;
          if (!sync || typeof sync.version !== 'number') return;
          if (sync.version > stateVersionRef.current) {
            setStateVersion(sync.version);
            setLudoPieces(sync.pieces);
            if (sync.lastDice) setDiceDisplay(sync.lastDice);
            setRoom((prev) =>
              prev
                ? {
                    ...prev,
                    status: sync.status,
                    current_turn: sync.currentTurn,
                    winner: sync.winner,
                  }
                : prev
            );
            void animateLudoMove(sync);
          }
        })
        .on('broadcast', { event: 'chat_deleted' }, ({ payload }) => {
          const id = (payload as { id?: string } | undefined)?.id;
          if (id) {
            setRawChats((prev) => prev.filter((c) => c.id !== id));
          }
        })
        .subscribe();

      roomChanRef.current = channel;
      return () => {
        roomChanRef.current = null;
        sb.removeChannel(channel);
      };
    },
    [animateLudoMove, currentUser, fetchLudoSnapshot, loadRoomChats]
  );

  // Hydrate saved Ludo room
  useEffect(() => {
    if (!savedMeta?.roomId || savedMeta.roomId === LUDO_BOT_ROOM_ID) return;
    let active = true;
    void fetchLudoSnapshot(savedMeta.roomId);
    const unsub = subscribeLudoRealtime(savedMeta.roomId);
    const poll = window.setInterval(() => {
      if (active && !isAnimatingRef.current && !isRollingRef.current) {
        void fetchLudoSnapshot(savedMeta.roomId);
      }
    }, 3000);
    return () => {
      active = false;
      window.clearInterval(poll);
      unsub();
    };
  }, [savedMeta?.roomId, fetchLudoSnapshot, subscribeLudoRealtime]);

  // Setup Chat Realtime Channel
  useEffect(() => {
    const sb = getSupabaseClient();
    if (!sb) return;
    const chan = sb
      .channel('keiz_ludo_setup_chat_room', {
        config: { broadcast: { self: false } },
      })
      .on('broadcast', { event: 'setup_chat' }, ({ payload }) => {
        const msg = payload as ParsedGameChat | undefined;
        if (!msg?.id) return;
        setSetupChats((prev) =>
          prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]
        );
        if (msg.senderRole !== currentUser) soundFX.playPop();
      })
      .on('broadcast', { event: 'setup_react' }, ({ payload }) => {
        const p = payload as { msgId?: string; react?: string } | undefined;
        if (!p?.msgId) return;
        setSetupChats((prev) =>
          prev.map((m) => (m.id === p.msgId ? { ...m, react: p.react } : m))
        );
      })
      .on('broadcast', { event: 'setup_delete' }, ({ payload }) => {
        const p = payload as { msgId?: string } | undefined;
        if (!p?.msgId) return;
        setSetupChats((prev) => prev.filter((m) => m.id !== p.msgId));
      })
      .subscribe();

    setupChanRef.current = chan;
    return () => {
      setupChanRef.current = null;
      sb.removeChannel(chan);
    };
  }, [currentUser]);

  const createLudoRoom = async () => {
    const cleanName = playerName.trim();
    if (!cleanName) {
      setSetupError('Isi nama kamu dulu ya!');
      return;
    }
    const sb = getSupabaseClient();
    if (!sb) {
      setSetupError('Supabase belum terhubung.');
      return;
    }

    soundFX.playClick();
    setSetupError(null);
    setIsRoomBusy(true);

    try {
      const roomCode = generateRoomCode();
      const { data: roomData, error: roomErr } = await sb
        .from('game_rooms')
        .insert([{ room_code: roomCode, status: 'waiting' }])
        .select('*')
        .single();

      if (roomErr || !roomData) {
        setSetupError(roomErr?.message || 'Gagal membuat room.');
        return;
      }

      const newRoomId = String(roomData.id);
      const { error: playerErr } = await sb.from('game_players').insert([
        {
          room_id: newRoomId,
          player_slot: 'player1',
          name: cleanName,
          avatar_emoji: myAvatarKey,
          position: 0,
        },
      ]);

      if (playerErr) {
        setSetupError(playerErr.message || 'Gagal mendaftarkan pemain.');
        return;
      }

      const meta: SavedActiveRoom = {
        roomId: newRoomId,
        roomCode: String(roomData.room_code || roomCode),
        playerSlot: 'player1',
        playerName: cleanName,
      };
      saveLudoRoomToStorage(meta);
      setSavedMeta(meta);
      onSavedRoomChange(meta);
      setMySlot('player1');
      setRoom({
        id: newRoomId,
        room_code: meta.roomCode,
        status: 'waiting',
        current_turn: 'player1',
        winner: null,
      });
      setLudoPieces(DEFAULT_LUDO_PIECES);
      setVisualPieces(DEFAULT_LUDO_PIECES);
      setStateVersion(0);
      lastAnimVersionRef.current = -1;
      await fetchLudoSnapshot(newRoomId);
    } finally {
      setIsRoomBusy(false);
    }
  };

  const joinLudoRoom = async () => {
    const cleanName = playerName.trim();
    const cleanCode = joinCodeInput.trim().toUpperCase();
    if (!cleanName) {
      setSetupError('Isi nama kamu dulu ya!');
      return;
    }
    if (!cleanCode) {
      setSetupError('Isi kode room dulu ya!');
      return;
    }
    const sb = getSupabaseClient();
    if (!sb) {
      setSetupError('Supabase belum terhubung.');
      return;
    }

    soundFX.playClick();
    setSetupError(null);
    setIsRoomBusy(true);

    try {
      const { data: foundRoom, error: findErr } = await sb
        .from('game_rooms')
        .select('*')
        .eq('room_code', cleanCode)
        .maybeSingle();

      if (findErr || !foundRoom) {
        setSetupError('Room tidak ditemukan!');
        return;
      }

      const targetRoomId = String(foundRoom.id);
      const { data: existingPlayers } = await sb
        .from('game_players')
        .select('*')
        .eq('room_id', targetRoomId);

      const list = Array.isArray(existingPlayers)
        ? (existingPlayers as UlarTanggaPlayer[])
        : [];

      if (list.length >= 2) {
        setSetupError('Room sudah penuh!');
        return;
      }

      const { error: joinErr } = await sb.from('game_players').insert([
        {
          room_id: targetRoomId,
          player_slot: 'player2',
          name: cleanName,
          avatar_emoji: myAvatarKey,
          position: 0,
        },
      ]);

      if (joinErr) {
        setSetupError(joinErr.message || 'Gagal masuk room.');
        return;
      }

      const meta: SavedActiveRoom = {
        roomId: targetRoomId,
        roomCode: String(foundRoom.room_code || cleanCode),
        playerSlot: 'player2',
        playerName: cleanName,
      };
      saveLudoRoomToStorage(meta);
      setSavedMeta(meta);
      onSavedRoomChange(meta);
      setMySlot('player2');
      setRoom({
        id: targetRoomId,
        room_code: meta.roomCode,
        status: (foundRoom.status || 'waiting') as UlarTanggaRoom['status'],
        current_turn: foundRoom.current_turn === 'player2' ? 'player2' : 'player1',
        winner: foundRoom.winner ? String(foundRoom.winner) : null,
      });
      setShowJoinInput(false);
      setJoinCodeInput('');
      await fetchLudoSnapshot(targetRoomId);
    } finally {
      setIsRoomBusy(false);
    }
  };

  const setLudoReady = async () => {
    if (!room || !mySlot) return;
    const sb = getSupabaseClient();
    if (!sb) return;
    soundFX.playPop();

    setPlayers((prev) =>
      prev.map((p) =>
        p.player_slot === mySlot ? { ...p, is_ready: true } : p
      )
    );

    await sb
      .from('game_players')
      .update({ is_ready: true })
      .eq('room_id', room.id)
      .eq('player_slot', mySlot);

    await fetchLudoSnapshot(room.id);
  };

  const pushLudoStateAndLog = useCallback(
    async (
      nextPayload: LudoSyncPayload,
      logText?: string,
      actorSlot?: PlayerSlot
    ) => {
      setStateVersion(nextPayload.version);
      setLudoPieces(nextPayload.pieces);
      setRoom((prev) =>
        prev
          ? {
              ...prev,
              status: nextPayload.status,
              current_turn: nextPayload.currentTurn,
              winner: nextPayload.winner,
            }
          : prev
      );

      if (roomRef.current?.id === LUDO_BOT_ROOM_ID) {
        if (logText) {
          setBotLogs((prev) => [
            {
              id: `ludo-bot-log-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
              text: logText,
              created_at: new Date().toISOString(),
            },
            ...prev,
          ].slice(0, 30));
        }
        return;
      }

      const sb = getSupabaseClient();
      const curRoom = roomRef.current;
      if (!sb || !curRoom) return;

      roomChanRef.current
        ?.send({
          type: 'broadcast',
          event: 'ludo_sync',
          payload: nextPayload,
        })
        .catch(() => {});

      const inserts: Array<Record<string, unknown>> = [
        {
          room_id: curRoom.id,
          player_slot: actorSlot || mySlotRef.current || 'player1',
          sender_name: LUDO_STATE_MARKER,
          sender_emoji: '👑',
          message: JSON.stringify(nextPayload),
        },
      ];
      if (logText) {
        inserts.push({
          room_id: curRoom.id,
          player_slot: actorSlot || mySlotRef.current || 'player1',
          sender_name: LUDO_LOG_MARKER,
          sender_emoji: '🎲',
          message: logText,
        });
      }

      const fin1 = nextPayload.pieces.player1.filter((p) => p >= 56).length;
      const fin2 = nextPayload.pieces.player2.filter((p) => p >= 56).length;

      await Promise.all([
        sb.from('game_chats').insert(inserts),
        sb
          .from('game_rooms')
          .update({
            status: nextPayload.status,
            current_turn: nextPayload.currentTurn,
            winner: nextPayload.winner,
          })
          .eq('id', curRoom.id),
        sb
          .from('game_players')
          .update({ position: fin1 })
          .eq('room_id', curRoom.id)
          .eq('player_slot', 'player1'),
        sb
          .from('game_players')
          .update({ position: fin2 })
          .eq('room_id', curRoom.id)
          .eq('player_slot', 'player2'),
      ]);
    },
    []
  );

  const startLudoGame = async () => {
    if (!room) return;
    soundFX.playHeartBurst();
    const initPayload: LudoSyncPayload = {
      version: Math.max(1, stateVersionRef.current + 1),
      pieces: {
        player1: [-1, -1, -1, -1],
        player2: [-1, -1, -1, -1],
      },
      currentTurn: 'player1',
      status: 'playing',
      winner: null,
    };
    setVisualPieces(initPayload.pieces);
    lastAnimVersionRef.current = initPayload.version;
    await pushLudoStateAndLog(initPayload, 'Permainan Ludo King dimulai! 👑');
  };

  const leaveLudoRoom = async () => {
    soundFX.playClick();
    animCancelRef.current = true;
    const curRoom = roomRef.current;
    const curSlot = mySlotRef.current;
    saveLudoRoomToStorage(null);
    setSavedMeta(null);
    onSavedRoomChange(null);
    setRoom(null);
    setMySlot(null);
    setPlayers([]);
    setRawChats([]);
    setBotChats([]);
    setBotLogs([]);
    setLudoPieces(DEFAULT_LUDO_PIECES);
    setVisualPieces(DEFAULT_LUDO_PIECES);
    setStateVersion(0);
    lastAnimVersionRef.current = -1;
    setPendingDice(null);
    setSelectablePieces([]);
    setBoardToast(null);
    setIsRolling(false);
    setIsAnimatingMove(false);

    if (curRoom?.id === LUDO_BOT_ROOM_ID) return;
    const sb = getSupabaseClient();
    if (sb && curRoom && curSlot && curRoom.status === 'waiting') {
      await sb
        .from('game_players')
        .delete()
        .eq('room_id', curRoom.id)
        .eq('player_slot', curSlot);
    }
  };

  const startLudoBotGame = () => {
    const cleanName = playerName.trim() || defaultAccountName;
    if (!cleanName) {
      setSetupError('Isi nama kamu dulu ya!');
      return;
    }
    soundFX.playHeartBurst();
    setSetupError(null);
    lastAnimVersionRef.current = -1;
    setMySlot('player1');
    setRoom({
      id: LUDO_BOT_ROOM_ID,
      room_code: 'BOT-LUDO',
      status: 'playing',
      current_turn: 'player1',
      winner: null,
    });
    setPlayers([
      {
        room_id: LUDO_BOT_ROOM_ID,
        player_slot: 'player1',
        name: cleanName,
        avatar_emoji: currentUser,
        position: 0,
        is_ready: true,
      },
      {
        room_id: LUDO_BOT_ROOM_ID,
        player_slot: 'player2',
        name: 'Bot Keiz',
        avatar_emoji: 'bot',
        position: 0,
        is_ready: true,
      },
    ]);
    setLudoPieces(DEFAULT_LUDO_PIECES);
    setVisualPieces(DEFAULT_LUDO_PIECES);
    setStateVersion(1);
    setBotLogs([
      {
        id: `ludo-bot-init-${Date.now()}`,
        text: 'Mode Bot Solo Ludo King dimulai! 👑',
        created_at: new Date().toISOString(),
      },
    ]);
    setBotChats([]);
    setPendingDice(null);
    setSelectablePieces([]);
    setBoardToast(null);
    setDiceDisplay(6);
    setBotTurnNonce(0);
  };

  const executeLudoMove = useCallback(
    async (slot: PlayerSlot, pieceIndex: number, dice: number) => {
      const actorName =
        playersRef.current.find((p) => p.player_slot === slot)?.name ||
        (slot === 'player1' ? 'Merah' : 'Kuning');
      const otherSlot: PlayerSlot = slot === 'player1' ? 'player2' : 'player1';

      const curPieces = piecesRef.current;
      const myArr = [...curPieces[slot]] as [number, number, number, number];
      const oppArr = [...curPieces[otherSlot]] as [number, number, number, number];

      const fromPos = myArr[pieceIndex];
      const toPos = fromPos < 0 ? 0 : fromPos + dice;
      myArr[pieceIndex] = toPos;

      // Check capture on shared ring (progress 0..50, non-safe squares)
      const captured: Array<{ slot: PlayerSlot; pieceIndex: number }> = [];
      if (toPos >= 0 && toPos <= 50) {
        const myRingIdx = getLudoTrackIndex(slot, toPos);
        if (myRingIdx !== null && !LUDO_SAFE_INDICES.has(myRingIdx)) {
          oppArr.forEach((oppProgress, oppIdx) => {
            if (oppProgress >= 0 && oppProgress <= 50) {
              const oppRingIdx = getLudoTrackIndex(otherSlot, oppProgress);
              if (oppRingIdx === myRingIdx) {
                oppArr[oppIdx] = -1;
                captured.push({ slot: otherSlot, pieceIndex: oppIdx });
              }
            }
          });
        }
      }

      const nextPieces: LudoPiecesState = {
        player1: slot === 'player1' ? myArr : oppArr,
        player2: slot === 'player2' ? myArr : oppArr,
      };

      const finishedAll = myArr.every((p) => p >= 56);
      const reachedFinish = toPos >= 56;
      const bonusTurn = !finishedAll && (dice === 6 || captured.length > 0 || reachedFinish);
      const nextTurn: PlayerSlot = bonusTurn ? slot : otherSlot;

      let logMsg = `${actorName} lempar ${dice}, maju ke petak ${toPos + 1}`;
      if (fromPos < 0 && toPos === 0) {
        logMsg = `${actorName} lempar 6, keluar dari base!`;
      } else if (captured.length > 0) {
        logMsg = `${actorName} makan! 💥`;
      } else if (reachedFinish) {
        logMsg = `${actorName} sampai Finish! 🎉`;
      }

      if (captured.length > 0) {
        showBoardToast(`${actorName} makan bidak lawan! 💥`, 2200);
      } else if (reachedFinish && !finishedAll) {
        showBoardToast('1 Bidak sampai Finish! 🎉 Lempar lagi!', 2200);
      } else if (dice === 6 && !finishedAll) {
        showBoardToast('Dapet 6! Lempar lagi! 🎲', 1800);
      }

      const nextVersion = stateVersionRef.current + 1;
      const payload: LudoSyncPayload = {
        version: nextVersion,
        pieces: nextPieces,
        currentTurn: finishedAll ? slot : nextTurn,
        status: finishedAll ? 'finished' : 'playing',
        winner: finishedAll ? slot : null,
        lastDice: dice,
        lastMove: {
          slot,
          pieceIndex,
          from: fromPos,
          to: toPos,
          dice,
          captured,
        },
      };

      setPendingDice(null);
      setSelectablePieces([]);
      await pushLudoStateAndLog(payload, logMsg, slot);
      await animateLudoMove(payload);

      if (!finishedAll && roomRef.current?.id === LUDO_BOT_ROOM_ID && nextTurn === 'player2') {
        setBotTurnNonce((n) => n + 1);
      }
    },
    [animateLudoMove, pushLudoStateAndLog, showBoardToast]
  );

  const getMovablePieceIndices = (arr: [number, number, number, number], dice: number) =>
    arr
      .map((pos, idx) => {
        if (pos < 0) return dice === 6 ? idx : -1;
        if (pos < 56 && pos + dice <= 56) return idx;
        return -1;
      })
      .filter((idx) => idx !== -1);

  const rollLudoDice = async () => {
    if (!room || !mySlot || isRolling || isAnimatingMove || pendingDice !== null) return;
    if (room.status !== 'playing' || room.current_turn !== mySlot) return;

    soundFX.playClick();
    setIsRolling(true);

    const spinTimer = window.setInterval(() => {
      setDiceDisplay(Math.floor(Math.random() * 6) + 1);
    }, 125);

    await new Promise<void>((res) => window.setTimeout(res, 1000));
    window.clearInterval(spinTimer);
    setIsRolling(false);

    const dice = Math.floor(Math.random() * 6) + 1;
    setDiceDisplay(dice);

    const myArr = piecesRef.current[mySlot];
    const movable = getMovablePieceIndices(myArr, dice);
    const actorName =
      playersRef.current.find((p) => p.player_slot === mySlot)?.name ||
      (mySlot === 'player1' ? 'Merah' : 'Kuning');
    const otherSlot: PlayerSlot = mySlot === 'player1' ? 'player2' : 'player1';

    if (movable.length === 0) {
      soundFX.playClick();
      showBoardToast(`Dadu ${dice} - Belum ada bidak yang bisa jalan`, 1800);
      const nextPayload: LudoSyncPayload = {
        version: stateVersionRef.current + 1,
        pieces: piecesRef.current,
        currentTurn: otherSlot,
        status: 'playing',
        winner: null,
        lastDice: dice,
      };
      await pushLudoStateAndLog(
        nextPayload,
        `${actorName} lempar ${dice}, belum ada bidak jalan`,
        mySlot
      );
      if (isBotRoom) {
        setBotTurnNonce((n) => n + 1);
      }
      return;
    }

    // Auto-execute if only 1 distinct effective move (only 1 movable piece, or all movable pieces are in base)
    const allInBase = movable.every((idx) => myArr[idx] < 0);
    if (movable.length === 1 || allInBase) {
      await executeLudoMove(mySlot, movable[0], dice);
      return;
    }

    // Multiple movable pieces on board -> let user tap which piece to move
    soundFX.playPop();
    setPendingDice(dice);
    setSelectablePieces(movable);
    showBoardToast(`Dapat ${dice}! Tap bidak yang berkedip!`, 2400);
  };

  // Bot Auto-Turn for Ludo King Solo Test
  useEffect(() => {
    if (
      !room ||
      room.id !== LUDO_BOT_ROOM_ID ||
      room.status !== 'playing' ||
      room.current_turn !== 'player2'
    ) {
      return;
    }

    let cancelled = false;
    const sleep = (ms: number) =>
      new Promise<void>((res) => window.setTimeout(res, ms));

    void (async () => {
      await sleep(700);
      if (cancelled || roomRef.current?.id !== LUDO_BOT_ROOM_ID) return;

      setIsRolling(true);
      const spinTimer = window.setInterval(() => {
        setDiceDisplay(Math.floor(Math.random() * 6) + 1);
      }, 125);

      await sleep(950);
      window.clearInterval(spinTimer);
      if (cancelled || roomRef.current?.id !== LUDO_BOT_ROOM_ID) {
        setIsRolling(false);
        return;
      }
      setIsRolling(false);

      const dice = Math.floor(Math.random() * 6) + 1;
      setDiceDisplay(dice);

      const botArr = piecesRef.current.player2;
      const movable = getMovablePieceIndices(botArr, dice);

      if (movable.length === 0) {
        const nextPayload: LudoSyncPayload = {
          version: stateVersionRef.current + 1,
          pieces: piecesRef.current,
          currentTurn: 'player1',
          status: 'playing',
          winner: null,
          lastDice: dice,
        };
        await pushLudoStateAndLog(
          nextPayload,
          `Bot Keiz lempar ${dice}, belum ada bidak jalan`,
          'player2'
        );
        return;
      }

      // Smart Bot heuristic: Finish > Capture opponent > Exit base > Furthest progress
      const p1Arr = piecesRef.current.player1;
      let chosenIdx = movable[0];
      let bestScore = -999;

      for (const idx of movable) {
        const curPos = botArr[idx];
        const nextPos = curPos < 0 ? 0 : curPos + dice;
        let score = nextPos;
        if (nextPos === 56) score += 500;
        if (curPos < 0 && dice === 6) score += 220;
        if (nextPos >= 0 && nextPos <= 50) {
          const ringIdx = getLudoTrackIndex('player2', nextPos);
          if (ringIdx !== null && !LUDO_SAFE_INDICES.has(ringIdx)) {
            const canEat = p1Arr.some(
              (p1p) => p1p >= 0 && p1p <= 50 && getLudoTrackIndex('player1', p1p) === ringIdx
            );
            if (canEat) score += 400;
          } else if (ringIdx !== null && LUDO_SAFE_INDICES.has(ringIdx)) {
            score += 60;
          }
        }
        if (score > bestScore) {
          bestScore = score;
          chosenIdx = idx;
        }
      }

      await executeLudoMove('player2', chosenIdx, dice);
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room?.id, room?.status, room?.current_turn, botTurnNonce]);

  const handleLudoPlayAgain = async () => {
    if (!room) return;
    soundFX.playHeartBurst();
    const resetPayload: LudoSyncPayload = {
      version: stateVersionRef.current + 1,
      pieces: {
        player1: [-1, -1, -1, -1],
        player2: [-1, -1, -1, -1],
      },
      currentTurn: 'player1',
      status: 'playing',
      winner: null,
    };
    setVisualPieces(resetPayload.pieces);
    lastAnimVersionRef.current = resetPayload.version;
    setPendingDice(null);
    setSelectablePieces([]);
    setBotLogs([]);
    await pushLudoStateAndLog(resetPayload, 'Main Ludo King lagi! 👑');
  };

  const handleLudoBackToLobby = async () => {
    if (!room) return;
    if (room.id === LUDO_BOT_ROOM_ID) {
      await leaveLudoRoom();
      return;
    }
    const sb = getSupabaseClient();
    if (!sb) return;
    soundFX.playClick();
    const resetPayload: LudoSyncPayload = {
      version: stateVersionRef.current + 1,
      pieces: DEFAULT_LUDO_PIECES,
      currentTurn: 'player1',
      status: 'waiting',
      winner: null,
    };
    setVisualPieces(DEFAULT_LUDO_PIECES);
    lastAnimVersionRef.current = resetPayload.version;
    setPendingDice(null);
    setSelectablePieces([]);

    await Promise.all([
      sb
        .from('game_players')
        .update({ position: 0, is_ready: false })
        .eq('room_id', room.id),
      sb
        .from('game_rooms')
        .update({ status: 'waiting', current_turn: 'player1', winner: null })
        .eq('id', room.id),
      sb.from('game_chats').insert([
        {
          room_id: room.id,
          player_slot: mySlot || 'player1',
          sender_name: LUDO_STATE_MARKER,
          sender_emoji: '👑',
          message: JSON.stringify(resetPayload),
        },
      ]),
    ]);

    await fetchLudoSnapshot(room.id);
  };

  // ---------- LUDO CHAT HANDLERS ----------
  const sendLudoChat = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const cleaned = chatInput.trim();
    if (!cleaned) return;
    soundFX.playPop();
    setChatInput('');
    setShowInputEmojiPicker(false);
    const activeReply = replyingTo;
    setReplyingTo(null);
    const cleanName = playerName.trim() || defaultAccountName;

    if (!room || room.id === LUDO_BOT_ROOM_ID) {
      const msg: ParsedGameChat = {
        id: `${room ? 'ludo-bot' : 'ludo-setup'}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        player_slot: currentUser,
        senderRole: currentUser,
        senderName: cleanName,
        senderEmoji: myAvatarKey,
        text: cleaned,
        replyToId: activeReply?.id,
        replyToSender: activeReply?.senderRole,
        replyToText: activeReply?.text,
        created_at: new Date().toISOString(),
      };
      if (room?.id === LUDO_BOT_ROOM_ID) {
        setBotChats((prev) => [...prev, msg]);
      } else {
        setSetupChats((prev) => [...prev, msg]);
        setupChanRef.current
          ?.send({ type: 'broadcast', event: 'setup_chat', payload: msg })
          .catch(() => {});
      }
      return;
    }

    const sb = getSupabaseClient();
    if (!sb) return;
    const encodedMsg = encodeChatMessagePayload(cleaned, activeReply);
    const { data, error } = await sb
      .from('game_chats')
      .insert([
        {
          room_id: room.id,
          player_slot: mySlot || 'player1',
          sender_name: cleanName,
          sender_emoji: myAvatarKey,
          message: encodedMsg,
        },
      ])
      .select('*')
      .single();

    if (!error && data) {
      const row = data as UlarTanggaRawChatRow;
      seenChatIdsRef.current.add(row.id);
      setRawChats((prev) =>
        prev.some((c) => c.id === row.id) ? prev : [...prev, row]
      );
    }
  };

  const applyLudoChatReaction = async (
    msg: ParsedGameChat,
    emoji: string,
    burstPoint?: { x: number; y: number }
  ) => {
    const { nextSerialized, addedEmoji } = toggleUserReaction(
      msg.react,
      currentUser,
      emoji,
      msg.senderRole
    );
    soundFX.playPop();
    if (addedEmoji === '❤️' && burstPoint) {
      onHeartBurstAt?.(burstPoint.x, burstPoint.y);
    }
    setActiveBubbleMenu(null);
    setReactTargetMsg(null);
    if (!nextSerialized && reactionDetailMsgId === msg.id) {
      setReactionDetailMsgId(null);
    }

    if (!room || room.id === LUDO_BOT_ROOM_ID) {
      if (room?.id === LUDO_BOT_ROOM_ID) {
        setBotChats((prev) =>
          prev.map((m) => (m.id === msg.id ? { ...m, react: nextSerialized } : m))
        );
      } else {
        setSetupChats((prev) =>
          prev.map((m) => (m.id === msg.id ? { ...m, react: nextSerialized } : m))
        );
        setupChanRef.current
          ?.send({
            type: 'broadcast',
            event: 'setup_react',
            payload: { msgId: msg.id, react: nextSerialized },
          })
          .catch(() => {});
      }
      return;
    }

    const sb = getSupabaseClient();
    if (!sb) return;
    const { data, error } = await sb
      .from('game_chats')
      .insert([
        {
          room_id: room.id,
          player_slot: mySlot || 'player1',
          sender_name: UT_REACT_MARKER,
          sender_emoji: msg.id,
          message: JSON.stringify({
            role: currentUser,
            emoji: addedEmoji || null,
          }),
        },
      ])
      .select('*')
      .single();

    if (!error && data) {
      const row = data as UlarTanggaRawChatRow;
      setRawChats((prev) =>
        prev.some((c) => c.id === row.id) ? prev : [...prev, row]
      );
    }
  };

  const handleDeleteLudoChatMsg = async (msgId: string) => {
    soundFX.playClick();
    setActiveBubbleMenu(null);

    if (!room || room.id === LUDO_BOT_ROOM_ID) {
      if (room?.id === LUDO_BOT_ROOM_ID) {
        setBotChats((prev) => prev.filter((m) => m.id !== msgId));
      } else {
        setSetupChats((prev) => prev.filter((m) => m.id !== msgId));
        setupChanRef.current
          ?.send({ type: 'broadcast', event: 'setup_delete', payload: { msgId } })
          .catch(() => {});
      }
      return;
    }

    setRawChats((prev) => prev.filter((c) => c.id !== msgId));
    const sb = getSupabaseClient();
    if (!sb) return;
    const { error } = await sb.from('game_chats').delete().eq('id', msgId);
    if (error) {
      await sb
        .from('game_chats')
        .update({ message: UT_DELETED_MARKER })
        .eq('id', msgId);
    }
    roomChanRef.current
      ?.send({ type: 'broadcast', event: 'chat_deleted', payload: { id: msgId } })
      .catch(() => {});
  };

  const resolveLudoRole = (avatarKey?: string, name?: string): Role | 'bot' => {
    if (avatarKey === 'bot') return 'bot';
    if (avatarKey === 'faiz' || avatarKey === '🐻') return 'faiz';
    if (avatarKey === 'kenat' || avatarKey === '🐰') return 'kenat';
    const lower = (name || '').toLowerCase();
    if (lower.includes('bot')) return 'bot';
    if (lower.includes('kenat')) return 'kenat';
    if (lower.includes('faiz')) return 'faiz';
    return currentUser;
  };

  const renderLudoAvatar = (
    avatarKey: string | undefined,
    name: string,
    sizeClass = 'h-12 w-12',
    ringOverride?: string
  ) => {
    const kind = resolveLudoRole(avatarKey, name);
    if (kind === 'bot') {
      return (
        <div
          className={`flex ${sizeClass} shrink-0 items-center justify-center rounded-full border-2 ${
            ringOverride || 'border-[#EAB308]'
          } bg-gradient-to-br from-[#FEF9C3] to-[#FDE047] text-[#854D0E] shadow-sm`}
        >
          <Bot className="h-[58%] w-[58%]" />
        </div>
      );
    }
    const photoUrl =
      kind === 'faiz' ? resolvedProfile.faizPhoto : resolvedProfile.kenatPhoto;
    const borderColor =
      ringOverride || (kind === 'faiz' ? 'border-[#3B82F6]' : 'border-[#FF2E7E]');
    const fallbackInitial = (name || kind).slice(0, 1).toUpperCase();

    return (
      <div
        className={`flex ${sizeClass} shrink-0 items-center justify-center overflow-hidden rounded-full border-2 ${borderColor} bg-[#FFF2F7] shadow-sm`}
      >
        {photoUrl ? (
          <img
            src={photoUrl}
            alt={name || kind}
            referrerPolicy="no-referrer"
            className="h-full w-full object-cover"
          />
        ) : (
          <span className="text-[10px] font-extrabold text-[#D81B6E]">
            {fallbackInitial}
          </span>
        )}
      </div>
    );
  };

  const p1 = players.find((p) => p.player_slot === 'player1') || null;
  const p2 = players.find((p) => p.player_slot === 'player2') || null;
  const mePlayer = mySlot ? players.find((p) => p.player_slot === mySlot) || null : null;
  const bothReady = Boolean(p1 && p2 && p1.is_ready && p2.is_ready);
  const amIReady = Boolean(mePlayer?.is_ready);
  const isMyTurn = Boolean(
    room && mySlot && room.current_turn === mySlot && room.status === 'playing'
  );
  const currentTurnPlayer = room
    ? players.find((p) => p.player_slot === room.current_turn)
    : null;
  const currentTurnRole = room
    ? resolveLudoRole(
        currentTurnPlayer?.avatar_emoji,
        currentTurnPlayer?.name || (room.current_turn === 'player1' ? 'Merah' : 'Kuning')
      )
    : currentUser;
  const currentTurnName =
    currentTurnPlayer?.name || (room?.current_turn === 'player1' ? 'Merah' : 'Kuning');

  const p1Role = resolveLudoRole(p1?.avatar_emoji, p1?.name || 'faiz');
  const p2Role = resolveLudoRole(p2?.avatar_emoji, p2?.name || (isBotRoom ? 'bot' : 'kenat'));

  const faizPlayer =
    p1Role === 'faiz' ? p1 : p2Role === 'faiz' ? p2 : p1;
  const kenatPlayer =
    p1Role === 'kenat' ? p1 : p2Role === 'kenat' ? p2 : p2;

  const faizSlot: PlayerSlot = p1Role === 'faiz' ? 'player1' : p2Role === 'faiz' ? 'player2' : 'player1';
  const kenatSlot: PlayerSlot = faizSlot === 'player1' ? 'player2' : 'player1';

  const faizFinishCount = visualPieces[faizSlot].filter((p) => p >= 56).length;
  const kenatFinishCount = visualPieces[kenatSlot].filter((p) => p >= 56).length;
  const faizProgressPct = Math.round(
    (visualPieces[faizSlot].reduce((acc, p) => acc + Math.max(0, p), 0) / (56 * 4)) * 100
  );
  const kenatProgressPct = Math.round(
    (visualPieces[kenatSlot].reduce((acc, p) => acc + Math.max(0, p), 0) / (56 * 4)) * 100
  );

  const winnerName = useMemo(() => {
    if (!room?.winner) return 'Pemenang';
    const found = players.find((p) => p.player_slot === room.winner);
    return found?.name || room.winner;
  }, [room?.winner, players]);

  const formatTime = (iso: string) => {
    try {
      return new Date(iso).toLocaleTimeString('id-ID', {
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return '';
    }
  };

  // Compute all 8 tokens' positions with smart micro-offsets for shared squares
  const renderLudoTokens = () => {
    const tokens: Array<{
      slot: PlayerSlot;
      pieceIndex: number;
      progress: number;
      cx: number;
      cy: number;
      cellKey: string;
      avatarKey: string;
      name: string;
    }> = [];

    (['player1', 'player2'] as PlayerSlot[]).forEach((slot) => {
      const pl = players.find((p) => p.player_slot === slot);
      const avatarKey = pl?.avatar_emoji || (slot === 'player1' ? currentUser : isBotRoom ? 'bot' : 'kenat');
      const name = pl?.name || (slot === 'player1' ? 'Merah' : 'Kuning');
      visualPieces[slot].forEach((progress, idx) => {
        const pos = getLudoTokenGridCenter(slot, idx, progress);
        tokens.push({
          slot,
          pieceIndex: idx,
          progress,
          cx: pos.cx,
          cy: pos.cy,
          cellKey: pos.key,
          avatarKey,
          name,
        });
      });
    });

    // Group tokens sharing the same board cell so multiple tokens remain visible & tappable
    const groups = new Map<string, typeof tokens>();
    tokens.forEach((t) => {
      const arr = groups.get(t.cellKey) || [];
      arr.push(t);
      groups.set(t.cellKey, arr);
    });

    return (
      <div className="pointer-events-none absolute inset-0 z-20">
        {tokens.map((token) => {
          const peers = groups.get(token.cellKey) || [token];
          const peerIdx = peers.findIndex(
            (p) => p.slot === token.slot && p.pieceIndex === token.pieceIndex
          );
          let offX = 0;
          let offY = 0;
          if (peers.length === 2) {
            offX = peerIdx === 0 ? -0.18 : 0.18;
          } else if (peers.length > 2) {
            const angles = [
              [-0.17, -0.17],
              [0.17, -0.17],
              [-0.17, 0.17],
              [0.17, 0.17],
            ];
            const pair = angles[peerIdx % 4];
            offX = pair[0];
            offY = pair[1];
          }

          const isSelectable =
            pendingDice !== null &&
            mySlot === token.slot &&
            selectablePieces.includes(token.pieceIndex);
          const isFinish = token.progress >= 56;
          const isInBase = token.progress < 0;
          const ringColor =
            token.slot === 'player1' ? 'border-[#EF4444]' : 'border-[#EAB308]';

          return (
            <button
              key={`${token.slot}-${token.pieceIndex}`}
              type="button"
              disabled={!isSelectable}
              onClick={() => {
                if (isSelectable && pendingDice !== null) {
                  void executeLudoMove(token.slot, token.pieceIndex, pendingDice);
                }
              }}
              style={{
                width: '6.6667%',
                height: '6.6667%',
                transform: `translate3d(${(token.cx - 0.5 + offX) * 100}%, ${
                  (token.cy - 0.5 + offY) * 100
                }%, 0)`,
              }}
              className={`ludo-token-move absolute left-0 top-0 flex items-center justify-center ${
                isSelectable
                  ? 'pointer-events-auto z-30 cursor-pointer'
                  : 'pointer-events-none z-20'
              }`}
              aria-label={`Bidak ${token.name} ${token.pieceIndex + 1}`}
            >
              <div
                className={`rounded-full shadow-[0_3px_7px_rgba(45,10,30,0.35)] ${
                  isSelectable ? 'ludo-piece-selectable ring-2 ring-[#FF2E7E]' : ''
                }`}
              >
                {renderLudoAvatar(
                  token.avatarKey,
                  token.name,
                  isInBase
                    ? 'h-[22px] w-[22px]'
                    : isFinish
                    ? 'h-[16px] w-[16px]'
                    : peers.length > 1
                    ? 'h-[17px] w-[17px]'
                    : 'h-[20px] w-[20px]',
                  ringColor
                )}
              </div>
            </button>
          );
        })}
      </div>
    );
  };

  const activeDetailChat = reactionDetailMsgId
    ? activeChats.find((m) => m.id === reactionDetailMsgId)
    : undefined;

  return (
    <section
      id="page-ludo-king"
      className="animate-slide-in-right flex min-h-full w-full flex-col gap-3 pb-4"
    >
      {/* Top Bar with [⬅️ Kembali] back to Halaman Game without resetting active room */}
      <div className="flex items-center justify-between gap-2 pt-1">
        <button
          type="button"
          onClick={() => {
            soundFX.playClick();
            onBackToMenu();
          }}
          className="btn-bucin flex items-center gap-1.5 rounded-full border border-[#FFD6E7] bg-white px-3.5 py-2 text-xs font-extrabold text-[#2D0A1E] shadow-sm cursor-pointer"
        >
          <AppleTextWithEmojis text="⬅️ Kembali" emojiSize={14} />
        </button>

        {room && (
          <span className="rounded-full border border-[#FFD6E7] bg-[#FFF5F9] px-3 py-1.5 text-[11px] font-extrabold text-[#D81B6E]">
            {isBotRoom ? 'Mode Bot Solo' : `Room ${room.room_code}`}
          </span>
        )}
      </div>

      {/* A. SETUP VIEW */}
      {!room && (
        <div className="keiz-sticker-card space-y-3.5 rounded-3xl bg-white p-4">
          <div className="text-center">
            <h2 className="font-display flex items-center justify-center gap-1.5 text-[20px] font-extrabold text-[#D81B6E]">
              <AppleTextWithEmojis text="👑 Ludo King" emojiSize={20} />
            </h2>
            <p className="mt-0.5 text-[11px] font-bold text-[#8A6A7A]">
              Main Ludo klasik berdua real-time
            </p>
          </div>

          <div className="flex items-center gap-3 rounded-2xl border border-[#FFD6E7] bg-[#FFF5F9] p-3">
            {renderLudoAvatar(currentUser, playerName || currentUser, 'h-12 w-12')}
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-extrabold uppercase tracking-wide text-[#8A6A7A]">
                Akun: {currentUser}
              </p>
              <input
                type="text"
                value={playerName}
                onChange={(e) => {
                  setPlayerName(e.target.value);
                  setSetupError(null);
                }}
                placeholder="Nama kamu..."
                maxLength={24}
                className="mt-1 h-9 w-full rounded-xl border border-[#FFD6E7] bg-white px-3 text-xs font-bold text-[#2D0A1E] placeholder-[#9A7A8A] focus:border-[#FF2E7E] focus:outline-none"
              />
            </div>
          </div>

          {setupError && (
            <div className="rounded-2xl border border-rose-200 bg-rose-50 px-3 py-2 text-center text-xs font-extrabold text-rose-600">
              {setupError}
            </div>
          )}

          <div className="grid grid-cols-2 gap-2.5">
            <button
              type="button"
              disabled={isRoomBusy}
              onClick={() => void createLudoRoom()}
              className="keiz-btn-primary btn-bucin flex min-h-[50px] items-center justify-center px-3 text-xs font-extrabold disabled:opacity-50 cursor-pointer"
            >
              {isRoomBusy ? 'Bikin room...' : 'Buat Room'}
            </button>
            <button
              type="button"
              disabled={isRoomBusy}
              onClick={() => {
                soundFX.playClick();
                setSetupError(null);
                setShowJoinInput((v) => !v);
              }}
              className="btn-bucin flex min-h-[50px] items-center justify-center rounded-full border-2 border-[#FF7AB8] bg-white px-3 text-xs font-extrabold text-[#D81B6E] shadow-sm cursor-pointer"
            >
              Join Room
            </button>
          </div>

          <button
            type="button"
            disabled={isRoomBusy}
            onClick={startLudoBotGame}
            className="btn-bucin flex min-h-[46px] w-full items-center justify-center gap-2 rounded-full border border-[#FFD6E7] bg-[#FFF5F9] px-4 text-xs font-extrabold text-[#D81B6E] shadow-xs cursor-pointer"
          >
            <Bot className="h-4 w-4 text-[#FF2E7E]" />
            <span>Main Lawan Bot (Tes Solo)</span>
          </button>

          {showJoinInput && (
            <div className="animate-bubble-pop flex items-center gap-2 rounded-2xl border border-[#FFD6E7] bg-[#FFF5F9] p-2.5">
              <input
                type="text"
                value={joinCodeInput}
                onChange={(e) => {
                  setJoinCodeInput(e.target.value.toUpperCase());
                  setSetupError(null);
                }}
                placeholder="KEIZ-A1B2"
                maxLength={12}
                className="h-10 flex-1 rounded-xl border border-[#FFD6E7] bg-white px-3 text-xs font-extrabold uppercase tracking-wider text-[#2D0A1E] placeholder-[#9A7A8A] focus:border-[#FF2E7E] focus:outline-none"
              />
              <button
                type="button"
                disabled={isRoomBusy}
                onClick={() => void joinLudoRoom()}
                className="btn-bucin h-10 rounded-xl bg-[#FF2E7E] px-4 text-xs font-extrabold text-white shadow cursor-pointer disabled:opacity-50"
              >
                Masuk
              </button>
            </div>
          )}
        </div>
      )}

      {/* B. LOBBY VIEW */}
      {room && room.status === 'waiting' && (
        <div className="keiz-sticker-card space-y-3.5 rounded-3xl bg-white p-4">
          <div className="rounded-2xl border border-[#FFD6E7] bg-gradient-to-br from-[#FFF2F7] to-[#FFE3EE] p-3.5 text-center">
            <p className="text-[10px] font-extrabold uppercase tracking-wider text-[#8A6A7A]">
              Kode Room Ludo King
            </p>
            <p className="font-display mt-1 text-[28px] font-extrabold tracking-widest text-[#D81B6E]">
              {room.room_code}
            </p>
            <button
              type="button"
              onClick={() => {
                soundFX.playPop();
                navigator.clipboard?.writeText(room.room_code).catch(() => {});
                setCopiedCodeToast('Kode disalin!');
                window.setTimeout(() => setCopiedCodeToast(null), 1600);
              }}
              className="btn-bucin mt-2 inline-flex items-center gap-1.5 rounded-full border border-[#FFD6E7] bg-white px-3.5 py-1.5 text-[11px] font-extrabold text-[#2D0A1E] shadow-xs cursor-pointer"
            >
              <Copy className="h-3.5 w-3.5 text-[#D81B6E]" />
              <span>{copiedCodeToast || 'Salin Kode'}</span>
            </button>
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            {([
              { slot: 'player1' as PlayerSlot, label: 'Merah 🔴', ring: 'border-[#EF4444]', data: p1 },
              { slot: 'player2' as PlayerSlot, label: 'Kuning 🟡', ring: 'border-[#EAB308]', data: p2 },
            ]).map((item) => (
              <div
                key={item.slot}
                className="flex flex-col items-center rounded-2xl border border-[#FFD6E7] bg-[#FFF8FA] p-3 text-center"
              >
                <span className="text-[10px] font-extrabold text-[#8A6A7A]">
                  <AppleTextWithEmojis text={item.label} emojiSize={11} />
                </span>
                <div className="my-2">
                  {item.data ? (
                    renderLudoAvatar(
                      item.data.avatar_emoji,
                      item.data.name,
                      'h-12 w-12',
                      item.ring
                    )
                  ) : (
                    <div className="flex h-12 w-12 items-center justify-center rounded-full border-2 border-[#FFD6E7] bg-white shadow-sm">
                      <AppleEmoji emoji="⏳" size={22} />
                    </div>
                  )}
                </div>
                <p className="w-full truncate text-xs font-extrabold text-[#2D0A1E]">
                  {item.data?.name || 'Menunggu...'}
                </p>
                <p className="mt-1 text-[11px] font-bold text-[#8A6A7A]">
                  <AppleTextWithEmojis
                    text={
                      item.data
                        ? item.data.is_ready
                          ? 'Ready ✅'
                          : 'Belum Ready ⏳'
                        : 'Kosong'
                    }
                    emojiSize={12}
                  />
                </p>
              </div>
            ))}
          </div>

          <div className="flex flex-col gap-2">
            <button
              type="button"
              disabled={amIReady}
              onClick={() => void setLudoReady()}
              className={`btn-bucin flex min-h-[46px] w-full items-center justify-center rounded-full text-xs font-extrabold shadow-sm ${
                amIReady
                  ? 'border border-emerald-200 bg-emerald-50 text-emerald-700 cursor-default'
                  : 'bg-[#FF2E7E] text-white cursor-pointer'
              }`}
            >
              <AppleTextWithEmojis
                text={amIReady ? 'Udah Ready ✅' : 'Saya Ready'}
                emojiSize={15}
              />
            </button>

            {bothReady && (
              <button
                type="button"
                onClick={() => void startLudoGame()}
                className="keiz-btn-primary btn-bucin animate-bubble-pop flex min-h-[50px] w-full items-center justify-center text-sm font-extrabold cursor-pointer"
              >
                <AppleTextWithEmojis text="MULAI MAIN 👑" emojiSize={16} />
              </button>
            )}

            <button
              type="button"
              onClick={() => void leaveLudoRoom()}
              className="flex min-h-[40px] w-full items-center justify-center gap-1.5 rounded-full border border-rose-200 bg-rose-50 text-xs font-extrabold text-rose-600 cursor-pointer"
            >
              <LogOut className="h-3.5 w-3.5" />
              <span>Keluar Room</span>
            </button>
          </div>
        </div>
      )}

      {/* C. PLAYING / FINISHED VIEW */}
      {room && (room.status === 'playing' || room.status === 'finished') && (
        <div className="relative space-y-2.5">
          {/* Header Status + Bidak Finish + Progress Bar */}
          <div className="keiz-card space-y-2 rounded-3xl bg-white p-3">
            <div className="flex items-center justify-between gap-2">
              <div
                className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-extrabold ${
                  currentTurnRole === 'faiz'
                    ? 'border-[#93C5FD] bg-[#EFF6FF] text-[#2563EB]'
                    : currentTurnRole === 'kenat'
                    ? 'border-[#FF9EC7] bg-[#FFE3EE] text-[#D81B6E]'
                    : 'border-amber-300 bg-amber-50 text-amber-700'
                }`}
              >
                <span
                  className={`h-2 w-2 rounded-full animate-pulse ${
                    currentTurnRole === 'faiz'
                      ? 'bg-[#3B82F6]'
                      : currentTurnRole === 'kenat'
                      ? 'bg-[#FF2E7E]'
                      : 'bg-amber-500'
                  }`}
                />
                <span>Giliran: {currentTurnName}</span>
              </div>

              <button
                type="button"
                onClick={() => void leaveLudoRoom()}
                className="rounded-full border border-rose-200 bg-rose-50 px-2.5 py-1 text-[10px] font-extrabold text-rose-600 cursor-pointer"
              >
                {isBotRoom ? 'Keluar Bot' : 'Keluar Room'}
              </button>
            </div>

            <p className="text-center text-xs font-extrabold text-[#2D0A1E]">
              Bidak Finish: {faizPlayer?.name || 'faiz'} {faizFinishCount}/4 |{' '}
              {kenatPlayer?.name || (isBotRoom ? 'Bot Keiz' : 'kenat')}{' '}
              {kenatFinishCount}/4
            </p>

            {/* Progress Bars */}
            <div className="grid grid-cols-2 gap-2">
              {[
                {
                  label: faizPlayer?.name || 'faiz',
                  fin: faizFinishCount,
                  pct: faizProgressPct,
                  bar: 'from-[#60A5FA] to-[#3B82F6]',
                },
                {
                  label: kenatPlayer?.name || (isBotRoom ? 'Bot Keiz' : 'kenat'),
                  fin: kenatFinishCount,
                  pct: kenatProgressPct,
                  bar: isBotRoom
                    ? 'from-[#FACC15] to-[#EAB308]'
                    : 'from-[#FF7AB8] to-[#FF2E7E]',
                },
              ].map((item, idx) => (
                <div key={idx} className="space-y-1">
                  <div className="flex items-center justify-between text-[10px] font-bold text-[#8A6A7A]">
                    <span className="truncate">{item.label}</span>
                    <span className="tabular-nums">{item.fin}/4</span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-[#FFE3EE]">
                    <div
                      className={`h-full rounded-full bg-gradient-to-r ${item.bar} transition-all duration-300`}
                      style={{ width: `${Math.min(100, item.pct)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Toast above Ludo Board */}
          {boardToast && (
            <div className="animate-bubble-pop rounded-2xl border border-[#FF9EC7] bg-white px-3 py-2 text-center text-xs font-extrabold text-[#D81B6E] shadow-md">
              <AppleTextWithEmojis text={boardToast} emojiSize={15} />
            </div>
          )}

          {/* 15x15 Classic Cross Ludo Board */}
          <div className="relative aspect-square w-full overflow-hidden rounded-2xl border-2 border-[#FF9EC7] bg-white shadow-[0_8px_24px_rgba(255,46,126,0.14)]">
            <LudoBoardStaticLayer />
            {renderLudoTokens()}
          </div>

          {/* Big 84x84 Dice Button */}
          <div className="keiz-card flex flex-col items-center justify-center gap-1.5 rounded-3xl bg-white p-3">
            <button
              type="button"
              disabled={!isMyTurn || isRolling || isAnimatingMove || pendingDice !== null}
              onClick={() => void rollLudoDice()}
              aria-label="Lempar dadu Ludo"
              className={`btn-bucin flex h-[84px] min-h-[80px] w-[84px] min-w-[80px] flex-col items-center justify-center rounded-3xl shadow-lg ${
                isRolling ? 'ut-dice-rolling bg-[#FF2E7E] text-white' : ''
              } ${
                isMyTurn && !isRolling && !isAnimatingMove && pendingDice === null
                  ? 'bg-gradient-to-br from-[#FF2E7E] to-[#FF7AB8] text-white cursor-pointer'
                  : !isRolling
                  ? 'bg-slate-200 text-slate-400 cursor-not-allowed'
                  : ''
              }`}
            >
              <span className="text-[36px] leading-none">
                {UT_DICE_FACES[Math.max(0, Math.min(5, diceDisplay - 1))]}
              </span>
              <span className="mt-1 text-[10px] font-extrabold">
                {isRolling ? '...' : `Dadu ${diceDisplay}`}
              </span>
            </button>

            <p className="text-[11px] font-extrabold text-[#8A6A7A]">
              {isRolling
                ? 'Mengocok dadu...'
                : pendingDice !== null
                ? 'Tap bidak yang berkedip di papan!'
                : isMyTurn
                ? 'Tap dadu untuk lempar!'
                : isBotRoom
                ? 'Bot Keiz lagi jalan...'
                : 'Menunggu Giliran Pasangan...'}
            </p>
          </div>

          {/* Log Permainan */}
          <div className="keiz-card rounded-2xl bg-white p-3">
            <p className="mb-1.5 text-[11px] font-extrabold text-[#D81B6E]">
              Log Permainan
            </p>
            <div className="max-h-[110px] space-y-1 overflow-y-auto pr-1 text-[11px] font-semibold text-[#5C3A49]">
              {activeLogs.length === 0 ? (
                <p className="text-[#9A7A8A]">Belum ada lemparan dadu.</p>
              ) : (
                activeLogs.map((log) => (
                  <div
                    key={log.id}
                    className="rounded-lg bg-[#FFF5F9] px-2.5 py-1"
                  >
                    <AppleTextWithEmojis text={log.text} emojiSize={12} />
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Winner Overlay with Confetti */}
          {room.status === 'finished' && (
            <div className="fixed inset-0 z-50 flex items-center justify-center overflow-hidden bg-[#2D0A1E]/55 p-4 backdrop-blur-sm">
              {CONFETTI_PIECES.map((cf, i) => (
                <span
                  key={i}
                  style={{
                    left: cf.left,
                    top: '-24px',
                    backgroundColor: cf.color,
                    animationDelay: cf.delay,
                    animationDuration: cf.duration,
                  }}
                  className="ut-confetti-piece pointer-events-none fixed h-3 w-2 rounded-sm"
                />
              ))}

              <div className="keiz-card animate-slide-up-bounce relative w-full max-w-[360px] space-y-4 bg-white p-6 text-center shadow-2xl">
                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-[#FFF2F7] shadow-inner">
                  <AppleEmoji emoji="🏆" size={40} />
                </div>

                <h3 className="font-display text-[22px] font-extrabold text-[#D81B6E]">
                  <AppleTextWithEmojis
                    text={
                      room.winner === mySlot
                        ? 'KAMU MENANG! 🏆'
                        : `${String(winnerName).toUpperCase()} MENANG! 🏆`
                    }
                    emojiSize={22}
                  />
                </h3>

                <div className="flex flex-col gap-2">
                  <button
                    type="button"
                    onClick={() => void handleLudoPlayAgain()}
                    className="keiz-btn-primary btn-bucin flex min-h-[46px] w-full items-center justify-center gap-1.5 text-xs font-extrabold cursor-pointer"
                  >
                    <RotateCcw className="h-4 w-4" />
                    <span>Main Lagi</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleLudoBackToLobby()}
                    className="btn-bucin flex min-h-[44px] w-full items-center justify-center rounded-full border border-[#FFD6E7] bg-[#FFF5F9] text-xs font-extrabold text-[#2D0A1E] cursor-pointer"
                  >
                    {isBotRoom ? 'Kembali ke Setup' : 'Balik ke Lobby'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* CHAT MABAR LUDO KING (320px SCROLLABLE BOX) */}
      <div className="keiz-card relative flex h-[320px] shrink-0 flex-col overflow-hidden bg-white">
        <div className="flex shrink-0 items-center justify-between border-b border-[#FFD6E7] bg-[#FFF5F9] px-3 py-2">
          <p className="text-xs font-extrabold text-[#D81B6E]">
            <AppleTextWithEmojis text="💬 chat mabar ludo king" emojiSize={14} />
          </p>
          <span className="rounded-full border border-[#FFD6E7] bg-white px-2 py-0.5 text-[9px] font-extrabold text-[#8A6A7A]">
            {room ? `Room ${room.room_code}` : 'Pra-Main'}
          </span>
        </div>

        <div
          onClick={() => {
            setActiveBubbleMenu(null);
            setShowInputEmojiPicker(false);
          }}
          className="flex min-h-0 flex-1 flex-col space-y-2 overflow-y-auto bg-[#FFFDFE] p-3"
        >
          {activeChats.length === 0 && (
            <div className="my-auto mx-auto rounded-2xl border border-[#FFD6E7] bg-[#FFF5F9] px-4 py-2.5 text-center">
              <p className="text-xs font-extrabold text-[#5C3A49]">
                Belum ada chat mabar nih
              </p>
              <p className="mt-0.5 text-[10px] font-semibold text-[#8A6A7A]">
                Ngobrol bebas kapan aja sambil main Ludo!
              </p>
            </div>
          )}

          {activeChats.map((msg) => {
            const isMine = msg.senderRole === currentUser;
            const bubbleColor =
              msg.senderRole === 'faiz' ? 'bg-[#3B82F6]' : 'bg-[#FF4D8D]';

            return (
              <div
                key={msg.id}
                onContextMenu={(e) => {
                  e.preventDefault();
                  soundFX.playClick();
                  setActiveBubbleMenu(msg.id);
                }}
                onTouchStart={(e) => {
                  longPressFiredRef.current = false;
                  touchStartX.current = e.touches[0].clientX;
                  touchStartY.current = e.touches[0].clientY;
                  longPressTimer.current = window.setTimeout(() => {
                    longPressFiredRef.current = true;
                    soundFX.playClick();
                    setActiveBubbleMenu(msg.id);
                  }, 500);
                }}
                onTouchMove={(e) => {
                  const startX = touchStartX.current;
                  const startY = touchStartY.current;
                  const curX = e.touches[0].clientX;
                  const curY = e.touches[0].clientY;
                  if (
                    longPressTimer.current &&
                    startX !== null &&
                    startY !== null &&
                    (Math.abs(curX - startX) > 8 || Math.abs(curY - startY) > 8)
                  ) {
                    clearTimeout(longPressTimer.current);
                    longPressTimer.current = null;
                  }
                  if (
                    startX !== null &&
                    startY !== null &&
                    curX - startX > 48 &&
                    Math.abs(curY - startY) < 32
                  ) {
                    touchStartX.current = null;
                    touchStartY.current = null;
                    soundFX.playClick();
                    setReplyingTo(msg);
                  }
                }}
                onTouchEnd={() => {
                  if (longPressTimer.current) {
                    clearTimeout(longPressTimer.current);
                    longPressTimer.current = null;
                  }
                  touchStartX.current = null;
                  touchStartY.current = null;
                }}
                className={`animate-pop-up relative flex flex-col ${
                  isMine ? 'items-end' : 'items-start'
                } ${msg.react ? 'mb-2' : ''}`}
              >
                <div
                  data-ludo-chat-bubble="true"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (longPressFiredRef.current) {
                      longPressFiredRef.current = false;
                      return;
                    }
                    soundFX.playClick();
                    setActiveBubbleMenu((cur) => (cur === msg.id ? null : msg.id));
                  }}
                  className={`relative max-w-[84%] cursor-pointer rounded-2xl px-3 py-2 text-xs leading-relaxed text-white shadow-sm ${bubbleColor} ${
                    isMine ? 'rounded-br-[4px]' : 'rounded-bl-[4px]'
                  }`}
                >
                  {msg.replyToText && (
                    <div className="mb-1 rounded-lg border-l-[3px] border-white/80 bg-black/15 px-2 py-1 text-[10px]">
                      <p className="font-extrabold opacity-90">
                        {msg.replyToSender === 'faiz' ? 'faiz' : 'kenat'}
                      </p>
                      <p className="line-clamp-1 opacity-85">
                        <AppleTextWithEmojis text={msg.replyToText} emojiSize={13} />
                      </p>
                    </div>
                  )}

                  <span>
                    <AppleTextWithEmojis text={msg.text} emojiSize={17} />
                  </span>

                  <div className="mt-0.5 flex items-center justify-end gap-1 text-[9px] text-white/80">
                    <span>{formatTime(msg.created_at)}</span>
                    {isMine && <Check className="h-2.5 w-2.5 text-white/80" />}
                  </div>

                  <ReactionPill
                    rawReact={msg.react}
                    msgSender={msg.senderRole}
                    isMine={isMine}
                    onClick={() => {
                      soundFX.playClick();
                      setActiveBubbleMenu(null);
                      setReactionDetailMsgId(msg.id);
                    }}
                  />
                </div>

                {activeBubbleMenu === msg.id && (
                  <div
                    data-ludo-bubble-menu="true"
                    onClick={(e) => e.stopPropagation()}
                    className={`animate-bubble-pop z-30 mt-1.5 flex max-w-[270px] flex-col gap-1.5 rounded-2xl border border-[#FFD6E7] bg-white p-2 text-[11px] font-bold shadow-xl ${
                      isMine ? 'items-end' : 'items-start'
                    }`}
                  >
                    <div className="flex flex-wrap items-center gap-1">
                      {QUICK_REACT_EMOJIS.map((em) => {
                        const myReact = getUserReaction(
                          msg.react,
                          currentUser,
                          msg.senderRole
                        );
                        return (
                          <button
                            key={em}
                            type="button"
                            onClick={(e) => {
                              const rect = e.currentTarget.getBoundingClientRect();
                              void applyLudoChatReaction(msg, em, {
                                x: rect.left + rect.width / 2,
                                y: rect.top + rect.height / 2,
                              });
                            }}
                            className={`flex h-8 w-8 items-center justify-center rounded-full transition-transform active:scale-90 cursor-pointer ${
                              myReact === em
                                ? 'bg-[#FFE3EE] ring-1 ring-[#FF2E7E]'
                                : 'bg-[#FFF5F9]'
                            }`}
                          >
                            <AppleEmoji emoji={em} size={19} />
                          </button>
                        );
                      })}
                      <button
                        type="button"
                        onClick={() => {
                          soundFX.playClick();
                          setActiveBubbleMenu(null);
                          setReactTargetMsg(msg);
                        }}
                        aria-label="Pilih emot lainnya"
                        className="flex h-7 items-center gap-0.5 rounded-full bg-[#FFE3EE] px-2 text-[10px] font-extrabold text-[#D81B6E] cursor-pointer"
                      >
                        <Smile className="h-3.5 w-3.5" />
                        <span>+</span>
                      </button>
                    </div>

                    <div className="flex flex-wrap gap-1.5">
                      <button
                        type="button"
                        onClick={() => {
                          setReplyingTo(msg);
                          setActiveBubbleMenu(null);
                        }}
                        className="rounded-lg bg-[#FFF2F7] px-2.5 py-1 text-[#2D0A1E] cursor-pointer"
                      >
                        Balas
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard?.writeText(msg.text).catch(() => {});
                          setActiveBubbleMenu(null);
                        }}
                        className="rounded-lg bg-[#FFF2F7] px-2.5 py-1 text-[#2D0A1E] cursor-pointer"
                      >
                        Salin
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleDeleteLudoChatMsg(msg.id)}
                        className="rounded-lg bg-rose-50 px-2.5 py-1 text-rose-600 cursor-pointer"
                      >
                        Hapus
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
          <div ref={chatEndRef} />
        </div>

        {replyingTo && (
          <div className="flex shrink-0 items-center justify-between border-t border-[#FFD6E7] bg-[#FFF5F9] px-3 py-1.5 text-[11px]">
            <div className="min-w-0 flex-1 border-l-[3px] border-[#FF2E7E] pl-2">
              <p className="text-[10px] font-extrabold text-[#E91E7A]">
                Membalas {replyingTo.senderRole === 'faiz' ? 'faiz' : 'kenat'}
              </p>
              <p className="truncate text-[#8A6A7A]">
                <AppleTextWithEmojis text={replyingTo.text} emojiSize={13} />
              </p>
            </div>
            <button
              type="button"
              onClick={() => setReplyingTo(null)}
              className="ml-2 flex h-6 w-6 items-center justify-center rounded-full bg-white text-[#8A6A7A] cursor-pointer"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

        {showInputEmojiPicker && (
          <div
            data-ludo-chat-input="true"
            className="absolute inset-x-0 bottom-[56px] z-30 border-t border-[#FFD6E7] bg-white shadow-lg"
          >
            <EmojiPicker
              width="100%"
              height={220}
              searchPlaceholder="Cari emot..."
              emojiStyle={EmojiStyle.APPLE}
              theme={Theme.LIGHT}
              lazyLoadEmojis
              previewConfig={{ showPreview: false }}
              onEmojiClick={(emojiData: EmojiClickData) =>
                setChatInput((prev) => `${prev}${emojiData.emoji}`)
              }
            />
          </div>
        )}

        <form
          data-ludo-chat-input="true"
          onSubmit={(e) => void sendLudoChat(e)}
          className="flex shrink-0 items-center gap-1.5 border-t border-[#FFD6E7] bg-white p-2"
        >
          <button
            type="button"
            onClick={() => {
              soundFX.playClick();
              setShowInputEmojiPicker((v) => !v);
            }}
            aria-label="Pilih emot chat ludo"
            className={`btn-bucin flex h-10 w-10 shrink-0 items-center justify-center rounded-full border cursor-pointer ${
              showInputEmojiPicker
                ? 'border-[#FF2E7E] bg-[#FFE3EE] text-[#D81B6E]'
                : 'border-[#FFD6E7] bg-[#FFF5F9] text-[#FF4D8D]'
            }`}
          >
            <Smile className="h-4 w-4" />
          </button>

          <input
            type="text"
            value={chatInput}
            onChange={(e) => setChatInput(e.target.value)}
            placeholder={
              currentUser === 'faiz' ? 'ketik buat kenat...' : 'ketik buat faiz...'
            }
            className="h-10 min-h-[40px] flex-1 rounded-full border border-[#FFD6E7] bg-[#FFF2F7] px-3.5 text-xs font-semibold text-[#2D0A1E] placeholder-[#9A7A8A] focus:border-[#FF2E7E] focus:outline-none"
          />

          <button
            type="submit"
            aria-label="Kirim chat ludo"
            className={`btn-bucin flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-white shadow-sm cursor-pointer ${
              currentUser === 'faiz' ? 'bg-[#3B82F6]' : 'bg-[#FF4D8D]'
            }`}
          >
            <Send className="h-4 w-4" />
          </button>
        </form>
      </div>

      {reactTargetMsg && (
        <div
          onClick={() => setReactTargetMsg(null)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#2D0A1E]/45 p-3 backdrop-blur-sm"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="animate-slide-up-bounce w-full max-w-[406px] overflow-hidden rounded-[24px] border border-[#FFD6E7] bg-white p-3 shadow-2xl"
          >
            <div className="mb-2 flex items-center justify-between px-1">
              <div className="min-w-0 flex-1 pr-2">
                <p className="text-xs font-extrabold text-[#D81B6E]">
                  Pilih react emot
                </p>
                <p className="truncate text-[11px] font-semibold text-[#8A6A7A]">
                  <AppleTextWithEmojis text={reactTargetMsg.text} emojiSize={14} />
                </p>
              </div>
              {(() => {
                const myReact = getUserReaction(
                  reactTargetMsg.react,
                  currentUser,
                  reactTargetMsg.senderRole
                );
                if (!myReact) return null;
                return (
                  <button
                    type="button"
                    onClick={() => void applyLudoChatReaction(reactTargetMsg, myReact)}
                    className="mr-1.5 shrink-0 rounded-full border border-rose-200 bg-rose-50 px-2.5 py-1 text-[10px] font-extrabold text-rose-600 cursor-pointer"
                  >
                    Hapus react
                  </button>
                );
              })()}
              <button
                type="button"
                onClick={() => setReactTargetMsg(null)}
                aria-label="Tutup picker react"
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#FFF2F7] text-[#8A6A7A] cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <EmojiPicker
              width="100%"
              height={340}
              searchPlaceholder="Cari emot..."
              emojiStyle={EmojiStyle.APPLE}
              theme={Theme.LIGHT}
              lazyLoadEmojis
              previewConfig={{ showPreview: false }}
              onEmojiClick={(emojiData: EmojiClickData, event: MouseEvent) =>
                void applyLudoChatReaction(reactTargetMsg, emojiData.emoji, {
                  x: event.clientX || 215,
                  y: event.clientY || 420,
                })
              }
            />
          </div>
        </div>
      )}

      {activeDetailChat &&
        getReactionEntries(activeDetailChat.react, activeDetailChat.senderRole)
          .length > 0 && (
          <ReactionDetailsModal
            msg={{
              id: activeDetailChat.id,
              sender: activeDetailChat.senderRole,
              receiver: activeDetailChat.senderRole === 'faiz' ? 'kenat' : 'faiz',
              message: activeDetailChat.text,
              type: 'text',
              is_read: true,
              created_at: activeDetailChat.created_at,
              react: activeDetailChat.react,
            }}
            currentUser={currentUser}
            profile={resolvedProfile}
            onToggleMyReaction={(emoji, pt) =>
              void applyLudoChatReaction(activeDetailChat, emoji, pt)
            }
            onOpenFullPicker={() => {
              setReactionDetailMsgId(null);
              setReactTargetMsg(activeDetailChat);
            }}
            onClose={() => setReactionDetailMsgId(null)}
          />
        )}
    </section>
  );
};
