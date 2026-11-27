import { createClient, type RealtimeChannel, type SupabaseClient } from '@supabase/supabase-js';
import type {
  CallState,
  ChatMessage,
  CoupleProfile,
  GalleryPhoto,
  GameRoomStatus,
  KeizGameState,
  MusicSyncState,
  NobarSyncState,
  PresenceActivity,
  PresenceState,
  Role,
  SongItem,
  UnekItem,
  VoiceEffectMode,
} from './types';

const STORAGE_KEYS = {
  SESSION: 'keiz_session',
  SB_URL: 'keiz_sb_url',
  SB_ANON: 'keiz_sb_anon_key',
};

function safeReadStorage(key: string): string {
  try {
    return localStorage.getItem(key) || '';
  } catch {
    return '';
  }
}

export function getSupabaseConfig(): {
  url: string;
  anonKey: string;
  fromEnv: boolean;
  isManual: boolean;
} {
  // Prioritaskan Manual Env (dari Pengaturan) terlebih dahulu
  const localUrl = safeReadStorage(STORAGE_KEYS.SB_URL).trim();
  const localAnon = safeReadStorage(STORAGE_KEYS.SB_ANON).trim();
  if (localUrl && localAnon) {
    return {
      url: localUrl,
      anonKey: localAnon,
      fromEnv: false,
      isManual: true,
    };
  }

  const envUrl = (import.meta.env.VITE_SUPABASE_URL || '').trim();
  const envAnon = (import.meta.env.VITE_SUPABASE_ANON_KEY || '').trim();
  if (envUrl && envAnon) {
    return {
      url: envUrl,
      anonKey: envAnon,
      fromEnv: true,
      isManual: false,
    };
  }

  return {
    url: '',
    anonKey: '',
    fromEnv: false,
    isManual: false,
  };
}

export function getMaskedSupabaseUrl(): string {
  const { url } = getSupabaseConfig();
  if (!url) return 'Belum diset';
  if (url.length <= 12) return '**********';
  return `${url.slice(0, url.length - 10)}**********`;
}

function isValidSupabaseCreds(url: string, anonKey: string): boolean {
  if (!url || !anonKey) return false;
  if (
    url.includes('YOUR_') ||
    url.includes('xxx.supabase.co') ||
    anonKey === 'xxx' ||
    anonKey.includes('YOUR_')
  ) {
    return false;
  }
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
}

export type SupabaseConnectionStatus = 'checking' | 'connected' | 'error';

export interface SupabaseConnectionResult {
  status: SupabaseConnectionStatus;
  ok: boolean;
  message: string;
  missingTables?: boolean;
  checkedAt?: number;
}

let activeClient: SupabaseClient | null = null;
const reconfigListeners = new Set<() => void>();
const errorListeners = new Set<(msg: string | null) => void>();
const connectionListeners = new Set<(state: SupabaseConnectionResult) => void>();

let currentConnectionState: SupabaseConnectionResult = {
  status: 'checking',
  ok: false,
  message: 'Lagi ngecek koneksi ke Supabase...',
};
let inFlightCheck: Promise<SupabaseConnectionResult> | null = null;

function notifyConnectionListeners(): void {
  const snapshot = { ...currentConnectionState };
  connectionListeners.forEach((fn) => fn(snapshot));
}

export function getConnectionStatus(): SupabaseConnectionResult {
  return { ...currentConnectionState };
}

export function subscribeConnectionStatus(
  cb: (state: SupabaseConnectionResult) => void
): () => void {
  connectionListeners.add(cb);
  cb({ ...currentConnectionState });
  return () => {
    connectionListeners.delete(cb);
  };
}

export function onSupabaseError(cb: (msg: string | null) => void): () => void {
  errorListeners.add(cb);
  return () => {
    errorListeners.delete(cb);
  };
}

let lastErrorAt = 0;
function emitSupabaseError(msg: string | null): void {
  if (msg === null) {
    errorListeners.forEach((fn) => fn(null));
    return;
  }
  const now = Date.now();
  if (now - lastErrorAt < 4000) return;
  lastErrorAt = now;
  errorListeners.forEach((fn) => fn(msg));
}

function initSupabaseClient(): SupabaseClient | null {
  const { url, anonKey } = getSupabaseConfig();
  if (!isValidSupabaseCreds(url, anonKey)) {
    activeClient = null;
    currentConnectionState = {
      status: 'error',
      ok: false,
      message: 'Gagal - URL atau Anon Key Supabase belum diisi.',
      checkedAt: Date.now(),
    };
    notifyConnectionListeners();
    return null;
  }
  activeClient = createClient(url, anonKey, {
    realtime: {
      params: {
        eventsPerSecond: 10,
      },
    },
  });
  currentConnectionState = {
    status: 'checking',
    ok: false,
    message: 'Lagi ngecek koneksi ke Supabase...',
  };
  notifyConnectionListeners();
  return activeClient;
}

initSupabaseClient();

export function getSupabaseClient(): SupabaseClient | null {
  return activeClient;
}

export function isSupabaseConfigured(): boolean {
  const { url, anonKey } = getSupabaseConfig();
  return isValidSupabaseCreds(url, anonKey) && activeClient !== null;
}

export function onSupabaseReconfigured(cb: () => void): () => void {
  reconfigListeners.add(cb);
  return () => {
    reconfigListeners.delete(cb);
  };
}

export function saveSupabaseConfig(url: string, anonKey: string): boolean {
  const cleanUrl = url.trim().replace(/\/+$/, '');
  const cleanKey = anonKey.trim();
  try {
    localStorage.setItem(STORAGE_KEYS.SB_URL, cleanUrl);
    localStorage.setItem(STORAGE_KEYS.SB_ANON, cleanKey);
  } catch {
    // ignore
  }
  inFlightCheck = null;
  resetChatSchemaCache();
  cachedPostinganSchema = null;
  const client = initSupabaseClient();
  reconfigListeners.forEach((fn) => fn());
  return client !== null;
}

export function clearSupabaseConfig(): void {
  try {
    localStorage.removeItem(STORAGE_KEYS.SB_URL);
    localStorage.removeItem(STORAGE_KEYS.SB_ANON);
  } catch {
    // ignore
  }
  inFlightCheck = null;
  resetChatSchemaCache();
  cachedPostinganSchema = null;
  initSupabaseClient();
  reconfigListeners.forEach((fn) => fn());
}

async function runUsersKeizQuery(client: SupabaseClient): Promise<SupabaseConnectionResult> {
  const timeoutPromise = new Promise<{ error: { code?: string; message: string } }>((resolve) => {
    window.setTimeout(() => {
      resolve({ error: { code: 'TIMEOUT', message: 'Koneksi Supabase timeout' } });
    }, 8000);
  });

  try {
    const queryPromise = client.from('users_keiz').select('id').limit(1);
    const result = await Promise.race([queryPromise, timeoutPromise]);
    const error = result?.error;

    if (!error) {
      return {
        status: 'connected',
        ok: true,
        message: 'Terhubung',
        checkedAt: Date.now(),
      };
    }

    const errText = `${error.code || ''} ${error.message || ''}`.toLowerCase();
    if (
      error.code === '42P01' ||
      errText.includes('does not exist') ||
      errText.includes('could not find the table')
    ) {
      return {
        status: 'connected',
        ok: true,
        missingTables: true,
        message: 'Terhubung (jalankan supabase-setup.sql di SQL Editor Supabase)',
        checkedAt: Date.now(),
      };
    }

    if (
      error.code === '401' ||
      error.code === '403' ||
      errText.includes('invalid api key') ||
      errText.includes('jwt')
    ) {
      return {
        status: 'error',
        ok: false,
        message: 'Gagal - Anon Key Supabase ditolak.',
        checkedAt: Date.now(),
      };
    }

    if (error.code === 'TIMEOUT') {
      return {
        status: 'error',
        ok: false,
        message: 'Gagal - Koneksi ke Supabase timeout.',
        checkedAt: Date.now(),
      };
    }

    return {
      status: 'error',
      ok: false,
      message: `Gagal - ${error.message}`,
      checkedAt: Date.now(),
    };
  } catch {
    return {
      status: 'error',
      ok: false,
      message: 'Gagal - Tidak bisa menghubungi server Supabase.',
      checkedAt: Date.now(),
    };
  }
}

export async function checkSupabaseConnection(
  customUrl?: string,
  customAnonKey?: string
): Promise<SupabaseConnectionResult> {
  const isCustomTest = customUrl !== undefined || customAnonKey !== undefined;
  const cfg = getSupabaseConfig();
  const url = (customUrl ?? cfg.url).trim().replace(/\/+$/, '');
  const anonKey = (customAnonKey ?? cfg.anonKey).trim();

  if (!isValidSupabaseCreds(url, anonKey)) {
    const invalidResult: SupabaseConnectionResult = {
      status: 'error',
      ok: false,
      message: 'Gagal - URL atau Anon Key Supabase belum diisi.',
      checkedAt: Date.now(),
    };
    if (!isCustomTest) {
      currentConnectionState = invalidResult;
      notifyConnectionListeners();
    }
    return invalidResult;
  }

  if (!isCustomTest && inFlightCheck) {
    return inFlightCheck;
  }

  const executeCheck = async (): Promise<SupabaseConnectionResult> => {
    if (!isCustomTest) {
      currentConnectionState = {
        ...currentConnectionState,
        status: 'checking',
      };
      notifyConnectionListeners();
    }

    const client =
      !isCustomTest && activeClient ? activeClient : createClient(url, anonKey);
    const res = await runUsersKeizQuery(client);

    if (!isCustomTest || (url === cfg.url && anonKey === cfg.anonKey)) {
      currentConnectionState = res;
      notifyConnectionListeners();
      if (res.ok) {
        emitSupabaseError(null);
      } else {
        emitSupabaseError(res.message);
      }
    }
    return res;
  };

  if (!isCustomTest) {
    inFlightCheck = executeCheck().finally(() => {
      inFlightCheck = null;
    });
    return inFlightCheck;
  }

  return executeCheck();
}

export async function testSupabaseConnection(
  customUrl?: string,
  customAnonKey?: string
): Promise<SupabaseConnectionResult> {
  return checkSupabaseConnection(customUrl, customAnonKey);
}

export async function ensureInitialSyncRows(): Promise<boolean> {
  const sb = activeClient;
  if (!sb) return false;
  try {
    const conn = await checkSupabaseConnection();
    if (!conn.ok) return false;

    const [nobarRes, musicRes] = await Promise.all([
      sb.from('keiz_nobar_sync').select('id').eq('id', 1).maybeSingle(),
      sb.from('keiz_music_sync').select('id').eq('id', 1).maybeSingle(),
    ]);

    if (!nobarRes.error && !nobarRes.data) {
      await sb.from('keiz_nobar_sync').upsert([
        {
          id: 1,
          youtube_url: '',
          videoId: '',
          title: '',
          is_playing: false,
          current_time: 0,
          playback_rate: 1,
          updated_by: 'Faiz',
          action: 'change_video',
        },
      ]);
    }

    if (!musicRes.error && !musicRes.data) {
      await sb.from('keiz_music_sync').upsert([
        {
          id: 1,
          youtube_url: '',
          videoId: '',
          title: '',
          artist: '',
          thumbnail: '',
          duration_ms: 213000,
          is_playing: false,
          current_time: 0,
          updated_by: 'Faiz',
          action: 'change_song',
        },
      ]);
    }

    const gameRes = await sb.from('keiz_game').select('id').eq('id', 1).maybeSingle();
    if (!gameRes.error && !gameRes.data) {
      await sb.from('keiz_game').upsert([
        {
          id: 1,
          room_code: 'keizbucin',
          game_type: '',
          status: 'waiting',
          current_turn: 'faiz',
          board: {},
          score_faiz: 0,
          score_kenat: 0,
          last_move_by: null,
          updated_at: new Date().toISOString(),
        },
      ]);
    }

    return true;
  } catch {
    return false;
  }
}

export const SUPABASE_SQL_SETUP = `-- Copy semua SQL ini -> Supabase -> SQL Editor -> Run
create table if not exists public.users_keiz (
  id text primary key,
  username text unique not null,
  password_hash text not null,
  nama text not null,
  foto_profil text default '',
  foto_latar text default '',
  bio text default '',
  lagu_profil text default '',
  created_at timestamptz default now()
);

create table if not exists public.keiz_chat (
  id uuid primary key default gen_random_uuid(),
  sender text not null,
  receiver text not null,
  message text default '',
  type text default 'text',
  image_url text,
  voice_url text,
  voice_duration text,
  is_read boolean default false,
  created_at timestamptz default now(),
  reply_to uuid,
  reply_to_text text,
  reply_to_sender text,
  is_deleted boolean default false,
  react text
);

create table if not exists public.keiz_typing (
  user_name text primary key,
  is_typing boolean default false,
  updated_at timestamptz default now()
);

create table if not exists public.keiz_nobar_sync (
  id int primary key default 1,
  youtube_url text default '',
  "videoId" text default '',
  title text default '',
  is_playing boolean default false,
  "current_time" double precision default 0,
  playback_rate double precision default 1,
  updated_by text default 'Faiz',
  updated_at timestamptz default now(),
  action text default 'change_video'
);

create table if not exists public.keiz_music_sync (
  id int primary key default 1,
  youtube_url text default '',
  "videoId" text default '',
  title text default '',
  artist text default '',
  thumbnail text default '',
  duration_ms int default 213000,
  is_playing boolean default false,
  "current_time" double precision default 0,
  updated_by text default 'Faiz',
  updated_at timestamptz default now(),
  action text default 'change_song'
);

create table if not exists public.keiz_album (
  id text primary key,
  author text not null,
  caption text default '',
  image_url text not null,
  storage_path text default '',
  created_at timestamptz default now()
);

create table if not exists public.presence_keiz (
  "user" text primary key,
  status text default 'online',
  lagi_ngapain text default 'di Home',
  lagi_play_apa text default '',
  last_seen timestamptz default now()
);

create table if not exists public.call_keiz (
  id uuid primary key default gen_random_uuid(),
  caller text not null,
  callee text not null,
  status text default 'ringing',
  offer text,
  answer text,
  voice_effect text default 'normal',
  created_at timestamptz default now()
);

create table if not exists public.postingan_keiz (
  id text primary key,
  author text not null,
  caption text default '',
  image_url text not null,
  created_at timestamptz default now()
);

create table if not exists public.unek_unek_keiz (
  id text primary key,
  author text not null,
  isi text not null,
  mood text default 'Kangen',
  reply text,
  is_anonymous boolean default false,
  created_at timestamptz default now()
);

create table if not exists public.lagu_keiz (
  id text primary key,
  judul text,
  penyanyi text,
  cover_url text,
  youtube_query text,
  youtube_video_id text,
  durasi_full int default 213000,
  added_by text,
  favorite boolean default false,
  created_at timestamptz default now()
);

create table if not exists public.keiz_game (
  id int primary key default 1,
  room_code text default 'keizbucin',
  game_type text default '',
  status text default 'waiting',
  current_turn text default 'faiz',
  board jsonb default '{}'::jsonb,
  score_faiz int default 0,
  score_kenat int default 0,
  last_move_by text,
  updated_at timestamptz default now()
);

alter table public.users_keiz enable row level security;
alter table public.keiz_chat enable row level security;
alter table public.keiz_nobar_sync enable row level security;
alter table public.keiz_music_sync enable row level security;
alter table public.keiz_album enable row level security;
alter table public.presence_keiz enable row level security;
alter table public.call_keiz enable row level security;
alter table public.postingan_keiz enable row level security;
alter table public.unek_unek_keiz enable row level security;
alter table public.lagu_keiz enable row level security;
alter table public.keiz_typing enable row level security;
alter table public.keiz_game enable row level security;

create policy "allow_all_users_keiz" on public.users_keiz for all using (true) with check (true);
create policy "allow_all_keiz_chat" on public.keiz_chat for all using (true) with check (true);
create policy "allow_all_keiz_typing" on public.keiz_typing for all using (true) with check (true);
create policy "allow_all_keiz_nobar_sync" on public.keiz_nobar_sync for all using (true) with check (true);
create policy "allow_all_keiz_music_sync" on public.keiz_music_sync for all using (true) with check (true);
create policy "allow_all_keiz_album" on public.keiz_album for all using (true) with check (true);
create policy "allow_all_presence_keiz" on public.presence_keiz for all using (true) with check (true);
create policy "allow_all_call_keiz" on public.call_keiz for all using (true) with check (true);
create policy "allow_all_postingan_keiz" on public.postingan_keiz for all using (true) with check (true);
create policy "allow_all_unek_unek_keiz" on public.unek_unek_keiz for all using (true) with check (true);
create policy "allow_all_lagu_keiz" on public.lagu_keiz for all using (true) with check (true);
create policy "allow_all_keiz_game" on public.keiz_game for all using (true) with check (true);

insert into storage.buckets (id, name, public)
values ('keiz-album', 'keiz-album', true)
on conflict (id) do nothing;

create policy "allow_all_keiz_album_bucket" on storage.objects
for all using (bucket_id = 'keiz-album') with check (bucket_id = 'keiz-album');

insert into public.users_keiz (id, username, password_hash, nama, foto_profil, foto_latar, bio, lagu_profil)
values
  ('faiz', 'faiz', 'faizkece18070528', 'Faiz', '/src/assets/images/avatar_faiz_1795263046125.jpg', '', 'pacarnya kenat, paling sayang sama yang gemes', ''),
  ('kenat', 'kenat', 'kenatgemaz07180528', 'Kenat', '/src/assets/images/avatar_kenat_1795263046413.jpg', '', 'pacarnya faiz, cantik sedunia no debat', '')
on conflict (id) do nothing;

insert into public.keiz_nobar_sync (id, youtube_url, "videoId", title, is_playing, "current_time", playback_rate, updated_by, action)
values (1, '', '', '', false, 0, 1, 'Faiz', 'change_video')
on conflict (id) do nothing;

insert into public.keiz_music_sync (id, youtube_url, "videoId", title, artist, thumbnail, duration_ms, is_playing, "current_time", updated_by, action)
values (1, '', '', '', '', '', 213000, false, 0, 'Faiz', 'change_song')
on conflict (id) do nothing;

insert into public.keiz_game (id, room_code, game_type, status, current_turn, board, score_faiz, score_kenat, last_move_by)
values (1, 'keizbucin', '', 'waiting', 'faiz', '{}'::jsonb, 0, 0, null)
on conflict (id) do nothing;

alter publication supabase_realtime add table public.users_keiz, public.keiz_chat, public.keiz_typing, public.keiz_nobar_sync, public.keiz_music_sync, public.keiz_album, public.presence_keiz, public.call_keiz, public.postingan_keiz, public.unek_unek_keiz, public.lagu_keiz, public.keiz_game;`;

