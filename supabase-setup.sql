-- ============================================================
-- KEIZ BUCIN - SUPABASE REALTIME SETUP SQL
-- Copy semua isi file ini -> Supabase -> SQL Editor -> Run
-- ============================================================

-- 1. Tabel Users (Faiz & Kenat)
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

-- 2. Tabel Chat Real-Time
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

-- 3. Tabel Nobar Sync (1 row id=1 untuk pasangan)
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

-- 4. Tabel Music Sync (1 row id=1 untuk pasangan)
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

-- 5. Tabel Live Presence (Faiz & Kenat lagi ngapain)
create table if not exists public.presence_keiz (
  "user" text primary key,
  status text default 'online',
  lagi_ngapain text default 'di Home',
  lagi_play_apa text default '',
  last_seen timestamptz default now()
);

-- 6. Tabel Call Berdua (WebRTC signaling)
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

-- 7. Tabel Postingan Profil
create table if not exists public.postingan_keiz (
  id text primary key,
  author text not null,
  caption text default '',
  image_url text not null,
  created_at timestamptz default now()
);

-- 8. Tabel Album Polaroid (+ bucket 'keiz-album')
create table if not exists public.keiz_album (
  id text primary key,
  author text not null,
  caption text default '',
  image_url text not null,
  storage_path text default '',
  created_at timestamptz default now()
);

-- 9. Tabel Unek-Unek
create table if not exists public.unek_unek_keiz (
  id text primary key,
  author text not null,
  isi text not null,
  mood text default 'Kangen 😭',
  reply text,
  is_anonymous boolean default false,
  created_at timestamptz default now()
);

-- 10. Tabel Antrean Lagu
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

-- 11. Tabel Game Multiplayer (Ular Tangga, Ludo King, Monopoli Couple)
-- Catatan: Tidak membuat tabel user baru; profil & avatar diambil dari tabel profiles / users_keiz yang sudah ada.
create table if not exists public.game_rooms (
  id uuid primary key default gen_random_uuid(),
  room_code text unique not null,
  status text not null default 'waiting' check (status in ('waiting', 'playing', 'finished')),
  current_turn text not null default 'player1' check (current_turn in ('player1', 'player2')),
  winner text,
  created_at timestamptz default now()
);

create table if not exists public.game_players (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.game_rooms(id) on delete cascade,
  player_slot text not null check (player_slot in ('player1', 'player2')),
  name text not null,
  avatar_emoji text not null default 'faiz',
  position int not null default 1,
  is_ready boolean not null default false,
  created_at timestamptz default now(),
  unique (room_id, player_slot)
);

create table if not exists public.game_moves (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.game_rooms(id) on delete cascade,
  player_slot text not null check (player_slot in ('player1', 'player2')),
  dice_value int not null,
  from_pos int not null,
  to_pos int not null,
  event_type text not null default 'normal',
  created_at timestamptz default now()
);

create table if not exists public.game_chats (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.game_rooms(id) on delete cascade,
  player_slot text not null check (player_slot in ('player1', 'player2', 'system')),
  sender_name text not null,
  sender_emoji text not null default 'faiz',
  message text not null,
  created_at timestamptz default now()
);

-- ============================================================
-- ENABLE RLS + POLICY ALLOW ALL (RUANG PRIVAT FAIZ & KENAT)
-- ============================================================
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
alter table public.game_rooms enable row level security;
alter table public.game_players enable row level security;
alter table public.game_moves enable row level security;
alter table public.game_chats enable row level security;

drop policy if exists "allow_all_users_keiz" on public.users_keiz;
create policy "allow_all_users_keiz" on public.users_keiz for all using (true) with check (true);

drop policy if exists "allow_all_keiz_chat" on public.keiz_chat;
create policy "allow_all_keiz_chat" on public.keiz_chat for all using (true) with check (true);

drop policy if exists "allow_all_keiz_nobar_sync" on public.keiz_nobar_sync;
create policy "allow_all_keiz_nobar_sync" on public.keiz_nobar_sync for all using (true) with check (true);

drop policy if exists "allow_all_keiz_music_sync" on public.keiz_music_sync;
create policy "allow_all_keiz_music_sync" on public.keiz_music_sync for all using (true) with check (true);

