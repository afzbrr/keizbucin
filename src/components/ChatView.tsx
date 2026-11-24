import React, { useEffect, useRef, useState } from 'react';
import EmojiPicker, {
  EmojiStyle,
  Theme,
  type EmojiClickData,
} from 'emoji-picker-react';
import {
  ArrowLeft,
  Camera,
  Check,
  CheckCheck,
  Clock,
  Database,
  Film,
  Heart,
  Mic,
  Music2,
  Phone,
  Play,
  Plus,
  RotateCcw,
  Send,
  Smile,
  X,
} from 'lucide-react';
import {
  checkSupabaseConnection,
  deleteChatMessage,
  fetchChats,
  formatPartnerPresenceText,
  getConnectionStatus,
  isPresenceOnline,
  markChatsAsRead,
  sendChatMessage,
  sendTypingBroadcast,
  subscribeChatRealtime,
  subscribeConnectionStatus,
  subscribeTypingBroadcast,
  updateChatReact,
  uploadImageToKeizStorage,
} from '../supabaseClient';
import { soundFX } from '../sound';
import { SupabaseConfigCard } from './SupabaseConfigCard';
import type {
  AppSection,
  ChatMessage,
  CoupleProfile,
  PresenceState,
  Role,
} from '../types';

interface ChatViewProps {
  profile: CoupleProfile;
  currentUser: Role;
  partnerPresence: PresenceState | null;
  onBack: () => void;
  onNavigate: (sec: AppSection) => void;
  onStartCall: () => void;
  onForwardToUnek: (text: string) => void;
  onHeartBurstAt: (x: number, y: number) => void;
}

