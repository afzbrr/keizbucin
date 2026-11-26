import React, { useEffect, useRef, useState } from 'react';
import EmojiPicker, {
  EmojiStyle,
  Theme,
  type EmojiClickData,
} from 'emoji-picker-react';
import {
  ArrowLeft,
  Check,
  CheckCheck,
  Clock,
  Copy,
  Film,
  Image as ImageIcon,
  Maximize2,
  Pause,
  Play,
  RefreshCw,
  RotateCcw,
  Send,
  Smile,
  Square,
  Volume2,
  X,
} from 'lucide-react';
import {
  clearNobarSync,
  deleteNobarChatMessage,
  fetchNobarChats,
  fetchNobarSync,
  isPresenceOnline,
  parseYouTubeUrl,
  sendNobarChatMessage,
  subscribeNobarChannel,
  subscribeNobarChatRealtime,
  updateNobarChatReact,
  upsertNobarSync,
} from '../supabaseClient';
import { soundFX } from '../sound';
import {
  ChatWallpaperModal,
  DEFAULT_NOBAR_WALLPAPER_ID,
  getWallpaperCss,
  loadSavedWallpaper,
  NOBAR_WALLPAPER_STORAGE_KEY,
  saveWallpaperConfig,
  type SavedWallpaperConfig,
} from './ChatWallpapers';
import type {
  ChatMessage,
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
  onHeartBurstAt?: (x: number, y: number) => void;
}

