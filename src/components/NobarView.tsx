import React, { useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  Copy,
  Maximize2,
  Pause,
  Play,
  RefreshCw,
  Send,
  Volume2,
} from 'lucide-react';
import {
  clearNobarSync,
  fetchNobarSync,
  isPresenceOnline,
  parseYouTubeUrl,
  subscribeNobarChannel,
  upsertNobarSync,
} from '../supabaseClient';
import { soundFX } from '../sound';
import type {
  CoupleProfile,
  NobarSyncState,
  PresenceState,
  Role,
  YTPlayerInstance,
} from '../types';

const SPEED_OPTIONS = [1, 1.25, 1.5, 2];

function formatClock(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const rem = s % 60;
  if (h > 0) {
    return `${h}:${m < 10 ? '0' : ''}${m}:${rem < 10 ? '0' : ''}${rem}`;
  }
  return `${m}:${rem < 10 ? '0' : ''}${rem}`;
}

function computeTargetTime(state: NobarSyncState): number {
  const base = state.current_time || 0;
  if (!state.is_playing || !state.updated_at) return base;
  const elapsed = Math.max(0, (Date.now() - Date.parse(state.updated_at)) / 1000);
  if (!Number.isFinite(elapsed) || elapsed > 600) return base;
  return base + elapsed * (state.playback_rate || 1);
}