const localChannel =
  typeof BroadcastChannel !== 'undefined'
    ? new BroadcastChannel('keiz_bucin_sync')
    : null;

function toRole(val: unknown, fallback: Role = 'faiz'): Role {
  const s = String(val || '').toLowerCase();
  if (s.includes('kenat')) return 'kenat';
  if (s.includes('faiz')) return 'faiz';
  return fallback;
}

function toDbUserName(role: Role): 'Faiz' | 'Kenat' {
  return role === 'kenat' ? 'Kenat' : 'Faiz';
}

function makeUuid(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

const LEGACY_SHARED_BANNER = '/src/assets/images/galeri_sunset_1795263046141.jpg';

function sanitizeUserBanner(val: unknown): string {
  const s = String(val || '').trim();
  if (!s || s === LEGACY_SHARED_BANNER) return '';
  return s;
}

function stripDecorEmojis(text: string): string {
  return text
    .replace(/[\p{Extended_Pictographic}\uFE0F\u200D]/gu, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function normalizeDisplayName(raw: unknown, fallback: Role): string {
  const cleaned = stripDecorEmojis(String(raw || '')).toLowerCase();
  if (!cleaned) return fallback;
  if (cleaned.includes('faiz')) return 'faiz';
  if (cleaned.includes('kenat')) return 'kenat';
  return cleaned;
}

export const DEFAULT_PROFILE: CoupleProfile = {
  faizName: 'faiz',
  kenatName: 'kenat',
  faizPhoto: '/src/assets/images/avatar_faiz_1795263046125.jpg',
  kenatPhoto: '/src/assets/images/avatar_kenat_1795263046413.jpg',
  faizBanner: '',
  kenatBanner: '',
  faizBio: 'pacarnya kenat, paling sayang sama yang gemes',
  kenatBio: 'pacarnya faiz, cantik sedunia no debat',
  anniversaryDate: '2026-08-28',
  faizSong: '',
  kenatSong: '',
};

export function parseYouTubeUrl(
  input: string
): { videoId: string; url: string } | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  let parsed: URL;
  try {
    parsed = new URL(
      trimmed.startsWith('http://') || trimmed.startsWith('https://')
        ? trimmed
        : `https://${trimmed}`
    );
  } catch {
    return null;
  }

  const host = parsed.hostname.toLowerCase();
  const isYtShort = host === 'youtu.be' || host === 'www.youtu.be';
  const isYtMain =
    host === 'youtube.com' ||
    host === 'www.youtube.com' ||
    host === 'm.youtube.com' ||
    host === 'music.youtube.com';

  if (!isYtShort && !isYtMain) return null;

  let videoId = '';
  if (isYtShort) {
    const seg = parsed.pathname.split('/').filter(Boolean)[0] || '';
    if (/^[a-zA-Z0-9_-]{11}$/.test(seg)) videoId = seg;
  } else {
    const vParam = parsed.searchParams.get('v') || '';
    if (/^[a-zA-Z0-9_-]{11}$/.test(vParam)) {
      videoId = vParam;
    } else {
      const pathMatch = parsed.pathname.match(
        /\/(?:shorts|embed|live|v)\/([a-zA-Z0-9_-]{11})/
      );
      if (pathMatch?.[1]) videoId = pathMatch[1];
    }
  }

  if (!videoId) return null;
  return {
    videoId,
    url: `https://www.youtube.com/watch?v=${videoId}`,
  };
}

// ---------- SESSION (localStorage hanya untuk login session) ----------
export function getSavedSession(): Role | null {
  try {
    const val = localStorage.getItem(STORAGE_KEYS.SESSION);
    if (val === 'faiz' || val === 'kenat') return val;
    return null;
  } catch {
    return null;
  }
}

export function setSavedSession(role: Role | null): void {
  try {
    if (role) {
      localStorage.setItem(STORAGE_KEYS.SESSION, role);
    } else {
      localStorage.removeItem(STORAGE_KEYS.SESSION);
    }
  } catch {
    // ignore
  }
}

// ---------- AUTH & PROFIL (tabel: users_keiz) ----------
const EXPECTED_PASSWORDS: Record<Role, string> = {
  faiz: 'faizkece18070528',
  kenat: 'kenatgemaz07180528',
};

export async function verifyUserLogin(role: Role, password: string): Promise<boolean> {
  const sb = activeClient;
  if (sb) {
    try {
      const { data, error } = await sb
        .from('users_keiz')
        .select('id, password_hash')
        .eq('username', role)
        .maybeSingle();

      if (!error && data && data.password_hash) {
        return String(data.password_hash) === password;
      }
      if (error && error.code !== '42P01') {
        void checkSupabaseConnection();
      }
    } catch {
      void checkSupabaseConnection();
    }
  }
  return password === EXPECTED_PASSWORDS[role];
}

export async function fetchProfile(): Promise<CoupleProfile> {
  const sb = activeClient;
  if (!sb) return DEFAULT_PROFILE;

  try {
    const { data, error } = await sb.from('users_keiz').select('*');
    if (error) {
      if (error.code !== '42P01') {
        void checkSupabaseConnection();
      }
      return DEFAULT_PROFILE;
    }

    if (Array.isArray(data) && data.length > 0) {
      const faizRow = data.find(
        (r: Record<string, unknown>) => toRole(r.username ?? r.id) === 'faiz'
      ) as Record<string, unknown> | undefined;
      const kenatRow = data.find(
        (r: Record<string, unknown>) => toRole(r.username ?? r.id) === 'kenat'
      ) as Record<string, unknown> | undefined;

      return {
        faizName: normalizeDisplayName(faizRow?.nama, 'faiz'),
        kenatName: normalizeDisplayName(kenatRow?.nama, 'kenat'),
        faizPhoto: String(faizRow?.foto_profil || DEFAULT_PROFILE.faizPhoto),
        kenatPhoto: String(kenatRow?.foto_profil || DEFAULT_PROFILE.kenatPhoto),
        faizBanner: sanitizeUserBanner(
          faizRow?.foto_latar ?? faizRow?.cover_photo ?? faizRow?.latar_foto
        ),
        kenatBanner: sanitizeUserBanner(
          kenatRow?.foto_latar ?? kenatRow?.cover_photo ?? kenatRow?.latar_foto
        ),
        faizBio: stripDecorEmojis(String(faizRow?.bio || DEFAULT_PROFILE.faizBio)) || DEFAULT_PROFILE.faizBio,
        kenatBio: stripDecorEmojis(String(kenatRow?.bio || DEFAULT_PROFILE.kenatBio)) || DEFAULT_PROFILE.kenatBio,
        anniversaryDate: DEFAULT_PROFILE.anniversaryDate,
        faizSong: String(faizRow?.lagu_profil || ''),
        kenatSong: String(kenatRow?.lagu_profil || ''),
      };
    }
  } catch {
    void checkSupabaseConnection();
  }
  return DEFAULT_PROFILE;
}

export async function saveProfile(
  profile: CoupleProfile,
  targetRole?: Role
): Promise<CoupleProfile> {
  const sb = activeClient;
  if (sb) {
    try {
      const faizPayload = {
        id: 'faiz',
        username: 'faiz',
        password_hash: EXPECTED_PASSWORDS.faiz,
        nama: profile.faizName,
        foto_profil: profile.faizPhoto,
        foto_latar: profile.faizBanner,
        bio: profile.faizBio,
        lagu_profil: profile.faizSong,
      };
      const kenatPayload = {
        id: 'kenat',
        username: 'kenat',
        password_hash: EXPECTED_PASSWORDS.kenat,
        nama: profile.kenatName,
        foto_profil: profile.kenatPhoto,
        foto_latar: profile.kenatBanner,
        bio: profile.kenatBio,
        lagu_profil: profile.kenatSong,
      };
      const rows =
        targetRole === 'faiz'
          ? [faizPayload]
          : targetRole === 'kenat'
          ? [kenatPayload]
          : [faizPayload, kenatPayload];

      const { error } = await sb.from('users_keiz').upsert(rows);
      if (error) {
        emitSupabaseError('Gagal nyimpan profil ke Supabase.');
      }
    } catch {
      emitSupabaseError('Gagal nyimpan profil ke Supabase.');
    }
  }
  localChannel?.postMessage({ type: 'profil_update', payload: profile });
  return profile;
}

// ---------- POSTINGAN / ALBUM POLAROID (tabel: postingan_keiz) ----------
interface PostinganSchema {
  tableName: string;
  columns: Set<string>;
  authorCol: string;
  captionCol: string;
  imageCol: string;
  idIsInt: boolean;
  idIsUuid: boolean;
}

let cachedPostinganSchema: PostinganSchema | null = null;

async function discoverPostinganSchema(sb: SupabaseClient): Promise<PostinganSchema | null> {
  if (cachedPostinganSchema) return cachedPostinganSchema;

  const candidates = ['postingan_keiz'];
  const { url, anonKey } = getSupabaseConfig();
  let specDefs: Record<string, { properties?: Record<string, { type?: string; format?: string }> }> = {};

  if (url && anonKey) {
    try {
      const controller = new AbortController();
      const timer = window.setTimeout(() => controller.abort(), 5000);
      const res = await fetch(`${url.replace(/\/+$/, '')}/rest/v1/`, {
        headers: {
          apikey: anonKey,
          Authorization: `Bearer ${anonKey}`,
          Accept: 'application/openapi+json, application/json',
        },
        signal: controller.signal,
      });
      window.clearTimeout(timer);
      if (res.ok) {
        const spec = (await res.json()) as {
          definitions?: Record<string, { properties?: Record<string, { type?: string; format?: string }> }>;
          components?: { schemas?: Record<string, { properties?: Record<string, { type?: string; format?: string }> }> };
        };
        specDefs = spec?.definitions ?? spec?.components?.schemas ?? {};
      }
    } catch {
      // fallback below
    }
  }

  let tableName = 'postingan_keiz';
  for (const name of candidates) {
    if (specDefs[name]?.properties) {
      tableName = name;
      break;
    }
  }

  const columns = new Set<string>();
  const propMeta = specDefs[tableName]?.properties || {};
  Object.keys(propMeta).forEach((c) => columns.add(c));

  if (columns.size === 0) {
    for (const name of candidates) {
      try {
        const { data, error } = await sb.from(name).select('*').limit(1);
        if (!error) {
          tableName = name;
          if (Array.isArray(data) && data.length > 0) {
            Object.keys(data[0] as Record<string, unknown>).forEach((k) => columns.add(k));
          }
          break;
        }
      } catch {
        // try next
      }
    }
  }

  if (columns.size === 0) return null;

  const pick = (opts: string[], fallback: string) =>
    opts.find((c) => columns.has(c)) ?? fallback;

  const idMeta = propMeta.id || {};
  const idType = String(idMeta.type || '').toLowerCase();
  const idFormat = String(idMeta.format || '').toLowerCase();

  cachedPostinganSchema = {
    tableName,
    columns,
    authorCol: pick(['author', 'author_id', 'user_id', 'sender', 'pengirim'], 'author'),
    captionCol: pick(['caption', 'text', 'isi', 'judul', 'title', 'deskripsi'], 'caption'),
    imageCol: pick(['image_url', 'url', 'foto_url', 'photo_url', 'foto', 'gambar'], 'image_url'),
    idIsInt: idType === 'integer' || idFormat.includes('int') || idFormat.includes('serial'),
    idIsUuid: idFormat.includes('uuid'),
  };
  return cachedPostinganSchema;
}

function mapPostinganRow(row: Record<string, unknown>, idx = 0): GalleryPhoto {
  const author = toRole(
    row.author ?? row.author_id ?? row.user_id ?? row.sender ?? row.pengirim,
    'faiz'
  );
  let dateLabel = 'baru aja';
  if (row.created_at) {
    try {
      dateLabel = new Date(String(row.created_at)).toLocaleDateString('id-ID', {
        day: 'numeric',
        month: 'short',
      });
    } catch {
      dateLabel = 'baru aja';
    }
  }
  return {
    id: String(row.id ?? `post-${idx}`),
    author,
    url: String(
      row.image_url ?? row.url ?? row.foto_url ?? row.photo_url ?? row.foto ?? row.gambar ?? ''
    ),
    caption: String(
      row.caption ?? row.text ?? row.isi ?? row.judul ?? row.title ?? row.deskripsi ?? ''
    ),
    dateLabel,
    tag: 'berdua',
    created_at: row.created_at ? String(row.created_at) : undefined,
  };
}

export async function fetchPostingan(): Promise<GalleryPhoto[]> {
  const sb = activeClient;
  if (!sb) return [];
  try {
    const schema = await discoverPostinganSchema(sb);
    const tableName = schema?.tableName || 'postingan_keiz';

    let { data, error } = await sb
      .from(tableName)
      .select('*')
      .order('created_at', { ascending: false })
      .limit(100);

    if (error && (error.code === '42703' || error.code === 'PGRST204' || String(error.message).includes('created_at'))) {
      const retry = await sb.from(tableName).select('*').limit(100);
      data = retry.data;
      error = retry.error;
    }

    if (error) {
      if (error.code !== '42P01' && error.code !== 'PGRST205') {
        void checkSupabaseConnection();
      }
      return [];
    }
    return Array.isArray(data)
      ? data.map((r, i) => mapPostinganRow(r as Record<string, unknown>, i))
      : [];
  } catch {
    void checkSupabaseConnection();
    return [];
  }
}

export async function addPostingan(payload: {
  author: Role;
  caption: string;
  image_url: string;
}): Promise<GalleryPhoto> {
  const createdAt = new Date().toISOString();
  const newPost: GalleryPhoto = {
    id: makeUuid(),
    author: payload.author,
    url: payload.image_url,
    caption: payload.caption.trim() || 'momen gemes kita berdua',
    dateLabel: 'baru aja',
    tag: 'berdua',
    created_at: createdAt,
  };

  const sb = activeClient;
  if (!sb) {
    return {
      ...newPost,
      failed: true,
      errorDetails: 'Supabase belum terhubung',
    };
  }

  try {
    const schema = await discoverPostinganSchema(sb);
    const tableName = schema?.tableName || 'postingan_keiz';
    const attemptPayload: Record<string, unknown> = {};

    if (schema) {
      if (schema.columns.has(schema.authorCol)) {
        attemptPayload[schema.authorCol] = toDbUserName(payload.author);
      }
      if (schema.columns.has(schema.captionCol)) {
        attemptPayload[schema.captionCol] = newPost.caption;
      }
      if (schema.columns.has(schema.imageCol)) {
        attemptPayload[schema.imageCol] = newPost.url;
      }
      if (schema.columns.has('created_at')) {
        attemptPayload.created_at = createdAt;
      }
    } else {
      attemptPayload.author = toDbUserName(payload.author);
      attemptPayload.caption = newPost.caption;
      attemptPayload.image_url = newPost.url;
      attemptPayload.created_at = createdAt;
    }

    delete attemptPayload.id;

    let insertedRow: Record<string, unknown> | null = null;
    let lastError: { message?: string; details?: string; hint?: string; code?: string } | null = null;

    for (let attempt = 0; attempt < 5; attempt++) {
      delete attemptPayload.id;
      const { data, error } = await sb
        .from(tableName)
        .insert([attemptPayload])
        .select()
        .single();

      if (!error && data) {
        insertedRow = data as Record<string, unknown>;
        lastError = null;
        break;
      }

      lastError = error;
      console.log('[KEIZ Postingan INSERT error]', error);
      const errMsg = String(error?.message || '');
      const missingCol =
        errMsg.match(/Could not find the '([^']+)' column/i) ||
        errMsg.match(/column "([^"]+)" of relation "[^"]+" does not exist/i);

      if (missingCol?.[1] && missingCol[1] in attemptPayload) {
        delete attemptPayload[missingCol[1]];
        cachedPostinganSchema?.columns.delete(missingCol[1]);
        continue;
      }

      break;
    }

    if (lastError || !insertedRow) {
      const msg = lastError?.message || 'Gagal upload foto ke Supabase!';
      emitSupabaseError('Gagal upload foto ke Supabase!');
      return {
        ...newPost,
        failed: true,
        errorDetails: msg,
      };
    }

    const mapped = mapPostinganRow(insertedRow);
    localChannel?.postMessage({ type: 'postingan_update', payload: mapped });
    return mapped;
  } catch (err) {
    console.log('[KEIZ Album INSERT exception]', err);
    emitSupabaseError('Gagal upload foto ke Supabase!');
    return {
      ...newPost,
      failed: true,
      errorDetails: err instanceof Error ? err.message : 'Gagal upload foto',
    };
  }
}

export async function deletePostingan(id: string): Promise<void> {
  const sb = activeClient;
  if (sb) {
    try {
      const schema = await discoverPostinganSchema(sb);
      const tableName = schema?.tableName || 'postingan_keiz';
      await sb.from(tableName).delete().eq('id', id);
    } catch {
      // ignore
    }
  }
  localChannel?.postMessage({ type: 'postingan_update' });
}

// ---------- SHARED SUPABASE STORAGE IMAGE UPLOAD ----------
const PRIMARY_PHOTO_BUCKET = 'keiz-album';
const FALLBACK_PHOTO_BUCKET = 'keiz_photos';

