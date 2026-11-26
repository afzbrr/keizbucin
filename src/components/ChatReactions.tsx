import React from 'react';
import { Smile, Trash2, X } from 'lucide-react';
import { AppleEmoji, AppleTextWithEmojis, QUICK_REACT_EMOJIS } from './AppleEmoji';
import type { ChatMessage, CoupleProfile, Role } from '../types';

export type ReactionMap = Partial<Record<Role, string>>;

export function parseReactions(rawReact?: string, msgSender?: Role): ReactionMap {
  if (!rawReact) return {};
  const trimmed = rawReact.trim();
  if (!trimmed) return {};

  if (trimmed.startsWith('{')) {
    try {
      const parsed = JSON.parse(trimmed) as Record<string, unknown>;
      const out: ReactionMap = {};
      if (typeof parsed.faiz === 'string' && parsed.faiz.trim()) {
        out.faiz = parsed.faiz.trim();
      }
      if (typeof parsed.kenat === 'string' && parsed.kenat.trim()) {
        out.kenat = parsed.kenat.trim();
      }
      return out;
    } catch {
      // fallback if malformed
    }
  }

  // Legacy plain emoji string (before per-user tracking): attribute to partner of sender
  const guessedReactor: Role = msgSender === 'faiz' ? 'kenat' : 'faiz';
  return { [guessedReactor]: trimmed };
}

export function serializeReactions(map: ReactionMap): string | undefined {
  const clean: ReactionMap = {};
  if (map.faiz && map.faiz.trim()) clean.faiz = map.faiz.trim();
  if (map.kenat && map.kenat.trim()) clean.kenat = map.kenat.trim();
  if (!clean.faiz && !clean.kenat) return undefined;
  return JSON.stringify(clean);
}

export function toggleUserReaction(
  rawReact: string | undefined,
  user: Role,
  emoji: string,
  msgSender?: Role
): { nextSerialized: string | undefined; addedEmoji: string | undefined } {
  const map = parseReactions(rawReact, msgSender);
  const currentMine = map[user];
  if (currentMine === emoji) {
    delete map[user];
    return { nextSerialized: serializeReactions(map), addedEmoji: undefined };
  }
  map[user] = emoji;
  return { nextSerialized: serializeReactions(map), addedEmoji: emoji };
}

export function getReactionEntries(
  rawReact: string | undefined,
  msgSender?: Role
): Array<{ role: Role; emoji: string }> {
  const map = parseReactions(rawReact, msgSender);
  const entries: Array<{ role: Role; emoji: string }> = [];
  if (map.kenat) entries.push({ role: 'kenat', emoji: map.kenat });
  if (map.faiz) entries.push({ role: 'faiz', emoji: map.faiz });
  return entries;
}

export function getUserReaction(
  rawReact: string | undefined,
  user: Role,
  msgSender?: Role
): string | undefined {
  const map = parseReactions(rawReact, msgSender);
  return map[user];
}

interface ReactionPillProps {
  rawReact?: string;
  msgSender: Role;
  isMine: boolean;
  onClick: (e: React.MouseEvent) => void;
}

export const ReactionPill: React.FC<ReactionPillProps> = ({
  rawReact,
  msgSender,
  isMine,
  onClick,
}) => {
  const entries = getReactionEntries(rawReact, msgSender);
  if (entries.length === 0) return null;

  // Group identical emojis (e.g., ❤️ x2 -> ❤️ 2) like WhatsApp / Telegram
  const grouped: Array<{ emoji: string; count: number }> = [];
  for (const entry of entries) {
    const existing = grouped.find((g) => g.emoji === entry.emoji);
    if (existing) {
      existing.count += 1;
    } else {
      grouped.push({ emoji: entry.emoji, count: 1 });
    }
  }

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onClick(e);
      }}
      title="Lihat siapa yang react"
      aria-label="Lihat siapa yang react"
      className={`absolute -bottom-2.5 ${
        isMine ? 'left-2' : 'right-2'
      } flex items-center gap-1 rounded-full border border-[#FFD6E7] bg-white px-1.5 py-0.5 text-[11px] font-extrabold text-[#5C3A49] shadow cursor-pointer`}
    >
      {grouped.map((g) => (
        <span key={g.emoji} className="inline-flex items-center gap-0.5">
          <AppleEmoji emoji={g.emoji} size={15} />
          {g.count > 1 && <span className="text-[10px] leading-none">{g.count}</span>}
        </span>
      ))}
    </button>
  );
};

interface ReactionDetailsModalProps {
  msg: ChatMessage;
  currentUser: Role;
  profile: CoupleProfile;
  onToggleMyReaction: (emoji: string, burstPoint?: { x: number; y: number }) => void;
  onOpenFullPicker: () => void;
  onClose: () => void;
}

