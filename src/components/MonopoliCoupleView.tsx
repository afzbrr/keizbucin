import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import EmojiPicker, {
  EmojiStyle,
  Theme,
  type EmojiClickData,
} from 'emoji-picker-react';
import {
  Check,
  CheckCheck,
  Coins,
  Copy,
  Home,
  LogOut,
  RotateCcw,
  Send,
  Smile,
  Sparkles,
  X,
} from 'lucide-react';
import { getSupabaseClient } from '../supabaseClient';
import { soundFX } from '../sound';
import { AppleEmoji, AppleTextWithEmojis, QUICK_REACT_EMOJIS } from './AppleEmoji';
import {
  getReactionEntries,
  getUserReaction,
  ReactionDetailsModal,
  ReactionPill,
  toggleUserReaction,
} from './ChatReactions';
import {
  clampDiceValue,
  DiceFaceSvg,
  nextSpinDiceFace,
  rollFairDiceValue,
} from './GameDice';
import type { CoupleProfile, Role } from '../types';

export type MonopoliSlot = 'player1' | 'player2';

export interface MonopoliSavedRoom {
  roomId: string;
  roomCode: string;
  playerSlot: MonopoliSlot;
  playerName: string;
}

export const MONOPOLI_ROOM_STORAGE_KEY = 'keiz_monopoli_couple_active_room_v1';
const MONOPOLI_BOT_ROOM_ID = '__MONOPOLI_BOT_MODE__';
const MONOPOLI_STATE_MARKER = '__KEIZ_MONOPOLI_STATE__';
const MONOPOLI_READ_MARKER = '__KEIZ_MONOPOLI_READ__';
const MONOPOLI_REACT_MARKER = '__KEIZ_REACT__';
const MONOPOLI_DELETED_MARKER = '__KEIZ_DELETED__';
const MONOPOLI_REPLY_PREFIX = '__KEIZ_REPLY__';

