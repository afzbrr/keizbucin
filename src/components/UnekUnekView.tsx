import React, { useEffect, useRef, useState } from 'react';
import { ArrowLeft, EyeOff, Send } from 'lucide-react';
import {
  addUnekItem,
  fetchUnekList,
  replyUnekItem,
  sendChatMessage,
  subscribeRealtime,
} from '../supabaseClient';
import { soundFX } from '../sound';
import type { Role, UnekItem } from '../types';

const MOODS = [
  'Kangen 😭',
  'Kesel 😤',
  'Sayang 💖',
  'Capek 🥺',
];

interface UnekUnekViewProps {
  currentUser: Role;
  onBack: () => void;
  onTriggerPeluk: () => void;
  onTriggerKangen: () => void;
  onBoostLove: () => void;
}

export const UnekUnekView: React.FC<UnekUnekViewProps> = ({
  currentUser,
  onBack,
  onTriggerPeluk,
  onTriggerKangen,
  onBoostLove,
}) => {
  const [items, setItems] = useState<UnekItem[]>([]);
  const [mood, setMood] = useState(MOODS[0]);
  const [text, setText] = useState('');
  const [isAnonymous, setIsAnonymous] = useState(false);
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
      mood,
      text: cleaned,
      is_anonymous: isAnonymous,
    });
    setItems((prev) => [created, ...prev.filter((i) => i.id !== created.id)]);

    await sendChatMessage(
      currentUser,
      `[Unek-Unek · ${mood}] ${cleaned}`
    );

    setText('');
    onBoostLove();
  };

  const handleQuickReply = async (id: string) => {
    soundFX.playHeartBurst();
    const replyText =
      currentUser === 'faiz'
        ? 'sini peluk dulu sayang, maaf ya 💙🫂'
        : 'iyaaa faiz ganteng, sini peluk balik 💖🫶';
    const updated = await replyUnekItem(id, replyText);
    setItems(updated);
    onBoostLove();
  };

  return (
    <div className="animate-slide-in-right flex flex-col gap-4 pb-8">
      {/* Header */}
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
          <h2 className="font-display text-[20px] font-extrabold leading-tight text-[#2D0A1E]">
            Unek Unek
          </h2>
          <p className="text-[12px] font-semibold text-[#8A6A7A]">
            Curhat &amp; unek-unek ke ayang biar ga dipendem
          </p>
        </div>
      </div>

      {/* Peluk & Kangen Shortcuts */}
      <div className="grid grid-cols-2 gap-3">
        <button
          type="button"
          onClick={onTriggerPeluk}
          className="btn-bucin flex min-h-[52px] items-center justify-center gap-2 rounded-full bg-[#3B82F6] px-4 text-xs font-extrabold text-white shadow-[0_4px_16px_rgba(59,130,246,0.28)] cursor-pointer"
        >
          <span className="text-lg">🧸</span>
          <span>KIRIM PELUK</span>
        </button>
        <button
          type="button"
          onClick={onTriggerKangen}
          className="btn-bucin flex min-h-[52px] items-center justify-center gap-2 rounded-full bg-gradient-to-r from-[#FF2E7E] to-[#FF7AB8] px-4 text-xs font-extrabold text-white shadow-[0_4px_16px_rgba(255,46,126,0.28)] cursor-pointer"
        >
          <span className="text-lg">😭</span>
          <span>KANGEN</span>
        </button>
      </div>

      {/* Tulis Unek-unek Card */}
      <form
        onSubmit={handleSubmit}
        className="keiz-sticker-card relative bg-white p-4 pt-5"
      >
        <div className="washi-tape left-1/2 -top-2.5 -translate-x-1/2 -rotate-1" />
        <p className="font-display text-[15px] font-extrabold text-[#2D0A1E]">
          Lagi mikirin apa, {currentUser === 'faiz' ? 'Faiz' : 'Kenat'}?
        </p>
        <p className="mt-0.5 text-[12px] font-medium text-[#8A6A7A]">
          tulis aja apa adanya, yg kesel, yg kangen, atau yg capek
        </p>

        <div className="mt-3 flex gap-1.5 overflow-x-auto pb-1">
          {MOODS.map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => {
                soundFX.playClick();
                setMood(m);
              }}
              className={`btn-bucin shrink-0 rounded-full px-3 py-1.5 text-[11px] font-extrabold cursor-pointer ${
                mood === m
                  ? 'bg-[#FF2E7E] text-white shadow-sm'
                  : 'border border-[#FFD6E7] bg-[#FFF2F7] text-[#8A6A7A]'
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
          placeholder="tumpahin di sini aja bee, ga usah dipendem sendiri..."
          className="mt-2.5 w-full rounded-2xl border border-[#FFD6E7] bg-[#FFF2F7] p-3 text-xs font-medium text-[#2D0A1E] placeholder-[#9A7A8A] focus:border-[#FF2E7E] focus:outline-none"
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
            return (
              <div
                key={item.id}
                className={`keiz-sticker-card animate-bubble-pop relative bg-white p-4 ${
                  idx % 2 === 0 ? '-rotate-[0.6deg]' : 'rotate-[0.6deg]'
                }`}
              >
                <div className="flex items-center justify-between text-[11px]">
                  <span
                    className={`font-extrabold ${
                      item.is_anonymous
                        ? 'text-[#D81B6E]'
                        : isFaiz
                        ? 'text-[#3B82F6]'
                        : 'text-[#FF4D8D]'
                    }`}
                  >
                    {item.is_anonymous
                      ? 'Anonim 🤫'
                      : isFaiz
                      ? 'Faiz 💙'
                      : 'Kenat 💖'}{' '}
                    · {item.mood}
                  </span>
                  <span className="font-semibold text-[#8A6A7A]">{item.createdAt}</span>
                </div>

                <p className="mt-2 text-[13px] font-semibold leading-relaxed text-[#2D0A1E]">
                  {item.text}
                </p>

                {item.reply ? (
                  <div className="mt-2.5 rounded-2xl border border-[#FFD6E7] bg-[#FFF2F7] px-3 py-2 text-xs font-semibold text-[#2D0A1E]">
                    <span className="font-extrabold text-[#E91E7A]">Balasan: </span>
                    {item.reply}
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => handleQuickReply(item.id)}
                    className="btn-bucin mt-2.5 rounded-full border border-[#FFD6E7] bg-[#FFF2F7] px-3.5 py-1.5 text-[11px] font-extrabold text-[#E91E7A] cursor-pointer"
                  >
                    Peluk &amp; bales cepet 🫂
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
