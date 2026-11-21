import React, { useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  Camera,
  ImagePlus,
  LogOut,
  MoreVertical,
  Music2,
  Pause,
  Pencil,
  Play,
  Plus,
  Search,
  Settings,
  Share2,
  Trash2,
  X,
} from 'lucide-react';
import { soundFX } from '../sound';
import { resolveYouTubeVideoId } from '../hooks/useMusicSync';
import {
  addPostingan,
  fetchPostingan,
  saveProfile,
  subscribeRealtime,
} from '../supabaseClient';
import { SupabaseConfigCard } from './SupabaseConfigCard';
import type {
  AppSection,
  CoupleProfile,
  GalleryPhoto,
  Role,
} from '../types';

const PROFIL_SONG_ART_KEY = 'keiz_profil_song_art_v1';

interface ITunesTrack {
  trackId: number;
  trackName: string;
  artistName: string;
  artworkUrl100: string;
}

interface YTProfilPlayer {
  loadVideoById: (videoId: string, startSeconds?: number) => void;
  playVideo: () => void;
  pauseVideo: () => void;
  unMute: () => void;
  setVolume: (vol: number) => void;
  destroy: () => void;
}

function readSongArtMap(): Record<string, string> {
  try {
    const raw = localStorage.getItem(PROFIL_SONG_ART_KEY);
    return raw ? (JSON.parse(raw) as Record<string, string>) : {};
  } catch {
    return {};
  }
}

async function compressImageFile(file: File, maxDim = 960): Promise<string> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
    reader.onerror = () => reject(new Error('Failed to read image'));
    reader.readAsDataURL(file);
  });
  if (!dataUrl || file.type === 'image/svg+xml') return dataUrl;

  return new Promise<string>((resolve) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
      const w = Math.max(1, Math.round(img.width * scale));
      const h = Math.max(1, Math.round(img.height * scale));
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve(dataUrl);
        return;
      }
      ctx.drawImage(img, 0, 0, w, h);
      resolve(canvas.toDataURL('image/jpeg', 0.82));
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}

async function lookupYouTubeVideoId(query: string): Promise<string | null> {
  return resolveYouTubeVideoId(query);
}

interface ProfilViewProps {
  profile: CoupleProfile;
  currentUser: Role;
  onBack: () => void;
  onNavigate: (target: AppSection) => void;
  onUpdateProfile: (next: CoupleProfile) => void;
  onLogout: () => void;
}