async function fetchYouTubeVideoTitle(videoId: string): Promise<string> {
  try {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 1600);
    const res = await fetch(
      `https://www.youtube.com/oembed?url=${encodeURIComponent(
        `https://www.youtube.com/watch?v=${videoId}`
      )}&format=json`,
      { signal: controller.signal }
    );
    window.clearTimeout(timer);
    if (!res.ok) return '';
    const json = (await res.json()) as { title?: string };
    return typeof json.title === 'string' ? json.title.trim() : '';
  } catch {
    return '';
  }
}

interface NobarViewProps {
  currentUser: Role;
  profile: CoupleProfile;
  partnerPresence: PresenceState | null;
  joinSignal?: number;
  onActiveTitleChange?: (title: string) => void;
  onBack: () => void;
  onBoostLove: () => void;
}

export const NobarView: React.FC<NobarViewProps> = ({
  currentUser,
  profile,
  partnerPresence,
  joinSignal,
  onActiveTitleChange,
  onBack,
  onBoostLove,
}) => {
  const [nobar, setNobar] = useState<NobarSyncState | null>(null);
  const [linkInput, setLinkInput] = useState('');
  const [toast, setToast] = useState<string | null>(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [needsUnmute, setNeedsUnmute] = useState(false);
  const [roomMembers, setRoomMembers] = useState<Role[]>([]);

  // Chat Nobar Berdua (lokal sementara selama di ruang Nobar, tidak masuk keiz_chat)
  const [chats, setChats] = useState<{ id: string; sender: Role; message: string }[]>([]);
  const [chatText, setChatText] = useState('');

  const inputRef = useRef<HTMLInputElement | null>(null);
  const playerWrapperRef = useRef<HTMLDivElement | null>(null);
  const ytHostRef = useRef<HTMLDivElement | null>(null);
  const ytPlayerRef = useRef<YTPlayerInstance | null>(null);
  const ytReadyRef = useRef(false);
  const loadedVideoIdRef = useRef<string>('');
  const pendingStateRef = useRef<NobarSyncState | null>(null);
  const nobarRef = useRef<NobarSyncState | null>(null);
  const isRemoteSyncRef = useRef(false);
  const remoteGuardTimerRef = useRef<number | null>(null);
  const lastAppliedStampRef = useRef<string>('');

  nobarRef.current = nobar;

  const partnerRole: Role = currentUser === 'faiz' ? 'kenat' : 'faiz';
  const partnerName =
    partnerRole === 'kenat' ? profile.kenatName : profile.faizName;
  const partnerPhoto =
    partnerRole === 'kenat' ? profile.kenatPhoto : profile.faizPhoto;

  const partnerOnline = isPresenceOnline(partnerPresence);
  const partnerInNobar =
    roomMembers.includes(partnerRole) ||
    (partnerOnline && partnerPresence?.lagi_ngapain === 'di Nobar');

  const showToastMsg = (msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(null), 2400);
  };

  const lockRemoteGuard = (ms = 550) => {
    isRemoteSyncRef.current = true;
    if (remoteGuardTimerRef.current) {
      clearTimeout(remoteGuardTimerRef.current);
    }
    remoteGuardTimerRef.current = window.setTimeout(() => {
      isRemoteSyncRef.current = false;
    }, ms);
  };

  const applyRemoteNobarState = (state: NobarSyncState | null, force = false) => {
    setNobar(state);
    onActiveTitleChange?.(state?.title || '');

    if (!state || !state.videoId) {
      loadedVideoIdRef.current = '';
      setIsPlaying(false);
      setCurrentTime(0);
      setDuration(0);
      setPlaybackRate(1);
      return;
    }

    const stamp = `${state.updated_at}-${state.action}-${state.is_playing}-${state.playback_rate}`;
    if (!force && state.updated_by === currentUser && stamp === lastAppliedStampRef.current) {
      return;
    }
    lastAppliedStampRef.current = stamp;

    const targetTime = computeTargetTime(state);
    setPlaybackRate(state.playback_rate || 1);

    const player = ytPlayerRef.current;
    if (!player || !ytReadyRef.current) {
      pendingStateRef.current = state;
      setIsPlaying(state.is_playing);
      setCurrentTime(targetTime);
      return;
    }

    lockRemoteGuard(600);
    try {
      player.setPlaybackRate?.(state.playback_rate || 1);
      if (loadedVideoIdRef.current !== state.videoId) {
        loadedVideoIdRef.current = state.videoId;
        player.unMute();
        player.setVolume(100);
        if (state.is_playing) {
          player.loadVideoById(state.videoId, targetTime);
          player.playVideo();
        } else {
          player.cueVideoById(state.videoId, targetTime);
        }
      } else {
        const cur = player.getCurrentTime?.() ?? 0;
        const drift = Math.abs(cur - targetTime);
        if (drift > 1.5 || state.action === 'seek') {
          player.seekTo(targetTime, true);
        }
        if (state.is_playing) {
          player.unMute();
          player.setVolume(100);
          player.playVideo();
        } else {
          player.pauseVideo();
        }
      }

      window.setTimeout(() => {
        try {
          if (player.isMuted?.()) {
            player.unMute();
            player.setVolume(100);
            setNeedsUnmute(player.isMuted());
          } else {
            setNeedsUnmute(false);
          }
        } catch {
          // ignore
        }
      }, 450);

      setIsPlaying(state.is_playing);
      setCurrentTime(targetTime);
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    fetchNobarSync().then((initial) => {
      if (initial) {
        applyRemoteNobarState(initial, true);
        if (joinSignal && joinSignal > 0) {
          showToastMsg(`Gabung nobar bareng ${partnerName}`);
        }
      }
    });

    const unsubNobar = subscribeNobarChannel(
      currentUser,
      (incoming) => {
        applyRemoteNobarState(incoming);
      },
      (members) => setRoomMembers(members)
    );

    // 3-second DB polling fallback so join/sync works even if Postgres Realtime is off
    const pollTimer = window.setInterval(() => {
      fetchNobarSync().then((fresh) => {
        const cur = nobarRef.current;
        if (!fresh) {
          if (cur) applyRemoteNobarState(null, true);
          return;
        }
        const playerCur = ytPlayerRef.current?.getCurrentTime?.() ?? 0;
        const targetCur = computeTargetTime(fresh);
        const videoChanged = !cur || cur.videoId !== fresh.videoId;
        const playChanged = !cur || cur.is_playing !== fresh.is_playing;
        const partnerUpdated = fresh.updated_by !== currentUser;
        const drifted = partnerUpdated && Math.abs(playerCur - targetCur) > 3.5;
        if (videoChanged || playChanged || drifted) {
          applyRemoteNobarState(fresh, videoChanged || playChanged);
        }
      });
    }, 3000);

    return () => {
      window.clearInterval(pollTimer);
      unsubNobar();
    };
  }, [currentUser, joinSignal]);

  // Initialize YouTube IFrame API when videoId becomes active
  useEffect(() => {
    if (!nobar?.videoId) {
      if (ytPlayerRef.current) {
        try {
          ytPlayerRef.current.destroy();
        } catch {
          // ignore
        }
        ytPlayerRef.current = null;
        ytReadyRef.current = false;
        loadedVideoIdRef.current = '';
      }
      return;
    }

    let mounted = true;
    const initPlayer = () => {
      if (!mounted || !ytHostRef.current || ytPlayerRef.current || !window.YT?.Player) {
        return;
      }
      const initialState = pendingStateRef.current || nobarRef.current;
      pendingStateRef.current = null;

      ytPlayerRef.current = new window.YT.Player(ytHostRef.current, {
        height: '100%',
        width: '100%',
        playerVars: {
          autoplay: initialState?.is_playing ? 1 : 0,
          controls: 1,
          rel: 0,
          playsinline: 1,
          enablejsapi: 1,
          origin: window.location.origin,
        },
        events: {
          onReady: (ev) => {
            if (!mounted) return;
            ytReadyRef.current = true;
            const st = nobarRef.current;
            if (st?.videoId) {
              const catchup = computeTargetTime(st);
              loadedVideoIdRef.current = st.videoId;
              lockRemoteGuard(650);
              try {
                ev.target.unMute();
                ev.target.setVolume(100);
                ev.target.setPlaybackRate?.(st.playback_rate || 1);
                if (st.is_playing) {
                  ev.target.loadVideoById(st.videoId, catchup);
                  ev.target.playVideo();
                  setTimeout(() => {
                    try {
                      const pState = ev.target.getPlayerState?.();
                      if (pState !== 1 && pState !== 3) {
                        ev.target.mute?.();
                        ev.target.playVideo();
                        setNeedsUnmute(true);
                      } else {
                        setNeedsUnmute(ev.target.isMuted?.() ?? false);
                      }
                    } catch {
                      // ignore
                    }
                  }, 550);
                } else {
                  ev.target.cueVideoById(st.videoId, catchup);
                }
              } catch {
                // ignore
              }
            }
          },
          onStateChange: (ev) => {
            if (!mounted) return;
            const st = nobarRef.current;
            if (ev.data === 1) {
              setIsPlaying(true);
              if (!isRemoteSyncRef.current && st && !st.is_playing) {
                const cur = ev.target.getCurrentTime?.() ?? 0;
                upsertNobarSync({
                  youtube_url: st.youtube_url,
                  videoId: st.videoId,
                  title: st.title,
                  is_playing: true,
                  current_time: cur,
                  playback_rate: st.playback_rate || 1,
                  updated_by: currentUser,
                  action: 'play',
                }).then(setNobar);
              }
            } else if (ev.data === 2) {
              setIsPlaying(false);
              if (!isRemoteSyncRef.current && st && st.is_playing) {
                const cur = ev.target.getCurrentTime?.() ?? 0;
                upsertNobarSync({
                  youtube_url: st.youtube_url,
                  videoId: st.videoId,
                  title: st.title,
                  is_playing: false,
                  current_time: cur,
                  playback_rate: st.playback_rate || 1,
                  updated_by: currentUser,
                  action: 'pause',
                }).then(setNobar);
              }
            } else if (ev.data === 0) {
              setIsPlaying(false);
            }
          },
        },
      });
    };

    if (window.YT?.Player) {
      initPlayer();
    } else {
      const prev = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => {
        prev?.();
        initPlayer();
      };
      if (!document.querySelector('script[src="https://www.youtube.com/iframe_api"]')) {
        const tag = document.createElement('script');
        tag.src = 'https://www.youtube.com/iframe_api';
        document.body.appendChild(tag);
      }
    }

    return () => {
      mounted = false;
    };
  }, [nobar?.videoId, currentUser]);

  // Cleanup player on unmount
  useEffect(() => {
    return () => {
      if (remoteGuardTimerRef.current) clearTimeout(remoteGuardTimerRef.current);
      try {
        ytPlayerRef.current?.destroy();
      } catch {
        // ignore
      }
      ytPlayerRef.current = null;
      ytReadyRef.current = false;
    };
  }, []);

  // Poll YouTube player every 500ms for smooth local clock + duration
  useEffect(() => {
    if (!nobar?.videoId) return;
    const timer = window.setInterval(() => {
      const player = ytPlayerRef.current;
      if (!player || !ytReadyRef.current) return;
      try {
        const cur = player.getCurrentTime?.() ?? 0;
        const dur = player.getDuration?.() ?? 0;
        setCurrentTime(cur);
        if (dur > 0) setDuration(dur);
      } catch {
        // ignore
      }
    }, 500);
    return () => clearInterval(timer);
  }, [nobar?.videoId]);

  // 2-Second Host Heartbeat while playing (host = updated_by === currentUser)
  useEffect(() => {
    if (!nobar?.videoId || !isPlaying || nobar.updated_by !== currentUser) return;
    const hb = window.setInterval(() => {
      const player = ytPlayerRef.current;
      const st = nobarRef.current;
      if (!player || !ytReadyRef.current || !st || !st.is_playing) return;
      const cur = player.getCurrentTime?.() ?? 0;
      upsertNobarSync({
        youtube_url: st.youtube_url,
        videoId: st.videoId,
        title: st.title,
        is_playing: true,
        current_time: cur,
        playback_rate: st.playback_rate || playbackRate,
        updated_by: currentUser,
        action: 'play',
      }).catch(() => {});
    }, 2000);
    return () => clearInterval(hb);
  }, [nobar?.videoId, nobar?.updated_by, isPlaying, currentUser, playbackRate]);

  const handlePlayLink = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = parseYouTubeUrl(linkInput);
    if (!parsed) {
      soundFX.playClick();
      showToastMsg('Linknya bukan link YouTube nih, coba cek lagi ya!');
      return;
    }

    soundFX.playHeartBurst();
    const resolvedTitle = await fetchYouTubeVideoTitle(parsed.videoId);
    const next = await upsertNobarSync({
      youtube_url: parsed.url,
      videoId: parsed.videoId,
      title: resolvedTitle || `Video YouTube (${parsed.videoId})`,
      is_playing: true,
      current_time: 0,
      playback_rate: 1,
      updated_by: currentUser,
      action: 'change_video',
    });
    applyRemoteNobarState(next, true);
    onBoostLove();
  };

  const handleTogglePlayPause = async () => {
    if (!nobar) return;
    soundFX.playClick();
    const player = ytPlayerRef.current;
    const cur = player?.getCurrentTime?.() ?? currentTime;
    const nextPlaying = !isPlaying;

    lockRemoteGuard(550);
    try {
      if (nextPlaying) {
        player?.unMute();
        player?.setVolume(100);
        player?.playVideo();
      } else {
        player?.pauseVideo();
      }
    } catch {
      // ignore
    }
    setIsPlaying(nextPlaying);
    const updated = await upsertNobarSync({
      youtube_url: nobar.youtube_url,
      videoId: nobar.videoId,
      title: nobar.title,
      is_playing: nextPlaying,
      current_time: cur,
      playback_rate: playbackRate,
      updated_by: currentUser,
      action: nextPlaying ? 'play' : 'pause',
    });
    setNobar(updated);
  };

  const handleSeek = async (seconds: number) => {
    setCurrentTime(seconds);
    const player = ytPlayerRef.current;
    lockRemoteGuard(550);
    try {
      player?.seekTo(seconds, true);
    } catch {
      // ignore
    }
    if (nobar) {
      const updated = await upsertNobarSync({
        youtube_url: nobar.youtube_url,
        videoId: nobar.videoId,
        title: nobar.title,
        is_playing: isPlaying,
        current_time: seconds,
        playback_rate: playbackRate,
        updated_by: currentUser,
        action: 'seek',
      });
      setNobar(updated);
    }
  };

  const handleChangeSpeed = async (rate: number) => {
    soundFX.playClick();
    setPlaybackRate(rate);
    lockRemoteGuard(450);
    try {
      ytPlayerRef.current?.setPlaybackRate?.(rate);
    } catch {
      // ignore
    }
    if (nobar) {
      const cur = ytPlayerRef.current?.getCurrentTime?.() ?? currentTime;
      const updated = await upsertNobarSync({
        youtube_url: nobar.youtube_url,
        videoId: nobar.videoId,
        title: nobar.title,
        is_playing: isPlaying,
        current_time: cur,
        playback_rate: rate,
        updated_by: currentUser,
        action: 'rate',
      });
      setNobar(updated);
    }
  };

  const handleForceUnmute = () => {
    soundFX.playClick();
    const player = ytPlayerRef.current;
    if (!player || !ytReadyRef.current) return;
    try {
      player.unMute();
      player.setVolume(100);
      if (nobar?.is_playing) {
        player.seekTo(computeTargetTime(nobar), true);
        player.playVideo();
      }
      setNeedsUnmute(false);
    } catch {
      // ignore
    }
  };

  const handleSyncToPartner = async () => {
    soundFX.playPop();
    const latest = await fetchNobarSync();
    if (!latest) return;
    applyRemoteNobarState(latest, true);
    const player = ytPlayerRef.current;
    if (player && ytReadyRef.current) {
      try {
        player.unMute();
        player.setVolume(100);
        player.seekTo(computeTargetTime(latest), true);
        if (latest.is_playing) {
          player.playVideo();
        }
        setNeedsUnmute(false);
      } catch {
        // ignore
      }
    }
    showToastMsg(`Udah sinkron sama ${partnerName}`);
  };

  const handleChangeLink = async () => {
    soundFX.playClick();
    await clearNobarSync();
    applyRemoteNobarState(null, true);
    setLinkInput('');
    window.scrollTo({ top: 0, behavior: 'smooth' });
    setTimeout(() => inputRef.current?.focus(), 120);
  };

  const handleCopyLink = () => {
    if (!nobar?.youtube_url) return;
    soundFX.playPop();
    navigator.clipboard?.writeText(nobar.youtube_url).catch(() => {});
    showToastMsg('Link YouTube disalin');
  };

  const handleFullscreen = () => {
    soundFX.playClick();
    playerWrapperRef.current?.requestFullscreen?.().catch(() => {});
  };

  const handleSendMiniChat = (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = chatText.trim();
    if (!cleaned) return;
    soundFX.playPop();
    setChats((prev) => [
      ...prev,
      {
        id: `nobar-local-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
        sender: currentUser,
        message: cleaned,
      },
    ]);
    setChatText('');
    onBoostLove();
  };

  const actorName = nobar
    ? nobar.updated_by === 'faiz'
      ? profile.faizName
      : profile.kenatName
    : partnerName;

  return (
    <div className="animate-slide-in-right flex flex-col gap-4 pb-3">
      {/* Header + Partner Presence Avatar Badge */}
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
            <p className="text-[10px] font-extrabold tracking-wider text-[#E91E7A]">
              KEIZ BUCIN CINEMA · SYNC LIVE
            </p>
            <h2 className="font-display text-[20px] font-extrabold leading-tight text-[#2D0A1E]">
              Nobar Berdua
            </h2>
          </div>
        </div>

        {/* Partner Avatar + Live Activity Badge */}
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
                partnerInNobar
                  ? 'bg-emerald-500'
                  : partnerOnline
                  ? 'bg-emerald-400'
                  : 'bg-slate-300'
              }`}
            />
          </div>
          <span className="max-w-[125px] truncate text-[10px] font-extrabold text-[#2D0A1E]">
            {partnerInNobar
              ? isPlaying
                ? `${partnerName} nonton`
                : `${partnerName} di Nobar`
              : partnerOnline
              ? `${partnerName} ${partnerPresence?.lagi_ngapain || 'online'}`
              : `${partnerName} offline`}
          </span>
        </div>
      </div>

      {toast && (
        <div className="animate-bubble-pop rounded-full border border-[#FFD6E7] bg-white px-4 py-2 text-center text-xs font-extrabold text-[#D81B6E] shadow-md">
          {toast}
        </div>
      )}

      {/* Black Card: Input Link YouTube */}
      <form
        onSubmit={handlePlayLink}
        className="keiz-sticker-card bg-gradient-to-br from-[#2B0A1B] via-[#1B0611] to-[#0D0409] p-4 text-white"
      >
        <h3 className="font-display text-[19px] font-extrabold leading-tight text-white">
          Nobar Berdua Lewat Link YouTube
        </h3>
        <p className="mt-1 text-xs font-medium text-pink-100/80">
          Tempel link YouTube di bawah — play, pause, detik &amp; kecepatan langsung sync berdua!
        </p>

        <input
          ref={inputRef}
          type="text"
          value={linkInput}
          onChange={(e) => setLinkInput(e.target.value)}
          placeholder="Tempel link YouTube di sini..."
          className="mt-3 min-h-[44px] w-full rounded-2xl border border-white/15 bg-white/10 px-3.5 text-xs font-semibold text-white placeholder-pink-100/50 focus:border-[#FF4D8D] focus:outline-none"
        />
        <p className="mt-1.5 text-[11px] text-pink-100/65">
          contoh: https://youtu.be/... atau https://www.youtube.com/watch?v=...
        </p>

        <button
          type="submit"
          className="keiz-btn-primary btn-bucin mt-3 flex w-full items-center justify-center gap-2 text-xs cursor-pointer"
        >
          <Play className="h-4 w-4 fill-current" />
          <span>Putar Bareng</span>
        </button>
      </form>

      {/* Player Area */}
      {!nobar?.videoId ? (
        <div className="keiz-card flex aspect-video w-full flex-col items-center justify-center bg-white/95 p-6 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[#F3EEF1] text-[#A2919B]">
            <Play className="ml-0.5 h-6 w-6" />
          </div>
          <p className="font-display mt-3 text-[16px] font-extrabold text-[#2D0A1E]">
            Belum ada film nih
          </p>
          <p className="mt-1 text-xs font-semibold text-[#8A6A7A]">
            Tempel link YouTube di atas buat mulai nobar bareng {partnerName}.
          </p>
        </div>
      ) : (
        <div className="keiz-card overflow-hidden bg-white">
          {/* Live Partner Sync Status Bar Above Player */}
          <div className="flex items-center justify-between border-b border-[#FFD6E7] bg-[#FFF2F7] px-3.5 py-2 text-[11px] font-extrabold text-[#2D0A1E]">
            <div className="flex items-center gap-2 truncate">
              <span
                className={`h-2 w-2 shrink-0 rounded-full ${
                  isPlaying ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'
                }`}
              />
              <span className="truncate">
                {isPlaying
                  ? `${actorName} lagi Play - ${formatClock(currentTime)} / ${formatClock(
                      duration
                    )} - Lagi Jalan`
                  : `${actorName} lagi Pause - ${formatClock(currentTime)}`}
              </span>
            </div>
            <span className="shrink-0 rounded-full bg-white px-2 py-0.5 text-[10px] text-[#E91E7A] border border-[#FFD6E7]">
              {playbackRate}x
            </span>
          </div>

          <div
            ref={playerWrapperRef}
            className="relative aspect-video w-full bg-[#12040B]"
          >
            <div ref={ytHostRef} className="h-full w-full" />
          </div>

          {(needsUnmute || (nobar.is_playing && !isPlaying) || (partnerInNobar && nobar.updated_by === partnerRole)) && (
            <div className="flex flex-wrap items-center justify-center gap-2 bg-[#FFF2F7] px-3 py-2">
              {needsUnmute && (
                <button
                  type="button"
                  onClick={handleForceUnmute}
                  className="btn-bucin inline-flex items-center gap-1.5 rounded-full bg-[#FF2E7E] px-4 py-1.5 text-xs font-extrabold text-white shadow cursor-pointer"
                >
                  <Volume2 className="h-3.5 w-3.5" />
                  <span>Nyalakan Suara Nobar</span>
                </button>
              )}
              <button
                type="button"
                onClick={handleSyncToPartner}
                className="btn-bucin inline-flex items-center gap-1.5 rounded-full border border-[#FFD6E7] bg-white px-3.5 py-1.5 text-xs font-extrabold text-[#D81B6E] shadow-sm cursor-pointer"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                <span>Sync ke {partnerName}</span>
              </button>
            </div>
          )}

          <div className="p-4">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="text-[10px] font-extrabold tracking-wider text-[#E91E7A]">
                  SYNC NOBAR REAL-TIME · HOST: {actorName.toUpperCase()}
                </p>
                <p className="truncate text-xs font-bold text-[#6E5460]">
                  {nobar.youtube_url}
                </p>
              </div>
              <button
                type="button"
                onClick={handleFullscreen}
                aria-label="Layar penuh"
                className="btn-bucin flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[#FFD6E7] bg-[#FFF2F7] text-[#2D0A1E] cursor-pointer"
              >
                <Maximize2 className="h-4 w-4" />
              </button>
            </div>

            {/* Seek Bar + Play/Pause Controls */}
            <div className="mt-3">
              <input
                type="range"
                min={0}
                max={duration || 100}
                value={Math.min(currentTime, duration || 100)}
                onChange={(e) => handleSeek(Number(e.target.value))}
                className="h-1.5 w-full cursor-pointer accent-[#FF2E7E]"
              />
              <div className="mt-1.5 flex items-center justify-between text-[11px] font-bold tabular-nums text-[#8A6A7A]">
                <span>{formatClock(currentTime)}</span>
                <button
                  type="button"
                  onClick={handleTogglePlayPause}
                  className="btn-bucin inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-[#FF2E7E] to-[#FF7AB8] px-5 py-1.5 text-[11px] font-extrabold text-white shadow cursor-pointer"
                >
                  {isPlaying ? (
                    <>
                      <Pause className="h-3.5 w-3.5" />
                      <span>Pause Berdua</span>
                    </>
                  ) : (
                    <>
                      <Play className="h-3.5 w-3.5" />
                      <span>Play Berdua</span>
                    </>
                  )}
                </button>
                <span>{formatClock(duration)}</span>
              </div>
            </div>

            {/* Playback Speed Sync Pills */}
            <div className="mt-3 flex items-center justify-between gap-2 rounded-2xl bg-[#FFF8FA] px-3 py-2 border border-[#FFD6E7]/70">
              <span className="text-[11px] font-extrabold text-[#8A6A7A]">
                Kecepatan Sync
              </span>
              <div className="flex items-center gap-1">
                {SPEED_OPTIONS.map((rate) => (
                  <button
                    key={rate}
                    type="button"
                    onClick={() => handleChangeSpeed(rate)}
                    className={`rounded-full px-2.5 py-1 text-[10px] font-extrabold cursor-pointer ${
                      playbackRate === rate
                        ? 'bg-[#FF2E7E] text-white shadow-sm'
                        : 'bg-white text-[#6E5460] border border-[#FFD6E7]'
                    }`}
                  >
                    {rate}x
                  </button>
                ))}
              </div>
            </div>

            {/* Bottom Controls: Ganti Link + Salin */}
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={handleChangeLink}
                className="btn-bucin flex min-h-[40px] items-center justify-center gap-1 rounded-full border border-[#FFD6E7] bg-[#FFF2F7] text-[11px] font-extrabold text-[#D81B6E] cursor-pointer"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                <span>Ganti</span>
              </button>
              <button
                type="button"
                onClick={handleCopyLink}
                className="btn-bucin flex min-h-[40px] items-center justify-center gap-1 rounded-full border border-[#FFD6E7] bg-white text-[11px] font-extrabold text-[#2D0A1E] shadow-sm cursor-pointer"
              >
                <Copy className="h-3.5 w-3.5" />
                <span>Salin</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Chat Nobar Berdua */}
      <div className="keiz-card bg-white p-3.5">
        <p className="mb-2 text-xs font-extrabold text-[#E91E7A]">
          Chat Nobar Berdua
        </p>
        <div className="flex h-40 flex-col gap-2 overflow-y-auto pb-2">
          {chats.length === 0 ? (
            <p className="my-auto text-center text-xs font-semibold text-[#8A6A7A]">
              Belum ada komentar film nih, ketik duluan dong!
            </p>
          ) : (
            chats.slice(-15).map((m) => {
              const isFaiz = m.sender === 'faiz';
              return (
                <div
                  key={m.id}
                  className={`flex ${isFaiz ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[82%] rounded-2xl px-3 py-1.5 text-xs text-white ${
                      isFaiz ? 'bg-[#3B82F6]' : 'bg-[#FF4D8D]'
                    }`}
                  >
                    {m.message}
                  </div>
                </div>
              );
            })
          )}
        </div>
        <form onSubmit={handleSendMiniChat} className="mt-2 flex gap-2">
          <input
            type="text"
            value={chatText}
            onChange={(e) => setChatText(e.target.value)}
            placeholder="komentarin filmnya di sini..."
            className="min-h-[40px] flex-1 rounded-full border border-[#FFD6E7] bg-[#FFF2F7] px-3.5 text-xs text-[#2D0A1E] focus:outline-none"
          />
          <button
            type="submit"
            aria-label="Kirim komentar"
            className={`btn-bucin flex h-10 w-10 items-center justify-center rounded-full text-white cursor-pointer ${
              currentUser === 'faiz' ? 'bg-[#3B82F6]' : 'bg-[#FF4D8D]'
            }`}
          >
            <Send className="h-4 w-4" />
          </button>
        </form>
      </div>
    </div>
  );
};