export async function uploadImageToKeizStorage(
  file: Blob,
  fileName: string,
  author: Role,
  folder = ''
): Promise<{ publicUrl: string | null; bucket: string; error?: string }> {
  const sb = activeClient;
  if (!sb) {
    return {
      publicUrl: null,
      bucket: PRIMARY_PHOTO_BUCKET,
      error: 'Supabase belum terhubung. Cek URL & Anon Key Supabase dulu ya.',
    };
  }

  const rawName = (fileName || 'foto.jpg').trim();
  const safeName = rawName.replace(/[^a-zA-Z0-9._-]/g, '_') || 'foto.jpg';
  const cleanFolder = folder.replace(/^\/+|\/+$/g, '');
  const baseName = `${author}_${Date.now()}_${safeName}`;
  const objectPath = cleanFolder ? `${cleanFolder}/${baseName}` : baseName;

  const bucketsToTry = [PRIMARY_PHOTO_BUCKET, FALLBACK_PHOTO_BUCKET];
  let lastErrMsg = 'Gagal upload foto ke Supabase Storage.';

  for (let i = 0; i < bucketsToTry.length; i++) {
    const bucket = bucketsToTry[i];
    try {
      const { data: uploadData, error: uploadErr } = await sb.storage
        .from(bucket)
        .upload(objectPath, file, {
          contentType: file.type || 'image/jpeg',
          upsert: false,
        });

      if (!uploadErr && uploadData?.path) {
        const { data: pub } = sb.storage.from(bucket).getPublicUrl(uploadData.path);
        if (pub?.publicUrl && /^https?:\/\//i.test(pub.publicUrl)) {
          return { publicUrl: pub.publicUrl, bucket };
        }
        return {
          publicUrl: null,
          bucket,
          error: `Upload ke '${bucket}' berhasil, tapi gagal ambil public URL.`,
        };
      }

      const errObj = uploadErr as unknown as {
        message?: string;
        statusCode?: string | number;
        error?: string;
      };
      const rawMsg = String(errObj?.message || 'Upload gagal');
      lastErrMsg = `Gagal upload ke bucket '${bucket}': ${rawMsg}${
        errObj?.statusCode ? ` (status ${errObj.statusCode})` : ''
      }`;

      const isBucketMissing =
        /bucket/i.test(rawMsg) && (/not found/i.test(rawMsg) || /does not exist/i.test(rawMsg));
      if (isBucketMissing && i + 1 < bucketsToTry.length) {
        continue;
      }
      break;
    } catch (err) {
      lastErrMsg = `Gagal upload ke bucket '${bucket}': ${
        err instanceof Error ? err.message : String(err || 'Network error')
      }`;
      break;
    }
  }

  return {
    publicUrl: null,
    bucket: PRIMARY_PHOTO_BUCKET,
    error: lastErrMsg,
  };
}

// ---------- ALBUM POLAROID (tabel: keiz_album + bucket: keiz-album) ----------
const ALBUM_BUCKET = PRIMARY_PHOTO_BUCKET;
const ALBUM_TABLE = 'keiz_album';
const ALBUM_TABLE_FALLBACK = 'keiz_albums';

export async function fetchAlbumPhotos(): Promise<GalleryPhoto[]> {
  const sb = activeClient;
  if (!sb) return [];

  for (const table of [ALBUM_TABLE, ALBUM_TABLE_FALLBACK]) {
    try {
      let { data, error } = await sb
        .from(table)
        .select('*')
        .order('created_at', { ascending: false })
        .limit(120);

      if (
        error &&
        (error.code === '42703' ||
          error.code === 'PGRST204' ||
          String(error.message).includes('created_at'))
      ) {
        const retry = await sb.from(table).select('*').limit(120);
        data = retry.data;
        error = retry.error;
      }

      if (error) {
        if (error.code === '42P01' || error.code === 'PGRST205') {
          continue;
        }
        console.warn('[KEIZ Album fetchAlbumPhotos error]', error);
        void checkSupabaseConnection();
        return [];
      }

      return Array.isArray(data)
        ? data.map((r, i) => {
            const row = r as Record<string, unknown>;
            const mapped = mapPostinganRow(row, i);
            if (!mapped.url && row.public_url) {
              mapped.url = String(row.public_url);
            }
            mapped.caption =
              row.caption !== undefined && row.caption !== null
                ? String(row.caption)
                : mapped.caption;
            return mapped;
          })
        : [];
    } catch (err) {
      console.warn('[KEIZ Album fetchAlbumPhotos exception]', err);
      void checkSupabaseConnection();
      return [];
    }
  }
  return [];
}

export async function addAlbumPhoto(payload: {
  author: Role;
  caption: string;
  file?: Blob | null;
  fileName?: string;
  fallbackDataUrl?: string;
}): Promise<GalleryPhoto> {
  const createdAt = new Date().toISOString();
  const caption = payload.caption.trim();
  const tempPhoto: GalleryPhoto = {
    id: makeUuid(),
    author: payload.author,
    url: '',
    caption,
    dateLabel: 'baru aja',
    tag: 'berdua',
    created_at: createdAt,
  };

  const sb = activeClient;
  if (!sb) {
    return {
      ...tempPhoto,
      failed: true,
      errorDetails: 'Supabase belum terhubung. Cek koneksi internet & Supabase ya.',
    };
  }

  if (!payload.file) {
    return {
      ...tempPhoto,
      failed: true,
      errorDetails: 'Gagal membaca file foto sebelum upload. Coba pilih foto lagi ya.',
    };
  }

  // 1. Upload file ke Storage (hanya public URL https://... yang disimpan ke DB, dilarang base64/blob)
  const uploaded = await uploadImageToKeizStorage(
    payload.file,
    payload.fileName || 'foto.jpg',
    payload.author
  );

  if (!uploaded.publicUrl) {
    const errMsg = uploaded.error || `Gagal upload ke bucket '${ALBUM_BUCKET}'.`;
    emitSupabaseError(errMsg);
    return {
      ...tempPhoto,
      failed: true,
      errorDetails: errMsg,
    };
  }

  const finalImageUrl = uploaded.publicUrl;

  // 2. Simpan { image_url, caption } ke tabel 'keiz_album' (DILARANG kirim id!)
  for (const table of [ALBUM_TABLE, ALBUM_TABLE_FALLBACK]) {
    try {
      const attemptPayload: Record<string, unknown> = {
        image_url: finalImageUrl,
        caption,
      };

      let insertedRow: Record<string, unknown> | null = null;
      let lastError: { message?: string; details?: string; hint?: string; code?: string } | null = null;

      for (let attempt = 0; attempt < 5; attempt++) {
        delete attemptPayload.id;
        const { data, error } = await sb
          .from(table)
          .insert([attemptPayload])
          .select()
          .single();

        if (!error && data) {
          insertedRow = data as Record<string, unknown>;
          lastError = null;
          break;
        }

        lastError = error;
        const errMsg = String(error?.message || '');

        const notNullMatch = errMsg.match(/null value in column "([^"]+)"/i);
        if (notNullMatch?.[1] === 'author' && !('author' in attemptPayload)) {
          attemptPayload.author = toDbUserName(payload.author);
          continue;
        }

        const missingCol =
          errMsg.match(/Could not find the '([^']+)' column/i) ||
          errMsg.match(/column "([^"]+)" of relation "[^"]+" does not exist/i);
        if (missingCol?.[1] && missingCol[1] in attemptPayload) {
          delete attemptPayload[missingCol[1]];
          continue;
        }

        break;
      }

      if (lastError && (lastError.code === '42P01' || lastError.code === 'PGRST205') && table === ALBUM_TABLE) {
        continue;
      }

      if (lastError || !insertedRow) {
        const formattedErr = `Gagal simpan ke ${table}: ${lastError?.message ?? 'Error'}${
          lastError?.code ? ` (${lastError.code})` : ''
        }`;
        emitSupabaseError(formattedErr);
        return {
          ...tempPhoto,
          url: finalImageUrl,
          failed: true,
          errorDetails: formattedErr,
        };
      }

      const mapped = mapPostinganRow(insertedRow);
      if (!mapped.url && insertedRow.public_url) {
        mapped.url = String(insertedRow.public_url);
      }
      mapped.caption =
        insertedRow.caption !== undefined && insertedRow.caption !== null
          ? String(insertedRow.caption)
          : caption;
      localChannel?.postMessage({ type: 'album_update', payload: mapped });
      return mapped;
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err || 'Gagal simpan foto');
      emitSupabaseError(errMsg);
      return {
        ...tempPhoto,
        url: finalImageUrl,
        failed: true,
        errorDetails: errMsg,
      };
    }
  }

  return {
    ...tempPhoto,
    url: finalImageUrl,
    failed: true,
    errorDetails: 'Tabel album belum tersedia di Supabase.',
  };
}

export async function deleteAlbumPhoto(
  id: string,
  imageUrl?: string
): Promise<{ ok: boolean; error?: string }> {
  const sb = activeClient;
  if (!sb) {
    return { ok: false, error: 'Supabase belum terhubung' };
  }
  try {
    let dbErr: { message?: string; code?: string } | null = null;
    for (const table of [ALBUM_TABLE, ALBUM_TABLE_FALLBACK]) {
      const { error } = await sb.from(table).delete().eq('id', id);
      if (!error) {
        dbErr = null;
        break;
      }
      dbErr = error;
      if (error.code !== '42P01' && error.code !== 'PGRST205') {
        break;
      }
    }

    if (dbErr) {
      const msg = `Gagal hapus foto: ${dbErr.message} (${dbErr.code ?? '-'})`;
      emitSupabaseError(msg);
      return { ok: false, error: msg };
    }

    if (imageUrl) {
      for (const bucket of [PRIMARY_PHOTO_BUCKET, FALLBACK_PHOTO_BUCKET]) {
        if (imageUrl.includes(`/${bucket}/`)) {
          const idx = imageUrl.indexOf(`/${bucket}/`);
          const objectPath = decodeURIComponent(
            imageUrl.slice(idx + bucket.length + 2).split('?')[0]
          );
          if (objectPath) {
            await sb.storage.from(bucket).remove([objectPath]);
          }
          break;
        }
      }
    }

    localChannel?.postMessage({ type: 'album_update' });
    return { ok: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Gagal hapus foto album';
    emitSupabaseError(msg);
    return { ok: false, error: msg };
  }
}

// ---------- CHAT BUCIN (tabel: keiz_chat) ----------
const CHAT_TABLE = 'keiz_chat';

interface ChatTableSchema {
  columns: Set<string>;
  senderCol: string;
  receiverCol: string | null;
  messageCol: string;
  idIsInt: boolean;
  idIsUuid: boolean;
  senderFormat: 'lower' | 'title' | 'userId';
  userIdMap: Record<Role, string>;
}

let cachedChatSchema: ChatTableSchema | null = null;
let inFlightSchemaPromise: Promise<ChatTableSchema | null> | null = null;

function resetChatSchemaCache(): void {
  cachedChatSchema = null;
  inFlightSchemaPromise = null;
}

async function discoverChatSchema(sb: SupabaseClient): Promise<ChatTableSchema | null> {
  if (cachedChatSchema) return cachedChatSchema;
  if (inFlightSchemaPromise) return inFlightSchemaPromise;

  inFlightSchemaPromise = (async () => {
    const columns = new Set<string>();
    const propMeta: Record<string, { type?: string; format?: string; default?: unknown }> = {};
    const userIdMap: Record<Role, string> = { faiz: 'faiz', kenat: 'kenat' };
    let sampleSenderVal = '';

    // 1. Cek daftar kolom asli dari OpenAPI PostgREST /rest/v1/ (berhasil meski tabel kosong)
    const { url, anonKey } = getSupabaseConfig();
    if (url && anonKey) {
      try {
        const controller = new AbortController();
        const timer = window.setTimeout(() => controller.abort(), 5000);
        const res = await fetch(`${url.replace(/\/+$/, '')}/rest/v1/`, {
          headers: {
            apikey: anonKey,
            Authorization: `Bearer ${anonKey}`,
            Accept: 'application/openapi+json, application/json',
          },
          signal: controller.signal,
        });
        window.clearTimeout(timer);
        if (res.ok) {
          const spec = (await res.json()) as {
            definitions?: Record<string, { properties?: Record<string, { type?: string; format?: string; default?: unknown }> }>;
            components?: { schemas?: Record<string, { properties?: Record<string, { type?: string; format?: string; default?: unknown }> }> };
          };
          const props =
            spec?.definitions?.[CHAT_TABLE]?.properties ??
            spec?.components?.schemas?.[CHAT_TABLE]?.properties;
          if (props && typeof props === 'object') {
            Object.entries(props).forEach(([col, meta]) => {
              columns.add(col);
              propMeta[col] = meta || {};
            });
          }
        }
      } catch {
        // fallback ke sample query
      }
    }

    // 2. Cek 1 row contoh dari tabel keiz_chat & users_keiz ID
    try {
      const [{ data: sampleRows }, { data: userRows }] = await Promise.all([
        sb.from(CHAT_TABLE).select('*').limit(1),
        sb.from('users_keiz').select('id, username, nama').limit(10),
      ]);

      if (Array.isArray(userRows)) {
        userRows.forEach((u: Record<string, unknown>) => {
          const role = toRole(u.username ?? u.id ?? u.nama);
          if (u.id) userIdMap[role] = String(u.id);
        });
      }

      if (Array.isArray(sampleRows) && sampleRows.length > 0) {
        const row = sampleRows[0] as Record<string, unknown>;
        Object.keys(row).forEach((k) => columns.add(k));
        const rawSender =
          row.sender ??
          row.sender_id ??
          row.user_id ??
          row.sender_name ??
          row.pengirim ??
          row.from_user ??
          row.author;
        if (rawSender) sampleSenderVal = String(rawSender);
      }
    } catch {
      // ignore
    }

    if (columns.size === 0) {
      inFlightSchemaPromise = null;
      return null;
    }

    const pickCol = (candidates: string[]): string | null =>
      candidates.find((c) => columns.has(c)) ?? null;

    const senderCol =
      pickCol([
        'sender',
        'sender_id',
        'user_id',
        'sender_name',
        'pengirim',
        'from_user',
        'author',
      ]) || 'sender';

    const receiverCol = pickCol([
      'receiver',
      'receiver_id',
      'to_user',
      'penerima',
    ]);

    const messageCol =
      pickCol([
        'message',
        'text',
        'isi',
        'content',
        'pesan',
        'body',
      ]) || 'message';

    const idMeta = propMeta.id || {};
    const idType = String(idMeta.type || '').toLowerCase();
    const idFormat = String(idMeta.format || '').toLowerCase();
    const idIsInt = idType === 'integer' || idFormat.includes('int') || idFormat.includes('serial');
    const idIsUuid = idFormat.includes('uuid');

    let senderFormat: ChatTableSchema['senderFormat'] = 'lower';
    if (sampleSenderVal) {
      if (sampleSenderVal === 'Faiz' || sampleSenderVal === 'Kenat') {
        senderFormat = 'title';
      } else if (sampleSenderVal === userIdMap.faiz || sampleSenderVal === userIdMap.kenat) {
        senderFormat = 'userId';
      } else {
        senderFormat = 'lower';
      }
    } else if (senderCol.endsWith('_id')) {
      senderFormat = 'userId';
    } else {
      senderFormat = 'title';
    }

    cachedChatSchema = {
      columns,
      senderCol,
      receiverCol,
      messageCol,
      idIsInt,
      idIsUuid,
      senderFormat,
      userIdMap,
    };
    inFlightSchemaPromise = null;
    return cachedChatSchema;
  })();

  return inFlightSchemaPromise;
}

function formatSenderForDb(role: Role, schema: ChatTableSchema | null): string {
  if (!schema) return role;
  if (schema.senderFormat === 'userId') return schema.userIdMap[role] || role;
  if (schema.senderFormat === 'title') return toDbUserName(role);
  return role;
}

function mapChatRow(row: Record<string, unknown>, idx = 0): ChatMessage {
  const rawSender =
    row.sender ??
    row.sender_id ??
    row.user_id ??
    row.sender_name ??
    row.pengirim ??
    row.from_user ??
    row.author;
  const sender = toRole(rawSender, 'faiz');
  const rawReceiver =
    row.receiver ?? row.receiver_id ?? row.to_user ?? row.penerima;
  const receiver = rawReceiver
    ? toRole(rawReceiver, sender === 'faiz' ? 'kenat' : 'faiz')
    : sender === 'faiz'
    ? 'kenat'
    : 'faiz';
  const rawType = String(row.type ?? '');
  const validTypes = new Set([
    'text',
    'image',
    'voice',
    'sticker',
    'nobar_link',
    'music_link',
    'nobar_chat',
    'wallpaper_chat',
    'wallpaper_nobar',
    'mensive_sync',
    'love_letter_sync',
  ]);
  const inferredType = validTypes.has(rawType)
    ? (rawType as ChatMessage['type'])
    : row.image_url
    ? 'image'
    : row.voice_url || row.is_voice
    ? 'voice'
    : 'text';

  return {
    id: String(row.id ?? `msg-${idx}`),
    sender,
    receiver,
    message: String(
      row.message ??
        row.text ??
        row.isi ??
        row.content ??
        row.pesan ??
        row.body ??
        ''
    ),
    type: inferredType,
    image_url: row.image_url ? String(row.image_url) : undefined,
    voice_url: row.voice_url ? String(row.voice_url) : undefined,
    is_read: Boolean(row.is_read ?? false),
    created_at: String(row.created_at ?? new Date().toISOString()),
    reply_to: row.reply_to ? String(row.reply_to) : undefined,
    reply_to_text: row.reply_to_text ? String(row.reply_to_text) : undefined,
    reply_to_sender: row.reply_to_sender ? toRole(row.reply_to_sender) : undefined,
    is_deleted: Boolean(row.is_deleted ?? false),
    react: row.react ? String(row.react) : undefined,
    voice_duration: row.voice_duration ? String(row.voice_duration) : undefined,
    sending: false,
    failed: false,
  };
}

let lastFetchErrorKey = '';

export async function fetchChats(currentUser?: Role): Promise<ChatMessage[]> {
  const sb = activeClient;
  if (!sb) return [];
  try {
    const schema = await discoverChatSchema(sb);
    const hasTypeCol = !schema || schema.columns.has('type');
    let query = sb.from(CHAT_TABLE).select('*');
    if (hasTypeCol) {
      query = query.or('type.is.null,type.in.(text,image,voice)');
    }
    let { data, error } = await query
      .order('created_at', { ascending: true })
      .limit(200);

    if (
      error &&
      (error.code === '42703' ||
        error.code === 'PGRST204' ||
        String(error.message || '').includes('created_at') ||
        String(error.message || '').includes('type'))
    ) {
      const retry = await sb.from(CHAT_TABLE).select('*').limit(200);
      data = retry.data;
      error = retry.error;
    }

    if (error) {
      const errKey = `${error.code ?? ''}:${error.message ?? ''}`;
      if (errKey !== lastFetchErrorKey) {
        lastFetchErrorKey = errKey;
        console.warn(
          '[KEIZ Chat fetchChats error]',
          error,
          error.message,
          error.details,
          error.hint,
          error.code
        );
      }
      if (error.code !== '42P01' && error.code !== 'PGRST205') {
        void checkSupabaseConnection();
      }
      return [];
    }
    lastFetchErrorKey = '';
    const userLower = currentUser ? currentUser.toLowerCase() : null;
    const partnerLower = userLower
      ? userLower === 'faiz'
        ? 'kenat'
        : 'faiz'
      : null;

    return Array.isArray(data)
      ? data
          .map((row, idx) => mapChatRow(row as Record<string, unknown>, idx))
          .filter((m) => {
            if (m.is_deleted) return false;
            const s = m.sender.toLowerCase();
            const r = m.receiver.toLowerCase();
            const isValidType =
              (m.type === 'text' || m.type === 'image' || m.type === 'voice') &&
              !m.message.startsWith('[Unek-Unek]') &&
              !m.message.startsWith('[KEIZ_SYNC]');
            if (!isValidType) return false;
            if (userLower && partnerLower) {
              return (
                (s === userLower && r === partnerLower) ||
                (s === partnerLower && r === userLower)
              );
            }
            return (
              (s === 'faiz' && r === 'kenat') ||
              (s === 'kenat' && r === 'faiz')
            );
          })
      : [];
  } catch (err) {
    console.warn('[KEIZ Chat fetchChats exception]', err);
    void checkSupabaseConnection();
    return [];
  }
}

export async function sendChatMessage(
  sender: Role,
  message: string,
  extra?: Partial<ChatMessage>
): Promise<ChatMessage> {
  const receiver: Role = sender === 'faiz' ? 'kenat' : 'faiz';
  const msgType: ChatMessage['type'] =
    extra?.type ||
    (extra?.image_url ? 'image' : extra?.voice_url ? 'voice' : 'text');

  const newMsg: ChatMessage = {
    id: makeUuid(),
    sender,
    receiver,
    message: message.trim(),
    type: msgType,
    is_read: false,
    is_deleted: false,
    created_at: new Date().toISOString(),
    ...extra,
  };

  const sb = activeClient;
  if (!sb) {
    const noClientErr =
      'ERROR: Supabase belum terhubung | details: activeClient null | hint: Cek konfigurasi URL & Anon Key Supabase | code: NO_CLIENT';
    console.log('[KEIZ Chat INSERT error]', { message: noClientErr }, JSON.stringify(newMsg));
    return {
      ...newMsg,
      sending: false,
      failed: true,
      errorDetails: noClientErr,
    };
  }

  try {
    const schema = await discoverChatSchema(sb);
    const senderVal = formatSenderForDb(sender, schema);
    const receiverVal = formatSenderForDb(receiver, schema);

    const candidatePayload: Record<string, unknown> = {};
    if (schema) {
      if (schema.columns.has(schema.senderCol)) {
        candidatePayload[schema.senderCol] = senderVal;
      }
      if (schema.receiverCol && schema.columns.has(schema.receiverCol)) {
        candidatePayload[schema.receiverCol] = receiverVal;
      }
      if (schema.columns.has(schema.messageCol)) {
        candidatePayload[schema.messageCol] = newMsg.message;
      }
      if (schema.columns.has('type')) candidatePayload.type = newMsg.type;
      if (schema.columns.has('image_url') && newMsg.image_url !== undefined) {
        candidatePayload.image_url = newMsg.image_url;
      }
      if (schema.columns.has('voice_url') && newMsg.voice_url !== undefined) {
        candidatePayload.voice_url = newMsg.voice_url;
      }
      if (schema.columns.has('voice_duration') && newMsg.voice_duration !== undefined) {
        candidatePayload.voice_duration = newMsg.voice_duration;
      }
      if (schema.columns.has('is_read')) candidatePayload.is_read = false;
      if (schema.columns.has('is_deleted')) candidatePayload.is_deleted = false;
      if (schema.columns.has('created_at')) {
        candidatePayload.created_at = newMsg.created_at;
      }
      if (schema.columns.has('reply_to') && newMsg.reply_to) {
        candidatePayload.reply_to = newMsg.reply_to;
      }
      if (schema.columns.has('reply_to_text') && newMsg.reply_to_text) {
        candidatePayload.reply_to_text = newMsg.reply_to_text;
      }
      if (schema.columns.has('reply_to_sender') && newMsg.reply_to_sender) {
        candidatePayload.reply_to_sender = formatSenderForDb(
          newMsg.reply_to_sender,
          schema
        );
      }
      if (schema.columns.has('react') && newMsg.react !== undefined) {
        candidatePayload.react = newMsg.react;
      }
    } else {
      // Fallback jika OpenAPI schema belum terbaca: kirim kolom lengkap keiz_chat tanpa id
      candidatePayload.sender = senderVal;
      candidatePayload.receiver = receiverVal;
      candidatePayload.message = newMsg.message;
      candidatePayload.type = newMsg.type;
      if (newMsg.image_url !== undefined) candidatePayload.image_url = newMsg.image_url;
      if (newMsg.voice_url !== undefined) candidatePayload.voice_url = newMsg.voice_url;
      if (newMsg.voice_duration !== undefined) {
        candidatePayload.voice_duration = newMsg.voice_duration;
      }
      if (newMsg.reply_to) candidatePayload.reply_to = newMsg.reply_to;
      if (newMsg.reply_to_text) candidatePayload.reply_to_text = newMsg.reply_to_text;
      if (newMsg.reply_to_sender) {
        candidatePayload.reply_to_sender = toDbUserName(newMsg.reply_to_sender);
      }
      if (newMsg.react !== undefined) candidatePayload.react = newMsg.react;
      candidatePayload.is_read = false;
      candidatePayload.is_deleted = false;
      candidatePayload.created_at = newMsg.created_at;
    }

    const attemptPayload = { ...candidatePayload };
    delete attemptPayload.id;
    let insertedRow: Record<string, unknown> | null = null;
    let lastError: {
      message?: string;
      details?: string;
      hint?: string;
      code?: string;
    } | null = null;

    for (let attempt = 0; attempt < 6; attempt++) {
      delete attemptPayload.id;
      console.log('[KEIZ Chat INSERT attempt]', JSON.stringify(attemptPayload));
      const { data, error } = await sb
        .from(CHAT_TABLE)
        .insert([attemptPayload])
        .select()
        .single();

      if (!error && data) {
        insertedRow = data as Record<string, unknown>;
        lastError = null;
        break;
      }

      lastError = error;
      console.log('[KEIZ Chat INSERT error object]', error);
      console.log('[KEIZ Chat INSERT failed payload]', JSON.stringify(attemptPayload));

      const errMsg = String(error?.message || '');
      const missingColMatch =
        errMsg.match(/Could not find the '([^']+)' column/i) ||
        errMsg.match(/column "([^"]+)" of relation "[^"]+" does not exist/i);

      if (missingColMatch?.[1] && missingColMatch[1] in attemptPayload) {
        const badCol = missingColMatch[1];
        delete attemptPayload[badCol];
        cachedChatSchema?.columns.delete(badCol);
        continue;
      }

      break;
    }

    if (lastError || !insertedRow) {
      const formattedErr = `ERROR: ${lastError?.message ?? '-'} | details: ${
        lastError?.details ?? '-'
      } | hint: ${lastError?.hint ?? '-'} | code: ${lastError?.code ?? '-'}`;
      console.log('[KEIZ Chat INSERT final error object]', lastError);
      console.log('[KEIZ Chat INSERT final payload]', JSON.stringify(attemptPayload));
      emitSupabaseError('Gagal kirim chat ke Supabase!');
      return {
        ...newMsg,
        sending: false,
        failed: true,
        errorDetails: formattedErr,
      };
    }

    const mapped = mapChatRow(insertedRow);
    const savedMsg: ChatMessage = {
      ...newMsg,
      ...mapped,
      id:
        insertedRow.id !== undefined && insertedRow.id !== null
          ? String(insertedRow.id)
          : mapped.id,
      type: mapped.type || newMsg.type,
      image_url: mapped.image_url ?? newMsg.image_url,
      voice_url: mapped.voice_url ?? newMsg.voice_url,
      voice_duration: mapped.voice_duration ?? newMsg.voice_duration,
      reply_to: mapped.reply_to ?? newMsg.reply_to,
      reply_to_text: mapped.reply_to_text ?? newMsg.reply_to_text,
      reply_to_sender: mapped.reply_to_sender ?? newMsg.reply_to_sender,
      sending: false,
      failed: false,
    };

    localChannel?.postMessage({ type: 'chat_update', payload: savedMsg });
    return savedMsg;
  } catch (err) {
    console.log('[KEIZ Chat INSERT exception object]', err);
    console.log('[KEIZ Chat INSERT exception payload]', JSON.stringify(newMsg));
    const errObj = err as {
      message?: string;
      details?: string;
      hint?: string;
      code?: string;
    };
    const msg = err instanceof Error ? err.message : String(errObj?.message ?? err);
    const formattedErr = `ERROR: ${msg} | details: ${errObj?.details ?? '-'} | hint: ${
      errObj?.hint ?? '-'
    } | code: ${errObj?.code ?? 'EXCEPTION'}`;
    emitSupabaseError('Gagal kirim chat ke Supabase!');
    return {
      ...newMsg,
      sending: false,
      failed: true,
      errorDetails: formattedErr,
    };
  }
}