export const ChatView: React.FC<ChatViewProps> = ({
  profile,
  currentUser,
  partnerPresence,
  onBack,
  onNavigate,
  onStartCall,
  onForwardToUnek,
  onHeartBurstAt,
}) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [replyingTo, setReplyingTo] = useState<ChatMessage | null>(null);
  const [activeBubbleMenu, setActiveBubbleMenu] = useState<string | null>(null);
  const [reactTargetMsg, setReactTargetMsg] = useState<ChatMessage | null>(null);
  const [showInputEmojiPicker, setShowInputEmojiPicker] = useState(false);
  const [shakingBubbleId, setShakingBubbleId] = useState<string | null>(null);
  const [partnerTyping, setPartnerTyping] = useState(false);
  const [showPlusMenu, setShowPlusMenu] = useState(false);
  const [showSupabaseConfig, setShowSupabaseConfig] = useState(false);
  const [recordingVN, setRecordingVN] = useState(false);
  const [copiedToast, setCopiedToast] = useState<string | null>(null);
  const [sbConnected, setSbConnected] = useState<boolean>(
    () => getConnectionStatus().ok
  );

  useEffect(() => {
    const unsub = subscribeConnectionStatus((state) => {
      setSbConnected(state.ok);
    });
    void checkSupabaseConnection();
    return unsub;
  }, []);

  const listEndRef = useRef<HTMLDivElement | null>(null);
  const touchStartX = useRef<number | null>(null);
  const longPressTimer = useRef<number | null>(null);
  const longPressFiredRef = useRef(false);

  // Real typing broadcast + DB polling timers & refs
  const lastTypingSentAtRef = useRef<number>(0);
  const stopTypingTimerRef = useRef<number | null>(null);
  const partnerTypingClearRef = useRef<number | null>(null);
  const lastBroadcastTrueAtRef = useRef<number>(0);
  const lastDbUpdatedAtRef = useRef<number>(0);

  const userLower = currentUser.toLowerCase() as Role;
  const partnerRole: Role = userLower === 'faiz' ? 'kenat' : 'faiz';
  const partnerName = partnerRole;
  const partnerPhoto =
    partnerRole === 'kenat' ? profile.kenatPhoto : profile.faizPhoto;

  const isPartnerOnline =
    isPresenceOnline(partnerPresence) && partnerPresence?.status === 'online';
  const partnerOnlineRef = useRef(isPartnerOnline);
  partnerOnlineRef.current = isPartnerOnline;

  const clearPartnerTypingState = () => {
    if (partnerTypingClearRef.current) {
      window.clearTimeout(partnerTypingClearRef.current);
      partnerTypingClearRef.current = null;
    }
    setPartnerTyping(false);
  };

  const stopOwnTyping = () => {
    if (stopTypingTimerRef.current) {
      window.clearTimeout(stopTypingTimerRef.current);
      stopTypingTimerRef.current = null;
    }
    if (lastTypingSentAtRef.current !== 0) {
      lastTypingSentAtRef.current = 0;
      sendTypingBroadcast(userLower, false);
    }
  };

  const loadMessages = async () => {
    const data = await fetchChats(userLower);
    setMessages((prev) => {
      const pendingOrFailed = prev.filter((m) => m.sending || m.failed);
      const merged = [...data];
      pendingOrFailed.forEach((localMsg) => {
        if (!merged.some((m) => m.id === localMsg.id)) {
          merged.push(localMsg);
        }
      });
      return merged;
    });
    if (data.some((m) => m.receiver === userLower && !m.is_read)) {
      await markChatsAsRead(userLower);
      setMessages((prev) =>
        prev.map((m) =>
          m.receiver === userLower ? { ...m, is_read: true } : m
        )
      );
    }
  };

  useEffect(() => {
    void loadMessages();
    const unsub = subscribeChatRealtime(
      (inserted) => {
        const s = inserted.sender.toLowerCase();
        const r = inserted.receiver.toLowerCase();
        const isPair =
          (s === userLower && r === partnerRole) ||
          (s === partnerRole && r === userLower);
        if (
          !isPair ||
          (inserted.type !== 'text' &&
            inserted.type !== 'image' &&
            inserted.type !== 'voice') ||
          inserted.message.startsWith('[Unek-Unek]')
        ) {
          return;
        }
        if (s === partnerRole) {
          clearPartnerTypingState();
        }
        setMessages((prev) =>
          prev.some((m) => m.id === inserted.id) ? prev : [...prev, inserted]
        );
        if (r === userLower && !inserted.is_read) {
          void markChatsAsRead(userLower);
        }
      },
      (updated) => {
        const s = updated.sender.toLowerCase();
        const r = updated.receiver.toLowerCase();
        const isPair =
          (s === userLower && r === partnerRole) ||
          (s === partnerRole && r === userLower);
        if (
          !isPair ||
          (updated.type !== 'text' &&
            updated.type !== 'image' &&
            updated.type !== 'voice') ||
          updated.message.startsWith('[Unek-Unek]')
        ) {
          return;
        }
        setMessages((prev) =>
          prev.map((m) => (m.id === updated.id ? updated : m))
        );
      },
      () => {
        void loadMessages();
      }
    );

    const pollTimer = window.setInterval(() => {
      void loadMessages();
    }, 2000);

    return () => {
      unsub();
      window.clearInterval(pollTimer);
    };
  }, [userLower, partnerRole]);

  // Subscribe to REAL partner typing events (Broadcast 'keiz_typing_room' + DB fallback 'keiz_typing')
  useEffect(() => {
    clearPartnerTypingState();
    lastBroadcastTrueAtRef.current = 0;
    lastDbUpdatedAtRef.current = 0;

    const unsubTyping = subscribeTypingBroadcast(
      userLower,
      (user, isTyping, source, updatedAtMs) => {
        if (user.toLowerCase() !== partnerRole) return;
        if (!partnerOnlineRef.current) {
          clearPartnerTypingState();
          return;
        }

        if (source === 'broadcast') {
          if (isTyping) {
            lastBroadcastTrueAtRef.current = Date.now();
            setPartnerTyping(true);
            if (partnerTypingClearRef.current) {
              window.clearTimeout(partnerTypingClearRef.current);
            }
            partnerTypingClearRef.current = window.setTimeout(() => {
              setPartnerTyping(false);
              partnerTypingClearRef.current = null;
            }, 3000);
          } else {
            clearPartnerTypingState();
          }
          return;
        }

        // DB fallback ('keiz_typing')
        const ts = updatedAtMs || Date.now();
        if (isTyping) {
          const age = Math.max(0, Date.now() - ts);
          if (age >= 3000) {
            clearPartnerTypingState();
            return;
          }
          if (ts > lastDbUpdatedAtRef.current) {
            lastDbUpdatedAtRef.current = ts;
            setPartnerTyping(true);
            if (partnerTypingClearRef.current) {
              window.clearTimeout(partnerTypingClearRef.current);
            }
            partnerTypingClearRef.current = window.setTimeout(() => {
              setPartnerTyping(false);
              partnerTypingClearRef.current = null;
            }, Math.max(500, 3000 - age));
          }
        } else if (
          Date.now() - lastBroadcastTrueAtRef.current > 700 ||
          ts >= lastBroadcastTrueAtRef.current - 400
        ) {
          clearPartnerTypingState();
        }
      }
    );

    return () => {
      unsubTyping();
      clearPartnerTypingState();
      if (stopTypingTimerRef.current) {
        window.clearTimeout(stopTypingTimerRef.current);
        stopTypingTimerRef.current = null;
      }
      if (lastTypingSentAtRef.current !== 0) {
        lastTypingSentAtRef.current = 0;
        sendTypingBroadcast(userLower, false);
      }
    };
  }, [userLower, partnerRole]);

  // Hide typing indicator immediately if partner goes offline
  useEffect(() => {
    if (!isPartnerOnline) {
      clearPartnerTypingState();
    }
  }, [isPartnerOnline]);

  useEffect(() => {
    listEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length, partnerTyping]);

  const handleInputChange = (val: string) => {
    setInput(val);
    if (val.length > 0) {
      const now = Date.now();
      if (now - lastTypingSentAtRef.current >= 800) {
        lastTypingSentAtRef.current = now;
        sendTypingBroadcast(userLower, true);
      }
      if (stopTypingTimerRef.current) {
        window.clearTimeout(stopTypingTimerRef.current);
      }
      stopTypingTimerRef.current = window.setTimeout(() => {
        stopTypingTimerRef.current = null;
        lastTypingSentAtRef.current = 0;
        sendTypingBroadcast(userLower, false);
      }, 2000);
    } else {
      stopOwnTyping();
    }
  };

  const handleSend = async (textOverride?: string, extra?: Partial<ChatMessage>) => {
    const text = (textOverride ?? input).trim();
    if (!text && !extra?.image_url && !extra?.voice_url) return;
    if (!textOverride) setInput('');
    stopOwnTyping();
    soundFX.playPop();

    const payloadExtra: Partial<ChatMessage> = {
      ...extra,
      ...(replyingTo
        ? {
            reply_to: replyingTo.id,
            reply_to_text: replyingTo.message,
            reply_to_sender: replyingTo.sender,
          }
        : {}),
    };
    setReplyingTo(null);
    setShowPlusMenu(false);
    setShowInputEmojiPicker(false);

    const tempId = `temp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const pendingMsg: ChatMessage = {
      id: tempId,
      sender: currentUser,
      receiver: currentUser === 'faiz' ? 'kenat' : 'faiz',
      message: text,
      type:
        payloadExtra.type ||
        (payloadExtra.image_url ? 'image' : payloadExtra.voice_url ? 'voice' : 'text'),
      image_url: payloadExtra.image_url,
      voice_url: payloadExtra.voice_url,
      voice_duration: payloadExtra.voice_duration,
      reply_to: payloadExtra.reply_to,
      reply_to_text: payloadExtra.reply_to_text,
      reply_to_sender: payloadExtra.reply_to_sender,
      is_read: false,
      is_deleted: false,
      created_at: new Date().toISOString(),
      sending: true,
      failed: false,
    };

    setMessages((prev) => [...prev, pendingMsg]);

    try {
      console.log('[ChatView] Inserting to keiz_chat table:', JSON.stringify(pendingMsg));
      const sent = await sendChatMessage(currentUser, text, payloadExtra);
      if (sent.failed) {
        console.log('[ChatView] Insert to keiz_chat failed:', sent);
      }
      setMessages((prev) => {
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
    } catch (err) {
      console.log('[ChatView] Unexpected insert error object:', err);
      console.log('[ChatView] Failed payload:', JSON.stringify(pendingMsg));
      const eObj = err as {
        message?: string;
        details?: string;
        hint?: string;
        code?: string;
      };
      const formattedErr = `ERROR: ${eObj?.message ?? String(err)} | details: ${
        eObj?.details ?? '-'
      } | hint: ${eObj?.hint ?? '-'} | code: ${eObj?.code ?? 'EXCEPTION'}`;
      setMessages((prev) =>
        prev.map((m) =>
          m.id === tempId
            ? { ...m, sending: false, failed: true, errorDetails: formattedErr }
            : m
        )
      );
    }
  };

  const handleRetrySend = async (failedMsg: ChatMessage) => {
    if (failedMsg.sending) return;
    soundFX.playClick();
    setMessages((prev) =>
      prev.map((m) =>
        m.id === failedMsg.id ? { ...m, sending: true, failed: false } : m
      )
    );

    const retryExtra: Partial<ChatMessage> = {
      type: failedMsg.type,
      image_url: failedMsg.image_url,
      voice_url: failedMsg.voice_url,
      voice_duration: failedMsg.voice_duration,
      reply_to: failedMsg.reply_to,
      reply_to_text: failedMsg.reply_to_text,
      reply_to_sender: failedMsg.reply_to_sender,
    };

    try {
      console.log('[ChatView] Retrying insert to keiz_chat table:', JSON.stringify(failedMsg));
      const sent = await sendChatMessage(failedMsg.sender, failedMsg.message, retryExtra);
      if (sent.failed) {
        console.log('[ChatView] Retry insert to keiz_chat failed:', sent);
      }
      setMessages((prev) => {
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
    } catch (err) {
      console.log('[ChatView] Unexpected retry error object:', err);
      console.log('[ChatView] Failed retry payload:', JSON.stringify(failedMsg));
      const eObj = err as {
        message?: string;
        details?: string;
        hint?: string;
        code?: string;
      };
      const formattedErr = `ERROR: ${eObj?.message ?? String(err)} | details: ${
        eObj?.details ?? '-'
      } | hint: ${eObj?.hint ?? '-'} | code: ${eObj?.code ?? 'EXCEPTION'}`;
      setMessages((prev) =>
        prev.map((m) =>
          m.id === failedMsg.id
            ? { ...m, sending: false, failed: true, errorDetails: formattedErr }
            : m
        )
      );
    }
  };

  const applyReactionToMessage = async (
    msg: ChatMessage,
    emoji: string,
    burstPoint?: { x: number; y: number }
  ) => {
    const nextReact = msg.react === emoji ? undefined : emoji;
    soundFX.playPop();
    if (nextReact === '❤️' && burstPoint) {
      onHeartBurstAt(burstPoint.x, burstPoint.y);
      setShakingBubbleId(msg.id);
      setTimeout(() => setShakingBubbleId(null), 500);
    }
    setActiveBubbleMenu(null);
    setReactTargetMsg(null);

    // Optimistic update so emoji appears immediately
    setMessages((prev) =>
      prev.map((m) => (m.id === msg.id ? { ...m, react: nextReact } : m))
    );

    const updated = await updateChatReact(msg.id, nextReact);
    if (updated.length > 0) {
      setMessages(updated);
    }
  };

  const handleReactBadgeClick = async (
    msg: ChatMessage,
    emoji: string,
    e: React.MouseEvent
  ) => {
    const rect = e.currentTarget.getBoundingClientRect();
    await applyReactionToMessage(msg, emoji, {
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2,
    });
  };

  const handlePickerReactSelect = async (emojiData: EmojiClickData, event: MouseEvent) => {
    if (!reactTargetMsg) return;
    await applyReactionToMessage(reactTargetMsg, emojiData.emoji, {
      x: event.clientX || window.innerWidth / 2,
      y: event.clientY || window.innerHeight / 2,
    });
  };

  const handlePickerInputSelect = (emojiData: EmojiClickData) => {
    handleInputChange(`${input}${emojiData.emoji}`);
  };

  const handleDelete = async (id: string) => {
    soundFX.playClick();
    setActiveBubbleMenu(null);
    const updated = await deleteChatMessage(id);
    setMessages(updated);
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.currentTarget.value = '';
    if (!file) return;

    if (file.size === 0) {
      setCopiedToast('izinin akses foto dulu di Pengaturan HP > KEIZ BUCIN > Foto > Izinkan');
      setTimeout(() => setCopiedToast(null), 3500);
      return;
    }

    setShowPlusMenu(false);
    setCopiedToast('lagi upload foto...');
    const uploaded = await uploadImageToKeizStorage(file, file.name, currentUser, 'chat');
    if (!uploaded.publicUrl) {
      setCopiedToast(uploaded.error || 'Gagal upload foto, coba lagi');
      setTimeout(() => setCopiedToast(null), 3200);
      return;
    }

    setCopiedToast(null);
    await handleSend('pap dulu nihh', {
      type: 'image',
      image_url: uploaded.publicUrl,
    });
  };

  const handleVoiceToggle = () => {
    if (!recordingVN) {
      soundFX.playClick();
      setRecordingVN(true);
    } else {
      setRecordingVN(false);
      handleSend('Voice note lucu buat kamu (0:04)', {
        type: 'voice',
        voice_url: 'voice://local-note',
        voice_duration: '0:04',
      });
    }
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

  const partnerPresenceDisplay = formatPartnerPresenceText(
    partnerName,
    partnerPresence
  );

  return (
    <div className="animate-slide-in-right flex min-h-0 flex-1 flex-col gap-2 overflow-hidden">
      {/* Sticky Partner Header + Call + Supabase Config Button */}
      <div className="keiz-card sticky top-0 z-20 flex shrink-0 items-center justify-between bg-white px-3 py-2">
        <div className="flex min-w-0 items-center gap-2.5">
          <button
            type="button"
            onClick={onBack}
            aria-label="Kembali"
            className="btn-bucin flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#FFF2F7] text-[#2D0A1E] cursor-pointer"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div className="relative shrink-0">
            <img
              src={partnerPhoto}
              alt={partnerName}
              referrerPolicy="no-referrer"
              className={`h-10 w-10 rounded-full border-2 object-cover ${
                partnerRole === 'kenat' ? 'border-[#FF4D8D]' : 'border-[#3B82F6]'
              }`}
            />
            <span
              className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-white ${
                partnerPresenceDisplay.online ? 'bg-emerald-500' : 'bg-slate-300'
              }`}
            />
          </div>
          <div className="min-w-0">
            <p className="truncate text-[14px] font-extrabold text-[#2D0A1E]">
              {partnerName}
            </p>
            <p
              className={`truncate text-[11px] font-semibold ${
                partnerPresenceDisplay.online
                  ? 'text-emerald-600'
                  : 'text-[#8A6A7A]'
              }`}
            >
              {partnerPresenceDisplay.shortLabel}
            </p>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          <button
            type="button"
            onClick={() => {
              soundFX.playClick();
              setShowSupabaseConfig((v) => !v);
            }}
            aria-label="Koneksi Supabase"
            title="Koneksi Supabase"
            className={`btn-bucin flex h-9 items-center gap-1 rounded-full px-2.5 text-[10px] font-extrabold cursor-pointer ${
              sbConnected
                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                : 'bg-[#FFF2F7] text-[#D81B6E] border border-[#FFD6E7]'
            }`}
          >
            <Database className="h-3.5 w-3.5" />
            <span>Supabase</span>
          </button>
          <button
            type="button"
            onClick={() => {
              soundFX.playPop();
              onStartCall();
            }}
            aria-label="Call Berdua"
            className="btn-bucin flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-r from-[#FF2E7E] to-[#FF7AB8] text-white shadow cursor-pointer"
          >
            <Phone className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Quick Join Nonton / Ikut Dengerin strip if partner is watching or listening */}
      {(partnerPresenceDisplay.isWatchingNobar ||
        partnerPresenceDisplay.isListeningMusic) && (
        <div className="flex shrink-0 items-center justify-between gap-2 rounded-2xl border border-[#FFD6E7] bg-[#FFF5F9] px-3 py-2 shadow-sm">
          <p className="truncate text-[11px] font-extrabold text-[#2D0A1E]">
            {partnerPresenceDisplay.label}
          </p>
          <button
            type="button"
            onClick={() => {
              soundFX.playPop();
              onNavigate(partnerPresenceDisplay.isWatchingNobar ? 'nobar' : 'lagu');
            }}
            className="btn-bucin inline-flex shrink-0 items-center gap-1 rounded-full bg-gradient-to-r from-[#FF2E7E] to-[#FF7AB8] px-3 py-1 text-[10px] font-extrabold text-white shadow-sm cursor-pointer"
          >
            {partnerPresenceDisplay.isWatchingNobar ? (
              <>
                <Film className="h-3 w-3" />
                <span>Join Nonton</span>
              </>
            ) : (
              <>
                <Music2 className="h-3 w-3" />
                <span>Buka Musik</span>
              </>
            )}
          </button>
        </div>
      )}

      {/* Collapsible VITE Supabase Config Panel inside Chat */}
      {showSupabaseConfig && (
        <div className="animate-bubble-pop shrink-0">
          <SupabaseConfigCard
            compact
            onConnected={() => {
              setSbConnected(true);
              loadMessages();
            }}
          />
        </div>
      )}

      {copiedToast && (
        <div className="animate-bubble-pop shrink-0 rounded-full border border-[#FFD6E7] bg-white px-4 py-1.5 text-center text-xs font-bold text-[#E91E7A] shadow">
          {copiedToast}
        </div>
      )}

      {/* Full-Height WhatsApp-Style Chat Feed */}
      <div
        onClick={() => setActiveBubbleMenu(null)}
        className="keiz-card flex min-h-0 flex-1 flex-col space-y-2.5 overflow-y-auto bg-white/95 p-3.5"
      >
        <div className="mx-auto shrink-0 rounded-full bg-[#FFE3EE] px-3 py-0.5 text-[10px] font-extrabold tracking-wider text-[#D81B6E]">
          HARI INI
        </div>

        {messages.length === 0 && (
          <div className="my-auto flex flex-col items-center justify-center px-4 text-center">
            <svg viewBox="0 0 110 80" className="animate-float-slow h-16 w-24">
              <path
                d="M40 62 C40 62 16 46 16 30 C16 21 23 15 31 15 C36 15 38.8 18 40 21 C41.2 18 44 15 49 15 C57 15 64 21 64 30 C64 46 40 62 40 62 Z"
                fill="#3B82F6"
                stroke="#FFFFFF"
                strokeWidth="2.5"
              />
              <path
                d="M72 68 C72 68 46 50 46 33 C46 23 53 17 62 17 C67 17 70.5 20 72 23.5 C73.5 20 77 17 82 17 C91 17 98 23 98 33 C98 50 72 68 72 68 Z"
                fill="#FF4D8D"
                stroke="#FFFFFF"
                strokeWidth="2.5"
              />
            </svg>
            <p className="mt-2 text-xs font-extrabold text-[#5C3A49]">
              Belum ada chat, mulai ngobrol sekarang
            </p>
          </div>
        )}

        {messages.map((msg) => {
          const isMine = msg.sender === currentUser;
          const bubbleColor = msg.is_deleted
            ? 'bg-slate-200 !text-slate-500'
            : isMine
            ? 'bg-[#3B82F6]'
            : 'bg-[#FF4D8D]';

          return (
            <div
              key={msg.id}
              onClick={(e) => e.stopPropagation()}
              onContextMenu={(e) => {
                if (msg.is_deleted || msg.sending) return;
                e.preventDefault();
                soundFX.playClick();
                setActiveBubbleMenu(null);
                setReactTargetMsg(msg);
              }}
              onDoubleClick={() => {
                if (!msg.is_deleted) {
                  setActiveBubbleMenu((cur) => (cur === msg.id ? null : msg.id));
                }
              }}
              onTouchStart={(e) => {
                if (msg.is_deleted) return;
                longPressFiredRef.current = false;
                touchStartX.current = e.touches[0].clientX;
                longPressTimer.current = window.setTimeout(() => {
                  longPressFiredRef.current = true;
                  soundFX.playClick();
                  setActiveBubbleMenu(null);
                  setReactTargetMsg(msg);
                }, 420);
              }}
              onTouchMove={(e) => {
                if (longPressTimer.current) {
                  clearTimeout(longPressTimer.current);
                  longPressTimer.current = null;
                }
                if (
                  touchStartX.current !== null &&
                  e.touches[0].clientX - touchStartX.current > 48
                ) {
                  touchStartX.current = null;
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
              }}
              className={`animate-pop-up relative flex flex-col ${
                isMine ? 'items-end' : 'items-start'
              } ${msg.react && !msg.is_deleted ? 'mb-2' : ''}`}
            >
              <div
                onClick={() => {
                  if (longPressFiredRef.current) {
                    longPressFiredRef.current = false;
                    return;
                  }
                  if (msg.failed) {
                    void handleRetrySend(msg);
                    return;
                  }
                  if (!msg.is_deleted && !msg.sending) {
                    setActiveBubbleMenu((cur) => (cur === msg.id ? null : msg.id));
                  }
                }}
                className={`relative max-w-[82%] cursor-pointer rounded-2xl px-3.5 py-2 text-[13px] leading-relaxed text-white shadow-sm ${bubbleColor} ${
                  isMine ? 'rounded-br-[4px]' : 'rounded-bl-[4px]'
                } ${msg.failed ? 'opacity-90 ring-2 ring-rose-400' : ''} ${
                  shakingBubbleId === msg.id ? 'animate-bubble-shake' : ''
                }`}
              >
                {msg.is_deleted ? (
                  <span className="italic text-xs">Pesan ini udah dihapus</span>
                ) : (
                  <>
                    {/* Quoted Reply inside bubble */}
                    {msg.reply_to_text && (
                      <div className="mb-1.5 rounded-xl border-l-[3px] border-white/80 bg-black/15 px-2.5 py-1.5 text-[11px]">
                        <p className="font-extrabold opacity-90">
                          {msg.reply_to_sender === 'faiz' ? 'faiz' : 'kenat'}
                        </p>
                        <p className="line-clamp-1 opacity-85">{msg.reply_to_text}</p>
                      </div>
                    )}

                    {msg.image_url && (
                      <img
                        src={msg.image_url}
                        alt="Kiriman foto"
                        referrerPolicy="no-referrer"
                        className="mb-1.5 max-h-44 w-full rounded-xl object-cover"
                      />
                    )}

                    {msg.type === 'voice' ? (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          soundFX.playHeartBurst();
                        }}
                        className="flex items-center gap-2 py-0.5 text-left"
                      >
                        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-white/25">
                          <Play className="ml-0.5 h-3.5 w-3.5 fill-current" />
                        </span>
                        <span className="text-xs font-bold">
                          Voice note ({msg.voice_duration || '0:04'})
                        </span>
                      </button>
                    ) : (
                      <span>{msg.message}</span>
                    )}
                  </>
                )}

                <div className="mt-1 flex items-center justify-end gap-1 text-[10px] text-white/80">
                  <span>{formatTime(msg.created_at)}</span>
                  {isMine &&
                    !msg.is_deleted &&
                    (msg.sending ? (
                      <Clock className="h-3 w-3 animate-pulse text-white/75" aria-label="Mengirim" />
                    ) : msg.failed ? (
                      <RotateCcw className="h-3 w-3 text-rose-200" aria-label="Gagal terkirim" />
                    ) : msg.is_read ? (
                      <CheckCheck className="h-3.5 w-3.5 text-sky-200" aria-label="Dibaca" />
                    ) : (
                      <Check className="h-3 w-3 text-white/75" aria-label="Terkirim" />
                    ))}
                </div>

                {/* Attached Reaction Pill at corner (click to remove/toggle) */}
                {msg.react && !msg.is_deleted && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      void handleReactBadgeClick(msg, msg.react!, e);
                    }}
                    title="Tap untuk hapus react"
                    className={`absolute -bottom-2.5 ${
                      isMine ? 'left-2' : 'right-2'
                    } rounded-full border border-[#FFD6E7] bg-white px-1.5 py-0.5 text-xs shadow cursor-pointer`}
                  >
                    {msg.react}
                  </button>
                )}
              </div>

              {msg.failed && (
                <div className="mt-1 flex max-w-[85%] flex-col items-end gap-1">
                  <button
                    type="button"
                    onClick={() => handleRetrySend(msg)}
                    className="flex items-center gap-1 rounded-full border border-rose-200 bg-rose-50 px-2.5 py-0.5 text-[10px] font-extrabold text-rose-600 shadow-sm cursor-pointer"
                  >
                    <RotateCcw className="h-3 w-3" />
                    <span>Gagal terkirim, klik untuk coba lagi</span>
                  </button>
                  {msg.errorDetails && (
                    <p className="select-text break-all rounded-lg border border-rose-200 bg-rose-50/95 px-2.5 py-1 text-left text-[10px] font-bold leading-snug text-rose-700">
                      {msg.errorDetails}
                    </p>
                  )}
                </div>
              )}

              {/* Context Action Bar (opens Full Emoji Picker when clicking React) */}
              {activeBubbleMenu === msg.id && !msg.is_deleted && (
                <div
                  className={`animate-bubble-pop z-30 mt-2 flex flex-wrap gap-1.5 rounded-2xl border border-[#FFD6E7] bg-white p-2 text-[11px] font-bold shadow-xl ${
                    isMine ? 'justify-end' : 'justify-start'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => {
                      soundFX.playClick();
                      setActiveBubbleMenu(null);
                      setReactTargetMsg(msg);
                    }}
                    className="inline-flex items-center gap-1 rounded-lg bg-[#FFE3EE] px-2.5 py-1 text-[#D81B6E] cursor-pointer"
                  >
                    <Smile className="h-3.5 w-3.5" />
                    <span>React</span>
                  </button>
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
                      setCopiedToast('Teks disalin');
                      setTimeout(() => setCopiedToast(null), 1500);
                    }}
                    className="rounded-lg bg-[#FFF2F7] px-2.5 py-1 text-[#2D0A1E] cursor-pointer"
                  >
                    Salin
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      onForwardToUnek(msg.message);
                      setActiveBubbleMenu(null);
                      setCopiedToast('Diteruskan ke Unek Unek');
                      setTimeout(() => setCopiedToast(null), 1800);
                    }}
                    className="rounded-lg bg-[#FFF2F7] px-2.5 py-1 text-[#E91E7A] cursor-pointer"
                  >
                    Teruskan ke Unek Unek
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(msg.id)}
                    className="rounded-lg bg-rose-50 px-2.5 py-1 text-rose-600 cursor-pointer"
                  >
                    Hapus
                  </button>
                </div>
              )}
            </div>
          );
        })}

        {/* REAL Partner Typing Indicator (ONLY when partner is online & genuinely typing) */}
        {partnerTyping && isPartnerOnline && (
          <div className="flex items-center gap-1.5 pt-0.5 text-[11px] font-bold text-[#8A6A7A]">
            <span>{partnerName} sedang mengetik...</span>
            <span className="flex gap-1">
              <span className="animate-typing-dot-1 h-1.5 w-1.5 rounded-full bg-[#FF4D8D]" />
              <span className="animate-typing-dot-2 h-1.5 w-1.5 rounded-full bg-[#FF4D8D]" />
              <span className="animate-typing-dot-3 h-1.5 w-1.5 rounded-full bg-[#FF4D8D]" />
            </span>
          </div>
        )}
        <div ref={listEndRef} />
      </div>

      {/* Replying-to Banner */}
      {replyingTo && (
        <div className="animate-bubble-pop flex shrink-0 items-center justify-between rounded-2xl border border-[#FFD6E7] bg-white px-3.5 py-2 text-xs">
          <div className="min-w-0 flex-1 border-l-[3px] border-[#FF2E7E] pl-2.5">
            <p className="text-[10px] font-extrabold text-[#E91E7A]">
              Membalas {replyingTo.sender === 'faiz' ? 'faiz' : 'kenat'}
            </p>
            <p className="truncate text-[#8A6A7A]">{replyingTo.message}</p>
          </div>
          <button
            type="button"
            onClick={() => setReplyingTo(null)}
            className="ml-2 flex h-7 w-7 items-center justify-center rounded-full bg-[#FFF2F7] text-[#8A6A7A] cursor-pointer"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* + Attachment Drawer (native label wrapping file input for PWA & WebView) */}
      {showPlusMenu && (
        <div className="animate-bubble-pop grid shrink-0 grid-cols-2 gap-2 rounded-2xl border border-[#FFD6E7] bg-white p-2.5 text-xs font-bold">
          <label className="relative flex cursor-pointer items-center justify-center gap-1.5 overflow-hidden rounded-xl bg-[#EFF6FF] py-2.5 text-[#3B82F6]">
            <input
              type="file"
              accept="image/*"
              onChange={handleImageUpload}
              aria-label="Kirim foto"
              className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
            />
            <Camera className="h-4 w-4" />
            <span>Foto</span>
          </label>
          <button
            type="button"
            onClick={() => {
              setShowPlusMenu(false);
              onForwardToUnek(input.trim() || 'kangen kamu nihh');
              setCopiedToast('Masuk ke Unek Unek');
              setTimeout(() => setCopiedToast(null), 1600);
            }}
            className="flex items-center justify-center gap-1.5 rounded-xl bg-[#FFF7E6] py-2.5 text-[#B7791F] cursor-pointer"
          >
            <Heart className="h-4 w-4" />
            <span>Unek</span>
          </button>
        </div>
      )}

      {/* Inline Full Emoji Picker for Input */}
      {showInputEmojiPicker && (
        <div className="animate-bubble-pop shrink-0 overflow-hidden rounded-2xl border border-[#FFD6E7] bg-white shadow-lg">
          <EmojiPicker
            width="100%"
            height={300}
            searchPlaceholder="Cari emot..."
            emojiStyle={EmojiStyle.NATIVE}
            theme={Theme.LIGHT}
            lazyLoadEmojis
            previewConfig={{ showPreview: false }}
            onEmojiClick={handlePickerInputSelect}
          />
        </div>
      )}

      {/* Input Row (sticky bottom inside flex column) */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void handleSend();
        }}
        className="sticky bottom-0 z-10 flex shrink-0 items-center gap-1.5 pt-0.5"
      >
        <button
          type="button"
          onClick={() => {
            soundFX.playClick();
            setShowPlusMenu((v) => !v);
            setShowInputEmojiPicker(false);
          }}
          aria-label="Lampiran"
          className="btn-bucin flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-[#FFD6E7] bg-white text-[#E91E7A] cursor-pointer"
        >
          <Plus className="h-5 w-5" />
        </button>

        <button
          type="button"
          onClick={() => {
            soundFX.playClick();
            setShowInputEmojiPicker((v) => !v);
            setShowPlusMenu(false);
          }}
          aria-label="Pilih emot"
          className={`btn-bucin flex h-11 w-11 shrink-0 items-center justify-center rounded-full border cursor-pointer ${
            showInputEmojiPicker
              ? 'border-[#FF2E7E] bg-[#FFE3EE] text-[#D81B6E]'
              : 'border-[#FFD6E7] bg-white text-[#FF4D8D]'
          }`}
        >
          <Smile className="h-5 w-5" />
        </button>

        <input
          type="text"
          value={input}
          onChange={(e) => handleInputChange(e.target.value)}
          onBlur={stopOwnTyping}
          placeholder={
            currentUser === 'faiz' ? 'ketik buat kenat...' : 'ketik buat faiz...'
          }
          className="min-h-[44px] flex-1 rounded-full border border-[#FFD6E7] bg-white px-4 text-xs font-semibold text-[#2D0A1E] placeholder-[#9A7A8A] focus:border-[#FF2E7E] focus:outline-none"
        />

        {input.trim() ? (
          <button
            type="submit"
            aria-label="Kirim chat"
            className={`btn-bucin flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-white shadow-md cursor-pointer ${
              currentUser === 'faiz' ? 'bg-[#3B82F6]' : 'bg-[#FF4D8D]'
            }`}
          >
            <Send className="h-4 w-4" />
          </button>
        ) : (
          <button
            type="button"
            onClick={handleVoiceToggle}
            aria-label="Rekam voice note"
            className={`btn-bucin flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-white shadow-md cursor-pointer ${
              recordingVN
                ? 'animate-heartbeat bg-rose-600'
                : currentUser === 'faiz'
                ? 'bg-[#3B82F6]'
                : 'bg-[#FF4D8D]'
            }`}
          >
            <Mic className="h-4 w-4" />
          </button>
        )}
      </form>

      {/* Full Emoji Picker Popup for Message Reaction */}
      {reactTargetMsg && (
        <div
          onClick={() => setReactTargetMsg(null)}
          className="fixed inset-0 z-50 flex items-end justify-center bg-[#2D0A1E]/45 p-3 backdrop-blur-sm sm:items-center"
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
                  {reactTargetMsg.message || 'Foto / Voice note'}
                </p>
              </div>
              {reactTargetMsg.react && (
                <button
                  type="button"
                  onClick={() =>
                    void applyReactionToMessage(reactTargetMsg, reactTargetMsg.react!)
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
              height={360}
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
    </div>
  );
};
