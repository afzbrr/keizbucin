import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  Heart,
  Loader2,
  Lock,
  MailOpen,
  Send,
  Smile,
  Sparkles,
  X,
} from 'lucide-react';
import { fetchAlbumPhotos, getSupabaseClient } from '../supabaseClient';
import { soundFX } from '../sound';
import type { CoupleProfile, GalleryPhoto, Role } from '../types';
import { AppleEmoji, AppleTextWithEmojis } from './AppleEmoji';
import {
  DEFAULT_COUPLE_START,
  type SimpleDateParts,
  parseCoupleDate,
} from './MensivePopupModal';

const LOVE_REACT_EMOJIS = [
  '❤️',
  '😍',
  '🥰',
  '😘',
  '😭',
  '🤍',
  '🫶',
  '✨',
  '🔥',
  '😂',
  '🥺',
] as const;

// 1-based positions from top of Album: 1, 7, 9, 10, 12, 13, 14
const TARGET_ALBUM_INDICES = [0, 6, 8, 9, 11, 12, 13] as const;

const NAMA_BULAN_ID = [
  'Januari',
  'Februari',
  'Maret',
  'April',
  'Mei',
  'Juni',
  'Juli',
  'Agustus',
  'September',
  'Oktober',
  'November',
  'Desember',
];

const COMMENTS_CACHE_PREFIX = 'keiz_love_letter_comments_v1_';
const REACTIONS_CACHE_PREFIX = 'keiz_love_letter_reactions_v1_';

export interface LoveLetterRecord {
  id: string;
  title: string;
  content: string;
  unlockDate: string; // YYYY-MM-DD
  isMensive: boolean;
  sortOrder: number;
}

export interface LoveLetterCommentItem {
  id: string;
  letterId: string;
  name: string;
  text: string;
  createdAt: string;
  likes: number;
  reactions: Record<string, number>;
}

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

function toLocalYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function getNextOrCurrent28Ymd(now: Date): string {
  const y = now.getFullYear();
  const m = now.getMonth();
  const d = now.getDate();
  if (d <= 28) {
    return toLocalYmd(new Date(y, m, 28));
  }
  return toLocalYmd(new Date(y, m + 1, 28));
}

function normalizeYmd(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  const trimmed = raw.trim();
  if (!trimmed) return '';
  const match = trimmed.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (match) {
    return `${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}`;
  }
  const parsed = new Date(trimmed);
  if (!Number.isNaN(parsed.getTime())) {
    return toLocalYmd(parsed);
  }
  return '';
}

function formatTanggalId(ymd: string): string {
  const match = ymd.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return ymd || '-';
  const y = Number(match[1]);
  const m = Number(match[2]) - 1;
  const d = Number(match[3]);
  const monthName = NAMA_BULAN_ID[m] ?? '';
  return `${d} ${monthName} ${y}`.trim();
}

function formatCommentTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const hh = String(date.getHours()).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');
  return `${hh}.${mm}`;
}

function computeMensiveMonthCount(
  start: SimpleDateParts,
  now: Date
): number {
  return Math.max(
    1,
    (now.getFullYear() - start.year) * 12 + (now.getMonth() - start.monthIndex)
  );
}

function buildMensiveParagraphs(monthsCount: number): string[] {
  return [
    `happy mensive ke ${monthsCount} sayangku, yeyyy kita ketemu lagi sama mensive,`,
    `semoga kedepannya kita ketemu terus sama mensive ya dan bisa selalu ngerayain mensive, semoga hubungan kita bisa selalu langgeng selamanya,`,
    `terimakasi banyak ya sayang karna udah selalu sayang sama aku, udah jadi tempat pulang ternyaman buat aku, terimakasi udah perhatian sama aku, pokonya terimakasi banyak untuk semuanya sayang,`,
    `maafin aku ya aku banyak salah ke kamu, maaf aku selalu ngerepotin kamu, maaf aku belum jadi pasangan yang baik, pokonya aku minta maaf buat semuanya ya sayang,`,
    `aku seneng deh sekarang kita jarang berantem, aku juga seneng kita masi bersama sampe sekarang,`,
    `semoga kita selalu bersama selamanya ya, jangan bosen sama aku ya sayang,`,
    `i loveee youuu sayangkuuu, cintakuuu, cantikkuuu, pacarkuuu, adeee sayanggg, duniakuuu, separuhhh nafaskuuu, belahannn jiwakuuu, belahannn semuaaa semuanyaaa akuuu, muahhh muahhh muahhh`,
  ];
}

function buildLetterParagraphs(
  letter: LoveLetterRecord,
  monthsCount: number
): string[] {
  if (letter.isMensive) {
    const raw = letter.content.trim();
    if (
      !raw ||
      raw.includes('(otomatis hitung bulan)') ||
      raw.includes('[X]') ||
      raw.toLowerCase().includes('happy mensive')
    ) {
      return buildMensiveParagraphs(monthsCount);
    }
  }

  const normalized = letter.content
    .replace(/\(otomatis hitung bulan\)/gi, String(monthsCount))
    .replace(/\[X\]/g, String(monthsCount))
    .trim();

  if (!normalized) {
    return buildMensiveParagraphs(monthsCount);
  }

  const splitByNewlines = normalized
    .split(/\n+/)
    .map((p) => p.trim())
    .filter(Boolean);

  if (splitByNewlines.length > 1) {
    return splitByNewlines;
  }

  return [normalized];
}

function resolveLetterTitle(
  letter: LoveLetterRecord,
  monthsCount: number
): string {
  if (letter.isMensive) {
    return `happy mensive ke ${monthsCount} sayangku`;
  }
  return letter.title
    .replace(/\(otomatis hitung bulan\)/gi, String(monthsCount))
    .replace(/\[X\]/g, String(monthsCount));
}

function buildFallbackLetters(_todayYmd: string): LoveLetterRecord[] {
  const today = new Date();
  const current28 = getNextOrCurrent28Ymd(today);
  const current28Parts = current28.split('-').map(Number);
  const nextMonth28 = toLocalYmd(
    new Date(current28Parts[0], current28Parts[1], 28)
  );

  return [
    {
      id: '00000000-0000-4000-8000-000000000203',
      title: 'happy mensive ke [X] sayangku',
      content: '',
      unlockDate: current28,
      isMensive: true,
      sortOrder: 0,
    },
    {
      id: '00000000-0000-4000-8000-000000000204',
      title: 'Surat Mensive Bulan Berikutnya',
      content: '',
      unlockDate: nextMonth28,
      isMensive: false,
      sortOrder: 1,
    },
  ];
}

function readCachedComments(letterId: string): LoveLetterCommentItem[] {
  try {
    const raw = localStorage.getItem(`${COMMENTS_CACHE_PREFIX}${letterId}`);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as LoveLetterCommentItem[]) : [];
  } catch {
    return [];
  }
}