export const NobarView: React.FC<NobarViewProps> = ({
  currentUser,
  profile,
  partnerPresence,
  joinSignal,
  onActiveTitleChange,
  onBack,
  onBoostLove,
  onHeartBurstAt,
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

  // Real-time synced Chat Nobar Berdua (terpisah dari Chat Biasa via type = 'nobar_chat')
  const [chats, setChats] = useState<ChatMessage[]>([]);
  const [chatText, setChatText] = useState('');
  const [replyingTo, setReplyingTo] = useState<ChatMessage | null>(null);
  const [activeBubbleMenu, setActiveBubbleMenu] = useState<string | null>(null);
  const [reactTargetMsg, setReactTargetMsg] = useState<ChatMessage | null>(null);
  const [showInputEmojiPicker, setShowInputEmojiPicker] = useState(false);
  const [shakingBubbleId, setShakingBubbleId] = useState<string | null>(null);
  const [wallpaperCfg, setWallpaperCfg] = useState<SavedWallpaperConfig>(() =>
    loadSavedWallpaper(NOBAR_WALLPAPER_STORAGE_KEY, DEFAULT_NOBAR_WALLPAPER_ID)
  );
  const [showWallpaperModal, setShowWallpaperModal] = useState(false);

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

  const chatEndRef = useRef<HTMLDivElement | null>(null);
  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);
  const longPressTimer = useRef<number | null>(null);
  const longPressFiredRef = useRef(false);

  nobarRef.current = nobar;

  const userLower = currentUser.toLowerCase() as Role;
  const partnerRole: Role = userLower === 'faiz' ? 'kenat' : 'faiz';
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

  // Sync video player state with Supabase
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

  // Sync Chat Nobar Berdua (terpisah dari Chat Biasa) via Supabase Realtime + Broadcast + 2s poll
  const loadNobarChats = async () => {
    const data = await fetchNobarChats(userLower);
    setChats((prev) => {
      const pendingOrFailed = prev.filter((m) => m.sending || m.failed);
      const merged = [...data];
      pendingOrFailed.forEach((localMsg) => {
        if (!merged.some((m) => m.id === localMsg.id)) {
          merged.push(localMsg);
        }
      });
      return merged;
    });
  };

  useEffect(() => {
    void loadNobarChats();
    const unsubNobarChat = subscribeNobarChatRealtime(
      (inserted) => {
        const s = inserted.sender.toLowerCase();
        const r = inserted.receiver.toLowerCase();
        const isPair =
          (s === userLower && r === partnerRole) ||
          (s === partnerRole && r === userLower);
        if (!isPair || inserted.type !== 'nobar_chat' || inserted.is_deleted) return;
        setChats((prev) =>
          prev.some((m) => m.id === inserted.id) ? prev : [...prev, inserted]
        );
      },
      (updated) => {
        if (updated.type !== 'nobar_chat') return;
        if (updated.is_deleted) {
          setChats((prev) => prev.filter((m) => m.id !== updated.id));
          return;
        }
        setChats((prev) =>
          prev.map((m) => (m.id === updated.id ? updated : m))
        );
      },
      () => {
        void loadNobarChats();
      }
    );

    const chatPoll = window.setInterval(() => {
      void loadNobarChats();
    }, 2000);

    return () => {
      unsubNobarChat();
      window.clearInterval(chatPoll);
    };
  }, [userLower, partnerRole]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chats.length]);

  // Close emoji reaction bar / emoji drawer immediately when tapping anywhere outside
  useEffect(() => {
    if (!activeBubbleMenu && !showInputEmojiPicker) return;
    const handleOutsidePointerDown = (e: PointerEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;
      if (
        activeBubbleMenu &&
        !target.closest('[data-bubble-menu="true"]') &&
        !target.closest('[data-chat-bubble="true"]')
      ) {
        setActiveBubbleMenu(null);
      }
      if (
        showInputEmojiPicker &&
        !target.closest('[data-nobar-input-area="true"]')
      ) {
        setShowInputEmojiPicker(false);
      }
    };
    document.addEventListener('pointerdown', handleOutsidePointerDown, true);
    return () => {
      document.removeEventListener('pointerdown', handleOutsidePointerDown, true);
    };
  }, [activeBubbleMenu, showInputEmojiPicker]);

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

  // 2-Second Host Heartbeat while playing
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

  const handleFinishNobar = async () => {
    soundFX.playClick();
    await clearNobarSync();
    applyRemoteNobarState(null, true);
    setLinkInput('');
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

  const handleSendNobarChat = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const cleaned = chatText.trim();
    if (!cleaned) return;
    soundFX.playPop();
    setChatText('');
    setShowInputEmojiPicker(false);

    const extra: Partial<ChatMessage> = replyingTo
      ? {
          reply_to: replyingTo.id,
          reply_to_text: replyingTo.message,
          reply_to_sender: replyingTo.sender,
        }
      : {};
    setReplyingTo(null);

    const tempId = `nobar-temp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const pendingMsg: ChatMessage = {
      id: tempId,
      sender: currentUser,
      receiver: partnerRole,
      message: cleaned,
      type: 'nobar_chat',
      reply_to: extra.reply_to,
      reply_to_text: extra.reply_to_text,
      reply_to_sender: extra.reply_to_sender,
      is_read: false,
      is_deleted: false,
      created_at: new Date().toISOString(),
      sending: true,
      failed: false,
    };

    setChats((prev) => [...prev, pendingMsg]);
    onBoostLove();

    const sent = await sendNobarChatMessage(currentUser, cleaned, extra);
    setChats((prev) => {
      if (sent.failed) {
        return prev.map((m) =>
          m.id === tempId
            ? { ...m, sending: false, failed: true, errorDetails: sent.errorDetails }
            : m
        );
      }
      const withoutTemp = prev.filter((m) => m.id !== tempId);
      return withoutTemp.some((m) => m.id === sent.id)
        ? withoutTemp
        : [...withoutTemp, { ...sent, sending: false, failed: false }];
    });
  };

  const handleRetryNobarChat = async (failedMsg: ChatMessage) => {
    if (failedMsg.sending) return;
    soundFX.playClick();
    setChats((prev) =>
      prev.map((m) =>
        m.id === failedMsg.id ? { ...m, sending: true, failed: false } : m
      )
    );
    const sent = await sendNobarChatMessage(failedMsg.sender, failedMsg.message, {
      reply_to: failedMsg.reply_to,
      reply_to_text: failedMsg.reply_to_text,
      reply_to_sender: failedMsg.reply_to_sender,
    });
    setChats((prev) => {
      if (sent.failed) {
        return prev.map((m) =>
          m.id === failedMsg.id
            ? { ...m, sending: false, failed: true, errorDetails: sent.errorDetails }
            : m
        );
      }
      const withoutFailed = prev.filter((m) => m.id !== failedMsg.id);
      return withoutFailed.some((m) => m.id === sent.id)
        ? withoutFailed
        : [...withoutFailed, { ...sent, sending: false, failed: false }];
    });
  };

  const applyNobarReaction = async (
    msg: ChatMessage,
    emoji: string,
    burstPoint?: { x: number; y: number }
  ) => {
    const nextReact = msg.react === emoji ? undefined : emoji;
    soundFX.playPop();
    if (nextReact === '❤️' && burstPoint) {
      onHeartBurstAt?.(burstPoint.x, burstPoint.y);
      setShakingBubbleId(msg.id);
      setTimeout(() => setShakingBubbleId(null), 500);
    }
    setActiveBubbleMenu(null);
    setReactTargetMsg(null);

    setChats((prev) =>
      prev.map((m) => (m.id === msg.id ? { ...m, react: nextReact } : m))
    );

    const updated = await updateNobarChatReact(msg.id, nextReact);
    if (updated.length > 0) {
      setChats(updated);
    }
  };

  const handleDeleteNobarChat = async (id: string) => {
    soundFX.playClick();
    setActiveBubbleMenu(null);
    setChats((prev) => prev.filter((m) => m.id !== id));
    const updated = await deleteNobarChatMessage(id);
    setChats(updated);
  };

  const handlePickerReactSelect = async (emojiData: EmojiClickData, event: MouseEvent) => {
    if (!reactTargetMsg) return;
    await applyNobarReaction(reactTargetMsg, emojiData.emoji, {
      x: event.clientX || 215,
      y: event.clientY || 420,
    });
  };

  const handlePickerInputSelect = (emojiData: EmojiClickData) => {
    setChatText((prev) => `${prev}${emojiData.emoji}`);
  };

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

  const actorName = nobar
    ? nobar.updated_by === 'faiz'
      ? profile.faizName
      : profile.kenatName
    : partnerName;

  return (
    <div className="animate-slide-in-right flex min-h-0 flex-1 flex-col gap-2 overflow-hidden">
      {/* Compact Header (56px) */}
      <div className="flex h-[52px] shrink-0 items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2.5">
          <button
            type="button"
            onClick={onBack}
            aria-label="Kembali"
            className="btn-bucin flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[#FFD6E7] bg-white text-[#2D0A1E] cursor-pointer"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div className="min-w-0">
            <p className="truncate text-[10px] font-extrabold tracking-wider text-[#E91E7A]">
              KEIZ BUCIN CINEMA · SYNC LIVE
            </p>
            <h2 className="font-display truncate text-[18px] font-extrabold leading-tight text-[#2D0A1E]">
              Nobar Berdua
            </h2>
          </div>
        </div>

        {/* Partner Avatar + Live Activity Badge */}
        <div className="flex shrink-0 items-center gap-1.5 rounded-full border border-[#FFD6E7] bg-white px-2.5 py-1 shadow-sm">
          <div className="relative shrink-0">
            <img
              src={partnerPhoto}
              alt={partnerName}
              referrerPolicy="no-referrer"
              className={`h-6 w-6 rounded-full border-2 object-cover ${
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
          <span className="max-w-[110px] truncate text-[10px] font-extrabold text-[#2D0A1E]">
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
        <div className="animate-bubble-pop shrink-0 rounded-full border border-[#FFD6E7] bg-white px-4 py-1.5 text-center text-xs font-extrabold text-[#D81B6E] shadow-md">
          {toast}
        </div>
      )}

      {/* TOP SLOT: Paste YouTube Link Card (ONLY when no video active) OR Video Player (right on top when active!) */}
      {!nobar?.videoId ? (
        <form
          onSubmit={handlePlayLink}
          className="keiz-sticker-card shrink-0 bg-gradient-to-br from-[#2B0A1B] via-[#1B0611] to-[#0D0409] p-3.5 text-white"
        >
          <h3 className="font-display text-[17px] font-extrabold leading-tight text-white">
            Nobar Berdua Lewat Link YouTube
          </h3>
          <p className="mt-1 text-[11px] font-medium text-pink-100/80">
            Tempel link YouTube di bawah — play, pause, detik &amp; kecepatan langsung sync berdua!
          </p>

          <input
            ref={inputRef}
            type="text"
            value={linkInput}
            onChange={(e) => setLinkInput(e.target.value)}
            placeholder="Tempel link YouTube di sini..."
            className="mt-2.5 min-h-[42px] w-full rounded-2xl border border-white/15 bg-white/10 px-3.5 text-xs font-semibold text-white placeholder-pink-100/50 focus:border-[#FF4D8D] focus:outline-none"
          />
          <p className="mt-1 text-[10px] text-pink-100/65">
            contoh: https://youtu.be/... atau https://www.youtube.com/watch?v=...
          </p>

          <button
            type="submit"
            className="keiz-btn-primary btn-bucin mt-2.5 flex min-h-[42px] w-full items-center justify-center gap-2 text-xs cursor-pointer"
          >
            <Play className="h-4 w-4 fill-current" />
            <span>Putar Bareng</span>
          </button>
        </form>
      ) : (
        <div className="keiz-card shrink-0 overflow-hidden bg-white">
          {/* Live Sync Status Bar + Selesai Nobar shortcut */}
          <div className="flex items-center justify-between gap-2 border-b border-[#FFD6E7] bg-[#FFF2F7] px-3 py-1.5 text-[10px] font-extrabold text-[#2D0A1E]">
            <div className="flex min-w-0 items-center gap-1.5">
              <span
                className={`h-2 w-2 shrink-0 rounded-full ${
                  isPlaying ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'
                }`}
              />
              <span className="truncate">
                {isPlaying
                  ? `${actorName} Play · ${formatClock(currentTime)}/${formatClock(
                      duration
                    )}`
                  : `${actorName} Pause · ${formatClock(currentTime)}`}
              </span>
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              <span className="rounded-full border border-[#FFD6E7] bg-white px-2 py-0.5 text-[10px] text-[#E91E7A]">
                {playbackRate}x
              </span>
              <button
                type="button"
                onClick={handleFullscreen}
                aria-label="Layar penuh"
                title="Layar penuh"
                className="btn-bucin flex h-6 w-6 items-center justify-center rounded-full border border-[#FFD6E7] bg-white text-[#2D0A1E] cursor-pointer"
              >
                <Maximize2 className="h-3 w-3" />
              </button>
            </div>
          </div>

          {/* Video Player */}
          <div
            ref={playerWrapperRef}
            className="relative aspect-video max-h-[210px] w-full bg-[#12040B]"
          >
            <div ref={ytHostRef} className="h-full w-full" />
          </div>

          {(needsUnmute ||
            (nobar.is_playing && !isPlaying) ||
            (partnerInNobar && nobar.updated_by === partnerRole)) && (
            <div className="flex flex-wrap items-center justify-center gap-1.5 bg-[#FFF2F7] px-2.5 py-1.5">
              {needsUnmute && (
                <button
                  type="button"
                  onClick={handleForceUnmute}
                  className="btn-bucin inline-flex items-center gap-1 rounded-full bg-[#FF2E7E] px-3 py-1 text-[10px] font-extrabold text-white shadow cursor-pointer"
                >
                  <Volume2 className="h-3 w-3" />
                  <span>Nyalakan Suara</span>
                </button>
              )}
              <button
                type="button"
                onClick={handleSyncToPartner}
                className="btn-bucin inline-flex items-center gap-1 rounded-full border border-[#FFD6E7] bg-white px-3 py-1 text-[10px] font-extrabold text-[#D81B6E] shadow-sm cursor-pointer"
              >
                <RefreshCw className="h-3 w-3" />
                <span>Sync ke {partnerName}</span>
              </button>
            </div>
          )}

          {/* Compact Controls: Seek + Play/Pause + Speed + Salin + Selesai Nobar */}
          <div className="space-y-1.5 px-3 py-2">
            <input
              type="range"
              min={0}
              max={duration || 100}
              value={Math.min(currentTime, duration || 100)}
              onChange={(e) => handleSeek(Number(e.target.value))}
              className="block h-1.5 w-full cursor-pointer accent-[#FF2E7E]"
            />

            <div className="flex items-center justify-between gap-2 text-[10px] font-bold tabular-nums text-[#8A6A7A]">
              <span>{formatClock(currentTime)}</span>
              <button
                type="button"
                onClick={handleTogglePlayPause}
                className="btn-bucin inline-flex items-center gap-1 rounded-full bg-gradient-to-r from-[#FF2E7E] to-[#FF7AB8] px-4 py-1 text-[11px] font-extrabold text-white shadow cursor-pointer"
              >
                {isPlaying ? (
                  <>
                    <Pause className="h-3 w-3" />
                    <span>Pause</span>
                  </>
                ) : (
                  <>
                    <Play className="h-3 w-3" />
                    <span>Play</span>
                  </>
                )}
              </button>
              <span>{formatClock(duration)}</span>
            </div>

            <div className="flex items-center justify-between gap-1.5 pt-0.5">
              <div className="flex items-center gap-1">
                {SPEED_OPTIONS.map((rate) => (
                  <button
                    key={rate}
                    type="button"
                    onClick={() => handleChangeSpeed(rate)}
                    className={`rounded-full px-2 py-0.5 text-[10px] font-extrabold cursor-pointer ${
                      playbackRate === rate
                        ? 'bg-[#FF2E7E] text-white shadow-sm'
                        : 'border border-[#FFD6E7] bg-[#FFF8FA] text-[#6E5460]'
                    }`}
                  >
                    {rate}x
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={handleCopyLink}
                  className="btn-bucin flex h-7 items-center gap-1 rounded-full border border-[#FFD6E7] bg-white px-2.5 text-[10px] font-extrabold text-[#2D0A1E] cursor-pointer"
                >
                  <Copy className="h-3 w-3" />
                  <span>Salin</span>
                </button>
                <button
                  type="button"
                  onClick={handleFinishNobar}
                  className="btn-bucin flex h-7 items-center gap-1 rounded-full border border-[#FF9EC7] bg-[#FFE3EE] px-2.5 text-[10px] font-extrabold text-[#D81B6E] cursor-pointer"
                >
                  <Square className="h-3 w-3 fill-current" />
                  <span>Selesai Nobar</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* BOTTOM SLOT (ENLARGED UPWARD): Real-Time Synced Chat Nobar Berdua (separated from Chat Biasa) */}
      <div className="keiz-card flex min-h-0 flex-1 flex-col overflow-hidden bg-white">
        {/* Distinct Chat Nobar Header + Small Wallpaper Button */}
        <div className="flex shrink-0 items-center justify-between gap-2 border-b border-[#FFD6E7] bg-[#FFF5F9] px-3 py-1.5">
          <div className="flex min-w-0 items-center gap-2">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gradient-to-r from-[#FF2E7E] to-[#FF7AB8] text-white shadow-sm">
              <Film className="h-3.5 w-3.5" />
            </span>
            <div className="min-w-0">
              <p className="truncate text-xs font-extrabold text-[#D81B6E]">
                Chat Nobar Berdua
              </p>
              <p className="truncate text-[9px] font-bold text-[#8A6A7A]">
                khusus nonton bareng · terpisah dari chat biasa
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              soundFX.playClick();
              setActiveBubbleMenu(null);
              setShowWallpaperModal(true);
            }}
            aria-label="Wallpaper chat nobar"
            title="Wallpaper chat nobar"
            className="btn-bucin flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-[#FFD6E7] bg-white text-[#E91E7A] cursor-pointer"
          >
            <ImageIcon className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Wallpapered Nobar Chat Feed */}
        <div
          onClick={() => {
            setActiveBubbleMenu(null);
            setShowInputEmojiPicker(false);
          }}
          style={getWallpaperCss(wallpaperCfg)}
          className="flex min-h-0 flex-1 flex-col space-y-2 overflow-y-auto p-3"
        >
          <div className="mx-auto shrink-0 rounded-full bg-white/85 px-2.5 py-0.5 text-[9px] font-extrabold tracking-wider text-[#D81B6E] shadow-sm backdrop-blur-[2px]">
            OBROLAN NOBAR
          </div>

          {chats.length === 0 && (
            <div className="my-auto mx-auto rounded-2xl bg-white/85 px-4 py-3 text-center shadow-sm backdrop-blur-[2px]">
              <p className="text-xs font-extrabold text-[#5C3A49]">
                Belum ada komentar nobar nih
              </p>
              <p className="mt-0.5 text-[10px] font-semibold text-[#8A6A7A]">
                Chat di sini cuma muncul di ruang Nobar berdua ya!
              </p>
            </div>
          )}

          {chats
            .filter((msg) => !msg.is_deleted)
            .map((msg) => {
            const isMine = msg.sender === currentUser;
            const bubbleColor = msg.is_deleted
              ? 'bg-slate-200 !text-slate-500'
              : isMine
              ? 'bg-[#3B82F6]'
              : 'bg-[#FF4D8D]';

            return (
              <div
                key={msg.id}
                onContextMenu={(e) => {
                  if (msg.is_deleted || msg.sending) return;
                  e.preventDefault();
                  soundFX.playClick();
                  setActiveBubbleMenu(msg.id);
                }}
                onTouchStart={(e) => {
                  if (msg.is_deleted || msg.sending) return;
                  longPressFiredRef.current = false;
                  touchStartX.current = e.touches[0].clientX;
                  touchStartY.current = e.touches[0].clientY;
                  longPressTimer.current = window.setTimeout(() => {
                    longPressFiredRef.current = true;
                    soundFX.playClick();
                    setActiveBubbleMenu(msg.id);
                  }, 520);
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
                } ${msg.react && !msg.is_deleted ? 'mb-2' : ''}`}
              >
                <div
                  data-chat-bubble="true"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (longPressFiredRef.current) {
                      longPressFiredRef.current = false;
                      return;
                    }
                    if (msg.failed) {
                      void handleRetryNobarChat(msg);
                      return;
                    }
                    if (!msg.is_deleted && !msg.sending) {
                      soundFX.playClick();
                      setActiveBubbleMenu((cur) => (cur === msg.id ? null : msg.id));
                    }
                  }}
                  className={`relative max-w-[84%] cursor-pointer rounded-2xl px-3 py-2 text-xs leading-relaxed text-white shadow-sm ${bubbleColor} ${
                    isMine ? 'rounded-br-[4px]' : 'rounded-bl-[4px]'
                  } ${msg.failed ? 'opacity-90 ring-2 ring-rose-400' : ''} ${
                    shakingBubbleId === msg.id ? 'animate-bubble-shake' : ''
                  }`}
                >
                  {msg.is_deleted ? (
                    <span className="text-[11px] italic">Pesan nobar dihapus</span>
                  ) : (
                    <>
                      {msg.reply_to_text && (
                        <div className="mb-1 rounded-lg border-l-[3px] border-white/80 bg-black/15 px-2 py-1 text-[10px]">
                          <p className="font-extrabold opacity-90">
                            {msg.reply_to_sender === 'faiz' ? 'faiz' : 'kenat'}
                          </p>
                          <p className="line-clamp-1 opacity-85">{msg.reply_to_text}</p>
                        </div>
                      )}
                      <span>{msg.message}</span>
                    </>
                  )}

                  <div className="mt-0.5 flex items-center justify-end gap-1 text-[9px] text-white/80">
                    <span>{formatTime(msg.created_at)}</span>
                    {isMine &&
                      !msg.is_deleted &&
                      (msg.sending ? (
                        <Clock className="h-2.5 w-2.5 animate-pulse text-white/75" />
                      ) : msg.failed ? (
                        <RotateCcw className="h-2.5 w-2.5 text-rose-200" />
                      ) : msg.is_read ? (
                        <CheckCheck className="h-3 w-3 text-sky-200" />
                      ) : (
                        <Check className="h-2.5 w-2.5 text-white/75" />
                      ))}
                  </div>

                  {msg.react && !msg.is_deleted && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        const rect = e.currentTarget.getBoundingClientRect();
                        void applyNobarReaction(msg, msg.react!, {
                          x: rect.left + rect.width / 2,
                          y: rect.top + rect.height / 2,
                        });
                      }}
                      title="Tap untuk hapus react"
                      className={`absolute -bottom-2.5 ${
                        isMine ? 'left-2' : 'right-2'
                      } rounded-full border border-[#FFD6E7] bg-white px-1.5 py-0.5 text-[11px] shadow cursor-pointer`}
                    >
                      {msg.react}
                    </button>
                  )}
                </div>

                {msg.failed && (
                  <button
                    type="button"
                    onClick={() => handleRetryNobarChat(msg)}
                    className="mt-1 flex items-center gap-1 rounded-full border border-rose-200 bg-rose-50 px-2.5 py-0.5 text-[10px] font-extrabold text-rose-600 shadow-sm cursor-pointer"
                  >
                    <RotateCcw className="h-3 w-3" />
                    <span>Gagal kirim, tap ulang</span>
                  </button>
                )}

                {activeBubbleMenu === msg.id && !msg.is_deleted && (
                  <div
                    data-bubble-menu="true"
                    onClick={(e) => e.stopPropagation()}
                    className={`animate-bubble-pop z-30 mt-1.5 flex max-w-[280px] flex-col gap-1.5 rounded-2xl border border-[#FFD6E7] bg-white p-2 text-[11px] font-bold shadow-xl ${
                      isMine ? 'items-end' : 'items-start'
                    }`}
                  >
                    <div className="flex flex-wrap items-center gap-1">
                      {['❤️', '😂', '😍', '🥺', '😭', '👍'].map((em) => (
                        <button
                          key={em}
                          type="button"
                          onClick={(e) => {
                            const rect = e.currentTarget.getBoundingClientRect();
                            void applyNobarReaction(msg, em, {
                              x: rect.left + rect.width / 2,
                              y: rect.top + rect.height / 2,
                            });
                          }}
                          className={`flex h-7 w-7 items-center justify-center rounded-full text-sm transition-transform active:scale-90 cursor-pointer ${
                            msg.react === em
                              ? 'bg-[#FFE3EE] ring-1 ring-[#FF2E7E]'
                              : 'bg-[#FFF5F9]'
                          }`}
                        >
                          {em}
                        </button>
                      ))}
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
                          navigator.clipboard?.writeText(msg.message).catch(() => {});
                          setActiveBubbleMenu(null);
                          showToastMsg('Teks disalin');
                        }}
                        className="rounded-lg bg-[#FFF2F7] px-2.5 py-1 text-[#2D0A1E] cursor-pointer"
                      >
                        Salin
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleDeleteNobarChat(msg.id)}
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

        {/* Replying-to Banner */}
        {replyingTo && (
          <div className="flex shrink-0 items-center justify-between border-t border-[#FFD6E7] bg-[#FFF5F9] px-3 py-1.5 text-[11px]">
            <div className="min-w-0 flex-1 border-l-[3px] border-[#FF2E7E] pl-2">
              <p className="text-[10px] font-extrabold text-[#E91E7A]">
                Membalas {replyingTo.sender === 'faiz' ? 'faiz' : 'kenat'}
              </p>
              <p className="truncate text-[#8A6A7A]">{replyingTo.message}</p>
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

        {/* Inline Emoji Picker */}
        {showInputEmojiPicker && (
          <div
            data-nobar-input-area="true"
            className="shrink-0 border-t border-[#FFD6E7] bg-white"
          >
            <EmojiPicker
              width="100%"
              height={220}
              searchPlaceholder="Cari emot..."
              emojiStyle={EmojiStyle.NATIVE}
              theme={Theme.LIGHT}
              lazyLoadEmojis
              previewConfig={{ showPreview: false }}
              onEmojiClick={handlePickerInputSelect}
            />
          </div>
        )}

        {/* Chat Nobar Input Row */}
        <form
          data-nobar-input-area="true"
          onSubmit={handleSendNobarChat}
          className="flex shrink-0 items-center gap-1.5 border-t border-[#FFD6E7] bg-white p-2"
        >
          <button
            type="button"
            onClick={() => {
              soundFX.playClick();
              setShowInputEmojiPicker((v) => !v);
            }}
            aria-label="Pilih emot nobar"
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
            value={chatText}
            onChange={(e) => setChatText(e.target.value)}
            placeholder="komentarin filmnya berdua..."
            className="h-10 min-h-[40px] flex-1 rounded-full border border-[#FFD6E7] bg-[#FFF2F7] px-3.5 text-xs font-semibold text-[#2D0A1E] placeholder-[#9A7A8A] focus:border-[#FF2E7E] focus:outline-none"
          />

          <button
            type="submit"
            aria-label="Kirim chat nobar"
            className={`btn-bucin flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-white shadow-sm cursor-pointer ${
              currentUser === 'faiz' ? 'bg-[#3B82F6]' : 'bg-[#FF4D8D]'
            }`}
          >
            <Send className="h-4 w-4" />
          </button>
        </form>
      </div>

      {/* Full Emoji Picker Popup for Reaction */}
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
                  {reactTargetMsg.message}
                </p>
              </div>
              {reactTargetMsg.react && (
                <button
                  type="button"
                  onClick={() =>
                    void applyNobarReaction(reactTargetMsg, reactTargetMsg.react!)
                  }
                  className="mr-1.5 shrink-0 rounded-full border border-rose-200 bg-rose-50 px-2.5 py-1 text-[10px] font-extrabold text-rose-600 cursor-pointer"
                >
                  Hapus react
                </button>
              )}
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
              emojiStyle={EmojiStyle.NATIVE}
              theme={Theme.LIGHT}
              lazyLoadEmojis
              previewConfig={{ showPreview: false }}
              onEmojiClick={handlePickerReactSelect}
            />
          </div>
        </div>
      )}

      {/* Nobar Chat Wallpaper Picker Modal */}
      {showWallpaperModal && (
        <ChatWallpaperModal
          currentUser={currentUser}
          config={wallpaperCfg}
          title="wallpaper chat nobar"
          subtitle="khusus ruang nobar, terpisah dari chat biasa"
          onSelect={(next) => {
            setWallpaperCfg(next);
            saveWallpaperConfig(next, NOBAR_WALLPAPER_STORAGE_KEY);
          }}
          onClose={() => setShowWallpaperModal(false)}
        />
      )}
    </div>
  );
};
