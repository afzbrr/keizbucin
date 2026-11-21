import React, { useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  Camera,
  Check,
  CheckCheck,
  Database,
  Film,
  Mic,
  Music2,
  Phone,
  Plus,
  Send,
  Smile,
  X,
} from 'lucide-react';
import {
  deleteChatMessage,
  fetchChats,
  isSupabaseConfigured,
  markChatsAsRead,
  sendChatMessage,
  subscribeChatRealtime,
  updateChatReact,
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

const REACTS = ['❤️', '😂', '😭', '😍', '😡', '🔥', '👍'];

const STICKERS = [
  'kangen banget! 💖',
  'sini peluk! 🫂',
  'udah makan blm? 🥺',
  'loveyouuu 💙',
];

const QUICK_REPLIES: Record<Role, string[]> = {
  faiz: [
    'ayang udah makan belum? 🥺',
    'faiz lagi kangen kenat nih 💙',
  ],
  kenat: [
    'faiz udah makan belum?',
    'kenat kangen faiz nih 💖',
  ],
};

interface ChatViewProps {
  profile: CoupleProfile;
  currentUser: Role;
  partnerPresence: PresenceState | null;
  onBack: () => void;
  onChangeUser: (role: Role) => void;
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
  onChangeUser,
  onNavigate,
  onStartCall,
  onForwardToUnek,
  onHeartBurstAt,
}) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [replyingTo, setReplyingTo] = useState<ChatMessage | null>(null);
  const [activeBubbleMenu, setActiveBubbleMenu] = useState<string | null>(null);
  const [shakingBubbleId, setShakingBubbleId] = useState<string | null>(null);
  const [partnerTyping, setPartnerTyping] = useState(false);
  const [showPlusMenu, setShowPlusMenu] = useState(false);
  const [showStickers, setShowStickers] = useState(false);
  const [showSupabaseConfig, setShowSupabaseConfig] = useState(false);
  const [recordingVN, setRecordingVN] = useState(false);
  const [copiedToast, setCopiedToast] = useState<string | null>(null);
  const [sbConnected, setSbConnected] = useState(isSupabaseConfigured());

  const listEndRef = useRef<HTMLDivElement | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const touchStartX = useRef<number | null>(null);
  const longPressTimer = useRef<number | null>(null);

  const partnerRole: Role = currentUser === 'faiz' ? 'kenat' : 'faiz';
  const partnerName =
    partnerRole === 'kenat'
      ? `${profile.kenatName} 💖`
      : `${profile.faizName} 💙`;
  const partnerPhoto =
    partnerRole === 'kenat' ? profile.kenatPhoto : profile.faizPhoto;

  const loadMessages = async () => {
    const data = await fetchChats();
    setMessages(data);
    if (data.some((m) => m.receiver === currentUser && !m.is_read)) {
      await markChatsAsRead(currentUser);
      setMessages((prev) =>
        prev.map((m) =>
          m.receiver === currentUser ? { ...m, is_read: true } : m
        )
      );
    }
  };

  useEffect(() => {
    loadMessages();
    const unsub = subscribeChatRealtime(
      (inserted) => {
        setMessages((prev) =>
          prev.some((m) => m.id === inserted.id) ? prev : [...prev, inserted]
        );
        if (inserted.receiver === currentUser && !inserted.is_read) {
          markChatsAsRead(currentUser);
        }
      },
      (updated) => {
        setMessages((prev) =>
          prev.map((m) => (m.id === updated.id ? updated : m))
        );
      },
      () => {
        loadMessages();
      }
    );
    return unsub;
  }, [currentUser]);

  useEffect(() => {
    listEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length, partnerTyping]);

  const triggerBriefTyping = () => {
    setPartnerTyping(true);
    setTimeout(() => setPartnerTyping(false), 1200);
  };

  const handleSend = async (textOverride?: string, extra?: Partial<ChatMessage>) => {
    const text = (textOverride ?? input).trim();
    if (!text && !extra?.image_url && !extra?.voice_url) return;
    if (!textOverride) setInput('');
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
    setShowStickers(false);

    const sent = await sendChatMessage(currentUser, text, payloadExtra);
    setMessages((prev) => (prev.some((m) => m.id === sent.id) ? prev : [...prev, sent]));
    triggerBriefTyping();
  };

  const handleReact = async (msg: ChatMessage, emoji: string, e: React.MouseEvent) => {
    const nextReact = msg.react === emoji ? undefined : emoji;
    soundFX.playPop();
    if (nextReact === '❤️') {
      const rect = e.currentTarget.getBoundingClientRect();
      onHeartBurstAt(rect.left + rect.width / 2, rect.top + rect.height / 2);
      setShakingBubbleId(msg.id);
      setTimeout(() => setShakingBubbleId(null), 500);
    }
    setActiveBubbleMenu(null);
    const updated = await updateChatReact(msg.id, nextReact);
    setMessages(updated);
  };

  const handleDelete = async (id: string) => {
    soundFX.playClick();
    setActiveBubbleMenu(null);
    const updated = await deleteChatMessage(id);
    setMessages(updated);
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        handleSend('pap dulu nihh 📸', {
          type: 'image',
          image_url: reader.result,
        });
      }
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleVoiceToggle = () => {
    if (!recordingVN) {
      soundFX.playClick();
      setRecordingVN(true);
    } else {
      setRecordingVN(false);
      handleSend('🎤 Voice note lucu buat kamu (0:04)', {
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

  const partnerStatusLabel =
    partnerPresence?.status === 'online'
      ? `Online · ${partnerPresence.lagi_ngapain}${
          partnerPresence.lagi_play_apa ? ` (${partnerPresence.lagi_play_apa})` : ''
        }`
      : `Lagi kangen ${currentUser === 'faiz' ? profile.faizName : profile.kenatName}`;

  return (
    <div className="animate-slide-in-right flex flex-col gap-2.5 pb-6">
      {/* Top 2 buttons: Pick WHO AM I */}
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => {
            soundFX.playClick();
            onChangeUser('faiz');
          }}
          className={`btn-bucin min-h-[40px] rounded-full text-xs font-extrabold cursor-pointer ${
            currentUser === 'faiz'
              ? 'bg-[#3B82F6] text-white shadow-md shadow-blue-500/25'
              : 'border border-[#FFD6E7] bg-white text-[#8A6A7A]'
          }`}
        >
          Faiz 💙
        </button>
        <button
          type="button"
          onClick={() => {
            soundFX.playClick();
            onChangeUser('kenat');
          }}
          className={`btn-bucin min-h-[40px] rounded-full text-xs font-extrabold cursor-pointer ${
            currentUser === 'kenat'
              ? 'bg-[#FF4D8D] text-white shadow-md shadow-pink-500/25'
              : 'border border-[#FFD6E7] bg-white text-[#8A6A7A]'
          }`}
        >
          Kenat 💖
        </button>
      </div>

      {/* Partner Header + Call + Supabase Config Button */}
      <div className="keiz-card flex items-center justify-between bg-white px-3 py-2.5">
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
                partnerPresence?.status === 'online'
                  ? 'bg-emerald-500'
                  : 'bg-slate-300'
              }`}
            />
          </div>
          <div className="min-w-0">
            <p className="truncate text-[14px] font-extrabold text-[#2D0A1E]">
              {partnerName}
            </p>
            <p className="truncate text-[11px] font-semibold text-emerald-600">
              {partnerStatusLabel}
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

      {/* Collapsible VITE Supabase Config Panel inside Chat */}
      {showSupabaseConfig && (
        <div className="animate-bubble-pop">
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
        <div className="animate-bubble-pop rounded-full bg-white px-4 py-1.5 text-center text-xs font-bold text-[#E91E7A] shadow border border-[#FFD6E7]">
          {copiedToast}
        </div>
      )}

      {/* WhatsApp-Style Chat Feed */}
      <div
        onClick={() => setActiveBubbleMenu(null)}
        className="keiz-card flex h-[340px] flex-col space-y-2.5 overflow-y-auto bg-white/95 p-3.5"
      >
        <div className="mx-auto rounded-full bg-[#FFE3EE] px-3 py-0.5 text-[10px] font-extrabold tracking-wider text-[#D81B6E]">
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
              Belum ada chat nih, yuk chat pertama
            </p>
            <button
              type="button"
              onClick={() => {
                soundFX.playHeartBurst();
                handleSend(
                  currentUser === 'faiz'
                    ? `haloo ${profile.kenatName} cantikk, lagi ngapain? 💙`
                    : `haloo ${profile.faizName} gantengg, kangen nih 💖`
                );
              }}
              className="keiz-btn-primary btn-bucin mt-3 min-h-[40px] px-5 text-xs cursor-pointer"
            >
              Chat Pertama
            </button>
          </div>
        )}

        {messages.map((msg) => {
          const isMine = msg.sender === currentUser;
          const isFaizMsg = msg.sender === 'faiz';
          const bubbleColor = msg.is_deleted
            ? 'bg-slate-200 !text-slate-500'
            : isFaizMsg
            ? 'bg-[#3B82F6]'
            : 'bg-[#FF4D8D]';

          return (
            <div
              key={msg.id}
              onClick={(e) => e.stopPropagation()}
              onDoubleClick={() => {
                if (!msg.is_deleted) {
                  setActiveBubbleMenu((cur) => (cur === msg.id ? null : msg.id));
                }
              }}
              onTouchStart={(e) => {
                if (msg.is_deleted) return;
                touchStartX.current = e.touches[0].clientX;
                longPressTimer.current = window.setTimeout(() => {
                  soundFX.playClick();
                  setActiveBubbleMenu(msg.id);
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
              }`}
            >
              <div
                onClick={() => {
                  if (!msg.is_deleted) {
                    setActiveBubbleMenu((cur) => (cur === msg.id ? null : msg.id));
                  }
                }}
                className={`relative max-w-[82%] cursor-pointer rounded-2xl px-3.5 py-2 text-[13px] leading-relaxed text-white shadow-sm ${bubbleColor} ${
                  isMine ? 'rounded-br-[4px]' : 'rounded-bl-[4px]'
                } ${shakingBubbleId === msg.id ? 'animate-bubble-shake' : ''}`}
              >
                {msg.is_deleted ? (
                  <span className="italic text-xs">Pesan ini udah dihapus</span>
                ) : (
                  <>
                    {/* Quoted Reply inside bubble */}
                    {msg.reply_to_text && (
                      <div className="mb-1.5 rounded-xl bg-black/15 px-2.5 py-1.5 text-[11px] border-l-[3px] border-white/80">
                        <p className="font-extrabold opacity-90">
                          {msg.reply_to_sender === 'faiz'
                            ? profile.faizName
                            : profile.kenatName}
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
                        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-white/25 text-xs">
                          ▶
                        </span>
                        <span className="text-xs font-bold">
                          Voice note ({msg.voice_duration || '0:04'}) 🎵
                        </span>
                      </button>
                    ) : (
                      <span>{msg.message}</span>
                    )}

                    {msg.type === 'nobar_link' && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onNavigate('nobar');
                        }}
                        className="mt-2 flex items-center gap-1.5 rounded-xl bg-white/25 px-3 py-1.5 text-[11px] font-extrabold text-white cursor-pointer"
                      >
                        <Film className="h-3.5 w-3.5" />
                        <span>Buka di Nobar</span>
                      </button>
                    )}

                    {msg.type === 'music_link' && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onNavigate('lagu');
                        }}
                        className="mt-2 flex items-center gap-1.5 rounded-xl bg-white/25 px-3 py-1.5 text-[11px] font-extrabold text-white cursor-pointer"
                      >
                        <Music2 className="h-3.5 w-3.5" />
                        <span>Dengerin Bareng</span>
                      </button>
                    )}
                  </>
                )}

                <div className="mt-1 flex items-center justify-end gap-1 text-[10px] text-white/80">
                  <span>{formatTime(msg.created_at)}</span>
                  {isMine &&
                    !msg.is_deleted &&
                    (msg.is_read ? (
                      <CheckCheck className="h-3.5 w-3.5 text-sky-200" aria-label="Dibaca" />
                    ) : (
                      <Check className="h-3 w-3 text-white/75" aria-label="Terkirim" />
                    ))}
                </div>

                {/* Attached Reaction Pill at corner */}
                {msg.react && !msg.is_deleted && (
                  <button
                    type="button"
                    onClick={(e) => handleReact(msg, msg.react!, e)}
                    className={`absolute -bottom-2.5 ${
                      isMine ? 'left-2' : 'right-2'
                    } rounded-full border border-[#FFD6E7] bg-white px-1.5 py-0.5 text-xs shadow`}
                  >
                    {msg.react}
                  </button>
                )}
              </div>

              {/* Floating React + Context Action Bar */}
              {activeBubbleMenu === msg.id && !msg.is_deleted && (
                <div
                  className={`animate-bubble-pop z-30 mt-2 flex flex-col gap-1.5 rounded-2xl border border-[#FFD6E7] bg-white p-2 shadow-xl ${
                    isMine ? 'items-end' : 'items-start'
                  }`}
                >
                  <div className="flex items-center gap-1">
                    {REACTS.map((emoji) => (
                      <button
                        key={emoji}
                        type="button"
                        onClick={(e) => handleReact(msg, emoji, e)}
                        className="btn-bucin flex h-8 w-8 items-center justify-center rounded-full text-base hover:bg-[#FFF2F7] cursor-pointer"
                      >
                        {emoji}
                      </button>
                    ))}
                  </div>
                  <div className="flex flex-wrap gap-1.5 border-t border-[#FFD6E7] pt-1.5 text-[11px] font-bold">
                    <button
                      type="button"
                      onClick={() => {
                        setReplyingTo(msg);
                        setActiveBubbleMenu(null);
                      }}
                      className="rounded-lg bg-[#FFF2F7] px-2 py-1 text-[#2D0A1E] cursor-pointer"
                    >
                      Balas
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard?.writeText(msg.message).catch(() => {});
                        setActiveBubbleMenu(null);
                        setCopiedToast('Teks disalin 📋');
                        setTimeout(() => setCopiedToast(null), 1500);
                      }}
                      className="rounded-lg bg-[#FFF2F7] px-2 py-1 text-[#2D0A1E] cursor-pointer"
                    >
                      Salin
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        onForwardToUnek(msg.message);
                        setActiveBubbleMenu(null);
                        setCopiedToast('Diteruskan ke Unek Unek 💭');
                        setTimeout(() => setCopiedToast(null), 1800);
                      }}
                      className="rounded-lg bg-[#FFF2F7] px-2 py-1 text-[#E91E7A] cursor-pointer"
                    >
                      Teruskan ke Unek Unek
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(msg.id)}
                      className="rounded-lg bg-rose-50 px-2 py-1 text-rose-600 cursor-pointer"
                    >
                      Hapus
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}

        {/* Typing Indicator */}
        {partnerTyping && (
          <div className="flex items-center gap-2 text-[11px] font-bold text-[#8A6A7A]">
            <span>{partnerName} sedang mengetik</span>
            <span className="flex gap-1">
              <span className="animate-typing-dot-1 h-1.5 w-1.5 rounded-full bg-[#FF4D8D]" />
              <span className="animate-typing-dot-2 h-1.5 w-1.5 rounded-full bg-[#FF4D8D]" />
              <span className="animate-typing-dot-3 h-1.5 w-1.5 rounded-full bg-[#FF4D8D]" />
            </span>
          </div>
        )}
        <div ref={listEndRef} />
      </div>

      {/* Quick Replies */}
      <div className="flex gap-1.5 overflow-x-auto pb-0.5">
        {QUICK_REPLIES[currentUser].map((chip) => (
          <button
            key={chip}
            type="button"
            onClick={() => handleSend(chip)}
            className="btn-bucin shrink-0 rounded-full border border-[#FFD6E7] bg-white px-3 py-1.5 text-[11px] font-bold text-[#2D0A1E] shadow-sm cursor-pointer"
          >
            {chip}
          </button>
        ))}
      </div>

      {/* Replying-to Banner */}
      {replyingTo && (
        <div className="animate-bubble-pop flex items-center justify-between rounded-2xl border border-[#FFD6E7] bg-white px-3.5 py-2 text-xs">
          <div className="min-w-0 flex-1 border-l-[3px] border-[#FF2E7E] pl-2.5">
            <p className="text-[10px] font-extrabold text-[#E91E7A]">
              Membalas {replyingTo.sender === 'faiz' ? profile.faizName : profile.kenatName}
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

      {/* + Attachment Drawer or Sticker Picker */}
      {showPlusMenu && (
        <div className="animate-bubble-pop grid grid-cols-2 gap-2 rounded-2xl border border-[#FFD6E7] bg-white p-2.5 text-xs font-bold">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="flex items-center justify-center gap-1.5 rounded-xl bg-[#EFF6FF] py-2.5 text-[#3B82F6] cursor-pointer"
          >
            <Camera className="h-4 w-4" /> Foto
          </button>
          <button
            type="button"
            onClick={() => {
              setShowPlusMenu(false);
              onForwardToUnek(input.trim() || 'kangen kamu nihh');
              setCopiedToast('Masuk ke Unek Unek 💭');
              setTimeout(() => setCopiedToast(null), 1600);
            }}
            className="flex items-center justify-center gap-1.5 rounded-xl bg-[#FFF7E6] py-2.5 text-[#B7791F] cursor-pointer"
          >
            💭 Unek
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            onChange={handleImageUpload}
            className="hidden"
          />
        </div>
      )}

      {showStickers && (
        <div className="animate-bubble-pop grid grid-cols-2 gap-2 rounded-2xl border border-[#FFD6E7] bg-white p-2.5">
          {STICKERS.map((st) => (
            <button
              key={st}
              type="button"
              onClick={() => handleSend(st, { type: 'sticker' })}
              className="btn-bucin rounded-xl border border-[#FFD6E7] bg-[#FFF2F7] px-3 py-2 text-xs font-extrabold text-[#D81B6E] cursor-pointer"
            >
              {st}
            </button>
          ))}
        </div>
      )}

      {/* Input Row */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          handleSend();
        }}
        className="flex items-center gap-1.5"
      >
        <button
          type="button"
          onClick={() => {
            soundFX.playClick();
            setShowPlusMenu((v) => !v);
            setShowStickers(false);
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
            setShowStickers((v) => !v);
            setShowPlusMenu(false);
          }}
          aria-label="Stiker"
          className="btn-bucin flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-[#FFD6E7] bg-white text-[#FF4D8D] cursor-pointer"
        >
          <Smile className="h-5 w-5" />
        </button>

        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={
            currentUser === 'faiz'
              ? `ketik buat ${profile.kenatName} cantikk...`
              : `ketik buat ${profile.faizName} gantengg...`
          }
          className="min-h-[46px] flex-1 rounded-full border border-[#FFD6E7] bg-white px-4 text-xs font-semibold text-[#2D0A1E] placeholder-[#9A7A8A] focus:outline-none focus:border-[#FF2E7E]"
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
    </div>
  );
};
