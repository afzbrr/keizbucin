import React, { useState } from 'react';
import { Check, Eye, EyeOff, MessageCircleHeart, X } from 'lucide-react';
import { sendChatMessage, verifyUserLogin } from '../supabaseClient';
import { soundFX } from '../sound';
import type { CoupleProfile, Role } from '../types';

interface LoginViewProps {
  profile: CoupleProfile;
  onSuccess: (role: Role, x: number, y: number) => void;
}

export const LoginView: React.FC<LoginViewProps> = ({ profile, onSuccess }) => {
  const [selected, setSelected] = useState<Role>('faiz');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [wrongCount, setWrongCount] = useState(0);
  const [shaking, setShaking] = useState(false);
  const [errorToast, setErrorToast] = useState(false);
  const [entering, setEntering] = useState(false);
  const [showAskModal, setShowAskModal] = useState(false);
  const [askText, setAskText] = useState('');
  const [askSent, setAskSent] = useState(false);

  const partnerName = selected === 'faiz' ? profile.kenatName : profile.faizName;

  const handleSelectRole = (role: Role) => {
    soundFX.playPop();
    setSelected(role);
    setPassword('');
    setErrorToast(false);
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (entering) return;

    const formEl = e.currentTarget;
    const valid = await verifyUserLogin(selected, password);
    if (valid) {
      soundFX.playHeartBurst();
      setEntering(true);
      setErrorToast(false);
      const rect = formEl.getBoundingClientRect();
      onSuccess(selected, rect.left + rect.width / 2, rect.top + rect.height / 2);
      return;
    }

    soundFX.playClick();
    const nextWrong = wrongCount + 1;
    setWrongCount(nextWrong);
    setShaking(true);
    setErrorToast(true);
    setTimeout(() => setShaking(false), 260);
    setTimeout(() => setErrorToast(false), 2400);

    if (nextWrong >= 3) {
      const who = selected === 'faiz' ? profile.faizName : profile.kenatName;
      await sendChatMessage(
        selected,
        `upss ${who} salah masukin sandi ${nextWrong}x nih di halaman login, bantuin inget dong ayang`
      );
    }
  };

  const handleSendHelpToChat = async (e: React.FormEvent) => {
    e.preventDefault();
    soundFX.playPop();
    const msg =
      askText.trim() ||
      `ayanggg aku lupa sandi KEIZ BUCIN aku nih, kasih tau dong hehe`;
    await sendChatMessage(selected, msg);
    setAskSent(true);
    setTimeout(() => {
      setShowAskModal(false);
      setAskSent(false);
      setAskText('');
    }, 1500);
  };

  return (
    <div className="relative z-10 flex w-full flex-1 flex-col justify-start overflow-y-auto px-4 pt-6 pb-6">
      {/* Error Toast */}
      {errorToast && (
        <div className="animate-bubble-pop fixed top-6 z-40 rounded-full border border-rose-200 bg-white px-4 py-2 text-xs font-extrabold text-rose-600 shadow-lg">
          Sandi salah, ayang! Coba lagi
        </div>
      )}

      <div className="keiz-sticker-card animate-bubble-pop relative w-full bg-white/95 px-5 pb-6 pt-7 backdrop-blur-sm">
        <div className="washi-tape absolute -top-2.5 left-1/2 h-5 w-24 -translate-x-1/2 -rotate-2 rounded-sm" />

        {/* Logo KEIZ BUCIN + 3D Satin Ribbon Hearts */}
        <div className="flex flex-col items-center">
          <div className="animate-float-slow relative flex h-20 w-24 items-center justify-center">
            <svg viewBox="0 0 120 96" className="h-20 w-24 drop-shadow-md">
              <defs>
                <linearGradient id="loginHeartL" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0%" stopColor="#93C5FD" />
                  <stop offset="100%" stopColor="#3B82F6" />
                </linearGradient>
                <linearGradient id="loginHeartR" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0%" stopColor="#FF9EC7" />
                  <stop offset="100%" stopColor="#FF2E7E" />
                </linearGradient>
              </defs>
              <path
                d="M44 72 C44 72 16 53 16 34 C16 23 24 16 33 16 C39 16 42.5 19.5 44 23 C45.5 19.5 49 16 55 16 C64 16 72 23 72 34 C72 53 44 72 44 72 Z"
                fill="url(#loginHeartL)"
                stroke="#FFFFFF"
                strokeWidth="3"
              />
              <path
                d="M76 80 C76 80 42 58 42 36 C42 23 51 15 62 15 C69 15 74 19 76 23 C78 19 83 15 90 15 C101 15 110 23 110 36 C110 58 76 80 76 80 Z"
                fill="url(#loginHeartR)"
                stroke="#FFFFFF"
                strokeWidth="3"
              />
              {/* Satin ribbon wrap */}
              <path
                d="M25 46 Q 60 60 99 42"
                fill="none"
                stroke="#FDE68A"
                strokeWidth="5"
                strokeLinecap="round"
              />
              <ellipse cx="64" cy="27" rx="6" ry="3" transform="rotate(-20 64 27)" fill="rgba(255,255,255,0.8)" />
            </svg>
          </div>

          <p className="font-display text-[22px] font-extrabold tracking-wide text-[#E91E7A]">
            KEIZ BUCIN
          </p>
          <h1 className="font-display mt-1 text-[24px] font-extrabold text-[#2D0A1E]">
            Hai, siapa nih?
          </h1>
        </div>

        {/* 2 Role Cards */}
        <div className="mt-4 grid grid-cols-2 gap-3">
          {/* Card Faiz */}
          <button
            type="button"
            onClick={() => handleSelectRole('faiz')}
            className={`btn-bucin relative flex flex-col items-center rounded-[20px] border-[2.5px] p-3.5 text-center transition-all cursor-pointer ${
              selected === 'faiz'
                ? 'scale-[1.03] border-[#3B82F6] bg-[#EFF6FF] shadow-[0_6px_18px_rgba(59,130,246,0.22)]'
                : 'border-[#FFD6E7] bg-[#FFF8FB] opacity-80'
            }`}
          >
            {selected === 'faiz' && (
              <span className="animate-bubble-pop absolute right-2.5 top-2.5 flex h-5 w-5 items-center justify-center rounded-full bg-[#3B82F6] text-white shadow">
                <Check className="h-3.5 w-3.5 stroke-[3]" />
              </span>
            )}
            <img
              src={profile.faizPhoto}
              alt={profile.faizName}
              className="h-16 w-16 rounded-full border-[3px] border-[#3B82F6] object-cover shadow-md"
            />
            <p className="font-display mt-2 text-[16px] font-extrabold text-[#2D0A1E]">
              {profile.faizName}
            </p>
            <p className="text-[11px] font-bold text-[#3B82F6]">yang ganteng</p>
          </button>

          {/* Card Kenat */}
          <button
            type="button"
            onClick={() => handleSelectRole('kenat')}
            className={`btn-bucin relative flex flex-col items-center rounded-[20px] border-[2.5px] p-3.5 text-center transition-all cursor-pointer ${
              selected === 'kenat'
                ? 'scale-[1.03] border-[#FF4D8D] bg-[#FFF0F5] shadow-[0_6px_18px_rgba(255,77,141,0.22)]'
                : 'border-[#FFD6E7] bg-[#FFF8FB] opacity-80'
            }`}
          >
            {selected === 'kenat' && (
              <span className="animate-bubble-pop absolute right-2.5 top-2.5 flex h-5 w-5 items-center justify-center rounded-full bg-[#FF4D8D] text-white shadow">
                <Check className="h-3.5 w-3.5 stroke-[3]" />
              </span>
            )}
            <img
              src={profile.kenatPhoto}
              alt={profile.kenatName}
              className="h-16 w-16 rounded-full border-[3px] border-[#FF4D8D] object-cover shadow-md"
            />
            <p className="font-display mt-2 text-[16px] font-extrabold text-[#2D0A1E]">
              {profile.kenatName}
            </p>
            <p className="text-[11px] font-bold text-[#FF4D8D]">yang gemes</p>
          </button>
        </div>

        {/* Password Form */}
        <form onSubmit={handleSubmit} className="mt-4">
          <label className="text-[12px] font-extrabold text-[#4A0E32]">
            {selected === 'faiz'
              ? `Sandi buat ${profile.faizName}`
              : `Sandi buat ${profile.kenatName}`}
          </label>
          <div
            className={`mt-1.5 flex items-center rounded-2xl border-2 bg-[#FFF8FB] pr-2 transition-colors ${
              shaking
                ? 'animate-bubble-shake border-rose-500 bg-rose-50'
                : selected === 'faiz'
                ? 'border-[#BFDBFE] focus-within:border-[#3B82F6]'
                : 'border-[#FFD6E7] focus-within:border-[#FF4D8D]'
            }`}
          >
            <input
              type={showPass ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={
                selected === 'faiz'
                  ? 'masukin sandi kamu, yang ganteng...'
                  : 'masukin sandi kamu, yang gemes...'
              }
              autoComplete="current-password"
              className="min-h-[48px] w-full bg-transparent px-3.5 text-xs font-bold text-[#2D0A1E] placeholder-[#9A7A8A] focus:outline-none"
            />
            <button
              type="button"
              onClick={() => setShowPass((v) => !v)}
              aria-label={showPass ? 'Sembunyikan sandi' : 'Lihat sandi'}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-[#8A6A7A] hover:bg-white cursor-pointer"
            >
              {showPass ? (
                <EyeOff className="h-4 w-4" />
              ) : (
                <Eye className="h-4 w-4" />
              )}
            </button>
          </div>

          <button
            type="submit"
            disabled={!password}
            className="keiz-btn-primary btn-bucin mt-4 w-full text-sm disabled:opacity-50 cursor-pointer"
          >
            {entering ? 'Yeay masuk...' : 'Masuk'}
          </button>

          <p className="mt-2.5 text-center text-[11px] font-bold text-[#9A7A8A]">
            sandi salah 3x, {partnerName} bakal tau
          </p>

          {wrongCount >= 3 && (
            <div className="animate-bubble-pop mt-3 rounded-2xl border border-rose-200 bg-[#FFF0F5] p-3 text-center">
              <p className="text-xs font-extrabold text-[#D81B6E]">
                Lupa sandi? Chat ayang aja
              </p>
              <button
                type="button"
                onClick={() => {
                  soundFX.playPop();
                  setShowAskModal(true);
                }}
                className="btn-bucin mt-2 inline-flex items-center gap-1.5 rounded-full bg-white px-4 py-1.5 text-xs font-extrabold text-[#E91E7A] shadow-sm cursor-pointer"
              >
                <MessageCircleHeart className="h-3.5 w-3.5" />
                <span>Chat Ayang</span>
              </button>
            </div>
          )}
        </form>
      </div>

      {/* Footer */}
      <p className="mt-5 text-[11px] font-bold text-[#9A7A8A]">
        KEIZ BUCIN - 28 Agustus 2026
      </p>

      {/* Mini Modal "Chat Ayang" */}
      {showAskModal && (
        <div
          onClick={() => setShowAskModal(false)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#2D0A1E]/45 p-4 backdrop-blur-sm"
        >
          <form
            onClick={(e) => e.stopPropagation()}
            onSubmit={handleSendHelpToChat}
            className="keiz-sticker-card animate-bubble-pop w-full max-w-[360px] bg-white p-5"
          >
            <div className="flex items-center justify-between">
              <h3 className="font-display text-base font-extrabold text-[#2D0A1E]">
                Chat {partnerName}
              </h3>
              <button
                type="button"
                onClick={() => setShowAskModal(false)}
                className="flex h-8 w-8 items-center justify-center rounded-full bg-[#FFF2F7] text-[#8A6A7A] cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <p className="mt-1 text-xs text-[#8A6A7A]">
              Kirim pesan ke ruang chat kalian biar {partnerName} ngasih tau sandinya.
            </p>
            <textarea
              rows={3}
              value={askText}
              onChange={(e) => setAskText(e.target.value)}
              placeholder={`ayanggg aku lupa sandi KEIZ BUCIN aku nih...`}
              className="mt-3 w-full rounded-2xl border border-[#FFD6E7] bg-[#FFF2F7] p-3 text-xs font-semibold text-[#2D0A1E] focus:outline-none"
            />
            <button
              type="submit"
              className="keiz-btn-primary btn-bucin mt-3 w-full text-xs cursor-pointer"
            >
              {askSent ? 'Terkirim ke Chat!' : `Kirim ke ${partnerName}`}
            </button>
          </form>
        </div>
      )}
    </div>
  );
};
