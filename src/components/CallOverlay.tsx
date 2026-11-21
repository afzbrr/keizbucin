import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Maximize2,
  Mic,
  MicOff,
  Minimize2,
  Music2,
  Phone,
  PhoneOff,
  Sparkles,
} from 'lucide-react';
import {
  answerCallOffer,
  createCallOffer,
  fetchLatestActiveCall,
  sendCallIceCandidate,
  subscribeCallChannel,
  updateCallStatus,
} from '../supabaseClient';
import { soundFX } from '../sound';
import type { CallState, CoupleProfile, Role, VoiceEffectMode } from '../types';

const VOICE_EFFECTS: { id: VoiceEffectMode; label: string; desc: string }[] = [
  { id: 'normal', label: 'Normal', desc: 'Suara asli kamu' },
  { id: 'chipmunk', label: 'Chipmunk', desc: 'Cempreng imut' },
  { id: 'deep', label: 'Deep', desc: 'Berat & adem' },
  { id: 'robot', label: 'Robot', desc: 'Efek robotik' },
  { id: 'anime', label: 'Anime', desc: 'Ceria halus' },
];

const RTC_CONFIG: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ],
};

function formatTimer(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m < 10 ? '0' : ''}${m}:${s < 10 ? '0' : ''}${s}`;
}

interface ProcessedVoiceGraph {
  stream: MediaStream;
  cleanup: () => void;
}

function buildVoiceEffectStream(
  rawStream: MediaStream,
  mode: VoiceEffectMode
): ProcessedVoiceGraph {
  if (mode === 'normal' || typeof AudioContext === 'undefined') {
    return {
      stream: rawStream,
      cleanup: () => {},
    };
  }

  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    const ctx = new AudioCtx();
    const source = ctx.createMediaStreamSource(rawStream);
    const dest = ctx.createMediaStreamDestination();

    if (mode === 'robot') {
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.value = 58;

      const oscGain = ctx.createGain();
      oscGain.gain.value = 0.45;

      const ringGain = ctx.createGain();
      ringGain.gain.value = 0.7;

      const bandpass = ctx.createBiquadFilter();
      bandpass.type = 'bandpass';
      bandpass.frequency.value = 1150;
      bandpass.Q.value = 1.4;

      osc.connect(oscGain);
      oscGain.connect(ringGain.gain);
      source.connect(ringGain);
      ringGain.connect(bandpass);
      bandpass.connect(dest);
      osc.start();

      return {
        stream: dest.stream,
        cleanup: () => {
          try {
            osc.stop();
            ctx.close();
          } catch {
            // ignore
          }
        },
      };
    }

    // Formant / spectral shaping + subtle modulated delay pitch illusion
    const eq1 = ctx.createBiquadFilter();
    const eq2 = ctx.createBiquadFilter();
    const delay = ctx.createDelay(0.1);
    const lfo = ctx.createOscillator();
    const lfoGain = ctx.createGain();

    if (mode === 'chipmunk') {
      eq1.type = 'highpass';
      eq1.frequency.value = 340;
      eq2.type = 'peaking';
      eq2.frequency.value = 2500;
      eq2.gain.value = 10;
      delay.delayTime.value = 0.012;
      lfo.frequency.value = 14;
      lfoGain.gain.value = 0.004;
    } else if (mode === 'deep') {
      eq1.type = 'lowpass';
      eq1.frequency.value = 950;
      eq2.type = 'lowshelf';
      eq2.frequency.value = 220;
      eq2.gain.value = 11;
      delay.delayTime.value = 0.024;
      lfo.frequency.value = 4.5;
      lfoGain.gain.value = 0.003;
    } else {
      // anime
      eq1.type = 'highpass';
      eq1.frequency.value = 240;
      eq2.type = 'highshelf';
      eq2.frequency.value = 2200;
      eq2.gain.value = 8;
      delay.delayTime.value = 0.014;
      lfo.frequency.value = 9;
      lfoGain.gain.value = 0.0025;
    }

    source.connect(eq1);
    eq1.connect(eq2);
    eq2.connect(delay);
    delay.connect(dest);
    eq2.connect(dest);

    lfo.connect(lfoGain);
    lfoGain.connect(delay.delayTime);
    lfo.start();

    return {
      stream: dest.stream,
      cleanup: () => {
        try {
          lfo.stop();
          ctx.close();
        } catch {
          // ignore
        }
      },
    };
  } catch {
    return {
      stream: rawStream,
      cleanup: () => {},
    };
  }
}

interface CallOverlayProps {
  currentUser: Role;
  profile: CoupleProfile;
  openModal: boolean;
  onRequestOpen: () => void;
  onRequestClose: () => void;
  onCallActiveChange: (active: boolean) => void;
  callMusicVolume: number;
  onCallMusicVolumeChange: (vol: number) => void;
  musicActiveTitle?: string;
}

export const CallOverlay: React.FC<CallOverlayProps> = ({
  currentUser,
  profile,
  openModal,
  onRequestOpen,
  onRequestClose,
  onCallActiveChange,
  callMusicVolume,
  onCallMusicVolumeChange,
  musicActiveTitle,
}) => {
  const [activeCall, setActiveCall] = useState<CallState | null>(null);
  const [minimized, setMinimized] = useState(false);
  const [mutedMic, setMutedMic] = useState(false);
  const [voiceMode, setVoiceMode] = useState<VoiceEffectMode>('normal');
  const [callSeconds, setCallSeconds] = useState(0);
  const [micError, setMicError] = useState<string | null>(null);

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const rawStreamRef = useRef<MediaStream | null>(null);
  const voiceGraphRef = useRef<ProcessedVoiceGraph | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const activeCallRef = useRef<CallState | null>(null);
  const pendingIceRef = useRef<RTCIceCandidateInit[]>([]);

  activeCallRef.current = activeCall;

  const partnerRole: Role = currentUser === 'faiz' ? 'kenat' : 'faiz';
  const partnerName =
    partnerRole === 'kenat' ? profile.kenatName : profile.faizName;
  const partnerPhoto =
    partnerRole === 'kenat' ? profile.kenatPhoto : profile.faizPhoto;

  const cleanupPeer = useCallback(() => {
    try {
      voiceGraphRef.current?.cleanup();
      voiceGraphRef.current = null;
    } catch {
      // ignore
    }
    try {
      rawStreamRef.current?.getTracks().forEach((t) => t.stop());
      rawStreamRef.current = null;
    } catch {
      // ignore
    }
    try {
      pcRef.current?.close();
      pcRef.current = null;
    } catch {
      // ignore
    }
    pendingIceRef.current = [];
  }, []);

  useEffect(() => {
    const isConnectedOrRinging =
      activeCall !== null && activeCall.status !== 'ended';
    onCallActiveChange(activeCall?.status === 'connected');
    if (!isConnectedOrRinging) {
      setCallSeconds(0);
    }
  }, [activeCall, onCallActiveChange]);

  // Call duration timer
  useEffect(() => {
    if (activeCall?.status !== 'connected') return;
    const t = window.setInterval(() => {
      setCallSeconds((s) => s + 1);
    }, 1000);
    return () => clearInterval(t);
  }, [activeCall?.status]);

  const prepareMediaAndPeer = useCallback(
    async (callId: string, mode: VoiceEffectMode): Promise<RTCPeerConnection> => {
      cleanupPeer();
      setMicError(null);

      let rawStream: MediaStream | null = null;
      try {
        rawStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        rawStreamRef.current = rawStream;
      } catch {
        setMicError(
          'Mikrofon belum diizinkan browser. Izinkan mic biar suara kamu kedengeran ya!'
        );
      }

      const pc = new RTCPeerConnection(RTC_CONFIG);
      pcRef.current = pc;

      pc.onicecandidate = (ev) => {
        if (ev.candidate) {
          sendCallIceCandidate(callId, currentUser, ev.candidate.toJSON());
        }
      };

      pc.ontrack = (ev) => {
        if (remoteAudioRef.current && ev.streams[0]) {
          remoteAudioRef.current.srcObject = ev.streams[0];
          remoteAudioRef.current.play().catch(() => {});
        }
      };

      if (rawStream) {
        const graph = buildVoiceEffectStream(rawStream, mode);
        voiceGraphRef.current = graph;
        const track = graph.stream.getAudioTracks()[0] || rawStream.getAudioTracks()[0];
        if (track) {
          pc.addTrack(track, graph.stream);
        }
      }

      return pc;
    },
    [cleanupPeer, currentUser]
  );

  // Listen to call_keiz updates & ICE candidates
  useEffect(() => {
    fetchLatestActiveCall().then((latest) => {
      if (latest && latest.status !== 'ended') {
        setActiveCall(latest);
      }
    });

    const unsub = subscribeCallChannel(
      async (incoming) => {
        if (incoming.status === 'ended') {
          if (activeCallRef.current?.id === incoming.id) {
            cleanupPeer();
            setActiveCall(null);
            setMinimized(false);
          }
          return;
        }

        // Caller receives callee's answer
        if (
          incoming.caller === currentUser &&
          incoming.status === 'connected' &&
          incoming.answer &&
          pcRef.current &&
          !pcRef.current.currentRemoteDescription
        ) {
          try {
            const desc = JSON.parse(incoming.answer) as RTCSessionDescriptionInit;
            await pcRef.current.setRemoteDescription(desc);
            for (const c of pendingIceRef.current) {
              await pcRef.current.addIceCandidate(c).catch(() => {});
            }
            pendingIceRef.current = [];
          } catch {
            // ignore
          }
        }

        setActiveCall(incoming);
      },
      async ({ callId, from, candidate }) => {
        if (from === currentUser) return;
        if (activeCallRef.current?.id !== callId) return;
        const pc = pcRef.current;
        if (pc && pc.remoteDescription) {
          await pc.addIceCandidate(candidate).catch(() => {});
        } else {
          pendingIceRef.current.push(candidate);
        }
      }
    );

    return unsub;
  }, [cleanupPeer, currentUser]);

  useEffect(() => {
    return () => cleanupPeer();
  }, [cleanupPeer]);

  const handleStartCall = async () => {
    soundFX.playHeartBurst();
    const tempId =
      typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `${Date.now()}`;
    const pc = await prepareMediaAndPeer(tempId, voiceMode);
    const offer = await pc.createOffer({ offerToReceiveAudio: true });
    await pc.setLocalDescription(offer);

    const created = await createCallOffer(
      currentUser,
      partnerRole,
      JSON.stringify(offer)
    );
    // Replace temporary listener tag if needed; ICE candidates use created.id
    activeCallRef.current = created;
    setActiveCall(created);
    setMinimized(false);
    onRequestOpen();

    // Update onicecandidate with real call id
    pc.onicecandidate = (ev) => {
      if (ev.candidate) {
        sendCallIceCandidate(created.id, currentUser, ev.candidate.toJSON());
      }
    };
  };

  const handleAnswerCall = async () => {
    if (!activeCall?.offer) return;
    soundFX.playHeartBurst();
    const pc = await prepareMediaAndPeer(activeCall.id, voiceMode);
    try {
      const remoteOffer = JSON.parse(activeCall.offer) as RTCSessionDescriptionInit;
      await pc.setRemoteDescription(remoteOffer);
      for (const c of pendingIceRef.current) {
        await pc.addIceCandidate(c).catch(() => {});
      }
      pendingIceRef.current = [];

      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      await answerCallOffer(activeCall.id, JSON.stringify(answer));
      setActiveCall((prev) => (prev ? { ...prev, status: 'connected' } : prev));
      setMinimized(false);
      onRequestOpen();
    } catch {
      setMicError('Koneksi WebRTC belum tersambung penuh, coba ulangi sebentar.');
    }
  };

  const handleEndCall = async () => {
    soundFX.playClick();
    const id = activeCall?.id;
    cleanupPeer();
    setActiveCall(null);
    setMinimized(false);
    onRequestClose();
    if (id) {
      await updateCallStatus(id, 'ended');
    }
  };

  const handleToggleMute = () => {
    soundFX.playClick();
    const next = !mutedMic;
    setMutedMic(next);
    rawStreamRef.current?.getAudioTracks().forEach((t) => {
      t.enabled = !next;
    });
  };

  const handleChangeVoiceEffect = async (mode: VoiceEffectMode) => {
    soundFX.playPop();
    setVoiceMode(mode);
    if (activeCall) {
      updateCallStatus(activeCall.id, activeCall.status, mode).catch(() => {});
    }
    const raw = rawStreamRef.current;
    const pc = pcRef.current;
    if (!raw || !pc) return;

    voiceGraphRef.current?.cleanup();
    const nextGraph = buildVoiceEffectStream(raw, mode);
    voiceGraphRef.current = nextGraph;
    const nextTrack = nextGraph.stream.getAudioTracks()[0] || raw.getAudioTracks()[0];
    if (nextTrack) {
      const sender = pc.getSenders().find((s) => s.track?.kind === 'audio');
      if (sender) {
        await sender.replaceTrack(nextTrack).catch(() => {});
      }
    }
  };

  const isIncomingRinging =
    activeCall?.status === 'ringing' && activeCall.callee === currentUser;

  const showFloatingBar =
    activeCall !== null &&
    activeCall.status !== 'ended' &&
    (!openModal || minimized) &&
    !isIncomingRinging;

  const showFullSheet =
    isIncomingRinging ||
    (openModal && !minimized);

  return (
    <>
      <audio ref={remoteAudioRef} autoPlay playsInline className="hidden" />

      {/* Floating Mini Call Bar (allows browsing Chat / Nobar / Musik mid-call) */}
      {showFloatingBar && activeCall && (
        <div className="fixed left-1/2 top-3 z-50 flex w-[calc(100%-24px)] max-w-[406px] -translate-x-1/2 items-center justify-between gap-2 rounded-full border border-[#FFD6E7] bg-[#2D0A1E]/95 px-3 py-2 text-white shadow-xl backdrop-blur-md">
          <button
            type="button"
            onClick={() => {
              setMinimized(false);
              onRequestOpen();
            }}
            className="flex min-w-0 flex-1 items-center gap-2 text-left cursor-pointer"
          >
            <img
              src={partnerPhoto}
              alt={partnerName}
              className="h-7 w-7 shrink-0 rounded-full border border-[#FF4D8D] object-cover"
            />
            <div className="min-w-0">
              <p className="truncate text-[11px] font-extrabold text-white">
                {activeCall.status === 'connected'
                  ? `Call sama ${partnerName} · ${formatTimer(callSeconds)}`
                  : `Lagi manggil ${partnerName}...`}
              </p>
              <p className="truncate text-[10px] text-pink-200">
                Suara: {VOICE_EFFECTS.find((v) => v.id === voiceMode)?.label}
                {musicActiveTitle ? ` · Musik ${callMusicVolume}%` : ''}
              </p>
            </div>
          </button>

          <div className="flex shrink-0 items-center gap-1.5">
            <button
              type="button"
              onClick={handleToggleMute}
              aria-label="Mute mic"
              className={`flex h-8 w-8 items-center justify-center rounded-full cursor-pointer ${
                mutedMic ? 'bg-amber-500 text-white' : 'bg-white/15 text-white'
              }`}
            >
              {mutedMic ? <MicOff className="h-3.5 w-3.5" /> : <Mic className="h-3.5 w-3.5" />}
            </button>
            <button
              type="button"
              onClick={() => {
                setMinimized(false);
                onRequestOpen();
              }}
              aria-label="Perbesar call"
              className="flex h-8 w-8 items-center justify-center rounded-full bg-white/15 text-white cursor-pointer"
            >
              <Maximize2 className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={handleEndCall}
              aria-label="Tutup call"
              className="flex h-8 w-8 items-center justify-center rounded-full bg-rose-500 text-white cursor-pointer"
            >
              <PhoneOff className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* Full Call Overlay / Sheet */}
      {showFullSheet && (
        <div
          onClick={() => {
            if (activeCall && activeCall.status !== 'ended') {
              setMinimized(true);
            }
            onRequestClose();
          }}
          className="fixed inset-0 z-50 flex items-end justify-center bg-[#2D0A1E]/45 p-4 backdrop-blur-sm sm:items-center"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="keiz-card animate-bubble-pop w-full max-w-[395px] bg-gradient-to-b from-[#2B0A1B] to-[#17050F] p-5 text-white shadow-2xl"
          >
            <div className="flex items-center justify-between">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-[10px] font-extrabold text-pink-200">
                <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                CALL BERDUA + VOICE CHANGER
              </span>
              {activeCall ? (
                <button
                  type="button"
                  onClick={() => {
                    setMinimized(true);
                    onRequestClose();
                  }}
                  className="flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-pink-100 cursor-pointer"
                  aria-label="Perkecil"
                >
                  <Minimize2 className="h-4 w-4" />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={onRequestClose}
                  className="rounded-full bg-white/10 px-3 py-1 text-[11px] font-bold text-pink-100 cursor-pointer"
                >
                  Tutup
                </button>
              )}
            </div>

            {/* Partner Avatar & Call Status */}
            <div className="mt-4 flex flex-col items-center text-center">
              <div className="relative">
                <img
                  src={partnerPhoto}
                  alt={partnerName}
                  className={`h-20 w-20 rounded-full border-4 object-cover shadow-lg ${
                    partnerRole === 'kenat' ? 'border-[#FF4D8D]' : 'border-[#3B82F6]'
                  } ${activeCall?.status === 'ringing' ? 'animate-pulse' : ''}`}
                />
              </div>
              <h3 className="font-display mt-3 text-xl font-extrabold text-white">
                {partnerName}
              </h3>
              <p className="mt-0.5 text-xs font-bold text-pink-200">
                {!activeCall
                  ? `Siap nelpon ${partnerName} kapan aja`
                  : isIncomingRinging
                  ? `${partnerName} lagi nelpon kamu nihhh! 💖`
                  : activeCall.status === 'ringing'
                  ? `Lagi manggil ${partnerName}...`
                  : `Terhubung · ${formatTimer(callSeconds)}`}
              </p>
            </div>

            {micError && (
              <p className="mt-3 rounded-xl bg-rose-500/20 px-3 py-2 text-center text-[11px] font-semibold text-rose-200">
                {micError}
              </p>
            )}

            {/* Voice Changer Modes */}
            <div className="mt-4 rounded-2xl border border-white/10 bg-white/5 p-3">
              <div className="mb-2 flex items-center gap-1.5 text-[11px] font-extrabold text-pink-200">
                <Sparkles className="h-3.5 w-3.5 text-[#FF7AB8]" />
                <span>Voice Changer Lucu</span>
              </div>
              <div className="grid grid-cols-5 gap-1.5">
                {VOICE_EFFECTS.map((ef) => {
                  const selected = voiceMode === ef.id;
                  return (
                    <button
                      key={ef.id}
                      type="button"
                      onClick={() => handleChangeVoiceEffect(ef.id)}
                      className={`rounded-xl py-2 text-[10px] font-extrabold transition cursor-pointer ${
                        selected
                          ? 'bg-gradient-to-r from-[#FF2E7E] to-[#FF7AB8] text-white shadow'
                          : 'bg-white/10 text-pink-100/80 hover:bg-white/15'
                      }`}
                    >
                      {ef.label}
                    </button>
                  );
                })}
              </div>
              <p className="mt-1.5 text-[10px] text-pink-200/75">
                Mode aktif: {VOICE_EFFECTS.find((v) => v.id === voiceMode)?.desc}
              </p>
            </div>

            {/* Volume Musik di Call (Auto-Ducking 30%) */}
            <div className="mt-3 rounded-2xl border border-white/10 bg-white/5 p-3">
              <div className="flex items-center justify-between text-[11px] font-extrabold text-pink-200">
                <span className="flex items-center gap-1.5">
                  <Music2 className="h-3.5 w-3.5 text-[#FF7AB8]" />
                  Volume Musik di Call
                </span>
                <span className="tabular-nums text-white">{callMusicVolume}%</span>
              </div>
              <input
                type="range"
                min={0}
                max={100}
                value={callMusicVolume}
                onChange={(e) => onCallMusicVolumeChange(Number(e.target.value))}
                className="mt-2 h-1.5 w-full cursor-pointer accent-[#FF4D8D]"
              />
              <p className="mt-1 text-[10px] text-pink-200/70">
                {musicActiveTitle
                  ? `Lagi muter "${musicActiveTitle}" di volume ${callMusicVolume}% biar suara kalian tetep jelas`
                  : 'Pas Call sambil dengerin Musik, volume musik otomatis turun ke 30%'}
              </p>
            </div>

            {/* Action Buttons */}
            <div className="mt-5 flex items-center justify-center gap-4">
              {!activeCall && (
                <button
                  type="button"
                  onClick={handleStartCall}
                  className="keiz-btn-primary btn-bucin flex flex-1 items-center justify-center gap-2 text-xs cursor-pointer"
                >
                  <Phone className="h-4 w-4" />
                  <span>Telpon {partnerName} Sekarang</span>
                </button>
              )}

              {isIncomingRinging && (
                <>
                  <button
                    type="button"
                    onClick={handleAnswerCall}
                    className="btn-bucin flex h-12 flex-1 items-center justify-center gap-2 rounded-full bg-emerald-500 text-xs font-extrabold text-white shadow-lg cursor-pointer"
                  >
                    <Phone className="h-4 w-4" />
                    <span>Angkat</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleEndCall}
                    className="btn-bucin flex h-12 flex-1 items-center justify-center gap-2 rounded-full bg-rose-500 text-xs font-extrabold text-white shadow-lg cursor-pointer"
                  >
                    <PhoneOff className="h-4 w-4" />
                    <span>Tolak</span>
                  </button>
                </>
              )}

              {activeCall && !isIncomingRinging && (
                <>
                  <button
                    type="button"
                    onClick={handleToggleMute}
                    className={`btn-bucin flex h-12 w-12 items-center justify-center rounded-full cursor-pointer ${
                      mutedMic ? 'bg-amber-500 text-white' : 'bg-white/15 text-white'
                    }`}
                    aria-label={mutedMic ? 'Nyalakan mic' : 'Matikan mic'}
                  >
                    {mutedMic ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
                  </button>
                  <button
                    type="button"
                    onClick={handleEndCall}
                    className="btn-bucin flex h-12 flex-1 items-center justify-center gap-2 rounded-full bg-rose-500 text-xs font-extrabold text-white shadow-lg cursor-pointer"
                  >
                    <PhoneOff className="h-4 w-4" />
                    <span>Matikan Call</span>
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
};