function writeCachedComments(
  letterId: string,
  items: LoveLetterCommentItem[]
): void {
  try {
    localStorage.setItem(
      `${COMMENTS_CACHE_PREFIX}${letterId}`,
      JSON.stringify(items)
    );
  } catch {
    // ignore
  }
}

function readCachedReactions(letterId: string): {
  letterReactions: Record<string, number>;
  commentReactions: Record<string, Record<string, number>>;
} {
  try {
    const raw = localStorage.getItem(`${REACTIONS_CACHE_PREFIX}${letterId}`);
    if (!raw) return { letterReactions: {}, commentReactions: {} };
    const parsed = JSON.parse(raw) as {
      letterReactions?: Record<string, number>;
      commentReactions?: Record<string, Record<string, number>>;
    };
    return {
      letterReactions: parsed.letterReactions ?? {},
      commentReactions: parsed.commentReactions ?? {},
    };
  } catch {
    return { letterReactions: {}, commentReactions: {} };
  }
}

function writeCachedReactions(
  letterId: string,
  letterReactions: Record<string, number>,
  commentReactions: Record<string, Record<string, number>>
): void {
  try {
    localStorage.setItem(
      `${REACTIONS_CACHE_PREFIX}${letterId}`,
      JSON.stringify({ letterReactions, commentReactions })
    );
  } catch {
    // ignore
  }
}

async function fetchCoupleStartDate(): Promise<SimpleDateParts> {
  const sb = getSupabaseClient();
  if (!sb) return DEFAULT_COUPLE_START;
  try {
    const { data, error } = await sb
      .from('couple_info')
      .select('*')
      .limit(1);
    if (!error && Array.isArray(data) && data.length > 0) {
      const row = data[0] as Record<string, unknown>;
      const rawDate =
        row.anniversary_date ??
        row.tanggal_pacaran ??
        row.start_date ??
        row.relationship_date ??
        row.jadian_date ??
        row.date;
      const parsed = parseCoupleDate(rawDate);
      if (parsed) return parsed;
    }
  } catch {
    // fallback to 2026-08-28
  }
  return DEFAULT_COUPLE_START;
}

async function fetchLoveLettersFromDb(
  todayYmd: string
): Promise<LoveLetterRecord[]> {
  const sb = getSupabaseClient();
  if (!sb) return buildFallbackLetters(todayYmd);

  try {
    let { data, error } = await sb
      .from('love_letters')
      .select('*')
      .order('unlock_date', { ascending: true })
      .limit(100);

    if (error && (error.code === '42703' || error.code === 'PGRST204')) {
      const retry = await sb.from('love_letters').select('*').limit(100);
      data = retry.data;
      error = retry.error;
    }

    if (!error && Array.isArray(data) && data.length > 0) {
      return data.map((item, idx) => {
        const row = item as Record<string, unknown>;
        const title =
          pickFirstString(row, ['title', 'judul', 'subject', 'name']) ||
          'Love Letter';
        const content = pickFirstString(row, [
          'content',
          'isi_surat',
          'isi',
          'body',
          'letter',
          'message',
          'pesan',
          'text',
        ]);
        const rawUnlock =
          row.unlock_date ??
          row.tanggal_unlock ??
          row.open_date ??
          row.date ??
          row.created_at;
        const unlockDate = normalizeYmd(rawUnlock) || todayYmd;
        const lowerTitle = title.toLowerCase();
        const lowerContent = content.toLowerCase();
        const isMensive =
          Boolean(row.is_mensive) ||
          lowerTitle.includes('mensive') ||
          lowerContent.includes('(otomatis hitung bulan)') ||
          lowerContent.includes('happy mensive');

        return {
          id: String(row.id ?? `letter-${idx}`),
          title,
          content,
          unlockDate,
          isMensive,
          sortOrder: idx,
        };
      });
    }
  } catch {
    // fallback if table doesn't exist yet
  }

  return buildFallbackLetters(todayYmd);
}

function normalizeLoveCommentRow(
  row: Record<string, unknown>,
  letterId: string,
  reactionMap: Record<string, Record<string, number>>
): LoveLetterCommentItem | null {
  const id = String(row.id ?? '').trim();
  const name =
    pickFirstString(row, [
      'name',
      'nama',
      'author',
      'sender',
      'user_name',
      'username',
    ]) || 'Sayang';
  const text = pickFirstString(row, [
    'comment',
    'komentar',
    'content',
    'message',
    'isi',
    'text',
    'body',
  ]);
  if (!id || !text) return null;

  const likes =
    Number(row.likes ?? row.likes_count ?? row.like_count ?? 0) || 0;
  const createdAt =
    pickFirstString(row, ['created_at', 'timestamp', 'inserted_at']) ||
    new Date().toISOString();

  return {
    id,
    letterId: String(row.letter_id ?? letterId),
    name,
    text,
    createdAt,
    likes,
    reactions: reactionMap[id] ?? {},
  };
}

