import React, { useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  Headphones,
  Heart,
  Pause,
  Play,
  Plus,
  Search,
  Share2,
  SkipBack,
  SkipForward,
  X,
  Youtube,
} from 'lucide-react';
import { isPresenceOnline, sendChatMessage } from '../supabaseClient';
import { soundFX } from '../sound';
import type {
  CoupleProfile,
  MusicSyncState,
  PresenceState,
  Role,
  SongItem,
} from '../types';

interface ITunesResult {
  trackId: number;
  trackName: string;
  artistName: string;
  artworkUrl100: string;
  trackTimeMillis?: number;
}

function formatMs(ms: number): string {
  const sec = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s < 10 ? '0' : ''}${s}`;
}

function formatSec(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return `${m}:${rem < 10 ? '0' : ''}${rem}`;
}

interface LaguViewProps {
  currentUser: Role;
  profile: CoupleProfile;
  partnerPresence: PresenceState | null;
  queue: SongItem[];
  history: SongItem[];
  musicSync: MusicSyncState | null;
  activeSong: SongItem | null;
  isPlaying: boolean;
  loadingAudio: boolean;
  needsUnmute: boolean;
  currentTime: number;
  duration: number;
  musicRoomMembers: Role[];
  onPlaySong: (song: SongItem) => Promise<boolean | undefined>;
  onTogglePlayPause: () => void;
  onSeek: (seconds: number) => void;
  onJoinLive: () => void;
  onForceUnmute: () => void;
  onPrevNext: (dir: -1 | 1) => void;
  onAddToQueue: (song: SongItem) => Promise<SongItem | null>;
  onRemoveFromQueue: (id: string) => Promise<void>;
  onToggleFavorite: (id: string) => Promise<void>;
  onBack: () => void;
  onGoChat: () => void;
}

export const LaguView: React.FC<LaguViewProps> = ({
  currentUser,
  profile,
  partnerPresence,
  queue,
  history,
  musicSync,
  activeSong,
  isPlaying,
  loadingAudio,
  needsUnmute,
  currentTime,
  duration,
  musicRoomMembers,
  onPlaySong,
  onTogglePlayPause,
  onSeek,
  onJoinLive,
  onForceUnmute,
  onPrevNext,
  onAddToQueue,
  onRemoveFromQueue,
  onToggleFavorite,
  onBack,
  onGoChat,
}) => {
  const [tab, setTab] = useState<'antrean' | 'favorit' | 'riwayat'>('antrean');
  const [search, setSearch] = useState('');
  const [searchResults, setSearchResults] = useState<SongItem[]>([]);
  const [searching, setSearching] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const searchInputRef = useRef<HTMLInputElement | null>(null);

  const partnerRole: Role = currentUser === 'faiz' ? 'kenat' : 'faiz';
  const partnerName =
    partnerRole === 'kenat' ? profile.kenatName : profile.faizName;
  const partnerPhoto =
    partnerRole === 'kenat' ? profile.kenatPhoto : profile.faizPhoto;

  const partnerOnline = isPresenceOnline(partnerPresence);
  const partnerInMusic =
    musicRoomMembers.includes(partnerRole) ||
    (partnerOnline &&
      (partnerPresence?.lagi_ngapain === 'di Musik' ||
        partnerPresence?.lagi_play_apa?.startsWith('🎵 ')));

  // iTunes Search API ONLY for cover, title, artist & real full duration
  useEffect(() => {
    let cancelled = false;
    const q = search.trim();
    if (q.length < 2) {
      setSearchResults([]);
      return;
    }

    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(
          `https://itunes.apple.com/search?term=${encodeURIComponent(
            q
          )}&media=music&entity=song&limit=20`
        );
        const json = (await res.json()) as { results?: ITunesResult[] };
        if (cancelled) return;
        const mapped: SongItem[] = (json.results || []).map((r) => ({
          id: `itunes-${r.trackId}`,
          title: r.trackName,
          artist: r.artistName,
          artwork: r.artworkUrl100.replace('100x100', '300x300'),
          youtube_query: `${r.trackName} ${r.artistName}`,
          duration_ms:
            r.trackTimeMillis && r.trackTimeMillis > 40000
              ? r.trackTimeMillis
              : 213000,
          added_by: currentUser,
          favorite: false,
        }));
        setSearchResults(mapped);
      } catch {
        if (!cancelled) setSearchResults([]);
      } finally {
        if (!cancelled) setSearching(false);
      }
    }, 300);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [search, currentUser]);

  const handlePlayNowClick = async (song: SongItem) => {
    const ok = await onPlaySong(song);
    if (ok === false) {
      setToast('Lagu lagi susah dimuat, coba klik sekali lagi ya');
      setTimeout(() => setToast(null), 2200);
    }
  };

  const handleAddClick = async (song: SongItem) => {
    await onAddToQueue(song);
    setToast('Ditambah ke antrean');
    setTimeout(() => setToast(null), 2000);
  };

  const handleShareSongToChat = async () => {
    if (!activeSong) return;
    soundFX.playHeartBurst();
    const url =
      activeSong.youtube_video_id || musicSync?.videoId
        ? `https://www.youtube.com/watch?v=${
            activeSong.youtube_video_id || musicSync?.videoId
          }`
        : '';
    await sendChatMessage(
      currentUser,
      `Lagi muter "${activeSong.title} - ${activeSong.artist}", dengerin bareng yuk! 🎵 ${url}`,
      { type: 'music_link' }
    );
    setToast(`Lagu dikirim ke chat ${partnerName} 🎵`);
    setTimeout(() => setToast(null), 2200);
  };

  const displayedQueue =
    tab === 'favorit'
      ? queue.filter((q) => q.favorite)
      : tab === 'riwayat'
      ? history
      : queue;

  const youtubeWatchUrl =
    activeSong?.youtube_video_id || musicSync?.videoId
      ? `https://www.youtube.com/watch?v=${
          activeSong?.youtube_video_id || musicSync?.videoId
        }`
      : activeSong
      ? `https://www.youtube.com/results?search_query=${encodeURIComponent(
          `${activeSong.title} ${activeSong.artist}`
        )}`
      : 'https://www.youtube.com';

  const syncActorName = musicSync
    ? musicSync.updated_by === 'faiz'
      ? profile.faizName
      : profile.kenatName
    : partnerName;

  return (
    <div className="animate-slide-in-right flex flex-col gap-3.5 pb-8">
      {/* Header + Partner Live Avatar Status */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={onBack}
            aria-label="Kembali"
            className="btn-bucin flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[#FFD6E7] bg-white text-[#2D0A1E] cursor-pointer"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div>
            <h2 className="font-display text-[20px] font-extrabold leading-tight text-[#2D0A1E]">
              Musik Berdua
            </h2>
            <p className="text-[11px] font-semibold text-[#8A6A7A]">
              Play, pause &amp; detik langsung sync berdua
            </p>
          </div>
        </div>

        {/* Partner Avatar + Live Music Status */}
        <div className="flex items-center gap-2 rounded-full border border-[#FFD6E7] bg-white px-2.5 py-1 shadow-sm">
          <div className="relative shrink-0">
            <img
              src={partnerPhoto}
              alt={partnerName}
              className={`h-7 w-7 rounded-full border-2 object-cover ${
                partnerRole === 'kenat' ? 'border-[#FF4D8D]' : 'border-[#3B82F6]'
              }`}
            />
            <span
              className={`absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border border-white ${
                partnerInMusic
                  ? 'bg-emerald-500'
                  : partnerOnline
                  ? 'bg-emerald-400'
                  : 'bg-slate-300'
              }`}
            />
          </div>
          <span className="max-w-[125px] truncate text-[10px] font-extrabold text-[#2D0A1E]">
            {partnerInMusic
              ? isPlaying || partnerPresence?.lagi_play_apa?.startsWith('🎵 ')
                ? `${partnerName} dengerin 🟢`
                : `${partnerName} di Musik`
              : partnerOnline
              ? `${partnerName} ${partnerPresence?.lagi_ngapain || 'online'}`
              : `${partnerName} offline`}
          </span>
        </div>
      </div>

      {toast && (
        <div className="animate-bubble-pop rounded-full border border-[#FFD6E7] bg-white px-4 py-2 text-center text-xs font-extrabold text-[#D81B6E] shadow">
          {toast}
        </div>
      )}

      {/* Card "Lagi Dengerin Bareng" */}
      {musicSync?.videoId && (
        <div className="keiz-card flex items-center justify-between gap-2.5 border border-[#FFD6E7] bg-white px-3.5 py-2.5">
          <div className="flex min-w-0 items-center gap-2.5">
            {musicSync.thumbnail ? (
              <img
                src={musicSync.thumbnail}
                alt={musicSync.title}
                referrerPolicy="no-referrer"
                className="h-10 w-10 shrink-0 rounded-xl object-cover shadow-sm"
              />
            ) : (
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#FFE3EE] text-[#FF2E7E]">
                <Headphones className="h-5 w-5" />
              </div>
            )}
            <div className="min-w-0">
              <p className="text-[10px] font-extrabold tracking-wider text-[#E91E7A]">
                LAGI DENGERIN BARENG
              </p>
              <p className="truncate text-xs font-extrabold text-[#2D0A1E]">
                {musicSync.title}
              </p>
              <p className="truncate text-[10px] font-semibold text-[#8A6A7A]">
                {syncActorName} lagi {musicSync.is_playing ? 'Play' : 'Pause'} •{' '}
                {formatSec(currentTime)}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onJoinLive}
            className="btn-bucin shrink-0 rounded-full bg-gradient-to-r from-[#FF2E7E] to-[#FF7AB8] px-3.5 py-1.5 text-[11px] font-extrabold text-white shadow cursor-pointer"
          >
            Ikut Dengerin
          </button>
        </div>
      )}

      {/* Top Player Card */}
      <div className="keiz-sticker-card relative bg-gradient-to-r from-[#FFE9F1] to-[#F0EFFF] p-4">
        {/* Tiny YouTube corner icon */}
        {activeSong && (
          <a
            href={youtubeWatchUrl}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Buka di YouTube"
            title="Buka di YouTube"
            className="absolute right-3 top-3 flex h-7 w-7 items-center justify-center rounded-full bg-white/80 text-[#8A6A7A] shadow-sm hover:text-[#FF2E7E]"
          >
            <Youtube className="h-3.5 w-3.5" />
          </a>
        )}

        <div className="flex items-center gap-3.5 pr-7">
          {/* Spinning Vinyl Artwork */}
          <div
            className={`relative h-16 w-16 shrink-0 overflow-hidden rounded-full border-2 border-white bg-gradient-to-tr from-[#FF7AB8] to-[#FDE68A] shadow-md ${
              isPlaying ? 'animate-vinyl-spin' : ''
            }`}
          >
            {activeSong?.artwork && (
              <img
                src={activeSong.artwork}
                alt={activeSong.title}
                referrerPolicy="no-referrer"
                className="h-full w-full object-cover"
              />
            )}
            <div className="absolute left-1/2 top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-[#FFE9F1]" />
          </div>

          <div className="min-w-0 flex-1">
            <h3 className="truncate text-[16px] font-extrabold text-[#2D0A1E]">
              {activeSong ? activeSong.title : 'Belum ada lagu nih'}
            </h3>
            <p className="truncate text-[12px] font-medium text-[#8A6A7A]">
              {activeSong ? activeSong.artist : 'Cari lagu di bawah lalu tekan Play'}
            </p>
            <div className="mt-1 flex flex-wrap items-center gap-1.5">
              <span className="text-[10px] font-extrabold text-[#E91E7A]">
                Sync Berdua · Bunyi di sini
              </span>
              {(isPlaying || loadingAudio) && (
                <span className="inline-flex items-center gap-1 rounded-full bg-white/85 px-2 py-0.5 text-[10px] font-extrabold text-[#FF2E7E]">
                  <span>{loadingAudio ? 'Memuat...' : 'Memutar...'}</span>
                  <span className="inline-flex h-2.5 items-end gap-[2px]">
                    <span className="animate-typing-dot-1 h-2.5 w-[2.5px] rounded-full bg-[#FF2E7E]" />
                    <span className="animate-typing-dot-2 h-2.5 w-[2.5px] rounded-full bg-[#3B82F6]" />
                    <span className="animate-typing-dot-3 h-2.5 w-[2.5px] rounded-full bg-[#FF2E7E]" />
                  </span>
                </span>
              )}
            </div>
          </div>

          {activeSong && (
            <button
              type="button"
              onClick={() => onToggleFavorite(activeSong.id)}
              aria-label="Favorit"
              className="btn-bucin flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white shadow-sm cursor-pointer"
            >
              <Heart
                className={`h-4 w-4 ${
                  activeSong.favorite
                    ? 'fill-[#FF2E7E] text-[#FF2E7E]'
                    : 'text-[#8A6A7A]'
                }`}
              />
            </button>
          )}
        </div>

        {/* Fallback Nyalakan Suara pill if browser blocked unmute */}
        {needsUnmute && (
          <div className="mt-2.5 flex justify-center">
            <button
              type="button"
              onClick={onForceUnmute}
              className="btn-bucin inline-flex items-center gap-1.5 rounded-full bg-[#FF2E7E] px-4 py-1.5 text-xs font-extrabold text-white shadow cursor-pointer"
            >
              <Play className="h-3.5 w-3.5" />
              <span>Nyalakan Suara</span>
            </button>
          </div>
        )}

        {/* Draggable Full-Duration Progress Bar */}
        <div className="mt-4">
          <input
            type="range"
            min={0}
            max={duration || 213}
            value={Math.min(currentTime, duration || 213)}
            onChange={(e) => onSeek(Number(e.target.value))}
            className="h-1.5 w-full cursor-pointer accent-[#FF2E7E]"
          />
          <div className="mt-1 flex justify-between text-[11px] font-bold tabular-nums text-[#8A6A7A]">
            <span>{formatSec(currentTime)}</span>
            <span>{formatSec(duration)}</span>
          </div>
        </div>

        {/* Center Controls: Prev | Big Play/Pause | Next | Share / Chat */}
        <div className="mt-3 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => onPrevNext(-1)}
              aria-label="Sebelumnya"
              className="btn-bucin flex h-10 w-10 items-center justify-center rounded-full bg-white text-[#2D0A1E] shadow-sm cursor-pointer"
            >
              <SkipBack className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={onTogglePlayPause}
              aria-label={isPlaying ? 'Pause' : 'Play'}
              className="btn-bucin flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-r from-[#FF2E7E] to-[#FF7AB8] text-white shadow-md shadow-pink-500/30 cursor-pointer"
            >
              {isPlaying ? (
                <Pause className="h-5 w-5" />
              ) : (
                <Play className="ml-0.5 h-5 w-5" />
              )}
            </button>
            <button
              type="button"
              onClick={() => onPrevNext(1)}
              aria-label="Selanjutnya"
              className="btn-bucin flex h-10 w-10 items-center justify-center rounded-full bg-white text-[#2D0A1E] shadow-sm cursor-pointer"
            >
              <SkipForward className="h-4 w-4" />
            </button>
          </div>

          <div className="flex items-center gap-1.5">
            {activeSong && (
              <button
                type="button"
                onClick={handleShareSongToChat}
                title="Kirim lagu ke chat"
                className="btn-bucin flex h-9 items-center gap-1 rounded-full bg-[#3B82F6] px-3 text-[11px] font-extrabold text-white shadow-sm cursor-pointer"
              >
                <Share2 className="h-3.5 w-3.5" />
                <span>Share</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                soundFX.playClick();
                onGoChat();
              }}
              className="btn-bucin h-9 rounded-full border border-[#FFD6E7] bg-white px-3.5 text-[11px] font-extrabold text-[#2D0A1E] shadow-sm cursor-pointer"
            >
              Chat
            </button>
          </div>
        </div>
      </div>

      {/* Tab Pills */}
      <div className="grid grid-cols-3 gap-1.5 rounded-full border border-[#FFD6E7] bg-white p-1">
        <button
          type="button"
          onClick={() => {
            soundFX.playClick();
            setTab('antrean');
          }}
          className={`min-h-[38px] rounded-full text-xs font-extrabold cursor-pointer ${
            tab === 'antrean' ? 'bg-[#FF2E7E] text-white' : 'text-[#8A6A7A]'
          }`}
        >
          Antrean ({queue.length})
        </button>
        <button
          type="button"
          onClick={() => {
            soundFX.playClick();
            setTab('favorit');
          }}
          className={`min-h-[38px] rounded-full text-xs font-extrabold cursor-pointer ${
            tab === 'favorit' ? 'bg-[#FF2E7E] text-white' : 'text-[#8A6A7A]'
          }`}
        >
          Favorit
        </button>
        <button
          type="button"
          onClick={() => {
            soundFX.playClick();
            setTab('riwayat');
          }}
          className={`min-h-[38px] rounded-full text-xs font-extrabold cursor-pointer ${
            tab === 'riwayat' ? 'bg-[#FF2E7E] text-white' : 'text-[#8A6A7A]'
          }`}
        >
          Riwayat
        </button>
      </div>

      {/* Search Bar */}
      <div className="keiz-card flex items-center gap-2.5 bg-white px-4 py-3">
        <Search className="h-4 w-4 shrink-0 text-[#8A6A7A]" />
        <input
          ref={searchInputRef}
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Cari lagu - ketik judul / penyanyi..."
          className="w-full bg-transparent text-xs font-semibold text-[#2D0A1E] placeholder-[#9A7A8A] focus:outline-none"
        />
        {search && (
          <button
            type="button"
            onClick={() => setSearch('')}
            className="text-[#8A6A7A] cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Live Search Results */}
      {search.trim().length >= 2 && (
        <div className="keiz-card bg-white p-3.5">
          <p className="mb-2 text-[11px] font-extrabold text-[#E91E7A]">
            {searching ? 'lagi nyariin lagu buat kalian...' : 'Hasil pencarian lagu'}
          </p>
          <div className="space-y-2.5">
            {searchResults.map((item) => (
              <div
                key={item.id}
                className="flex items-center gap-3 rounded-2xl border border-[#FFD6E7] bg-[#FFF8FA] p-2.5"
              >
                <img
                  src={item.artwork}
                  alt={item.title}
                  referrerPolicy="no-referrer"
                  className="h-14 w-14 shrink-0 rounded-xl object-cover shadow-sm"
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-extrabold text-[#2D0A1E]">
                    {item.title}
                  </p>
                  <p className="truncate text-[11px] text-[#8A6A7A]">
                    {item.artist} · {formatMs(item.duration_ms)}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => handlePlayNowClick(item)}
                    aria-label="Play"
                    className="btn-bucin flex h-9 items-center gap-1 rounded-full bg-[#FF2E7E] px-3 text-[11px] font-extrabold text-white shadow cursor-pointer"
                  >
                    <Play className="h-3 w-3" /> PLAY
                  </button>
                  <button
                    type="button"
                    onClick={() => handleAddClick(item)}
                    aria-label="Tambah ke antrean"
                    className="btn-bucin flex h-9 items-center gap-1 rounded-full bg-[#3B82F6] px-3 text-[11px] font-extrabold text-white shadow cursor-pointer"
                  >
                    <Plus className="h-3 w-3" /> TAMBAH
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Queue / Favorit / Riwayat List or Empty State */}
      {displayedQueue.length === 0 ? (
        <div className="keiz-card bg-white p-6 text-center">
          <p className="text-xs font-extrabold text-[#5C3A49]">
            {tab === 'antrean'
              ? 'Belum ada lagu nih, cari lagu pertama kita'
              : tab === 'favorit'
              ? 'Belum ada lagu favorit, tap ikon hati di lagu ya'
              : 'Belum ada riwayat putar lagu'}
          </p>
          <button
            type="button"
            onClick={() => {
              soundFX.playClick();
              searchInputRef.current?.focus();
            }}
            className="keiz-btn-primary btn-bucin mt-3 min-h-[42px] px-5 text-xs cursor-pointer"
          >
            Cari Lagu
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {displayedQueue.map((song) => {
            const isCurrent = activeSong?.title === song.title;
            return (
              <div
                key={song.id}
                className={`keiz-card flex items-center gap-3 bg-white p-3 ${
                  isCurrent ? 'ring-2 ring-[#FF2E7E]' : ''
                }`}
              >
                <button
                  type="button"
                  onClick={() => handlePlayNowClick(song)}
                  className="flex min-w-0 flex-1 items-center gap-3 text-left cursor-pointer"
                >
                  <img
                    src={song.artwork}
                    alt={song.title}
                    referrerPolicy="no-referrer"
                    className="h-12 w-12 shrink-0 rounded-xl object-cover shadow-sm"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-extrabold text-[#2D0A1E]">
                      {song.title}
                    </p>
                    <p className="truncate text-[11px] text-[#8A6A7A]">
                      {song.artist} · {formatMs(song.duration_ms)}
                    </p>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => onToggleFavorite(song.id)}
                  className="p-1.5 cursor-pointer"
                  aria-label="Favorit"
                >
                  <Heart
                    className={`h-4 w-4 ${
                      song.favorite
                        ? 'fill-[#FF2E7E] text-[#FF2E7E]'
                        : 'text-[#8A6A7A]'
                    }`}
                  />
                </button>

                {tab === 'antrean' && (
                  <button
                    type="button"
                    onClick={() => onRemoveFromQueue(song.id)}
                    className="p-1.5 text-[#8A6A7A] hover:text-rose-600 cursor-pointer"
                    aria-label="Hapus dari antrean"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
