import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Heart, Send, Smile, Sparkles } from 'lucide-react';
import { getSupabaseClient } from '../supabaseClient';
import { soundFX } from '../sound';
import type { CoupleProfile, Role } from '../types';
import { AppleEmoji, AppleTextWithEmojis } from './AppleEmoji';

export interface SimpleDateParts {
  year: number;
  monthIndex: number; // 0-11
  day: number;
}

export const DEFAULT_COUPLE_START: SimpleDateParts = {
  year: 2026,
  monthIndex: 7, // Agustus
  day: 28,
};

export const MENSIVE_REACT_EMOJIS = [
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

export interface MensiveCommentItem {
  id: string;
  name: string;
  text: string;
  createdAt: string;
  likes: number;
  reactions: Record<string, number>;
}

const COMMENTS_CACHE_KEY = 'keiz_mensive_comments_v1';
const REACTIONS_CACHE_KEY = 'keiz_mensive_reactions_v1';
const LETTER_REACTIONS_CACHE_KEY = 'keiz_mensive_letter_reactions_v1';

function getLetterReactionTargetId(monthsCount: number): string {
  const safeHex = Math.max(0, Math.min(999999999999, Math.floor(monthsCount)))
    .toString(16)
    .padStart(12, '0');
  return `00000000-0000-4000-8000-${safeHex}`;
}

export function parseCoupleDate(raw: unknown): SimpleDateParts | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const isoMatch = trimmed.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (isoMatch) {
    const year = Number(isoMatch[1]);
    const monthIndex = Number(isoMatch[2]) - 1;
    const day = Number(isoMatch[3]);
    if (
      Number.isFinite(year) &&
      monthIndex >= 0 &&
      monthIndex <= 11 &&
      day >= 1 &&
      day <= 31
    ) {
      return { year, monthIndex, day };
    }
  }

  const parsed = new Date(trimmed);
  if (!Number.isNaN(parsed.getTime())) {
    return {
      year: parsed.getFullYear(),
      monthIndex: parsed.getMonth(),
      day: parsed.getDate(),
    };
  }
  return null;
}