export function loadSavedMonopoliRoom(): MonopoliSavedRoom | null {
  try {
    const raw = localStorage.getItem(MONOPOLI_ROOM_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<MonopoliSavedRoom>;
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

function saveMonopoliRoomToStorage(room: MonopoliSavedRoom | null): void {
  try {
    if (!room) {
      localStorage.removeItem(MONOPOLI_ROOM_STORAGE_KEY);
    } else {
      localStorage.setItem(MONOPOLI_ROOM_STORAGE_KEY, JSON.stringify(room));
    }
  } catch {
    // ignore
  }
}

function generateMonopoliRoomCode(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let suffix = '';
  for (let i = 0; i < 4; i++) {
    suffix += chars[Math.floor(Math.random() * chars.length)];
  }
  return `MONO-${suffix}`;
}

type MonopoliTileType =
  | 'start'
  | 'properti'
  | 'hadiah'
  | 'tantangan'
  | 'hukuman'
  | 'date'
  | 'kartu_cinta'
  | 'penjara'
  | 'masuk_penjara';

interface MonopoliTile {
  id: number;
  type: MonopoliTileType;
  name: string;
  shortName: string;
  emoji: string;
  colorGroup?: string;
  price?: number;
  rent?: number;
  gridRow: number; // 1-indexed 1..6
  gridCol: number; // 1-indexed 1..6
  description: string;
}

const MONOPOLI_BOARD_TILES: ReadonlyArray<MonopoliTile> = [
  // Top row (left -> right): 0..5
  {
    id: 0,
    type: 'start',
    name: 'START Cinta',
    shortName: 'START',
    emoji: '🏁',
    gridRow: 1,
    gridCol: 1,
    description: 'Setiap lewat atau berhenti di START dapat +200 Koin Cinta!',
  },
  {
    id: 1,
    type: 'properti',
    name: 'Kafe Pertama',
    shortName: 'Kafe',
    emoji: '🧋',
    colorGroup: '#FF4D8D',
    price: 120,
    rent: 45,
    gridRow: 1,
    gridCol: 2,
    description: 'Tempat ngedate pertama yang manis banget.',
  },
  {
    id: 2,
    type: 'kartu_cinta',
    name: 'Kartu Cinta',
    shortName: 'Kartu',
    emoji: '🃏',
    gridRow: 1,
    gridCol: 3,
    description: 'Tarik 1 Kartu Cinta penuh kejutan romantis!',
  },
  {
    id: 3,
    type: 'properti',
    name: 'Taman Bunga',
    shortName: 'Taman',
    emoji: '🌷',
    colorGroup: '#FF4D8D',
    price: 150,
    rent: 55,
    gridRow: 1,
    gridCol: 4,
    description: 'Taman penuh bunga buat jalan sore berdua.',
  },
  {
    id: 4,
    type: 'tantangan',
    name: 'Tantangan Couple',
    shortName: 'Misi',
    emoji: '💌',
    gridRow: 1,
    gridCol: 5,
    description: 'Selesaikan kartu misi couple buat dapet bonus Koin Cinta!',
  },
  {
    id: 5,
    type: 'date',
    name: 'Dinner Date',
    shortName: 'Date',
    emoji: '🍽️',
    gridRow: 1,
    gridCol: 6,
    description: 'Makan malam romantis berdua di restoran favorit!',
  },
  // Right column (top -> bottom): 6..9
  {
    id: 6,
    type: 'properti',
    name: 'Kedai Es Krim',
    shortName: 'Es Krim',
    emoji: '🍨',
    colorGroup: '#3B82F6',
    price: 180,
    rent: 65,
    gridRow: 2,
    gridCol: 6,
    description: 'Es krim manis berdua biar makin lengket.',
  },
  {
    id: 7,
    type: 'hadiah',
    name: 'Hadiah Kejutan',
    shortName: 'Hadiah',
    emoji: '🎁',
    gridRow: 3,
    gridCol: 6,
    description: 'Dapet kejutan Koin Cinta gratis!',
  },
  {
    id: 8,
    type: 'properti',
    name: 'Bioskop Berdua',
    shortName: 'Bioskop',
    emoji: '🍿',
    colorGroup: '#3B82F6',
    price: 220,
    rent: 80,
    gridRow: 4,
    gridCol: 6,
    description: 'Nonton film favorit sambil pegangan tangan.',
  },
  {
    id: 9,
    type: 'hukuman',
    name: 'Hukuman Manis',
    shortName: 'Hukum',
    emoji: '😘',
    gridRow: 5,
    gridCol: 6,
    description: 'Kena hukuman gemes buat pasangan!',
  },
  // Bottom row (right -> left): 10..15
  {
    id: 10,
    type: 'penjara',
    name: 'Penjara Cinta',
    shortName: 'Penjara',
    emoji: '🔒',
    gridRow: 6,
    gridCol: 6,
    description:
      'Penjara Cinta! Kalau cuma lewat aman, kalau terkurung harus keluar pakai dadu kembar atau bayar 100 Koin.',
  },
  {
    id: 11,
    type: 'properti',
    name: 'Toko Cokelat',
    shortName: 'Cokelat',
    emoji: '🍫',
    colorGroup: '#A855F7',
    price: 240,
    rent: 90,
    gridRow: 6,
    gridCol: 5,
    description: 'Toko cokelat manis spesial buat kesayangan.',
  },
  {
    id: 12,
    type: 'kartu_cinta',
    name: 'Kartu Cinta',
    shortName: 'Kartu',
    emoji: '💖',
    gridRow: 6,
    gridCol: 4,
    description: 'Ambil Kartu Cinta spesial untuk kita berdua!',
  },
  {
    id: 13,
    type: 'properti',
    name: 'Pantai Sunset',
    shortName: 'Pantai',
    emoji: '🌅',
    colorGroup: '#A855F7',
    price: 280,
    rent: 105,
    gridRow: 6,
    gridCol: 3,
    description: 'Menikmati sunset paling indah berdua.',
  },
  {
    id: 14,
    type: 'tantangan',
    name: 'Tantangan Couple',
    shortName: 'Misi',
    emoji: '🫶',
    gridRow: 6,
    gridCol: 2,
    description: 'Jalankan misi sayang biar makin bucin dan dapet koin!',
  },
  {
    id: 15,
    type: 'masuk_penjara',
    name: 'Kena Penjara Cinta!',
    shortName: 'Terkunci',
    emoji: '💘',
    gridRow: 6,
    gridCol: 1,
    description: 'Ketangkep rindu pasangan! Langsung pindah ke Penjara Cinta.',
  },
  // Left column (bottom -> top): 16..19
  {
    id: 16,
    type: 'properti',
    name: 'Villa Pegunungan',
    shortName: 'Villa',
    emoji: '🏡',
    colorGroup: '#F59E0B',
    price: 320,
    rent: 125,
    gridRow: 5,
    gridCol: 1,
    description: 'Staycation adem berdua di puncak.',
  },
  {
    id: 17,
    type: 'date',
    name: 'Coffee Date',
    shortName: 'Ngopi',
    emoji: '☕',
    gridRow: 4,
    gridCol: 1,
    description: 'Ngopi santai sambil cerita seharian.',
  },
  {
    id: 18,
    type: 'hadiah',
    name: 'Kado Spesial',
    shortName: 'Kado',
    emoji: '🎀',
    gridRow: 3,
    gridCol: 1,
    description: 'Kado manis mendadak! Dapat tambahan Koin Cinta.',
  },
  {
    id: 19,
    type: 'properti',
    name: 'Rumah Impian',
    shortName: 'Rumah',
    emoji: '🏰',
    colorGroup: '#F59E0B',
    price: 380,
    rent: 150,
    gridRow: 2,
    gridCol: 1,
    description: 'Rumah impian masa depan Kenat & Faiz!',
  },
];

const COUPLE_MISSIONS: ReadonlyArray<{
  title: string;
  desc: string;
  reward: number;
}> = [
  {
    title: 'Misi Bilang Sayang 💕',
    desc: 'Kirim pesan manis ke pasangan di chat sekarang juga (contoh: "I love you sayangkuu")!',
    reward: 90,
  },
  {
    title: 'Misi Pujian Gemes 🥺',
    desc: 'Sebutkan 1 hal yang paling kamu suka dari pasangan di chat!',
    reward: 100,
  },
  {
    title: 'Misi Peluk Virtual 🫂',
    desc: 'Kirim 3 emoji ❤️🫶😘 ke pasangan di chat biar makin semangat!',
    reward: 80,
  },
  {
    title: 'Misi Janji Date 🍦',
    desc: 'Tulis rencana jajanan atau tempat date selanjutnya yang pengen kita datengin!',
    reward: 110,
  },
];

const SWEET_PUNISHMENTS: ReadonlyArray<{
  title: string;
  desc: string;
  penalty: number;
}> = [
  {
    title: 'Hukuman Manis Traktir Boba 🧋',
    desc: 'Kirim emot cium 😘 ke pasangan di chat dan bayar traktiran manis!',
    penalty: 70,
  },
  {
    title: 'Hukuman Kangen Berat 🥺',
    desc: 'Ketik "aku kangen banget sama kamu" di chat dan kasih koin ke pasangan!',
    penalty: 60,
  },
  {
    title: 'Hukuman Cubit Pipi 😚',
    desc: 'Harus kirim voice/chat manja dulu dan bayar denda gemes ke pasangan!',
    penalty: 80,
  },
];

const LOVE_CARDS: ReadonlyArray<{
  title: string;
  desc: string;
  coinDelta: number;
  transferToPartner?: boolean;
  moveToStart?: boolean;
}> = [
  {
    title: 'Bonus Mensive Berdua 💖',
    desc: 'Bank Cinta ngasih bonus spesial buat pasangan paling gemes!',
    coinDelta: 150,
  },
  {
    title: 'Traktir Pasangan Tersayang 🍰',
    desc: 'Kamu lagi pengen manjain pasangan, kasih uang jajan manis ke dia!',
    coinDelta: -80,
    transferToPartner: true,
  },
  {
    title: 'Pulang ke START 🏁',
    desc: 'Semangat cinta membawamu langsung ke petak START dan dapat +200 Koin!',
    coinDelta: 0,
    moveToStart: true,
  },
  {
    title: 'Pelukan Hangat Penuh Rezeki 🫶',
    desc: 'Mood lagi happy banget berdua! Dapat tambahan +120 Koin Cinta.',
    coinDelta: 120,
  },
];

const DATE_CARDS: ReadonlyArray<{
  title: string;
  desc: string;
  coinDelta: number;
}> = [
  {
    title: 'Dinner Romantis Lilin 🕯️',
    desc: 'Makan malam hangat berdua bikin makin sayang! Bonus energi cinta +90 Koin.',
    coinDelta: 90,
  },
  {
    title: 'Coffee Date Sore Hari ☕',
    desc: 'Jajan kopi & croissant berdua yang manis banget! Bayar patungan -50 Koin.',
    coinDelta: -50,
  },
  {
    title: 'Foto Photobox Lucu 📸',
    desc: 'Hasil fotonya gemes banget! Dapat kenangan manis & bonus +70 Koin.',
    coinDelta: 70,
  },
];

const INITIAL_COINS = 1500;
const MAX_ROUNDS = 20;

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

type PendingMonopoliCard =
  | {
      kind: 'buy_property';
      slot: MonopoliSlot;
      tileId: number;
      isDouble: boolean;
    }
  | {
      kind: 'tantangan';
      slot: MonopoliSlot;
      tileId: number;
      title: string;
      desc: string;
      reward: number;
      isDouble: boolean;
    }
  | {
      kind: 'hukuman';
      slot: MonopoliSlot;
      tileId: number;
      title: string;
      desc: string;
      penalty: number;
      isDouble: boolean;
    }
  | {
      kind: 'kartu_cinta';
      slot: MonopoliSlot;
      tileId: number;
      title: string;
      desc: string;
      coinDelta: number;
      transferToPartner?: boolean;
      moveToStart?: boolean;
      isDouble: boolean;
    }
  | {
      kind: 'date';
      slot: MonopoliSlot;
      tileId: number;
      title: string;
      desc: string;
      coinDelta: number;
      isDouble: boolean;
    };

interface MonopoliTxItem {
  id: string;
  text: string;
  created_at: string;
}

interface MonopoliGameState {
  version: number;
  status: 'waiting' | 'playing' | 'finished';
  currentTurn: MonopoliSlot;
  winner: string | null; // 'player1' | 'player2' | 'draw' | null
  winReason?: string;
  roundCount: number;
  positions: Record<MonopoliSlot, number>;
  coins: Record<MonopoliSlot, number>;
  jailTurns: Record<MonopoliSlot, number>;
  properties: Record<number, MonopoliSlot>;
  lastDice: [number, number];
  consecutiveDoubles: number;
  pendingCard: PendingMonopoliCard | null;
  lastMove?: {
    slot: MonopoliSlot;
    from: number;
    to: number;
    steps: number;
    passedStart: boolean;
  };
  transactions: MonopoliTxItem[];
}

interface MonopoliRoomRow {
  id: string;
  room_code: string;
  status: 'waiting' | 'playing' | 'finished';
  current_turn: MonopoliSlot;
  winner: string | null;
}

interface MonopoliPlayerRow {
  id?: string;
  room_id: string;
  player_slot: MonopoliSlot;
  name: string;
  avatar_emoji: string;
  position: number;
  is_ready: boolean;
}

interface MonopoliRawChatRow {
  id: string;
  room_id: string;
  player_slot: string;
  sender_name: string;
  sender_emoji: string;
  message: string;
  created_at: string;
}

interface ParsedMonoChat {
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
  isRead: boolean;
  created_at: string;
}

const DEFAULT_MONO_STATE: MonopoliGameState = {
  version: 0,
  status: 'waiting',
  currentTurn: 'player1',
  winner: null,
  roundCount: 1,
  positions: { player1: 0, player2: 0 },
  coins: { player1: INITIAL_COINS, player2: INITIAL_COINS },
  jailTurns: { player1: 0, player2: 0 },
  properties: {},
  lastDice: [1, 1],
  consecutiveDoubles: 0,
  pendingCard: null,
  transactions: [],
};

function pickFirstString(
  row: Record<string, unknown>,
  keys: string[]
): string {
  for (const k of keys) {
    const val = row[k];
    if (typeof val === 'string' && val.trim()) {
      return val.trim();
    }
  }
  return '';
}

function inferMonoSenderRole(
  row: { player_slot: string; sender_name: string; sender_emoji: string },
  currentUser: Role,
  mySlot: MonopoliSlot | null
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
  const lower = (row.sender_name || '').toLowerCase();
  if (lower.includes('kenat')) return 'kenat';
  if (lower.includes('faiz')) return 'faiz';
  return currentUser;
}

function encodeMonoChatPayload(
  text: string,
  replyTo?: ParsedMonoChat | null
): string {
  if (!replyTo) return text;
  return (
    MONOPOLI_REPLY_PREFIX +
    JSON.stringify({
      rId: replyTo.id,
      rSender: replyTo.senderRole,
      rText: replyTo.text,
      text,
    })
  );
}

function foldMonopoliRawRows(
  rows: MonopoliRawChatRow[],
  currentUser: Role,
  mySlot: MonopoliSlot | null
): {
  chats: ParsedMonoChat[];
  latestState: MonopoliGameState | null;
  readByRole: Partial<Record<Role, number>>;
} {
  const reactStateByMsgId: Record<string, Partial<Record<Role, string>>> = {};
  const deletedIds = new Set<string>();
  const messages: ParsedMonoChat[] = [];
  let latestState: MonopoliGameState | null = null;
  const readByRole: Partial<Record<Role, number>> = {};

  for (const row of rows) {
    if (row.sender_name === MONOPOLI_STATE_MARKER) {
      try {
        const parsed = JSON.parse(row.message) as MonopoliGameState;
        if (parsed && parsed.positions && typeof parsed.version === 'number') {
          if (!latestState || parsed.version >= latestState.version) {
            latestState = parsed;
          }
        }
      } catch {
        // ignore
      }
      continue;
    }

    if (row.sender_name === MONOPOLI_READ_MARKER) {
      try {
        const parsed = JSON.parse(row.message) as { role?: Role; at?: number };
        if (
          (parsed.role === 'faiz' || parsed.role === 'kenat') &&
          typeof parsed.at === 'number'
        ) {
          readByRole[parsed.role] = Math.max(
            readByRole[parsed.role] || 0,
            parsed.at
          );
        }
      } catch {
        // ignore
      }
      continue;
    }

    if (row.sender_name === MONOPOLI_REACT_MARKER) {
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

    if (row.message === MONOPOLI_DELETED_MARKER) {
      deletedIds.add(row.id);
      continue;
    }

    let text = row.message || '';
    let replyToId: string | undefined;
    let replyToSender: Role | undefined;
    let replyToText: string | undefined;

    if (text.startsWith(MONOPOLI_REPLY_PREFIX)) {
      try {
        const parsed = JSON.parse(
          text.slice(MONOPOLI_REPLY_PREFIX.length)
        ) as {
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
        // ignore
      }
    }

    const senderRole = inferMonoSenderRole(row, currentUser, mySlot);
    messages.push({
      id: row.id,
      player_slot: row.player_slot,
      senderRole,
      senderName: row.sender_name,
      senderEmoji: row.sender_emoji,
      text,
      replyToId,
      replyToSender,
      replyToText,
      isRead: false,
      created_at: row.created_at,
    });
  }

  const finalMessages = messages
    .filter((m) => !deletedIds.has(m.id))
    .map((m) => {
      const rMap = reactStateByMsgId[m.id];
      const otherRole: Role = m.senderRole === 'faiz' ? 'kenat' : 'faiz';
      const partnerReadAt = readByRole[otherRole] || 0;
      const msgAt = new Date(m.created_at).getTime() || 0;
      const isRead = partnerReadAt >= msgAt && partnerReadAt > 0;
      return {
        ...m,
        isRead,
        react:
          rMap && (rMap.faiz || rMap.kenat) ? JSON.stringify(rMap) : undefined,
      };
    });

  return { chats: finalMessages, latestState, readByRole };
}

interface MonopoliCouplePageProps {
  currentUser: Role;
  resolvedProfile: CoupleProfile;
  onHeartBurstAt?: (x: number, y: number) => void;
  onSavedRoomChange: (meta: MonopoliSavedRoom | null) => void;
  onBackToMenu: () => void;
}

export const MonopoliCouplePage: React.FC<MonopoliCouplePageProps> = ({
  currentUser,
  resolvedProfile,
  onHeartBurstAt,
  onSavedRoomChange,
  onBackToMenu,
}) => {
  const [liveProfile, setLiveProfile] = useState<CoupleProfile>(resolvedProfile);

  // Ambil foto profil dan nama pemain langsung dari tabel `profiles` (plus fallback `users_keiz` / prop)
  useEffect(() => {
    setLiveProfile((prev) => ({
      ...resolvedProfile,
      faizPhoto: prev.faizPhoto || resolvedProfile.faizPhoto,
      kenatPhoto: prev.kenatPhoto || resolvedProfile.kenatPhoto,
      faizName: prev.faizName || resolvedProfile.faizName,
      kenatName: prev.kenatName || resolvedProfile.kenatName,
    }));

    const sb = getSupabaseClient();
    if (!sb) return;
    let active = true;

    void (async () => {
      try {
        const { data, error } = await sb.from('profiles').select('*').limit(10);
        if (!active || error || !Array.isArray(data) || data.length === 0) {
          return;
        }

        let faizPhoto = resolvedProfile.faizPhoto;
        let kenatPhoto = resolvedProfile.kenatPhoto;
        let faizName = resolvedProfile.faizName;
        let kenatName = resolvedProfile.kenatName;

        for (const item of data) {
          const row = item as Record<string, unknown>;
          const directKenat = pickFirstString(row, [
            'kenat_photo',
            'kenatPhoto',
            'foto_kenat',
          ]);
          const directFaiz = pickFirstString(row, [
            'faiz_photo',
            'faizPhoto',
            'foto_faiz',
          ]);
          if (directKenat) kenatPhoto = directKenat;
          if (directFaiz) faizPhoto = directFaiz;

          const identifier = pickFirstString(row, [
            'role',
            'username',
            'name',
            'nama',
            'display_name',
            'id',
          ]).toLowerCase();

          const photoUrl = pickFirstString(row, [
            'avatar_url',
            'photo_url',
            'foto_profil',
            'profile_photo',
            'foto',
            'photo',
            'avatar',
            'image_url',
          ]);
          const rowName = pickFirstString(row, [
            'display_name',
            'nama',
            'name',
            'username',
          ]);

          if (identifier.includes('kenat')) {
            if (photoUrl) kenatPhoto = photoUrl;
            if (rowName) kenatName = rowName;
          } else if (identifier.includes('faiz')) {
            if (photoUrl) faizPhoto = photoUrl;
            if (rowName) faizName = rowName;
          }
        }

        if (active) {
          setLiveProfile((prev) => ({
            ...prev,
            faizName,
            kenatName,
            faizPhoto,
            kenatPhoto,
          }));
        }
      } catch {
        // fallback ke resolvedProfile yang sudah dimuat dari Supabase
      }
    })();

    return () => {
      active = false;
    };
  }, [resolvedProfile]);

  const [savedMeta, setSavedMeta] = useState<MonopoliSavedRoom | null>(() =>
    loadSavedMonopoliRoom()
  );

  const defaultAccountName =
    currentUser === 'faiz'
      ? liveProfile.faizName || 'faiz'
      : liveProfile.kenatName || 'kenat';

  const [playerName, setPlayerName] = useState<string>(
    () => savedMeta?.playerName || defaultAccountName
  );
  useEffect(() => {
    if (!savedMeta && defaultAccountName) {
      setPlayerName((prev) => (prev ? prev : defaultAccountName));
    }
  }, [defaultAccountName, savedMeta]);

  const [showJoinInput, setShowJoinInput] = useState(false);
  const [joinCodeInput, setJoinCodeInput] = useState('');
  const [setupError, setSetupError] = useState<string | null>(null);
  const [isRoomBusy, setIsRoomBusy] = useState(false);

  const [room, setRoom] = useState<MonopoliRoomRow | null>(null);
  const [mySlot, setMySlot] = useState<MonopoliSlot | null>(
    () => savedMeta?.playerSlot ?? null
  );
  const [players, setPlayers] = useState<MonopoliPlayerRow[]>([]);
  const [gameState, setGameState] = useState<MonopoliGameState>(DEFAULT_MONO_STATE);
  const [visualPositions, setVisualPositions] = useState<Record<MonopoliSlot, number>>({
    player1: 0,
    player2: 0,
  });

  const [isRolling, setIsRolling] = useState(false);
  const [isAnimatingMove, setIsAnimatingMove] = useState(false);
  const [hoppingSlot, setHoppingSlot] = useState<MonopoliSlot | null>(null);
  const [diceDisplay, setDiceDisplay] = useState<[number, number]>([1, 1]);
  const [boardToast, setBoardToast] = useState<string | null>(null);
  const [copiedCodeToast, setCopiedCodeToast] = useState<string | null>(null);
  const [selectedTileInfo, setSelectedTileInfo] = useState<MonopoliTile | null>(null);
  const [activeInfoTab, setActiveInfoTab] = useState<'properti' | 'riwayat'>('properti');
  const [botTurnNonce, setBotTurnNonce] = useState(0);

  // Chat states
  const [rawChats, setRawChats] = useState<MonopoliRawChatRow[]>([]);
  const [setupChats, setSetupChats] = useState<ParsedMonoChat[]>([]);
  const [botChats, setBotChats] = useState<ParsedMonoChat[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [replyingTo, setReplyingTo] = useState<ParsedMonoChat | null>(null);
  const [activeBubbleMenu, setActiveBubbleMenu] = useState<string | null>(null);
  const [reactTargetMsg, setReactTargetMsg] = useState<ParsedMonoChat | null>(null);
  const [reactionDetailMsgId, setReactionDetailMsgId] = useState<string | null>(null);
  const [showInputEmojiPicker, setShowInputEmojiPicker] = useState(false);

  const roomRef = useRef<MonopoliRoomRow | null>(null);
  const mySlotRef = useRef<MonopoliSlot | null>(mySlot);
  const playersRef = useRef<MonopoliPlayerRow[]>(players);
  const gameStateRef = useRef<MonopoliGameState>(gameState);
  const isAnimatingRef = useRef<boolean>(isAnimatingMove);
  const isRollingRef = useRef<boolean>(isRolling);
  const rollLockRef = useRef<boolean>(false);
  const botBusyRef = useRef<boolean>(false);
  const animCancelRef = useRef<boolean>(false);
  const lastAnimVersionRef = useRef<number>(-1);
  const lastReadAckAtRef = useRef<number>(0);
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
  gameStateRef.current = gameState;
  isAnimatingRef.current = isAnimatingMove;
  isRollingRef.current = isRolling;

  const isBotRoom = room?.id === MONOPOLI_BOT_ROOM_ID;

  const foldedRemote = useMemo(
    () => foldMonopoliRawRows(rawChats, currentUser, mySlot),
    [rawChats, currentUser, mySlot]
  );

  const activeChats = !room
    ? setupChats
    : isBotRoom
    ? botChats
    : foldedRemote.chats;

  const showBoardToast = useCallback((msg: string, ms = 2400) => {
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
        !target.closest('[data-mono-bubble-menu="true"]') &&
        !target.closest('[data-mono-chat-bubble="true"]')
      ) {
        setActiveBubbleMenu(null);
      }
      if (showInputEmojiPicker && !target.closest('[data-mono-chat-input="true"]')) {
        setShowInputEmojiPicker(false);
      }
    };
    document.addEventListener('pointerdown', handleOutside, true);
    return () => document.removeEventListener('pointerdown', handleOutside, true);
  }, [activeBubbleMenu, showInputEmojiPicker]);

  // Step-by-step clockwise pawn animation (pelan & memantul per kotak seperti Ular Tangga & Ludo)
  const animateMonopoliMove = useCallback(async (nextState: MonopoliGameState) => {
    if (nextState.version <= lastAnimVersionRef.current) return;
    lastAnimVersionRef.current = nextState.version;

    const mv = nextState.lastMove;
    if (!mv || mv.steps <= 0) {
      setHoppingSlot(null);
      setVisualPositions(nextState.positions);
      return;
    }

    animCancelRef.current = false;
    isAnimatingRef.current = true;
    setIsAnimatingMove(true);

    const sleep = (ms: number) =>
      new Promise<void>((res) => window.setTimeout(res, ms));

    const landedTile = (mv.from + mv.steps) % MONOPOLI_BOARD_TILES.length;

    try {
      for (let s = 1; s <= mv.steps; s++) {
        if (animCancelRef.current) break;
        const stepTile = (mv.from + s) % MONOPOLI_BOARD_TILES.length;
        setHoppingSlot(mv.slot);
        setVisualPositions((prev) => ({ ...prev, [mv.slot]: stepTile }));
        soundFX.playClick();
        await sleep(400);
        setHoppingSlot(null);
        await sleep(90);
      }

      if (!animCancelRef.current) {
        const finalTile = nextState.positions[mv.slot];
        if (finalTile !== landedTile) {
          await sleep(380);
          setHoppingSlot(mv.slot);
          setVisualPositions((prev) => ({ ...prev, [mv.slot]: finalTile }));
          soundFX.playPop();
          await sleep(460);
          setHoppingSlot(null);
        } else {
          setVisualPositions(nextState.positions);
          await sleep(220);
        }
      }
    } finally {
      setHoppingSlot(null);
      isAnimatingRef.current = false;
      setIsAnimatingMove(false);
    }
  }, []);

  // Sync incoming remote Monopoli state
  useEffect(() => {
    if (!room || isBotRoom) return;
    const remote = foldedRemote.latestState;
    if (!remote) return;
    if (remote.version > gameStateRef.current.version) {
      const isInitialHydrate =
        gameStateRef.current.version === 0 && remote.version > 1;
      gameStateRef.current = remote;
      setGameState(remote);
      if (remote.lastDice && !isRollingRef.current) {
        setDiceDisplay([
          clampDiceValue(remote.lastDice[0]),
          clampDiceValue(remote.lastDice[1]),
        ]);
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
        setVisualPositions(remote.positions);
      } else {
        void animateMonopoliMove(remote);
      }
    }
  }, [foldedRemote.latestState, isBotRoom, room, animateMonopoliMove]);

  const loadRoomChats = useCallback(async (roomId: string) => {
    const sb = getSupabaseClient();
    if (!sb || !roomId) return;
    const { data, error } = await sb
      .from('game_chats')
      .select('*')
      .eq('room_id', roomId)
      .order('created_at', { ascending: true });

    if (!error && Array.isArray(data)) {
      const rows = data as MonopoliRawChatRow[];
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

  // Mark partner's messages as read cleanly
  useEffect(() => {
    if (!room || isBotRoom) return;
    const partnerMsgs = foldedRemote.chats.filter(
      (c) => c.senderRole !== currentUser
    );
    if (partnerMsgs.length === 0) return;
    const latestPartnerAt =
      new Date(partnerMsgs[partnerMsgs.length - 1].created_at).getTime() || 0;
    const myAck = foldedRemote.readByRole[currentUser] || 0;
    if (
      latestPartnerAt > myAck &&
      latestPartnerAt > lastReadAckAtRef.current
    ) {
      lastReadAckAtRef.current = latestPartnerAt;
      const sb = getSupabaseClient();
      if (!sb) return;
      const ackPayload = { role: currentUser, at: latestPartnerAt };
      roomChanRef.current
        ?.send({ type: 'broadcast', event: 'mono_read', payload: ackPayload })
        .catch(() => {});
      void sb
        .from('game_chats')
        .insert([
          {
            room_id: room.id,
            player_slot: mySlotRef.current || 'player1',
            sender_name: MONOPOLI_READ_MARKER,
            sender_emoji: '✓',
            message: JSON.stringify(ackPayload),
          },
        ])
        .then(() => {});
    }
  }, [
    room,
    isBotRoom,
    foldedRemote.chats,
    foldedRemote.readByRole,
    currentUser,
  ]);

  const fetchMonopoliSnapshot = useCallback(
    async (roomId: string) => {
      const sb = getSupabaseClient();
      if (!sb || !roomId) return;

      const [roomRes, playersRes] = await Promise.all([
        sb.from('game_rooms').select('*').eq('id', roomId).maybeSingle(),
        sb.from('game_players').select('*').eq('room_id', roomId),
      ]);

      if (!roomRes.error && roomRes.data) {
        const r = roomRes.data as MonopoliRoomRow;
        const mappedRoom: MonopoliRoomRow = {
          id: String(r.id),
          room_code: String(r.room_code),
          status: (r.status || 'waiting') as MonopoliRoomRow['status'],
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
        const pList = (playersRes.data as MonopoliPlayerRow[]).map((p) => ({
          ...p,
          player_slot: (p.player_slot === 'player2'
            ? 'player2'
            : 'player1') as MonopoliSlot,
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

  const subscribeMonopoliRealtime = useCallback(
    (roomId: string) => {
      const sb = getSupabaseClient();
      if (!sb || !roomId) return () => {};

      const channel = sb
        .channel(`keiz_monopoli_room_${roomId}`, {
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
            const next = payload.new as Partial<MonopoliRoomRow> | undefined;
            if (!next || !next.id) return;
            setRoom((prev) => ({
              id: String(next.id),
              room_code: String(next.room_code ?? prev?.room_code ?? ''),
              status: (next.status ?? prev?.status ?? 'waiting') as MonopoliRoomRow['status'],
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
              void fetchMonopoliSnapshot(roomId);
              return;
            }
            const row = payload.new as Partial<MonopoliPlayerRow> | undefined;
            if (!row || !row.player_slot) return;
            const slot: MonopoliSlot =
              row.player_slot === 'player2' ? 'player2' : 'player1';
            const mapped: MonopoliPlayerRow = {
              id: row.id,
              room_id: String(row.room_id ?? roomId),
              player_slot: slot,
              name: String(row.name ?? ''),
              avatar_emoji: String(
                row.avatar_emoji ?? (slot === 'player1' ? 'faiz' : 'kenat')
              ),
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
            const inserted = payload.new as MonopoliRawChatRow | undefined;
            if (!inserted || !inserted.id) return;
            setRawChats((prev) =>
              prev.some((c) => c.id === inserted.id) ? prev : [...prev, inserted]
            );
            if (
              inserted.sender_name !== MONOPOLI_STATE_MARKER &&
              inserted.sender_name !== MONOPOLI_READ_MARKER &&
              inserted.sender_name !== MONOPOLI_REACT_MARKER &&
              inserted.message !== MONOPOLI_DELETED_MARKER &&
              !seenChatIdsRef.current.has(inserted.id)
            ) {
              seenChatIdsRef.current.add(inserted.id);
              const senderRole = inferMonoSenderRole(
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
        .on('broadcast', { event: 'mono_sync' }, ({ payload }) => {
          const sync = payload as MonopoliGameState | undefined;
          if (!sync || typeof sync.version !== 'number') return;
          if (sync.version > gameStateRef.current.version) {
            gameStateRef.current = sync;
            setGameState(sync);
            if (sync.lastDice && !isRollingRef.current) {
              setDiceDisplay([
                clampDiceValue(sync.lastDice[0]),
                clampDiceValue(sync.lastDice[1]),
              ]);
            }
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
            void animateMonopoliMove(sync);
          }
        })
        .on('broadcast', { event: 'mono_read' }, ({ payload }) => {
          const p = payload as { role?: Role; at?: number } | undefined;
          if (!p?.role || !p.at) return;
          const readerRole: Role = p.role;
          const readAt = p.at;
          setRawChats((prev) => [
            ...prev,
            {
              id: `read-bc-${readerRole}-${readAt}`,
              room_id: roomId,
              player_slot: readerRole,
              sender_name: MONOPOLI_READ_MARKER,
              sender_emoji: '✓',
              message: JSON.stringify({ role: readerRole, at: readAt }),
              created_at: new Date().toISOString(),
            },
          ]);
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
    [animateMonopoliMove, currentUser, fetchMonopoliSnapshot, loadRoomChats]
  );

  // Hydrate saved Monopoli room
  useEffect(() => {
    if (!savedMeta?.roomId || savedMeta.roomId === MONOPOLI_BOT_ROOM_ID) return;
    let active = true;
    void fetchMonopoliSnapshot(savedMeta.roomId);
    const unsub = subscribeMonopoliRealtime(savedMeta.roomId);
    const poll = window.setInterval(() => {
      if (active && !isAnimatingRef.current && !isRollingRef.current) {
        void fetchMonopoliSnapshot(savedMeta.roomId);
      }
    }, 3000);
    return () => {
      active = false;
      window.clearInterval(poll);
      unsub();
    };
  }, [savedMeta?.roomId, fetchMonopoliSnapshot, subscribeMonopoliRealtime]);

  // Setup Chat Realtime Channel (Pra-Main)
  useEffect(() => {
    const sb = getSupabaseClient();
    if (!sb) return;
    const chan = sb
      .channel('keiz_monopoli_setup_chat_room', {
        config: { broadcast: { self: false } },
      })
      .on('broadcast', { event: 'setup_chat' }, ({ payload }) => {
        const msg = payload as ParsedMonoChat | undefined;
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

  const pushMonopoliState = useCallback(
    async (nextState: MonopoliGameState, actorSlot?: MonopoliSlot) => {
      gameStateRef.current = nextState;
      setGameState(nextState);
      if (nextState.lastDice && !isRollingRef.current) {
        setDiceDisplay([
          clampDiceValue(nextState.lastDice[0]),
          clampDiceValue(nextState.lastDice[1]),
        ]);
      }
      setRoom((prev) =>
        prev
          ? {
              ...prev,
              status: nextState.status,
              current_turn: nextState.currentTurn,
              winner: nextState.winner,
            }
          : prev
      );

      if (roomRef.current?.id === MONOPOLI_BOT_ROOM_ID) {
        return;
      }

      const sb = getSupabaseClient();
      const curRoom = roomRef.current;
      if (!sb || !curRoom) return;

      roomChanRef.current
        ?.send({
          type: 'broadcast',
          event: 'mono_sync',
          payload: nextState,
        })
        .catch(() => {});

      await Promise.all([
        sb.from('game_chats').insert([
          {
            room_id: curRoom.id,
            player_slot: actorSlot || mySlotRef.current || 'player1',
            sender_name: MONOPOLI_STATE_MARKER,
            sender_emoji: '🎩',
            message: JSON.stringify(nextState),
          },
        ]),
        sb
          .from('game_rooms')
          .update({
            status: nextState.status,
            current_turn: nextState.currentTurn,
            winner: nextState.winner,
          })
          .eq('id', curRoom.id),
        sb
          .from('game_players')
          .update({ position: nextState.coins.player1 })
          .eq('room_id', curRoom.id)
          .eq('player_slot', 'player1'),
        sb
          .from('game_players')
          .update({ position: nextState.coins.player2 })
          .eq('room_id', curRoom.id)
          .eq('player_slot', 'player2'),
      ]);
    },
    []
  );

  const createMonopoliRoom = async () => {
    const cleanName = playerName.trim() || defaultAccountName;
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
      const roomCode = generateMonopoliRoomCode();
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
          avatar_emoji: currentUser,
          position: INITIAL_COINS,
        },
      ]);

      if (playerErr) {
        setSetupError(playerErr.message || 'Gagal mendaftarkan pemain.');
        return;
      }

      const meta: MonopoliSavedRoom = {
        roomId: newRoomId,
        roomCode: String(roomData.room_code || roomCode),
        playerSlot: 'player1',
        playerName: cleanName,
      };
      saveMonopoliRoomToStorage(meta);
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
      gameStateRef.current = DEFAULT_MONO_STATE;
      setGameState(DEFAULT_MONO_STATE);
      setVisualPositions({ player1: 0, player2: 0 });
      setDiceDisplay([1, 1]);
      lastAnimVersionRef.current = -1;
      await fetchMonopoliSnapshot(newRoomId);
    } finally {
      setIsRoomBusy(false);
    }
  };

  const joinMonopoliRoom = async () => {
    const cleanName = playerName.trim() || defaultAccountName;
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
        ? (existingPlayers as MonopoliPlayerRow[])
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
          avatar_emoji: currentUser,
          position: INITIAL_COINS,
        },
      ]);

      if (joinErr) {
        setSetupError(joinErr.message || 'Gagal masuk room.');
        return;
      }

      const meta: MonopoliSavedRoom = {
        roomId: targetRoomId,
        roomCode: String(foundRoom.room_code || cleanCode),
        playerSlot: 'player2',
        playerName: cleanName,
      };
      saveMonopoliRoomToStorage(meta);
      setSavedMeta(meta);
      onSavedRoomChange(meta);
      setMySlot('player2');
      setRoom({
        id: targetRoomId,
        room_code: meta.roomCode,
        status: (foundRoom.status || 'waiting') as MonopoliRoomRow['status'],
        current_turn: foundRoom.current_turn === 'player2' ? 'player2' : 'player1',
        winner: foundRoom.winner ? String(foundRoom.winner) : null,
      });
      setShowJoinInput(false);
      setJoinCodeInput('');
      await fetchMonopoliSnapshot(targetRoomId);
    } finally {
      setIsRoomBusy(false);
    }
  };

  const setMonopoliReady = async () => {
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

    await fetchMonopoliSnapshot(room.id);
  };

  const startMonopoliGame = async () => {
    if (!room) return;
    soundFX.playHeartBurst();
    const initState: MonopoliGameState = {
      ...DEFAULT_MONO_STATE,
      version: Math.max(1, gameStateRef.current.version + 1),
      status: 'playing',
      currentTurn: 'player1',
      winner: null,
      roundCount: 1,
      positions: { player1: 0, player2: 0 },
      coins: { player1: INITIAL_COINS, player2: INITIAL_COINS },
      jailTurns: { player1: 0, player2: 0 },
      properties: {},
      lastDice: [1, 1],
      consecutiveDoubles: 0,
      pendingCard: null,
      transactions: [
        {
          id: `tx-init-${Date.now()}`,
          text: 'Permainan Monopoli Couple dimulai! Modal awal 1.500 Koin Cinta 💰',
          created_at: new Date().toISOString(),
        },
      ],
    };
    setVisualPositions(initState.positions);
    setDiceDisplay([1, 1]);
    lastAnimVersionRef.current = initState.version;
    await pushMonopoliState(initState);
  };

  const startMonopoliBotGame = () => {
    const cleanName = playerName.trim() || defaultAccountName;
    if (!cleanName) {
      setSetupError('Isi nama kamu dulu ya!');
      return;
    }
    soundFX.playHeartBurst();
    setSetupError(null);
    lastAnimVersionRef.current = 1;
    setMySlot('player1');
    const partnerRole: Role = currentUser === 'faiz' ? 'kenat' : 'faiz';
    const partnerDefaultName =
      partnerRole === 'faiz'
        ? liveProfile.faizName || 'faiz'
        : liveProfile.kenatName || 'kenat';

    setRoom({
      id: MONOPOLI_BOT_ROOM_ID,
      room_code: 'BOT-MONO',
      status: 'playing',
      current_turn: 'player1',
      winner: null,
    });
    setPlayers([
      {
        room_id: MONOPOLI_BOT_ROOM_ID,
        player_slot: 'player1',
        name: cleanName,
        avatar_emoji: currentUser,
        position: INITIAL_COINS,
        is_ready: true,
      },
      {
        room_id: MONOPOLI_BOT_ROOM_ID,
        player_slot: 'player2',
        name: `${partnerDefaultName} (Bot)`,
        avatar_emoji: partnerRole,
        position: INITIAL_COINS,
        is_ready: true,
      },
    ]);
    const initState: MonopoliGameState = {
      ...DEFAULT_MONO_STATE,
      version: 1,
      status: 'playing',
      currentTurn: 'player1',
      roundCount: 1,
      transactions: [
        {
          id: `tx-bot-init-${Date.now()}`,
          text: 'Mode Tes Monopoli Couple dimulai! Modal awal 1.500 Koin Cinta 💰',
          created_at: new Date().toISOString(),
        },
      ],
    };
    gameStateRef.current = initState;
    setGameState(initState);
    setVisualPositions({ player1: 0, player2: 0 });
    setDiceDisplay([1, 1]);
    setBotChats([]);
    setBoardToast(null);
    botBusyRef.current = false;
    isAnimatingRef.current = false;
    isRollingRef.current = false;
    setIsRolling(false);
    setIsAnimatingMove(false);
    setBotTurnNonce(0);
  };

  const leaveMonopoliRoom = async () => {
    soundFX.playClick();
    animCancelRef.current = true;
    botBusyRef.current = false;
    isAnimatingRef.current = false;
    isRollingRef.current = false;
    const curRoom = roomRef.current;
    const curSlot = mySlotRef.current;
    saveMonopoliRoomToStorage(null);
    setSavedMeta(null);
    onSavedRoomChange(null);
    setRoom(null);
    setMySlot(null);
    setPlayers([]);
    setRawChats([]);
    setBotChats([]);
    gameStateRef.current = DEFAULT_MONO_STATE;
    setGameState(DEFAULT_MONO_STATE);
    setVisualPositions({ player1: 0, player2: 0 });
    setDiceDisplay([1, 1]);
    lastAnimVersionRef.current = -1;
    setBoardToast(null);
    setIsRolling(false);
    setIsAnimatingMove(false);

    if (curRoom?.id === MONOPOLI_BOT_ROOM_ID) return;
    const sb = getSupabaseClient();
    if (sb && curRoom && curSlot && curRoom.status === 'waiting') {
      await sb
        .from('game_players')
        .delete()
        .eq('room_id', curRoom.id)
        .eq('player_slot', curSlot);
    }
  };

  // Helper to compute next turn + round limit (20 putaran) + bankruptcy check
  const finalizeTurnProgression = useCallback(
    (
      draft: MonopoliGameState,
      actorSlot: MonopoliSlot,
      keepTurnOnDouble: boolean,
      txNote?: string
    ): MonopoliGameState => {
      const otherSlot: MonopoliSlot =
        actorSlot === 'player1' ? 'player2' : 'player1';
      const nextTransactions = txNote
        ? [
            {
              id: `tx-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
              text: txNote,
              created_at: new Date().toISOString(),
            },
            ...draft.transactions,
          ].slice(0, 40)
        : draft.transactions;

      // 1. Check bankruptcy (< 0 coins)
      if (draft.coins.player1 < 0 || draft.coins.player2 < 0) {
        const bankruptSlot: MonopoliSlot =
          draft.coins.player1 < 0 ? 'player1' : 'player2';
        const winnerSlot: MonopoliSlot =
          bankruptSlot === 'player1' ? 'player2' : 'player1';
        return {
          ...draft,
          status: 'finished',
          winner: winnerSlot,
          winReason: 'Lawan bangkrut! 💸',
          pendingCard: null,
          transactions: [
            {
              id: `tx-win-${Date.now()}`,
              text: 'Permainan selesai — lawan kehabisan Koin Cinta! 🏆',
              created_at: new Date().toISOString(),
            },
            ...nextTransactions,
          ].slice(0, 40),
        };
      }

      // 2. Determine next turn & round advancement
      let nextTurn: MonopoliSlot = actorSlot;
      let nextRound = draft.roundCount;
      let nextDoubles = draft.consecutiveDoubles;

      if (keepTurnOnDouble) {
        nextTurn = actorSlot;
      } else {
        nextDoubles = 0;
        nextTurn = otherSlot;
        if (actorSlot === 'player2') {
          nextRound = draft.roundCount + 1;
        }
      }

      // 3. Check 20-round completion
      if (nextRound > MAX_ROUNDS) {
        const calcAssets = (slot: MonopoliSlot) =>
          Object.entries(draft.properties).reduce((sum, [tId, owner]) => {
            if (owner !== slot) return sum;
            const tile = MONOPOLI_BOARD_TILES[Number(tId)];
            return sum + (tile?.price || 0);
          }, 0);

        const c1 = draft.coins.player1;
        const c2 = draft.coins.player2;
        let winner: string = 'draw';
        if (c1 > c2) winner = 'player1';
        else if (c2 > c1) winner = 'player2';
        else {
          const a1 = c1 + calcAssets('player1');
          const a2 = c2 + calcAssets('player2');
          if (a1 > a2) winner = 'player1';
          else if (a2 > a1) winner = 'player2';
        }

        return {
          ...draft,
          status: 'finished',
          winner,
          winReason: '20 Putaran Selesai! 👑',
          roundCount: MAX_ROUNDS,
          pendingCard: null,
          transactions: [
            {
              id: `tx-20r-${Date.now()}`,
              text: '20 Putaran selesai! Pemenang ditentukan dari Koin Cinta terbanyak 🏆',
              created_at: new Date().toISOString(),
            },
            ...nextTransactions,
          ].slice(0, 40),
        };
      }

      return {
        ...draft,
        currentTurn: nextTurn,
        roundCount: nextRound,
        consecutiveDoubles: nextDoubles,
        pendingCard: null,
        transactions: nextTransactions,
      };
    },
    []
  );

  const getPlayerLabel = useCallback((slot: MonopoliSlot): string => {
    const found = playersRef.current.find((p) => p.player_slot === slot);
    if (found?.name) return found.name;
    return slot === 'player1' ? 'Pemain 1' : 'Pemain 2';
  }, []);

  // Resolve landing on a tile after dice roll
  const processLandingForSlot = useCallback(
    async (
      slot: MonopoliSlot,
      d1: number,
      d2: number,
      fromPos: number,
      allowDoubleBonus: boolean
    ) => {
      const cur = gameStateRef.current;
      const otherSlot: MonopoliSlot = slot === 'player1' ? 'player2' : 'player1';
      const actorName = getPlayerLabel(slot);
      const totalSteps = d1 + d2;
      const isDouble = allowDoubleBonus && d1 === d2;
      const rawNext = fromPos + totalSteps;
      const passedStart = rawNext >= MONOPOLI_BOARD_TILES.length;
      const landingIdx = rawNext % MONOPOLI_BOARD_TILES.length;
      const tile = MONOPOLI_BOARD_TILES[landingIdx];

      const nextCoins = { ...cur.coins };
      const nextPositions = { ...cur.positions, [slot]: landingIdx };
      const nextJail = { ...cur.jailTurns };
      const notes: string[] = [];

      if (passedStart) {
        nextCoins[slot] += 200;
        notes.push(`${actorName} lewat START (+200 💰)`);
      }

      const nextDoubles = isDouble ? cur.consecutiveDoubles + 1 : 0;
      const tooManyDoubles = isDouble && nextDoubles >= 3;

      // 3x doubles -> straight to Penjara Cinta
      if (tooManyDoubles) {
        nextPositions[slot] = 10;
        nextJail[slot] = 1;
        const jailedState = finalizeTurnProgression(
          {
            ...cur,
            version: cur.version + 1,
            positions: nextPositions,
            coins: nextCoins,
            jailTurns: nextJail,
            lastDice: [d1, d2],
            consecutiveDoubles: 0,
            lastMove: {
              slot,
              from: fromPos,
              to: landingIdx,
              steps: totalSteps,
              passedStart,
            },
          },
          slot,
          false,
          `${actorName} dadu kembar 3x! Masuk Penjara Cinta 💘`
        );
        showBoardToast(`${actorName} kembar 3x! Masuk Penjara Cinta 💘`, 2600);
        await Promise.all([
          pushMonopoliState(jailedState, slot),
          animateMonopoliMove(jailedState),
        ]);
        if (roomRef.current?.id === MONOPOLI_BOT_ROOM_ID && jailedState.currentTurn === 'player2') {
          setBotTurnNonce((n) => n + 1);
        }
        return;
      }

      const baseDraft: MonopoliGameState = {
        ...cur,
        version: cur.version + 1,
        positions: nextPositions,
        coins: nextCoins,
        jailTurns: nextJail,
        lastDice: [d1, d2],
        consecutiveDoubles: nextDoubles,
        lastMove: {
          slot,
          from: fromPos,
          to: landingIdx,
          steps: totalSteps,
          passedStart,
        },
      };

      let finalState: MonopoliGameState | null = null;

      if (tile.type === 'start') {
        if (!passedStart) nextCoins[slot] += 200;
        finalState = finalizeTurnProgression(
          { ...baseDraft, coins: nextCoins },
          slot,
          isDouble,
          `${actorName} mendarat di START! Dapat +200 Koin Cinta 🏁`
        );
        showBoardToast(
          isDouble
            ? `${actorName} di START (+200) & Dadu Kembar! Lempar lagi! 🎲`
            : `${actorName} mendarat di START (+200 Koin Cinta) 🏁`,
          2500
        );
      } else if (tile.type === 'properti') {
        const owner = cur.properties[tile.id];
        const price = tile.price || 150;
        const rent = tile.rent || 50;

        if (!owner) {
          if (nextCoins[slot] >= price) {
            // Open Buy Property Card for active player!
            finalState = {
              ...baseDraft,
              pendingCard: {
                kind: 'buy_property',
                slot,
                tileId: tile.id,
                isDouble,
              },
              transactions: notes.length
                ? [
                    {
                      id: `tx-start-${Date.now()}`,
                      text: notes.join(' • '),
                      created_at: new Date().toISOString(),
                    },
                    ...cur.transactions,
                  ].slice(0, 40)
                : cur.transactions,
            };
          } else {
            finalState = finalizeTurnProgression(
              baseDraft,
              slot,
              isDouble,
              `${actorName} singgah di ${tile.name} (koin belum cukup beli)`
            );
            showBoardToast(`Singgah di ${tile.name} — koin belum cukup beli`, 2200);
          }
        } else if (owner === slot) {
          finalState = finalizeTurnProgression(
            baseDraft,
            slot,
            isDouble,
            `${actorName} mampir ke properti sendiri: ${tile.name} ${tile.emoji}`
          );
          showBoardToast(
            isDouble
              ? `Mampir di ${tile.name} & Dadu Kembar! Lempar lagi! 🎲`
              : `Mampir di properti sendiri: ${tile.name} ${tile.emoji}`,
            2200
          );
        } else {
          // Pay rent to opponent
          nextCoins[slot] -= rent;
          nextCoins[owner] += rent;
          const ownerName = getPlayerLabel(owner);
          finalState = finalizeTurnProgression(
            { ...baseDraft, coins: nextCoins },
            slot,
            isDouble,
            `${actorName} bayar sewa ${rent} Koin ke ${ownerName} di ${tile.name} ${tile.emoji}`
          );
          showBoardToast(
            `${actorName} bayar sewa ${rent} 💰 ke ${ownerName} di ${tile.name}!`,
            2600
          );
        }
      } else if (tile.type === 'hadiah') {
        const bonus = tile.id === 18 ? 160 : 120;
        nextCoins[slot] += bonus;
        finalState = finalizeTurnProgression(
          { ...baseDraft, coins: nextCoins },
          slot,
          isDouble,
          `${actorName} dapat ${tile.name}! +${bonus} Koin Cinta 🎁`
        );
        soundFX.playHeartBurst();
        showBoardToast(`${actorName} dapat ${tile.name} +${bonus} 💰!`, 2500);
      } else if (tile.type === 'masuk_penjara') {
        nextPositions[slot] = 10;
        nextJail[slot] = 1;
        finalState = finalizeTurnProgression(
          {
            ...baseDraft,
            positions: nextPositions,
            jailTurns: nextJail,
            consecutiveDoubles: 0,
          },
          slot,
          false,
          `${actorName} kena Penjara Cinta! 💘`
        );
        showBoardToast(`${actorName} masuk Penjara Cinta! 💘`, 2600);
      } else if (tile.type === 'penjara') {
        finalState = finalizeTurnProgression(
          baseDraft,
          slot,
          isDouble,
          `${actorName} cuma lewat kunjungi Penjara Cinta 🔒`
        );
        showBoardToast(`${actorName} cuma berkunjung di Penjara Cinta 🔒`, 2200);
      } else if (tile.type === 'tantangan') {
        const pick =
          COUPLE_MISSIONS[Math.floor(Math.random() * COUPLE_MISSIONS.length)];
        finalState = {
          ...baseDraft,
          pendingCard: {
            kind: 'tantangan',
            slot,
            tileId: tile.id,
            title: pick.title,
            desc: pick.desc,
            reward: pick.reward,
            isDouble,
          },
        };
      } else if (tile.type === 'hukuman') {
        const pick =
          SWEET_PUNISHMENTS[Math.floor(Math.random() * SWEET_PUNISHMENTS.length)];
        finalState = {
          ...baseDraft,
          pendingCard: {
            kind: 'hukuman',
            slot,
            tileId: tile.id,
            title: pick.title,
            desc: pick.desc,
            penalty: pick.penalty,
            isDouble,
          },
        };
      } else if (tile.type === 'kartu_cinta') {
        const pick = LOVE_CARDS[Math.floor(Math.random() * LOVE_CARDS.length)];
        finalState = {
          ...baseDraft,
          pendingCard: {
            kind: 'kartu_cinta',
            slot,
            tileId: tile.id,
            title: pick.title,
            desc: pick.desc,
            coinDelta: pick.coinDelta,
            transferToPartner: pick.transferToPartner,
            moveToStart: pick.moveToStart,
            isDouble,
          },
        };
      } else {
        // 'date'
        const pick = DATE_CARDS[Math.floor(Math.random() * DATE_CARDS.length)];
        finalState = {
          ...baseDraft,
          pendingCard: {
            kind: 'date',
            slot,
            tileId: tile.id,
            title: pick.title,
            desc: pick.desc,
            coinDelta: pick.coinDelta,
            isDouble,
          },
        };
      }

      if (!finalState) {
        finalState = finalizeTurnProgression(baseDraft, slot, isDouble);
      }

      if (isDouble && !finalState.pendingCard && finalState.status === 'playing' && !tooManyDoubles && tile.type !== 'masuk_penjara') {
        showBoardToast(
          `Dadu Kembar (${d1}+${d2})! ${actorName} dapat giliran lagi! 🎲🎲`,
          2600
        );
      }

      await Promise.all([
        pushMonopoliState(finalState, slot),
        animateMonopoliMove(finalState),
      ]);

      if (
        slot === 'player2' &&
        finalState.status === 'playing' &&
        !finalState.pendingCard &&
        roomRef.current?.id === MONOPOLI_BOT_ROOM_ID &&
        finalState.currentTurn === 'player2'
      ) {
        botBusyRef.current = false;
        setBotTurnNonce((n) => n + 1);
      }
      void otherSlot;
    },
    [animateMonopoliMove, finalizeTurnProgression, getPlayerLabel, pushMonopoliState, showBoardToast]
  );

  // Resolve Pending Card (Beli Properti / Lewati / Selesaikan Misi / Hukuman / Kartu Cinta / Date)
  const resolvePendingCard = useCallback(
    async (action: 'accept' | 'decline') => {
      const cur = gameStateRef.current;
      const card = cur.pendingCard;
      if (!card || cur.status !== 'playing') return;

      const slot = card.slot;
      const otherSlot: MonopoliSlot = slot === 'player1' ? 'player2' : 'player1';
      const actorName = getPlayerLabel(slot);
      const nextCoins = { ...cur.coins };
      const nextProps = { ...cur.properties };
      const nextPos = { ...cur.positions };
      let txNote = '';

      if (card.kind === 'buy_property') {
        const tile = MONOPOLI_BOARD_TILES[card.tileId];
        const price = tile.price || 150;
        if (action === 'accept' && nextCoins[slot] >= price) {
          nextCoins[slot] -= price;
          nextProps[tile.id] = slot;
          soundFX.playHeartBurst();
          txNote = `${actorName} beli ${tile.name} ${tile.emoji} seharga ${price} Koin!`;
          showBoardToast(
            card.isDouble
              ? `${actorName} beli ${tile.name}! Dadu Kembar, lempar lagi! 🎲`
              : `${actorName} resmi punya ${tile.name} ${tile.emoji}!`,
            2400
          );
        } else {
          soundFX.playClick();
          txNote = `${actorName} lewat beli ${tile.name}`;
        }
      } else if (card.kind === 'tantangan') {
        nextCoins[slot] += card.reward;
        soundFX.playHeartBurst();
        txNote = `${actorName} selesaikan ${card.title} (+${card.reward} Koin Cinta)`;
        showBoardToast(`${actorName} selesaikan misi! +${card.reward} 💰`, 2400);
      } else if (card.kind === 'hukuman') {
        nextCoins[slot] -= card.penalty;
        nextCoins[otherSlot] += card.penalty;
        soundFX.playPop();
        txNote = `${actorName} kena ${card.title} (kirim ${card.penalty} 💰 ke pasangan)`;
        showBoardToast(
          `${actorName} bayar hukuman manis ${card.penalty} 💰 ke pasangan!`,
          2400
        );
      } else if (card.kind === 'kartu_cinta') {
        if (card.moveToStart) {
          nextPos[slot] = 0;
          nextCoins[slot] += 200;
          txNote = `${actorName} dapat Kartu Cinta ke START (+200 💰)`;
        } else if (card.transferToPartner) {
          const amt = Math.abs(card.coinDelta);
          nextCoins[slot] -= amt;
          nextCoins[otherSlot] += amt;
          txNote = `${actorName} traktir pasangan ${amt} 💰 dari Kartu Cinta`;
        } else {
          nextCoins[slot] += card.coinDelta;
          txNote = `${actorName} dapat ${card.title} (${
            card.coinDelta >= 0 ? `+${card.coinDelta}` : card.coinDelta
          } 💰)`;
        }
        soundFX.playPop();
      } else if (card.kind === 'date') {
        nextCoins[slot] += card.coinDelta;
        soundFX.playPop();
        txNote = `${actorName} nikmati ${card.title} (${
          card.coinDelta >= 0 ? `+${card.coinDelta}` : card.coinDelta
        } 💰)`;
      }

      const nextState = finalizeTurnProgression(
        {
          ...cur,
          version: cur.version + 1,
          coins: nextCoins,
          properties: nextProps,
          positions: nextPos,
          lastMove: undefined,
        },
        slot,
        card.isDouble,
        txNote
      );

      setVisualPositions(nextState.positions);
      await pushMonopoliState(nextState, slot);

      if (
        nextState.status === 'playing' &&
        roomRef.current?.id === MONOPOLI_BOT_ROOM_ID &&
        nextState.currentTurn === 'player2'
      ) {
        setBotTurnNonce((n) => n + 1);
      }
    },
    [finalizeTurnProgression, getPlayerLabel, pushMonopoliState, showBoardToast]
  );

  // Pay 100 Koin Cinta to exit Penjara Cinta before rolling
  const payJailBail = async () => {
    const cur = gameStateRef.current;
    if (!room || !mySlot || cur.status !== 'playing') return;
    if (cur.currentTurn !== mySlot || cur.jailTurns[mySlot] <= 0) return;
    if (cur.coins[mySlot] < 100) {
      showBoardToast('Koin Cinta kurang dari 100! Coba lempar dadu kembar ya.', 2200);
      return;
    }

    soundFX.playPop();
    const actorName = getPlayerLabel(mySlot);
    const nextState: MonopoliGameState = {
      ...cur,
      version: cur.version + 1,
      coins: { ...cur.coins, [mySlot]: cur.coins[mySlot] - 100 },
      jailTurns: { ...cur.jailTurns, [mySlot]: 0 },
      lastMove: undefined,
      transactions: [
        {
          id: `tx-bail-${Date.now()}`,
          text: `${actorName} bayar tebusan cinta 100 💰 keluar dari Penjara Cinta!`,
          created_at: new Date().toISOString(),
        },
        ...cur.transactions,
      ].slice(0, 40),
    };
    showBoardToast('Bebas dari Penjara Cinta! Sekarang lempar dadu 🎲', 2200);
    await pushMonopoliState(nextState, mySlot);
  };

  // Roll 2 Digital Dice
  const rollMonopoliDice = async () => {
    const cur = gameStateRef.current;
    if (
      !room ||
      !mySlot ||
      isRolling ||
      isAnimatingMove ||
      rollLockRef.current ||
      cur.pendingCard !== null
    ) {
      return;
    }
    if (cur.status !== 'playing' || cur.currentTurn !== mySlot) return;

    rollLockRef.current = true;
    const sleep = (ms: number) =>
      new Promise<void>((res) => window.setTimeout(res, ms));

    try {
      const d1 = rollFairDiceValue();
      const d2 = rollFairDiceValue();
      let spinStopped = false;
      soundFX.playClick();
      isRollingRef.current = true;
      setIsRolling(true);

      const spinTimer = window.setInterval(() => {
        if (!spinStopped) {
          setDiceDisplay((prev) => [
            nextSpinDiceFace(prev[0]),
            nextSpinDiceFace(prev[1]),
          ]);
        }
      }, 115);

      await sleep(920);
      spinStopped = true;
      window.clearInterval(spinTimer);
      isRollingRef.current = false;
      setIsRolling(false);
      setDiceDisplay([d1, d2]);

      await sleep(420);
      if (roomRef.current?.id !== room.id) return;

      const latest = gameStateRef.current;
      const actorName = getPlayerLabel(mySlot);

      // Handle Penjara Cinta roll
      if (latest.jailTurns[mySlot] > 0) {
        if (d1 === d2) {
          showBoardToast(
            `Dadu Kembar (${d1}+${d2})! ${actorName} bebas dari Penjara Cinta! 🎉`,
            2400
          );
          gameStateRef.current = {
            ...latest,
            jailTurns: { ...latest.jailTurns, [mySlot]: 0 },
          };
          await processLandingForSlot(
            mySlot,
            d1,
            d2,
            latest.positions[mySlot],
            false
          );
        } else {
          const nextJailCount = Math.max(0, latest.jailTurns[mySlot] - 1);
          const nextState = finalizeTurnProgression(
            {
              ...latest,
              version: latest.version + 1,
              jailTurns: { ...latest.jailTurns, [mySlot]: nextJailCount },
              lastDice: [d1, d2],
              lastMove: undefined,
            },
            mySlot,
            false,
            `${actorName} di Penjara Cinta lempar ${d1}+${d2} (belum kembar, skip giliran)`
          );
          showBoardToast(
            `${d1} & ${d2} belum kembar! Masih istirahat di Penjara Cinta 🔒`,
            2400
          );
          await pushMonopoliState(nextState, mySlot);
          if (
            isBotRoom &&
            nextState.status === 'playing' &&
            nextState.currentTurn === 'player2'
          ) {
            setBotTurnNonce((n) => n + 1);
          }
        }
        return;
      }

      await processLandingForSlot(
        mySlot,
        d1,
        d2,
        latest.positions[mySlot],
        true
      );
    } finally {
      rollLockRef.current = false;
    }
  };

  // Bot Solo Test Auto-Turn Runner
  useEffect(() => {
    if (
      !room ||
      room.id !== MONOPOLI_BOT_ROOM_ID ||
      gameState.status !== 'playing'
    ) {
      return;
    }

    const pending = gameState.pendingCard;
    if (pending && pending.slot === 'player2') {
      let cancelled = false;
      const sleep = (ms: number) =>
        new Promise<void>((res) => window.setTimeout(res, ms));

      void (async () => {
        while (isAnimatingRef.current || isRollingRef.current) {
          if (cancelled || roomRef.current?.id !== MONOPOLI_BOT_ROOM_ID) return;
          await sleep(120);
        }
        await sleep(850);
        if (cancelled || roomRef.current?.id !== MONOPOLI_BOT_ROOM_ID) return;
        const latest = gameStateRef.current;
        if (latest.pendingCard?.slot === 'player2') {
          await resolvePendingCard('accept');
        }
      })();

      return () => {
        cancelled = true;
      };
    }

    if (gameState.currentTurn !== 'player2' || pending) return;
    if (botBusyRef.current) return;

    let cancelled = false;
    const sleep = (ms: number) =>
      new Promise<void>((res) => window.setTimeout(res, ms));

    botBusyRef.current = true;
    void (async () => {
      try {
        while (isAnimatingRef.current || isRollingRef.current) {
          if (cancelled || roomRef.current?.id !== MONOPOLI_BOT_ROOM_ID) return;
          await sleep(120);
        }

        await sleep(750);
        if (cancelled || roomRef.current?.id !== MONOPOLI_BOT_ROOM_ID) return;

        const latest = gameStateRef.current;
        if (
          latest.status !== 'playing' ||
          latest.currentTurn !== 'player2' ||
          latest.pendingCard
        ) {
          return;
        }

        const d1 = rollFairDiceValue();
        const d2 = rollFairDiceValue();
        let spinStopped = false;
        isRollingRef.current = true;
        setIsRolling(true);
        const spinTimer = window.setInterval(() => {
          if (!spinStopped && !cancelled) {
            setDiceDisplay((prev) => [
              nextSpinDiceFace(prev[0]),
              nextSpinDiceFace(prev[1]),
            ]);
          }
        }, 115);

        await sleep(880);
        spinStopped = true;
        window.clearInterval(spinTimer);
        isRollingRef.current = false;
        setIsRolling(false);
        if (cancelled || roomRef.current?.id !== MONOPOLI_BOT_ROOM_ID) {
          return;
        }
        setDiceDisplay([d1, d2]);
        await sleep(360);
        if (cancelled || roomRef.current?.id !== MONOPOLI_BOT_ROOM_ID) return;

        if (latest.jailTurns.player2 > 0) {
          if (d1 === d2) {
            gameStateRef.current = {
              ...latest,
              jailTurns: { ...latest.jailTurns, player2: 0 },
            };
            await processLandingForSlot(
              'player2',
              d1,
              d2,
              latest.positions.player2,
              false
            );
          } else {
            const nextState = finalizeTurnProgression(
              {
                ...latest,
                version: latest.version + 1,
                jailTurns: {
                  ...latest.jailTurns,
                  player2: Math.max(0, latest.jailTurns.player2 - 1),
                },
                lastDice: [d1, d2],
                lastMove: undefined,
              },
              'player2',
              false,
              `${getPlayerLabel('player2')} di Penjara Cinta lempar ${d1}+${d2}`
            );
            await pushMonopoliState(nextState, 'player2');
          }
          return;
        }

        await processLandingForSlot(
          'player2',
          d1,
          d2,
          latest.positions.player2,
          true
        );
      } finally {
        isRollingRef.current = false;
        botBusyRef.current = false;
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room?.id, gameState.status, gameState.currentTurn, gameState.pendingCard, botTurnNonce]);

  const handlePlayAgain = async () => {
    if (!room) return;
    await startMonopoliGame();
  };

  const handleBackToLobby = async () => {
    if (!room) return;
    if (room.id === MONOPOLI_BOT_ROOM_ID) {
      await leaveMonopoliRoom();
      return;
    }
    const sb = getSupabaseClient();
    if (!sb) return;
    soundFX.playClick();
    const resetState: MonopoliGameState = {
      ...DEFAULT_MONO_STATE,
      version: gameStateRef.current.version + 1,
      status: 'waiting',
    };
    setVisualPositions({ player1: 0, player2: 0 });
    setDiceDisplay([1, 1]);
    lastAnimVersionRef.current = resetState.version;

    await Promise.all([
      sb
        .from('game_players')
        .update({ position: INITIAL_COINS, is_ready: false })
        .eq('room_id', room.id),
      sb
        .from('game_rooms')
        .update({ status: 'waiting', current_turn: 'player1', winner: null })
        .eq('id', room.id),
      sb.from('game_chats').insert([
        {
          room_id: room.id,
          player_slot: mySlot || 'player1',
          sender_name: MONOPOLI_STATE_MARKER,
          sender_emoji: '🎩',
          message: JSON.stringify(resetState),
        },
      ]),
    ]);

    await fetchMonopoliSnapshot(room.id);
  };

  // ---------- CHAT HANDLERS ----------
  const sendMonoChat = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const cleaned = chatInput.trim();
    if (!cleaned) return;
    soundFX.playPop();
    setChatInput('');
    setShowInputEmojiPicker(false);
    const activeReply = replyingTo;
    setReplyingTo(null);
    const cleanName = playerName.trim() || defaultAccountName;

    if (!room || room.id === MONOPOLI_BOT_ROOM_ID) {
      const msg: ParsedMonoChat = {
        id: `${room ? 'mono-bot' : 'mono-setup'}-${Date.now()}-${Math.random()
          .toString(36)
          .slice(2, 6)}`,
        player_slot: currentUser,
        senderRole: currentUser,
        senderName: cleanName,
        senderEmoji: currentUser,
        text: cleaned,
        replyToId: activeReply?.id,
        replyToSender: activeReply?.senderRole,
        replyToText: activeReply?.text,
        isRead: Boolean(room),
        created_at: new Date().toISOString(),
      };
      if (room?.id === MONOPOLI_BOT_ROOM_ID) {
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
    const encodedMsg = encodeMonoChatPayload(cleaned, activeReply);
    const { data, error } = await sb
      .from('game_chats')
      .insert([
        {
          room_id: room.id,
          player_slot: mySlot || 'player1',
          sender_name: cleanName,
          sender_emoji: currentUser,
          message: encodedMsg,
        },
      ])
      .select('*')
      .single();

    if (!error && data) {
      const row = data as MonopoliRawChatRow;
      seenChatIdsRef.current.add(row.id);
      setRawChats((prev) =>
        prev.some((c) => c.id === row.id) ? prev : [...prev, row]
      );
    }
  };

  const applyMonoChatReaction = async (
    msg: ParsedMonoChat,
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

    if (!room || room.id === MONOPOLI_BOT_ROOM_ID) {
      if (room?.id === MONOPOLI_BOT_ROOM_ID) {
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
          sender_name: MONOPOLI_REACT_MARKER,
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
      const row = data as MonopoliRawChatRow;
      setRawChats((prev) =>
        prev.some((c) => c.id === row.id) ? prev : [...prev, row]
      );
    }
  };

  const handleDeleteMonoChatMsg = async (msgId: string) => {
    soundFX.playClick();
    setActiveBubbleMenu(null);

    if (!room || room.id === MONOPOLI_BOT_ROOM_ID) {
      if (room?.id === MONOPOLI_BOT_ROOM_ID) {
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
        .update({ message: MONOPOLI_DELETED_MARKER })
        .eq('id', msgId);
    }
    roomChanRef.current
      ?.send({ type: 'broadcast', event: 'chat_deleted', payload: { id: msgId } })
      .catch(() => {});
  };

  // Profile resolution directly from `profiles` table
  const resolveRoleFromMeta = (avatarKey?: string, name?: string): Role => {
    if (avatarKey === 'faiz' || avatarKey === '🐻') return 'faiz';
    if (avatarKey === 'kenat' || avatarKey === '🐰') return 'kenat';
    const lower = (name || '').toLowerCase();
    if (lower.includes('kenat')) return 'kenat';
    if (lower.includes('faiz')) return 'faiz';
    return currentUser;
  };

  const getRolePhoto = (role: Role) =>
    role === 'faiz' ? liveProfile.faizPhoto : liveProfile.kenatPhoto;

  const getRoleName = (role: Role) =>
    role === 'faiz'
      ? liveProfile.faizName || 'faiz'
      : liveProfile.kenatName || 'kenat';

  const renderProfileImg = (
    role: Role,
    displayName: string,
    sizeClass = 'h-12 w-12',
    ringOverride?: string
  ) => {
    const photoUrl = getRolePhoto(role);
    const borderColor =
      ringOverride || (role === 'faiz' ? 'border-[#3B82F6]' : 'border-[#FF2E7E]');
    return (
      <div
        className={`flex ${sizeClass} shrink-0 items-center justify-center overflow-hidden rounded-full border-2 ${borderColor} bg-[#FFF2F7] shadow-sm`}
      >
        {photoUrl ? (
          <img
            src={photoUrl}
            alt={displayName || getRoleName(role)}
            referrerPolicy="no-referrer"
            className="h-full w-full object-cover"
          />
        ) : (
          <span className="text-[10px] font-extrabold text-[#D81B6E]">
            {(displayName || getRoleName(role)).slice(0, 1).toUpperCase()}
          </span>
        )}
      </div>
    );
  };

  const p1 = players.find((p) => p.player_slot === 'player1') || null;
  const p2 = players.find((p) => p.player_slot === 'player2') || null;
  const mePlayer = mySlot
    ? players.find((p) => p.player_slot === mySlot) || null
    : null;
  const bothReady = Boolean(p1 && p2 && p1.is_ready && p2.is_ready);
  const amIReady = Boolean(mePlayer?.is_ready);

  const p1Role = resolveRoleFromMeta(p1?.avatar_emoji, p1?.name || 'faiz');
  const p2Role = resolveRoleFromMeta(
    p2?.avatar_emoji,
    p2?.name || (p1Role === 'faiz' ? 'kenat' : 'faiz')
  );

  const isMyTurn = Boolean(
    room &&
      mySlot &&
      gameState.status === 'playing' &&
      gameState.currentTurn === mySlot &&
      !gameState.pendingCard
  );
  const myInJail = Boolean(mySlot && gameState.jailTurns[mySlot] > 0);

  const currentTurnPlayer =
    gameState.currentTurn === 'player1' ? p1 : p2;
  const currentTurnRole: Role =
    gameState.currentTurn === 'player1' ? p1Role : p2Role;
  const currentTurnName =
    currentTurnPlayer?.name || getRoleName(currentTurnRole);

  const winnerName = useMemo(() => {
    if (!gameState.winner) return 'Pemenang';
    if (gameState.winner === 'draw') return 'Seri Berdua';
    const found = players.find((p) => p.player_slot === gameState.winner);
    return found?.name || getRoleName(gameState.winner === 'player1' ? p1Role : p2Role);
  }, [gameState.winner, players, p1Role, p2Role]);

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

  const activeDetailChat = reactionDetailMsgId
    ? activeChats.find((m) => m.id === reactionDetailMsgId)
    : undefined;

  const canActPendingCard = Boolean(
    gameState.pendingCard &&
      mySlot &&
      gameState.pendingCard.slot === mySlot &&
      gameState.status === 'playing'
  );

  return (
    <section
      id="page-monopoli-couple"
      className="animate-slide-in-right flex min-h-full w-full flex-col gap-3 pb-4"
    >
      {/* Top Bar */}
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
              <AppleTextWithEmojis text="🎲 Monopoli Couple" emojiSize={20} />
            </h2>
            <p className="mt-0.5 text-[11px] font-bold text-[#8A6A7A]">
              Main monopoli romantis berdua real-time (20 putaran)
            </p>
          </div>

          <div className="flex items-center gap-3 rounded-2xl border border-[#FFD6E7] bg-[#FFF5F9] p-3">
            {renderProfileImg(currentUser, playerName || currentUser, 'h-12 w-12')}
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-extrabold uppercase tracking-wide text-[#8A6A7A]">
                Profil: {getRoleName(currentUser)}
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
              onClick={() => void createMonopoliRoom()}
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
            onClick={startMonopoliBotGame}
            className="btn-bucin flex min-h-[46px] w-full items-center justify-center gap-2 rounded-full border border-[#FFD6E7] bg-[#FFF5F9] px-4 text-xs font-extrabold text-[#D81B6E] shadow-xs cursor-pointer"
          >
            <Sparkles className="h-4 w-4 text-[#FF2E7E]" />
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
                placeholder="MONO-A1B2"
                maxLength={12}
                className="h-10 flex-1 rounded-xl border border-[#FFD6E7] bg-white px-3 text-xs font-extrabold uppercase tracking-wider text-[#2D0A1E] placeholder-[#9A7A8A] focus:border-[#FF2E7E] focus:outline-none"
              />
              <button
                type="button"
                disabled={isRoomBusy}
                onClick={() => void joinMonopoliRoom()}
                className="btn-bucin h-10 rounded-xl bg-[#FF2E7E] px-4 text-xs font-extrabold text-white shadow cursor-pointer disabled:opacity-50"
              >
                Masuk
              </button>
            </div>
          )}
        </div>
      )}

      {/* B. LOBBY VIEW */}
      {room && gameState.status === 'waiting' && room.status === 'waiting' && (
        <div className="keiz-sticker-card space-y-3.5 rounded-3xl bg-white p-4">
          <div className="rounded-2xl border border-[#FFD6E7] bg-gradient-to-br from-[#FFF2F7] to-[#FFE3EE] p-3.5 text-center">
            <p className="text-[10px] font-extrabold uppercase tracking-wider text-[#8A6A7A]">
              Kode Room Monopoli Couple
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
              { slot: 'player1' as MonopoliSlot, label: 'Pemain 1', data: p1, role: p1Role },
              { slot: 'player2' as MonopoliSlot, label: 'Pemain 2', data: p2, role: p2Role },
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
                    renderProfileImg(item.role, item.data.name, 'h-12 w-12')
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
              onClick={() => void setMonopoliReady()}
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
                onClick={() => void startMonopoliGame()}
                className="keiz-btn-primary btn-bucin animate-bubble-pop flex min-h-[50px] w-full items-center justify-center text-sm font-extrabold cursor-pointer"
              >
                <AppleTextWithEmojis text="MULAI MAIN 🎲" emojiSize={16} />
              </button>
            )}

            <button
              type="button"
              onClick={() => void leaveMonopoliRoom()}
              className="flex min-h-[40px] w-full items-center justify-center gap-1.5 rounded-full border border-rose-200 bg-rose-50 text-xs font-extrabold text-rose-600 cursor-pointer"
            >
              <LogOut className="h-3.5 w-3.5" />
              <span>Keluar Room</span>
            </button>
          </div>
        </div>
      )}

      {/* C. PLAYING / FINISHED VIEW */}
      {room && (gameState.status === 'playing' || gameState.status === 'finished' || room.status === 'playing' || room.status === 'finished') && (
        <div className="relative space-y-2.5">
          {/* Header Scoreboard: Koin Cinta + Putaran */}
          <div className="keiz-card space-y-2.5 rounded-3xl bg-white p-3">
            <div className="flex items-center justify-between gap-2">
              <div
                className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-extrabold ${
                  currentTurnRole === 'faiz'
                    ? 'border-[#93C5FD] bg-[#EFF6FF] text-[#2563EB]'
                    : 'border-[#FF9EC7] bg-[#FFE3EE] text-[#D81B6E]'
                }`}
              >
                <span
                  className={`h-2 w-2 rounded-full animate-pulse ${
                    currentTurnRole === 'faiz' ? 'bg-[#3B82F6]' : 'bg-[#FF2E7E]'
                  }`}
                />
                <span>Giliran: {currentTurnName}</span>
              </div>

              <div className="flex items-center gap-1.5">
                <span className="rounded-full border border-[#FFD6E7] bg-[#FFF5F9] px-2.5 py-1 text-[10px] font-extrabold text-[#D81B6E]">
                  Putaran {Math.min(MAX_ROUNDS, gameState.roundCount)}/{MAX_ROUNDS}
                </span>
                <button
                  type="button"
                  onClick={() => void leaveMonopoliRoom()}
                  className="rounded-full border border-rose-200 bg-rose-50 px-2.5 py-1 text-[10px] font-extrabold text-rose-600 cursor-pointer"
                >
                  Keluar
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              {([
                { slot: 'player1' as MonopoliSlot, player: p1, role: p1Role },
                { slot: 'player2' as MonopoliSlot, player: p2, role: p2Role },
              ]).map((item) => {
                const coins = gameState.coins[item.slot];
                const propCount = Object.values(gameState.properties).filter(
                  (o) => o === item.slot
                ).length;
                const inJail = gameState.jailTurns[item.slot] > 0;
                const isActive = gameState.currentTurn === item.slot && gameState.status === 'playing';

                return (
                  <div
                    key={item.slot}
                    className={`flex items-center gap-2 rounded-2xl border p-2 transition-all ${
                      isActive
                        ? 'border-[#FF4D8D] bg-[#FFF5F9] shadow-xs'
                        : 'border-[#FFD6E7] bg-white'
                    }`}
                  >
                    {renderProfileImg(
                      item.role,
                      item.player?.name || getRoleName(item.role),
                      'h-9 w-9'
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[11px] font-extrabold text-[#2D0A1E]">
                        {item.player?.name || getRoleName(item.role)}
                      </p>
                      <p className="flex items-center gap-1 text-[11px] font-extrabold text-[#D81B6E]">
                        <Coins className="h-3 w-3 shrink-0" />
                        <span>{coins}</span>
                        <span className="text-[9px] font-bold text-[#8A6A7A]">
                          • {propCount}🏠
                        </span>
                      </p>
                      {inJail && (
                        <p className="text-[9px] font-extrabold text-amber-600">
                          🔒 Penjara Cinta
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Toast */}
          {boardToast && (
            <div className="animate-bubble-pop rounded-2xl border border-[#FF9EC7] bg-white px-3 py-2 text-center text-xs font-extrabold text-[#D81B6E] shadow-md">
              <AppleTextWithEmojis text={boardToast} emojiSize={15} />
            </div>
          )}

          {/* Circular 6x6 Perimeter Monopoly Board (20 Tiles) */}
          <div className="relative aspect-square w-full overflow-hidden rounded-2xl border-2 border-[#FF9EC7] bg-[#FFF8FB] p-1 shadow-[0_8px_24px_rgba(255,46,126,0.14)]">
            <div className="grid h-full w-full grid-cols-6 grid-rows-6 gap-1">
              {MONOPOLI_BOARD_TILES.map((tile) => {
                const owner = gameState.properties[tile.id];
                const ownerRole: Role | null = owner
                  ? owner === 'player1'
                    ? p1Role
                    : p2Role
                  : null;
                const p1Here = visualPositions.player1 === tile.id;
                const p2Here = visualPositions.player2 === tile.id;

                const tileBg =
                  tile.type === 'start'
                    ? 'bg-gradient-to-br from-[#FEF08A] to-[#FDE047]'
                    : tile.type === 'penjara' || tile.type === 'masuk_penjara'
                    ? 'bg-[#FFE4E6]'
                    : tile.type === 'tantangan' || tile.type === 'kartu_cinta'
                    ? 'bg-[#FFF0F6]'
                    : tile.type === 'date' || tile.type === 'hadiah'
                    ? 'bg-[#F0FDF4]'
                    : tile.type === 'hukuman'
                    ? 'bg-[#FEF3C7]'
                    : 'bg-white';

                return (
                  <button
                    key={tile.id}
                    type="button"
                    onClick={() => {
                      soundFX.playClick();
                      setSelectedTileInfo(tile);
                    }}
                    style={{
                      gridRowStart: tile.gridRow,
                      gridColumnStart: tile.gridCol,
                    }}
                    className={`relative flex flex-col items-center justify-between overflow-hidden rounded-lg border text-center transition-transform active:scale-95 cursor-pointer ${tileBg} ${
                      owner
                        ? ownerRole === 'faiz'
                          ? 'border-[#3B82F6] ring-1 ring-[#3B82F6]/40'
                          : 'border-[#FF2E7E] ring-1 ring-[#FF2E7E]/40'
                        : 'border-[#FFD6E7]'
                    }`}
                  >
                    {/* Color group header bar on properties */}
                    {tile.colorGroup && (
                      <div
                        style={{ backgroundColor: tile.colorGroup }}
                        className="h-1.5 w-full shrink-0"
                      />
                    )}

                    <div className="flex flex-1 flex-col items-center justify-center px-0.5 py-0.5">
                      <AppleEmoji emoji={tile.emoji} size={14} />
                      <span className="mt-0.5 line-clamp-1 text-[7.5px] font-extrabold leading-none text-[#2D0A1E]">
                        {tile.shortName}
                      </span>
                      {tile.price && (
                        <span className="mt-0.5 text-[7px] font-bold leading-none text-[#8A6A7A]">
                          {tile.price}
                        </span>
                      )}
                    </div>

                    {/* Owner micro avatar badge */}
                    {ownerRole && (
                      <span
                        className={`absolute right-0.5 top-1.5 h-3.5 w-3.5 overflow-hidden rounded-full border ${
                          ownerRole === 'faiz' ? 'border-[#3B82F6]' : 'border-[#FF2E7E]'
                        } bg-white shadow-xs`}
                      >
                        <img
                          src={getRolePhoto(ownerRole)}
                          alt="owner"
                          referrerPolicy="no-referrer"
                          className="h-full w-full object-cover"
                        />
                      </span>
                    )}

                    {/* Player Pawns on this tile */}
                    {(p1Here || p2Here) && (
                      <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center gap-0.5 bg-white/35 backdrop-blur-[0.5px]">
                        {p1Here &&
                          renderProfileImg(
                            p1Role,
                            p1?.name || 'P1',
                            p2Here ? 'h-5 w-5' : 'h-6 w-6',
                            `${
                              p1Role === 'faiz'
                                ? 'border-[#3B82F6] ring-2 ring-white'
                                : 'border-[#FF2E7E] ring-2 ring-white'
                            } transition-transform duration-300 ${
                              hoppingSlot === 'player1' ? 'ut-piece-hopping scale-110' : ''
                            }`
                          )}
                        {p2Here &&
                          renderProfileImg(
                            p2Role,
                            p2?.name || 'P2',
                            p1Here ? 'h-5 w-5' : 'h-6 w-6',
                            `${
                              p2Role === 'faiz'
                                ? 'border-[#3B82F6] ring-2 ring-white'
                                : 'border-[#FF2E7E] ring-2 ring-white'
                            } transition-transform duration-300 ${
                              hoppingSlot === 'player2' ? 'ut-piece-hopping scale-110' : ''
                            }`
                          )}
                      </div>
                    )}
                  </button>
                );
              })}

              {/* Center 4x4 Hub inside Circular Board: 2 Digital Dice + Roll Controls */}
              <div
                style={{ gridRow: '2 / 6', gridColumn: '2 / 6' }}
                className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-[#FFD6E7] bg-gradient-to-br from-[#FFF5F9] via-white to-[#FFEAF3] p-2.5 text-center shadow-inner"
              >
                <div className="flex items-center gap-1">
                  <AppleEmoji emoji="👑" size={14} />
                  <span className="font-display text-[12px] font-extrabold text-[#D81B6E]">
                    Monopoli Couple
                  </span>
                </div>

                {/* 2 Digital Dice Side by Side */}
                <div
                  className={`flex items-center justify-center gap-2 rounded-2xl border border-[#FFD6E7] bg-white px-3 py-2 shadow-sm ${
                    isRolling ? 'ut-dice-rolling' : ''
                  }`}
                >
                  <DiceFaceSvg
                    value={diceDisplay[0]}
                    sizeClass="h-9 w-9"
                    muted={!isMyTurn && !isRolling && !isAnimatingMove}
                  />
                  <DiceFaceSvg
                    value={diceDisplay[1]}
                    sizeClass="h-9 w-9"
                    muted={!isMyTurn && !isRolling && !isAnimatingMove}
                  />
                </div>

                <p className="text-[10px] font-extrabold text-[#5C3A49]">
                  {isRolling
                    ? 'Mengocok 2 dadu...'
                    : `Dadu ${diceDisplay[0]} + ${diceDisplay[1]} = ${
                        diceDisplay[0] + diceDisplay[1]
                      }${diceDisplay[0] === diceDisplay[1] ? ' (Kembar!)' : ''}`}
                </p>

                {myInJail && isMyTurn && !isRolling && !isAnimatingMove ? (
                  <div className="flex w-full flex-col gap-1">
                    <button
                      type="button"
                      onClick={() => void rollMonopoliDice()}
                      className="btn-bucin flex h-8 w-full items-center justify-center rounded-full bg-gradient-to-r from-[#FF2E7E] to-[#FF7AB8] px-2 text-[10px] font-extrabold text-white shadow cursor-pointer"
                    >
                      🎲 Lempar Kembar
                    </button>
                    <button
                      type="button"
                      onClick={() => void payJailBail()}
                      className="btn-bucin flex h-7 w-full items-center justify-center rounded-full border border-[#FFD6E7] bg-white px-2 text-[10px] font-extrabold text-[#D81B6E] cursor-pointer"
                    >
                      💰 Bayar 100 Bebas
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    disabled={!isMyTurn || isRolling || isAnimatingMove}
                    onClick={() => void rollMonopoliDice()}
                    className={`btn-bucin flex h-9 w-full max-w-[146px] items-center justify-center gap-1 rounded-full text-[11px] font-extrabold shadow-md ${
                      isMyTurn && !isRolling && !isAnimatingMove
                        ? 'bg-gradient-to-r from-[#FF2E7E] to-[#FF7AB8] text-white cursor-pointer'
                        : 'bg-slate-200 text-slate-400 cursor-not-allowed'
                    }`}
                  >
                    <AppleTextWithEmojis
                      text={
                        isRolling
                          ? 'Kocok...'
                          : isAnimatingMove
                          ? 'Melangkah...'
                          : isMyTurn
                          ? '🎲 Lempar Dadu'
                          : gameState.pendingCard
                          ? 'Selesaikan Kartu'
                          : isBotRoom
                          ? 'Bot Jalan...'
                          : 'Giliran Lawan'
                      }
                      emojiSize={13}
                    />
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Pending Card Modal (Beli Properti / Tantangan Couple / Hukuman Manis / Kartu Cinta / Date) */}
          {gameState.pendingCard && !isAnimatingMove && (
            <div className="keiz-sticker-card animate-bubble-pop space-y-2.5 rounded-3xl border-2 border-[#FF4D8D] bg-white p-4 shadow-xl">
              {gameState.pendingCard.kind === 'buy_property' ? (
                (() => {
                  const tile = MONOPOLI_BOARD_TILES[gameState.pendingCard.tileId];
                  const ownerName = getPlayerLabel(gameState.pendingCard.slot);
                  return (
                    <>
                      <div className="flex items-center gap-2.5">
                        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#FFF2F7]">
                          <AppleEmoji emoji={tile.emoji} size={26} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-[10px] font-extrabold uppercase tracking-wider text-[#D81B6E]">
                            Properti Kosong
                          </p>
                          <h3 className="font-display text-[16px] font-extrabold text-[#2D0A1E]">
                            {tile.name}
                          </h3>
                          <p className="text-[11px] font-semibold text-[#8A6A7A]">
                            Harga: {tile.price} Koin Cinta • Sewa: {tile.rent} 💰
                          </p>
                        </div>
                      </div>
                      {canActPendingCard ? (
                        <div className="grid grid-cols-2 gap-2">
                          <button
                            type="button"
                            onClick={() => void resolvePendingCard('accept')}
                            className="keiz-btn-primary btn-bucin flex min-h-[42px] items-center justify-center text-xs font-extrabold cursor-pointer"
                          >
                            Beli ({tile.price} 💰)
                          </button>
                          <button
                            type="button"
                            onClick={() => void resolvePendingCard('decline')}
                            className="btn-bucin flex min-h-[42px] items-center justify-center rounded-full border border-[#FFD6E7] bg-[#FFF5F9] text-xs font-extrabold text-[#5C3A49] cursor-pointer"
                          >
                            Lewati
                          </button>
                        </div>
                      ) : (
                        <p className="text-center text-[11px] font-bold text-[#8A6A7A]">
                          Menunggu {ownerName} memilih beli atau lewati...
                        </p>
                      )}
                    </>
                  );
                })()
              ) : (
                <>
                  <div className="flex items-start gap-2.5">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#FFF2F7]">
                      <AppleEmoji
                        emoji={
                          gameState.pendingCard.kind === 'tantangan'
                            ? '💌'
                            : gameState.pendingCard.kind === 'hukuman'
                            ? '😘'
                            : gameState.pendingCard.kind === 'kartu_cinta'
                            ? '🃏'
                            : '🍽️'
                        }
                        size={26}
                      />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-[10px] font-extrabold uppercase tracking-wider text-[#D81B6E]">
                        {gameState.pendingCard.kind === 'tantangan'
                          ? 'Kartu Misi Couple'
                          : gameState.pendingCard.kind === 'hukuman'
                          ? 'Hukuman Manis'
                          : gameState.pendingCard.kind === 'kartu_cinta'
                          ? 'Kartu Cinta'
                          : 'Momen Date'}
                      </p>
                      <h3 className="font-display text-[15px] font-extrabold text-[#2D0A1E]">
                        <AppleTextWithEmojis
                          text={gameState.pendingCard.title}
                          emojiSize={15}
                        />
                      </h3>
                      <p className="mt-1 text-xs font-semibold leading-relaxed text-[#5C3A49]">
                        <AppleTextWithEmojis
                          text={gameState.pendingCard.desc}
                          emojiSize={14}
                        />
                      </p>
                    </div>
                  </div>
                  {canActPendingCard ? (
                    <button
                      type="button"
                      onClick={() => void resolvePendingCard('accept')}
                      className="keiz-btn-primary btn-bucin flex min-h-[42px] w-full items-center justify-center text-xs font-extrabold cursor-pointer"
                    >
                      <AppleTextWithEmojis
                        text={
                          gameState.pendingCard.kind === 'tantangan'
                            ? `Selesaikan Misi (+${gameState.pendingCard.reward} 💰)`
                            : gameState.pendingCard.kind === 'hukuman'
                            ? `Terima Hukuman Manis (-${gameState.pendingCard.penalty} 💰)`
                            : 'Ambil Efek Kartu 💕'
                        }
                        emojiSize={14}
                      />
                    </button>
                  ) : (
                    <p className="text-center text-[11px] font-bold text-[#8A6A7A]">
                      Menunggu {getPlayerLabel(gameState.pendingCard.slot)} menyelesaikan kartu...
                    </p>
                  )}
                </>
              )}
            </div>
          )}

          {/* Tile Tap Info Sheet */}
          {selectedTileInfo && (
            <div className="keiz-card animate-bubble-pop flex items-center justify-between gap-2 rounded-2xl bg-white p-3">
              <div className="flex min-w-0 items-center gap-2.5">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#FFF2F7]">
                  <AppleEmoji emoji={selectedTileInfo.emoji} size={20} />
                </div>
                <div className="min-w-0">
                  <p className="truncate text-xs font-extrabold text-[#2D0A1E]">
                    {selectedTileInfo.name}
                  </p>
                  <p className="text-[10px] font-semibold text-[#8A6A7A]">
                    {selectedTileInfo.price
                      ? `Beli ${selectedTileInfo.price} 💰 • Sewa ${selectedTileInfo.rent} 💰`
                      : selectedTileInfo.description}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedTileInfo(null)}
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#FFF2F7] text-[#8A6A7A] cursor-pointer"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          )}

          {/* Daftar Properti & Riwayat Transaksi */}
          <div className="keiz-card rounded-2xl bg-white p-3">
            <div className="mb-2 flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => {
                  soundFX.playClick();
                  setActiveInfoTab('properti');
                }}
                className={`flex flex-1 items-center justify-center gap-1 rounded-full py-1.5 text-[11px] font-extrabold cursor-pointer ${
                  activeInfoTab === 'properti'
                    ? 'bg-[#FFE3EE] text-[#D81B6E]'
                    : 'bg-[#FFF8FA] text-[#8A6A7A]'
                }`}
              >
                <Home className="h-3 w-3" />
                <span>Daftar Properti</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  soundFX.playClick();
                  setActiveInfoTab('riwayat');
                }}
                className={`flex flex-1 items-center justify-center gap-1 rounded-full py-1.5 text-[11px] font-extrabold cursor-pointer ${
                  activeInfoTab === 'riwayat'
                    ? 'bg-[#FFE3EE] text-[#D81B6E]'
                    : 'bg-[#FFF8FA] text-[#8A6A7A]'
                }`}
              >
                <Coins className="h-3 w-3" />
                <span>Riwayat Transaksi</span>
              </button>
            </div>

            {activeInfoTab === 'properti' ? (
              <div className="grid grid-cols-2 gap-1.5">
                {MONOPOLI_BOARD_TILES.filter((t) => t.type === 'properti').map(
                  (tile) => {
                    const owner = gameState.properties[tile.id];
                    const ownerRole = owner
                      ? owner === 'player1'
                        ? p1Role
                        : p2Role
                      : null;
                    return (
                      <div
                        key={tile.id}
                        className="flex items-center justify-between gap-1.5 rounded-xl border border-[#FFD6E7] bg-[#FFFDFE] px-2 py-1.5"
                      >
                        <div className="flex min-w-0 items-center gap-1.5">
                          <span
                            style={{ backgroundColor: tile.colorGroup }}
                            className="h-5 w-1 shrink-0 rounded-full"
                          />
                          <AppleEmoji emoji={tile.emoji} size={13} />
                          <div className="min-w-0">
                            <p className="truncate text-[10px] font-extrabold text-[#2D0A1E]">
                              {tile.name}
                            </p>
                            <p className="text-[9px] font-bold text-[#8A6A7A]">
                              Sewa {tile.rent} 💰
                            </p>
                          </div>
                        </div>
                        {ownerRole ? (
                          renderProfileImg(ownerRole, 'owner', 'h-5 w-5')
                        ) : (
                          <span className="shrink-0 rounded-full bg-[#FFF2F7] px-1.5 py-0.5 text-[8px] font-extrabold text-[#D81B6E]">
                            {tile.price}
                          </span>
                        )}
                      </div>
                    );
                  }
                )}
              </div>
            ) : (
              <div className="max-h-[120px] space-y-1 overflow-y-auto pr-1 text-[11px] font-semibold text-[#5C3A49]">
                {gameState.transactions.length === 0 ? (
                  <p className="text-[#9A7A8A]">Belum ada transaksi.</p>
                ) : (
                  gameState.transactions.map((tx) => (
                    <div
                      key={tx.id}
                      className="rounded-lg bg-[#FFF5F9] px-2.5 py-1"
                    >
                      <AppleTextWithEmojis text={tx.text} emojiSize={12} />
                    </div>
                  ))
                )}
              </div>
            )}
          </div>

          {/* Winner Overlay with Confetti */}
          {gameState.status === 'finished' && !isAnimatingMove && (
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
                  {gameState.winner === 'player1' ||
                  gameState.winner === 'player2' ? (
                    renderProfileImg(
                      gameState.winner === 'player1' ? p1Role : p2Role,
                      winnerName,
                      'h-16 w-16'
                    )
                  ) : (
                    <AppleEmoji emoji="🏆" size={40} />
                  )}
                </div>

                <div>
                  <p className="text-[11px] font-extrabold text-[#8A6A7A]">
                    <AppleTextWithEmojis
                      text={gameState.winReason || 'Permainan Selesai! 🏆'}
                      emojiSize={12}
                    />
                  </p>
                  <h3 className="font-display mt-1 text-[22px] font-extrabold text-[#D81B6E]">
                    <AppleTextWithEmojis
                      text={
                        gameState.winner === 'draw'
                          ? 'SERI BERDUA! 💕'
                          : gameState.winner === mySlot
                          ? 'KAMU MENANG! 🏆'
                          : `${String(winnerName).toUpperCase()} MENANG! 🏆`
                      }
                      emojiSize={22}
                    />
                  </h3>
                  <p className="mt-1 text-xs font-bold text-[#5C3A49]">
                    {p1?.name || getRoleName(p1Role)}: {gameState.coins.player1} 💰 |{' '}
                    {p2?.name || getRoleName(p2Role)}: {gameState.coins.player2} 💰
                  </p>
                </div>

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

      {/* D. CHAT KHUSUS 2 PEMAIN MONOPOLI COUPLE (REAL-TIME + APPLE/TELEGRAM EMOJI + FOTO PROFILES + READ STATUS) */}
      <div className="keiz-card relative flex h-[320px] shrink-0 flex-col overflow-hidden bg-white">
        <div className="flex shrink-0 items-center justify-between border-b border-[#FFD6E7] bg-[#FFF5F9] px-3 py-2">
          <p className="text-xs font-extrabold text-[#D81B6E]">
            <AppleTextWithEmojis text="💬 chat monopoli berdua" emojiSize={14} />
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
          className="flex min-h-0 flex-1 flex-col space-y-2.5 overflow-y-auto bg-[#FFFDFE] p-3"
        >
          {activeChats.length === 0 && (
            <div className="my-auto mx-auto rounded-2xl border border-[#FFD6E7] bg-[#FFF5F9] px-4 py-2.5 text-center">
              <p className="text-xs font-extrabold text-[#5C3A49]">
                Belum ada chat monopoli nih
              </p>
              <p className="mt-0.5 text-[10px] font-semibold text-[#8A6A7A]">
                Chat berdua sambil main Monopoli Couple!
              </p>
            </div>
          )}

          {activeChats.map((msg) => {
            const isMine = msg.senderRole === currentUser;
            const bubbleColor =
              msg.senderRole === 'faiz' ? 'bg-[#3B82F6]' : 'bg-[#FF4D8D]';
            const senderDisplayName =
              msg.senderName || getRoleName(msg.senderRole);

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
                  className={`flex max-w-[90%] items-end gap-1.5 ${
                    isMine ? 'flex-row-reverse' : 'flex-row'
                  }`}
                >
                  {/* Foto profil langsung dari tabel profiles */}
                  {renderProfileImg(
                    msg.senderRole,
                    senderDisplayName,
                    'h-7 w-7'
                  )}

                  <div
                    data-mono-chat-bubble="true"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (longPressFiredRef.current) {
                        longPressFiredRef.current = false;
                        return;
                      }
                      soundFX.playClick();
                      setActiveBubbleMenu((cur) => (cur === msg.id ? null : msg.id));
                    }}
                    className={`relative cursor-pointer rounded-2xl px-3 py-2 text-xs leading-relaxed text-white shadow-sm ${bubbleColor} ${
                      isMine ? 'rounded-br-[4px]' : 'rounded-bl-[4px]'
                    }`}
                  >
                    <p className="mb-0.5 text-[10px] font-extrabold text-white/90">
                      {senderDisplayName}
                    </p>

                    {msg.replyToText && (
                      <div className="mb-1 rounded-lg border-l-[3px] border-white/80 bg-black/15 px-2 py-1 text-[10px]">
                        <p className="font-extrabold opacity-90">
                          {getRoleName(msg.replyToSender || 'faiz')}
                        </p>
                        <p className="line-clamp-1 opacity-85">
                          <AppleTextWithEmojis text={msg.replyToText} emojiSize={13} />
                        </p>
                      </div>
                    )}

                    <span>
                      <AppleTextWithEmojis text={msg.text} emojiSize={17} />
                    </span>

                    <div className="mt-0.5 flex items-center justify-end gap-1 text-[9px] text-white/85">
                      <span>{formatTime(msg.created_at)}</span>
                      {isMine &&
                        (msg.isRead ? (
                          <CheckCheck
                            className="h-3 w-3 text-[#BAE6FD]"
                            aria-label="Dibaca"
                          />
                        ) : (
                          <Check
                            className="h-2.5 w-2.5 text-white/80"
                            aria-label="Terkirim"
                          />
                        ))}
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
                </div>

                {activeBubbleMenu === msg.id && (
                  <div
                    data-mono-bubble-menu="true"
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
                              void applyMonoChatReaction(msg, em, {
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
                        onClick={() => void handleDeleteMonoChatMsg(msg.id)}
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
                Membalas {getRoleName(replyingTo.senderRole)}
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
            data-mono-chat-input="true"
            className="absolute inset-x-0 bottom-[56px] z-30 border-t border-[#FFD6E7] bg-white shadow-lg"
          >
            <EmojiPicker
              width="100%"
              height={230}
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
          data-mono-chat-input="true"
          onSubmit={(e) => void sendMonoChat(e)}
          className="flex shrink-0 items-center gap-1.5 border-t border-[#FFD6E7] bg-white p-2"
        >
          <button
            type="button"
            onClick={() => {
              soundFX.playClick();
              setShowInputEmojiPicker((v) => !v);
            }}
            aria-label="Pilih emot chat monopoli"
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
              currentUser === 'faiz'
                ? `ketik buat ${getRoleName('kenat')}...`
                : `ketik buat ${getRoleName('faiz')}...`
            }
            className="h-10 min-h-[40px] flex-1 rounded-full border border-[#FFD6E7] bg-[#FFF2F7] px-3.5 text-xs font-semibold text-[#2D0A1E] placeholder-[#9A7A8A] focus:border-[#FF2E7E] focus:outline-none"
          />

          <button
            type="submit"
            aria-label="Kirim chat monopoli"
            className={`btn-bucin flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-white shadow-sm cursor-pointer ${
              currentUser === 'faiz' ? 'bg-[#3B82F6]' : 'bg-[#FF4D8D]'
            }`}
          >
            <Send className="h-4 w-4" />
          </button>
        </form>
      </div>

      {/* Full Telegram/iPhone Apple Emoji Picker for Reactions (searchable + categories + frequently used) */}
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
                    onClick={() => void applyMonoChatReaction(reactTargetMsg, myReact)}
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
                void applyMonoChatReaction(reactTargetMsg, emojiData.emoji, {
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
              is_read: activeDetailChat.isRead,
              created_at: activeDetailChat.created_at,
              react: activeDetailChat.react,
            }}
            currentUser={currentUser}
            profile={liveProfile}
            onToggleMyReaction={(emoji, pt) =>
              void applyMonoChatReaction(activeDetailChat, emoji, pt)
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
