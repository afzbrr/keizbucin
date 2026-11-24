import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ChevronRight,
  Film,
  Heart,
  Home,
  LogOut,
  MessageCircle,
  Music2,
  Pause,
  Play,
  Settings,
  User,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import { CallOverlay } from './components/CallOverlay';
import { ChatView } from './components/ChatView';
import {
  BurstLayer,
  FloatingHeartsBg,
  KangenOverlay,
  PelukOverlay,
} from './components/EffectsOverlay';
import { GaleriView } from './components/GaleriView';
import { LaguView } from './components/LaguView';
import { LoginView } from './components/LoginView';
import { NobarView } from './components/NobarView';
import { ProfilView } from './components/ProfilView';
import { Sticker3D } from './components/Sticker3D';
import { SupabaseConfigCard } from './components/SupabaseConfigCard';
import { UnekUnekView } from './components/UnekUnekView';
import { useMusicSync } from './hooks/useMusicSync';
import {
  DEFAULT_PROFILE,
  addUnekItem,
  checkSupabaseConnection,
  ensureInitialSyncRows,
  fetchProfile,
  formatPartnerPresenceText,
  getSavedSession,
  isSupabaseConfigured,
  markPresenceOfflineFast,
  onSupabaseError,
  onSupabaseReconfigured,
  setSavedSession,
  subscribeConnectionStatus,
  subscribeIncomingChatNotification,
  subscribePresence,
  subscribeRealtime,
  upsertPresence,
} from './supabaseClient';
import { soundFX } from './sound';
import type {
  AppSection,
  BurstParticle,
  CoupleProfile,
  PresenceActivity,
  PresenceState,
  Role,
} from './types';

const TANGGAL_JADIAN = new Date(2026, 7, 28); // bulan di JS 0 = Januari, jadi 7 = Agustus

const NAMA_BULAN_ID = [
  'Januari',
  'Februari',
  'Maret',
  'April',
  'Mei',
  'Juni',
  'Juli',
  'Agustus',
  'September',
  'Oktober',
  'November',
  'Desember',
];

function computeRelationshipStats(now: Date) {
  const y = now.getFullYear();
  const m = now.getMonth();
  const d = now.getDate();

  const todayUtc = Date.UTC(y, m, d);
  const startUtc = Date.UTC(
    TANGGAL_JADIAN.getFullYear(),
    TANGGAL_JADIAN.getMonth(),
    TANGGAL_JADIAN.getDate()
  );
  const totalDays = Math.max(0, Math.floor((todayUtc - startUtc) / 86400000));

  // Hitung bulan penuh dari tanggal 28 ke tanggal 28
  const rawMonths = (y - 2026) * 12 + (m - 7);
  let totalFullMonths = 0;
  let remDays = 0;

  if (todayUtc >= startUtc) {
    if (d >= 28) {
      totalFullMonths = Math.max(0, rawMonths);
      remDays = d - 28;
    } else {
      totalFullMonths = Math.max(0, rawMonths - 1);
      const prev28Utc = Date.UTC(y, m - 1, 28);
      remDays = Math.max(0, Math.floor((todayUtc - prev28Utc) / 86400000));
    }
  }

  const years = Math.floor(totalFullMonths / 12);
  const months = totalFullMonths % 12;
  const durationBreakdown =
    years > 0
      ? `${years} tahun ${months} bulan ${remDays} hari`
      : `${months} bulan ${remDays} hari`;

  // Menuju tanggal 28 terdekat di depan (atau tepat hari ini tanggal 28)
  const formatMilestoneMonths = (totalM: number): string => {
    if (totalM <= 0) return 'hari jadian';
    const yr = Math.floor(totalM / 12);
    const mo = totalM % 12;
    if (yr > 0 && mo === 0) return `${yr} tahun pacaran`;
    if (yr > 0) return `${yr} tahun ${mo} bulan pacaran`;
    return `${totalM} bulan pacaran`;
  };

  let countdownHeadline = '';
  let countdownSubline = '';

  if (d === 28 && todayUtc >= startUtc) {
    countdownHeadline = 'hari ini tanggal jadian kita! ❤️';
    const mCount = Math.max(0, (y - 2026) * 12 + (m - 7));
    countdownSubline = `${d} ${NAMA_BULAN_ID[m]} ${y} - ${formatMilestoneMonths(mCount)}`;
  } else {
    const targetDate =
      todayUtc < startUtc
        ? new Date(2026, 7, 28)
        : d < 28
        ? new Date(y, m, 28)
        : new Date(y, m + 1, 28);
    const ty = targetDate.getFullYear();
    const tm = targetDate.getMonth();
    const td = targetDate.getDate();
    const targetUtc = Date.UTC(ty, tm, td);
    const daysUntil28 = Math.max(0, Math.floor((targetUtc - todayUtc) / 86400000));
    const milestoneMonths = Math.max(0, (ty - 2026) * 12 + (tm - 7));

    countdownHeadline = `${daysUntil28} hari lagi`;
    countdownSubline = `${td} ${NAMA_BULAN_ID[tm]} ${ty} - ${formatMilestoneMonths(milestoneMonths)}`;
  }

  // Progress menuju 1 tahun (atau ulang tahun berikutnya jika sudah >= 1 tahun)
  let progressPercent = 0;
  let progressLabel = '';

  if (totalDays < 365) {
    const daysLeftOneYear = Math.max(0, 365 - totalDays);
    progressPercent = Math.min(100, Math.max(0, Math.floor((totalDays / 365) * 100)));
    progressLabel = `${daysLeftOneYear} hari lagi menuju 1 tahun - 28 Agustus 2027`;
  } else if (m === 7 && d === 28) {
    const annivYearCount = Math.max(1, y - 2026);
    progressPercent = 100;
    progressLabel = `tepat ${annivYearCount} tahun pacaran - 28 Agustus ${y}`;
  } else {
    const nextAnnivYear = m > 7 || (m === 7 && d > 28) ? y + 1 : y;
    const prevAnnivYear = nextAnnivYear - 1;
    const prevAnnivUtc = Date.UTC(prevAnnivYear, 7, 28);
    const nextAnnivUtc = Date.UTC(nextAnnivYear, 7, 28);
    const spanDays = Math.max(365, Math.floor((nextAnnivUtc - prevAnnivUtc) / 86400000));
    const elapsedYearDays = Math.max(0, Math.floor((todayUtc - prevAnnivUtc) / 86400000));
    const daysLeft = Math.max(0, Math.floor((nextAnnivUtc - todayUtc) / 86400000));
    const targetYearNumber = nextAnnivYear - 2026;
    progressPercent = Math.min(100, Math.max(0, Math.floor((elapsedYearDays / spanDays) * 100)));
    progressLabel = `${daysLeft} hari lagi menuju ${targetYearNumber} tahun - 28 Agustus ${nextAnnivYear}`;
  }

  return {
    totalDays,
    durationBreakdown,
    countdownHeadline,
    countdownSubline,
    progressPercent,
    progressLabel,
  };
}

