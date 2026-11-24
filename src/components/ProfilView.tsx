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
  fetchProfile,
  saveProfile,
  subscribeRealtime,
  uploadImageToKeizStorage,
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

async function compressImageBlob(file: File, maxDim = 1080): Promise<Blob> {
  if (
    file.type === 'image/svg+xml' ||
    file.type === 'image/gif' ||
    file.size <= 350 * 1024
  ) {
    return file;
  }

  return new Promise<Blob>((resolve) => {
    let objectUrl = '';
    try {
      objectUrl = URL.createObjectURL(file);
    } catch {
      resolve(file);
      return;
    }

    const img = new Image();
    img.onload = () => {
      try {
        const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
        const w = Math.max(1, Math.round(img.width * scale));
        const h = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          URL.revokeObjectURL(objectUrl);
          resolve(file);
          return;
        }
        ctx.drawImage(img, 0, 0, w, h);
        canvas.toBlob(
          (blob) => {
            URL.revokeObjectURL(objectUrl);
            resolve(blob && blob.size > 0 ? blob : file);
          },
          'image/jpeg',
          0.84
        );
      } catch {
        URL.revokeObjectURL(objectUrl);
        resolve(file);
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(file);
    };
    img.src = objectUrl;
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
  // Active profile tab: AKU (currentUser) or PASANGAN (partnerRole)
  const [viewingRole, setViewingRole] = useState<Role>(currentUser);

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
  const [postFile, setPostFile] = useState<File | null>(null);
  const [postPreviewUrl, setPostPreviewUrl] = useState('');
  const [postCaption, setPostCaption] = useState('');
  const [postUploading, setPostUploading] = useState(false);
  const [postError, setPostError] = useState<string | null>(null);
  const [photoUploading, setPhotoUploading] = useState(false);
  const [photoUploadError, setPhotoUploadError] = useState<string | null>(null);
  const [showProfilSettings, setShowProfilSettings] = useState(false);

  const ytHostRef = useRef<HTMLDivElement | null>(null);
  const ytPlayerRef = useRef<YTProfilPlayer | null>(null);
  const ytReadyRef = useRef(false);
  const pendingVidRef = useRef<string | null>(null);
  const loadedSongRef = useRef<string>('');
  const onUpdateProfileRef = useRef(onUpdateProfile);
  onUpdateProfileRef.current = onUpdateProfile;

  useEffect(() => {
    setViewingRole(currentUser);
  }, [currentUser]);

  const isFaiz = currentUser === 'faiz';
  const partnerRole: Role = isFaiz ? 'kenat' : 'faiz';
  const isViewingSelf = viewingRole === currentUser;

  // Own profile info (used in AKU avatar & edit modals)
  const myName = isFaiz ? profile.faizName : profile.kenatName;
  const myPhoto = isFaiz ? profile.faizPhoto : profile.kenatPhoto;
  const myBanner = isFaiz ? profile.faizBanner : profile.kenatBanner;
  const myBio = isFaiz ? profile.faizBio : profile.kenatBio;

  // Partner avatar info (always shown on right PASANGAN circle)
  const partnerName = isFaiz ? profile.kenatName : profile.faizName;
  const partnerPhoto = isFaiz ? profile.kenatPhoto : profile.faizPhoto;

  // Viewed profile info (switches cleanly between AKU and PASANGAN)
  const viewedIsFaiz = viewingRole === 'faiz';
  const viewedName = viewedIsFaiz ? profile.faizName : profile.kenatName;
  const viewedPartnerName = viewedIsFaiz ? profile.kenatName : profile.faizName;
  const viewedPhoto = viewedIsFaiz ? profile.faizPhoto : profile.kenatPhoto;
  const viewedBanner = viewedIsFaiz ? profile.faizBanner : profile.kenatBanner;
  const viewedBio = viewedIsFaiz ? profile.faizBio : profile.kenatBio;
  const viewedSong = viewedIsFaiz ? profile.faizSong : profile.kenatSong;

  const viewedPosts = posts.filter((p) => (p.author || 'faiz') === viewingRole);

  const showToastMsg = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2400);
  };

  const handleSwitchProfile = (targetRole: Role) => {
    if (targetRole === viewingRole) return;
    soundFX.playPop();
    try {
      ytPlayerRef.current?.pauseVideo();
    } catch {
      // ignore
    }
    setSongPlaying(false);
    setSongLoading(false);
    loadedSongRef.current = '';
    setShowSongMenu(false);
    setShowEdit(false);
    setPhotoPrompt(null);
    setViewingRole(targetRole);
    void fetchProfile().then((next) => onUpdateProfileRef.current(next));
  };

  // Load & subscribe posts & profile in real-time via Supabase
  useEffect(() => {
    void fetchProfile().then((next) => onUpdateProfileRef.current(next));
    void fetchPostingan().then(setPosts);
    const unsub = subscribeRealtime({
      onPostingan: () => {
        void fetchPostingan().then(setPosts);
      },
      onProfil: () => {
        void fetchProfile().then((next) => onUpdateProfileRef.current(next));
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
    if (!isViewingSelf) return;
    soundFX.playClick();
    setDraftName(myName);
    setDraftBio(myBio);
    setShowEdit(true);
  };

  const handleSelfAvatarSelected = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    e.currentTarget.value = '';
    if (!file || !isViewingSelf || photoUploading) return;
    if (file.size === 0) {
      setPhotoUploadError('izinin akses foto dulu di Pengaturan HP > KEIZ BUCIN > Foto > Izinkan');
      return;
    }

    setPhotoUploading(true);
    setPhotoUploadError(null);
    try {
      const blob = await compressImageBlob(file, 720);
      const uploaded = await uploadImageToKeizStorage(blob, file.name, currentUser, 'profil');
      if (!uploaded.publicUrl) {
        setPhotoUploadError(uploaded.error || 'Gagal upload foto profil, coba lagi.');
        return;
      }

      soundFX.playHeartBurst();
      const updated: CoupleProfile = isFaiz
        ? { ...profile, faizPhoto: uploaded.publicUrl }
        : { ...profile, kenatPhoto: uploaded.publicUrl };
      await saveProfile(updated, currentUser);
      const fresh = await fetchProfile();
      onUpdateProfile({
        ...fresh,
        ...(isFaiz ? { faizPhoto: uploaded.publicUrl } : { kenatPhoto: uploaded.publicUrl }),
      });
      setPhotoPrompt(null);
      showToastMsg(`Foto profil ${myName} keganti`);
    } catch (err) {
      setPhotoUploadError(err instanceof Error ? err.message : 'Gagal upload foto profil');
    } finally {
      setPhotoUploading(false);
    }
  };

  const handleBannerSelected = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    e.currentTarget.value = '';
    if (!file || !isViewingSelf || photoUploading) return;
    if (file.size === 0) {
      setPhotoUploadError('izinin akses foto dulu di Pengaturan HP > KEIZ BUCIN > Foto > Izinkan');
      return;
    }

    setPhotoUploading(true);
    setPhotoUploadError(null);
    try {
      const blob = await compressImageBlob(file, 1080);
      const uploaded = await uploadImageToKeizStorage(blob, file.name, currentUser, 'profil');
      if (!uploaded.publicUrl) {
        setPhotoUploadError(uploaded.error || 'Gagal upload foto latar, coba lagi.');
        return;
      }

      soundFX.playHeartBurst();
      const updated: CoupleProfile = isFaiz
        ? { ...profile, faizBanner: uploaded.publicUrl }
        : { ...profile, kenatBanner: uploaded.publicUrl };
      await saveProfile(updated, currentUser);
      const fresh = await fetchProfile();
      onUpdateProfile({
        ...fresh,
        ...(isFaiz ? { faizBanner: uploaded.publicUrl } : { kenatBanner: uploaded.publicUrl }),
      });
      setPhotoPrompt(null);
      showToastMsg(`Foto latar ${myName} berhasil diganti`);
    } catch (err) {
      setPhotoUploadError(err instanceof Error ? err.message : 'Gagal upload foto latar');
    } finally {
      setPhotoUploading(false);
    }
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isViewingSelf) return;
    soundFX.playHeartBurst();
    const cleanedName = draftName.trim() || (isFaiz ? 'faiz' : 'kenat');
    const cleanedBio =
      draftBio.trim() || (isFaiz ? 'pacarnya kenat' : 'pacarnya faiz');
    const updated: CoupleProfile = isFaiz
      ? { ...profile, faizName: cleanedName, faizBio: cleanedBio }
      : { ...profile, kenatName: cleanedName, kenatBio: cleanedBio };
    await saveProfile(updated, currentUser);
    const fresh = await fetchProfile();
    onUpdateProfile({
      ...fresh,
      ...(isFaiz
        ? { faizName: cleanedName, faizBio: cleanedBio }
        : { kenatName: cleanedName, kenatBio: cleanedBio }),
    });
    setShowEdit(false);
    showToastMsg(`Profil ${cleanedName} berhasil disimpan`);
  };

  const handleSelectProfileSong = async (track: ITunesTrack) => {
    if (!isViewingSelf) return;
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
    await saveProfile(updated, currentUser);
    onUpdateProfile(updated);
    loadedSongRef.current = '';
    setSongPlaying(false);
    setShowSongPicker(false);
    setSongQuery('');
    setSongResults([]);
    showToastMsg(`Lagu ${myName} dipasang`);
  };

  const handleDeleteProfileSong = async () => {
    if (!isViewingSelf) return;
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
    await saveProfile(updated, currentUser);
    onUpdateProfile(updated);
    showToastMsg('Lagu profil dihapus');
  };

  const handleTogglePlayProfileSong = async () => {
    if (!viewedSong) return;
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

    if (loadedSongRef.current === viewedSong && player && ytReadyRef.current) {
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
    const vid = await lookupYouTubeVideoId(viewedSong);
    if (!vid) {
      setSongLoading(false);
      showToastMsg('Lagu lagi susah dimuat, coba sekali lagi ya');
      return;
    }
    loadedSongRef.current = viewedSong;
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

  const handlePostFilePick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.currentTarget.value = '';
    if (!file) return;
    if (file.size === 0) {
      setPostError('izinin akses foto dulu di Pengaturan HP > KEIZ BUCIN > Foto > Izinkan');
      return;
    }
    setPostError(null);
    setPostFile(file);
    try {
      if (postPreviewUrl && postPreviewUrl.startsWith('blob:')) {
        URL.revokeObjectURL(postPreviewUrl);
      }
      setPostPreviewUrl(URL.createObjectURL(file));
    } catch {
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === 'string') setPostPreviewUrl(reader.result);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleCreatePost = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!postFile || !isViewingSelf || postUploading) return;
    setPostUploading(true);
    setPostError(null);
    try {
      const blob = await compressImageBlob(postFile, 1080);
      const uploaded = await uploadImageToKeizStorage(blob, postFile.name, currentUser, 'postingan');
      if (!uploaded.publicUrl) {
        setPostError(uploaded.error || 'Gagal upload postingan, coba lagi ya.');
        return;
      }

      const saved = await addPostingan({
        author: currentUser,
        caption: postCaption.trim() || 'momen gemes kita berdua',
        image_url: uploaded.publicUrl,
      });
      if (saved.failed) {
        setPostError(saved.errorDetails || 'Gagal simpan postingan ke Supabase.');
        return;
      }

      soundFX.playHeartBurst();
      setPosts((prev) => [saved, ...prev.filter((p) => p.id !== saved.id)]);
      if (postPreviewUrl && postPreviewUrl.startsWith('blob:')) {
        URL.revokeObjectURL(postPreviewUrl);
      }
      setPostFile(null);
      setPostPreviewUrl('');
      setPostCaption('');
      setShowPostModal(false);
      showToastMsg('Postingan baru berhasil dipajang');
    } catch (err) {
      setPostError(err instanceof Error ? err.message : 'Gagal upload postingan.');
    } finally {
      setPostUploading(false);
    }
  };

  const handleShareProfile = () => {
    soundFX.playPop();
    const shareText = `KEIZ BUCIN · ${viewedName} (Pasangannya ${viewedPartnerName}) · Tanggal pacaran 28 Agustus 2026`;
    navigator.clipboard?.writeText(shareText).catch(() => {});
    showToastMsg('Info profil disalin ke clipboard');
  };

  const viewedSongArt = songArtMap[viewingRole];

  return (
    <div
      onClick={() => {
        if (showSongMenu) setShowSongMenu(false);
      }}
      className="animate-slide-in-right flex flex-col gap-3 pb-3"
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

      {/* Sticky Top Bar: < | Profil [ViewedName] | (Edit + Settings only when viewing own profile) */}
      <div className="sticky top-0 z-20 -mx-4 flex h-12 items-center justify-between bg-[#FFF2F7]/95 px-4 backdrop-blur-sm">
        <button
          type="button"
          onClick={onBack}
          aria-label="Kembali"
          className="btn-bucin flex h-10 w-10 items-center justify-center rounded-full border border-[#FFD6E7] bg-white text-[#2D0A1E] cursor-pointer"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <h2 className="font-display text-[18px] font-extrabold text-[#2D0A1E]">
          Profil {viewedName}
        </h2>
        {isViewingSelf ? (
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
        ) : (
          <div className="w-10" aria-hidden="true" />
        )}
      </div>

      {toast && (
        <div className="animate-bubble-pop rounded-full border border-pink-200 bg-white px-4 py-2 text-center text-xs font-extrabold text-[#D81B6E] shadow-md">
          {toast}
        </div>
      )}

      {/* Main Profile Card */}
      <div className="keiz-sticker-card overflow-hidden bg-white">
        {/* Per-User Cover / Banner Photo */}
        <div
          onClick={() => {
            if (!isViewingSelf) return;
            soundFX.playClick();
            setPhotoPrompt('banner');
          }}
          role={isViewingSelf ? 'button' : undefined}
          tabIndex={isViewingSelf ? 0 : undefined}
          onKeyDown={(e) => {
            if (isViewingSelf && e.key === 'Enter') setPhotoPrompt('banner');
          }}
          className={`group relative h-[148px] w-full overflow-hidden ${
            isViewingSelf ? 'cursor-pointer' : ''
          }`}
        >
          {viewedBanner ? (
            <>
              <img
                key={`${viewingRole}-${viewedBanner.slice(0, 32)}`}
                src={viewedBanner}
                alt={`Foto latar profil ${viewedName}`}
                className={`h-full w-full object-cover transition-transform duration-300 ${
                  isViewingSelf ? 'group-hover:scale-105' : ''
                }`}
              />
              <div className="absolute inset-0 bg-gradient-to-t from-[#2D0A1E]/40 via-transparent to-transparent" />
            </>
          ) : (
            <div
              className={`flex h-full w-full flex-col items-center justify-center ${
                viewedIsFaiz
                  ? 'bg-gradient-to-br from-[#60A5FA] via-[#93C5FD] to-[#DBEAFE]'
                  : 'bg-gradient-to-br from-[#FF4D8D] via-[#FF8EC4] to-[#FFE3EE]'
              }`}
            >
              <span className="rounded-full bg-white/75 px-3 py-1 text-[11px] font-extrabold text-[#2D0A1E]/80 shadow-sm backdrop-blur-sm">
                Belum ada latar
              </span>
            </div>
          )}

          {/* Top-right camera pill + Tap buat ganti latar (ONLY when viewing own profile) */}
          {isViewingSelf && (
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
          )}

          <svg
            viewBox="0 0 240 80"
            className="pointer-events-none absolute inset-0 h-full w-full opacity-40"
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
          {/* Switchable 2 Avatar Tabs: Left = AKU, Right = PASANGAN */}
          <div className="-mt-12 flex items-end gap-3.5">
            {/* Tab AKU */}
            <button
              type="button"
              onClick={() => {
                if (!isViewingSelf) {
                  handleSwitchProfile(currentUser);
                } else {
                  soundFX.playClick();
                  setPhotoPrompt('avatar');
                }
              }}
              aria-label={`Lihat profil ${myName} (Aku)`}
              aria-pressed={isViewingSelf}
              className="btn-bucin relative cursor-pointer transition-all"
            >
              <img
                src={myPhoto}
                alt={myName}
                className={`rounded-full bg-white object-cover transition-all ${
                  isViewingSelf
                    ? 'h-[88px] w-[88px] border-4 border-[#3B82F6] ring-4 ring-[#3B82F6]/30 shadow-lg opacity-100'
                    : 'h-[64px] w-[64px] border-[3px] border-[#E5D3DC] shadow-sm opacity-60 hover:opacity-85'
                }`}
              />
              <span
                className={`absolute -bottom-1.5 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full border-2 border-white px-2.5 py-0.5 text-[9px] font-extrabold shadow transition-colors ${
                  isViewingSelf
                    ? 'bg-[#2563EB] text-white'
                    : 'bg-[#9A7A8A] text-white/85'
                }`}
              >
                AKU
              </span>
              {isViewingSelf && (
                <span
                  className="absolute bottom-0 right-0 flex h-7 w-7 items-center justify-center rounded-full border-2 border-white bg-[#2D0A1E] text-white shadow-md"
                  aria-hidden="true"
                >
                  <Camera className="h-3.5 w-3.5" />
                </span>
              )}
            </button>

            {/* Tab PASANGAN */}
            <button
              type="button"
              onClick={() => handleSwitchProfile(partnerRole)}
              aria-label={`Lihat profil ${partnerName} (Pasangan)`}
              aria-pressed={!isViewingSelf}
              className="btn-bucin relative pb-0.5 cursor-pointer transition-all"
            >
              <img
                src={partnerPhoto}
                alt={partnerName}
                className={`rounded-full bg-white object-cover transition-all ${
                  !isViewingSelf
                    ? 'h-[88px] w-[88px] border-4 border-[#3B82F6] ring-4 ring-[#3B82F6]/30 shadow-lg opacity-100'
                    : 'h-[58px] w-[58px] border-[3px] border-[#E5D3DC] shadow-sm opacity-60 hover:opacity-85'
                }`}
              />
              <span
                className={`absolute -bottom-1.5 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full border-2 border-white px-2 py-0.5 text-[8px] font-extrabold shadow transition-colors ${
                  !isViewingSelf
                    ? 'bg-[#2563EB] text-white'
                    : 'bg-[#9A7A8A] text-white/85'
                }`}
              >
                PASANGAN
              </span>
            </button>
          </div>

          {/* Name + Pasangannya + Bio + Tanggal Pacaran */}
          <div className="mt-4">
            <h3 className="font-display text-[24px] font-extrabold leading-tight text-[#2D0A1E]">
              {viewedName}
            </h3>
            <span
              className={`mt-1 inline-block rounded-full px-3 py-1 text-[11px] font-extrabold ${
                viewedIsFaiz
                  ? 'bg-[#EFF6FF] text-[#2563EB]'
                  : 'bg-[#FFE3EE] text-[#D81B6E]'
              }`}
            >
              Pasangannya {viewedPartnerName}
            </span>

            <div className="mt-2.5 flex items-center justify-between gap-2">
              <p className="text-[13px] font-semibold text-[#5C3A49]">
                {viewedBio}
              </p>
              {isViewingSelf && (
                <button
                  type="button"
                  onClick={openEditSheet}
                  aria-label="Edit bio"
                  className="shrink-0 rounded-full p-1.5 text-[#E91E7A] hover:bg-[#FFF2F7] cursor-pointer"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            <p className="mt-1 text-[11px] font-bold text-[#9A7A8A]">
              Tanggal pacaran 28 Agustus 2026
            </p>
          </div>

          {/* Card Lagu [ViewedName] */}
          <div className="relative mt-4 rounded-[18px] border border-[#FFD6E7] bg-[#FFE9F1] p-3.5">
            {viewedSong ? (
              <div className="flex items-center gap-3">
                {viewedSongArt ? (
                  <img
                    src={viewedSongArt}
                    alt={viewedSong}
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
                    Lagu {viewedName}
                  </p>
                  <p className="truncate text-[13px] font-extrabold text-[#2D0A1E]">
                    {viewedSong}
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
                {isViewingSelf && (
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
                )}
              </div>
            ) : (
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] font-extrabold tracking-wider text-[#E91E7A]">
                    Lagu {viewedName}
                  </p>
                  <p className="mt-0.5 text-xs font-bold text-[#5C3A49]">
                    Belum ada lagu
                  </p>
                </div>
                {isViewingSelf && (
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
                )}
              </div>
            )}
          </div>

          {/* Section Postingan (filtered per viewed user) */}
          <div className="mt-5 border-t border-[#FFD6E7] pt-4">
            <div className="mb-2.5 flex items-center justify-between">
              <h4 className="text-[15px] font-extrabold text-[#2D0A1E]">
                Postingan
              </h4>
              {viewedPosts.length > 0 && (
                <div className="flex items-center gap-3">
                  {isViewingSelf && (
                    <button
                      type="button"
                      onClick={() => {
                        soundFX.playClick();
                        setPostFile(null);
                        setPostPreviewUrl('');
                        setPostCaption('');
                        setPostError(null);
                        setShowPostModal(true);
                      }}
                      className="text-xs font-extrabold text-[#3B82F6] cursor-pointer"
                    >
                      + Tambah
                    </button>
                  )}
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

            {viewedPosts.length === 0 ? (
              <div className="rounded-[20px] border border-[#EDE6EA] bg-[#F7F3F5] p-6 text-center">
                <Camera className="mx-auto h-9 w-9 text-[#B4A0AA]" />
                <p className="mt-2.5 text-sm font-extrabold text-[#2D0A1E]">
                  Belum ada postingan
                </p>
                <p className="mt-1 text-xs font-semibold text-[#8A6A7A]">
                  Momen pertama kalian bakal muncul di sini.
                </p>
                {isViewingSelf && (
                  <button
                    type="button"
                    onClick={() => {
                      soundFX.playPop();
                      setPostFile(null);
                      setPostPreviewUrl('');
                      setPostCaption('');
                      setPostError(null);
                      setShowPostModal(true);
                    }}
                    className="keiz-btn-primary btn-bucin mt-3.5 inline-flex min-h-[42px] items-center gap-1.5 px-5 text-xs cursor-pointer"
                  >
                    <Plus className="h-4 w-4" />
                    <span>Buat Postingan Pertama</span>
                  </button>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2.5">
                {viewedPosts.slice(0, 6).map((p, idx) => (
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

      {/* Popup: Ganti Foto Profil / Ganti Foto Latar (Only own profile) */}
      {isViewingSelf && photoPrompt && (
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
                : `Ganti Foto Latar ${myName}`}
            </h3>
            <p className="mt-1 text-xs font-semibold text-[#8A6A7A]">
              {photoPrompt === 'avatar'
                ? `Pilih foto baru buat profil ${myName} dari galeri HP`
                : `Pilih foto latar belakang baru khusus buat profil ${myName}`}
            </p>
            <div className="mt-4 flex justify-center">
              {photoPrompt === 'avatar' ? (
                <img
                  src={myPhoto}
                  alt="Preview foto profil"
                  className="h-24 w-24 rounded-full border-4 border-[#FFD6E7] object-cover shadow"
                />
              ) : myBanner ? (
                <img
                  src={myBanner}
                  alt="Preview latar"
                  className="h-28 w-full rounded-2xl border-2 border-[#FFD6E7] object-cover shadow"
                />
              ) : (
                <div
                  className={`flex h-28 w-full items-center justify-center rounded-2xl border-2 border-[#FFD6E7] ${
                    isFaiz
                      ? 'bg-gradient-to-br from-[#60A5FA] via-[#93C5FD] to-[#DBEAFE]'
                      : 'bg-gradient-to-br from-[#FF4D8D] via-[#FF8EC4] to-[#FFE3EE]'
                  }`}
                >
                  <span className="rounded-full bg-white/80 px-3 py-1 text-[11px] font-extrabold text-[#2D0A1E]">
                    Belum ada latar
                  </span>
                </div>
              )}
            </div>
            {photoUploadError && (
              <p className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-[11px] font-bold text-rose-700">
                {photoUploadError}
              </p>
            )}
            <div className="mt-4 flex flex-col gap-2">
              <label
                onClick={() => {
                  soundFX.playClick();
                  setPhotoUploadError(null);
                }}
                className={`keiz-btn-primary btn-bucin relative flex min-h-[46px] w-full items-center justify-center gap-2 overflow-hidden text-xs ${
                  photoUploading ? 'pointer-events-none opacity-75' : 'cursor-pointer'
                }`}
              >
                <input
                  type="file"
                  accept="image/*"
                  disabled={photoUploading}
                  onChange={
                    photoPrompt === 'avatar' ? handleSelfAvatarSelected : handleBannerSelected
                  }
                  aria-label="Pilih foto dari galeri"
                  className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                />
                <ImagePlus className="h-4 w-4" />
                <span>{photoUploading ? 'lagi upload...' : 'Pilih Foto dari Galeri'}</span>
              </label>
              <button
                type="button"
                onClick={() => {
                  if (!photoUploading) {
                    setPhotoUploadError(null);
                    setPhotoPrompt(null);
                  }
                }}
                disabled={photoUploading}
                className="btn-bucin min-h-[42px] w-full rounded-full border border-[#FFD6E7] bg-[#FFF2F7] text-xs font-extrabold text-[#8A6A7A] cursor-pointer disabled:opacity-50"
              >
                Batal
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Popup: Tambah / Ganti Lagu (iTunes Search) */}
      {isViewingSelf && showSongPicker && (
        <div
          onClick={() => setShowSongPicker(false)}
          className="fixed inset-0 z-50 flex items-end justify-center bg-[#2D0A1E]/55 backdrop-blur-sm sm:items-center sm:p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="animate-slide-up-bounce flex max-h-[82dvh] w-full max-w-[430px] flex-col rounded-t-[28px] border border-[#FFD6E7] bg-white p-5 shadow-2xl sm:rounded-[28px]"
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
      {isViewingSelf && showPostModal && (
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

            <label className="relative mt-4 flex h-44 w-full cursor-pointer flex-col items-center justify-center overflow-hidden rounded-2xl border-2 border-dashed border-[#FFD6E7] bg-[#FFF8FA] text-[#8A6A7A]">
              <input
                type="file"
                accept="image/*"
                disabled={postUploading}
                onChange={handlePostFilePick}
                aria-label="Pilih foto postingan"
                className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
              />
              {postPreviewUrl ? (
                <img
                  src={postPreviewUrl}
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
            </label>

            {postError && (
              <div className="mt-2.5 flex items-center justify-between gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-[11px] font-bold text-rose-700">
                <span className="flex-1 break-words">{postError}</span>
                {postFile && (
                  <button
                    type="button"
                    onClick={() => void handleCreatePost()}
                    disabled={postUploading}
                    className="shrink-0 rounded-full bg-rose-600 px-2.5 py-1 text-[10px] font-extrabold text-white cursor-pointer"
                  >
                    coba lagi
                  </button>
                )}
              </div>
            )}

            <input
              type="text"
              value={postCaption}
              onChange={(e) => setPostCaption(e.target.value)}
              placeholder="Tulis caption momen kalian..."
              disabled={postUploading}
              className="mt-3 min-h-[44px] w-full rounded-2xl border border-[#FFD6E7] bg-[#FFF2F7] px-3.5 text-xs font-semibold text-[#2D0A1E] placeholder-[#9A7A8A] focus:outline-none"
            />

            <div className="mt-4 grid grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={() => !postUploading && setShowPostModal(false)}
                disabled={postUploading}
                className="btn-bucin min-h-[46px] rounded-full border border-[#FFD6E7] bg-[#FFF2F7] text-xs font-extrabold text-[#8A6A7A] cursor-pointer disabled:opacity-50"
              >
                Batal
              </button>
              <button
                type="submit"
                disabled={!postFile || postUploading}
                className="keiz-btn-primary btn-bucin min-h-[46px] text-xs disabled:opacity-45 cursor-pointer"
              >
                {postUploading ? 'lagi upload...' : 'Posting'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Bottom Sheet: Edit Nama & Bio (Top-Right Pencil) */}
      {isViewingSelf && showEdit && (
        <div
          onClick={() => setShowEdit(false)}
          className="fixed inset-0 z-50 flex items-end justify-center bg-[#2D0A1E]/45 backdrop-blur-sm sm:items-center sm:p-4"
        >
          <form
            onClick={(e) => e.stopPropagation()}
            onSubmit={handleSaveEdit}
            className="animate-slide-up-bounce max-h-[88dvh] w-full max-w-[430px] overflow-y-auto rounded-t-[28px] border border-[#FFD6E7] bg-white p-5 shadow-2xl sm:rounded-[28px]"
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
                Simpan
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Popup: Profil -> Settings (Cek Koneksi Supabase + Copy Link Web Vercel) */}
      {isViewingSelf && showProfilSettings && (
        <div
          onClick={() => setShowProfilSettings(false)}
          className="fixed inset-0 z-50 flex items-end justify-center bg-[#2D0A1E]/45 p-4 backdrop-blur-sm sm:items-center"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="keiz-card animate-bubble-pop max-h-[88dvh] w-full max-w-[395px] space-y-3 overflow-y-auto bg-white p-5"
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