export function computeMensiveMetrics(
  start: SimpleDateParts,
  now: Date
): {
  isMensiveDay: boolean;
  monthsCount: number;
  totalDays: number;
} {
  const y = now.getFullYear();
  const m = now.getMonth();
  const d = now.getDate();

  const startUtc = Date.UTC(start.year, start.monthIndex, start.day);
  const todayUtc = Date.UTC(y, m, d);

  const totalDays = Math.max(0, Math.floor((todayUtc - startUtc) / 86400000));
  const monthsCount = Math.max(
    0,
    (y - start.year) * 12 + (m - start.monthIndex)
  );
  const isMensiveDay =
    d === start.day && todayUtc >= startUtc && monthsCount >= 1;

  return {
    isMensiveDay,
    monthsCount,
    totalDays,
  };
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

function buildDefaultMensiveLetter(
  monthsCount: number,
  _totalDays: number,
  _kenatName: string,
  _faizName: string
): string {
  return [
    `HAPPY MENSIVE SAYANGKU, YEYYY MENSIVE KE ${monthsCount} BULAN`,
    `sayang, ga kerasa ya kita udah ${monthsCount} bulan bareng`,
    'dari 28 Agustus 2026, dari yang awalnya cuma chat masi canggung, sekarang kita udah jadi pasangan yang lucu sekali',
    `makasih ya udah mau sabar sama aku, udah peduli sama aku, makasih udah selalu ada buat aku, makasih udah mau bertahan ${monthsCount} bulan ini sama aku`,
    'aku bersyukur banget punya pacar kaya kamu, aku bangga banget punya pacar kaya kamu, kamu tu rumah buat aku pulang, tempat aku cerita semua hal, dan orang yang paling aku sayang, cuma kamu satu satunya yang aku sayang',
    'semoga kita bisa selalu bareng terus selamanya, sampe bertemu mensive mensive berikutnya ya sayang, semoga kita masi bisa selalu ngerayain mensive bareng bareng, jangan bosen sama aku ya sayang',
    'i loveee youuu sayangkuuu, cintakuuu, cantikkuuu, pacarkuuu, adeee sayanggg, duniakuuu, separuhhh nafaskuuu, belahannn jiwakuuu, belahan semua semuanyaaa akuuu, muahhh muahhh muahhh',
  ].join('\n\n');
}

export interface MensiveFetchedData {
  coupleStart: SimpleDateParts;
  kenatPhoto: string;
  faizPhoto: string;
  kenatName: string;
  faizName: string;
  lettersRows: Record<string, unknown>[];
}

export async function fetchMensiveRemoteData(
  fallbackProfile: CoupleProfile
): Promise<MensiveFetchedData> {
  let coupleStart: SimpleDateParts = DEFAULT_COUPLE_START;
  let kenatPhoto = fallbackProfile.kenatPhoto;
  let faizPhoto = fallbackProfile.faizPhoto;
  let kenatName = fallbackProfile.kenatName || 'Kenat';
  let faizName = fallbackProfile.faizName || 'Faiz';
  let lettersRows: Record<string, unknown>[] = [];

  const sb = getSupabaseClient();
  if (!sb) {
    return {
      coupleStart,
      kenatPhoto,
      faizPhoto,
      kenatName,
      faizName,
      lettersRows,
    };
  }

  // 1. Ambil tanggal pacaran dari tabel couple_info
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
      if (parsed) {
        coupleStart = parsed;
      }
    }
  } catch {
    // Gunakan default 28 Agustus 2026 jika tabel couple_info belum tersedia
  }

  // 2. Ambil foto profil Kenat dan Faiz dari tabel profiles
  try {
    const { data, error } = await sb.from('profiles').select('*').limit(10);
    if (!error && Array.isArray(data) && data.length > 0) {
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
    }
  } catch {
    // Fallback ke foto profil aktif dari state
  }

  // 3. Ambil isi surat dari tabel mensive_letters
  try {
    const { data, error } = await sb
      .from('mensive_letters')
      .select('*')
      .limit(50);
    if (!error && Array.isArray(data)) {
      lettersRows = data as Record<string, unknown>[];
    }
  } catch {
    // Fallback ke surat default jika tabel mensive_letters belum ada
  }

  return {
    coupleStart,
    kenatPhoto,
    faizPhoto,
    kenatName,
    faizName,
    lettersRows,
  };
}

function resolveLetterText(
  rows: Record<string, unknown>[],
  monthsCount: number,
  totalDays: number,
  kenatName: string,
  faizName: string
): string {
  if (rows.length > 0) {
    const monthMatch = rows.find((r) => {
      const mVal =
        r.month ?? r.bulan ?? r.month_number ?? r.mensive_ke ?? r.ke_bulan;
      return Number(mVal) === monthsCount;
    });

    const chosen = monthMatch ?? rows[rows.length - 1];
    if (chosen) {
      const text = pickFirstString(chosen, [
        'letter',
        'isi_surat',
        'isi',
        'content',
        'message',
        'pesan',
        'body',
        'text',
        'surat',
      ]);
      if (text) return text;
    }
  }

  return buildDefaultMensiveLetter(monthsCount, totalDays, kenatName, faizName);
}

function formatCommentTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const hh = String(date.getHours()).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');
  return `${hh}.${mm}`;
}

function readCachedComments(): MensiveCommentItem[] {
  try {
    const raw = localStorage.getItem(COMMENTS_CACHE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as MensiveCommentItem[]) : [];
  } catch {
    return [];
  }
}

function writeCachedComments(items: MensiveCommentItem[]): void {
  try {
    localStorage.setItem(COMMENTS_CACHE_KEY, JSON.stringify(items));
  } catch {
    // ignore
  }
}

