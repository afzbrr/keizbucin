import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ChevronRight,
  Film,
  Heart,
  Home,
  LogOut,
  MessageCircle,
  Music2,
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
  ensureInitialSyncRows,
  fetchProfile,
  getSavedSession,
  isSupabaseConfigured,
  onSupabaseError,
  onSupabaseReconfigured,
  setSavedSession,
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
  const prevPartnerActivityRef = useRef<string>('');

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

  // Persistent Synced Music Player + Call Ducking
  const music = useMusicSync({
    currentUser,
    inCall,
    callMusicVolume,
  });

  useEffect(() => {
    const unsubReconfig = onSupabaseReconfigured(() => {
      setSupabaseReady(isSupabaseConfigured());
    });
    let timer: number | undefined;
    const unsubError = onSupabaseError((msg) => {
      setSupabaseToast(msg);
      if (timer) window.clearTimeout(timer);
      timer = window.setTimeout(() => setSupabaseToast(null), 4000);
    });
    return () => {
      unsubReconfig();
      unsubError();
      if (timer) window.clearTimeout(timer);
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
    ensureInitialSyncRows();
    loadProfile();
    const unsub = subscribeRealtime({
      onProfil: () => loadProfile(),
    });
    return unsub;
  }, [supabaseReady, loadProfile]);

  const partnerRole: Role = currentUser === 'faiz' ? 'kenat' : 'faiz';
  const partnerName =
    partnerRole === 'kenat' ? profile.kenatName : profile.faizName;
  const partnerPresence = presenceMap[partnerRole] ?? null;

  // Subscribe to real-time couple presence
  useEffect(() => {
    if (!currentUser || !supabaseReady) return;
    const unsub = subscribePresence(currentUser, (map) => {
      setPresenceMap(map);
      const partner = map[partnerRole];
      if (partner && partner.status === 'online') {
        const key = `${partner.lagi_ngapain}|${partner.lagi_play_apa}`;
        if (
          prevPartnerActivityRef.current &&
          prevPartnerActivityRef.current !== key
        ) {
          const desc = partner.lagi_play_apa
            ? `${partnerName} ${partner.lagi_ngapain} (${partner.lagi_play_apa})`
            : `${partnerName} pindah ${partner.lagi_ngapain}`;
          setPresenceToast(desc);
          window.setTimeout(() => setPresenceToast(null), 2600);
        }
        prevPartnerActivityRef.current = key;
      }
    });
    return unsub;
  }, [currentUser, partnerRole, partnerName]);

  // Broadcast own live activity into presence_keiz & Supabase Presence
  useEffect(() => {
    if (!currentUser) return;
    const activity = sectionToActivity(section, inCall || callModalOpen);
    const playApa =
      section === 'nobar' && activeNobarTitle
        ? activeNobarTitle
        : music.isPlaying && music.activeSong
        ? `${music.activeSong.title}`
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

  // Mark offline when tab closes
  useEffect(() => {
    if (!currentUser) return;
    const handleUnload = () => {
      upsertPresence({
        user: currentUser,
        status: 'offline',
        lagi_ngapain: 'di Home',
        lagi_play_apa: '',
        last_seen: new Date().toISOString(),
      });
    };
    window.addEventListener('beforeunload', handleUnload);
    return () => window.removeEventListener('beforeunload', handleUnload);
  }, [currentUser]);

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
        ['💖', '💙', '❤️', '✨'],
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
      ['💖', '💙', '✨', '❤️'],
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
      spawnBurst(cx, cy, 12, ['💙', '✨', '💙'], ['#3B82F6', '#60A5FA']);
      setTimeout(() => setFaizJump(false), 600);
      setTimeout(() => setFaizBubble(null), 2200);
    } else {
      setKenatJump(false);
      requestAnimationFrame(() => setKenatJump(true));
      setFaizBubble('kenat lagi kangen faiz nihh');
      spawnBurst(cx, cy, 12, ['💖', '✨', '💖'], ['#FF4D8D', '#F472B6']);
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
    setSection(target);
    const nextPath = pathFromSection(target);
    if (window.location.pathname !== nextPath) {
      window.history.pushState(null, '', nextPath);
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleForwardToUnek = async (text: string) => {
    if (!currentUser) return;
    await addUnekItem({
      author: currentUser,
      mood: 'Sayang 💖',
      text,
    });
    spawnBurst(
      window.innerWidth / 2,
      window.innerHeight / 2,
      14,
      ['💭', '💖', '💙'],
      ['#FF4D8D', '#3B82F6']
    );
  };

  const isFaiz = currentUser === 'faiz';

  const partnerPresenceSummary = (() => {
    if (!partnerPresence || partnerPresence.status !== 'online') {
      return `${partnerName} lagi offline`;
    }
    if (partnerPresence.lagi_ngapain === 'di Nobar') {
      return `${partnerName} lagi di Nobar${
        partnerPresence.lagi_play_apa
          ? ` - Nonton ${partnerPresence.lagi_play_apa}`
          : ''
      }`;
    }
    if (partnerPresence.lagi_ngapain === 'di Musik') {
      return `${partnerName} lagi dengerin Musik${
        partnerPresence.lagi_play_apa
          ? ` - ${partnerPresence.lagi_play_apa}`
          : ''
      }`;
    }
    return `${partnerName} lagi ${partnerPresence.lagi_ngapain}`;
  })();

  return (
    <div className="paper-texture relative min-h-screen w-full overflow-x-hidden bg-gradient-to-b from-[#FFF2F7] to-[#FFE4EF] text-[#2D0A1E]">
      {/* Persistent 1x1 Hidden YouTube Music Player (never display:none so audio plays across pages & calls!) */}
      {currentUser && (
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

      {/* Live Partner Activity Transition Toast */}
      {currentUser && presenceToast && !supabaseToast && (
        <div className="animate-bubble-pop fixed left-1/2 top-14 z-40 -translate-x-1/2 rounded-full border border-[#FFD6E7] bg-white/95 px-4 py-1.5 text-[11px] font-extrabold text-[#D81B6E] shadow-lg backdrop-blur-md">
          {presenceToast}
        </div>
      )}

      {/* Non-crashing Supabase Connection Error Toast */}
      {supabaseToast && (
        <div className="animate-bubble-pop fixed left-1/2 top-4 z-50 w-[calc(100%-32px)] max-w-[398px] -translate-x-1/2 rounded-2xl border border-rose-200 bg-rose-50/95 px-4 py-2.5 text-center text-[12px] font-extrabold text-rose-700 shadow-lg backdrop-blur-md">
          {supabaseToast}
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

      {/* MISSING SUPABASE ENV GATE */}
      {!supabaseReady ? (
        <div className="relative z-10 mx-auto flex min-h-screen w-full max-w-[430px] flex-col justify-center gap-4 px-4 py-8">
          <div className="keiz-card space-y-3 border border-rose-200 bg-white/95 p-5">
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

            <div className="rounded-2xl border border-rose-200 bg-rose-50 p-3.5">
              <p className="text-xs font-extrabold leading-relaxed text-rose-700">
                Supabase belum di-setting di Vercel, cek VITE_SUPABASE_URL di Vercel -&gt; Settings -&gt; Environment Variables
              </p>
            </div>
          </div>

          <SupabaseConfigCard onConnected={() => setSupabaseReady(true)} />
        </div>
      ) : !currentUser ? (
        <LoginView profile={profile} onSuccess={handleLoginSuccess} />
      ) : (
        /* MAIN CENTERED CONTAINER MAX 430PX */
        <div
          className={`relative z-10 mx-auto flex min-h-screen w-full max-w-[430px] flex-col px-4 pb-24 ${
            pelukActive ? 'animate-screen-shake' : ''
          }`}
        >
          {/* HOME VIEW */}
          {section === 'home' ? (
            <div className="flex flex-col gap-[18px]">
              {/* Top Bar: left heart + KEIZ BUCIN, right settings */}
              <header className="flex h-[56px] items-center justify-between pt-1">
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
                <h1 className="font-display text-[32px] font-extrabold leading-[1.12] text-[#2D0A1E]">
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
                    {isFaiz
                      ? profile.faizName.toUpperCase()
                      : profile.kenatName.toUpperCase()}
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
                        Telpon + voice changer
                      </p>
                    </div>
                  </button>
                </div>

                {/* Live Partner Activity Banner right under [ Profil | Call Berdua ] */}
                <div className="mt-2.5 flex items-center gap-2 rounded-full border border-[#FFD6E7] bg-white/95 px-3.5 py-2 shadow-sm">
                  <span
                    className={`h-2.5 w-2.5 shrink-0 rounded-full ${
                      partnerPresence?.status === 'online'
                        ? 'bg-emerald-500 animate-pulse'
                        : 'bg-slate-300'
                    }`}
                  />
                  <p className="truncate text-[11px] font-extrabold text-[#2D0A1E]">
                    {partnerPresenceSummary}
                  </p>
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
                    onClick={() => openSection('nobar')}
                    className="keiz-sticker-card menu-card-bucin relative flex h-[112px] rotate-[0.9deg] flex-col justify-between bg-[#FFF7E6] p-[14px] text-left cursor-pointer"
                  >
                    <div className="flex items-start justify-between">
                      <Sticker3D kind="nobar" className="menu-icon h-10 w-10" />
                      <ChevronRight className="h-4 w-4 text-[#D81B6E]" />
                    </div>
                    <div>
                      <p className="font-display text-[17px] font-extrabold leading-tight text-[#2D0A1E]">
                        Nobar
                      </p>
                      <p className="text-[12px] font-semibold leading-tight text-[#8A6A7A]">
                        Putar film favoritmu
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

                  {/* Full-width Unek Unek Card (col-span-2) */}
                  <button
                    type="button"
                    onClick={() => openSection('unek')}
                    className="keiz-sticker-card menu-card-bucin col-span-2 relative flex items-center justify-between gap-3 bg-[#FFE9F1] p-[14px] text-left cursor-pointer"
                  >
                    <span className="absolute -right-1.5 -top-2 rotate-6 rounded-md border border-[#F59E0B]/40 bg-[#FDE047] px-2 py-0.5 text-[10px] font-extrabold text-[#78350F] shadow-sm">
                      BARU!
                    </span>
                    <div className="flex items-center gap-3.5">
                      <Sticker3D kind="unek" className="menu-icon h-11 w-11 shrink-0" />
                      <div>
                        <p className="font-display text-[17px] font-extrabold leading-tight text-[#2D0A1E]">
                          Unek Unek
                        </p>
                        <p className="text-[12px] font-semibold leading-tight text-[#8A6A7A]">
                          Curhat &amp; unek-unek ke ayang berdua
                        </p>
                      </div>
                    </div>
                    <ChevronRight className="h-5 w-5 shrink-0 text-[#D81B6E]" />
                  </button>
                </div>
              </div>

              {/* Footer Home */}
              <footer className="pt-3 text-center text-[11px] font-bold text-[#9A7A8A]">
                KEIZ BUCIN - 28 Agustus 2026
              </footer>
            </div>
          ) : (
            /* SUB-PAGES */
            <div className="pt-3">
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
              {section === 'chat' && (
                <ChatView
                  profile={profile}
                  currentUser={currentUser}
                  partnerPresence={partnerPresence}
                  onBack={() => openSection('home')}
                  onChangeUser={handleSetUser}
                  onNavigate={openSection}
                  onStartCall={() => setCallModalOpen(true)}
                  onForwardToUnek={handleForwardToUnek}
                  onHeartBurstAt={handleHeartBurstAt}
                />
              )}
              {section === 'nobar' && (
                <NobarView
                  currentUser={currentUser}
                  profile={profile}
                  partnerPresence={partnerPresence}
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
                  inCall={inCall}
                  callMusicVolume={callMusicVolume}
                  queue={music.queue}
                  history={music.history}
                  musicSync={music.musicSync}
                  activeSong={music.activeSong}
                  isPlaying={music.isPlaying}
                  loadingAudio={music.loadingAudio}
                  needsUnmute={music.needsUnmute}
                  currentTime={music.currentTime}
                  duration={music.duration}
                  localVolume={music.localVolume}
                  musicRoomMembers={music.musicRoomMembers}
                  onLocalVolumeChange={music.setLocalVolume}
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
                  onTriggerPeluk={handleTriggerPeluk}
                  onTriggerKangen={handleTriggerKangen}
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

          {/* Fixed 5-Tab Bottom Nav: Home, Chat, Musik, Nobar, Profil */}
          <nav
            aria-label="Navigasi utama"
            className="fixed bottom-3 left-1/2 z-40 w-[calc(100%-24px)] max-w-[406px] -translate-x-1/2 rounded-full border border-[#FFD6E7] bg-white/95 px-2 py-1.5 shadow-[0_8px_28px_rgba(255,46,126,0.18)] backdrop-blur-md"
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
      )}

      {/* Settings Modal */}
      {showSettings && currentUser && (
        <div
          onClick={() => setShowSettings(false)}
          className="fixed inset-0 z-50 flex items-end justify-center bg-[#2D0A1E]/40 p-4 backdrop-blur-sm sm:items-center"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="keiz-card animate-bubble-pop max-h-[88vh] w-full max-w-[395px] space-y-3 overflow-y-auto bg-white p-5"
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