function sectionToActivity(section: AppSection, inCall: boolean): PresenceActivity {
  if (inCall) return 'di Call';
  switch (section) {
    case 'chat':
      return 'di Chat';
    case 'nobar':
      return 'di Nobar';
    case 'lagu':
      return 'di Musik';
    case 'profil':
      return 'di Profil';
    case 'galeri':
      return 'di Album';
    case 'unek':
      return 'di Unek Unek';
    default:
      return 'di Home';
  }
}

function sectionFromPath(pathname: string): AppSection {
  const clean = pathname.replace(/\/+$/, '').toLowerCase();
  switch (clean) {
    case '/chat':
      return 'chat';
    case '/nobar':
      return 'nobar';
    case '/musik':
      return 'lagu';
    case '/profil':
      return 'profil';
    case '/album':
      return 'galeri';
    case '/unek':
      return 'unek';
    default:
      return 'home';
  }
}

function pathFromSection(section: AppSection): string {
  switch (section) {
    case 'chat':
      return '/chat';
    case 'nobar':
      return '/nobar';
    case 'lagu':
      return '/musik';
    case 'profil':
      return '/profil';
    case 'galeri':
      return '/album';
    case 'unek':
      return '/unek';
    default:
      return '/';
  }
}

export default function App() {
  const [supabaseReady, setSupabaseReady] = useState<boolean>(() =>
    isSupabaseConfigured()
  );
  const [supabaseToast, setSupabaseToast] = useState<string | null>(null);
  const [errorBannerDismissed, setErrorBannerDismissed] = useState(false);
  const [currentUser, setCurrentUser] = useState<Role | null>(() =>
    getSavedSession()
  );
  const [section, setSection] = useState<AppSection>(() =>
    typeof window !== 'undefined' ? sectionFromPath(window.location.pathname) : 'home'
  );
  const [profile, setProfile] = useState<CoupleProfile>(DEFAULT_PROFILE);
  const [muted, setMuted] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  // Call Berdua & Audio Ducking states
  const [callModalOpen, setCallModalOpen] = useState(false);
  const [inCall, setInCall] = useState(false);
  const [callMusicVolume, setCallMusicVolume] = useState(30);

  // Real-time Presence states
  const [presenceMap, setPresenceMap] = useState<Record<Role, PresenceState | null>>({
    faiz: null,
    kenat: null,
  });
  const [presenceToast, setPresenceToast] = useState<string | null>(null);
  const [activeNobarTitle, setActiveNobarTitle] = useState('');
  const [presenceClock, setPresenceClock] = useState(() => Date.now());
  const [todayTick, setTodayTick] = useState(() => new Date());
  const [nobarJoinSignal, setNobarJoinSignal] = useState(0);
  const [incomingChatBanner, setIncomingChatBanner] = useState<{
    id: string;
    sender: Role;
    text: string;
  } | null>(null);
  const prevPartnerActivityRef = useRef<string>('');
  const sectionRef = useRef<AppSection>(section);
  sectionRef.current = section;
  const incomingBannerTimerRef = useRef<number | null>(null);

  // Avatar jump & speech bubbles
  const [faizJump, setFaizJump] = useState(false);
  const [kenatJump, setKenatJump] = useState(false);
  const [faizBubble, setFaizBubble] = useState<string | null>(null);

  // Fullscreen event states
  const [pelukActive, setPelukActive] = useState(false);
  const [kangenActive, setKangenActive] = useState(false);

  // Burst particles engine
  const [particles, setParticles] = useState<BurstParticle[]>([]);
  const particlesRef = useRef<BurstParticle[]>([]);
  const rafRef = useRef<number | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);

  // Persistent Synced Music Player
  const music = useMusicSync({
    currentUser,
  });

  useEffect(() => {
    const unsubReconfig = onSupabaseReconfigured(() => {
      setSupabaseReady(isSupabaseConfigured());
    });
    const unsubConn = subscribeConnectionStatus((state) => {
      if (state.ok) {
        setSupabaseToast(null);
      } else if (state.status === 'error' && isSupabaseConfigured()) {
        setSupabaseToast(state.message);
      }
    });
    const unsubError = onSupabaseError((msg) => {
      setSupabaseToast(msg);
    });
    return () => {
      unsubReconfig();
      unsubConn();
      unsubError();
    };
  }, []);

  useEffect(() => {
    const onPopState = () => {
      setSection(sectionFromPath(window.location.pathname));
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  const loadProfile = useCallback(async () => {
    if (!supabaseReady) return;
    const p = await fetchProfile();
    setProfile(p);
  }, [supabaseReady]);

  useEffect(() => {
    if (!supabaseReady) return;
    void checkSupabaseConnection().then((res) => {
      if (res.ok) {
        void ensureInitialSyncRows();
        void loadProfile();
      }
    });
    const unsub = subscribeRealtime({
      onProfil: () => loadProfile(),
    });
    return unsub;
  }, [supabaseReady, loadProfile]);

  const partnerRole: Role = currentUser === 'faiz' ? 'kenat' : 'faiz';
  const partnerName =
    partnerRole === 'kenat' ? profile.kenatName : profile.faizName;
  const partnerPresence = presenceMap[partnerRole] ?? null;

  // Tick clock every 10s so relative last-seen text and relationship date counter auto-update daily
  useEffect(() => {
    const syncNow = () => {
      setPresenceClock(Date.now());
      setTodayTick(new Date());
    };
    const id = window.setInterval(syncNow, 10_000);
    window.addEventListener('focus', syncNow);
    document.addEventListener('visibilitychange', syncNow);
    return () => {
      window.clearInterval(id);
      window.removeEventListener('focus', syncNow);
      document.removeEventListener('visibilitychange', syncNow);
    };
  }, []);

  // Clear stale nobar title once user leaves Nobar
  useEffect(() => {
    if (section !== 'nobar' && activeNobarTitle) {
      setActiveNobarTitle('');
    }
  }, [section, activeNobarTitle]);

  // Subscribe to real-time couple presence
  useEffect(() => {
    if (!currentUser || !supabaseReady) return;
    const unsub = subscribePresence(currentUser, (map) => {
      setPresenceMap(map);
      const partner = map[partnerRole];
      const disp = formatPartnerPresenceText(partnerName, partner);
      if (disp.online && partner) {
        const key = `${partner.lagi_ngapain}|${partner.lagi_play_apa}`;
        if (
          prevPartnerActivityRef.current &&
          prevPartnerActivityRef.current !== key
        ) {
          setPresenceToast(disp.label);
          window.setTimeout(() => setPresenceToast(null), 3200);
        }
        prevPartnerActivityRef.current = key;
      } else {
        prevPartnerActivityRef.current = '';
      }
    });
    return unsub;
  }, [currentUser, supabaseReady, partnerRole, partnerName]);

  // Clear incoming chat banner immediately when entering Chat
  useEffect(() => {
    if (section === 'chat' && incomingChatBanner) {
      if (incomingBannerTimerRef.current) {
        window.clearTimeout(incomingBannerTimerRef.current);
        incomingBannerTimerRef.current = null;
      }
      setIncomingChatBanner(null);
    }
  }, [section, incomingChatBanner]);

  // Global in-app notification banner when partner sends a new chat while user is not in Chat
  useEffect(() => {
    if (!currentUser || !supabaseReady) return;
    const unsub = subscribeIncomingChatNotification(currentUser, (msg) => {
      if (sectionRef.current === 'chat') return;
      const senderRole: Role =
        msg.sender.toLowerCase() === 'kenat' ? 'kenat' : 'faiz';
      if (incomingBannerTimerRef.current) {
        window.clearTimeout(incomingBannerTimerRef.current);
      }
      setIncomingChatBanner({
        id: msg.id,
        sender: senderRole,
        text: `ada chat masuk dari ${senderRole}, buka chat yu`,
      });
      try {
        navigator?.vibrate?.(100);
      } catch {
        // ignore
      }
      soundFX.playPop();
      incomingBannerTimerRef.current = window.setTimeout(() => {
        setIncomingChatBanner(null);
        incomingBannerTimerRef.current = null;
      }, 5000);
    });
    return () => {
      unsub();
      if (incomingBannerTimerRef.current) {
        window.clearTimeout(incomingBannerTimerRef.current);
        incomingBannerTimerRef.current = null;
      }
    };
  }, [currentUser, supabaseReady]);

  // Broadcast own live activity into presence_keiz & Supabase Presence + 12s heartbeat
  const broadcastOnlinePresence = useCallback(() => {
    if (!currentUser) return;
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
      return;
    }
    const activity = sectionToActivity(section, inCall || callModalOpen);
    const playApa =
      section === 'nobar'
        ? activeNobarTitle || 'Video YouTube'
        : music.isPlaying && music.activeSong
        ? `MUSIC:${music.activeSong.title}`
        : '';

    upsertPresence({
      user: currentUser,
      status: 'online',
      lagi_ngapain: activity,
      lagi_play_apa: playApa,
      last_seen: new Date().toISOString(),
    });
  }, [
    currentUser,
    section,
    inCall,
    callModalOpen,
    activeNobarTitle,
    music.isPlaying,
    music.activeSong,
  ]);

  useEffect(() => {
    if (!currentUser) return;
    broadcastOnlinePresence();
    const hb = window.setInterval(broadcastOnlinePresence, 12_000);
    return () => window.clearInterval(hb);
  }, [currentUser, broadcastOnlinePresence]);

  // Mark offline accurately when tab goes hidden / closed, and online when returning (do NOT touch music audio)
  useEffect(() => {
    if (!currentUser) return;
    const handleVisibility = () => {
      if (document.visibilityState === 'hidden') {
        markPresenceOfflineFast(currentUser);
      } else if (document.visibilityState === 'visible') {
        broadcastOnlinePresence();
      }
    };
    const handleUnload = () => {
      markPresenceOfflineFast(currentUser);
    };
    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('pagehide', handleUnload);
    window.addEventListener('beforeunload', handleUnload);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('pagehide', handleUnload);
      window.removeEventListener('beforeunload', handleUnload);
    };
  }, [currentUser, broadcastOnlinePresence]);

  const handleSetUser = (role: Role) => {
    setCurrentUser(role);
    setSavedSession(role);
  };

  const handleLogout = () => {
    if (currentUser) {
      upsertPresence({
        user: currentUser,
        status: 'offline',
        lagi_ngapain: 'di Home',
        lagi_play_apa: '',
        last_seen: new Date().toISOString(),
      });
    }
    setSavedSession(null);
    setCurrentUser(null);
    setSection('home');
    if (window.location.pathname !== '/') {
      window.history.pushState(null, '', '/');
    }
    setShowSettings(false);
  };

  const runPhysics = useCallback(() => {
    if (particlesRef.current.length === 0) {
      rafRef.current = null;
      return;
    }
    particlesRef.current = particlesRef.current
      .map((p) => ({
        ...p,
        x: p.x + p.vx,
        y: p.y + p.vy,
        vy: p.vy + 0.35,
        rotation: p.rotation + p.vx * 1.5,
      }))
      .filter(
        (p) =>
          p.y < window.innerHeight + 60 &&
          p.x > -60 &&
          p.x < window.innerWidth + 60
      );

    setParticles([...particlesRef.current]);
    if (particlesRef.current.length > 0) {
      rafRef.current = requestAnimationFrame(runPhysics);
    } else {
      rafRef.current = null;
    }
  }, []);

  const spawnBurst = useCallback(
    (
      originX: number,
      originY: number,
      count: number,
      emojis: string[],
      colors: string[]
    ) => {
      const next: BurstParticle[] = Array.from({ length: count }, (_, i) => {
        const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.4;
        const speed = 4 + Math.random() * 7;
        return {
          id: `p-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 6)}`,
          x: originX,
          y: originY,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed - 3.5,
          color: colors[i % colors.length],
          emoji: emojis[i % emojis.length],
          size: 16 + Math.floor(Math.random() * 14),
          rotation: Math.random() * 360,
        };
      });
      particlesRef.current = [...particlesRef.current, ...next];
      setParticles([...particlesRef.current]);
      if (!rafRef.current) {
        rafRef.current = requestAnimationFrame(runPhysics);
      }
    },
    [runPhysics]
  );

  useEffect(() => {
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  const handleHeartBurstAt = useCallback(
    (x: number, y: number) => {
      spawnBurst(
        x,
        y,
        14,
        ['heart', 'heart', 'heart', 'heart'],
        ['#FF4D8D', '#3B82F6']
      );
    },
    [spawnBurst]
  );

  const handleLoginSuccess = (role: Role, x: number, y: number) => {
    spawnBurst(
      x,
      y,
      24,
      ['heart', 'heart', 'heart', 'heart'],
      ['#FF4D8D', '#3B82F6']
    );
    setTimeout(() => {
      handleSetUser(role);
      setSection('home');
      if (window.location.pathname !== '/') {
        window.history.pushState(null, '', '/');
      }
    }, 550);
  };

  const handleAvatarTap = (who: Role, e: React.MouseEvent) => {
    e.stopPropagation();
    const rect = e.currentTarget.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    soundFX.playHeartBurst();

    if (who === 'faiz') {
      setFaizJump(false);
      requestAnimationFrame(() => setFaizJump(true));
      setFaizBubble('faiz lagi kangen kenat nih');
      spawnBurst(cx, cy, 12, ['heart', 'heart', 'heart'], ['#3B82F6', '#60A5FA']);
      setTimeout(() => setFaizJump(false), 600);
      setTimeout(() => setFaizBubble(null), 2200);
    } else {
      setKenatJump(false);
      requestAnimationFrame(() => setKenatJump(true));
      setFaizBubble('kenat lagi kangen faiz nihh');
      spawnBurst(cx, cy, 12, ['heart', 'heart', 'heart'], ['#FF4D8D', '#F472B6']);
      setTimeout(() => setKenatJump(false), 600);
      setTimeout(() => setFaizBubble(null), 2200);
    }
  };

  const handleTriggerPeluk = () => {
    soundFX.playHug();
    setPelukActive(true);
    setTimeout(() => setPelukActive(false), 3100);
  };

  const handleTriggerKangen = () => {
    soundFX.playKangen();
    setKangenActive(true);
    setTimeout(() => setKangenActive(false), 3100);
  };

  const toggleMute = () => {
    const next = !muted;
    soundFX.muted = next;
    setMuted(next);
    if (!next) soundFX.playClick();
  };

  const openSection = (target: AppSection) => {
    soundFX.playPop();
    if (target === 'nobar' && partnerPresenceDisplay.isWatchingNobar) {
      setNobarJoinSignal(Date.now());
    }
    setSection(target);
    const nextPath = pathFromSection(target);
    if (window.location.pathname !== nextPath) {
      window.history.pushState(null, '', nextPath);
    }
    scrollContainerRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleForwardToUnek = async (text: string) => {
    if (!currentUser) return;
    await addUnekItem({
      author: currentUser,
      text,
    });
    spawnBurst(
      window.innerWidth / 2,
      window.innerHeight / 2,
      14,
      ['heart', 'heart', 'heart'],
      ['#FF4D8D', '#3B82F6']
    );
  };

  const isFaiz = currentUser === 'faiz';

  const partnerPresenceDisplay = formatPartnerPresenceText(
    partnerName,
    partnerPresence,
    presenceClock
  );

  const relationshipStats = computeRelationshipStats(todayTick);

  const handleJoinPartnerNobar = () => {
    setNobarJoinSignal(Date.now());
    openSection('nobar');
  };

  return (
    <div className="paper-texture relative flex h-dvh w-full flex-col overflow-hidden bg-gradient-to-b from-[#FFF2F7] to-[#FFE4EF] text-[#2D0A1E]">
      {/* Persistent Global Audio + 1x1 Hidden YouTube Music Player (never unmounts across pages!) */}
      {currentUser && (
        <>
          <audio
            ref={music.audioRef}
            playsInline
            preload="auto"
            className="hidden"
          />
          <div
            style={{
              width: '1px',
              height: '1px',
              opacity: 0,
              position: 'fixed',
              bottom: 0,
              left: 0,
              pointerEvents: 'none',
              overflow: 'hidden',
            }}
          >
            <div id="youtube-player" ref={music.ytHostRef} />
          </div>
        </>
      )}

      {/* Soft blurred pink blobs in corners */}
      <div
        className="pointer-events-none fixed -left-24 -top-24 z-0 h-72 w-72 rounded-full bg-[#FF7AB8]/20 blur-3xl"
        aria-hidden="true"
      />
      <div
        className="pointer-events-none fixed -bottom-24 -right-24 z-0 h-80 w-80 rounded-full bg-[#FF2E7E]/15 blur-3xl"
        aria-hidden="true"
      />

      {/* Random pink pencil doodle layer */}
      <svg
        className="pointer-events-none fixed inset-0 z-0 h-full w-full opacity-[0.22]"
        aria-hidden="true"
      >
        <path
          d="M36 95 C30 85, 18 90, 24 102 C28 110, 36 113, 36 113 C36 113, 44 110, 48 102 C54 90, 42 85, 36 95 Z"
          fill="none"
          stroke="#FF4D8D"
          strokeWidth="1.8"
          strokeDasharray="3 2"
        />
        <path
          d="M360 150 L364 160 L374 162 L366 169 L368 179 L360 173 L352 179 L354 169 L346 162 L356 160 Z"
          fill="none"
          stroke="#FF7AB8"
          strokeWidth="1.7"
        />
        <path
          d="M28 420 Q 45 405, 62 420 T 94 420"
          fill="none"
          stroke="#FF4D8D"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
        <path
          d="M340 530 C334 522, 324 526, 329 536 C333 542, 340 545, 340 545 C340 545, 347 542, 351 536 C356 526, 346 522, 340 530 Z"
          fill="none"
          stroke="#3B82F6"
          strokeWidth="1.6"
        />
      </svg>

      {/* Continuous Floating Background Hearts */}
      <FloatingHeartsBg />

      {/* Physics Burst Particles Layer */}
      <BurstLayer particles={particles} />

      {/* Global In-App Incoming Chat Banner (only outside Chat page, max 1 latest, auto-hide 5s) */}
      {currentUser && incomingChatBanner && section !== 'chat' && (
        <div
          onClick={() => {
            if (incomingBannerTimerRef.current) {
              window.clearTimeout(incomingBannerTimerRef.current);
              incomingBannerTimerRef.current = null;
            }
            setIncomingChatBanner(null);
            openSection('chat');
          }}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              if (incomingBannerTimerRef.current) {
                window.clearTimeout(incomingBannerTimerRef.current);
                incomingBannerTimerRef.current = null;
              }
              setIncomingChatBanner(null);
              openSection('chat');
            }
          }}
          className="animate-bubble-pop fixed left-1/2 top-3 z-50 flex w-[calc(100%-24px)] max-w-[406px] -translate-x-1/2 items-center justify-between gap-2.5 rounded-2xl border border-[#FF9EC7] bg-[#FFE3EE] px-3.5 py-2.5 text-[#2D0A1E] shadow-[0_10px_28px_rgba(255,46,126,0.28)] backdrop-blur-md cursor-pointer"
        >
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-extrabold tracking-wide text-[#D81B6E]">
              {incomingChatBanner.sender}
            </p>
            <p className="truncate text-xs font-extrabold text-[#2D0A1E]">
              {incomingChatBanner.text}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <span className="rounded-full bg-gradient-to-r from-[#FF2E7E] to-[#FF7AB8] px-3 py-1.5 text-[10px] font-extrabold text-white shadow-sm">
              buka chat
            </span>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                if (incomingBannerTimerRef.current) {
                  window.clearTimeout(incomingBannerTimerRef.current);
                  incomingBannerTimerRef.current = null;
                }
                setIncomingChatBanner(null);
              }}
              aria-label="Tutup notifikasi chat"
              className="flex h-7 w-7 items-center justify-center rounded-full bg-white/80 text-[#8A6A7A] hover:bg-white cursor-pointer"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* Live Partner Activity Transition Toast */}
      {currentUser && presenceToast && (!supabaseToast || errorBannerDismissed) && (
        <div className="animate-bubble-pop fixed left-1/2 top-14 z-40 flex max-w-[92vw] -translate-x-1/2 items-center gap-2 rounded-full border border-[#FFD6E7] bg-white/95 px-4 py-1.5 text-[11px] font-extrabold text-[#D81B6E] shadow-lg backdrop-blur-md">
          <span className="truncate">{presenceToast}</span>
          {partnerPresenceDisplay.isWatchingNobar && section !== 'nobar' && (
            <button
              type="button"
              onClick={() => {
                setPresenceToast(null);
                handleJoinPartnerNobar();
              }}
              className="btn-bucin shrink-0 rounded-full bg-[#FF2E7E] px-2.5 py-0.5 text-[10px] font-extrabold text-white cursor-pointer"
            >
              Join Nonton
            </button>
          )}
        </div>
      )}

      {/* Dismissible Supabase Connection Error Toast (only when real query error/timeout & not dismissed) */}
      {supabaseReady && supabaseToast && !errorBannerDismissed && (
        <div className="animate-bubble-pop fixed left-1/2 top-4 z-50 flex w-[calc(100%-32px)] max-w-[398px] -translate-x-1/2 items-center justify-between gap-2 rounded-2xl border border-rose-200 bg-rose-50/95 px-4 py-2.5 text-[12px] font-extrabold text-rose-700 shadow-lg backdrop-blur-md">
          <span className="flex-1 text-left leading-snug">{supabaseToast}</span>
          <button
            type="button"
            onClick={() => {
              setErrorBannerDismissed(true);
              setSupabaseToast(null);
            }}
            aria-label="Tutup peringatan Supabase"
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-rose-100 text-rose-700 hover:bg-rose-200 cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Peluk & Kangen Overlays + Call Overlay */}
      {supabaseReady && currentUser && (
        <>
          <PelukOverlay
            active={pelukActive}
            senderName={isFaiz ? profile.faizName : profile.kenatName}
          />
          <KangenOverlay
            active={kangenActive}
            senderName={isFaiz ? profile.faizName : profile.kenatName}
          />
          <CallOverlay
            currentUser={currentUser}
            profile={profile}
            openModal={callModalOpen}
            onRequestOpen={() => setCallModalOpen(true)}
            onRequestClose={() => setCallModalOpen(false)}
            onCallActiveChange={setInCall}
            callMusicVolume={callMusicVolume}
            onCallMusicVolumeChange={setCallMusicVolume}
            musicActiveTitle={music.isPlaying ? music.activeSong?.title : undefined}
          />
        </>
      )}

      {/* SETUP SUPABASE WHEN NEITHER MANUAL ENV NOR VERCEL ENV IS FILLED */}
      {!supabaseReady ? (
        <div className="relative z-10 mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-4 overflow-y-auto px-4 py-6">
          <div className="keiz-card space-y-3 border border-[#FFD6E7] bg-white/95 p-5">
            <div className="flex items-center gap-2.5">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-[#FFD6E7] bg-[#FFE3EE]">
                <Heart className="h-5 w-5 fill-[#FF2E7E] text-[#FF2E7E]" />
              </div>
              <div>
                <p className="font-display text-lg font-extrabold text-[#2D0A1E]">
                  KEIZ BUCIN
                </p>
                <p className="text-[11px] font-bold text-[#8A6A7A]">
                  Setup koneksi Supabase dulu ya
                </p>
              </div>
            </div>

            <div className="rounded-2xl border border-[#FFD6E7] bg-[#FFF2F7] p-3.5">
              <p className="text-xs font-extrabold leading-relaxed text-[#D81B6E]">
                Isi URL &amp; Anon Key Supabase di bawah (atau lewat VITE_SUPABASE_URL di Vercel Env) lalu klik Simpan &amp; Test Koneksi.
              </p>
            </div>
          </div>

          <SupabaseConfigCard onConnected={() => setSupabaseReady(true)} />
        </div>
      ) : !currentUser ? (
        <div className="relative z-10 min-h-0 flex-1 overflow-y-auto">
          <LoginView profile={profile} onSuccess={handleLoginSuccess} />
        </div>
      ) : (
        /* MAIN FULL-HEIGHT CONTAINER MAX-W-MD (IDENTICAL ON WEB & PWA) */
        <div
          className={`relative z-10 mx-auto flex h-dvh w-full max-w-md flex-1 flex-col overflow-hidden pt-[env(safe-area-inset-top)] ${
            pelukActive ? 'animate-screen-shake' : ''
          }`}
        >
          {section === 'chat' ? (
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden px-3 pt-2 pb-1">
              <ChatView
                profile={profile}
                currentUser={currentUser}
                partnerPresence={partnerPresence}
                onBack={() => openSection('home')}
                onNavigate={openSection}
                onStartCall={() => setCallModalOpen(true)}
                onForwardToUnek={handleForwardToUnek}
                onHeartBurstAt={handleHeartBurstAt}
              />
            </div>
          ) : (
            <div
              ref={scrollContainerRef}
              className="min-h-0 flex-1 overflow-y-auto px-4 pt-2.5 pb-2"
            >
              {section === 'home' ? (
                <div className="flex min-h-full flex-col gap-[16px]">
                  {/* Top Bar: left heart + KEIZ BUCIN, right settings */}
                  <header className="flex h-[52px] shrink-0 items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-[#FFD6E7] bg-[#FFE3EE] shadow-sm">
                        <Heart className="h-[22px] w-[22px] fill-[#FF2E7E] text-[#FF2E7E]" />
                      </div>
                      <p className="font-display text-[19px] font-extrabold leading-tight tracking-tight text-[#2D0A1E]">
                        KEIZ BUCIN
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        soundFX.playClick();
                        setShowSettings(true);
                      }}
                      aria-label="Pengaturan"
                      className="btn-bucin flex h-[40px] w-[40px] shrink-0 items-center justify-center rounded-full border border-[#FFD6E7] bg-white text-[#8A6A7A] shadow-sm cursor-pointer"
                    >
                      <Settings className="h-5 w-5" />
                    </button>
                  </header>

                  {/* Greeting */}
                  <div>
                    <h1 className="font-display text-[30px] font-extrabold leading-[1.12] text-[#2D0A1E]">
                      {isFaiz
                        ? `Halo, ${profile.faizName}`
                        : `Halo, ${profile.kenatName}`}
                    </h1>
                    <p className="mt-1 text-[13px] font-bold text-[#8A6A7A]">
                      Yuk, lihat ada apa hari ini
                    </p>
                  </div>

                  {/* POLAROID CARD: PROFIL KEIZ BUCIN (1 Orang Sesuai Login) */}
                  <div
                    onClick={() => openSection('profil')}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') openSection('profil');
                    }}
                    className="keiz-sticker-card menu-card-bucin relative flex -rotate-[0.8deg] items-center gap-4 bg-white p-4 pt-5 cursor-pointer"
                  >
                    <div className="washi-tape absolute left-1/2 -top-2.5 h-5 w-20 -translate-x-1/2 -rotate-2 rounded-sm" />

                    {faizBubble && (
                      <div
                        className={`animate-bubble-pop absolute -top-8 left-4 z-20 rounded-full px-3 py-1 text-[11px] font-bold text-white shadow ${
                          isFaiz ? 'bg-[#3B82F6]' : 'bg-[#FF4D8D]'
                        }`}
                      >
                        {faizBubble}
                      </div>
                    )}

                    {/* Left: Single 64px photo for active login only */}
                    <button
                      type="button"
                      onClick={(e) => handleAvatarTap(currentUser, e)}
                      className={`relative shrink-0 cursor-pointer focus:outline-none ${
                        (isFaiz ? faizJump : kenatJump)
                          ? 'animate-avatar-jump'
                          : 'animate-dance-wobble'
                      }`}
                    >
                      <img
                        src={isFaiz ? profile.faizPhoto : profile.kenatPhoto}
                        alt={isFaiz ? profile.faizName : profile.kenatName}
                        className={`h-[64px] w-[64px] rounded-full border-4 bg-white object-cover shadow-md ${
                          isFaiz ? 'border-[#3B82F6]' : 'border-[#FF4D8D]'
                        }`}
                      />
                    </button>

                    {/* Right */}
                    <div className="min-w-0 flex-1">
                      <p className="text-[10px] font-extrabold tracking-[1px] text-[#FF2E7E]">
                        PROFIL KEIZ BUCIN
                      </p>
                      <p className="font-display text-[22px] font-extrabold leading-tight text-[#2D0A1E]">
                        {isFaiz ? profile.faizName : profile.kenatName}
                      </p>
                      <p className="mt-0.5 text-[13px] font-semibold leading-snug text-[#5C3A49]">
                        Tanggal pacaran
                      </p>
                      <p className="text-[13px] font-bold leading-snug text-[#2D0A1E]">
                        28 Agustus 2026
                      </p>
                      <p className="mt-0.5 text-[11px] font-semibold text-[#8A6A7A]">
                        {isFaiz
                          ? `Pasangannya ${profile.kenatName}`
                          : `Pasangannya ${profile.faizName}`}
                      </p>
                    </div>

                    <ChevronRight className="h-5 w-5 shrink-0 text-[#8A6A7A]" />
                  </div>

              {/* Section Jelajahi KEIZ BUCIN ([ Profil | Call Berdua ] + Live Partner Presence) */}
              <div>
                <h2 className="font-display mb-2.5 text-[22px] font-extrabold leading-tight text-[#4A0E32]">
                  Jelajahi KEIZ BUCIN
                </h2>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => openSection('profil')}
                    className="keiz-sticker-card menu-card-bucin relative flex h-[116px] -rotate-1 flex-col justify-between bg-[#FFFDF9] p-[14px] text-left cursor-pointer"
                  >
                    <div className="flex items-start justify-between">
                      <Sticker3D kind="search" className="menu-icon h-10 w-10" />
                      <ChevronRight className="h-4 w-4 text-[#D81B6E]" />
                    </div>
                    <div>
                      <p className="font-display text-[17px] font-extrabold leading-tight text-[#2D0A1E]">
                        Profil
                      </p>
                      <p className="text-[12px] font-semibold leading-tight text-[#8A6A7A]">
                        Identitas KEIZ BUCIN kamu
                      </p>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      soundFX.playPop();
                      setCallModalOpen(true);
                    }}
                    className="keiz-sticker-card menu-card-bucin relative flex h-[116px] rotate-1 flex-col justify-between bg-[#FFF5F9] p-[14px] text-left cursor-pointer"
                  >
                    <div className="flex items-start justify-between">
                      <Sticker3D kind="call" className="menu-icon h-10 w-10" />
                      <ChevronRight className="h-4 w-4 text-[#D81B6E]" />
                    </div>
                    <div>
                      <p className="font-display text-[17px] font-extrabold leading-tight text-[#2D0A1E]">
                        Call Berdua
                      </p>
                      <p className="text-[12px] font-semibold leading-tight text-[#8A6A7A]">
                        Telepon mesra berdua
                      </p>
                    </div>
                  </button>
                </div>

                {/* Live Partner Activity Banner right under [ Profil | Call Berdua ] */}
                <div className="mt-2.5 flex items-center justify-between gap-2 rounded-full border border-[#FFD6E7] bg-white/95 px-3.5 py-2 shadow-sm">
                  <div className="flex min-w-0 items-center gap-2">
                    <span
                      className={`h-2.5 w-2.5 shrink-0 rounded-full ${
                        partnerPresenceDisplay.online
                          ? 'bg-emerald-500 animate-pulse'
                          : 'bg-slate-300'
                      }`}
                    />
                    <p className="truncate text-[11px] font-extrabold text-[#2D0A1E]">
                      {partnerPresenceDisplay.label}
                    </p>
                  </div>
                  {partnerPresenceDisplay.isWatchingNobar && (
                    <button
                      type="button"
                      onClick={handleJoinPartnerNobar}
                      className="btn-bucin inline-flex shrink-0 items-center gap-1 rounded-full bg-gradient-to-r from-[#FF2E7E] to-[#FF7AB8] px-3 py-1 text-[10px] font-extrabold text-white shadow-sm cursor-pointer"
                    >
                      <Film className="h-3 w-3" />
                      <span>Join Nonton</span>
                    </button>
                  )}
                  {!partnerPresenceDisplay.isWatchingNobar &&
                    partnerPresenceDisplay.isListeningMusic && (
                      <button
                        type="button"
                        onClick={() => openSection('lagu')}
                        className="btn-bucin inline-flex shrink-0 items-center gap-1 rounded-full bg-[#F3F0FF] border border-[#DDD6FE] px-2.5 py-1 text-[10px] font-extrabold text-[#6D28D9] cursor-pointer"
                      >
                        <Music2 className="h-3 w-3" />
                        <span>Ikut Dengerin</span>
                      </button>
                    )}
                </div>
              </div>

              {/* Section Ruang privat (Chat, Nobar, Musik, Album + Full-Width Unek Unek) */}
              <div>
                <h2 className="font-display mb-2.5 text-[22px] font-extrabold leading-tight text-[#4A0E32]">
                  Ruang privat
                </h2>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => openSection('chat')}
                    className="keiz-sticker-card menu-card-bucin relative flex h-[112px] -rotate-[0.9deg] flex-col justify-between bg-[#FFF0F5] p-[14px] text-left cursor-pointer"
                  >
                    <div className="flex items-start justify-between">
                      <Sticker3D kind="chat" className="menu-icon h-10 w-10" />
                      <ChevronRight className="h-4 w-4 text-[#D81B6E]" />
                    </div>
                    <div>
                      <p className="font-display text-[17px] font-extrabold leading-tight text-[#2D0A1E]">
                        Chat
                      </p>
                      <p className="text-[12px] font-semibold leading-tight text-[#8A6A7A]">
                        Ngobrol privat
                      </p>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={
                      partnerPresenceDisplay.isWatchingNobar
                        ? handleJoinPartnerNobar
                        : () => openSection('nobar')
                    }
                    className="keiz-sticker-card menu-card-bucin relative flex h-[112px] rotate-[0.9deg] flex-col justify-between bg-[#FFF7E6] p-[14px] text-left cursor-pointer"
                  >
                    {partnerPresenceDisplay.isWatchingNobar && (
                      <span className="absolute -right-1.5 -top-2 rotate-3 rounded-full bg-[#FF2E7E] px-2 py-0.5 text-[9px] font-extrabold text-white shadow">
                        JOIN LIVE
                      </span>
                    )}
                    <div className="flex items-start justify-between">
                      <Sticker3D kind="nobar" className="menu-icon h-10 w-10" />
                      <ChevronRight className="h-4 w-4 text-[#D81B6E]" />
                    </div>
                    <div>
                      <p className="font-display text-[17px] font-extrabold leading-tight text-[#2D0A1E]">
                        Nobar
                      </p>
                      <p className="text-[12px] font-semibold leading-tight text-[#8A6A7A]">
                        {partnerPresenceDisplay.isWatchingNobar
                          ? `${partnerName} lagi nonton!`
                          : 'Putar film favoritmu'}
                      </p>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => openSection('lagu')}
                    className="keiz-sticker-card menu-card-bucin relative flex h-[112px] rotate-[0.7deg] flex-col justify-between bg-[#F3F0FF] p-[14px] text-left cursor-pointer"
                  >
                    <div className="flex items-start justify-between">
                      <Sticker3D kind="musik" className="menu-icon h-10 w-10" />
                      <ChevronRight className="h-4 w-4 text-[#D81B6E]" />
                    </div>
                    <div>
                      <p className="font-display text-[17px] font-extrabold leading-tight text-[#2D0A1E]">
                        Musik
                      </p>
                      <p className="text-[12px] font-semibold leading-tight text-[#8A6A7A]">
                        Dengar lagu
                      </p>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => openSection('galeri')}
                    className="keiz-sticker-card menu-card-bucin relative flex h-[112px] -rotate-[0.7deg] flex-col justify-between bg-white p-[14px] text-left cursor-pointer"
                  >
                    <div className="flex items-start justify-between">
                      <Sticker3D kind="album" className="menu-icon h-10 w-10" />
                      <ChevronRight className="h-4 w-4 text-[#D81B6E]" />
                    </div>
                    <div>
                      <p className="font-display text-[17px] font-extrabold leading-tight text-[#2D0A1E]">
                        Album
                      </p>
                      <p className="text-[12px] font-semibold leading-tight text-[#8A6A7A]">
                        Simpan cerita
                      </p>
                    </div>
                  </button>

                  {/* Full-width Curhatan Card (col-span-2) */}
                  <button
                    type="button"
                    onClick={() => openSection('unek')}
                    className="keiz-sticker-card menu-card-bucin col-span-2 relative flex items-center justify-between gap-3 bg-[#FFE9F1] p-[14px] text-left cursor-pointer"
                  >
                    <div className="flex items-center gap-3.5">
                      <Sticker3D kind="unek" className="menu-icon h-11 w-11 shrink-0" />
                      <div>
                        <p className="font-display text-[17px] font-extrabold leading-tight text-[#2D0A1E]">
                          Curhatan kenat dan faiz
                        </p>
                        <p className="text-[12px] font-semibold leading-tight text-[#8A6A7A]">
                          isinya curhatan kenat dan faiz
                        </p>
                      </div>
                    </div>
                    <ChevronRight className="h-5 w-5 shrink-0 text-[#D81B6E]" />
                  </button>
                </div>
              </div>

              {/* Card Lama Pacaran Kita */}
              <div className="keiz-sticker-card rounded-3xl bg-white p-4 shadow-sm">
                <p className="font-display text-[15px] font-extrabold leading-tight text-[#2D0A1E]">
                  lama pacaran kita
                </p>

                <div className="mt-2.5 grid grid-cols-2 gap-2.5">
                  <div className="rounded-2xl border border-[#FFD6E7] bg-[#FFF2F7] p-3">
                    <p className="text-[11px] font-bold text-[#8A6A7A]">
                      udah pacaran selama
                    </p>
                    <p className="font-display mt-1 text-[20px] font-extrabold leading-tight text-[#D81B6E]">
                      {relationshipStats.totalDays} hari
                    </p>
                    <p className="mt-0.5 text-[11px] font-semibold text-[#5C3A49]">
                      {relationshipStats.durationBreakdown}
                    </p>
                  </div>

                  <div className="rounded-2xl border border-[#FFD6E7] bg-[#FFF2F7] p-3">
                    <p className="text-[11px] font-bold text-[#8A6A7A]">
                      menuju tanggal 28
                    </p>
                    <p className="font-display mt-1 text-[18px] font-extrabold leading-tight text-[#2D0A1E]">
                      {relationshipStats.countdownHeadline}
                    </p>
                    <p className="mt-0.5 text-[11px] font-semibold leading-snug text-[#5C3A49]">
                      {relationshipStats.countdownSubline}
                    </p>
                  </div>
                </div>

                <div className="mt-3">
                  <div className="mb-1.5 flex items-center justify-between gap-2 text-[11px] font-bold text-[#8A6A7A]">
                    <span className="truncate">{relationshipStats.progressLabel}</span>
                    <span className="shrink-0 tabular-nums text-[#D81B6E]">
                      {relationshipStats.progressPercent}%
                    </span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-[#FFE3EE]">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-[#FF2E7E] to-[#FF7AB8] transition-all duration-500"
                      style={{ width: `${relationshipStats.progressPercent}%` }}
                    />
                  </div>
                </div>
              </div>

              {/* Footer Home */}
              <footer className="mt-auto pt-2 pb-1 text-center text-[11px] font-bold text-[#9A7A8A]">
                KEIZ BUCIN - 28 Agustus 2026
              </footer>
            </div>
          ) : (
            /* SUB-PAGES (except Chat, handled full-height above) */
            <div className="flex min-h-full flex-col">
              {section === 'profil' && (
                <ProfilView
                  profile={profile}
                  currentUser={currentUser}
                  onBack={() => openSection('home')}
                  onNavigate={openSection}
                  onUpdateProfile={(next) => setProfile(next)}
                  onLogout={handleLogout}
                />
              )}
              {section === 'nobar' && (
                <NobarView
                  currentUser={currentUser}
                  profile={profile}
                  partnerPresence={partnerPresence}
                  joinSignal={nobarJoinSignal}
                  onActiveTitleChange={setActiveNobarTitle}
                  onBack={() => openSection('home')}
                  onBoostLove={() => {}}
                />
              )}
              {section === 'lagu' && (
                <LaguView
                  currentUser={currentUser}
                  profile={profile}
                  partnerPresence={partnerPresence}
                  queue={music.queue}
                  history={music.history}
                  musicSync={music.musicSync}
                  activeSong={music.activeSong}
                  isPlaying={music.isPlaying}
                  loadingAudio={music.loadingAudio}
                  needsUnmute={music.needsUnmute}
                  currentTime={music.currentTime}
                  duration={music.duration}
                  musicRoomMembers={music.musicRoomMembers}
                  onPlaySong={(song) => music.playSongNow(song)}
                  onTogglePlayPause={music.togglePlayPause}
                  onSeek={music.seekTo}
                  onJoinLive={music.joinLivePartnerMusic}
                  onForceUnmute={music.forceUnmute}
                  onPrevNext={music.prevNext}
                  onAddToQueue={music.addToQueue}
                  onRemoveFromQueue={music.removeFromQueue}
                  onToggleFavorite={music.toggleFavorite}
                  onBack={() => openSection('home')}
                  onGoChat={() => openSection('chat')}
                />
              )}
              {section === 'galeri' && (
                <GaleriView
                  currentUser={currentUser}
                  onBack={() => openSection('home')}
                />
              )}
              {section === 'unek' && (
                <UnekUnekView
                  currentUser={currentUser}
                  onBack={() => openSection('home')}
                  onBoostLove={() =>
                    handleHeartBurstAt(
                      window.innerWidth / 2,
                      window.innerHeight * 0.45
                    )
                  }
                />
              )}
            </div>
          )}
            </div>
          )}

          {/* Docked Bottom Stack (Mini Player + Sticky 5-Tab Bottom Nav with safe-area bottom inset) */}
          <div className="sticky bottom-0 z-20 flex shrink-0 flex-col gap-2 px-3 pt-1 pb-[max(0.625rem,env(safe-area-inset-bottom))]">
            {section === 'lagu' && music.isPlaying && music.activeSong && (
              <div
                onClick={() => openSection('lagu')}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') openSection('lagu');
                }}
                className="flex items-center justify-between gap-2.5 rounded-2xl border border-[#FFD6E7] bg-white/95 px-3 py-2 shadow-[0_8px_24px_rgba(255,46,126,0.16)] backdrop-blur-md cursor-pointer"
              >
                <div className="flex min-w-0 flex-1 items-center gap-2.5">
                  <div
                    className={`relative h-10 w-10 shrink-0 overflow-hidden rounded-xl border border-[#FFD6E7] bg-gradient-to-tr from-[#FF7AB8] to-[#FDE68A] shadow-sm ${
                      music.isPlaying ? 'animate-pulse' : ''
                    }`}
                  >
                    {music.activeSong.artwork ? (
                      <img
                        src={music.activeSong.artwork}
                        alt={music.activeSong.title}
                        referrerPolicy="no-referrer"
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-[#FF2E7E]">
                        <Music2 className="h-5 w-5" />
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-extrabold text-[#2D0A1E]">
                      {music.activeSong.title}
                    </p>
                    <p className="truncate text-[10px] font-semibold text-[#8A6A7A]">
                      {music.activeSong.artist || 'Musik Berdua'} -{' '}
                      {music.isPlaying ? 'Lagi diputar' : 'Dijeda'}
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    music.togglePlayPause();
                  }}
                  aria-label={music.isPlaying ? 'Pause lagu' : 'Play lagu'}
                  className="btn-bucin flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-r from-[#FF2E7E] to-[#FF7AB8] text-white shadow-sm cursor-pointer"
                >
                  {music.isPlaying ? (
                    <Pause className="h-4 w-4" />
                  ) : (
                    <Play className="ml-0.5 h-4 w-4" />
                  )}
                </button>
              </div>
            )}

            {/* Sticky 5-Tab Bottom Nav: Home, Chat, Musik, Nobar, Profil */}
            <nav
              aria-label="Navigasi utama"
              className="w-full rounded-full border border-[#FFD6E7] bg-white/95 px-2 py-1.5 shadow-[0_8px_28px_rgba(255,46,126,0.18)] backdrop-blur-md"
            >
              <div className="grid grid-cols-5 gap-1">
                {(
                  [
                    { id: 'home', label: 'Home', Icon: Home },
                    { id: 'chat', label: 'Chat', Icon: MessageCircle },
                    { id: 'lagu', label: 'Musik', Icon: Music2 },
                    { id: 'nobar', label: 'Nobar', Icon: Film },
                    { id: 'profil', label: 'Profil', Icon: User },
                  ] as const
                ).map(({ id, label, Icon }) => {
                  const active = section === id;
                  return (
                    <button
                      key={id}
                      type="button"
                      onClick={() => openSection(id)}
                      className={`btn-bucin flex flex-col items-center justify-center gap-0.5 rounded-full py-1.5 text-[10px] font-extrabold transition-colors cursor-pointer ${
                        active
                          ? 'bg-gradient-to-r from-[#FF2E7E] to-[#FF7AB8] text-white shadow-sm'
                          : 'text-[#8A6A7A] hover:text-[#2D0A1E]'
                      }`}
                    >
                      <Icon className="h-4 w-4" />
                      <span>{label}</span>
                    </button>
                  );
                })}
              </div>
            </nav>
          </div>
        </div>
      )}

      {/* Settings Modal */}
      {showSettings && currentUser && (
        <div
          onClick={() => setShowSettings(false)}
          className="fixed inset-0 z-50 flex items-end justify-center bg-[#2D0A1E]/40 p-4 backdrop-blur-sm sm:items-center"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="keiz-card animate-bubble-pop max-h-[88dvh] w-full max-w-[395px] space-y-3 overflow-y-auto bg-white p-5"
          >
            <div className="flex items-center justify-between">
              <h3 className="font-display text-base font-extrabold text-[#2D0A1E]">
                Pengaturan KEIZ BUCIN
              </h3>
              <button
                type="button"
                onClick={() => setShowSettings(false)}
                className="flex h-8 w-8 items-center justify-center rounded-full bg-[#FFF2F7] text-[#8A6A7A] cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <button
              type="button"
              onClick={toggleMute}
              className="btn-bucin flex min-h-[46px] w-full items-center justify-between rounded-2xl border border-[#FFD6E7] bg-[#FFF2F7] px-4 text-xs font-bold text-[#2D0A1E] cursor-pointer"
            >
              <span>Efek Suara Lucu</span>
              <span className="flex items-center gap-1.5 text-[#E91E7A]">
                {muted ? (
                  <>
                    <VolumeX className="h-4 w-4" /> Mati
                  </>
                ) : (
                  <>
                    <Volume2 className="h-4 w-4" /> Nyala
                  </>
                )}
              </span>
            </button>

            <SupabaseConfigCard />

            <button
              type="button"
              onClick={handleLogout}
              className="btn-bucin flex min-h-[46px] w-full items-center justify-center gap-2 rounded-2xl border border-rose-200 bg-rose-50 px-4 text-xs font-extrabold text-rose-600 cursor-pointer"
            >
              <LogOut className="h-4 w-4" />
              <span>Keluar / Ganti Akun</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