function readCachedReactions(): Record<string, Record<string, number>> {
  try {
    const raw = localStorage.getItem(REACTIONS_CACHE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object'
      ? (parsed as Record<string, Record<string, number>>)
      : {};
  } catch {
    return {};
  }
}

function writeCachedReactions(
  map: Record<string, Record<string, number>>
): void {
  try {
    localStorage.setItem(REACTIONS_CACHE_KEY, JSON.stringify(map));
  } catch {
    // ignore
  }
}

function readCachedLetterReactions(monthsCount: number): Record<string, number> {
  try {
    const raw = localStorage.getItem(
      `${LETTER_REACTIONS_CACHE_KEY}_${monthsCount}`
    );
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object'
      ? (parsed as Record<string, number>)
      : {};
  } catch {
    return {};
  }
}

function writeCachedLetterReactions(
  monthsCount: number,
  map: Record<string, number>
): void {
  try {
    localStorage.setItem(
      `${LETTER_REACTIONS_CACHE_KEY}_${monthsCount}`,
      JSON.stringify(map)
    );
  } catch {
    // ignore
  }
}

function normalizeCommentRow(
  row: Record<string, unknown>,
  reactionMap: Record<string, Record<string, number>>
): MensiveCommentItem | null {
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
    name,
    text,
    createdAt,
    likes,
    reactions: reactionMap[id] ?? {},
  };
}

async function loadMensiveCommentsAndReactions(
  monthsCount: number
): Promise<{
  comments: MensiveCommentItem[];
  letterReactions: Record<string, number>;
}> {
  const cachedComments = readCachedComments();
  const cachedReactions = readCachedReactions();
  const cachedLetterReactions = readCachedLetterReactions(monthsCount);
  const letterTargetId = getLetterReactionTargetId(monthsCount);
  const sb = getSupabaseClient();

  if (!sb) {
    return {
      comments: cachedComments.map((c) => ({
        ...c,
        reactions: c.reactions || cachedReactions[c.id] || {},
      })),
      letterReactions: cachedLetterReactions,
    };
  }

  const reactionMap: Record<string, Record<string, number>> = {};
  let reactionsLoaded = false;

  try {
    const { data, error } = await sb
      .from('mensive_reactions')
      .select('*')
      .limit(500);
    if (!error && Array.isArray(data)) {
      reactionsLoaded = true;
      for (const item of data) {
        const row = item as Record<string, unknown>;
        const commentId = String(
          row.comment_id ?? row.mensive_comment_id ?? ''
        ).trim();
        const emoji = pickFirstString(row, ['emoji', 'reaction', 'emot']);
        if (!commentId || !emoji) continue;
        if (!reactionMap[commentId]) reactionMap[commentId] = {};
        const explicitCount =
          typeof row.count === 'number'
            ? row.count
            : typeof row.jumlah === 'number'
            ? row.jumlah
            : typeof row.total === 'number'
            ? row.total
            : null;
        if (explicitCount !== null && explicitCount > 0) {
          reactionMap[commentId][emoji] =
            (reactionMap[commentId][emoji] ?? 0) + explicitCount;
        } else {
          reactionMap[commentId][emoji] =
            (reactionMap[commentId][emoji] ?? 0) + 1;
        }
      }
    }
  } catch {
    // Fallback ke cache lokal jika tabel mensive_reactions belum ada
  }

  const resolvedLetterReactions =
    reactionsLoaded && reactionMap[letterTargetId]
      ? reactionMap[letterTargetId]
      : cachedLetterReactions;
  if (reactionsLoaded && reactionMap[letterTargetId]) {
    writeCachedLetterReactions(monthsCount, reactionMap[letterTargetId]);
  }

  let commentRows: Record<string, unknown>[] | null = null;
  try {
    const res1 = await sb
      .from('mensive_comments')
      .select('*')
      .order('created_at', { ascending: true })
      .limit(200);
    if (!res1.error && Array.isArray(res1.data)) {
      commentRows = res1.data as Record<string, unknown>[];
    } else {
      const res2 = await sb.from('mensive_comments').select('*').limit(200);
      if (!res2.error && Array.isArray(res2.data)) {
        commentRows = res2.data as Record<string, unknown>[];
      }
    }
  } catch {
    // Fallback ke cache lokal jika tabel mensive_comments belum ada
  }

  if (commentRows) {
    const effectiveReactions = reactionsLoaded ? reactionMap : cachedReactions;
    const normalized: MensiveCommentItem[] = [];
    for (const r of commentRows) {
      const item = normalizeCommentRow(r, effectiveReactions);
      if (item) normalized.push(item);
    }
    writeCachedComments(normalized);
    if (reactionsLoaded) {
      writeCachedReactions(reactionMap);
    }
    return {
      comments: normalized,
      letterReactions: resolvedLetterReactions,
    };
  }

  return {
    comments: cachedComments.map((c) => ({
      ...c,
      reactions:
        (reactionsLoaded ? reactionMap[c.id] : undefined) ||
        c.reactions ||
        cachedReactions[c.id] ||
        {},
    })),
    letterReactions: resolvedLetterReactions,
  };
}