export async function markChatsAsRead(viewer: Role): Promise<void> {
  const sb = activeClient;
  if (!sb) return;
  try {
    const schema = await discoverChatSchema(sb);
    if (schema && (!schema.columns.has('is_read') || !schema.receiverCol)) {
      return;
    }
    const receiverCol = schema?.receiverCol || 'receiver';
    const receiverDb = toDbUserName(viewer);
    await sb
      .from(CHAT_TABLE)
      .update({ is_read: true })
      .or(`${receiverCol}.eq.${receiverDb},${receiverCol}.eq.${viewer}`)
      .eq('is_read', false);
  } catch {
    // ignore
  }
}

export async function updateChatReact(id: string, react?: string): Promise<ChatMessage[]> {
  const sb = activeClient;
  if (sb) {
    try {
      const { error } = await sb
        .from(CHAT_TABLE)
        .update({ react: react ?? null })
        .eq('id', id);
      if (error) {
        console.log(
          '[KEIZ Chat react error]',
          error,
          error.message,
          error.details,
          error.hint,
          error.code
        );
      }
    } catch (err) {
      console.log('[KEIZ Chat react exception]', err);
    }
  }
  localChannel?.postMessage({ type: 'chat_update' });
  return fetchChats();
}

export async function deleteChatMessage(id: string): Promise<ChatMessage[]> {
  const sb = activeClient;
  if (sb) {
    try {
      const { error: delErr } = await sb.from(CHAT_TABLE).delete().eq('id', id);
      if (delErr) {
        console.log(
          '[KEIZ Chat delete error]',
          delErr,
          delErr.message,
          delErr.details,
          delErr.hint,
          delErr.code
        );
        const schema = await discoverChatSchema(sb);
        if (!schema || schema.columns.has('is_deleted')) {
          await sb.from(CHAT_TABLE).update({ is_deleted: true }).eq('id', id);
        }
      }
    } catch (err) {
      console.log('[KEIZ Chat delete exception]', err);
    }
  }
  localChannel?.postMessage({ type: 'chat_update' });
  return fetchChats();
}

export function subscribeChatRealtime(
  onInsert: (msg: ChatMessage) => void,
  onUpdate: (msg: ChatMessage) => void,
  onRefresh: () => void
): () => void {
  const handleLocal = (ev: MessageEvent) => {
    if (ev.data?.type === 'chat_update') onRefresh();
  };
  localChannel?.addEventListener('message', handleLocal);

  let chatChan: RealtimeChannel | null = null;
  const setup = () => {
    const sb = activeClient;
    if (chatChan && sb) {
      sb.removeChannel(chatChan);
      chatChan = null;
    }
    if (!sb) return;
    chatChan = sb
      .channel('keiz_chat')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: CHAT_TABLE },
        (payload) => {
          onInsert(mapChatRow(payload.new as Record<string, unknown>));
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: CHAT_TABLE },
        (payload) => {
          onUpdate(mapChatRow(payload.new as Record<string, unknown>));
        }
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: CHAT_TABLE },
        () => {
          onRefresh();
        }
      )
      .subscribe();
  };
  setup();
  const unsubReconfig = onSupabaseReconfigured(setup);

  return () => {
    unsubReconfig();
    localChannel?.removeEventListener('message', handleLocal);
    if (chatChan && activeClient) {
      activeClient.removeChannel(chatChan);
    }
  };
}

// ---------- CHAT NOBAR BERDUA (terpisah dari Chat Biasa, pakai type = 'nobar_chat') ----------
let activeNobarChatBroadcastChan: RealtimeChannel | null = null;
let activeNobarChatBroadcastReady = false;

export async function fetchNobarChats(currentUser?: Role): Promise<ChatMessage[]> {
  const sb = activeClient;
  if (!sb) return [];
  try {
    const schema = await discoverChatSchema(sb);
    const hasTypeCol = !schema || schema.columns.has('type');

    let query = sb.from(CHAT_TABLE).select('*');
    if (hasTypeCol) {
      query = query.eq('type', 'nobar_chat');
    }

    let { data, error } = await query
      .order('created_at', { ascending: true })
      .limit(200);

    if (
      error &&
      (error.code === '42703' ||
        error.code === 'PGRST204' ||
        String(error.message || '').includes('created_at'))
    ) {
      const retryQ = hasTypeCol
        ? sb.from(CHAT_TABLE).select('*').eq('type', 'nobar_chat').limit(200)
        : sb.from(CHAT_TABLE).select('*').limit(200);
      const retry = await retryQ;
      data = retry.data;
      error = retry.error;
    }

    if (error) {
      return [];
    }

    const userLower = currentUser ? currentUser.toLowerCase() : null;
    const partnerLower = userLower
      ? userLower === 'faiz'
        ? 'kenat'
        : 'faiz'
      : null;

    return Array.isArray(data)
      ? data
          .map((row, idx) => mapChatRow(row as Record<string, unknown>, idx))
          .filter((m) => {
            if (m.type !== 'nobar_chat' || m.is_deleted) return false;
            const s = m.sender.toLowerCase();
            const r = m.receiver.toLowerCase();
            if (userLower && partnerLower) {
              return (
                (s === userLower && r === partnerLower) ||
                (s === partnerLower && r === userLower)
              );
            }
            return (
              (s === 'faiz' && r === 'kenat') ||
              (s === 'kenat' && r === 'faiz')
            );
          })
      : [];
  } catch {
    return [];
  }
}

export async function sendNobarChatMessage(
  sender: Role,
  message: string,
  extra?: Partial<ChatMessage>
): Promise<ChatMessage> {
  const saved = await sendChatMessage(sender, message, {
    ...extra,
    type: 'nobar_chat',
  });

  if (!saved.failed) {
    localChannel?.postMessage({ type: 'nobar_chat_update', payload: saved });
    if (activeNobarChatBroadcastChan && activeNobarChatBroadcastReady) {
      activeNobarChatBroadcastChan
        .send({
          type: 'broadcast',
          event: 'nobar_chat_msg',
          payload: { action: 'insert', msg: saved },
        })
        .catch(() => {});
    }
  }

  return saved;
}

export async function updateNobarChatReact(
  id: string,
  react?: string
): Promise<ChatMessage[]> {
  const sb = activeClient;
  if (sb) {
    try {
      await sb
        .from(CHAT_TABLE)
        .update({ react: react ?? null })
        .eq('id', id);
    } catch {
      // ignore
    }
  }
  localChannel?.postMessage({ type: 'nobar_chat_update' });
  if (activeNobarChatBroadcastChan && activeNobarChatBroadcastReady) {
    activeNobarChatBroadcastChan
      .send({
        type: 'broadcast',
        event: 'nobar_chat_msg',
        payload: { action: 'refresh' },
      })
      .catch(() => {});
  }
  return fetchNobarChats();
}

export async function deleteNobarChatMessage(id: string): Promise<ChatMessage[]> {
  const sb = activeClient;
  if (sb) {
    try {
      const { error: delErr } = await sb.from(CHAT_TABLE).delete().eq('id', id);
      if (delErr) {
        const schema = await discoverChatSchema(sb);
        if (!schema || schema.columns.has('is_deleted')) {
          await sb.from(CHAT_TABLE).update({ is_deleted: true }).eq('id', id);
        }
      }
    } catch {
      // ignore
    }
  }
  localChannel?.postMessage({ type: 'nobar_chat_update' });
  if (activeNobarChatBroadcastChan && activeNobarChatBroadcastReady) {
    activeNobarChatBroadcastChan
      .send({
        type: 'broadcast',
        event: 'nobar_chat_msg',
        payload: { action: 'refresh' },
      })
      .catch(() => {});
  }
  return fetchNobarChats();
}

export function subscribeNobarChatRealtime(
  onInsert: (msg: ChatMessage) => void,
  onUpdate: (msg: ChatMessage) => void,
  onRefresh: () => void
): () => void {
  const handleLocal = (ev: MessageEvent) => {
    if (ev.data?.type === 'nobar_chat_update') {
      if (ev.data.payload) {
        onInsert(ev.data.payload as ChatMessage);
      } else {
        onRefresh();
      }
    }
  };
  localChannel?.addEventListener('message', handleLocal);

  let nobarChatChan: RealtimeChannel | null = null;
  const setup = () => {
    const sb = activeClient;
    activeNobarChatBroadcastReady = false;
    if (nobarChatChan && sb) {
      sb.removeChannel(nobarChatChan);
      nobarChatChan = null;
      activeNobarChatBroadcastChan = null;
    }
    if (!sb) return;
    nobarChatChan = sb
      .channel('keiz_nobar_chat_rt', {
        config: { broadcast: { self: false } },
      })
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: CHAT_TABLE },
        (payload) => {
          const mapped = mapChatRow(payload.new as Record<string, unknown>);
          if (mapped.type === 'nobar_chat') onInsert(mapped);
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: CHAT_TABLE },
        (payload) => {
          const mapped = mapChatRow(payload.new as Record<string, unknown>);
          if (mapped.type === 'nobar_chat') onUpdate(mapped);
        }
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: CHAT_TABLE },
        () => {
          onRefresh();
        }
      )
      .on('broadcast', { event: 'nobar_chat_msg' }, ({ payload }) => {
        const p = payload as { action?: string; msg?: ChatMessage } | undefined;
        if (p?.action === 'insert' && p.msg) {
          onInsert(p.msg);
        } else {
          onRefresh();
        }
      })
      .subscribe((status) => {
        activeNobarChatBroadcastReady = status === 'SUBSCRIBED';
      });
    activeNobarChatBroadcastChan = nobarChatChan;
  };
  setup();
  const unsubReconfig = onSupabaseReconfigured(setup);

  return () => {
    unsubReconfig();
    localChannel?.removeEventListener('message', handleLocal);
    activeNobarChatBroadcastReady = false;
    if (nobarChatChan && activeClient) {
      activeClient.removeChannel(nobarChatChan);
      if (activeNobarChatBroadcastChan === nobarChatChan) {
        activeNobarChatBroadcastChan = null;
      }
    }
  };
}

