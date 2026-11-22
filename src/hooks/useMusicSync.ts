import { useCallback, useEffect, useRef, useState } from 'react';
import {
  addSongItem,
  deleteSongItem,
  fetchMusicSync,
  fetchSongs,
  subscribeMusicChannel,
  subscribeRealtime,
  toggleSongFavorite,
  upsertMusicSync,
} from '../supabaseClient';
import { soundFX } from '../sound';
import type {
  MusicSyncState,
  Role,
  SongItem,
  YTPlayerInstance,
} from '../types';

export async function resolveYouTubeVideoId(query: string): Promise<string | null> {
  // 1. Check if user pasted a direct YouTube URL
  const directMatch = query.match(
    /(?:youtube\.com\/(?:watch\?v=|shorts\/|embed\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/
  );
  if (directMatch?.[1]) return directMatch[1];

  // 2. Try local Vite dev middleware / Vercel /api/yt-search serverless function
  try {
    const res = await fetch(`/api/yt-search?q=${encodeURIComponent(query)}`);
    if (res.ok) {
      const json = (await res.json()) as { videoId?: string };
      if (json.videoId && /^[a-zA-Z0-9_-]{11}$/.test(json.videoId)) {
        return json.videoId;
      }
    }
  } catch {
    // fallback below
  }

  // 3. Public CORS fallback (Piped)
  try {
    const piped = await fetch(
      `https://pipedapi.kavin.rocks/search?q=${encodeURIComponent(query)}&filter=music_songs`
    );
    if (piped.ok) {
      const data = (await piped.json()) as { items?: { url?: string }[] };
      const firstUrl = data.items?.[0]?.url || '';
      const vidMatch = firstUrl.match(/v=([a-zA-Z0-9_-]{11})/);
      if (vidMatch?.[1]) return vidMatch[1];
    }
  } catch {
    // fallback below
  }

  // 4. Public CORS fallback (Lemnoslife)
  try {
    const fallback = await fetch(
      `https://yt.lemnoslife.com/noKey/search?part=snippet&type=video&maxResults=1&q=${encodeURIComponent(
        query
      )}`
    );
    if (fallback.ok) {
      const data = (await fallback.json()) as {
        items?: { id?: { videoId?: string } }[];
      };
      const id = data.items?.[0]?.id?.videoId;
      if (id && /^[a-zA-Z0-9_-]{11}$/.test(id)) return id;
    }
  } catch {
    // ignore
  }

  return null;
}

const PIPED_INSTANCES = [
  'https://pipedapi.kavin.rocks',
  'https://pipedapi.tokhmi.xyz',
];

async function resolveAudioStreamUrl(videoId: string): Promise<string | null> {
  for (const base of PIPED_INSTANCES) {
    try {
      const controller = new AbortController();
      const timer = window.setTimeout(() => controller.abort(), 1800);
      const res = await fetch(`${base}/streams/${encodeURIComponent(videoId)}`, {
        signal: controller.signal,
      });
      window.clearTimeout(timer);
      if (!res.ok) continue;
      const data = (await res.json()) as {
        audioStreams?: Array<{ url?: string; mimeType?: string; bitrate?: number }>;
      };
      const streams = Array.isArray(data.audioStreams) ? data.audioStreams : [];
      const preferred =
        streams.find((s) => s.url && s.mimeType?.includes('audio/mp4')) ||
        streams.find((s) => s.url && s.mimeType?.includes('audio/webm')) ||
        streams.find((s) => Boolean(s.url));
      if (preferred?.url) {
        return preferred.url;
      }
    } catch {
      // try next instance
    }
  }
  return null;
}

function computeMusicTargetTime(state: MusicSyncState): number {
  const base = state.current_time || 0;
  if (!state.is_playing || !state.updated_at) return base;
  const elapsed = Math.max(0, (Date.now() - Date.parse(state.updated_at)) / 1000);
  if (!Number.isFinite(elapsed) || elapsed > 900) return base;
  return base + elapsed;
}

export function useMusicSync(options: {
  currentUser: Role | null;
}) {
  const { currentUser } = options;

  const [queue, setQueue] = useState<SongItem[]>([]);
  const [history, setHistory] = useState<SongItem[]>([]);
  const [musicSync, setMusicSync] = useState<MusicSyncState | null>(null);
  const [activeSong, setActiveSong] = useState<SongItem | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [loadingAudio, setLoadingAudio] = useState(false);
  const [needsUnmute, setNeedsUnmute] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [musicRoomMembers, setMusicRoomMembers] = useState<Role[]>([]);

  const ytHostRef = useRef<HTMLDivElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const ytPlayerRef = useRef<YTPlayerInstance | null>(null);
  const ytReadyRef = useRef(false);
  const loadedVideoIdRef = useRef<string>('');
  const pendingStateRef = useRef<MusicSyncState | null>(null);
  const videoCacheRef = useRef<Record<string, string>>({});
  const audioUrlCacheRef = useRef<Record<string, string | null>>({});
  const backendRef = useRef<'youtube' | 'audio'>('youtube');
  const playSeqRef = useRef(0);
  const queueRef = useRef<SongItem[]>([]);
  const activeSongRef = useRef<SongItem | null>(null);
  const musicSyncRef = useRef<MusicSyncState | null>(null);
  const isPlayingRef = useRef(false);
  const currentTimeRef = useRef(0);
  const durationRef = useRef(0);
  const isRemoteSyncRef = useRef(false);
  const remoteGuardTimerRef = useRef<number | null>(null);
  const lastAppliedStampRef = useRef<string>('');

  queueRef.current = queue;
  activeSongRef.current = activeSong;
  musicSyncRef.current = musicSync;
  isPlayingRef.current = isPlaying;
  currentTimeRef.current = currentTime;
  durationRef.current = duration;

  const lockRemoteGuard = (ms = 550) => {
    isRemoteSyncRef.current = true;
    if (remoteGuardTimerRef.current) clearTimeout(remoteGuardTimerRef.current);
    remoteGuardTimerRef.current = window.setTimeout(() => {
      isRemoteSyncRef.current = false;
    }, ms);
  };

  const getActiveTime = (): number => {
    if (backendRef.current === 'audio' && audioRef.current) {
      return audioRef.current.currentTime || 0;
    }
    return ytPlayerRef.current?.getCurrentTime?.() ?? currentTimeRef.current;
  };

  const stopAudioElement = () => {
    const audio = audioRef.current;
    if (audio) {
      try {
        audio.pause();
      } catch {
        // ignore
      }
    }
  };

  const playWithYouTube = useCallback(
    (state: MusicSyncState, targetSec: number) => {
      backendRef.current = 'youtube';
      stopAudioElement();

      const player = ytPlayerRef.current;
      if (!player || !ytReadyRef.current) {
        pendingStateRef.current = state;
        setIsPlaying(state.is_playing);
        return;
      }

      lockRemoteGuard(600);
      try {
        if (loadedVideoIdRef.current !== state.videoId) {
          loadedVideoIdRef.current = state.videoId;
          player.unMute();
          player.setVolume(100);
          if (state.is_playing) {
            setLoadingAudio(true);
            player.loadVideoById(state.videoId, targetSec);
            player.playVideo();
          } else {
            player.cueVideoById(state.videoId, targetSec);
          }
        } else {
          const cur = player.getCurrentTime?.() ?? 0;
          if (Math.abs(cur - targetSec) > 1.5 || state.action === 'seek') {
            player.seekTo(targetSec, true);
          }
          if (state.is_playing) {
            player.unMute();
            player.setVolume(100);
            player.playVideo();
          } else {
            player.pauseVideo();
          }
        }
        setIsPlaying(state.is_playing);
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
      } catch {
        setNeedsUnmute(true);
      }
    },
    []
  );

  const applyRemoteMusicState = useCallback(
    (state: MusicSyncState | null, force = false) => {
      setMusicSync(state);
      if (!state || !state.videoId) return;

      const stamp = `${state.updated_at}-${state.action}-${state.videoId}-${state.is_playing}`;
      if (
        !force &&
        currentUser &&
        state.updated_by === currentUser &&
        stamp === lastAppliedStampRef.current
      ) {
        return;
      }
      lastAppliedStampRef.current = stamp;

      const mappedSong: SongItem = {
        id: state.videoId,
        title: state.title,
        artist: state.artist,
        artwork: state.thumbnail,
        youtube_query: `${state.title} ${state.artist}`,
        youtube_video_id: state.videoId,
        duration_ms: state.duration_ms || 213000,
        added_by: state.updated_by,
      };
      setActiveSong((prev) => {
        const match = queueRef.current.find(
          (q) => q.youtube_video_id === state.videoId || q.title === state.title
        );
        if (match) return { ...match, youtube_video_id: state.videoId };
        if (prev && prev.youtube_video_id === state.videoId) {
          return { ...prev, ...mappedSong, favorite: prev.favorite };
        }
        return mappedSong;
      });
      setDuration(Math.round((state.duration_ms || 213000) / 1000));

      const targetSec = computeMusicTargetTime(state);
      setCurrentTime(targetSec);

      const audio = audioRef.current;
      const seq = ++playSeqRef.current;

      // Jika native <audio> sudah memuat videoId yang sama, kontrol langsung tanpa reload
      if (
        audio &&
        backendRef.current === 'audio' &&
        audio.dataset.videoId === state.videoId &&
        audio.src
      ) {
        if (Math.abs((audio.currentTime || 0) - targetSec) > 1.5 || state.action === 'seek') {
          try {
            audio.currentTime = targetSec;
          } catch {
            // ignore
          }
        }
        if (state.is_playing) {
          audio.volume = 1;
          audio.muted = false;
          audio
            .play()
            .then(() => {
              if (playSeqRef.current !== seq) return;
              setIsPlaying(true);
              setLoadingAudio(false);
              setNeedsUnmute(false);
            })
            .catch(() => {
              if (playSeqRef.current !== seq) return;
              playWithYouTube(state, targetSec);
            });
        } else {
          audio.pause();
          setIsPlaying(false);
          setLoadingAudio(false);
        }
        return;
      }

      // Coba resolve stream audio native terlebih dulu agar background / lock-screen HP stabil;
      // jika gagal/lambat, otomatis fallback ke YouTube IFrame global.
      if (audio) {
        const cached = audioUrlCacheRef.current[state.videoId];
        if (cached === null) {
          playWithYouTube(state, targetSec);
          return;
        }

        const startWithAudioUrl = (streamUrl: string) => {
          if (playSeqRef.current !== seq || !audioRef.current) return;
          const el = audioRef.current;
          backendRef.current = 'audio';
          try {
            ytPlayerRef.current?.pauseVideo?.();
          } catch {
            // ignore
          }
          el.dataset.videoId = state.videoId;
          el.src = streamUrl;
          el.volume = 1;
          el.muted = false;
          try {
            el.currentTime = targetSec;
          } catch {
            // seek after loadedmetadata
          }
          if (state.is_playing) {
            setLoadingAudio(true);
            el.play()
              .then(() => {
                if (playSeqRef.current !== seq) return;
                setIsPlaying(true);
                setLoadingAudio(false);
                setNeedsUnmute(false);
              })
              .catch(() => {
                if (playSeqRef.current !== seq) return;
                playWithYouTube(state, targetSec);
              });
          } else {
            el.pause();
            setIsPlaying(false);
            setLoadingAudio(false);
          }
        };

        if (cached) {
          startWithAudioUrl(cached);
          return;
        }

        void resolveAudioStreamUrl(state.videoId).then((streamUrl) => {
          if (playSeqRef.current !== seq) return;
          audioUrlCacheRef.current[state.videoId] = streamUrl;
          if (streamUrl) {
            startWithAudioUrl(streamUrl);
          } else {
            playWithYouTube(state, targetSec);
          }
        });
        return;
      }

      playWithYouTube(state, targetSec);
    },
    [currentUser, playWithYouTube]
  );

  const playSongNow = useCallback(
    async (
      song: SongItem,
      actionType: MusicSyncState['action'] = 'change_song'
    ) => {
      if (!currentUser) return;
      soundFX.playPop();
      setActiveSong(song);
      setCurrentTime(0);
      setDuration(Math.round((song.duration_ms || 213000) / 1000));
      setLoadingAudio(true);
      setNeedsUnmute(false);
      setHistory((prev) => [song, ...prev.filter((h) => h.id !== song.id)]);

      try {
        ytPlayerRef.current?.unMute();
        ytPlayerRef.current?.setVolume(100);
      } catch {
        // ignore
      }

      const queryKey = song.youtube_query || `${song.title} ${song.artist}`;
      let videoId = song.youtube_video_id || videoCacheRef.current[queryKey] || null;
      if (!videoId) {
        videoId = await resolveYouTubeVideoId(queryKey);
      }

      if (!videoId) {
        setLoadingAudio(false);
        setIsPlaying(false);
        setNeedsUnmute(true);
        return false;
      }

      videoCacheRef.current[queryKey] = videoId;
      const updatedSong = { ...song, youtube_video_id: videoId };
      setActiveSong(updatedSong);

      const synced = await upsertMusicSync({
        youtube_url: `https://www.youtube.com/watch?v=${videoId}`,
        videoId,
        title: song.title,
        artist: song.artist,
        thumbnail: song.artwork,
        duration_ms: song.duration_ms || 213000,
        is_playing: true,
        current_time: 0,
        updated_by: currentUser,
        action: actionType,
      });
      applyRemoteMusicState(synced, true);
      return true;
    },
    [currentUser, applyRemoteMusicState]
  );

  // Sync queue & remote music state
  useEffect(() => {
    if (!currentUser) return;
    fetchSongs().then(setQueue);
    fetchMusicSync().then((initial) => {
      if (initial) {
        setMusicSync(initial);
        const mappedSong: SongItem = {
          id: initial.videoId,
          title: initial.title,
          artist: initial.artist,
          artwork: initial.thumbnail,
          youtube_query: `${initial.title} ${initial.artist}`,
          youtube_video_id: initial.videoId,
          duration_ms: initial.duration_ms || 213000,
          added_by: initial.updated_by,
        };
        setActiveSong(mappedSong);
        setDuration(Math.round((initial.duration_ms || 213000) / 1000));
        setCurrentTime(computeMusicTargetTime(initial));
        setIsPlaying(initial.is_playing);
      }
    });

    const unsubQueue = subscribeRealtime({
      onLagu: () => fetchSongs().then(setQueue),
    });

    const unsubMusic = subscribeMusicChannel(
      currentUser,
      (incoming) => {
        applyRemoteMusicState(incoming);
      },
      (members) => setMusicRoomMembers(members)
    );

    return () => {
      unsubQueue();
      unsubMusic();
    };
  }, [currentUser, applyRemoteMusicState]);

  // Attach native <audio> element event listeners (no pause on visibilitychange/blur/pagehide!)
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const onPlay = () => {
      if (backendRef.current !== 'audio') return;
      setIsPlaying(true);
      setLoadingAudio(false);
      setNeedsUnmute(false);
    };
    const onPause = () => {
      if (backendRef.current !== 'audio') return;
      setIsPlaying(false);
    };
    const onTimeUpdate = () => {
      if (backendRef.current !== 'audio') return;
      setCurrentTime(audio.currentTime || 0);
      if (Number.isFinite(audio.duration) && audio.duration > 0) {
        setDuration(audio.duration);
      }
    };
    const onEnded = () => {
      if (backendRef.current !== 'audio') return;
      setIsPlaying(false);
      const q = queueRef.current;
      if (q.length > 0 && musicSyncRef.current?.updated_by === currentUser) {
        const cur = activeSongRef.current;
        const idx = cur ? q.findIndex((s) => s.id === cur.id) : -1;
        const next = q[(idx + 1) % q.length];
        if (next) void playSongNow(next, 'next');
      }
    };
    const onError = () => {
      if (backendRef.current !== 'audio') return;
      const vid = audio.dataset.videoId;
      if (vid) {
        audioUrlCacheRef.current[vid] = null;
      }
      if (musicSyncRef.current && musicSyncRef.current.videoId) {
        playWithYouTube(
          musicSyncRef.current,
          computeMusicTargetTime(musicSyncRef.current)
        );
      } else {
        setLoadingAudio(false);
        setIsPlaying(false);
      }
    };

    audio.addEventListener('play', onPlay);
    audio.addEventListener('pause', onPause);
    audio.addEventListener('timeupdate', onTimeUpdate);
    audio.addEventListener('ended', onEnded);
    audio.addEventListener('error', onError);

    return () => {
      audio.removeEventListener('play', onPlay);
      audio.removeEventListener('pause', onPause);
      audio.removeEventListener('timeupdate', onTimeUpdate);
      audio.removeEventListener('ended', onEnded);
      audio.removeEventListener('error', onError);
    };
  }, [currentUser, playSongNow, playWithYouTube]);

  // Persistent Global YouTube IFrame API setup (never destroyed on tab change)
  useEffect(() => {
    if (!currentUser) return;
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
            if (pendingStateRef.current) {
              const st = pendingStateRef.current;
              pendingStateRef.current = null;
              applyRemoteMusicState(st, true);
            }
          },
          onStateChange: (ev) => {
            if (!mounted || backendRef.current !== 'youtube') return;
            if (ev.data === 1) {
              setIsPlaying(true);
              setLoadingAudio(false);
              try {
                ev.target.unMute();
                ev.target.setVolume(100);
                setNeedsUnmute(ev.target.isMuted?.() ?? false);
              } catch {
                // ignore
              }
            } else if (ev.data === 2) {
              setIsPlaying(false);
            } else if (ev.data === 0) {
              setIsPlaying(false);
              const q = queueRef.current;
              if (q.length > 0 && musicSyncRef.current?.updated_by === currentUser) {
                const cur = activeSongRef.current;
                const idx = cur ? q.findIndex((s) => s.id === cur.id) : -1;
                const next = q[(idx + 1) % q.length];
                if (next) playSongNow(next, 'next');
              }
            }
          },
          onError: () => {
            if (!mounted || backendRef.current !== 'youtube') return;
            setLoadingAudio(false);
            setIsPlaying(false);
            setNeedsUnmute(true);
          },
        },
      });
    };

    if (window.YT?.Player) {
      initPlayer();
    } else {
      const prevReady = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => {
        prevReady?.();
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
      ytReadyRef.current = false;
      try {
        ytPlayerRef.current?.destroy();
      } catch {
        // ignore
      }
      ytPlayerRef.current = null;
      loadedVideoIdRef.current = '';
    };
  }, [currentUser, applyRemoteMusicState, playSongNow]);

  // Update progress bar every 500ms while playing
  useEffect(() => {
    if (!isPlaying) return;
    const timer = window.setInterval(() => {
      if (backendRef.current === 'audio' && audioRef.current) {
        const audio = audioRef.current;
        setCurrentTime(audio.currentTime || 0);
        if (Number.isFinite(audio.duration) && audio.duration > 0) {
          setDuration(audio.duration);
        }
        return;
      }
      const player = ytPlayerRef.current;
      if (!player) return;
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
  }, [isPlaying]);

  // Broadcast live music timestamp to partner
  useEffect(() => {
    if (!currentUser || !isPlaying || !musicSync || musicSync.updated_by !== currentUser) {
      return;
    }
    const hb = window.setInterval(() => {
      const st = musicSyncRef.current;
      if (!st || !st.is_playing) return;
      const cur =
        backendRef.current === 'audio' && audioRef.current
          ? audioRef.current.currentTime || 0
          : ytPlayerRef.current?.getCurrentTime?.() ?? 0;
      upsertMusicSync({
        youtube_url: st.youtube_url,
        videoId: st.videoId,
        title: st.title,
        artist: st.artist,
        thumbnail: st.thumbnail,
        duration_ms: st.duration_ms,
        is_playing: true,
        current_time: cur,
        updated_by: currentUser,
        action: 'play',
      }).catch(() => {});
    }, 2000);
    return () => clearInterval(hb);
  }, [currentUser, isPlaying, musicSync?.videoId, musicSync?.updated_by]);

  const setDesiredPlaying = useCallback(
    async (nextPlaying: boolean) => {
      if (!currentUser) return;
      const song = activeSongRef.current;
      if (!song) {
        if (nextPlaying && queueRef.current.length > 0) {
          await playSongNow(queueRef.current[0], 'change_song');
        }
        return;
      }

      soundFX.playClick();
      const cur = getActiveTime();
      lockRemoteGuard(550);

      if (
        backendRef.current === 'audio' &&
        audioRef.current &&
        audioRef.current.src
      ) {
        try {
          if (nextPlaying) {
            audioRef.current.volume = 1;
            audioRef.current.muted = false;
            await audioRef.current.play();
          } else {
            audioRef.current.pause();
          }
        } catch {
          // fallback to YouTube if audio play blocked
          const vid = song.youtube_video_id || musicSyncRef.current?.videoId || '';
          if (vid && musicSyncRef.current) {
            playWithYouTube(
              { ...musicSyncRef.current, videoId: vid, is_playing: nextPlaying },
              cur
            );
          }
        }
      } else {
        const player = ytPlayerRef.current;
        if (player && ytReadyRef.current) {
          try {
            if (nextPlaying) {
              player.unMute();
              player.setVolume(100);
              const vid = song.youtube_video_id || musicSyncRef.current?.videoId;
              if (vid && loadedVideoIdRef.current !== vid) {
                loadedVideoIdRef.current = vid;
                player.loadVideoById(vid, cur);
              }
              player.playVideo();
            } else {
              player.pauseVideo();
            }
          } catch {
            // ignore
          }
        }
      }

      setIsPlaying(nextPlaying);

      const videoId = song.youtube_video_id || musicSyncRef.current?.videoId || '';
      if (videoId) {
        const updated = await upsertMusicSync({
          youtube_url: `https://www.youtube.com/watch?v=${videoId}`,
          videoId,
          title: song.title,
          artist: song.artist,
          thumbnail: song.artwork,
          duration_ms: song.duration_ms || 213000,
          is_playing: nextPlaying,
          current_time: cur,
          updated_by: currentUser,
          action: nextPlaying ? 'play' : 'pause',
        });
        setMusicSync(updated);
      }
    },
    [currentUser, playSongNow, playWithYouTube]
  );

  const togglePlayPause = useCallback(async () => {
    await setDesiredPlaying(!isPlayingRef.current);
  }, [setDesiredPlaying]);

  const seekTo = useCallback(
    async (seconds: number) => {
      if (!currentUser) return;
      const clamped = Math.max(0, Math.min(seconds, durationRef.current || seconds));
      setCurrentTime(clamped);
      lockRemoteGuard(550);
      if (backendRef.current === 'audio' && audioRef.current) {
        try {
          audioRef.current.currentTime = clamped;
        } catch {
          // ignore
        }
      } else {
        try {
          ytPlayerRef.current?.seekTo(clamped, true);
        } catch {
          // ignore
        }
      }
      const song = activeSongRef.current;
      const videoId = song?.youtube_video_id || musicSyncRef.current?.videoId;
      if (videoId && song) {
        const updated = await upsertMusicSync({
          youtube_url: `https://www.youtube.com/watch?v=${videoId}`,
          videoId,
          title: song.title,
          artist: song.artist,
          thumbnail: song.artwork,
          duration_ms: song.duration_ms || 213000,
          is_playing: isPlayingRef.current,
          current_time: clamped,
          updated_by: currentUser,
          action: 'seek',
        });
        setMusicSync(updated);
      }
    },
    [currentUser]
  );

  const joinLivePartnerMusic = () => {
    soundFX.playHeartBurst();
    const st = musicSyncRef.current;
    if (!st) return;
    applyRemoteMusicState(st, true);
  };

  const forceUnmute = () => {
    soundFX.playClick();
    if (backendRef.current === 'audio' && audioRef.current) {
      audioRef.current.muted = false;
      audioRef.current.volume = 1;
      audioRef.current
        .play()
        .then(() => {
          setNeedsUnmute(false);
          setIsPlaying(true);
        })
        .catch(() => {});
      return;
    }
    const player = ytPlayerRef.current;
    if (player && ytReadyRef.current) {
      try {
        player.unMute();
        player.setVolume(100);
        if (musicSyncRef.current) {
          player.seekTo(computeMusicTargetTime(musicSyncRef.current), true);
        }
        player.playVideo();
        setNeedsUnmute(false);
        setIsPlaying(true);
      } catch {
        // ignore
      }
    } else if (activeSong) {
      void playSongNow(activeSong, 'play');
    }
  };

  const prevNext = useCallback(
    (dir: -1 | 1) => {
      const q = queueRef.current;
      if (q.length === 0) return;
      const cur = activeSongRef.current;
      const idx = cur ? q.findIndex((s) => s.id === cur.id) : 0;
      const nextIdx = (idx + dir + q.length) % q.length;
      void playSongNow(q[nextIdx], dir > 0 ? 'next' : 'prev');
    },
    [playSongNow]
  );

  // Media Session API: judul lagu, artis, artwork & tombol Play / Pause / Next / Prev di lock screen & notifikasi HP
  useEffect(() => {
    if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) {
      return;
    }

    const ms = navigator.mediaSession;
    if (activeSong) {
      try {
        ms.metadata = new MediaMetadata({
          title: activeSong.title,
          artist: activeSong.artist || 'KEIZ BUCIN',
          album: 'Musik Berdua · KEIZ BUCIN',
          artwork: activeSong.artwork
            ? [
                { src: activeSong.artwork, sizes: '300x300', type: 'image/jpeg' },
                { src: '/pwa-192x192.png', sizes: '192x192', type: 'image/png' },
                { src: '/pwa-512x512.png', sizes: '512x512', type: 'image/png' },
              ]
            : [
                { src: '/pwa-192x192.png', sizes: '192x192', type: 'image/png' },
                { src: '/pwa-512x512.png', sizes: '512x512', type: 'image/png' },
              ],
        });
      } catch {
        // ignore
      }
      ms.playbackState = isPlaying ? 'playing' : 'paused';
    } else {
      ms.playbackState = 'none';
    }

    const safeSetHandler = (
      action: MediaSessionAction,
      handler: MediaSessionActionHandler | null
    ) => {
      try {
        ms.setActionHandler(action, handler);
      } catch {
        // unsupported action in this browser
      }
    };

    safeSetHandler('play', () => {
      void setDesiredPlaying(true);
    });
    safeSetHandler('pause', () => {
      void setDesiredPlaying(false);
    });
    safeSetHandler('previoustrack', () => {
      prevNext(-1);
    });
    safeSetHandler('nexttrack', () => {
      prevNext(1);
    });
    safeSetHandler('seekto', (details) => {
      if (typeof details.seekTime === 'number') {
        void seekTo(details.seekTime);
      }
    });
    safeSetHandler('seekbackward', (details) => {
      const offset = details.seekOffset || 10;
      void seekTo(Math.max(0, currentTimeRef.current - offset));
    });
    safeSetHandler('seekforward', (details) => {
      const offset = details.seekOffset || 10;
      void seekTo(currentTimeRef.current + offset);
    });
  }, [activeSong, isPlaying, prevNext, seekTo, setDesiredPlaying]);

  // Update Media Session position state while playing
  useEffect(() => {
    if (
      typeof navigator === 'undefined' ||
      !('mediaSession' in navigator) ||
      typeof navigator.mediaSession.setPositionState !== 'function'
    ) {
      return;
    }
    if (!activeSong || duration <= 0) return;
    try {
      navigator.mediaSession.setPositionState({
        duration,
        playbackRate: 1,
        position: Math.max(0, Math.min(currentTime, duration)),
      });
    } catch {
      // ignore
    }
  }, [activeSong, currentTime, duration]);

  const addToQueue = async (song: SongItem) => {
    if (!currentUser) return null;
    soundFX.playHeartBurst();
    const saved = await addSongItem({
      title: song.title,
      artist: song.artist,
      artwork: song.artwork,
      youtube_query: song.youtube_query,
      youtube_video_id: song.youtube_video_id || videoCacheRef.current[song.youtube_query],
      duration_ms: song.duration_ms,
      added_by: currentUser,
      favorite: song.favorite,
    });
    setQueue((prev) => [saved, ...prev.filter((s) => s.title !== saved.title)]);
    return saved;
  };

  const removeFromQueue = async (id: string) => {
    soundFX.playClick();
    setQueue((prev) => prev.filter((q) => q.id !== id));
    await deleteSongItem(id);
  };

  const toggleFavorite = async (id: string) => {
    soundFX.playPop();
    const target = queue.find((q) => q.id === id);
    const nextFav = !(target?.favorite ?? activeSong?.favorite ?? false);
    setQueue((prev) =>
      prev.map((q) => (q.id === id ? { ...q, favorite: nextFav } : q))
    );
    if (activeSong?.id === id) {
      setActiveSong({ ...activeSong, favorite: nextFav });
    }
    await toggleSongFavorite(id, nextFav);
  };

  return {
    ytHostRef,
    audioRef,
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
    playSongNow,
    togglePlayPause,
    seekTo,
    joinLivePartnerMusic,
    forceUnmute,
    prevNext,
    addToQueue,
    removeFromQueue,
    toggleFavorite,
    cacheVideoId: (key: string) => videoCacheRef.current[key],
  };
}
