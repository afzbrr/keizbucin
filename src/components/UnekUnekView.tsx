import React, { useEffect, useRef, useState } from 'react';
import { ArrowLeft, EyeOff, MessageSquare, Pencil, Send, Trash2 } from 'lucide-react';
import {
  addUnekItem,
  deleteUnekItem,
  fetchUnekList,
  replyUnekItem,
  subscribeRealtime,
} from '../supabaseClient';
import { soundFX } from '../sound';
import type { Role, UnekItem } from '../types';

const MOOD_OPTIONS = ['Kangen', 'Senang', 'Kesel', 'Capek', 'Sayang'] as const;

interface UnekUnekViewProps {
  currentUser: Role;
  onBack: () => void;
  onBoostLove: () => void;
}

export const UnekUnekView: React.FC<UnekUnekViewProps> = ({
  currentUser,
  onBack,
  onBoostLove,
}) => {
  const [items, setItems] = useState<UnekItem[]>([]);
  const [text, setText] = useState('');
  const [mood, setMood] = useState<string>('Kangen');
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [replyingId, setReplyingId] = useState<string | null>(null);
  const [replyDraft, setReplyDraft] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const loadUnek = async () => {
    const data = await fetchUnekList();
    setItems(data);
  };

  useEffect(() => {
    loadUnek();
    const unsub = subscribeRealtime({
      onUnek: () => loadUnek(),
    });
    return unsub;
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = text.trim();
    if (!cleaned) return;
    soundFX.playHeartBurst();
    const created = await addUnekItem({
      author: currentUser,
      text: cleaned,
      mood,
      is_anonymous: isAnonymous,
    });
    setItems((prev) => [created, ...prev.filter((i) => i.id !== created.id)]);

    setText('');
    onBoostLove();
  };

  const handleConfirmDelete = async (id: string) => {
    soundFX.playClick();
    setConfirmDeleteId(null);
    setItems((prev) => prev.filter((item) => item.id !== id));
    await deleteUnekItem(id);
  };

  const handleOpenReply = (id: string, existingReply?: string) => {
    soundFX.playClick();
    setReplyingId(id);
    setReplyDraft(existingReply || '');
  };

  const handleSendManualReply = async (e: React.FormEvent, id: string) => {
    e.preventDefault();
    const cleaned = replyDraft.trim();
    if (!cleaned) return;
    soundFX.playHeartBurst();
    setReplyingId(null);
    setReplyDraft('');
    setItems((prev) =>
      prev.map((it) => (it.id === id ? { ...it, reply: cleaned } : it))
    );
    const updated = await replyUnekItem(id, cleaned);
    if (updated.length > 0) {
      setItems(updated);
    }
    onBoostLove();
  };

  const handleDeleteReply = async (id: string) => {
    soundFX.playClick();
    setReplyingId(null);
    setReplyDraft('');
    setItems((prev) =>
      prev.map((it) => (it.id === id ? { ...it, reply: undefined } : it))
    );
    const updated = await replyUnekItem(id, null);
    if (updated.length > 0) {
      setItems(updated);
    }
  };

  return (
    <div className="animate-slide-in-right flex flex-col gap-4 pb-3">
      {/* Sticky Header */}
      <div className="sticky top-0 z-20 -mx-4 flex items-center gap-2.5 bg-[#FFF2F7]/95 px-4 py-2 backdrop-blur-sm">
        <button
          type="button"
          onClick={onBack}
          aria-label="Kembali"
          className="btn-bucin flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[#FFD6E7] bg-white text-[#2D0A1E] cursor-pointer"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div>
          <h2 className="font-display text-[20px] font-extrabold leading-tight text-[#2D0A1E]">
            Unek Unek
          </h2>
          <p className="text-[12px] font-semibold text-[#8A6A7A]">
            Curhat &amp; unek-unek ke ayang biar ga dipendem
          </p>
        </div>
      </div>

      {/* Tulis Unek-unek Card */}
      <form
        onSubmit={handleSubmit}
        className="keiz-sticker-card relative bg-white p-4 pt-5"
      >
        <div className="washi-tape left-1/2 -top-2.5 -translate-x-1/2 -rotate-1" />
        <p className="font-display text-[15px] font-extrabold text-[#2D0A1E]">
          Lagi mikirin apa, {currentUser === 'faiz' ? 'faiz' : 'kenat'}?
        </p>
        <p className="mt-0.5 text-[12px] font-medium text-[#8A6A7A]">
          tulis aja apa adanya, yg kesel, yg kangen, atau yg capek
        </p>

        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {MOOD_OPTIONS.map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => {
                soundFX.playClick();
                setMood(m);
              }}
              className={`rounded-full px-3 py-1 text-[11px] font-extrabold border cursor-pointer ${
                mood === m
                  ? 'border-[#FF2E7E] bg-[#FF2E7E] text-white shadow-xs'
                  : 'border-[#FFD6E7] bg-[#FFF8FA] text-[#8A6A7A]'
              }`}
            >
              {m}
            </button>
          ))}
        </div>

        <textarea
          ref={textareaRef}
          rows={3}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="tumpahin di sini aja, ga usah dipendem sendiri..."
          className="mt-3 w-full rounded-2xl border border-[#FFD6E7] bg-[#FFF2F7] p-3 text-xs font-medium text-[#2D0A1E] placeholder-[#9A7A8A] focus:border-[#FF2E7E] focus:outline-none"
        />

        <div className="mt-2 flex items-center justify-between">
          <button
            type="button"
            onClick={() => {
              soundFX.playClick();
              setIsAnonymous((v) => !v);
            }}
            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-extrabold border cursor-pointer ${
              isAnonymous
                ? 'border-[#FF2E7E] bg-[#FFF0F5] text-[#D81B6E]'
                : 'border-[#FFD6E7] bg-white text-[#8A6A7A]'
            }`}
          >
            <EyeOff className="h-3.5 w-3.5" />
            <span>{isAnonymous ? 'Mode Anonim: Aktif' : 'Kirim Anonim?'}</span>
          </button>
        </div>

        <button
          type="submit"
          disabled={!text.trim()}
          className="keiz-btn-primary btn-bucin mt-3 flex w-full items-center justify-center gap-1.5 text-xs disabled:opacity-45 cursor-pointer"
        >
          <Send className="h-3.5 w-3.5" />
          <span>Kirim Unek-unek</span>
        </button>
      </form>

      {/* Wall of Unek-unek or Empty State */}
      {items.length === 0 ? (
        <div className="keiz-card bg-white p-6 text-center">
          <p className="text-xs font-extrabold text-[#5C3A49]">
            Belum ada unek-unek, curhatin yang pertama
          </p>
          <button
            type="button"
            onClick={() => {
              soundFX.playClick();
              textareaRef.current?.focus();
            }}
            className="keiz-btn-primary btn-bucin mt-3 min-h-[42px] px-5 text-xs cursor-pointer"
          >
            Tulis Unek Pertama
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {items.map((item, idx) => {
            const isFaiz = item.author === 'faiz';
            const isConfirming = confirmDeleteId === item.id;
            const canReply = item.author !== currentUser;
            const replierName = isFaiz ? 'kenat' : 'faiz';
            const isEditingReply = replyingId === item.id;

            return (
              <div
                key={item.id}
                className={`keiz-sticker-card animate-bubble-pop relative bg-white p-4 ${
                  idx % 2 === 0 ? '-rotate-[0.6deg]' : 'rotate-[0.6deg]'
                }`}
              >
                <div className="flex items-center justify-between text-[11px]">
                  <div className="flex items-center gap-2">
                    <span
                      className={`font-extrabold ${
                        item.is_anonymous
                          ? 'text-[#D81B6E]'
                          : isFaiz
                          ? 'text-[#3B82F6]'
                          : 'text-[#FF4D8D]'
                      }`}
                    >
                      {item.is_anonymous ? 'Anonim' : isFaiz ? 'faiz' : 'kenat'}
                    </span>
                    {item.mood && (
                      <span className="rounded-full border border-[#FFD6E7] bg-[#FFF2F7] px-2 py-0.5 text-[10px] font-extrabold text-[#D81B6E]">
                        {item.mood}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="font-semibold text-[#8A6A7A]">
                      {item.createdAt}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        soundFX.playClick();
                        setConfirmDeleteId(isConfirming ? null : item.id);
                      }}
                      aria-label="Hapus unek-unek"
                      className="flex h-6 w-6 items-center justify-center rounded-full text-[#9A7A8A] hover:bg-rose-50 hover:text-rose-600 cursor-pointer"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>

                {isConfirming && (
                  <div className="mt-2 flex items-center justify-between gap-2 rounded-2xl border border-rose-200 bg-rose-50 px-3 py-2">
                    <span className="text-[11px] font-extrabold text-rose-700">
                      Yakin mau hapus unek-unek ini?
                    </span>
                    <div className="flex shrink-0 items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => handleConfirmDelete(item.id)}
                        className="rounded-full bg-rose-600 px-3 py-1 text-[10px] font-extrabold text-white cursor-pointer"
                      >
                        Ya
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          soundFX.playClick();
                          setConfirmDeleteId(null);
                        }}
                        className="rounded-full border border-rose-200 bg-white px-3 py-1 text-[10px] font-extrabold text-rose-700 cursor-pointer"
                      >
                        Batal
                      </button>
                    </div>
                  </div>
                )}

                <p className="mt-2 text-[13px] font-semibold leading-relaxed text-[#2D0A1E]">
                  {item.text}
                </p>

                {/* Manual Reply Display */}
                {item.reply && !isEditingReply && (
                  <div className="mt-2.5 rounded-2xl border border-[#FFD6E7] bg-[#FFF2F7] px-3 py-2 text-xs font-semibold text-[#2D0A1E]">
                    <p>
                      <span className="font-extrabold text-[#E91E7A]">Balasan: </span>
                      {item.reply}
                    </p>
                    <p className="mt-0.5 text-[10px] font-extrabold text-[#8A6A7A]">
                      — {replierName}
                    </p>
                  </div>
                )}

                {/* Manual Reply Actions (ONLY partner can reply / edit / delete reply) */}
                {canReply && !isEditingReply && (
                  <div className="mt-2.5 flex flex-wrap items-center gap-2">
                    {!item.reply ? (
                      <button
                        type="button"
                        onClick={() => handleOpenReply(item.id)}
                        className="btn-bucin inline-flex items-center gap-1.5 rounded-full border border-[#FFD6E7] bg-[#FFF2F7] px-3.5 py-1.5 text-[11px] font-extrabold text-[#E91E7A] cursor-pointer"
                      >
                        <MessageSquare className="h-3.5 w-3.5" />
                        <span>Balas</span>
                      </button>
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={() => handleOpenReply(item.id, item.reply)}
                          className="btn-bucin inline-flex items-center gap-1 rounded-full border border-[#FFD6E7] bg-white px-3 py-1 text-[11px] font-extrabold text-[#5C3A49] cursor-pointer"
                        >
                          <Pencil className="h-3 w-3" />
                          <span>Edit Balasan</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteReply(item.id)}
                          className="btn-bucin inline-flex items-center gap-1 rounded-full border border-rose-200 bg-rose-50 px-3 py-1 text-[11px] font-extrabold text-rose-600 cursor-pointer"
                        >
                          <Trash2 className="h-3 w-3" />
                          <span>Hapus Balasan</span>
                        </button>
                      </>
                    )}
                  </div>
                )}

                {/* Inline Manual Reply Form */}
                {canReply && isEditingReply && (
                  <form
                    onSubmit={(e) => handleSendManualReply(e, item.id)}
                    className="mt-2.5 space-y-2 rounded-2xl border border-[#FFD6E7] bg-[#FFF8FA] p-2.5"
                  >
                    <input
                      type="text"
                      autoFocus
                      value={replyDraft}
                      onChange={(e) => setReplyDraft(e.target.value)}
                      placeholder="Ketik balasan kamu di sini..."
                      className="min-h-[38px] w-full rounded-xl border border-[#FFD6E7] bg-white px-3 text-xs font-semibold text-[#2D0A1E] placeholder-[#9A7A8A] focus:border-[#FF2E7E] focus:outline-none"
                    />
                    <div className="flex items-center justify-end gap-1.5">
                      <button
                        type="button"
                        onClick={() => {
                          soundFX.playClick();
                          setReplyingId(null);
                          setReplyDraft('');
                        }}
                        className="rounded-full border border-[#FFD6E7] bg-white px-3 py-1.5 text-[11px] font-extrabold text-[#8A6A7A] cursor-pointer"
                      >
                        Batal
                      </button>
                      <button
                        type="submit"
                        disabled={!replyDraft.trim()}
                        className="rounded-full bg-gradient-to-r from-[#FF2E7E] to-[#FF7AB8] px-3.5 py-1.5 text-[11px] font-extrabold text-white shadow-sm disabled:opacity-45 cursor-pointer"
                      >
                        Kirim Balasan
                      </button>
                    </div>
                  </form>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