// ---------- SHARED WALLPAPER SYNC (Chat Biasa & Chat Nobar, tersinkron real-time berdua) ----------
export type WallpaperRoomKind = 'chat' | 'nobar';

export interface SyncedWallpaperPayload {
  mode: 'preset' | 'custom';
  presetId: string;
  customUrl?: string;
}

function wallpaperDbType(room: WallpaperRoomKind): 'wallpaper_chat' | 'wallpaper_nobar' {
  return room === 'nobar' ? 'wallpaper_nobar' : 'wallpaper_chat';
}

function parseWallpaperRow(row: Record<string, unknown> | null | undefined): SyncedWallpaperPayload | null {
  if (!row) return null;
  const rawMsg = String(row.message ?? row.text ?? '').trim();
  const imgUrl = row.image_url ? String(row.image_url).trim() : '';
  if (rawMsg) {
    try {
      const parsed = JSON.parse(rawMsg) as Partial<SyncedWallpaperPayload>;
      if (parsed.mode === 'custom' && (parsed.customUrl || imgUrl)) {
        return {
          mode: 'custom',
          presetId: parsed.presetId || 'awan-pelangi',
          customUrl: parsed.customUrl || imgUrl,
        };
      }
      if (parsed.presetId) {
        return {
          mode: 'preset',
          presetId: parsed.presetId,
          customUrl: parsed.customUrl || (imgUrl || undefined),
        };
      }
    } catch {
      // ignore non-json
    }
  }
  if (imgUrl) {
    return {
      mode: 'custom',
      presetId: 'awan-pelangi',
      customUrl: imgUrl,
    };
  }
  return null;
}

const activeWallpaperChans: Partial<Record<WallpaperRoomKind, RealtimeChannel>> = {};
const activeWallpaperChanReady: Partial<Record<WallpaperRoomKind, boolean>> = {};

export async function fetchRoomWallpaper(
  room: WallpaperRoomKind
): Promise<SyncedWallpaperPayload | null> {
  const sb = activeClient;
  if (!sb) return null;
  const dbType = wallpaperDbType(room);
  try {
    let { data, error } = await sb
      .from(CHAT_TABLE)
      .select('*')
      .eq('type', dbType)
      .order('created_at', { ascending: false })
      .limit(1);

    if (
      error &&
      (error.code === '42703' ||
        error.code === 'PGRST204' ||
        String(error.message || '').includes('created_at'))
    ) {
      const retry = await sb
        .from(CHAT_TABLE)
        .select('*')
        .eq('type', dbType)
        .limit(5);
      data = retry.data;
      error = retry.error;
    }

    if (error || !Array.isArray(data) || data.length === 0) return null;
    return parseWallpaperRow(data[data.length > 1 ? data.length - 1 : 0] as Record<string, unknown>);
  } catch {
    return null;
  }
}

export async function saveRoomWallpaper(
  room: WallpaperRoomKind,
  updatedBy: Role,
  cfg: SyncedWallpaperPayload
): Promise<void> {
  localChannel?.postMessage({
    type: 'wallpaper_sync_update',
    room,
    payload: cfg,
  });

  const chan = activeWallpaperChans[room];
  if (chan && activeWallpaperChanReady[room]) {
    chan
      .send({
        type: 'broadcast',
        event: 'wallpaper_change',
        payload: { room, cfg },
      })
      .catch(() => {});
  }

  const sb = activeClient;
  if (!sb) return;

  const dbType = wallpaperDbType(room);
  const serialized = JSON.stringify({
    mode: cfg.mode,
    presetId: cfg.presetId,
    ...(cfg.customUrl ? { customUrl: cfg.customUrl } : {}),
  });

  try {
    const { data: existing } = await sb
      .from(CHAT_TABLE)
      .select('id')
      .eq('type', dbType)
      .order('created_at', { ascending: false })
      .limit(1);

    const existingId = Array.isArray(existing) && existing[0]?.id ? String(existing[0].id) : null;
    if (existingId) {
      const schema = await discoverChatSchema(sb);
      const senderVal = formatSenderForDb(updatedBy, schema);
      const { error: updErr } = await sb
        .from(CHAT_TABLE)
        .update({
          sender: senderVal,
          message: serialized,
          image_url: cfg.customUrl ?? null,
          created_at: new Date().toISOString(),
        })
        .eq('id', existingId);
      if (!updErr) return;
    }

    await sendChatMessage(updatedBy, serialized, {
      type: dbType,
      image_url: cfg.customUrl,
    });
  } catch {
    // ignore
  }
}

export function subscribeRoomWallpaper(
  room: WallpaperRoomKind,
  onWallpaper: (cfg: SyncedWallpaperPayload) => void
): () => void {
  const dbType = wallpaperDbType(room);
  let lastJson = '';

  const emitIfChanged = (cfg: SyncedWallpaperPayload | null) => {
    if (!cfg) return;
    const key = JSON.stringify({
      mode: cfg.mode,
      presetId: cfg.presetId,
      customUrl: cfg.customUrl || '',
    });
    if (key === lastJson) return;
    lastJson = key;
    onWallpaper(cfg);
  };

  const handleLocal = (ev: MessageEvent) => {
    if (
      ev.data?.type === 'wallpaper_sync_update' &&
      ev.data.room === room &&
      ev.data.payload
    ) {
      emitIfChanged(ev.data.payload as SyncedWallpaperPayload);
    }
  };
  localChannel?.addEventListener('message', handleLocal);

  let chan: RealtimeChannel | null = null;
  const setup = () => {
    const sb = activeClient;
    activeWallpaperChanReady[room] = false;
    if (chan && sb) {
      sb.removeChannel(chan);
      chan = null;
      delete activeWallpaperChans[room];
    }
    if (!sb) return;
    chan = sb
      .channel(`keiz_wallpaper_rt_${room}`, {
        config: { broadcast: { self: false } },
      })
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: CHAT_TABLE },
        (payload) => {
          const row = payload.new as Record<string, unknown> | undefined;
          if (!row || String(row.type ?? '') !== dbType) return;
          emitIfChanged(parseWallpaperRow(row));
        }
      )
      .on('broadcast', { event: 'wallpaper_change' }, ({ payload }) => {
        const p = payload as
          | { room?: WallpaperRoomKind; cfg?: SyncedWallpaperPayload }
          | undefined;
        if (p?.room === room && p.cfg) {
          emitIfChanged(p.cfg);
        }
      })
      .subscribe((status) => {
        activeWallpaperChanReady[room] = status === 'SUBSCRIBED';
      });
    activeWallpaperChans[room] = chan;
  };

  setup();
  const unsubReconfig = onSupabaseReconfigured(setup);

  void fetchRoomWallpaper(room).then(emitIfChanged);
  const pollTimer = window.setInterval(() => {
    void fetchRoomWallpaper(room).then(emitIfChanged);
  }, 3000);

  return () => {
    window.clearInterval(pollTimer);
    unsubReconfig();
    localChannel?.removeEventListener('message', handleLocal);
    activeWallpaperChanReady[room] = false;
    if (chan && activeClient) {
      activeClient.removeChannel(chan);
      if (activeWallpaperChans[room] === chan) {
        delete activeWallpaperChans[room];
      }
    }
  };
}

export function subscribeIncomingChatNotification(
  currentUser: Role,
  onIncoming: (msg: ChatMessage) => void
): () => void {
  const userLower = currentUser.toLowerCase();
  const partnerLower = userLower === 'faiz' ? 'kenat' : 'faiz';
  const notifiedIds = new Set<string>();

  const maybeNotify = (msg: ChatMessage) => {
    if (!msg.id || notifiedIds.has(msg.id)) return;
    const s = msg.sender.toLowerCase();
    const r = msg.receiver.toLowerCase();
    if (s !== partnerLower || r !== userLower) return;
    if (
      (msg.type !== 'text' && msg.type !== 'image' && msg.type !== 'voice') ||
      msg.message.startsWith('[Unek-Unek]') ||
      msg.message.startsWith('[KEIZ_SYNC]') ||
      msg.is_deleted
    ) {
      return;
    }
    notifiedIds.add(msg.id);
    if (notifiedIds.size > 200) {
      const first = notifiedIds.values().next().value;
      if (first) notifiedIds.delete(first);
    }
    onIncoming(msg);
  };

  const handleLocal = (ev: MessageEvent) => {
    if (ev.data?.type === 'chat_update' && ev.data.payload) {
      maybeNotify(ev.data.payload as ChatMessage);
    }
  };
  localChannel?.addEventListener('message', handleLocal);

  let notifChan: RealtimeChannel | null = null;
  const setup = () => {
    const sb = activeClient;
    if (notifChan && sb) {
      sb.removeChannel(notifChan);
      notifChan = null;
    }
    if (!sb) return;
    notifChan = sb
      .channel('keiz_chat_notif')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: CHAT_TABLE },
        (payload) => {
          maybeNotify(mapChatRow(payload.new as Record<string, unknown>));
        }
      )
      .subscribe();
  };

  setup();
  const unsubReconfig = onSupabaseReconfigured(setup);

  return () => {
    unsubReconfig();
    localChannel?.removeEventListener('message', handleLocal);
    if (notifChan && activeClient) {
      activeClient.removeChannel(notifChan);
    }
  };
}

// ---------- MENSIVE & LOVE LETTER CROSS-DEVICE SYNC (via keiz_chat + Realtime) ----------
const KEIZ_SYNC_PREFIX = '[KEIZ_SYNC]';

export type KeizSyncScope = 'mensive' | 'love_letter';

export type KeizSyncEventPayload =
  | {
      v: 1;
      scope: 'mensive';
      kind: 'comment';
      monthsCount: number;
      commentId: string;
      name: string;
      text: string;
      createdAt: string;
    }
  | {
      v: 1;
      scope: 'mensive';
      kind: 'like';
      monthsCount: number;
      commentId: string;
      actionId: string;
      actor: string;
      createdAt: string;
    }
  | {
      v: 1;
      scope: 'mensive';
      kind: 'comment_react';
      monthsCount: number;
      commentId: string;
      emoji: string;
      actionId: string;
      actor: string;
      createdAt: string;
    }
  | {
      v: 1;
      scope: 'mensive';
      kind: 'letter_react';
      monthsCount: number;
      emoji: string;
      actionId: string;
      actor: string;
      createdAt: string;
    }
  | {
      v: 1;
      scope: 'love_letter';
      kind: 'comment';
      letterId: string;
      commentId: string;
      name: string;
      text: string;
      createdAt: string;
    }
  | {
      v: 1;
      scope: 'love_letter';
      kind: 'like';
      letterId: string;
      commentId: string;
      actionId: string;
      actor: string;
      createdAt: string;
    }
  | {
      v: 1;
      scope: 'love_letter';
      kind: 'comment_react';
      letterId: string;
      commentId: string;
      emoji: string;
      actionId: string;
      actor: string;
      createdAt: string;
    }
  | {
      v: 1;
      scope: 'love_letter';
      kind: 'letter_react';
      letterId: string;
      emoji: string;
      actionId: string;
      actor: string;
      createdAt: string;
    };

const activeKeizSyncChannels: Partial<Record<KeizSyncScope, RealtimeChannel>> = {};
const activeKeizSyncChannelReady: Partial<Record<KeizSyncScope, boolean>> = {};

function parseKeizSyncRow(
  row: Record<string, unknown> | null | undefined,
  expectedScope?: KeizSyncScope
): KeizSyncEventPayload | null {
  if (!row || row.is_deleted) return null;
  const rawMsg = String(
    row.message ?? row.text ?? row.isi ?? row.content ?? row.pesan ?? row.body ?? ''
  ).trim();
  if (!rawMsg.startsWith(KEIZ_SYNC_PREFIX)) return null;
  try {
    const parsed = JSON.parse(
      rawMsg.slice(KEIZ_SYNC_PREFIX.length)
    ) as KeizSyncEventPayload;
    if (!parsed || typeof parsed !== 'object') return null;
    if (expectedScope && parsed.scope !== expectedScope) return null;
    if (parsed.scope !== 'mensive' && parsed.scope !== 'love_letter') return null;
    if (!parsed.createdAt && typeof row.created_at === 'string') {
      parsed.createdAt = row.created_at;
    }
    return parsed;
  } catch {
    return null;
  }
}

export async function fetchKeizSyncEvents<T extends KeizSyncEventPayload>(
  scope: KeizSyncScope
): Promise<T[]> {
  const sb = activeClient;
  if (!sb) return [];
  const dbType = scope === 'mensive' ? 'mensive_sync' : 'love_letter_sync';

  try {
    const schema = await discoverChatSchema(sb);
    const hasTypeCol = !schema || schema.columns.has('type');
    const msgCol = schema?.messageCol || 'message';

    let query = sb.from(CHAT_TABLE).select('*');
    if (hasTypeCol) {
      query = query.or(`type.eq.${dbType},${msgCol}.ilike.${KEIZ_SYNC_PREFIX}%`);
    } else {
      query = query.ilike(msgCol, `${KEIZ_SYNC_PREFIX}%`);
    }

    let { data, error } = await query
      .order('created_at', { ascending: true })
      .limit(1000);

    if (error) {
      const retry1 = await sb
        .from(CHAT_TABLE)
        .select('*')
        .ilike(msgCol, `${KEIZ_SYNC_PREFIX}%`)
        .limit(1000);
      if (!retry1.error && Array.isArray(retry1.data)) {
        data = retry1.data;
        error = null;
      } else {
        const retry2 = await sb.from(CHAT_TABLE).select('*').limit(1000);
        data = retry2.data;
        error = retry2.error;
      }
    }

    if (error || !Array.isArray(data)) return [];

    const events: T[] = [];
    for (const item of data) {
      const parsed = parseKeizSyncRow(item as Record<string, unknown>, scope);
      if (parsed) events.push(parsed as T);
    }

    events.sort(
      (a, b) =>
        new Date(a.createdAt || 0).getTime() -
        new Date(b.createdAt || 0).getTime()
    );
    return events;
  } catch {
    return [];
  }
}

export async function publishKeizSyncEvent(
  sender: Role,
  payload: KeizSyncEventPayload
): Promise<boolean> {
  localChannel?.postMessage({ type: 'keiz_sync_event', payload });

  const bChan = activeKeizSyncChannels[payload.scope];
  if (bChan && activeKeizSyncChannelReady[payload.scope]) {
    bChan
      .send({
        type: 'broadcast',
        event: 'keiz_sync_event',
        payload,
      })
      .catch(() => {});
  }

  const sb = activeClient;
  if (!sb) return false;

  const receiver: Role = sender === 'faiz' ? 'kenat' : 'faiz';
  const dbType =
    payload.scope === 'mensive' ? 'mensive_sync' : 'love_letter_sync';
  const serialized = `${KEIZ_SYNC_PREFIX}${JSON.stringify(payload)}`;

  try {
    const schema = await discoverChatSchema(sb);
    const senderVal = formatSenderForDb(sender, schema);
    const receiverVal = formatSenderForDb(receiver, schema);

    const attemptPayload: Record<string, unknown> = {};
    if (schema) {
      if (schema.columns.has(schema.senderCol)) {
        attemptPayload[schema.senderCol] = senderVal;
      }
      if (schema.receiverCol && schema.columns.has(schema.receiverCol)) {
        attemptPayload[schema.receiverCol] = receiverVal;
      }
      if (schema.columns.has(schema.messageCol)) {
        attemptPayload[schema.messageCol] = serialized;
      }
      if (schema.columns.has('type')) attemptPayload.type = dbType;
      if (schema.columns.has('is_read')) attemptPayload.is_read = true;
      if (schema.columns.has('is_deleted')) attemptPayload.is_deleted = false;
      if (schema.columns.has('created_at')) {
        attemptPayload.created_at = payload.createdAt;
      }
    } else {
      attemptPayload.sender = senderVal;
      attemptPayload.receiver = receiverVal;
      attemptPayload.message = serialized;
      attemptPayload.type = dbType;
      attemptPayload.is_read = true;
      attemptPayload.is_deleted = false;
      attemptPayload.created_at = payload.createdAt;
    }

    let useGeneratedId = false;
    let triedTextTypeFallback = false;
    let triedDeleteTypeFallback = false;

    for (let attempt = 0; attempt < 8; attempt++) {
      if (useGeneratedId) {
        attemptPayload.id = makeUuid();
      } else {
        delete attemptPayload.id;
      }

      const { error } = await sb.from(CHAT_TABLE).insert([attemptPayload]);
      if (!error) {
        return true;
      }

      const errMsg = String(error.message || '');
      const errCode = String(error.code || '');

      const missingColMatch =
        errMsg.match(/Could not find the '([^']+)' column/i) ||
        errMsg.match(/column "([^"]+)" of relation "[^"]+" does not exist/i);
      if (missingColMatch?.[1] && missingColMatch[1] in attemptPayload) {
        const badCol = missingColMatch[1];
        delete attemptPayload[badCol];
        cachedChatSchema?.columns.delete(badCol);
        continue;
      }

      if (
        !useGeneratedId &&
        (errMsg.includes('"id"') || errCode === '23502')
      ) {
        useGeneratedId = true;
        continue;
      }

      if (!triedTextTypeFallback && 'type' in attemptPayload) {
        triedTextTypeFallback = true;
        attemptPayload.type = 'text';
        continue;
      }

      if (!triedDeleteTypeFallback && 'type' in attemptPayload) {
        triedDeleteTypeFallback = true;
        delete attemptPayload.type;
        continue;
      }

      break;
    }
    return false;
  } catch {
    return false;
  }
}