drop policy if exists "allow_all_keiz_album" on public.keiz_album;
create policy "allow_all_keiz_album" on public.keiz_album for all using (true) with check (true);

drop policy if exists "allow_all_presence_keiz" on public.presence_keiz;
create policy "allow_all_presence_keiz" on public.presence_keiz for all using (true) with check (true);

drop policy if exists "allow_all_call_keiz" on public.call_keiz;
create policy "allow_all_call_keiz" on public.call_keiz for all using (true) with check (true);

drop policy if exists "allow_all_postingan_keiz" on public.postingan_keiz;
create policy "allow_all_postingan_keiz" on public.postingan_keiz for all using (true) with check (true);

drop policy if exists "allow_all_unek_unek_keiz" on public.unek_unek_keiz;
create policy "allow_all_unek_unek_keiz" on public.unek_unek_keiz for all using (true) with check (true);

drop policy if exists "allow_all_lagu_keiz" on public.lagu_keiz;
create policy "allow_all_lagu_keiz" on public.lagu_keiz for all using (true) with check (true);

-- RLS khusus room 2 pemain (hanya pemain di room terkait yang bisa akses game & chat)
drop policy if exists "game_rooms_2player_access" on public.game_rooms;
create policy "game_rooms_2player_access" on public.game_rooms
for all
using (
  status = 'waiting'
  or exists (
    select 1 from public.game_players gp
    where gp.room_id = game_rooms.id
      and gp.player_slot in ('player1', 'player2')
  )
)
with check (
  status in ('waiting', 'playing', 'finished')
);

drop policy if exists "game_players_2player_access" on public.game_players;
create policy "game_players_2player_access" on public.game_players
for all
using (
  player_slot in ('player1', 'player2')
  and exists (
    select 1 from public.game_rooms gr
    where gr.id = game_players.room_id
  )
)
with check (
  player_slot in ('player1', 'player2')
  and (
    select count(*) from public.game_players gp
    where gp.room_id = game_players.room_id
  ) <= 2
);

drop policy if exists "game_moves_room_only" on public.game_moves;
create policy "game_moves_room_only" on public.game_moves
for all
using (
  exists (
    select 1 from public.game_players gp
    where gp.room_id = game_moves.room_id
      and gp.player_slot in ('player1', 'player2')
  )
)
with check (
  exists (
    select 1 from public.game_players gp
    where gp.room_id = game_moves.room_id
      and gp.player_slot = game_moves.player_slot
  )
);

drop policy if exists "game_chats_room_only" on public.game_chats;
create policy "game_chats_room_only" on public.game_chats
for all
using (
  exists (
    select 1 from public.game_players gp
    where gp.room_id = game_chats.room_id
      and gp.player_slot in ('player1', 'player2')
  )
)
with check (
  exists (
    select 1 from public.game_players gp
    where gp.room_id = game_chats.room_id
      and (
        gp.player_slot = game_chats.player_slot
        or game_chats.player_slot = 'system'
      )
  )
);

-- Storage Bucket 'keiz-album'
insert into storage.buckets (id, name, public)
values ('keiz-album', 'keiz-album', true)
on conflict (id) do nothing;

drop policy if exists "allow_all_keiz_album_bucket" on storage.objects;
create policy "allow_all_keiz_album_bucket" on storage.objects
for all using (bucket_id = 'keiz-album') with check (bucket_id = 'keiz-album');

-- ============================================================
-- DATA AWAL WAJIB: 2 USER (FAIZ & KENAT) + ROW SYNC KOSONG
-- ============================================================
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

-- ============================================================
-- AKTIFKAN SUPABASE REALTIME UNTUK SEMUA TABEL
-- ============================================================
do $$
declare
  t text;
begin
  foreach t in array array[
    'users_keiz',
    'keiz_chat',
    'keiz_nobar_sync',
    'keiz_music_sync',
    'keiz_album',
    'presence_keiz',
    'call_keiz',
    'postingan_keiz',
    'unek_unek_keiz',
    'lagu_keiz',
    'game_rooms',
    'game_players',
    'game_moves',
    'game_chats'
  ]
  loop
    begin
      execute format('alter publication supabase_realtime add table public.%I', t);
    exception when duplicate_object then
      null;
    end;
  end loop;
end $$;