async function insertMensiveCommentRemote(
  name: string,
  text: string,
  monthsCount: number
): Promise<MensiveCommentItem | null> {
  const sb = getSupabaseClient();
  if (!sb) return null;

  const payloads: Record<string, unknown>[] = [
    { name, comment: text, likes: 0, month: monthsCount },
    { name, comment: text, likes: 0 },
    { name, comment: text },
    { nama: name, komentar: text, likes: 0 },
    { nama: name, komentar: text },
    { author: name, content: text, likes: 0 },
    { author: name, message: text },
    { nama: name, isi: text },
  ];

  for (const payload of payloads) {
    try {
      const { data, error } = await sb
        .from('mensive_comments')
        .insert(payload)
        .select('*')
        .single();
      if (!error && data) {
        const normalized = normalizeCommentRow(
          data as Record<string, unknown>,
          {}
        );
        if (normalized) return normalized;
      }
    } catch {
      // Coba varian kolom berikutnya
    }
  }
  return null;
}

async function incrementCommentLikeRemote(
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
        .from('mensive_comments')
        .update(payload)
        .eq('id', commentId);
      if (!error) return;
    } catch {
      // Coba nama kolom berikutnya
    }
  }
}

async function saveCommentReactionRemote(
  commentId: string,
  emoji: string,
  nextCount: number,
  userName: string
): Promise<void> {
  const sb = getSupabaseClient();
  if (!sb || commentId.startsWith('local-')) return;

  const payloads: Record<string, unknown>[] = [
    { comment_id: commentId, emoji, user_name: userName },
    { comment_id: commentId, emoji },
    { mensive_comment_id: commentId, emoji },
    { comment_id: commentId, reaction: emoji },
  ];

  for (const payload of payloads) {
    try {
      const { error } = await sb.from('mensive_reactions').insert(payload);
      if (!error) return;
    } catch {
      // Coba varian berikutnya atau update count jika unique constraint
    }
  }

  // Fallback jika tabel memakai unique (comment_id, emoji) dengan kolom count
  const countPayloads: Record<string, unknown>[] = [
    { count: nextCount },
    { jumlah: nextCount },
    { total: nextCount },
  ];
  for (const cp of countPayloads) {
    try {
      const { error } = await sb
        .from('mensive_reactions')
        .update(cp)
        .eq('comment_id', commentId)
        .eq('emoji', emoji);
      if (!error) return;
    } catch {
      // Abaikan jika tidak cocok
    }
  }
}

interface MensivePopupModalProps {
  open: boolean;
  currentUser: Role;
  monthsCount: number;
  totalDays: number;
  kenatPhoto: string;
  faizPhoto: string;
  kenatName: string;
  faizName: string;
  lettersRows: Record<string, unknown>[];
  onClose: () => void;
}