export function subscribeKeizSyncEvents(
  scope: KeizSyncScope,
  onEvent: (ev?: KeizSyncEventPayload) => void
): () => void {
  const handleLocal = (ev: MessageEvent) => {
    if (
      ev.data?.type === 'keiz_sync_event' &&
      ev.data?.payload?.scope === scope
    ) {
      onEvent(ev.data.payload as KeizSyncEventPayload);
    }
  };
  localChannel?.addEventListener('message', handleLocal);

  let chan: RealtimeChannel | null = null;
  const setup = () => {
    const sb = activeClient;
    activeKeizSyncChannelReady[scope] = false;
    if (chan && sb) {
      if (activeKeizSyncChannels[scope] === chan) {
        delete activeKeizSyncChannels[scope];
      }
      sb.removeChannel(chan);
      chan = null;
    }
    if (!sb) return;
    chan = sb
      .channel(`keiz_sync_rt_${scope}`, {
        config: { broadcast: { self: false } },
      })
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: CHAT_TABLE },
        (payload) => {
          const parsed = parseKeizSyncRow(
            payload.new as Record<string, unknown>,
            scope
          );
          if (parsed) onEvent(parsed);
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: CHAT_TABLE },
        (payload) => {
          const parsed = parseKeizSyncRow(
            payload.new as Record<string, unknown>,
            scope
          );
          if (parsed) onEvent(parsed);
        }
      )
      .on('broadcast', { event: 'keiz_sync_event' }, ({ payload }) => {
        const parsed = payload as KeizSyncEventPayload | undefined;
        if (parsed && parsed.scope === scope) {
          onEvent(parsed);
        }
      })
      .subscribe((status) => {
        activeKeizSyncChannelReady[scope] = status === 'SUBSCRIBED';
      });
    activeKeizSyncChannels[scope] = chan;
  };

  setup();
  const unsubReconfig = onSupabaseReconfigured(setup);

  return () => {
    unsubReconfig();
    localChannel?.removeEventListener('message', handleLocal);
    activeKeizSyncChannelReady[scope] = false;
    if (chan && activeClient) {
      activeClient.removeChannel(chan);
      if (activeKeizSyncChannels[scope] === chan) {
        delete activeKeizSyncChannels[scope];
      }
    }
  };
}

// ---------- REAL TYPING INDICATOR (Broadcast 'keiz_typing_room' + DB Fallback 'keiz_typing') ----------
const TYPING_CHANNEL_NAME = 'keiz_typing_room';
const TYPING_TABLE = 'keiz_typing';
let activeTypingChannel: RealtimeChannel | null = null;
let activeTypingSubscribed = false;

function normalizeTypingRole(val: unknown): Role | null {
  const s = String(val || '').trim().toLowerCase();
  if (s === 'faiz') return 'faiz';
  if (s === 'kenat') return 'kenat';
  return null;
}

export function sendTypingBroadcast(user: Role, isTyping: boolean): void {
  const userLower = user.toLowerCase() as Role;
  const nowIso = new Date().toISOString();
  const payload = { user: userLower, is_typing: isTyping };

  localChannel?.postMessage({ type: TYPING_CHANNEL_NAME, payload });

  // Cara 1 - Broadcast (utama)
  if (activeTypingChannel && activeTypingSubscribed) {
    activeTypingChannel
      .send({
        type: 'broadcast',
        event: 'typing',
        payload,
      })
      .catch(() => {});
  }

  // Cara 2 - Fallback tabel keiz_typing (user_name PK, is_typing, updated_at)
  const sb = activeClient;
  if (sb) {
    Promise.resolve(
      sb
        .from(TYPING_TABLE)
        .upsert(
          {
            user_name: userLower,
            is_typing: isTyping,
            updated_at: nowIso,
          },
          { onConflict: 'user_name' }
        )
    )
      .then(({ error }) => {
        if (error) {
          // Abaikan jika tabel belum dibuat atau RLS belum dibuka; broadcast tetap jalan
          console.log('[KEIZ Typing DB upsert note]', error.code, error.message);
        }
      })
      .catch(() => {});
  }
}

export function subscribeTypingBroadcast(
  currentUser: Role,
  onPartnerTyping: (
    user: Role,
    isTyping: boolean,
    source: 'broadcast' | 'db',
    updatedAtMs?: number
  ) => void
): () => void {
  const currentLower = currentUser.toLowerCase() as Role;
  const partnerLower: Role = currentLower === 'faiz' ? 'kenat' : 'faiz';

  const handleDbRow = (row: Record<string, unknown> | null | undefined) => {
    if (!row) return;
    const rowUser = normalizeTypingRole(row.user_name ?? row.user);
    if (!rowUser || rowUser !== partnerLower || rowUser === currentLower) return;

    const rawUpdated = String(row.updated_at ?? '');
    const updatedAtMs = rawUpdated ? Date.parse(rawUpdated) : 0;
    const rawTyping = Boolean(row.is_typing);
    const isFresh =
      rawTyping &&
      Number.isFinite(updatedAtMs) &&
      Date.now() - updatedAtMs < 3000;

    onPartnerTyping(partnerLower, isFresh, 'db', updatedAtMs || Date.now());
  };

  const handleLocal = (ev: MessageEvent) => {
    if (ev.data?.type === TYPING_CHANNEL_NAME && ev.data.payload) {
      const sender = normalizeTypingRole(ev.data.payload.user);
      if (sender && sender === partnerLower && sender !== currentLower) {
        onPartnerTyping(
          partnerLower,
          Boolean(ev.data.payload.is_typing),
          'broadcast',
          Date.now()
        );
      }
    }
  };
  localChannel?.addEventListener('message', handleLocal);

  const setup = () => {
    const sb = activeClient;
    activeTypingSubscribed = false;
    if (activeTypingChannel && sb) {
      sb.removeChannel(activeTypingChannel);
      activeTypingChannel = null;
    }
    if (!sb) return;

    const ch = sb
      .channel(TYPING_CHANNEL_NAME, {
        config: { broadcast: { self: false } },
      })
      .on('broadcast', { event: 'typing' }, ({ payload }) => {
        if (!payload) return;
        const sender = normalizeTypingRole((payload as { user?: unknown }).user);
        if (sender && sender === partnerLower && sender !== currentLower) {
          onPartnerTyping(
            partnerLower,
            Boolean((payload as { is_typing?: unknown }).is_typing),
            'broadcast',
            Date.now()
          );
        }
      })
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: TYPING_TABLE },
        (payload) => {
          handleDbRow(payload.new as Record<string, unknown>);
        }
      )
      .subscribe((status) => {
        activeTypingSubscribed = status === 'SUBSCRIBED';
      });
    activeTypingChannel = ch;
  };

  setup();
  const unsubReconfig = onSupabaseReconfigured(setup);

  // Polling tiap 1 detik fallback tabel keiz_typing
  const pollTyping = async () => {
    const sb = activeClient;
    if (!sb) return;
    try {
      const { data, error } = await sb
        .from(TYPING_TABLE)
        .select('*')
        .eq('user_name', partnerLower)
        .maybeSingle();
      if (!error && data) {
        handleDbRow(data as Record<string, unknown>);
      }
    } catch {
      // ignore
    }
  };

  void pollTyping();
  const dbPollTimer = window.setInterval(() => {
    void pollTyping();
  }, 1000);

  return () => {
    window.clearInterval(dbPollTimer);
    unsubReconfig();
    localChannel?.removeEventListener('message', handleLocal);
    activeTypingSubscribed = false;
    if (activeTypingChannel && activeClient) {
      activeClient.removeChannel(activeTypingChannel);
      activeTypingChannel = null;
    }
  };
}

// ---------- LAGU KITA ANTREAN (tabel: lagu_keiz) ----------
export async function fetchSongs(): Promise<SongItem[]> {
  const sb = activeClient;
  if (!sb) return [];
  try {
    const { data, error } = await sb
      .from('lagu_keiz')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) {
      if (error.code !== '42P01') {
        void checkSupabaseConnection();
      }
      return [];
    }
    if (!Array.isArray(data)) return [];
    return data.map((row: Record<string, unknown>, idx: number) => ({
      id: String(row.id ?? `song-${idx}`),
      title: String(row.judul ?? row.title ?? ''),
      artist: String(row.penyanyi ?? row.artist ?? ''),
      artwork: String(row.cover_url ?? row.artwork ?? ''),
      youtube_query: String(
        row.youtube_query ??
          `${row.judul ?? row.title ?? ''} - ${row.penyanyi ?? row.artist ?? ''}`
      ),
      youtube_video_id: row.youtube_video_id
        ? String(row.youtube_video_id)
        : undefined,
      duration_ms: Number(row.durasi_full ?? row.duration_ms ?? 210000),
      added_by: toRole(row.added_by, 'faiz'),
      favorite: Boolean(row.favorite ?? false),
    }));
  } catch {
    void checkSupabaseConnection();
    return [];
  }
}

export async function addSongItem(song: Omit<SongItem, 'id'>): Promise<SongItem> {
  const newSong: SongItem = {
    ...song,
    id: `song-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
  };

  const sb = activeClient;
  if (sb) {
    try {
      const { data, error } = await sb
        .from('lagu_keiz')
        .insert([
          {
            judul: newSong.title,
            penyanyi: newSong.artist,
            cover_url: newSong.artwork,
            youtube_query: newSong.youtube_query,
            youtube_video_id: newSong.youtube_video_id ?? null,
            durasi_full: newSong.duration_ms,
            added_by: toDbUserName(newSong.added_by ?? 'faiz'),
            favorite: newSong.favorite ?? false,
          },
        ])
        .select()
        .single();
      if (error) {
        console.log('[KEIZ Lagu INSERT error]', error);
        emitSupabaseError('Gagal nambah lagu ke Supabase!');
      } else if (data && data.id !== undefined && data.id !== null) {
        newSong.id = String(data.id);
      }
    } catch {
      emitSupabaseError('Gagal nambah lagu ke Supabase!');
    }
  }

  localChannel?.postMessage({ type: 'lagu_update' });
  return newSong;
}

export async function deleteSongItem(id: string): Promise<void> {
  const sb = activeClient;
  if (sb) {
    try {
      await sb.from('lagu_keiz').delete().eq('id', id);
    } catch {
      // ignore
    }
  }
  localChannel?.postMessage({ type: 'lagu_update' });
}

export async function toggleSongFavorite(id: string, favorite: boolean): Promise<void> {
  const sb = activeClient;
  if (sb) {
    try {
      await sb.from('lagu_keiz').update({ favorite }).eq('id', id);
    } catch {
      // ignore
    }
  }
  localChannel?.postMessage({ type: 'lagu_update' });
}

// ---------- NOBAR SYNC REAL-TIME (tabel: keiz_nobar_sync, id = 1) ----------
function mapNobarRow(row: Record<string, unknown>): NobarSyncState | null {
  const videoId = String(row.videoId ?? row.video_id ?? '').trim();
  const ytUrl = String(row.youtube_url ?? '');
  if (!videoId) return null;
  const rawAction = String(row.action ?? 'change_video');
  const action = (
    ['play', 'pause', 'seek', 'change_video', 'rate'].includes(rawAction)
      ? rawAction
      : 'change_video'
  ) as NobarSyncState['action'];

  return {
    id: 1,
    youtube_url: ytUrl || `https://www.youtube.com/watch?v=${videoId}`,
    videoId,
    title: String(row.title ?? 'Video YouTube'),
    is_playing: Boolean(row.is_playing ?? false),
    current_time: Number(row.current_time ?? 0),
    playback_rate: Number(row.playback_rate ?? 1) || 1,
    updated_by: toRole(row.updated_by, 'faiz'),
    updated_at: String(row.updated_at ?? new Date().toISOString()),
    action,
  };
}

export async function fetchNobarSync(): Promise<NobarSyncState | null> {
  const sb = activeClient;
  if (!sb) return null;
  try {
    const { data, error } = await sb
      .from('keiz_nobar_sync')
      .select('*')
      .eq('id', 1)
      .maybeSingle();
    if (error) {
      if (error.code !== '42P01') {
        void checkSupabaseConnection();
      }
      return null;
    }
    return data ? mapNobarRow(data as Record<string, unknown>) : null;
  } catch {
    void checkSupabaseConnection();
    return null;
  }
}

let activeNobarChannel: RealtimeChannel | null = null;

export async function upsertNobarSync(
  payload: Omit<NobarSyncState, 'id' | 'updated_at'>
): Promise<NobarSyncState> {
  const nextState: NobarSyncState = {
    ...payload,
    id: 1,
    updated_at: new Date().toISOString(),
  };

  localChannel?.postMessage({ type: 'keiz_nobar_sync_update', payload: nextState });

  if (activeNobarChannel) {
    activeNobarChannel
      .send({
        type: 'broadcast',
        event: 'nobar_event',
        payload: nextState,
      })
      .catch(() => {});
  }

  const sb = activeClient;
  if (sb) {
    try {
      const { error } = await sb.from('keiz_nobar_sync').upsert([
        {
          id: 1,
          youtube_url: nextState.youtube_url,
          videoId: nextState.videoId,
          title: nextState.title,
          is_playing: nextState.is_playing,
          current_time: nextState.current_time,
          playback_rate: nextState.playback_rate,
          updated_by: toDbUserName(nextState.updated_by),
          updated_at: nextState.updated_at,
          action: nextState.action,
        },
      ]);
      if (error) {
        emitSupabaseError('Gagal sync Nobar ke Supabase!');
      }
    } catch {
      emitSupabaseError('Gagal sync Nobar ke Supabase!');
    }
  }

  return nextState;
}

export async function clearNobarSync(): Promise<void> {
  localChannel?.postMessage({ type: 'keiz_nobar_sync_update', payload: null });

  if (activeNobarChannel) {
    activeNobarChannel
      .send({
        type: 'broadcast',
        event: 'nobar_event',
        payload: null,
      })
      .catch(() => {});
  }

  const sb = activeClient;
  if (sb) {
    try {
      await sb.from('keiz_nobar_sync').upsert([
        {
          id: 1,
          youtube_url: '',
          videoId: '',
          title: '',
          is_playing: false,
          current_time: 0,
          playback_rate: 1,
          updated_by: 'Faiz',
          updated_at: new Date().toISOString(),
          action: 'change_video',
        },
      ]);
    } catch {
      // ignore
    }
  }
}

export function subscribeNobarChannel(
  currentUser: Role,
  onSync: (state: NobarSyncState | null) => void,
  onRoomMembers?: (members: Role[]) => void
): () => void {
  const handleLocal = (ev: MessageEvent) => {
    if (ev.data?.type === 'keiz_nobar_sync_update') {
      onSync((ev.data.payload as NobarSyncState | null) ?? null);
    }
  };
  localChannel?.addEventListener('message', handleLocal);

  const setup = () => {
    const sb = activeClient;
    if (activeNobarChannel && sb) {
      sb.removeChannel(activeNobarChannel);
      activeNobarChannel = null;
    }
    if (!sb) return;
    const ch = sb
      .channel('keiz_nobar_sync', {
        config: {
          presence: { key: currentUser },
        },
      })
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'keiz_nobar_sync' },
        (payload) => {
          if (payload.eventType === 'DELETE') {
            onSync(null);
            return;
          }
          onSync(mapNobarRow(payload.new as Record<string, unknown>));
        }
      )
      .on('broadcast', { event: 'nobar_event' }, ({ payload }) => {
        onSync((payload as NobarSyncState | null) ?? null);
      })
      .on('presence', { event: 'sync' }, () => {
        if (!onRoomMembers) return;
        const state = ch.presenceState();
        const roles = Object.keys(state).map((k) => toRole(k));
        onRoomMembers(Array.from(new Set(roles)));
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await ch.track({ user: currentUser, in_nobar: true });
        }
      });

    activeNobarChannel = ch;
  };

  setup();
  const unsubReconfig = onSupabaseReconfigured(setup);

  return () => {
    unsubReconfig();
    localChannel?.removeEventListener('message', handleLocal);
    if (activeNobarChannel && activeClient) {
      activeClient.removeChannel(activeNobarChannel);
      activeNobarChannel = null;
    }
  };
}

// ---------- MUSIC SYNC REAL-TIME (tabel: keiz_music_sync, id = 1) ----------
function mapMusicRow(row: Record<string, unknown>): MusicSyncState | null {
  const videoId = String(row.videoId ?? row.video_id ?? '').trim();
  if (!videoId) return null;
  const rawAction = String(row.action ?? 'change_song');
  const action = (
    ['play', 'pause', 'seek', 'change_song', 'next', 'prev'].includes(rawAction)
      ? rawAction
      : 'change_song'
  ) as MusicSyncState['action'];

  return {
    id: 1,
    youtube_url:
      String(row.youtube_url ?? '') || `https://www.youtube.com/watch?v=${videoId}`,
    videoId,
    title: String(row.title ?? 'Lagu Berdua'),
    artist: String(row.artist ?? ''),
    thumbnail: String(row.thumbnail ?? ''),
    duration_ms: Number(row.duration_ms ?? 213000),
    is_playing: Boolean(row.is_playing ?? false),
    current_time: Number(row.current_time ?? 0),
    updated_by: toRole(row.updated_by, 'faiz'),
    updated_at: String(row.updated_at ?? new Date().toISOString()),
    action,
  };
}

export async function fetchMusicSync(): Promise<MusicSyncState | null> {
  const sb = activeClient;
  if (!sb) return null;
  try {
    const { data, error } = await sb
      .from('keiz_music_sync')
      .select('*')
      .eq('id', 1)
      .maybeSingle();
    if (error) {
      if (error.code !== '42P01') {
        void checkSupabaseConnection();
      }
      return null;
    }
    return data ? mapMusicRow(data as Record<string, unknown>) : null;
  } catch {
    void checkSupabaseConnection();
    return null;
  }
}

let activeMusicChannel: RealtimeChannel | null = null;

export async function upsertMusicSync(
  payload: Omit<MusicSyncState, 'id' | 'updated_at'>
): Promise<MusicSyncState> {
  const nextState: MusicSyncState = {
    ...payload,
    id: 1,
    updated_at: new Date().toISOString(),
  };

  localChannel?.postMessage({ type: 'keiz_music_sync_update', payload: nextState });

  if (activeMusicChannel) {
    activeMusicChannel
      .send({
        type: 'broadcast',
        event: 'music_event',
        payload: nextState,
      })
      .catch(() => {});
  }

  const sb = activeClient;
  if (sb) {
    try {
      const { error } = await sb.from('keiz_music_sync').upsert([
        {
          id: 1,
          youtube_url: nextState.youtube_url,
          videoId: nextState.videoId,
          title: nextState.title,
          artist: nextState.artist,
          thumbnail: nextState.thumbnail,
          duration_ms: nextState.duration_ms ?? 213000,
          is_playing: nextState.is_playing,
          current_time: nextState.current_time,
          updated_by: toDbUserName(nextState.updated_by),
          updated_at: nextState.updated_at,
          action: nextState.action,
        },
      ]);
      if (error) {
        emitSupabaseError('Gagal sync Musik ke Supabase!');
      }
    } catch {
      emitSupabaseError('Gagal sync Musik ke Supabase!');
    }
  }

  return nextState;
}