export const ReactionDetailsModal: React.FC<ReactionDetailsModalProps> = ({
  msg,
  currentUser,
  profile,
  onToggleMyReaction,
  onOpenFullPicker,
  onClose,
}) => {
  const entries = getReactionEntries(msg.react, msg.sender);
  const myEmoji = getUserReaction(msg.react, currentUser, msg.sender);

  // Put currentUser first if present (like WhatsApp "You / Kamu"), then partner
  const sortedEntries = [...entries].sort((a, b) => {
    if (a.role === currentUser && b.role !== currentUser) return -1;
    if (b.role === currentUser && a.role !== currentUser) return 1;
    return 0;
  });

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#2D0A1E]/45 p-4 backdrop-blur-sm"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="keiz-card animate-bubble-pop w-full max-w-[360px] overflow-hidden bg-white p-4 shadow-2xl"
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-2 pb-2.5 border-b border-[#FFE3EE]">
          <div className="min-w-0 flex-1">
            <h3 className="font-display text-[15px] font-extrabold text-[#2D0A1E]">
              {entries.length} Reaksi
            </h3>
            <p className="mt-0.5 truncate text-[11px] font-semibold text-[#8A6A7A]">
              <AppleTextWithEmojis
                text={msg.message?.trim() ? msg.message : msg.image_url ? 'Foto' : 'Voice note'}
                emojiSize={13}
              />
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup detail reaksi"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#FFF2F7] text-[#8A6A7A] cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Reactor List (WhatsApp / Telegram style) */}
        <div className="mt-2.5 space-y-2">
          {sortedEntries.map((entry) => {
            const isSelf = entry.role === currentUser;
            const displayName =
              entry.role === 'faiz' ? profile.faizName || 'faiz' : profile.kenatName || 'kenat';
            const photo = entry.role === 'faiz' ? profile.faizPhoto : profile.kenatPhoto;

            if (isSelf) {
              return (
                <button
                  key={entry.role}
                  type="button"
                  onClick={(e) => {
                    const rect = e.currentTarget.getBoundingClientRect();
                    onToggleMyReaction(entry.emoji, {
                      x: rect.left + rect.width / 2,
                      y: rect.top + rect.height / 2,
                    });
                  }}
                  className="flex w-full items-center justify-between gap-2.5 rounded-2xl border border-[#FFD6E7] bg-[#FFF5F9] px-3 py-2 text-left transition-colors active:bg-[#FFE3EE] cursor-pointer"
                >
                  <div className="flex min-w-0 items-center gap-2.5">
                    <img
                      src={photo}
                      alt={displayName}
                      referrerPolicy="no-referrer"
                      className={`h-9 w-9 shrink-0 rounded-full border-2 object-cover ${
                        entry.role === 'faiz' ? 'border-[#3B82F6]' : 'border-[#FF4D8D]'
                      }`}
                    />
                    <div className="min-w-0">
                      <p className="truncate text-xs font-extrabold text-[#2D0A1E]">
                        {displayName} <span className="text-[#D81B6E]">(kamu)</span>
                      </p>
                      <p className="flex items-center gap-1 text-[10px] font-semibold text-[#8A6A7A]">
                        <Trash2 className="h-2.5 w-2.5 text-rose-500" />
                        <span>Ketuk untuk hapus react kamu</span>
                      </p>
                    </div>
                  </div>
                  <AppleEmoji emoji={entry.emoji} size={24} />
                </button>
              );
            }

            return (
              <div
                key={entry.role}
                className="flex w-full items-center justify-between gap-2.5 rounded-2xl border border-[#FFE3EE] bg-white px-3 py-2"
              >
                <div className="flex min-w-0 items-center gap-2.5">
                  <img
                    src={photo}
                    alt={displayName}
                    referrerPolicy="no-referrer"
                    className={`h-9 w-9 shrink-0 rounded-full border-2 object-cover ${
                      entry.role === 'faiz' ? 'border-[#3B82F6]' : 'border-[#FF4D8D]'
                    }`}
                  />
                  <div className="min-w-0">
                    <p className="truncate text-xs font-extrabold text-[#2D0A1E]">
                      {displayName}
                    </p>
                    <p className="text-[10px] font-semibold text-[#8A6A7A]">
                      React dari {displayName}
                    </p>
                  </div>
                </div>
                <AppleEmoji emoji={entry.emoji} size={24} />
              </div>
            );
          })}
        </div>

        {/* Quick add / switch own reaction without touching partner's reaction */}
        <div className="mt-3 border-t border-[#FFE3EE] pt-2.5">
          <p className="mb-1.5 text-[10px] font-extrabold text-[#8A6A7A]">
            {myEmoji ? 'Ganti react kamu:' : 'Ikut react pesan ini:'}
          </p>
          <div className="flex flex-wrap items-center gap-1.5">
            {QUICK_REACT_EMOJIS.map((em) => (
              <button
                key={em}
                type="button"
                onClick={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect();
                  onToggleMyReaction(em, {
                    x: rect.left + rect.width / 2,
                    y: rect.top + rect.height / 2,
                  });
                }}
                className={`flex h-8 w-8 items-center justify-center rounded-full transition-transform active:scale-90 cursor-pointer ${
                  myEmoji === em ? 'bg-[#FFE3EE] ring-1 ring-[#FF2E7E]' : 'bg-[#FFF5F9]'
                }`}
              >
                <AppleEmoji emoji={em} size={20} />
              </button>
            ))}
            <button
              type="button"
              onClick={onOpenFullPicker}
              aria-label="Pilih emot lainnya"
              className="flex h-8 items-center gap-0.5 rounded-full bg-[#FFE3EE] px-2.5 text-[11px] font-extrabold text-[#D81B6E] cursor-pointer"
            >
              <Smile className="h-3.5 w-3.5" />
              <span>+</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