async function loadLetterCommentsAndReactions(letterId: string): Promise<{
  comments: LoveLetterCommentItem[];
  letterReactions: Record<string, number>;
}> {
  const cachedComments = readCachedComments(letterId);
  const cachedRx = readCachedReactions(letterId);
  const sb = getSupabaseClient();

  if (!sb) {
    return {
      comments: cachedComments.map((c) => ({
        ...c,
        reactions: c.reactions || cachedRx.commentReactions[c.id] || {},
      })),
      letterReactions: cachedRx.letterReactions,
    };
  }

  const letterReactions: Record<string, number> = {};
  const commentReactionMap: Record<string, Record<string, number>> = {};
  let reactionsLoaded = false;

  try {
    const { data, error } = await sb
      .from('love_letter_reactions')
      .select('*')
      .eq('letter_id', letterId)
      .limit(500);

    if (!error && Array.isArray(data)) {
      reactionsLoaded = true;
      for (const item of data) {
        const row = item as Record<string, unknown>;
        const emoji = pickFirstString(row, ['emoji', 'reaction', 'emot']);
        if (!emoji) continue;
        const explicitCount =
          typeof row.count === 'number'
            ? row.count
            : typeof row.jumlah === 'number'
            ? row.jumlah
            : typeof row.total === 'number'
            ? row.total
            : null;
        const inc =
          explicitCount !== null && explicitCount > 0 ? explicitCount : 1;

        const commentIdRaw = row.comment_id ?? row.love_letter_comment_id;
        const commentId =
          commentIdRaw !== null &&
          commentIdRaw !== undefined &&
          String(commentIdRaw).trim() !== ''
            ? String(commentIdRaw).trim()
            : '';

        if (!commentId) {
          letterReactions[emoji] = (letterReactions[emoji] ?? 0) + inc;
        } else {
          if (!commentReactionMap[commentId]) {
            commentReactionMap[commentId] = {};
          }
          commentReactionMap[commentId][emoji] =
            (commentReactionMap[commentId][emoji] ?? 0) + inc;
        }
      }
    }
  } catch {
    // Fallback to cached reactions if table missing
  }

  let commentRows: Record<string, unknown>[] | null = null;
  try {
    const res1 = await sb
      .from('love_letter_comments')
      .select('*')
      .eq('letter_id', letterId)
      .order('created_at', { ascending: false })
      .limit(200);

    if (!res1.error && Array.isArray(res1.data)) {
      commentRows = res1.data as Record<string, unknown>[];
    } else {
      const res2 = await sb
        .from('love_letter_comments')
        .select('*')
        .eq('letter_id', letterId)
        .limit(200);
      if (!res2.error && Array.isArray(res2.data)) {
        commentRows = (res2.data as Record<string, unknown>[]).reverse();
      }
    }
  } catch {
    // Fallback to cached comments if table missing
  }

  const effectiveLetterReactions = reactionsLoaded
    ? letterReactions
    : cachedRx.letterReactions;
  const effectiveCommentReactions = reactionsLoaded
    ? commentReactionMap
    : cachedRx.commentReactions;

  if (commentRows) {
    const normalized: LoveLetterCommentItem[] = [];
    for (const r of commentRows) {
      const item = normalizeLoveCommentRow(
        r,
        letterId,
        effectiveCommentReactions
      );
      if (item) normalized.push(item);
    }
    normalized.sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
    writeCachedComments(letterId, normalized);
    if (reactionsLoaded) {
      writeCachedReactions(letterId, letterReactions, commentReactionMap);
    }
    return {
      comments: normalized,
      letterReactions: effectiveLetterReactions,
    };
  }

  return {
    comments: cachedComments.map((c) => ({
      ...c,
      reactions:
        effectiveCommentReactions[c.id] ??
        c.reactions ??
        {},
    })),
    letterReactions: effectiveLetterReactions,
  };
}

async function insertLoveLetterCommentRemote(
  letterId: string,
  name: string,
  text: string
): Promise<LoveLetterCommentItem | null> {
  const sb = getSupabaseClient();
  if (!sb) return null;

  const payloads: Record<string, unknown>[] = [
    { letter_id: letterId, name, comment: text, likes: 0 },
    { letter_id: letterId, name, comment: text },
    { letter_id: letterId, nama: name, komentar: text, likes: 0 },
    { letter_id: letterId, nama: name, komentar: text },
    { letter_id: letterId, author: name, content: text, likes: 0 },
    { letter_id: letterId, author: name, message: text },
    { letter_id: letterId, nama: name, isi: text },
  ];

  for (const payload of payloads) {
    try {
      const { data, error } = await sb
        .from('love_letter_comments')
        .insert(payload)
        .select('*')
        .single();
      if (!error && data) {
        const normalized = normalizeLoveCommentRow(
          data as Record<string, unknown>,
          letterId,
          {}
        );
        if (normalized) return normalized;
      }
    } catch {
      // Try next schema column variant
    }
  }
  return null;
}

async function incrementLoveCommentLikeRemote(
  commentId: string,
  nextLikes: number
): Promise<void> {
  const sb = getSupabaseClient();
  if (!sb || commentId.startsWith('local-')) return;

  const payloads: Record<string, unknown>[] = [
    { likes: nextLikes },
    { likes_count: nextLikes },
    { like_count: nextLikes },
  ];

  for (const payload of payloads) {
    try {
      const { error } = await sb
        .from('love_letter_comments')
        .update(payload)
        .eq('id', commentId);
      if (!error) return;
    } catch {
      // Try next column variant
    }
  }
}

async function saveLoveLetterReactionRemote(params: {
  letterId: string;
  commentId: string | null;
  emoji: string;
  nextCount: number;
  userName: string;
  replaceExistingCommentReaction: boolean;
}): Promise<void> {
  const sb = getSupabaseClient();
  if (!sb) return;
  if (params.commentId && params.commentId.startsWith('local-')) return;

  // For comments: only 1 emoji react allowed -> if changing emoji, remove old rows for that comment first
  if (params.commentId && params.replaceExistingCommentReaction) {
    try {
      await sb
        .from('love_letter_reactions')
        .delete()
        .eq('letter_id', params.letterId)
        .eq('comment_id', params.commentId);
    } catch {
      // ignore if delete not permitted or column differs
    }
  }

  const payloads: Record<string, unknown>[] = params.commentId
    ? [
        {
          letter_id: params.letterId,
          comment_id: params.commentId,
          emoji: params.emoji,
          user_name: params.userName,
        },
        {
          letter_id: params.letterId,
          comment_id: params.commentId,
          emoji: params.emoji,
        },
        {
          letter_id: params.letterId,
          comment_id: params.commentId,
          reaction: params.emoji,
        },
      ]
    : [
        {
          letter_id: params.letterId,
          comment_id: null,
          emoji: params.emoji,
          user_name: params.userName,
        },
        {
          letter_id: params.letterId,
          emoji: params.emoji,
          user_name: params.userName,
        },
        {
          letter_id: params.letterId,
          comment_id: null,
          emoji: params.emoji,
        },
        {
          letter_id: params.letterId,
          emoji: params.emoji,
        },
        {
          letter_id: params.letterId,
          reaction: params.emoji,
        },
      ];

  for (const payload of payloads) {
    try {
      const { error } = await sb
        .from('love_letter_reactions')
        .insert(payload);
      if (!error) return;
    } catch {
      // Try next payload variant or count update
    }
  }

  // Fallback if unique constraint exists with a count column
  const countPayloads: Record<string, unknown>[] = [
    { count: params.nextCount },
    { jumlah: params.nextCount },
    { total: params.nextCount },
  ];
  for (const cp of countPayloads) {
    try {
      let query = sb
        .from('love_letter_reactions')
        .update(cp)
        .eq('letter_id', params.letterId)
        .eq('emoji', params.emoji);
      if (params.commentId) {
        query = query.eq('comment_id', params.commentId);
      } else {
        query = query.is('comment_id', null);
      }
      const { error } = await query;
      if (!error) return;
    } catch {
      // ignore
    }
  }
}

interface LoveLetterViewProps {
  currentUser: Role;
  profile: CoupleProfile;
  todayTick: Date;
  onBack: () => void;
  onHeartBurstAt: (x: number, y: number) => void;
}