export function subscribeMusicChannel(
  currentUser: Role,
  onSync: (state: MusicSyncState | null) => void,
  onRoomMembers?: (members: Role[]) => void
): () => void {
  const handleLocal = (ev: MessageEvent) => {
    if (ev.data?.type === 'keiz_music_sync_update') {
      onSync((ev.data.payload as MusicSyncState | null) ?? null);
    }
  };
  localChannel?.addEventListener('message', handleLocal);

  const setup = () => {
    const sb = activeClient;
    if (activeMusicChannel && sb) {
      sb.removeChannel(activeMusicChannel);
      activeMusicChannel = null;
    }
    if (!sb) return;
    const ch = sb
      .channel('keiz_music_sync', {
        config: {
          presence: { key: currentUser },
        },
      })
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'keiz_music_sync' },
        (payload) => {
          if (payload.eventType === 'DELETE') {
            onSync(null);
            return;
          }
          onSync(mapMusicRow(payload.new as Record<string, unknown>));
        }
      )
      .on('broadcast', { event: 'music_event' }, ({ payload }) => {
        onSync((payload as MusicSyncState | null) ?? null);
      })
      .on('presence', { event: 'sync' }, () => {
        if (!onRoomMembers) return;
        const state = ch.presenceState();
        const roles = Object.keys(state).map((k) => toRole(k));
        onRoomMembers(Array.from(new Set(roles)));
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await ch.track({ user: currentUser, in_music: true });
        }
      });

    activeMusicChannel = ch;
  };

  setup();
  const unsubReconfig = onSupabaseReconfigured(setup);

  return () => {
    unsubReconfig();
    localChannel?.removeEventListener('message', handleLocal);
    if (activeMusicChannel && activeClient) {
      activeClient.removeChannel(activeMusicChannel);
      activeMusicChannel = null;
    }
  };
}

// ---------- PRESENCE REAL-TIME (tabel: presence_keiz + Supabase Presence) ----------
export const PRESENCE_STALE_MS = 35_000;

export function isPresenceOnline(
  p: PresenceState | null | undefined,
  now = Date.now()
): boolean {
  if (!p || p.status !== 'online') return false;
  if (!p.last_seen) return false;
  const ts = Date.parse(p.last_seen);
  if (!Number.isFinite(ts)) return false;
  return now - ts <= PRESENCE_STALE_MS;
}

export function formatLastSeen(iso?: string | null, now = Date.now()): string {
  if (!iso) return '';
  const ts = Date.parse(iso);
  if (!Number.isFinite(ts)) return '';
  const diffMs = Math.max(0, now - ts);
  if (diffMs < 60_000) return 'baru saja';

  const d = new Date(ts);
  const clock = d
    .toLocaleTimeString('id-ID', {
      hour: '2-digit',
      minute: '2-digit',
    })
    .replace(':', '.');

  if (diffMs < 3_600_000) {
    const mins = Math.max(1, Math.floor(diffMs / 60_000));
    return `${mins} menit lalu (${clock})`;
  }

  const today = new Date(now);
  const startOfToday = new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate()
  ).getTime();
  const startOfTarget = new Date(
    d.getFullYear(),
    d.getMonth(),
    d.getDate()
  ).getTime();
  const dayDiff = Math.round((startOfToday - startOfTarget) / 86_400_000);

  if (dayDiff === 0) return `hari ini jam ${clock}`;
  if (dayDiff === 1) return `kemarin jam ${clock}`;

  const dateStr = d.toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'short',
  });
  return `${dateStr} jam ${clock}`;
}

export interface PartnerPresenceDisplay {
  online: boolean;
  isWatchingNobar: boolean;
  isListeningMusic: boolean;
  isInGame: boolean;
  nobarTitle: string;
  songTitle: string;
  lastSeenText: string;
  label: string;
  shortLabel: string;
}

export function formatPartnerPresenceText(
  partnerName: string,
  presence: PresenceState | null | undefined,
  now = Date.now()
): PartnerPresenceDisplay {
  const online = isPresenceOnline(presence, now);
  const lastSeenText = formatLastSeen(presence?.last_seen, now);

  if (!online || !presence) {
    return {
      online: false,
      isWatchingNobar: false,
      isListeningMusic: false,
      isInGame: false,
      nobarTitle: '',
      songTitle: '',
      lastSeenText,
      label: lastSeenText
        ? `${partnerName} offline · terakhir online ${lastSeenText}`
        : `${partnerName} lagi offline`,
      shortLabel: lastSeenText
        ? `Offline · terakhir online ${lastSeenText}`
        : 'Offline',
    };
  }

  const rawPlay = (presence.lagi_play_apa || '').trim();
  const isWatchingNobar = presence.lagi_ngapain === 'di Nobar';
  const isInGame = presence.lagi_ngapain === 'di Game';
  const hasMusicMarker =
    rawPlay.startsWith('MUSIC:') || rawPlay.startsWith('🎵 ');
  const isListeningMusic =
    !isWatchingNobar &&
    !isInGame &&
    (presence.lagi_ngapain === 'di Musik' || hasMusicMarker);

  if (isWatchingNobar) {
    const nobarTitle = stripDecorEmojis(rawPlay.replace(/^(?:NOBAR:|🎬)\s*/i, ''));
    return {
      online: true,
      isWatchingNobar: true,
      isListeningMusic: false,
      isInGame: false,
      nobarTitle,
      songTitle: '',
      lastSeenText,
      label: nobarTitle
        ? `${partnerName} lagi nonton "${nobarTitle}"`
        : `${partnerName} lagi nonton Nobar`,
      shortLabel: nobarTitle
        ? `Online - lagi nonton ${nobarTitle}`
        : 'Online - lagi nonton Nobar',
    };
  }

  if (isInGame) {
    return {
      online: true,
      isWatchingNobar: false,
      isListeningMusic: false,
      isInGame: true,
      nobarTitle: '',
      songTitle: '',
      lastSeenText,
      label: `${partnerName} lagi online di Game`,
      shortLabel: 'Online · di Game',
    };
  }

  if (isListeningMusic) {
    const songTitle = stripDecorEmojis(rawPlay.replace(/^(?:MUSIC:|🎵)\s*/i, ''));
    if (songTitle) {
      const extraWhere =
        presence.lagi_ngapain !== 'di Musik' &&
        presence.lagi_ngapain !== 'di Home'
          ? ` (${presence.lagi_ngapain})`
          : '';
      return {
        online: true,
        isWatchingNobar: false,
        isListeningMusic: true,
        isInGame: false,
        nobarTitle: '',
        songTitle,
        lastSeenText,
        label: `${partnerName} lagi dengerin lagu "${songTitle}"${extraWhere}`,
        shortLabel: `Online - lagi dengerin lagu ${songTitle}`,
      };
    }
    return {
      online: true,
      isWatchingNobar: false,
      isListeningMusic: false,
      isInGame: false,
      nobarTitle: '',
      songTitle: '',
      lastSeenText,
      label: `${partnerName} lagi di Musik`,
      shortLabel: 'Online · di Musik',
    };
  }

  const place = presence.lagi_ngapain || 'di Home';
  return {
    online: true,
    isWatchingNobar: false,
    isListeningMusic: false,
    isInGame: false,
    nobarTitle: '',
    songTitle: '',
    lastSeenText,
    label: `${partnerName} online · ${place}`,
    shortLabel: `Online · ${place}`,
  };
}

let activePresenceChannel: RealtimeChannel | null = null;
let activePresenceSubscribed = false;
const lastTrackedPresence: Record<Role, PresenceState | null> = {
  faiz: null,
  kenat: null,
};

function mapPresenceRow(row: Record<string, unknown>): PresenceState {
  return {
    user: toRole(row.user, 'faiz'),
    status: String(row.status ?? 'offline') === 'online' ? 'online' : 'offline',
    lagi_ngapain: (row.lagi_ngapain as PresenceActivity) || 'di Home',
    lagi_play_apa: String(row.lagi_play_apa ?? ''),
    last_seen: String(row.last_seen ?? new Date().toISOString()),
  };
}

export async function fetchAllPresence(): Promise<Record<Role, PresenceState | null>> {
  const result: Record<Role, PresenceState | null> = { faiz: null, kenat: null };
  const sb = activeClient;
  if (!sb) return result;
  try {
    const { data, error } = await sb.from('presence_keiz').select('*');
    if (!error && Array.isArray(data)) {
      data.forEach((row) => {
        const mapped = mapPresenceRow(row as Record<string, unknown>);
        result[mapped.user] = mapped;
      });
    }
  } catch {
    // ignore
  }
  return result;
}

export async function upsertPresence(state: PresenceState): Promise<void> {
  lastTrackedPresence[state.user] = state;
  localChannel?.postMessage({ type: 'presence_update', payload: state });

  if (activePresenceChannel && activePresenceSubscribed) {
    if (state.status === 'offline') {
      activePresenceChannel.untrack().catch(() => {});
    } else {
      activePresenceChannel
        .track({
          user: toDbUserName(state.user),
          status: state.status,
          lagi_ngapain: state.lagi_ngapain,
          lagi_play_apa: state.lagi_play_apa,
          last_seen: state.last_seen,
        })
        .catch(() => {});
    }
  }

  const sb = activeClient;
  if (sb) {
    const rowPayload = {
      user: toDbUserName(state.user),
      status: state.status,
      lagi_ngapain: state.lagi_ngapain,
      lagi_play_apa: state.lagi_play_apa,
      last_seen: state.last_seen,
    };
    try {
      const { error } = await sb
        .from('presence_keiz')
        .upsert([rowPayload], { onConflict: 'user' });
      if (error) {
        await sb.from('presence_keiz').upsert([rowPayload]);
      }
    } catch {
      // ignore
    }
  }
}

export function markPresenceOfflineFast(user: Role): void {
  const now = new Date().toISOString();
  const offlineState: PresenceState = {
    user,
    status: 'offline',
    lagi_ngapain: 'di Home',
    lagi_play_apa: '',
    last_seen: now,
  };
  lastTrackedPresence[user] = offlineState;
  localChannel?.postMessage({ type: 'presence_update', payload: offlineState });

  if (activePresenceChannel && activePresenceSubscribed) {
    activePresenceChannel.untrack().catch(() => {});
  }

  const { url, anonKey } = getSupabaseConfig();
  if (!url || !anonKey) return;
  try {
    const cleanUrl = url.replace(/\/+$/, '');
    fetch(`${cleanUrl}/rest/v1/presence_keiz?on_conflict=user`, {
      method: 'POST',
      keepalive: true,
      headers: {
        'Content-Type': 'application/json',
        apikey: anonKey,
        Authorization: `Bearer ${anonKey}`,
        Prefer: 'resolution=merge-duplicates,return=minimal',
      },
      body: JSON.stringify([
        {
          user: toDbUserName(user),
          status: 'offline',
          lagi_ngapain: 'di Home',
          lagi_play_apa: '',
          last_seen: now,
        },
      ]),
    }).catch(() => {});
  } catch {
    // ignore
  }
}

export function subscribePresence(
  currentUser: Role,
  onPresenceMap: (map: Record<Role, PresenceState | null>) => void
): () => void {
  const latest: Record<Role, PresenceState | null> = { faiz: null, kenat: null };
  const realtimeOnlineRoles = new Set<Role>();

  const emitNormalized = () => {
    const now = Date.now();
    const out: Record<Role, PresenceState | null> = { faiz: null, kenat: null };
    (['faiz', 'kenat'] as const).forEach((role) => {
      const row = latest[role];
      if (!row) {
        out[role] = null;
        return;
      }
      if (role !== currentUser && realtimeOnlineRoles.has(role)) {
        out[role] = {
          ...row,
          status: 'online',
          last_seen:
            row.last_seen && now - Date.parse(row.last_seen) <= PRESENCE_STALE_MS
              ? row.last_seen
              : new Date(now).toISOString(),
        };
        return;
      }
      if (row.status === 'online' && !isPresenceOnline(row, now)) {
        out[role] = {
          ...row,
          status: 'offline',
        };
        return;
      }
      out[role] = row;
    });
    onPresenceMap(out);
  };

  fetchAllPresence().then((initial) => {
    latest.faiz = initial.faiz;
    latest.kenat = initial.kenat;
    emitNormalized();
  });

  const handleLocal = (ev: MessageEvent) => {
    if (ev.data?.type === 'presence_update' && ev.data.payload) {
      const st = ev.data.payload as PresenceState;
      latest[st.user] = st;
      emitNormalized();
    }
  };
  localChannel?.addEventListener('message', handleLocal);

  const syncRealtimePresenceState = (ch: RealtimeChannel) => {
    const pState = ch.presenceState();
    const seen = new Set<Role>();
    Object.entries(pState).forEach(([k, val]) => {
      const arr = val as Record<string, unknown>[] | undefined;
      if (!arr || arr.length === 0) return;
      const first = arr[0];
      const role = toRole(String(first.user ?? k));
      seen.add(role);
      const incomingLastSeen = String(first.last_seen ?? new Date().toISOString());
      const prevTs = latest[role]?.last_seen ? Date.parse(latest[role]!.last_seen) : 0;
      const nextTs = Date.parse(incomingLastSeen) || Date.now();
      if (nextTs >= prevTs || latest[role]?.status !== 'online') {
        latest[role] = {
          user: role,
          status: 'online',
          lagi_ngapain:
            (first.lagi_ngapain as PresenceActivity) ||
            latest[role]?.lagi_ngapain ||
            'di Home',
          lagi_play_apa: String(
            first.lagi_play_apa ?? latest[role]?.lagi_play_apa ?? ''
          ),
          last_seen: new Date(Math.max(nextTs, Date.now())).toISOString(),
        };
      }
    });
    realtimeOnlineRoles.clear();
    seen.forEach((r) => realtimeOnlineRoles.add(r));
  };

  const setup = () => {
    const sb = activeClient;
    activePresenceSubscribed = false;
    if (activePresenceChannel && sb) {
      sb.removeChannel(activePresenceChannel);
      activePresenceChannel = null;
    }
    if (!sb) return;
    const ch = sb
      .channel('keiz_presence_global', {
        config: { presence: { key: toDbUserName(currentUser) } },
      })
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'presence_keiz' },
        (payload) => {
          const mapped = mapPresenceRow(payload.new as Record<string, unknown>);
          latest[mapped.user] = mapped;
          if (mapped.status === 'offline') {
            realtimeOnlineRoles.delete(mapped.user);
          }
          emitNormalized();
        }
      )
      .on('presence', { event: 'sync' }, () => {
        syncRealtimePresenceState(ch);
        emitNormalized();
      })
      .on('presence', { event: 'leave' }, ({ key }) => {
        syncRealtimePresenceState(ch);
        const role = toRole(key);
        if (role !== currentUser && !realtimeOnlineRoles.has(role) && latest[role]) {
          latest[role] = {
            ...latest[role]!,
            status: 'offline',
            last_seen: new Date().toISOString(),
          };
        }
        emitNormalized();
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          activePresenceSubscribed = true;
          const mine = lastTrackedPresence[currentUser];
          if (mine && mine.status === 'online') {
            ch.track({
              user: toDbUserName(mine.user),
              status: mine.status,
              lagi_ngapain: mine.lagi_ngapain,
              lagi_play_apa: mine.lagi_play_apa,
              last_seen: mine.last_seen,
            }).catch(() => {});
          }
        } else {
          activePresenceSubscribed = false;
        }
      });

    activePresenceChannel = ch;
  };

  setup();
  const unsubReconfig = onSupabaseReconfigured(setup);

  // Re-evaluate staleness & poll DB periodically so offline/activity always stay accurate
  const staleTimer = window.setInterval(() => {
    emitNormalized();
  }, 6000);

  const dbPollTimer = window.setInterval(() => {
    fetchAllPresence().then((fresh) => {
      (['faiz', 'kenat'] as const).forEach((role) => {
        if (role === currentUser && lastTrackedPresence[currentUser]?.status === 'online') {
          return;
        }
        if (fresh[role]) {
          latest[role] = fresh[role];
        }
      });
      emitNormalized();
    });
  }, 10_000);

  return () => {
    window.clearInterval(staleTimer);
    window.clearInterval(dbPollTimer);
    unsubReconfig();
    localChannel?.removeEventListener('message', handleLocal);
    activePresenceSubscribed = false;
    if (activePresenceChannel && activeClient) {
      activeClient.removeChannel(activePresenceChannel);
      activePresenceChannel = null;
    }
  };
}

// ---------- CALL BERDUA (tabel: call_keiz) ----------
function mapCallRow(row: Record<string, unknown>): CallState {
  const statusRaw = String(row.status ?? 'ended');
  const status = (
    ['ringing', 'connected', 'ended'].includes(statusRaw)
      ? statusRaw
      : 'ended'
  ) as CallState['status'];
  return {
    id: String(row.id ?? ''),
    caller: toRole(row.caller, 'faiz'),
    callee: toRole(row.callee, 'kenat'),
    status,
    offer: row.offer ? String(row.offer) : undefined,
    answer: row.answer ? String(row.answer) : undefined,
    voice_effect: (row.voice_effect as VoiceEffectMode) || 'normal',
    created_at: String(row.created_at ?? new Date().toISOString()),
  };
}

let activeCallSignalChannel: RealtimeChannel | null = null;

export async function createCallOffer(
  caller: Role,
  callee: Role,
  offerSdp: string
): Promise<CallState> {
  const callObj: CallState = {
    id: makeUuid(),
    caller,
    callee,
    status: 'ringing',
    offer: offerSdp,
    voice_effect: 'normal',
    created_at: new Date().toISOString(),
  };

  const sb = activeClient;
  if (sb) {
    try {
      const { data, error } = await sb
        .from('call_keiz')
        .insert([
          {
            caller: toDbUserName(caller),
            callee: toDbUserName(callee),
            status: 'ringing',
            offer: offerSdp,
            voice_effect: 'normal',
            created_at: callObj.created_at,
          },
        ])
        .select()
        .single();
      if (error) {
        console.log('[KEIZ Call INSERT error]', error);
        emitSupabaseError('Gagal nyambungin Call ke Supabase!');
      } else if (data && data.id !== undefined && data.id !== null) {
        callObj.id = String(data.id);
      }
    } catch {
      emitSupabaseError('Gagal nyambungin Call ke Supabase!');
    }
  }
  localChannel?.postMessage({ type: 'call_update', payload: callObj });
  return callObj;
}