export const MensivePopupModal: React.FC<MensivePopupModalProps> = ({
  open,
  currentUser,
  monthsCount,
  totalDays,
  kenatPhoto,
  faizPhoto,
  kenatName,
  faizName,
  lettersRows,
  onClose,
}) => {
  const [imgKenatErr, setImgKenatErr] = useState(false);
  const [imgFaizErr, setImgFaizErr] = useState(false);

  const [comments, setComments] = useState<MensiveCommentItem[]>([]);
  const [letterReactions, setLetterReactions] = useState<
    Record<string, number>
  >({});
  const [commentName, setCommentName] = useState('');
  const [commentText, setCommentText] = useState('');
  const [submittingComment, setSubmittingComment] = useState(false);
  const [commentError, setCommentError] = useState('');
  const [openPickerForId, setOpenPickerForId] = useState<string | null>(null);
  const pickerContainerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setImgKenatErr(false);
  }, [kenatPhoto]);

  useEffect(() => {
    setImgFaizErr(false);
  }, [faizPhoto]);

  const refreshComments = useCallback(async () => {
    const res = await loadMensiveCommentsAndReactions(monthsCount);
    setComments(res.comments);
    setLetterReactions(res.letterReactions);
  }, [monthsCount]);

  useEffect(() => {
    if (!open) return;
    void refreshComments();

    const sb = getSupabaseClient();
    if (!sb) return;

    const channel = sb
      .channel(`mensive_comments_live_${Date.now()}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'mensive_comments' },
        () => {
          void refreshComments();
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'mensive_reactions' },
        () => {
          void refreshComments();
        }
      )
      .subscribe();

    return () => {
      void sb.removeChannel(channel);
    };
  }, [open, refreshComments]);

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

  const confettiHearts = useMemo(
    () =>
      Array.from({ length: 28 }, (_, i) => ({
        id: i,
        left: `${(i * 3.6 + (i % 3) * 1.4) % 97}%`,
        delay: `${((i % 9) * 0.45).toFixed(2)}s`,
        duration: `${(3.2 + (i % 5) * 0.65).toFixed(2)}s`,
        size: 14 + (i % 4) * 5,
        driftX: `${(i % 2 === 0 ? 1 : -1) * (12 + (i % 4) * 8)}px`,
        color:
          i % 4 === 0
            ? '#FF2E7E'
            : i % 4 === 1
            ? '#FF7AB8'
            : i % 4 === 2
            ? '#3B82F6'
            : '#FB7185',
      })),
    []
  );

  if (!open) return null;

  const letterText = resolveLetterText(
    lettersRows,
    monthsCount,
    totalDays,
    kenatName,
    faizName
  );

  const handleSendComment = async (e: React.FormEvent) => {
    e.preventDefault();
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
    const optimisticItem: MensiveCommentItem = {
      id: tempId,
      name: cleanName,
      text: cleanText,
      createdAt: new Date().toISOString(),
      likes: 0,
      reactions: {},
    };

    setComments((prev) => {
      const next = [...prev, optimisticItem];
      writeCachedComments(next);
      return next;
    });
    setCommentText('');

    const remoteSaved = await insertMensiveCommentRemote(
      cleanName,
      cleanText,
      monthsCount
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
        writeCachedComments(next);
        return next;
      });
    }

    setSubmittingComment(false);
  };

  const handleLikeComment = (commentId: string) => {
    soundFX.playHeartBurst();
    let nextLikesVal = 1;
    setComments((prev) => {
      const next = prev.map((item) => {
        if (item.id !== commentId) return item;
        nextLikesVal = item.likes + 1;
        return { ...item, likes: nextLikesVal };
      });
      writeCachedComments(next);
      return next;
    });
    void incrementCommentLikeRemote(commentId, nextLikesVal);
  };

  const handleSelectReaction = (commentId: string, emoji: string) => {
    soundFX.playPop();
    setOpenPickerForId(null);

    let nextEmojiCount = 1;
    const actorName =
      commentName.trim() || (currentUser === 'faiz' ? faizName : kenatName);

    setComments((prev) => {
      const next = prev.map((item) => {
        if (item.id !== commentId) return item;
        const currentCount = item.reactions[emoji] ?? 0;
        nextEmojiCount = currentCount + 1;
        const updatedReactions = {
          ...item.reactions,
          [emoji]: nextEmojiCount,
        };
        return { ...item, reactions: updatedReactions };
      });
      writeCachedComments(next);

      const reactionMap: Record<string, Record<string, number>> = {};
      for (const c of next) {
        if (Object.keys(c.reactions).length > 0) {
          reactionMap[c.id] = c.reactions;
        }
      }
      writeCachedReactions(reactionMap);
      return next;
    });

    void saveCommentReactionRemote(commentId, emoji, nextEmojiCount, actorName);
  };

  const handleSelectLetterReaction = (emoji: string) => {
    soundFX.playPop();
    setOpenPickerForId(null);

    let nextEmojiCount = 1;
    const actorName =
      commentName.trim() || (currentUser === 'faiz' ? faizName : kenatName);
    const letterTargetId = getLetterReactionTargetId(monthsCount);

    setLetterReactions((prev) => {
      nextEmojiCount = (prev[emoji] ?? 0) + 1;
      const updated = { ...prev, [emoji]: nextEmojiCount };
      writeCachedLetterReactions(monthsCount, updated);
      return updated;
    });

    void saveCommentReactionRemote(
      letterTargetId,
      emoji,
      nextEmojiCount,
      actorName
    );
  };

  const letterReactionEntries = Object.entries(letterReactions).filter(
    ([, count]) => count > 0
  );
  const isLetterPickerOpen = openPickerForId === 'letter';

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="mensive-popup-title"
      className="fixed inset-0 z-[70] flex items-center justify-center overflow-hidden bg-gradient-to-b from-[#FFF2F7]/95 via-[#FFE4EF]/95 to-[#FFD6E7]/95 p-4 backdrop-blur-md"
    >
      {/* Animasi Confetti Berbentuk Hati Jatuh dari Atas Layar */}
      <div
        className="pointer-events-none fixed inset-0 overflow-hidden"
        aria-hidden="true"
      >
        {confettiHearts.map((item) => (
          <span
            key={item.id}
            className="mensive-heart-confetti absolute -top-10 select-none"
            style={
              {
                left: item.left,
                animationDelay: item.delay,
                animationDuration: item.duration,
                '--drift-x': item.driftX,
              } as React.CSSProperties
            }
          >
            <svg
              width={item.size}
              height={item.size}
              viewBox="0 0 24 24"
              fill={item.color}
              className="drop-shadow-[0_2px_6px_rgba(255,46,126,0.28)]"
            >
              <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
            </svg>
          </span>
        ))}
      </div>

      {/* Card Utama Full-Screen Pop-Up (Scrollable ke bawah) */}
      <div className="keiz-card animate-bubble-pop relative z-10 flex max-h-[90dvh] w-full max-w-[398px] flex-col items-center overflow-y-auto bg-white/95 px-5 pt-6 pb-5 text-center shadow-[0_18px_48px_rgba(255,46,126,0.28)]">
        {/* Badge Tanggal 28 */}
        <div className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-[#FFD6E7] bg-[#FFF2F7] px-3.5 py-1 text-[11px] font-extrabold tracking-wide text-[#D81B6E]">
          <Sparkles className="h-3.5 w-3.5 text-[#FF2E7E]" />
          <span>KEIZ BUCIN · TANGGAL 28</span>
        </div>

        {/* 1. Foto Profil Kenat & Faiz */}
        <div className="mt-4 flex shrink-0 items-center justify-center">
          <div className="relative flex flex-col items-center">
            {!imgKenatErr && kenatPhoto ? (
              <img
                src={kenatPhoto}
                alt={kenatName}
                onError={() => setImgKenatErr(true)}
                className="h-[72px] w-[72px] rounded-full border-4 border-[#FF4D8D] bg-white object-cover shadow-md"
              />
            ) : (
              <div className="flex h-[72px] w-[72px] items-center justify-center rounded-full border-4 border-[#FF4D8D] bg-[#FFE3EE] font-display text-xl font-extrabold text-[#D81B6E] shadow-md">
                {kenatName.slice(0, 1).toUpperCase()}
              </div>
            )}
            <span className="mt-1.5 text-[11px] font-extrabold text-[#D81B6E]">
              {kenatName}
            </span>
          </div>

          <div className="animate-heartbeat -mx-2 z-10 mb-4 flex h-9 w-9 items-center justify-center rounded-full border-2 border-white bg-gradient-to-r from-[#FF2E7E] to-[#FF7AB8] shadow-md">
            <Heart className="h-4 w-4 fill-white text-white" />
          </div>

          <div className="relative flex flex-col items-center">
            {!imgFaizErr && faizPhoto ? (
              <img
                src={faizPhoto}
                alt={faizName}
                onError={() => setImgFaizErr(true)}
                className="h-[72px] w-[72px] rounded-full border-4 border-[#3B82F6] bg-white object-cover shadow-md"
              />
            ) : (
              <div className="flex h-[72px] w-[72px] items-center justify-center rounded-full border-4 border-[#3B82F6] bg-[#EFF6FF] font-display text-xl font-extrabold text-[#2563EB] shadow-md">
                {faizName.slice(0, 1).toUpperCase()}
              </div>
            )}
            <span className="mt-1.5 text-[11px] font-extrabold text-[#2563EB]">
              {faizName}
            </span>
          </div>
        </div>

        {/* 2. Judul Besar Dinamis */}
        <h2
          id="mensive-popup-title"
          className="font-display mt-4 shrink-0 text-[21px] font-extrabold leading-snug tracking-tight text-[#D81B6E]"
        >
          HAPPY MENSIVE SAYANGKU, YEYYY MENSIVE KE {monthsCount} BULAN
        </h2>

        {/* 3. Total Hari Bareng Dinamis */}
        <div className="mt-2.5 inline-flex shrink-0 items-center gap-1.5 rounded-full border border-[#FFD6E7] bg-[#FFE3EE] px-4 py-1.5 text-[13px] font-extrabold text-[#2D0A1E]">
          <span>Kita udah {totalDays} hari bareng</span>
        </div>

        {/* 4. Kotak Surat Mensive + Reaction Emoji iPhone */}
        <div className="mt-4 w-full shrink-0 rounded-2xl border border-[#FFD6E7] bg-[#FFF2F7] px-4 py-3.5 text-left shadow-inner">
          <p className="text-[11px] font-extrabold tracking-wide text-[#FF2E7E]">
            Surat Mensive Buat Kita
          </p>
          <p className="mt-1.5 whitespace-pre-line text-[13px] font-semibold leading-relaxed text-[#5C3A49]">
            <AppleTextWithEmojis text={letterText} emojiSize={16} />
          </p>

          {/* Reactions attached below Surat Mensive */}
          {letterReactionEntries.length > 0 && (
            <div className="mt-3 flex flex-wrap items-center gap-1.5">
              {letterReactionEntries.map(([emoji, count]) => (
                <button
                  key={emoji}
                  type="button"
                  onClick={() => handleSelectLetterReaction(emoji)}
                  className="btn-bucin inline-flex items-center gap-1 rounded-full border border-[#FFD6E7] bg-white px-2.5 py-0.5 text-[11px] font-extrabold text-[#2D0A1E] shadow-xs cursor-pointer"
                >
                  <AppleEmoji emoji={emoji} size={15} />
                  <span>{count}</span>
                </button>
              ))}
            </div>
          )}

          {/* Tombol React Surat Mensive */}
          <div
            className="relative mt-2.5 flex items-center"
            ref={isLetterPickerOpen ? pickerContainerRef : undefined}
          >
            <button
              type="button"
              onClick={() => {
                soundFX.playClick();
                setOpenPickerForId(isLetterPickerOpen ? null : 'letter');
              }}
              className="btn-bucin inline-flex items-center gap-1 rounded-full border border-[#FFD6E7] bg-white px-3 py-1 text-[11px] font-extrabold text-[#6E5460] hover:text-[#D81B6E] cursor-pointer"
            >
              <Smile className="h-3.5 w-3.5 text-[#FF2E7E]" />
              <span>React Surat</span>
            </button>

            {isLetterPickerOpen && (
              <div className="animate-bubble-pop absolute bottom-full left-0 z-30 mb-1.5 flex w-[238px] flex-wrap items-center gap-1 rounded-2xl border border-[#FFD6E7] bg-white/98 p-2 shadow-[0_10px_28px_rgba(255,46,126,0.24)] backdrop-blur-md">
                {MENSIVE_REACT_EMOJIS.map((emoji) => (
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

        {/* 5. Bagian Komen Buat Kita */}
        <div className="mt-4 w-full shrink-0 rounded-2xl border border-[#FFD6E7] bg-[#FFF8FB] p-3.5 text-left">
          <h3 className="font-display flex items-center gap-1.5 text-[15px] font-extrabold text-[#2D0A1E]">
            <span>Komen Buat Kita</span>
            <AppleEmoji emoji="💬" size={17} />
          </h3>

          <form onSubmit={handleSendComment} className="mt-2.5 space-y-2">
            <input
              type="text"
              value={commentName}
              onChange={(e) => {
                setCommentName(e.target.value);
                if (commentError) setCommentError('');
              }}
              placeholder="Nama kamu..."
              maxLength={40}
              className="w-full rounded-xl border border-[#FFD6E7] bg-white px-3 py-2 text-xs font-bold text-[#2D0A1E] placeholder-[#B08A9B] focus:border-[#FF2E7E] focus:outline-none"
            />
            <textarea
              value={commentText}
              onChange={(e) => {
                setCommentText(e.target.value);
                if (commentError) setCommentError('');
              }}
              placeholder="ketik komen sayang..."
              rows={2}
              maxLength={400}
              className="w-full resize-none rounded-xl border border-[#FFD6E7] bg-white px-3 py-2 text-xs font-semibold text-[#2D0A1E] placeholder-[#B08A9B] focus:border-[#FF2E7E] focus:outline-none"
            />
            {commentError && (
              <p className="text-[11px] font-bold text-[#D81B6E]">
                {commentError}
              </p>
            )}
            <button
              type="submit"
              disabled={submittingComment}
              className="keiz-btn-primary btn-bucin flex !min-h-[42px] w-full items-center justify-center gap-1.5 px-4 text-xs font-extrabold cursor-pointer disabled:opacity-60"
            >
              <Send className="h-3.5 w-3.5" />
              <span>{submittingComment ? 'Mengirim...' : 'Kirim Komen'}</span>
            </button>
          </form>

          {/* Daftar Komen */}
          <div className="mt-3 space-y-2.5">
            {comments.length === 0 ? (
              <p className="rounded-xl border border-dashed border-[#FFD6E7] bg-white/80 px-3 py-3 text-center text-[11px] font-semibold text-[#9A7A8A]">
                Belum ada komen nih, tulis pesan manis pertama yuk!
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
                    className="relative rounded-2xl border border-[#FFD6E7] bg-white p-3 shadow-[0_2px_10px_rgba(255,77,141,0.08)]"
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

                    {/* Reactions attached below comment */}
                    {reactionEntries.length > 0 && (
                      <div className="mt-2 flex flex-wrap items-center gap-1.5">
                        {reactionEntries.map(([emoji, count]) => (
                          <button
                            key={emoji}
                            type="button"
                            onClick={() => handleSelectReaction(item.id, emoji)}
                            className="btn-bucin inline-flex items-center gap-1 rounded-full border border-[#FFD6E7] bg-[#FFF2F7] px-2 py-0.5 text-[11px] font-extrabold text-[#2D0A1E] cursor-pointer"
                          >
                            <AppleEmoji emoji={emoji} size={14} />
                            <span>{count}</span>
                          </button>
                        ))}
                      </div>
                    )}

                    {/* Like & React Actions */}
                    <div className="mt-2 flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleLikeComment(item.id)}
                        className="btn-bucin inline-flex items-center gap-1 rounded-full border border-[#FFD6E7] bg-[#FFF2F7] px-2.5 py-1 text-[11px] font-extrabold text-[#D81B6E] cursor-pointer"
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
                          className="btn-bucin inline-flex items-center gap-1 rounded-full border border-[#FFD6E7] bg-[#FFF2F7] px-2.5 py-1 text-[11px] font-extrabold text-[#6E5460] hover:text-[#D81B6E] cursor-pointer"
                        >
                          <Smile className="h-3.5 w-3.5 text-[#FF2E7E]" />
                          <span>React</span>
                        </button>

                        {/* Telegram / iPhone style Emoji Picker Popup */}
                        {isPickerOpen && (
                          <div className="animate-bubble-pop absolute bottom-full left-0 z-30 mb-1.5 flex w-[238px] flex-wrap items-center gap-1 rounded-2xl border border-[#FFD6E7] bg-white/98 p-2 shadow-[0_10px_28px_rgba(255,46,126,0.24)] backdrop-blur-md">
                            {MENSIVE_REACT_EMOJIS.map((emoji) => (
                              <button
                                key={emoji}
                                type="button"
                                onClick={() =>
                                  handleSelectReaction(item.id, emoji)
                                }
                                className="flex h-8 w-8 items-center justify-center rounded-full transition-transform hover:scale-125 hover:bg-[#FFF2F7] active:scale-95 cursor-pointer"
                                aria-label={`React ${emoji}`}
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

        {/* 6. Hanya Tombol Kecil Tutup di Bawah */}
        <div className="mt-4 flex w-full shrink-0 justify-center">
          <button
            type="button"
            onClick={onClose}
            className="btn-bucin rounded-full px-5 py-1.5 text-xs font-bold text-[#8A6A7A] hover:bg-[#FFF2F7] hover:text-[#2D0A1E] cursor-pointer"
          >
            Tutup
          </button>
        </div>
      </div>
    </div>
  );
};
