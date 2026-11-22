import { createClient, type RealtimeChannel, type SupabaseClient } from '@supabase/supabase-js';
import type {
  CallState,
  ChatMessage,
  CoupleProfile,
  GalleryPhoto,
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
      message: 'Gagal ❌ — URL atau Anon Key Supabase belum diisi.',
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
        message: 'Terhubung ✅',
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
        message: 'Terhubung ✅ (jalankan supabase-setup.sql di SQL Editor Supabase)',
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
        message: 'Gagal ❌ — Anon Key Supabase ditolak.',
        checkedAt: Date.now(),
      };
    }

    if (error.code === 'TIMEOUT') {
      return {
        status: 'error',
        ok: false,
        message: 'Gagal ❌ — Koneksi ke Supabase timeout.',
        checkedAt: Date.now(),
      };
    }

    return {
      status: 'error',
      ok: false,
      message: `Gagal ❌ — ${error.message}`,
      checkedAt: Date.now(),
    };
  } catch {
    return {
      status: 'error',
      ok: false,
      message: 'Gagal ❌ — Tidak bisa menghubungi server Supabase.',
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
      message: 'Gagal ❌ — URL atau Anon Key Supabase belum diisi.',
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
      sb.from('nobar_sync').select('id').eq('id', 1).maybeSingle(),
      sb.from('music_sync').select('id').eq('id', 1).maybeSingle(),
    ]);

    if (!nobarRes.error && !nobarRes.data) {
      await sb.from('nobar_sync').upsert([
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
      await sb.from('music_sync').upsert([
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

create table if not exists public.chat (
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

create table if not exists public.nobar_sync (
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

create table if not exists public.music_sync (
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
  mood text default 'Kangen 😭',
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

alter table public.users_keiz enable row level security;
alter table public.chat enable row level security;
alter table public.nobar_sync enable row level security;
alter table public.music_sync enable row level security;
alter table public.presence_keiz enable row level security;
alter table public.call_keiz enable row level security;
alter table public.postingan_keiz enable row level security;
alter table public.unek_unek_keiz enable row level security;
alter table public.lagu_keiz enable row level security;

create policy "allow_all_users_keiz" on public.users_keiz for all using (true) with check (true);
create policy "allow_all_chat" on public.chat for all using (true) with check (true);
create policy "allow_all_nobar_sync" on public.nobar_sync for all using (true) with check (true);
create policy "allow_all_music_sync" on public.music_sync for all using (true) with check (true);
create policy "allow_all_presence_keiz" on public.presence_keiz for all using (true) with check (true);
create policy "allow_all_call_keiz" on public.call_keiz for all using (true) with check (true);
create policy "allow_all_postingan_keiz" on public.postingan_keiz for all using (true) with check (true);
create policy "allow_all_unek_unek_keiz" on public.unek_unek_keiz for all using (true) with check (true);
create policy "allow_all_lagu_keiz" on public.lagu_keiz for all using (true) with check (true);

insert into public.users_keiz (id, username, password_hash, nama, foto_profil, foto_latar, bio, lagu_profil)
values
  ('faiz', 'faiz', 'faizkece18070528', 'Faiz', '/src/assets/images/avatar_faiz_1795263046125.jpg', '', 'pacarnya kenat, paling sayang sama yang gemes', ''),
  ('kenat', 'kenat', 'kenatgemaz07180528', 'Kenat', '/src/assets/images/avatar_kenat_1795263046413.jpg', '', 'pacarnya faiz, cantik sedunia no debat', '')
on conflict (id) do nothing;

insert into public.nobar_sync (id, youtube_url, "videoId", title, is_playing, "current_time", playback_rate, updated_by, action)
values (1, '', '', '', false, 0, 1, 'Faiz', 'change_video')
on conflict (id) do nothing;

insert into public.music_sync (id, youtube_url, "videoId", title, artist, thumbnail, duration_ms, is_playing, "current_time", updated_by, action)
values (1, '', '', '', '', '', 213000, false, 0, 'Faiz', 'change_song')
on conflict (id) do nothing;

alter publication supabase_realtime add table public.users_keiz, public.chat, public.nobar_sync, public.music_sync, public.presence_keiz, public.call_keiz, public.postingan_keiz, public.unek_unek_keiz, public.lagu_keiz;`;

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

export const DEFAULT_PROFILE: CoupleProfile = {
  faizName: 'Faiz',
  kenatName: 'Kenat',
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
        faizName: String(faizRow?.nama || DEFAULT_PROFILE.faizName),
        kenatName: String(kenatRow?.nama || DEFAULT_PROFILE.kenatName),
        faizPhoto: String(faizRow?.foto_profil || DEFAULT_PROFILE.faizPhoto),
        kenatPhoto: String(kenatRow?.foto_profil || DEFAULT_PROFILE.kenatPhoto),
        faizBanner: sanitizeUserBanner(
          faizRow?.foto_latar ?? faizRow?.cover_photo ?? faizRow?.latar_foto
        ),
        kenatBanner: sanitizeUserBanner(
          kenatRow?.foto_latar ?? kenatRow?.cover_photo ?? kenatRow?.latar_foto
        ),
        faizBio: String(faizRow?.bio || DEFAULT_PROFILE.faizBio),
        kenatBio: String(kenatRow?.bio || DEFAULT_PROFILE.kenatBio),
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
function mapPostinganRow(row: Record<string, unknown>, idx = 0): GalleryPhoto {
  const author = toRole(row.author, 'faiz');
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
    url: String(row.image_url ?? ''),
    caption: String(row.caption ?? ''),
    dateLabel,
    tag: 'berdua',
    created_at: row.created_at ? String(row.created_at) : undefined,
  };
}

export async function fetchPostingan(): Promise<GalleryPhoto[]> {
  const sb = activeClient;
  if (!sb) return [];
  try {
    const { data, error } = await sb
      .from('postingan_keiz')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(100);
    if (error) {
      if (error.code !== '42P01') {
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
}): Promise<GalleryPhoto | null> {
  const newPost: GalleryPhoto = {
    id: `post-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    author: payload.author,
    url: payload.image_url,
    caption: payload.caption.trim() || 'momen gemes kita berdua 💖',
    dateLabel: 'baru aja',
    tag: 'berdua',
    created_at: new Date().toISOString(),
  };

  const sb = activeClient;
  if (sb) {
    try {
      const { error } = await sb.from('postingan_keiz').insert([
        {
          id: newPost.id,
          author: toDbUserName(payload.author),
          caption: newPost.caption,
          image_url: newPost.url,
          created_at: newPost.created_at,
        },
      ]);
      if (error) {
        emitSupabaseError('Gagal upload postingan ke Supabase!');
      }
    } catch {
      emitSupabaseError('Gagal upload postingan ke Supabase!');
    }
  }
  localChannel?.postMessage({ type: 'postingan_update', payload: newPost });
  return newPost;
}

export async function deletePostingan(id: string): Promise<void> {
  const sb = activeClient;
  if (sb) {
    try {
      await sb.from('postingan_keiz').delete().eq('id', id);
    } catch {
      // ignore
    }
  }
  localChannel?.postMessage({ type: 'postingan_update' });
}

// ---------- CHAT BUCIN (tabel: chat) ----------
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
            spec?.definitions?.chat?.properties ??
            spec?.components?.schemas?.chat?.properties;
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

    // 2. Cek 1 row contoh dari tabel chat & users_keiz ID
    try {
      const [{ data: sampleRows }, { data: userRows }] = await Promise.all([
        sb.from('chat').select('*').limit(1),
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
        'chat',
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
        row.chat ??
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

export async function fetchChats(): Promise<ChatMessage[]> {
  const sb = activeClient;
  if (!sb) return [];
  try {
    void discoverChatSchema(sb);
    const { data, error } = await sb
      .from('chat')
      .select('*')
      .order('created_at', { ascending: true })
      .limit(200);
    if (error) {
      console.error(
        '[KEIZ Chat fetchChats error]',
        error.message,
        error.details,
        error.hint,
        error.code
      );
      if (error.code !== '42P01') {
        void checkSupabaseConnection();
      }
      return [];
    }
    return Array.isArray(data)
      ? data.map((row, idx) => mapChatRow(row as Record<string, unknown>, idx))
      : [];
  } catch (err) {
    console.error('[KEIZ Chat fetchChats exception]', err);
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
    return {
      ...newMsg,
      sending: false,
      failed: true,
      errorDetails: 'Supabase belum terhubung',
    };
  }

  try {
    const schema = await discoverChatSchema(sb);
    const senderVal = formatSenderForDb(sender, schema);
    const receiverVal = formatSenderForDb(receiver, schema);

    const candidatePayload: Record<string, unknown> = {};
    if (schema) {
      if (schema.columns.has('id') && !schema.idIsInt) {
        candidatePayload.id = newMsg.id;
      }
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
      // Fallback jika OpenAPI schema tidak tersedia: kirim kolom inti minimal
      candidatePayload.id = newMsg.id;
      candidatePayload.sender = senderVal;
      candidatePayload.receiver = receiverVal;
      candidatePayload.message = newMsg.message;
      candidatePayload.created_at = newMsg.created_at;
    }

    let attemptPayload = { ...candidatePayload };
    let insertedRow: Record<string, unknown> | null = null;
    let lastError: {
      message?: string;
      details?: string;
      hint?: string;
      code?: string;
    } | null = null;

    for (let attempt = 0; attempt < 6; attempt++) {
      const { data, error } = await sb
        .from('chat')
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
      const missingColMatch =
        errMsg.match(/Could not find the '([^']+)' column/i) ||
        errMsg.match(/column "([^"]+)" of relation "chat" does not exist/i);

      if (missingColMatch?.[1] && missingColMatch[1] in attemptPayload) {
        const badCol = missingColMatch[1];
        delete attemptPayload[badCol];
        cachedChatSchema?.columns.delete(badCol);
        continue;
      }

      // Jika id format gagal (misal id auto-increment integer atau tipe beda), coba tanpa id
      if (
        'id' in attemptPayload &&
        (errMsg.toLowerCase().includes('invalid input syntax') ||
          errMsg.toLowerCase().includes('generated always'))
      ) {
        delete attemptPayload.id;
        continue;
      }

      break;
    }

    if (lastError || !insertedRow) {
      console.error(
        '[KEIZ Chat INSERT error]',
        lastError?.message,
        lastError?.details,
        lastError?.hint,
        lastError?.code
      );
      emitSupabaseError('Gagal kirim chat ke Supabase!');
      return {
        ...newMsg,
        sending: false,
        failed: true,
        errorDetails: lastError?.message || 'Gagal menyimpan chat ke Supabase',
      };
    }

    const mapped = mapChatRow(insertedRow);
    const savedMsg: ChatMessage = {
      ...newMsg,
      ...mapped,
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
    console.error('[KEIZ Chat INSERT exception]', err);
    emitSupabaseError('Gagal kirim chat ke Supabase!');
    return {
      ...newMsg,
      sending: false,
      failed: true,
      errorDetails: err instanceof Error ? err.message : 'Gagal kirim chat',
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
      .from('chat')
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
      const schema = await discoverChatSchema(sb);
      if (!schema || schema.columns.has('react')) {
        const { error } = await sb
          .from('chat')
          .update({ react: react ?? null })
          .eq('id', id);
        if (error) {
          console.error(
            '[KEIZ Chat react error]',
            error.message,
            error.details,
            error.hint,
            error.code
          );
        }
      }
    } catch (err) {
      console.error('[KEIZ Chat react exception]', err);
    }
  }
  localChannel?.postMessage({ type: 'chat_update' });
  return fetchChats();
}

export async function deleteChatMessage(id: string): Promise<ChatMessage[]> {
  const sb = activeClient;
  if (sb) {
    try {
      const schema = await discoverChatSchema(sb);
      if (schema && !schema.columns.has('is_deleted')) {
        const { error } = await sb.from('chat').delete().eq('id', id);
        if (error) {
          console.error(
            '[KEIZ Chat delete error]',
            error.message,
            error.details,
            error.hint,
            error.code
          );
        }
      } else {
        const { error } = await sb
          .from('chat')
          .update({ is_deleted: true })
          .eq('id', id);
        if (error) {
          console.error(
            '[KEIZ Chat soft-delete error]',
            error.message,
            error.details,
            error.hint,
            error.code
          );
        }
      }
    } catch (err) {
      console.error('[KEIZ Chat delete exception]', err);
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
      .channel(`chat_rt_${Math.random().toString(36).slice(2, 7)}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'chat' },
        (payload) => {
          onInsert(mapChatRow(payload.new as Record<string, unknown>));
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'chat' },
        (payload) => {
          onUpdate(mapChatRow(payload.new as Record<string, unknown>));
        }
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'chat' },
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
            id: newSong.id,
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
      if (!error && data) {
        newSong.id = String(data.id ?? newSong.id);
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

// ---------- NOBAR SYNC REAL-TIME (tabel: nobar_sync, id = 1) ----------
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
      .from('nobar_sync')
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

  localChannel?.postMessage({ type: 'nobar_sync_update', payload: nextState });

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
      const { error } = await sb.from('nobar_sync').upsert([
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
  localChannel?.postMessage({ type: 'nobar_sync_update', payload: null });

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
      await sb.from('nobar_sync').upsert([
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
    if (ev.data?.type === 'nobar_sync_update') {
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
      .channel('nobar_sync', {
        config: {
          presence: { key: currentUser },
        },
      })
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'nobar_sync' },
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

// ---------- MUSIC SYNC REAL-TIME (tabel: music_sync, id = 1) ----------
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
      .from('music_sync')
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

  localChannel?.postMessage({ type: 'music_sync_update', payload: nextState });

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
      const { error } = await sb.from('music_sync').upsert([
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
    if (ev.data?.type === 'music_sync_update') {
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
      .channel('music_sync', {
        config: {
          presence: { key: currentUser },
        },
      })
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'music_sync' },
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
let activePresenceChannel: RealtimeChannel | null = null;

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
  localChannel?.postMessage({ type: 'presence_update', payload: state });

  if (activePresenceChannel) {
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

  const sb = activeClient;
  if (sb) {
    try {
      await sb.from('presence_keiz').upsert([
        {
          user: toDbUserName(state.user),
          status: state.status,
          lagi_ngapain: state.lagi_ngapain,
          lagi_play_apa: state.lagi_play_apa,
          last_seen: state.last_seen,
        },
      ]);
    } catch {
      // ignore
    }
  }
}

export function subscribePresence(
  currentUser: Role,
  onPresenceMap: (map: Record<Role, PresenceState | null>) => void
): () => void {
  const latest: Record<Role, PresenceState | null> = { faiz: null, kenat: null };

  fetchAllPresence().then((initial) => {
    latest.faiz = initial.faiz;
    latest.kenat = initial.kenat;
    onPresenceMap({ ...latest });
  });

  const handleLocal = (ev: MessageEvent) => {
    if (ev.data?.type === 'presence_update' && ev.data.payload) {
      const st = ev.data.payload as PresenceState;
      latest[st.user] = st;
      onPresenceMap({ ...latest });
    }
  };
  localChannel?.addEventListener('message', handleLocal);

  const setup = () => {
    const sb = activeClient;
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
          onPresenceMap({ ...latest });
        }
      )
      .on('presence', { event: 'sync' }, () => {
        const pState = ch.presenceState();
        (['Faiz', 'Kenat', 'faiz', 'kenat'] as const).forEach((k) => {
          const arr = pState[k] as Record<string, unknown>[] | undefined;
          if (arr && arr.length > 0) {
            const first = arr[0];
            const role = toRole(k);
            latest[role] = {
              user: role,
              status: 'online',
              lagi_ngapain:
                (first.lagi_ngapain as PresenceActivity) || 'di Home',
              lagi_play_apa: String(first.lagi_play_apa ?? ''),
              last_seen: String(first.last_seen ?? new Date().toISOString()),
            };
          }
        });
        onPresenceMap({ ...latest });
      })
      .on('presence', { event: 'leave' }, ({ key }) => {
        const role = toRole(key);
        if (role !== currentUser && latest[role]) {
          latest[role] = {
            ...latest[role]!,
            status: 'offline',
            last_seen: new Date().toISOString(),
          };
          onPresenceMap({ ...latest });
        }
      })
      .subscribe();

    activePresenceChannel = ch;
  };

  setup();
  const unsubReconfig = onSupabaseReconfigured(setup);

  return () => {
    unsubReconfig();
    localChannel?.removeEventListener('message', handleLocal);
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

  localChannel?.postMessage({ type: 'call_update', payload: callObj });

  const sb = activeClient;
  if (sb) {
    try {
      await sb.from('call_keiz').insert([
        {
          id: callObj.id,
          caller: toDbUserName(caller),
          callee: toDbUserName(callee),
          status: 'ringing',
          offer: offerSdp,
          voice_effect: 'normal',
          created_at: callObj.created_at,
        },
      ]);
    } catch {
      emitSupabaseError('Gagal nyambungin Call ke Supabase!');
    }
  }
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
  is_anonymous?: boolean;
}): Promise<UnekItem> {
  const newItem: UnekItem = {
    id: `unek-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
    author: item.author,
    text: item.text,
    is_anonymous: Boolean(item.is_anonymous ?? false),
    createdAt: 'baru aja',
  };

  const sb = activeClient;
  if (sb) {
    try {
      const { data, error } = await sb
        .from('unek_unek_keiz')
        .insert([
          {
            id: newItem.id,
            author: toDbUserName(item.author),
            isi: item.text,
            is_anonymous: Boolean(item.is_anonymous ?? false),
            created_at: new Date().toISOString(),
          },
        ])
        .select()
        .single();
      if (error) {
        emitSupabaseError('Gagal kirim unek-unek ke Supabase!');
      } else if (data) {
        newItem.id = String(data.id ?? newItem.id);
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

export function subscribeRealtime(callbacks: {
  onChat?: () => void;
  onLagu?: () => void;
  onNobar?: () => void;
  onUnek?: () => void;
  onProfil?: () => void;
  onPostingan?: () => void;
}): () => void {
  const handleChannel = (ev: MessageEvent) => {
    if (ev.data?.type === 'chat_update') callbacks.onChat?.();
    if (ev.data?.type === 'lagu_update') callbacks.onLagu?.();
    if (ev.data?.type === 'nobar_sync_update') callbacks.onNobar?.();
    if (ev.data?.type === 'unek_update') callbacks.onUnek?.();
    if (ev.data?.type === 'profil_update') callbacks.onProfil?.();
    if (ev.data?.type === 'postingan_update') callbacks.onPostingan?.();
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
      .on('postgres_changes', { event: '*', schema: 'public', table: 'chat' }, () => callbacks.onChat?.())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'lagu_keiz' }, () => callbacks.onLagu?.())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'nobar_sync' }, () => callbacks.onNobar?.())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'unek_unek_keiz' }, () => callbacks.onUnek?.())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'users_keiz' }, () => callbacks.onProfil?.())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'postingan_keiz' }, () => callbacks.onPostingan?.())
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