export const ProfilView: React.FC<ProfilViewProps> = ({
  profile,
  currentUser,
  onBack,
  onNavigate,
  onUpdateProfile,
  onLogout,
}) => {
  const [showEdit, setShowEdit] = useState(false);
  const [draftName, setDraftName] = useState('');
  const [draftBio, setDraftBio] = useState('');
  const [photoPrompt, setPhotoPrompt] = useState<'avatar' | 'banner' | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  // Song picker + inline playback
  const [showSongPicker, setShowSongPicker] = useState(false);
  const [songQuery, setSongQuery] = useState('');
  const [songResults, setSongResults] = useState<ITunesTrack[]>([]);
  const [songSearching, setSongSearching] = useState(false);
  const [showSongMenu, setShowSongMenu] = useState(false);
  const [songPlaying, setSongPlaying] = useState(false);
  const [songLoading, setSongLoading] = useState(false);
  const [songArtMap, setSongArtMap] = useState<Record<string, string>>(() =>
    readSongArtMap()
  );

  // Real user-uploaded posts from Supabase postingan_keiz (empty until uploaded)
  const [posts, setPosts] = useState<GalleryPhoto[]>([]);
  const [showPostModal, setShowPostModal] = useState(false);
  const [postPhotoUrl, setPostPhotoUrl] = useState('');
  const [postCaption, setPostCaption] = useState('');
  const [showProfilSettings, setShowProfilSettings] = useState(false);

  const avatarFileRef = useRef<HTMLInputElement | null>(null);
  const bannerFileRef = useRef<HTMLInputElement | null>(null);
  const postFileRef = useRef<HTMLInputElement | null>(null);

  const ytHostRef = useRef<HTMLDivElement | null>(null);
  const ytPlayerRef = useRef<YTProfilPlayer | null>(null);
  const ytReadyRef = useRef(false);
  const pendingVidRef = useRef<string | null>(null);
  const loadedSongRef = useRef<string>('');

  const isFaiz = currentUser === 'faiz';
  const myName = isFaiz ? profile.faizName : profile.kenatName;
  const partnerName = isFaiz ? profile.kenatName : profile.faizName;
  const myPhoto = isFaiz ? profile.faizPhoto : profile.kenatPhoto;
  const partnerPhoto = isFaiz ? profile.kenatPhoto : profile.faizPhoto;
  const myBio = isFaiz ? profile.faizBio : profile.kenatBio;
  const mySong = isFaiz ? profile.faizSong : profile.kenatSong;

  const showToastMsg = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2400);
  };

  // Load & subscribe posts in real-time via Supabase postingan_keiz
  useEffect(() => {
    fetchPostingan().then(setPosts);
    const unsub = subscribeRealtime({
      onPostingan: () => {
        fetchPostingan().then(setPosts);
      },
    });
    return unsub;
  }, []);

  // Initialize hidden 1x1 YouTube IFrame player for inline Profil song play
  useEffect(() => {
    let mounted = true;
    const initPlayer = () => {
      if (!mounted || !ytHostRef.current || ytPlayerRef.current || !window.YT?.Player) {
        return;
      }
      ytPlayerRef.current = new window.YT.Player(ytHostRef.current, {
        height: 1,
        width: 1,
        playerVars: {
          autoplay: 1,
          controls: 0,
          rel: 0,
          playsinline: 1,
          enablejsapi: 1,
          origin: window.location.origin,
        },
        events: {
          onReady: (ev) => {
            if (!mounted) return;
            ytReadyRef.current = true;
            try {
              ev.target.unMute();
              ev.target.setVolume(100);
            } catch {
              // ignore
            }
            if (pendingVidRef.current) {
              const id = pendingVidRef.current;
              pendingVidRef.current = null;
              ev.target.loadVideoById(id, 0);
              ev.target.playVideo();
            }
          },
          onStateChange: (ev) => {
            if (!mounted) return;
            if (ev.data === 1) {
              setSongPlaying(true);
              setSongLoading(false);
            } else if (ev.data === 2 || ev.data === 0) {
              setSongPlaying(false);
              setSongLoading(false);
            }
          },
          onError: () => {
            if (!mounted) return;
            setSongPlaying(false);
            setSongLoading(false);
          },
        },
      }) as unknown as YTProfilPlayer;
    };

    if (window.YT?.Player) {
      initPlayer();
    } else {
      const prev = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => {
        prev?.();
        initPlayer();
      };
    }

    return () => {
      mounted = false;
      ytReadyRef.current = false;
      try {
        ytPlayerRef.current?.destroy();
      } catch {
        // ignore
      }
      ytPlayerRef.current = null;
    };
  }, []);

  // Live iTunes search inside Profil song picker modal
  useEffect(() => {
    if (!showSongPicker) return;
    const q = songQuery.trim();
    if (q.length < 2) {
      setSongResults([]);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(async () => {
      setSongSearching(true);
      try {
        const res = await fetch(
          `https://itunes.apple.com/search?term=${encodeURIComponent(
            q
          )}&media=music&entity=song&limit=15`
        );
        const json = (await res.json()) as { results?: ITunesTrack[] };
        if (!cancelled) setSongResults(json.results || []);
      } catch {
        if (!cancelled) setSongResults([]);
      } finally {
        if (!cancelled) setSongSearching(false);
      }
    }, 300);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [songQuery, showSongPicker]);

  const openEditSheet = () => {
    soundFX.playClick();
    setDraftName(myName);
    setDraftBio(myBio);
    setShowEdit(true);
  };

  const handleSelfAvatarSelected = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const compressed = await compressImageFile(file, 720);
    if (!compressed) return;
    soundFX.playHeartBurst();
    const updated: CoupleProfile = isFaiz
      ? { ...profile, faizPhoto: compressed }
      : { ...profile, kenatPhoto: compressed };
    await saveProfile(updated);
    onUpdateProfile(updated);
    setPhotoPrompt(null);
    showToastMsg(`Foto profil ${myName} keganti 💖`);
  };

  const handleBannerSelected = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const compressed = await compressImageFile(file, 1080);
    if (!compressed) return;
    soundFX.playHeartBurst();
    const updated: CoupleProfile = { ...profile, bannerPhoto: compressed };
    await saveProfile(updated);
    onUpdateProfile(updated);
    setPhotoPrompt(null);
    showToastMsg('Foto latar belakang berhasil diganti 💖');
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    soundFX.playHeartBurst();
    const cleanedName = draftName.trim() || (isFaiz ? 'Faiz' : 'Kenat');
    const cleanedBio =
      draftBio.trim() || (isFaiz ? 'pacarnya kenat' : 'pacarnya faiz');
    const updated: CoupleProfile = isFaiz
      ? { ...profile, faizName: cleanedName, faizBio: cleanedBio }
      : { ...profile, kenatName: cleanedName, kenatBio: cleanedBio };
    await saveProfile(updated);
    onUpdateProfile(updated);
    setShowEdit(false);
    showToastMsg(`Profil ${cleanedName} berhasil disimpan 💖`);
  };

  const handleSelectProfileSong = async (track: ITunesTrack) => {
    soundFX.playHeartBurst();
    const label = `${track.trackName} - ${track.artistName}`;
    const art = track.artworkUrl100.replace('100x100', '300x300');
    const nextArt = { ...songArtMap, [currentUser]: art };
    setSongArtMap(nextArt);
    try {
      localStorage.setItem(PROFIL_SONG_ART_KEY, JSON.stringify(nextArt));
    } catch {
      // ignore
    }
    const updated: CoupleProfile = isFaiz
      ? { ...profile, faizSong: label }
      : { ...profile, kenatSong: label };
    await saveProfile(updated);
    onUpdateProfile(updated);
    loadedSongRef.current = '';
    setSongPlaying(false);
    setShowSongPicker(false);
    setSongQuery('');
    setSongResults([]);
    showToastMsg(`Lagu ${myName} dipasang 💖`);
  };

  const handleDeleteProfileSong = async () => {
    soundFX.playClick();
    try {
      ytPlayerRef.current?.pauseVideo();
    } catch {
      // ignore
    }
    setSongPlaying(false);
    setSongLoading(false);
    loadedSongRef.current = '';
    setShowSongMenu(false);

    const nextArt = { ...songArtMap };
    delete nextArt[currentUser];
    setSongArtMap(nextArt);
    try {
      localStorage.setItem(PROFIL_SONG_ART_KEY, JSON.stringify(nextArt));
    } catch {
      // ignore
    }

    const updated: CoupleProfile = isFaiz
      ? { ...profile, faizSong: '' }
      : { ...profile, kenatSong: '' };
    await saveProfile(updated);
    onUpdateProfile(updated);
    showToastMsg('Lagu profil dihapus');
  };

  const handleTogglePlayProfileSong = async () => {
    if (!mySong) return;
    soundFX.playPop();
    const player = ytPlayerRef.current;

    if (songPlaying) {
      try {
        player?.pauseVideo();
      } catch {
        // ignore
      }
      setSongPlaying(false);
      return;
    }

    if (loadedSongRef.current === mySong && player && ytReadyRef.current) {
      try {
        player.unMute();
        player.setVolume(100);
        player.playVideo();
        setSongPlaying(true);
        return;
      } catch {
        // reload below
      }
    }

    setSongLoading(true);
    const vid = await lookupYouTubeVideoId(mySong);
    if (!vid) {
      setSongLoading(false);
      showToastMsg('Lagu lagi susah dimuat, coba sekali lagi ya');
      return;
    }
    loadedSongRef.current = mySong;
    if (player && ytReadyRef.current) {
      try {
        player.unMute();
        player.setVolume(100);
        player.loadVideoById(vid, 0);
        player.playVideo();
        setSongPlaying(true);
      } catch {
        setSongLoading(false);
      }
    } else {
      pendingVidRef.current = vid;
    }
  };

  const handlePostFilePick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const compressed = await compressImageFile(file, 900);
    if (compressed) setPostPhotoUrl(compressed);
  };

  const handleCreatePost = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!postPhotoUrl) return;
    soundFX.playHeartBurst();
    const saved = await addPostingan({
      author: currentUser,
      caption: postCaption.trim() || 'momen gemes kita berdua 💖',
      image_url: postPhotoUrl,
    });
    if (saved) {
      setPosts((prev) => [saved, ...prev.filter((p) => p.id !== saved.id)]);
    }
    setPostPhotoUrl('');
    setPostCaption('');
    setShowPostModal(false);
    showToastMsg('Postingan baru berhasil dipajang 💖');
  };

  const handleShareProfile = () => {
    soundFX.playPop();
    const shareText = `KEIZ BUCIN · ${myName} (Pasangannya ${partnerName}) · Tanggal pacaran 28 Agustus 2026`;
    navigator.clipboard?.writeText(shareText).catch(() => {});
    showToastMsg('Info profil disalin ke clipboard 💖');
  };

  const currentSongArt = songArtMap[currentUser];

  return (
    <div
      onClick={() => {
        if (showSongMenu) setShowSongMenu(false);
      }}
      className="animate-slide-in-right flex flex-col gap-3 pb-8"
    >
      {/* Hidden 1x1 YouTube Player for inline Profil song playback */}
      <div
        style={{
          width: '1px',
          height: '1px',
          opacity: 0,
          position: 'absolute',
          pointerEvents: 'none',
          overflow: 'hidden',
        }}
      >
        <div id="profil-yt-player" ref={ytHostRef} />
      </div>

      {/* Hidden Direct File Inputs */}
      <input
        ref={avatarFileRef}
        type="file"
        accept="image/*"
        onChange={handleSelfAvatarSelected}
        className="hidden"
      />
      <input
        ref={bannerFileRef}
        type="file"
        accept="image/*"
        onChange={handleBannerSelected}
        className="hidden"
      />
      <input
        ref={postFileRef}
        type="file"
        accept="image/*"
        onChange={handlePostFilePick}
        className="hidden"
      />

      {/* Top Bar: < | Profil Faiz / Profil Kenat | Edit + Settings */}
      <div className="flex h-12 items-center justify-between">
        <button
          type="button"
          onClick={onBack}
          aria-label="Kembali"
          className="btn-bucin flex h-10 w-10 items-center justify-center rounded-full border border-[#FFD6E7] bg-white text-[#2D0A1E] cursor-pointer"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <h2 className="font-display text-[18px] font-extrabold text-[#2D0A1E]">
          Profil {myName}
        </h2>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => {
              soundFX.playClick();
              setShowProfilSettings(true);
            }}
            aria-label="Settings Supabase"
            className="btn-bucin flex h-10 w-10 items-center justify-center rounded-full border border-[#FFD6E7] bg-white text-[#8A6A7A] cursor-pointer"
          >
            <Settings className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={openEditSheet}
            aria-label="Edit profil"
            className="btn-bucin flex h-10 w-10 items-center justify-center rounded-full border border-[#FFD6E7] bg-white text-[#E91E7A] cursor-pointer"
          >
            <Pencil className="h-4 w-4" />
          </button>
        </div>
      </div>

      {toast && (
        <div className="animate-bubble-pop rounded-full border border-pink-200 bg-white px-4 py-2 text-center text-xs font-extrabold text-[#D81B6E] shadow-md">
          {toast}
        </div>
      )}

      {/* Main Profile Card */}
      <div className="keiz-sticker-card overflow-hidden bg-white">
        {/* Tappable Banner Photo + Camera Pill Top-Right */}
        <div
          onClick={() => {
            soundFX.playClick();
            setPhotoPrompt('banner');
          }}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter') setPhotoPrompt('banner');
          }}
          className="group relative h-[148px] w-full overflow-hidden cursor-pointer"
        >
          <img
            src={profile.bannerPhoto}
            alt="Foto latar profil"
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-[#FF2E7E]/55 via-[#FF7AB8]/25 to-transparent" />

          {/* Top-right camera pill + Tap buat ganti latar */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              soundFX.playClick();
              setPhotoPrompt('banner');
            }}
            className="btn-bucin absolute right-2.5 top-2.5 z-10 inline-flex items-center gap-1.5 rounded-full bg-black/45 px-2.5 py-1 text-[10px] font-bold text-white backdrop-blur-sm cursor-pointer"
          >
            <Camera className="h-3.5 w-3.5" />
            <span>Tap buat ganti latar</span>
          </button>

          <svg
            viewBox="0 0 240 80"
            className="pointer-events-none absolute inset-0 h-full w-full opacity-45"
          >
            <path
              d="M30 35 C30 35 20 28 20 22 C20 18 23 16 26 16 C28 16 29.5 17 30 18.5 C30.5 17 32 16 34 16 C37 16 40 18 40 22 C40 28 30 35 30 35 Z"
              fill="none"
              stroke="#FFFFFF"
              strokeWidth="2"
            />
            <path
              d="M205 28 C205 28 197 22 197 17 C197 14 199.5 12 202 12 C203.5 12 204.5 13 205 14 C205.5 13 206.5 12 208 12 C210.5 12 213 14 213 17 C213 22 205 28 205 28 Z"
              fill="none"
              stroke="#FFFFFF"
              strokeWidth="2"
            />
          </svg>
        </div>

        <div className="px-4 pb-5">
          {/* Self BIG photo (AKU + Camera button) & Partner SMALL photo (PASANGAN, read-only) */}
          <div className="-mt-12 flex items-end gap-3.5">
            <button
              type="button"
              onClick={() => {
                soundFX.playClick();
                setPhotoPrompt('avatar');
              }}
              aria-label="Ganti Foto Profil"
              className="btn-bucin relative cursor-pointer"
            >
              <img
                src={myPhoto}
                alt={myName}
                className={`h-[88px] w-[88px] rounded-full border-4 bg-white object-cover shadow-lg ${
                  isFaiz ? 'border-[#3B82F6]' : 'border-[#FF4D8D]'
                }`}
              />
              <span
                className={`absolute -bottom-1.5 left-1/2 -translate-x-1/2 rounded-full border-2 border-white px-2.5 py-0.5 text-[9px] font-extrabold text-white shadow ${
                  isFaiz ? 'bg-[#3B82F6]' : 'bg-[#FF4D8D]'
                }`}
              >
                AKU
              </span>
              {/* Small camera icon bottom-right of AKU photo */}
              <span
                className="absolute bottom-0 right-0 flex h-7 w-7 items-center justify-center rounded-full border-2 border-white bg-[#2D0A1E] text-white shadow-md"
                aria-hidden="true"
              >
                <Camera className="h-3.5 w-3.5" />
              </span>
            </button>

            {/* Partner photo — strictly read-only */}
            <div className="relative pb-0.5">
              <img
                src={partnerPhoto}
                alt={partnerName}
                className={`h-[54px] w-[54px] rounded-full border-[3px] bg-white object-cover shadow-md ${
                  isFaiz ? 'border-[#FF4D8D]' : 'border-[#3B82F6]'
                }`}
              />
              <span
                className={`absolute -bottom-1.5 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full border-2 border-white px-2 py-0.5 text-[8px] font-extrabold text-white shadow ${
                  isFaiz ? 'bg-[#FF4D8D]' : 'bg-[#3B82F6]'
                }`}
              >
                PASANGAN
              </span>
            </div>
          </div>

          {/* Name + Pasangannya + Bio + Tanggal Pacaran */}
          <div className="mt-4">
            <h3 className="font-display text-[24px] font-extrabold leading-tight text-[#2D0A1E]">
              {myName}
            </h3>
            <span
              className={`mt-1 inline-block rounded-full px-3 py-1 text-[11px] font-extrabold ${
                isFaiz
                  ? 'bg-[#EFF6FF] text-[#2563EB]'
                  : 'bg-[#FFE3EE] text-[#D81B6E]'
              }`}
            >
              Pasangannya {partnerName}
            </span>

            <div className="mt-2.5 flex items-center justify-between gap-2">
              <p className="text-[13px] font-semibold text-[#5C3A49]">
                {myBio}
              </p>
              <button
                type="button"
                onClick={openEditSheet}
                aria-label="Edit bio"
                className="shrink-0 rounded-full p-1.5 text-[#E91E7A] hover:bg-[#FFF2F7] cursor-pointer"
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
            </div>
            <p className="mt-1 text-[11px] font-bold text-[#9A7A8A]">
              Tanggal pacaran 28 Agustus 2026
            </p>
          </div>

          {/* Card Lagu Faiz / Lagu Kenat (Kosong Awalnya, Pilih Manual + Ganti/Hapus) */}
          <div className="relative mt-4 rounded-[18px] border border-[#FFD6E7] bg-[#FFE9F1] p-3.5">
            {mySong ? (
              <div className="flex items-center gap-3">
                {currentSongArt ? (
                  <img
                    src={currentSongArt}
                    alt={mySong}
                    referrerPolicy="no-referrer"
                    className={`h-11 w-11 shrink-0 rounded-xl object-cover shadow-sm ${
                      songPlaying ? 'animate-pulse' : ''
                    }`}
                  />
                ) : (
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[#FF2E7E] to-[#FF7AB8] text-white shadow-sm">
                    <Music2 className="h-5 w-5" />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] font-extrabold tracking-wider text-[#E91E7A]">
                    LAGU {myName.toUpperCase()}
                  </p>
                  <p className="truncate text-[13px] font-extrabold text-[#2D0A1E]">
                    {mySong}
                  </p>
                  {(songPlaying || songLoading) && (
                    <p className="text-[10px] font-bold text-[#FF2E7E]">
                      {songLoading ? 'Memuat...' : 'Memutar lagu profil...'}
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={handleTogglePlayProfileSong}
                  aria-label={songPlaying ? 'Pause lagu profil' : 'Putar lagu profil'}
                  className="btn-bucin flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#FF2E7E] text-white shadow cursor-pointer"
                >
                  {songPlaying ? (
                    <Pause className="h-4 w-4" />
                  ) : (
                    <Play className="ml-0.5 h-4 w-4" />
                  )}
                </button>
                <div className="relative">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      soundFX.playClick();
                      setShowSongMenu((v) => !v);
                    }}
                    aria-label="Menu lagu profil"
                    className="flex h-8 w-8 items-center justify-center rounded-full bg-white/80 text-[#6E5460] shadow-sm cursor-pointer"
                  >
                    <MoreVertical className="h-4 w-4" />
                  </button>
                  {showSongMenu && (
                    <div
                      onClick={(e) => e.stopPropagation()}
                      className="animate-bubble-pop absolute right-0 top-9 z-20 w-36 overflow-hidden rounded-2xl border border-[#FFD6E7] bg-white py-1 shadow-xl"
                    >
                      <button
                        type="button"
                        onClick={() => {
                          setShowSongMenu(false);
                          setShowSongPicker(true);
                        }}
                        className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-bold text-[#2D0A1E] hover:bg-[#FFF2F7] cursor-pointer"
                      >
                        <Music2 className="h-3.5 w-3.5 text-[#E91E7A]" />
                        <span>Ganti Lagu</span>
                      </button>
                      <button
                        type="button"
                        onClick={handleDeleteProfileSong}
                        className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-bold text-rose-600 hover:bg-rose-50 cursor-pointer"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        <span>Hapus Lagu</span>
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] font-extrabold tracking-wider text-[#E91E7A]">
                    LAGU {myName.toUpperCase()}
                  </p>
                  <p className="mt-0.5 text-xs font-bold text-[#5C3A49]">
                    Belum ada lagu
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    soundFX.playPop();
                    setShowSongPicker(true);
                  }}
                  className="btn-bucin inline-flex shrink-0 items-center gap-1 rounded-full bg-gradient-to-r from-[#FF2E7E] to-[#FF7AB8] px-3.5 py-2 text-xs font-extrabold text-white shadow-sm cursor-pointer"
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span>Tambah Lagu</span>
                </button>
              </div>
            )}
          </div>

          {/* Section Postingan (Kosong awalnya, upload manual baru muncul grid) */}
          <div className="mt-5 border-t border-[#FFD6E7] pt-4">
            <div className="mb-2.5 flex items-center justify-between">
              <h4 className="text-[15px] font-extrabold text-[#2D0A1E]">
                Postingan
              </h4>
              {posts.length > 0 && (
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      soundFX.playClick();
                      setShowPostModal(true);
                    }}
                    className="text-xs font-extrabold text-[#3B82F6] cursor-pointer"
                  >
                    + Tambah
                  </button>
                  <button
                    type="button"
                    onClick={() => onNavigate('galeri')}
                    className="text-xs font-extrabold text-[#E91E7A] cursor-pointer"
                  >
                    Lihat Album →
                  </button>
                </div>
              )}
            </div>

            {posts.length === 0 ? (
              <div className="rounded-[20px] border border-[#EDE6EA] bg-[#F7F3F5] p-6 text-center">
                <Camera className="mx-auto h-9 w-9 text-[#B4A0AA]" />
                <p className="mt-2.5 text-sm font-extrabold text-[#2D0A1E]">
                  Belum ada postingan
                </p>
                <p className="mt-1 text-xs font-semibold text-[#8A6A7A]">
                  Momen pertama kalian bakal muncul di sini.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    soundFX.playPop();
                    setPostPhotoUrl('');
                    setPostCaption('');
                    setShowPostModal(true);
                  }}
                  className="keiz-btn-primary btn-bucin mt-3.5 inline-flex min-h-[42px] items-center gap-1.5 px-5 text-xs cursor-pointer"
                >
                  <Plus className="h-4 w-4" />
                  <span>Buat Postingan Pertama</span>
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2.5">
                {posts.slice(0, 6).map((p, idx) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => onNavigate('galeri')}
                    className={`btn-bucin relative aspect-[4/3] overflow-hidden rounded-2xl border border-[#FFD6E7] shadow-sm cursor-pointer ${
                      idx % 2 === 0 ? '-rotate-1' : 'rotate-1'
                    }`}
                  >
                    <img
                      src={p.url}
                      alt={p.caption}
                      className="h-full w-full object-cover"
                    />
                    <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 to-transparent px-2.5 py-2 text-left">
                      <p className="line-clamp-1 text-[11px] font-bold text-white">
                        {p.caption}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Bottom Action Row: Keluar / Ganti Akun (gray) + Bagikan Profil (pink) */}
      <div className="grid grid-cols-2 gap-3 pt-1">
        <button
          type="button"
          onClick={() => {
            soundFX.playClick();
            onLogout();
          }}
          className="btn-bucin flex min-h-[48px] items-center justify-center gap-1.5 rounded-full border border-[#E5D3DC] bg-white px-4 text-xs font-extrabold text-[#6E5460] shadow-sm cursor-pointer"
        >
          <LogOut className="h-4 w-4" />
          <span>Keluar / Ganti Akun</span>
        </button>
        <button
          type="button"
          onClick={handleShareProfile}
          className="keiz-btn-primary btn-bucin flex min-h-[48px] items-center justify-center gap-1.5 px-4 text-xs cursor-pointer"
        >
          <Share2 className="h-4 w-4" />
          <span>Bagikan Profil</span>
        </button>
      </div>

      {/* Popup: Ganti Foto Profil / Ganti Foto Latar */}
      {photoPrompt && (
        <div
          onClick={() => setPhotoPrompt(null)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#2D0A1E]/55 p-4 backdrop-blur-sm"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="animate-slide-up-bounce w-full max-w-[350px] rounded-[24px] border border-[#FFD6E7] bg-white p-5 text-center shadow-2xl"
          >
            <h3 className="font-display text-lg font-extrabold text-[#2D0A1E]">
              {photoPrompt === 'avatar'
                ? 'Ganti Foto Profil'
                : 'Ganti Foto Latar'}
            </h3>
            <p className="mt-1 text-xs font-semibold text-[#8A6A7A]">
              {photoPrompt === 'avatar'
                ? `Pilih foto baru buat profil ${myName} dari galeri HP`
                : 'Pilih foto latar belakang baru dari galeri HP'}
            </p>
            <div className="mt-4 flex justify-center">
              <img
                src={photoPrompt === 'avatar' ? myPhoto : profile.bannerPhoto}
                alt="Preview saat ini"
                className={
                  photoPrompt === 'avatar'
                    ? 'h-24 w-24 rounded-full border-4 border-[#FFD6E7] object-cover shadow'
                    : 'h-28 w-full rounded-2xl border-2 border-[#FFD6E7] object-cover shadow'
                }
              />
            </div>
            <div className="mt-4 flex flex-col gap-2">
              <button
                type="button"
                onClick={() => {
                  soundFX.playClick();
                  if (photoPrompt === 'avatar') {
                    avatarFileRef.current?.click();
                  } else {
                    bannerFileRef.current?.click();
                  }
                }}
                className="keiz-btn-primary btn-bucin flex min-h-[46px] w-full items-center justify-center gap-2 text-xs cursor-pointer"
              >
                <ImagePlus className="h-4 w-4" />
                <span>Pilih Foto dari Galeri</span>
              </button>
              <button
                type="button"
                onClick={() => setPhotoPrompt(null)}
                className="btn-bucin min-h-[42px] w-full rounded-full border border-[#FFD6E7] bg-[#FFF2F7] text-xs font-extrabold text-[#8A6A7A] cursor-pointer"
              >
                Batal
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Popup: Tambah / Ganti Lagu (iTunes Search) */}
      {showSongPicker && (
        <div
          onClick={() => setShowSongPicker(false)}
          className="fixed inset-0 z-50 flex items-end justify-center bg-[#2D0A1E]/55 backdrop-blur-sm sm:items-center sm:p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="animate-slide-up-bounce flex max-h-[82vh] w-full max-w-[430px] flex-col rounded-t-[28px] border border-[#FFD6E7] bg-white p-5 shadow-2xl sm:rounded-[28px]"
          >
            <div className="flex items-center justify-between">
              <h3 className="font-display text-lg font-extrabold text-[#2D0A1E]">
                Pilih Lagu {myName}
              </h3>
              <button
                type="button"
                onClick={() => setShowSongPicker(false)}
                aria-label="Tutup"
                className="flex h-8 w-8 items-center justify-center rounded-full bg-[#FFF2F7] text-[#8A6A7A] cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-3 flex items-center gap-2 rounded-full border border-[#FFD6E7] bg-[#FFF2F7] px-3.5 py-2.5">
              <Search className="h-4 w-4 shrink-0 text-[#8A6A7A]" />
              <input
                type="text"
                autoFocus
                value={songQuery}
                onChange={(e) => setSongQuery(e.target.value)}
                placeholder="Cari judul lagu atau penyanyi..."
                className="w-full bg-transparent text-xs font-semibold text-[#2D0A1E] placeholder-[#9A7A8A] focus:outline-none"
              />
              {songQuery && (
                <button
                  type="button"
                  onClick={() => setSongQuery('')}
                  className="text-[#8A6A7A] cursor-pointer"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>

            <div className="mt-3 flex-1 space-y-2 overflow-y-auto pr-0.5">
              {songQuery.trim().length < 2 ? (
                <p className="py-8 text-center text-xs font-semibold text-[#8A6A7A]">
                  Ketik judul lagu atau nama penyanyi buat dipasang di profil
                </p>
              ) : songSearching ? (
                <p className="py-8 text-center text-xs font-extrabold text-[#E91E7A]">
                  Lagi nyariin lagunya...
                </p>
              ) : songResults.length === 0 ? (
                <p className="py-8 text-center text-xs font-semibold text-[#8A6A7A]">
                  Gak ketemu lagunya, coba kata kunci lain ya
                </p>
              ) : (
                songResults.map((track) => (
                  <button
                    key={track.trackId}
                    type="button"
                    onClick={() => handleSelectProfileSong(track)}
                    className="btn-bucin flex w-full items-center gap-3 rounded-2xl border border-[#FFD6E7] bg-[#FFF8FA] p-2.5 text-left hover:bg-[#FFE9F1] cursor-pointer"
                  >
                    <img
                      src={track.artworkUrl100}
                      alt={track.trackName}
                      referrerPolicy="no-referrer"
                      className="h-12 w-12 shrink-0 rounded-xl object-cover shadow-sm"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-extrabold text-[#2D0A1E]">
                        {track.trackName}
                      </p>
                      <p className="truncate text-[11px] font-semibold text-[#8A6A7A]">
                        {track.artistName}
                      </p>
                    </div>
                    <span className="rounded-full bg-[#FF2E7E] px-3 py-1 text-[10px] font-extrabold text-white">
                      Pilih
                    </span>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Popup: Upload Postingan Pertama */}
      {showPostModal && (
        <div
          onClick={() => setShowPostModal(false)}
          className="fixed inset-0 z-50 flex items-end justify-center bg-[#2D0A1E]/55 backdrop-blur-sm sm:items-center sm:p-4"
        >
          <form
            onClick={(e) => e.stopPropagation()}
            onSubmit={handleCreatePost}
            className="animate-slide-up-bounce w-full max-w-[400px] rounded-t-[28px] border border-[#FFD6E7] bg-white p-5 shadow-2xl sm:rounded-[28px]"
          >
            <div className="flex items-center justify-between">
              <h3 className="font-display text-lg font-extrabold text-[#2D0A1E]">
                Buat Postingan
              </h3>
              <button
                type="button"
                onClick={() => setShowPostModal(false)}
                aria-label="Tutup"
                className="flex h-8 w-8 items-center justify-center rounded-full bg-[#FFF2F7] text-[#8A6A7A] cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <button
              type="button"
              onClick={() => postFileRef.current?.click()}
              className="mt-4 flex h-44 w-full flex-col items-center justify-center overflow-hidden rounded-2xl border-2 border-dashed border-[#FFD6E7] bg-[#FFF8FA] text-[#8A6A7A] cursor-pointer"
            >
              {postPhotoUrl ? (
                <img
                  src={postPhotoUrl}
                  alt="Preview postingan"
                  className="h-full w-full object-cover"
                />
              ) : (
                <>
                  <ImagePlus className="h-8 w-8 text-[#E91E7A]" />
                  <span className="mt-2 text-xs font-extrabold text-[#2D0A1E]">
                    Pilih Foto dari Galeri HP
                  </span>
                </>
              )}
            </button>

            <input
              type="text"
              value={postCaption}
              onChange={(e) => setPostCaption(e.target.value)}
              placeholder="Tulis caption momen kalian..."
              className="mt-3 min-h-[44px] w-full rounded-2xl border border-[#FFD6E7] bg-[#FFF2F7] px-3.5 text-xs font-semibold text-[#2D0A1E] placeholder-[#9A7A8A] focus:outline-none"
            />

            <div className="mt-4 grid grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={() => setShowPostModal(false)}
                className="btn-bucin min-h-[46px] rounded-full border border-[#FFD6E7] bg-[#FFF2F7] text-xs font-extrabold text-[#8A6A7A] cursor-pointer"
              >
                Batal
              </button>
              <button
                type="submit"
                disabled={!postPhotoUrl}
                className="keiz-btn-primary btn-bucin min-h-[46px] text-xs disabled:opacity-45 cursor-pointer"
              >
                Posting 💖
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Bottom Sheet: Edit Nama & Bio (Top-Right Pencil) */}
      {showEdit && (
        <div
          onClick={() => setShowEdit(false)}
          className="fixed inset-0 z-50 flex items-end justify-center bg-[#2D0A1E]/45 backdrop-blur-sm sm:items-center sm:p-4"
        >
          <form
            onClick={(e) => e.stopPropagation()}
            onSubmit={handleSaveEdit}
            className="animate-slide-up-bounce max-h-[88vh] w-full max-w-[430px] overflow-y-auto rounded-t-[28px] border border-[#FFD6E7] bg-white p-5 shadow-2xl sm:rounded-[28px]"
          >
            <div className="mx-auto mb-3 h-1.5 w-12 rounded-full bg-pink-200 sm:hidden" />
            <div className="flex items-center justify-between">
              <h3 className="font-display text-lg font-extrabold text-[#2D0A1E]">
                Edit Profil {myName}
              </h3>
              <button
                type="button"
                onClick={() => setShowEdit(false)}
                className="flex h-8 w-8 items-center justify-center rounded-full bg-[#FFF2F7] text-[#8A6A7A] cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-4 space-y-3">
              <div>
                <label className="text-[11px] font-bold text-[#8A6A7A]">
                  Nama {myName}
                </label>
                <input
                  type="text"
                  value={draftName}
                  onChange={(e) => setDraftName(e.target.value)}
                  className="mt-1 min-h-[42px] w-full rounded-xl border border-[#FFD6E7] bg-[#FFF2F7] px-3 text-xs font-bold text-[#2D0A1E] focus:outline-none"
                />
              </div>

              <div>
                <label className="text-[11px] font-bold text-[#8A6A7A]">
                  Bio {myName}
                </label>
                <input
                  type="text"
                  value={draftBio}
                  onChange={(e) => setDraftBio(e.target.value)}
                  className="mt-1 min-h-[42px] w-full rounded-xl border border-[#FFD6E7] bg-[#FFF2F7] px-3 text-xs text-[#2D0A1E] focus:outline-none"
                />
              </div>
            </div>

            <div className="mt-5 grid grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={() => setShowEdit(false)}
                className="btn-bucin min-h-[48px] rounded-full border border-[#FFD6E7] bg-[#FFF2F7] text-xs font-extrabold text-[#8A6A7A] cursor-pointer"
              >
                Batal
              </button>
              <button
                type="submit"
                className="keiz-btn-primary btn-bucin min-h-[48px] text-xs cursor-pointer"
              >
                Simpan 💖
              </button>
            </div>
          </form>
        </div>
      )}
      {/* Popup: Profil -> Settings (Cek Koneksi Supabase + Copy Link Web Vercel) */}
      {showProfilSettings && (
        <div
          onClick={() => setShowProfilSettings(false)}
          className="fixed inset-0 z-50 flex items-end justify-center bg-[#2D0A1E]/45 p-4 backdrop-blur-sm sm:items-center"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="keiz-card animate-bubble-pop max-h-[88vh] w-full max-w-[395px] space-y-3 overflow-y-auto bg-white p-5"
          >
            <div className="flex items-center justify-between">
              <h3 className="font-display text-base font-extrabold text-[#2D0A1E]">
                Settings Profil &amp; Supabase
              </h3>
              <button
                type="button"
                onClick={() => setShowProfilSettings(false)}
                className="flex h-8 w-8 items-center justify-center rounded-full bg-[#FFF2F7] text-[#8A6A7A] cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <SupabaseConfigCard />
          </div>
        </div>
      )}
    </div>
  );
};