export const LoveLetterView: React.FC<LoveLetterViewProps> = ({
  currentUser,
  profile,
  todayTick,
  onBack,
  onHeartBurstAt,
}) => {
  const [letters, setLetters] = useState<LoveLetterRecord[]>([]);
  const [coupleStart, setCoupleStart] = useState<SimpleDateParts>(
    DEFAULT_COUPLE_START
  );
  const [albumCollagePhotos, setAlbumCollagePhotos] = useState<GalleryPhoto[]>(
    []
  );
  const [loading, setLoading] = useState(true);

  const [openingId, setOpeningId] = useState<string | null>(null);
  const [lockedShakeId, setLockedShakeId] = useState<string | null>(null);
  const [lockedNotice, setLockedNotice] = useState<string | null>(null);
  const [openedLetter, setOpenedLetter] = useState<LoveLetterRecord | null>(
    null
  );

  // Fullscreen zoomed photo lightbox
  const [zoomedPhoto, setZoomedPhoto] = useState<GalleryPhoto | null>(null);

  // Comments & reactions for active opened letter
  const [comments, setComments] = useState<LoveLetterCommentItem[]>([]);
  const [letterReactions, setLetterReactions] = useState<
    Record<string, number>
  >({});
  const [commentName, setCommentName] = useState('');
  const [commentText, setCommentText] = useState('');
  const [submittingComment, setSubmittingComment] = useState(false);
  const [commentError, setCommentError] = useState('');
  const [openPickerForId, setOpenPickerForId] = useState<string | null>(null);
  const pickerContainerRef = useRef<HTMLDivElement | null>(null);

  const todayYmd = toLocalYmd(todayTick);
  const isToday28 = todayTick.getDate() === 28;
  const nextOrCurrent28Ymd = getNextOrCurrent28Ymd(todayTick);
  const monthsCount = computeMensiveMonthCount(coupleStart, todayTick);

  useEffect(() => {
    if (!isToday28 && openedLetter) {
      setOpenedLetter(null);
      setOpenPickerForId(null);
    }
  }, [isToday28, openedLetter]);

  const loadInitialData = useCallback(async () => {
    setLoading(true);
    try {
      const [startDate, lettersData, allAlbumPhotos] = await Promise.all([
        fetchCoupleStartDate(),
        fetchLoveLettersFromDb(todayYmd),
        fetchAlbumPhotos(),
      ]);
      setCoupleStart(startDate);
      setLetters(lettersData);

      // HANYA foto urutan ke-1, ke-7, ke-9, ke-10, ke-12, ke-13, ke-14 dari atas Album
      const selectedPhotos: GalleryPhoto[] = [];
      for (const idx of TARGET_ALBUM_INDICES) {
        const photo = allAlbumPhotos[idx];
        if (photo && photo.url) {
          selectedPhotos.push(photo);
        }
      }
      setAlbumCollagePhotos(selectedPhotos);
    } finally {
      setLoading(false);
    }
  }, [todayYmd]);

  useEffect(() => {
    void loadInitialData();
  }, [loadInitialData]);

  const refreshActiveLetterDetails = useCallback(async (letterId: string) => {
    const res = await loadLetterCommentsAndReactions(letterId);
    setComments(res.comments);
    setLetterReactions(res.letterReactions);
  }, []);

  useEffect(() => {
    if (!openedLetter) return;
    void refreshActiveLetterDetails(openedLetter.id);

    const sb = getSupabaseClient();
    if (!sb) return;

    const channel = sb
      .channel(`love_letter_live_${openedLetter.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'love_letter_comments' },
        () => {
          void refreshActiveLetterDetails(openedLetter.id);
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'love_letter_reactions' },
        () => {
          void refreshActiveLetterDetails(openedLetter.id);
        }
      )
      .subscribe();

    return () => {
      void sb.removeChannel(channel);
    };
  }, [openedLetter, refreshActiveLetterDetails]);

  useEffect(() => {
    if (!openPickerForId) return;
    const handleOutside = (e: MouseEvent) => {
      if (
        pickerContainerRef.current &&
        !pickerContainerRef.current.contains(e.target as Node)
      ) {
        setOpenPickerForId(null);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, [openPickerForId]);

  const floatingDecorHearts = useMemo(
    () => [
      { id: 1, top: '8%', right: '8%', size: 18, color: '#FF4D8D', delay: '0s' },
      { id: 2, top: '24%', left: '5%', size: 15, color: '#FF7AB8', delay: '0.6s' },
      { id: 3, top: '48%', right: '6%', size: 16, color: '#3B82F6', delay: '1.1s' },
      { id: 4, top: '72%', left: '6%', size: 17, color: '#FF2E7E', delay: '0.4s' },
    ],
    []
  );

  const handleOpenEnvelope = (
    letter: LoveLetterRecord,
    e: React.MouseEvent<HTMLButtonElement>
  ) => {
    const isUnlocked = isToday28 && letter.unlockDate <= todayYmd;
    const targetUnlockDate =
      letter.unlockDate > todayYmd ? letter.unlockDate : nextOrCurrent28Ymd;

    if (!isUnlocked) {
      soundFX.playClick();
      setLockedShakeId(letter.id);
      setLockedNotice(
        `Terkunci, baru kebuka tanggal ${formatTanggalId(targetUnlockDate)}`
      );
      window.setTimeout(() => setLockedShakeId(null), 500);
      window.setTimeout(() => setLockedNotice(null), 2800);
      return;
    }

    if (openingId) return;
    const rect = e.currentTarget.getBoundingClientRect();
    soundFX.playHeartBurst();
    onHeartBurstAt(rect.left + rect.width / 2, rect.top + rect.height / 2);
    setOpeningId(letter.id);
    setLockedNotice(null);

    window.setTimeout(() => {
      setOpeningId(null);
      setOpenedLetter(letter);
      setOpenPickerForId(null);
    }, 560);
  };

  const handleSendComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!openedLetter) return;

    const cleanName = commentName.trim();
    const cleanText = commentText.trim();
    if (!cleanName) {
      setCommentError('Isi nama kamu dulu ya.');
      return;
    }
    if (!cleanText) {
      setCommentError('Ketik komennya dulu ya sayang.');
      return;
    }
    if (submittingComment) return;

    setCommentError('');
    setSubmittingComment(true);
    soundFX.playPop();

    const tempId = `local-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const optimisticItem: LoveLetterCommentItem = {
      id: tempId,
      letterId: openedLetter.id,
      name: cleanName,
      text: cleanText,
      createdAt: new Date().toISOString(),
      likes: 0,
      reactions: {},
    };

    // Urutan komen terbaru di atas
    setComments((prev) => {
      const next = [optimisticItem, ...prev];
      writeCachedComments(openedLetter.id, next);
      return next;
    });
    setCommentText('');

    const remoteSaved = await insertLoveLetterCommentRemote(
      openedLetter.id,
      cleanName,
      cleanText
    );

    if (remoteSaved) {
      setComments((prev) => {
        const next = prev.map((item) =>
          item.id === tempId
            ? {
                ...remoteSaved,
                likes: Math.max(remoteSaved.likes, item.likes),
                reactions: { ...item.reactions, ...remoteSaved.reactions },
              }
            : item
        );
        writeCachedComments(openedLetter.id, next);
        return next;
      });
    }

    setSubmittingComment(false);
  };

  const handleLikeComment = (commentId: string) => {
    if (!openedLetter) return;
    soundFX.playHeartBurst();

    let nextLikesVal = 1;
    setComments((prev) => {
      const next = prev.map((item) => {
        if (item.id !== commentId) return item;
        nextLikesVal = item.likes + 1;
        return { ...item, likes: nextLikesVal };
      });
      writeCachedComments(openedLetter.id, next);
      return next;
    });

    void incrementLoveCommentLikeRemote(commentId, nextLikesVal);
  };

  // React di SURAT: bisa banyak react, klik emoji sama nambah jumlah
  const handleSelectLetterReaction = (emoji: string) => {
    if (!openedLetter) return;
    soundFX.playPop();
    setOpenPickerForId(null);

    const actorName =
      commentName.trim() ||
      (currentUser === 'faiz' ? profile.faizName : profile.kenatName);

    let nextCount = 1;
    setLetterReactions((prev) => {
      nextCount = (prev[emoji] ?? 0) + 1;
      const next = { ...prev, [emoji]: nextCount };
      const commentMap: Record<string, Record<string, number>> = {};
      for (const c of comments) {
        if (Object.keys(c.reactions).length > 0) {
          commentMap[c.id] = c.reactions;
        }
      }
      writeCachedReactions(openedLetter.id, next, commentMap);
      return next;
    });

    void saveLoveLetterReactionRemote({
      letterId: openedLetter.id,
      commentId: null,
      emoji,
      nextCount,
      userName: actorName,
      replaceExistingCommentReaction: false,
    });
  };

  // React di KOMEN: hanya bisa 1 react saja; klik emoji sama -> jumlah nambah; pilih emoji lain -> ganti reactnya
  const handleSelectCommentReaction = (commentId: string, emoji: string) => {
    if (!openedLetter) return;
    soundFX.playPop();
    setOpenPickerForId(null);

    const actorName =
      commentName.trim() ||
      (currentUser === 'faiz' ? profile.faizName : profile.kenatName);

    let nextCount = 1;
    let isReplacingDifferentEmoji = false;

    setComments((prev) => {
      const next = prev.map((item) => {
        if (item.id !== commentId) return item;
        const existingEntries = Object.entries(item.reactions).filter(
          ([, c]) => c > 0
        );
        const alreadyHasSameEmoji = (item.reactions[emoji] ?? 0) > 0;

        if (alreadyHasSameEmoji) {
          nextCount = (item.reactions[emoji] ?? 0) + 1;
          return {
            ...item,
            reactions: { [emoji]: nextCount },
          };
        }

        if (existingEntries.length > 0) {
          isReplacingDifferentEmoji = true;
        }
        nextCount = 1;
        return {
          ...item,
          reactions: { [emoji]: 1 },
        };
      });

      writeCachedComments(openedLetter.id, next);
      const commentMap: Record<string, Record<string, number>> = {};
      for (const c of next) {
        if (Object.keys(c.reactions).length > 0) {
          commentMap[c.id] = c.reactions;
        }
      }
      writeCachedReactions(openedLetter.id, letterReactions, commentMap);
      return next;
    });

    void saveLoveLetterReactionRemote({
      letterId: openedLetter.id,
      commentId,
      emoji,
      nextCount,
      userName: actorName,
      replaceExistingCommentReaction: isReplacingDifferentEmoji,
    });
  };

  // ================= VIEW 2: SURAT TERBUKA =================
  if (openedLetter) {
    const letterTitle = resolveLetterTitle(openedLetter, monthsCount);
    const paragraphs = buildLetterParagraphs(openedLetter, monthsCount);
    const letterReactionEntries = Object.entries(letterReactions).filter(
      ([, count]) => count > 0
    );
    const isLetterPickerOpen = openPickerForId === 'letter';

    return (
      <div className="animate-slide-in-right relative flex flex-col gap-3.5 pb-4">
        {/* Sticky Header */}
        <div className="sticky top-0 z-20 -mx-4 flex items-center justify-between gap-2 bg-[#FFF2F7]/95 px-4 py-2 backdrop-blur-sm">
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={() => {
                soundFX.playClick();
                setOpenedLetter(null);
                setOpenPickerForId(null);
              }}
              aria-label="Kembali ke daftar surat"
              className="btn-bucin flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[#FFD6E7] bg-white text-[#2D0A1E] cursor-pointer"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
            <div>
              <h2 className="font-display flex items-center gap-1.5 text-[18px] font-extrabold leading-tight text-[#2D0A1E]">
                <span>Love Letter</span>
                <AppleEmoji emoji="💌" size={18} />
              </h2>
              <p className="text-[11px] font-semibold text-[#8A6A7A]">
                Dibuka tanggal {formatTanggalId(openedLetter.unlockDate)}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              soundFX.playClick();
              onBack();
            }}
            className="btn-bucin rounded-full border border-[#FFD6E7] bg-white px-3 py-1.5 text-[11px] font-extrabold text-[#D81B6E] shadow-xs cursor-pointer"
          >
            Kembali
          </button>
        </div>

        {/* Kertas Surat Lucu dengan Stiker & Hati Beterbangan */}
        <div className="keiz-sticker-card love-letter-paper animate-bubble-pop relative mt-2 overflow-visible px-5 pt-7 pb-5">
          {/* Washi tape top */}
          <div className="washi-tape absolute left-1/2 -top-2.5 h-5 w-24 -translate-x-1/2 -rotate-2 rounded-sm" />

          {/* Floating little hearts around paper */}
          {floatingDecorHearts.map((h) => (
            <span
              key={h.id}
              className="animate-float-slow pointer-events-none absolute select-none opacity-65"
              style={{
                top: h.top,
                left: h.left,
                right: h.right,
                animationDelay: h.delay,
              }}
              aria-hidden="true"
            >
              <svg width={h.size} height={h.size} viewBox="0 0 24 24" fill={h.color}>
                <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
              </svg>
            </span>
          ))}

          {/* Top cute stamp / badge */}
          <div className="flex items-center justify-between gap-2">
            <span className="inline-flex items-center gap-1 rounded-full border border-[#FFD6E7] bg-[#FFE3EE] px-3 py-1 text-[10px] font-extrabold text-[#D81B6E]">
              <Sparkles className="h-3 w-3 text-[#FF2E7E]" />
              <span>UNTUK {profile.kenatName.toUpperCase()} &amp; {profile.faizName.toUpperCase()}</span>
            </span>
            <Heart className="animate-heartbeat h-5 w-5 fill-[#FF2E7E] text-[#FF2E7E]" />
          </div>

          {/* Judul Surat */}
          <h3 className="font-display mt-3 text-[21px] font-extrabold leading-snug text-[#D81B6E]">
            {letterTitle}
          </h3>

          {/* Isi Surat per Paragraf + Selang-seling Polaroid Foto Album */}
          <div className="mt-4 space-y-4">
            {paragraphs.map((para, pIdx) => {
              const photo = albumCollagePhotos[pIdx];
              const isEven = pIdx % 2 === 0;

              return (
                <React.Fragment key={pIdx}>
                  <p className="text-[13.5px] font-semibold leading-[1.75] text-[#4A2538]">
                    <AppleTextWithEmojis text={para} emojiSize={16} />
                  </p>

                  {photo && (
                    <div
                      className={`flex py-1 ${
                        isEven ? 'justify-start pl-1' : 'justify-end pr-1'
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => {
                          soundFX.playPop();
                          setZoomedPhoto(photo);
                        }}
                        className={`keiz-sticker-card menu-card-bucin group relative w-[205px] bg-white p-2 pb-3 text-left shadow-md cursor-pointer ${
                          isEven ? '-rotate-2' : 'rotate-2'
                        }`}
                      >
                        <div className="washi-tape-pink absolute left-1/2 -top-2 h-4 w-14 -translate-x-1/2 rounded-sm opacity-90" />

                        {/* Stiker hati kecil di pojok polaroid */}
                        <span
                          className="absolute -right-2 -bottom-2 z-10 flex h-7 w-7 items-center justify-center rounded-full border-2 border-white bg-[#FFE3EE] shadow-sm"
                          aria-hidden="true"
                        >
                          <Heart className="h-3.5 w-3.5 fill-[#FF2E7E] text-[#FF2E7E]" />
                        </span>

                        <div className="relative aspect-[4/3.8] w-full overflow-hidden rounded-xl bg-[#FFF2F7]">
                          <img
                            src={photo.url}
                            alt={photo.caption || 'Foto Kenangan Keiz Bucin'}
                            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                          />
                        </div>

                        <div className="px-1 pt-1.5">
                          <p className="font-hand line-clamp-1 text-[13px] font-bold text-[#2D0A1E]">
                            {photo.caption || 'kenangan manis kita'}
                          </p>
                          {photo.dateLabel && (
                            <p className="text-[9.5px] font-bold text-[#9A7A8A]">
                              {photo.dateLabel}
                            </p>
                          )}
                        </div>
                      </button>
                    </div>
                  )}
                </React.Fragment>
              );
            })}

            {/* Jika masih ada sisa foto dari 7 foto yang dipilih */}
            {albumCollagePhotos.length > paragraphs.length && (
              <div className="grid grid-cols-2 gap-3 pt-2">
                {albumCollagePhotos.slice(paragraphs.length).map((photo, extraIdx) => (
                  <button
                    key={photo.id}
                    type="button"
                    onClick={() => {
                      soundFX.playPop();
                      setZoomedPhoto(photo);
                    }}
                    className={`keiz-sticker-card menu-card-bucin relative bg-white p-2 pb-2.5 text-left cursor-pointer ${
                      extraIdx % 2 === 0 ? '-rotate-2' : 'rotate-2'
                    }`}
                  >
                    <span
                      className="absolute -right-1.5 -bottom-1.5 z-10 flex h-6 w-6 items-center justify-center rounded-full border-2 border-white bg-[#FFE3EE] shadow-xs"
                      aria-hidden="true"
                    >
                      <Heart className="h-3 w-3 fill-[#FF2E7E] text-[#FF2E7E]" />
                    </span>
                    <div className="aspect-[4/4] w-full overflow-hidden rounded-xl bg-[#FFF2F7]">
                      <img
                        src={photo.url}
                        alt={photo.caption || 'Foto Kenangan'}
                        className="h-full w-full object-cover"
                      />
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* 1. REACT UNTUK SURAT LANGSUNG DI BAWAH ISI SURAT (Bisa Banyak React) */}
          <div className="mt-5 border-t border-[#FFD6E7] pt-3.5">
            <p className="text-[11px] font-extrabold text-[#D81B6E]">
              React buat surat ini
            </p>

            {letterReactionEntries.length > 0 && (
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                {letterReactionEntries.map(([emoji, count]) => (
                  <button
                    key={emoji}
                    type="button"
                    onClick={() => handleSelectLetterReaction(emoji)}
                    className="btn-bucin inline-flex items-center gap-1 rounded-full border border-[#FFD6E7] bg-[#FFF2F7] px-2.5 py-1 text-xs font-extrabold text-[#2D0A1E] shadow-xs cursor-pointer"
                  >
                    <AppleEmoji emoji={emoji} size={16} />
                    <span>{count}</span>
                  </button>
                ))}
              </div>
            )}

            <div
              className="relative mt-2.5 inline-block"
              ref={isLetterPickerOpen ? pickerContainerRef : undefined}
            >
              <button
                type="button"
                onClick={() => {
                  soundFX.playClick();
                  setOpenPickerForId(isLetterPickerOpen ? null : 'letter');
                }}
                className="btn-bucin inline-flex items-center gap-1.5 rounded-full border border-[#FFD6E7] bg-[#FFF2F7] px-3.5 py-1.5 text-xs font-extrabold text-[#D81B6E] cursor-pointer"
              >
                <Smile className="h-4 w-4 text-[#FF2E7E]" />
                <span>React</span>
              </button>

              {isLetterPickerOpen && (
                <div className="animate-bubble-pop absolute bottom-full left-0 z-30 mb-1.5 flex w-[244px] flex-wrap items-center gap-1 rounded-2xl border border-[#FFD6E7] bg-white/98 p-2 shadow-[0_10px_28px_rgba(255,46,126,0.24)] backdrop-blur-md">
                  {LOVE_REACT_EMOJIS.map((emoji) => (
                    <button
                      key={emoji}
                      type="button"
                      onClick={() => handleSelectLetterReaction(emoji)}
                      className="flex h-8 w-8 items-center justify-center rounded-full transition-transform hover:scale-125 hover:bg-[#FFF2F7] active:scale-95 cursor-pointer"
                      aria-label={`React surat ${emoji}`}
                    >
                      <AppleEmoji emoji={emoji} size={22} />
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* KOLOM KOMEN DI BAWAH LOVE LETTER */}
        <div className="keiz-sticker-card bg-white p-4">
          <h3 className="font-display flex items-center gap-1.5 text-[16px] font-extrabold text-[#2D0A1E]">
            <span>Komen Buat Kita</span>
            <AppleEmoji emoji="💬" size={18} />
          </h3>

          <form onSubmit={handleSendComment} className="mt-3 space-y-2.5">
            <input
              type="text"
              value={commentName}
              onChange={(e) => {
                setCommentName(e.target.value);
                if (commentError) setCommentError('');
              }}
              placeholder="Nama kamu..."
              maxLength={40}
              className="w-full rounded-xl border border-[#FFD6E7] bg-[#FFF8FB] px-3.5 py-2.5 text-xs font-bold text-[#2D0A1E] placeholder-[#B08A9B] focus:border-[#FF2E7E] focus:outline-none"
            />
            <textarea
              value={commentText}
              onChange={(e) => {
                setCommentText(e.target.value);
                if (commentError) setCommentError('');
              }}
              placeholder="ketik komen sayang..."
              rows={2}
              maxLength={450}
              className="w-full resize-none rounded-xl border border-[#FFD6E7] bg-[#FFF8FB] px-3.5 py-2.5 text-xs font-semibold text-[#2D0A1E] placeholder-[#B08A9B] focus:border-[#FF2E7E] focus:outline-none"
            />
            {commentError && (
              <p className="text-[11px] font-bold text-[#D81B6E]">
                {commentError}
              </p>
            )}
            <button
              type="submit"
              disabled={submittingComment}
              className="keiz-btn-primary btn-bucin flex !min-h-[44px] w-full items-center justify-center gap-1.5 px-4 text-xs font-extrabold cursor-pointer disabled:opacity-60"
            >
              <Send className="h-3.5 w-3.5" />
              <span>{submittingComment ? 'Mengirim...' : 'Kirim Komen'}</span>
            </button>
          </form>

          {/* Daftar Komen (Terbaru di Atas) */}
          <div className="mt-4 space-y-2.5">
            {comments.length === 0 ? (
              <p className="rounded-xl border border-dashed border-[#FFD6E7] bg-[#FFF8FB] px-3 py-4 text-center text-[11px] font-semibold text-[#9A7A8A]">
                Belum ada komen nih, tulis balasan manis di bawah surat yuk!
              </p>
            ) : (
              comments.map((item) => {
                const reactionEntries = Object.entries(item.reactions).filter(
                  ([, count]) => count > 0
                );
                const isPickerOpen = openPickerForId === item.id;

                return (
                  <div
                    key={item.id}
                    className="relative rounded-2xl border border-[#FFD6E7] bg-[#FFF8FB] p-3.5 shadow-[0_2px_10px_rgba(255,77,141,0.08)]"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-xs font-extrabold text-[#D81B6E]">
                        {item.name}
                      </span>
                      <span className="shrink-0 text-[10px] font-bold text-[#9A7A8A]">
                        {formatCommentTime(item.createdAt)}
                      </span>
                    </div>

                    <p className="mt-1 whitespace-pre-wrap break-words text-xs font-semibold leading-relaxed text-[#2D0A1E]">
                      <AppleTextWithEmojis text={item.text} emojiSize={15} />
                    </p>

                    {/* React yang menempel di bawah komen (maks 1 react di komen) */}
                    {reactionEntries.length > 0 && (
                      <div className="mt-2 flex flex-wrap items-center gap-1.5">
                        {reactionEntries.slice(0, 1).map(([emoji, count]) => (
                          <button
                            key={emoji}
                            type="button"
                            onClick={() =>
                              handleSelectCommentReaction(item.id, emoji)
                            }
                            className="btn-bucin inline-flex items-center gap-1 rounded-full border border-[#FFD6E7] bg-white px-2.5 py-0.5 text-[11px] font-extrabold text-[#2D0A1E] cursor-pointer"
                          >
                            <AppleEmoji emoji={emoji} size={14} />
                            <span>{count}</span>
                          </button>
                        ))}
                      </div>
                    )}

                    {/* Like & React Actions */}
                    <div className="mt-2.5 flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleLikeComment(item.id)}
                        className="btn-bucin inline-flex items-center gap-1 rounded-full border border-[#FFD6E7] bg-white px-2.5 py-1 text-[11px] font-extrabold text-[#D81B6E] cursor-pointer"
                      >
                        <Heart
                          className={`h-3.5 w-3.5 ${
                            item.likes > 0
                              ? 'fill-[#FF2E7E] text-[#FF2E7E]'
                              : 'text-[#FF2E7E]'
                          }`}
                        />
                        <span>{item.likes}</span>
                      </button>

                      <div
                        className="relative"
                        ref={isPickerOpen ? pickerContainerRef : undefined}
                      >
                        <button
                          type="button"
                          onClick={() => {
                            soundFX.playClick();
                            setOpenPickerForId(isPickerOpen ? null : item.id);
                          }}
                          className="btn-bucin inline-flex items-center gap-1 rounded-full border border-[#FFD6E7] bg-white px-2.5 py-1 text-[11px] font-extrabold text-[#6E5460] hover:text-[#D81B6E] cursor-pointer"
                        >
                          <Smile className="h-3.5 w-3.5 text-[#FF2E7E]" />
                          <span>React</span>
                        </button>

                        {isPickerOpen && (
                          <div className="animate-bubble-pop absolute bottom-full left-0 z-30 mb-1.5 flex w-[238px] flex-wrap items-center gap-1 rounded-2xl border border-[#FFD6E7] bg-white/98 p-2 shadow-[0_10px_28px_rgba(255,46,126,0.24)] backdrop-blur-md">
                            {LOVE_REACT_EMOJIS.map((emoji) => (
                              <button
                                key={emoji}
                                type="button"
                                onClick={() =>
                                  handleSelectCommentReaction(item.id, emoji)
                                }
                                className="flex h-8 w-8 items-center justify-center rounded-full transition-transform hover:scale-125 hover:bg-[#FFF2F7] active:scale-95 cursor-pointer"
                                aria-label={`React komen ${emoji}`}
                              >
                                <AppleEmoji emoji={emoji} size={22} />
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Fullscreen Zoom Photo Modal */}
        {zoomedPhoto && (
          <div
            onClick={() => setZoomedPhoto(null)}
            className="fixed inset-0 z-[80] flex items-center justify-center bg-[#2D0A1E]/80 p-4 backdrop-blur-sm"
          >
            <div
              onClick={(e) => e.stopPropagation()}
              className="animate-bubble-pop relative w-full max-w-[390px] overflow-hidden rounded-[22px] border-2 border-[#FFD6E7] bg-white p-3 shadow-2xl"
            >
              <button
                type="button"
                onClick={() => {
                  soundFX.playClick();
                  setZoomedPhoto(null);
                }}
                aria-label="Tutup foto"
                className="btn-bucin absolute right-5 top-5 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-white/95 text-[#2D0A1E] shadow cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
              <img
                src={zoomedPhoto.url}
                alt={zoomedPhoto.caption || 'Foto Kenangan KEIZ'}
                className="max-h-[68dvh] w-full rounded-2xl object-contain bg-[#FFF2F7]"
              />
              {(zoomedPhoto.caption || zoomedPhoto.dateLabel) && (
                <div className="px-2 pb-1 pt-3">
                  {zoomedPhoto.dateLabel && (
                    <p className="text-[11px] font-bold text-[#8A6A7A]">
                      {zoomedPhoto.dateLabel}
                    </p>
                  )}
                  {zoomedPhoto.caption && (
                    <p className="font-hand mt-0.5 text-lg font-bold text-[#2D0A1E]">
                      {zoomedPhoto.caption}
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    );
  }

  // ================= VIEW 1: DAFTAR AMPLOP LOVE LETTER =================
  return (
    <div className="animate-slide-in-right flex flex-col gap-3.5 pb-4">
      {/* Sticky Header */}
      <div className="sticky top-0 z-20 -mx-4 flex items-center justify-between gap-2 bg-[#FFF2F7]/95 px-4 py-2 backdrop-blur-sm">
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={() => {
              soundFX.playClick();
              onBack();
            }}
            aria-label="Kembali"
            className="btn-bucin flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[#FFD6E7] bg-white text-[#2D0A1E] cursor-pointer"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div>
            <h2 className="font-display flex items-center gap-1.5 text-[20px] font-extrabold leading-tight text-[#2D0A1E]">
              <span>Love Letter</span>
              <AppleEmoji emoji="💌" size={20} />
            </h2>
            <p className="text-[12px] font-semibold text-[#8A6A7A]">
              Surat cinta spesial Kenat &amp; Faiz
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => {
            soundFX.playClick();
            onBack();
          }}
          className="btn-bucin rounded-full border border-[#FFD6E7] bg-white px-3 py-1.5 text-[11px] font-extrabold text-[#D81B6E] shadow-xs cursor-pointer"
        >
          Kembali
        </button>
      </div>

      {/* Locked Toast Notice */}
      {lockedNotice && (
        <div className="animate-bubble-pop flex items-center gap-2 rounded-2xl border border-[#FFD6E7] bg-white px-3.5 py-2.5 text-xs font-extrabold text-[#D81B6E] shadow-sm">
          <AppleEmoji emoji="🔒" size={16} />
          <span>{lockedNotice}</span>
        </div>
      )}

      {/* List Amplop */}
      {loading ? (
        <div className="keiz-card flex flex-col items-center justify-center bg-white p-8 text-center">
          <Loader2 className="h-7 w-7 animate-spin text-[#FF2E7E]" />
          <p className="mt-2 text-xs font-bold text-[#8A6A7A]">
            Lagi ngambil amplop Love Letter...
          </p>
        </div>
      ) : letters.length === 0 ? (
        <div className="keiz-card bg-white p-7 text-center">
          <p className="text-xs font-extrabold text-[#5C3A49]">
            Belum ada Love Letter tersimpan.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-4 pt-1">
          {letters.map((letter, idx) => {
            const isUnlocked = isToday28 && letter.unlockDate <= todayYmd;
            const targetUnlockDate = isUnlocked
              ? letter.unlockDate
              : letter.unlockDate > todayYmd
              ? letter.unlockDate
              : nextOrCurrent28Ymd;
            const isOpening = openingId === letter.id;
            const isShaking = lockedShakeId === letter.id;
            const titleText = resolveLetterTitle(letter, monthsCount);
            const unlockLabel = formatTanggalId(targetUnlockDate);

            return (
              <button
                key={letter.id}
                type="button"
                onClick={(e) => handleOpenEnvelope(letter, e)}
                className={`keiz-sticker-card relative w-full overflow-visible bg-white p-4 pt-5 text-left transition-transform ${
                  isUnlocked
                    ? 'menu-card-bucin cursor-pointer'
                    : 'cursor-not-allowed opacity-90'
                } ${idx % 2 === 0 ? '-rotate-[0.6deg]' : 'rotate-[0.6deg]'} ${
                  isShaking ? 'animate-bubble-shake' : ''
                }`}
              >
                <div className="washi-tape absolute left-1/2 -top-2.5 h-5 w-20 -translate-x-1/2 -rotate-1 rounded-sm" />

                {/* Amplop Lucu Visual */}
                <div
                  className={`relative mx-auto overflow-hidden rounded-2xl border border-[#FFD6E7] p-4 ${
                    isUnlocked
                      ? 'bg-gradient-to-b from-[#FFF2F7] to-[#FFE3EE]'
                      : 'bg-gradient-to-b from-[#F8F3F6] to-[#EFE7EC]'
                  }`}
                >
                  {/* Flap Segitiga Amplop */}
                  <div
                    className={`pointer-events-none absolute inset-x-0 top-0 h-14 ${
                      isOpening ? 'love-envelope-flap-open' : ''
                    }`}
                  >
                    <svg
                      viewBox="0 0 320 70"
                      preserveAspectRatio="none"
                      className="h-full w-full drop-shadow-xs"
                    >
                      <polygon
                        points="0,0 320,0 160,64"
                        fill={isUnlocked ? '#FFD6E7' : '#E5DCE1'}
                      />
                    </svg>
                  </div>

                  {/* Kertas Surat Mengintip Saat Dibuka */}
                  {isOpening && (
                    <div className="love-letter-peek mx-auto mb-2 w-[84%] rounded-xl border border-[#FFD6E7] bg-white px-3 py-2 text-center shadow-md">
                      <p className="font-display text-xs font-extrabold text-[#D81B6E]">
                        Membuka surat cinta...
                      </p>
                    </div>
                  )}

                  {/* Wax Heart Seal / Lock Icon */}
                  <div className="relative z-10 mt-4 flex flex-col items-center text-center">
                    <div
                      className={`flex h-12 w-12 items-center justify-center rounded-full border-2 border-white shadow-md ${
                        isUnlocked
                          ? 'bg-gradient-to-r from-[#FF2E7E] to-[#FF7AB8]'
                          : 'bg-[#C4B2BC]'
                      }`}
                    >
                      {isUnlocked ? (
                        <MailOpen className="h-5 w-5 text-white" />
                      ) : (
                        <Lock className="h-5 w-5 text-white" />
                      )}
                    </div>

                    <p className="font-display mt-3 text-[17px] font-extrabold leading-snug text-[#2D0A1E]">
                      {titleText}
                    </p>

                    <p className="mt-1 text-[11px] font-bold text-[#8A6A7A]">
                      Tanggal unlock: {unlockLabel}
                    </p>

                    <div className="mt-2.5">
                      {isUnlocked ? (
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-[#FF2E7E] to-[#FF7AB8] px-3.5 py-1 text-[11px] font-extrabold text-white shadow-xs">
                          <span>Terbuka · Klik untuk baca</span>
                          <AppleEmoji emoji="💌" size={14} />
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 rounded-full border border-[#E2D5DC] bg-white/90 px-3.5 py-1 text-[11px] font-extrabold text-[#7D6672]">
                          <AppleEmoji emoji="🔒" size={14} />
                          <span>Terkunci, baru kebuka tanggal {unlockLabel}</span>
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};