export async function answerCallOffer(
  callId: string,
  answerSdp: string
): Promise<void> {
  const sb = activeClient;
  if (sb) {
    try {
      await sb
        .from('call_keiz')
        .update({ status: 'connected', answer: answerSdp })
        .eq('id', callId);
    } catch {
      // ignore
    }
  }
}

export async function updateCallStatus(
  callId: string,
  status: CallState['status'],
  voiceEffect?: VoiceEffectMode
): Promise<void> {
  const sb = activeClient;
  if (sb) {
    try {
      await sb
        .from('call_keiz')
        .update({
          status,
          ...(voiceEffect ? { voice_effect: voiceEffect } : {}),
        })
        .eq('id', callId);
    } catch {
      // ignore
    }
  }
}

export async function fetchLatestActiveCall(): Promise<CallState | null> {
  const sb = activeClient;
  if (!sb) return null;
  try {
    const { data, error } = await sb
      .from('call_keiz')
      .select('*')
      .in('status', ['ringing', 'connected'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!error && data) {
      return mapCallRow(data as Record<string, unknown>);
    }
  } catch {
    // ignore
  }
  return null;
}

export function sendCallIceCandidate(
  callId: string,
  from: Role,
  candidate: RTCIceCandidateInit
): void {
  const payload = { callId, from, candidate };
  localChannel?.postMessage({ type: 'call_ice', payload });
  if (activeCallSignalChannel) {
    activeCallSignalChannel
      .send({
        type: 'broadcast',
        event: 'ice_candidate',
        payload,
      })
      .catch(() => {});
  }
}

export function subscribeCallChannel(
  onCallChange: (call: CallState) => void,
  onIceCandidate: (data: {
    callId: string;
    from: Role;
    candidate: RTCIceCandidateInit;
  }) => void
): () => void {
  const handleLocal = (ev: MessageEvent) => {
    if (ev.data?.type === 'call_update' && ev.data.payload) {
      onCallChange(ev.data.payload as CallState);
    }
    if (ev.data?.type === 'call_ice' && ev.data.payload) {
      onIceCandidate(
        ev.data.payload as {
          callId: string;
          from: Role;
          candidate: RTCIceCandidateInit;
        }
      );
    }
  };
  localChannel?.addEventListener('message', handleLocal);

  const setup = () => {
    const sb = activeClient;
    if (activeCallSignalChannel && sb) {
      sb.removeChannel(activeCallSignalChannel);
      activeCallSignalChannel = null;
    }
    if (!sb) return;
    activeCallSignalChannel = sb
      .channel('keiz_call_signal')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'call_keiz' },
        (payload) => {
          if (payload.eventType === 'DELETE') return;
          onCallChange(mapCallRow(payload.new as Record<string, unknown>));
        }
      )
      .on('broadcast', { event: 'ice_candidate' }, ({ payload }) => {
        if (payload) {
          onIceCandidate(
            payload as {
              callId: string;
              from: Role;
              candidate: RTCIceCandidateInit;
            }
          );
        }
      })
      .subscribe();
  };

  setup();
  const unsubReconfig = onSupabaseReconfigured(setup);

  return () => {
    unsubReconfig();
    localChannel?.removeEventListener('message', handleLocal);
    if (activeCallSignalChannel && activeClient) {
      activeClient.removeChannel(activeCallSignalChannel);
      activeCallSignalChannel = null;
    }
  };
}

// ---------- UNEK UNEK (tabel: unek_unek_keiz) ----------
export async function fetchUnekList(): Promise<UnekItem[]> {
  const sb = activeClient;
  if (!sb) return [];
  try {
    const { data, error } = await sb
      .from('unek_unek_keiz')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50);
    if (error) {
      if (error.code !== '42P01') {
        void checkSupabaseConnection();
      }
      return [];
    }
    if (!Array.isArray(data)) return [];
    return data.map((row: Record<string, unknown>, idx: number) => {
      let createdLabel = 'baru aja';
      if (row.created_at) {
        try {
          createdLabel = new Date(String(row.created_at)).toLocaleTimeString('id-ID', {
            hour: '2-digit',
            minute: '2-digit',
          });
        } catch {
          createdLabel = 'baru aja';
        }
      }
      return {
        id: String(row.id ?? `unek-${idx}`),
        author: toRole(row.author, 'faiz'),
        mood: row.mood ? stripDecorEmojis(String(row.mood)) : undefined,
        text: String(row.isi ?? row.text ?? ''),
        reply: row.reply ? String(row.reply) : undefined,
        is_anonymous: Boolean(row.is_anonymous ?? false),
        createdAt: createdLabel,
      };
    });
  } catch {
    void checkSupabaseConnection();
    return [];
  }
}

export async function addUnekItem(item: {
  author: Role;
  text: string;
  mood?: string;
  is_anonymous?: boolean;
}): Promise<UnekItem> {
  const cleanMood = item.mood ? stripDecorEmojis(item.mood) : undefined;
  const newItem: UnekItem = {
    id: `unek-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
    author: item.author,
    mood: cleanMood,
    text: item.text,
    is_anonymous: Boolean(item.is_anonymous ?? false),
    createdAt: 'baru aja',
  };

  const sb = activeClient;
  if (sb) {
    try {
      const insertPayload: Record<string, unknown> = {
        author: toDbUserName(item.author),
        isi: item.text,
        is_anonymous: Boolean(item.is_anonymous ?? false),
        created_at: new Date().toISOString(),
      };
      if (cleanMood) {
        insertPayload.mood = cleanMood;
      }

      let res = await sb
        .from('unek_unek_keiz')
        .insert([insertPayload])
        .select()
        .single();

      if (res.error && cleanMood && String(res.error.message || '').includes('mood')) {
        delete insertPayload.mood;
        res = await sb
          .from('unek_unek_keiz')
          .insert([insertPayload])
          .select()
          .single();
      }

      if (res.error) {
        console.log('[KEIZ Unek INSERT error]', res.error);
        emitSupabaseError('Gagal kirim unek-unek ke Supabase!');
      } else if (res.data && res.data.id !== undefined && res.data.id !== null) {
        newItem.id = String(res.data.id);
      }
    } catch {
      emitSupabaseError('Gagal kirim unek-unek ke Supabase!');
    }
  }

  localChannel?.postMessage({ type: 'unek_update' });
  return newItem;
}

export async function deleteUnekItem(id: string): Promise<boolean> {
  const sb = activeClient;
  if (sb) {
    try {
      const { error } = await sb.from('unek_unek_keiz').delete().eq('id', id);
      if (error) {
        emitSupabaseError('Gagal hapus unek-unek dari Supabase!');
        return false;
      }
    } catch {
      emitSupabaseError('Gagal hapus unek-unek dari Supabase!');
      return false;
    }
  }
  localChannel?.postMessage({ type: 'unek_update' });
  return true;
}

export async function replyUnekItem(
  id: string,
  replyText: string | null
): Promise<UnekItem[]> {
  const sb = activeClient;
  if (sb) {
    try {
      await sb.from('unek_unek_keiz').update({ reply: replyText }).eq('id', id);
    } catch {
      // ignore
    }
  }
  localChannel?.postMessage({ type: 'unek_update' });
  return fetchUnekList();
}

// ---------- GAME MABAR ONLINE SHARED (tabel: keiz_game, 1 room tetap: keizbucin) ----------
export const KEIZ_GAME_SQL_SETUP = `create table if not exists public.keiz_game (
  id int primary key default 1,
  room_code text default 'keizbucin',
  game_type text default '',
  status text default 'waiting',
  current_turn text default 'faiz',
  board jsonb default '{}'::jsonb,
  score_faiz int default 0,
  score_kenat int default 0,
  last_move_by text,
  updated_at timestamptz default now()
);
alter table public.keiz_game enable row level security;
create policy "allow_all_keiz_game" on public.keiz_game for all using (true) with check (true);
insert into public.keiz_game (id, room_code, game_type, status, current_turn, board, score_faiz, score_kenat, last_move_by)
values (1, 'keizbucin', '', 'waiting', 'faiz', '{}'::jsonb, 0, 0, null)
on conflict (id) do nothing;
alter publication supabase_realtime add table public.keiz_game;`;

export const DEFAULT_KEIZ_GAME: KeizGameState = {
  id: 1,
  room_code: 'keizbucin',
  game_type: '',
  status: 'waiting',
  current_turn: 'faiz',
  board: {},
  score_faiz: 0,
  score_kenat: 0,
  last_move_by: null,
  updated_at: new Date().toISOString(),
};

function normalizeGameStatus(raw: unknown): GameRoomStatus {
  const s = String(raw || '').toLowerCase();
  if (s === 'playing' || s === 'finished') return s;
  return 'waiting';
}

function mapGameRow(row: Record<string, unknown>): KeizGameState {
  let boardVal: Record<string, unknown> | unknown[] = {};
  if (row.board && typeof row.board === 'object') {
    boardVal = row.board as Record<string, unknown> | unknown[];
  }
  return {
    id: Number(row.id ?? 1) || 1,
    room_code: String(row.room_code ?? 'keizbucin') || 'keizbucin',
    game_type: String(row.game_type ?? ''),
    status: normalizeGameStatus(row.status),
    current_turn: toRole(row.current_turn, 'faiz'),
    board: boardVal,
    score_faiz: Number(row.score_faiz ?? 0) || 0,
    score_kenat: Number(row.score_kenat ?? 0) || 0,
    last_move_by: row.last_move_by ? toRole(row.last_move_by, 'faiz') : null,
    updated_at: String(row.updated_at ?? new Date().toISOString()),
  };
}

let activeGameRealtimeChannel: RealtimeChannel | null = null;
let latestGameState: KeizGameState = { ...DEFAULT_KEIZ_GAME };

async function persistKeizGamePatch(
  patch: Partial<KeizGameState>
): Promise<KeizGameState> {
  const next: KeizGameState = {
    ...latestGameState,
    ...patch,
    id: 1,
    room_code: 'keizbucin',
    updated_at: new Date().toISOString(),
  };
  latestGameState = next;
  localChannel?.postMessage({ type: 'keiz_game_update', payload: next });

  if (activeGameRealtimeChannel) {
    activeGameRealtimeChannel
      .send({
        type: 'broadcast',
        event: 'game_event',
        payload: next,
      })
      .catch(() => {});
  }

  const sb = activeClient;
  if (!sb) return next;

  try {
    const { data, error } = await sb
      .from('keiz_game')
      .upsert([next])
      .select()
      .maybeSingle();

    if (!error && data) {
      const mapped = mapGameRow(data as Record<string, unknown>);
      latestGameState = mapped;
      return mapped;
    }
  } catch {
    // ignore
  }
  return next;
}

export async function fetchGameState(): Promise<KeizGameState> {
  const sb = activeClient;
  if (!sb) return latestGameState;

  try {
    const { data, error } = await sb
      .from('keiz_game')
      .select('*')
      .eq('id', 1)
      .maybeSingle();

    if (error) return latestGameState;
    if (!data) {
      const created = {
        ...DEFAULT_KEIZ_GAME,
        updated_at: new Date().toISOString(),
      };
      await sb.from('keiz_game').upsert([created]);
      latestGameState = created;
      return created;
    }

    const mapped = mapGameRow(data as Record<string, unknown>);
    latestGameState = mapped;
    return mapped;
  } catch {
    return latestGameState;
  }
}

export async function createGame(
  game_type: string,
  by: Role = 'faiz'
): Promise<KeizGameState> {
  return persistKeizGamePatch({
    game_type,
    status: 'waiting',
    current_turn: by,
    board: {},
    last_move_by: by,
  });
}

export async function joinGame(by: Role): Promise<KeizGameState> {
  const current = await fetchGameState();
  return persistKeizGamePatch({
    game_type: current.game_type,
    status: current.game_type ? 'playing' : 'waiting',
    last_move_by: by,
  });
}

export async function makeMove(move: {
  by: Role;
  board: Record<string, unknown> | unknown[];
  nextTurn?: Role;
  status?: GameRoomStatus;
}): Promise<KeizGameState> {
  const nextTurn: Role =
    move.nextTurn ?? (move.by === 'faiz' ? 'kenat' : 'faiz');
  return persistKeizGamePatch({
    board: move.board,
    current_turn: nextTurn,
    status: move.status ?? 'playing',
    last_move_by: move.by,
  });
}

export async function resetGame(by: Role = 'faiz'): Promise<KeizGameState> {
  return persistKeizGamePatch({
    status: 'waiting',
    current_turn: 'faiz',
    board: {},
    score_faiz: 0,
    score_kenat: 0,
    last_move_by: by,
  });
}

export async function updateScore(scores: {
  score_faiz?: number;
  score_kenat?: number;
  by?: Role;
}): Promise<KeizGameState> {
  return persistKeizGamePatch({
    score_faiz:
      scores.score_faiz !== undefined
        ? scores.score_faiz
        : latestGameState.score_faiz,
    score_kenat:
      scores.score_kenat !== undefined
        ? scores.score_kenat
        : latestGameState.score_kenat,
    last_move_by: scores.by ?? latestGameState.last_move_by,
  });
}

export function subscribeGameRealtime(
  currentUser: Role,
  onGameChange: (state: KeizGameState) => void,
  onRoomMembers?: (members: Role[]) => void
): () => void {
  const handleLocal = (ev: MessageEvent) => {
    if (ev.data?.type === 'keiz_game_update' && ev.data.payload) {
      const mapped = mapGameRow(ev.data.payload as Record<string, unknown>);
      latestGameState = mapped;
      onGameChange(mapped);
    }
  };
  localChannel?.addEventListener('message', handleLocal);

  const setup = () => {
    const sb = activeClient;
    if (activeGameRealtimeChannel && sb) {
      sb.removeChannel(activeGameRealtimeChannel);
      activeGameRealtimeChannel = null;
    }
    if (!sb) return;

    const channel = sb.channel('keiz_game_room_keizbucin', {
      config: { presence: { key: currentUser } },
    });

    const syncMembers = () => {
      if (!onRoomMembers) return;
      const state = channel.presenceState() as Record<string, unknown[]>;
      const members = Object.keys(state).filter(
        (k): k is Role => k === 'faiz' || k === 'kenat'
      );
      onRoomMembers(members);
    };

    channel
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'keiz_game' },
        (payload) => {
          if (payload.eventType === 'DELETE') return;
          if (payload.new) {
            const mapped = mapGameRow(payload.new as Record<string, unknown>);
            latestGameState = mapped;
            onGameChange(mapped);
          }
        }
      )
      .on('broadcast', { event: 'game_event' }, ({ payload }) => {
        if (payload) {
          const mapped = mapGameRow(payload as Record<string, unknown>);
          latestGameState = mapped;
          onGameChange(mapped);
        }
      })
      .on('presence', { event: 'sync' }, syncMembers)
      .on('presence', { event: 'join' }, syncMembers)
      .on('presence', { event: 'leave' }, syncMembers)
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          channel
            .track({
              user: currentUser,
              room_code: 'keizbucin',
              joined_at: new Date().toISOString(),
            })
            .catch(() => {});
        }
      });

    activeGameRealtimeChannel = channel;
  };

  setup();
  const unsubReconfig = onSupabaseReconfigured(setup);

  return () => {
    unsubReconfig();
    localChannel?.removeEventListener('message', handleLocal);
    if (activeGameRealtimeChannel && activeClient) {
      activeGameRealtimeChannel.untrack().catch(() => {});
      activeClient.removeChannel(activeGameRealtimeChannel);
      activeGameRealtimeChannel = null;
    }
  };
}

export function subscribeRealtime(callbacks: {
  onChat?: () => void;
  onLagu?: () => void;
  onNobar?: () => void;
  onMusic?: () => void;
  onUnek?: () => void;
  onProfil?: () => void;
  onPostingan?: () => void;
  onAlbum?: () => void;
  onGame?: () => void;
}): () => void {
  const handleChannel = (ev: MessageEvent) => {
    if (ev.data?.type === 'chat_update') callbacks.onChat?.();
    if (ev.data?.type === 'lagu_update') callbacks.onLagu?.();
    if (ev.data?.type === 'keiz_nobar_sync_update') callbacks.onNobar?.();
    if (ev.data?.type === 'keiz_music_sync_update') callbacks.onMusic?.();
    if (ev.data?.type === 'unek_update') callbacks.onUnek?.();
    if (ev.data?.type === 'profil_update') callbacks.onProfil?.();
    if (ev.data?.type === 'postingan_update') callbacks.onPostingan?.();
    if (ev.data?.type === 'album_update') callbacks.onAlbum?.();
    if (ev.data?.type === 'keiz_game_update') callbacks.onGame?.();
  };
  localChannel?.addEventListener('message', handleChannel);

  let sbChannel: RealtimeChannel | null = null;
  const setup = () => {
    const sb = activeClient;
    if (sbChannel && sb) {
      sb.removeChannel(sbChannel);
      sbChannel = null;
    }
    if (!sb) return;
    sbChannel = sb
      .channel(`keiz-bucin-rt-${Math.random().toString(36).slice(2, 6)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'keiz_chat' }, () => callbacks.onChat?.())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'lagu_keiz' }, () => callbacks.onLagu?.())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'keiz_nobar_sync' }, () => callbacks.onNobar?.())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'keiz_music_sync' }, () => callbacks.onMusic?.())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'unek_unek_keiz' }, () => callbacks.onUnek?.())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'users_keiz' }, () => callbacks.onProfil?.())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'postingan_keiz' }, () => callbacks.onPostingan?.())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'keiz_album' }, () => callbacks.onAlbum?.())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'keiz_game' }, () => callbacks.onGame?.())
      .subscribe();
  };

  setup();
  const unsubReconfig = onSupabaseReconfigured(setup);

  return () => {
    unsubReconfig();
    localChannel?.removeEventListener('message', handleChannel);
    if (sbChannel && activeClient) {
      activeClient.removeChannel(sbChannel);
    }
  };
}
