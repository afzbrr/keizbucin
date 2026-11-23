import React, { useEffect, useState } from 'react';
import {
  Check,
  ChevronDown,
  ChevronUp,
  Copy,
  Database,
  Link2,
  RefreshCw,
  RotateCcw,
} from 'lucide-react';
import {
  SUPABASE_SQL_SETUP,
  checkSupabaseConnection,
  clearSupabaseConfig,
  ensureInitialSyncRows,
  getConnectionStatus,
  getMaskedSupabaseUrl,
  getSupabaseConfig,
  saveSupabaseConfig,
  subscribeConnectionStatus,
} from '../supabaseClient';
import { soundFX } from '../sound';

const VERCEL_APP_URL = 'https://keiz-bucin.vercel.app';

interface SupabaseConfigCardProps {
  compact?: boolean;
  onConnected?: () => void;
}

export const SupabaseConfigCard: React.FC<SupabaseConfigCardProps> = ({
  compact = false,
  onConnected,
}) => {
  const initial = getSupabaseConfig();
  const initialConn = getConnectionStatus();
  const [urlInput, setUrlInput] = useState(initial.url);
  const [anonInput, setAnonInput] = useState(initial.anonKey);
  const [testing, setTesting] = useState(initialConn.status === 'checking');
  const [statusMsg, setStatusMsg] = useState<string | null>(initialConn.message);
  const [statusOk, setStatusOk] = useState<boolean>(initialConn.ok);
  const [showSql, setShowSql] = useState(false);
  const [copiedSql, setCopiedSql] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [showManualFields, setShowManualFields] = useState(!initial.fromEnv || initial.isManual);

  useEffect(() => {
    const unsub = subscribeConnectionStatus((state) => {
      setStatusOk(state.ok);
      setStatusMsg(state.message);
      setTesting(state.status === 'checking');
    });
    void checkSupabaseConnection();
    return unsub;
  }, []);

  const shareUrl =
    typeof window !== 'undefined' &&
    window.location.hostname.includes('vercel.app')
      ? window.location.origin
      : VERCEL_APP_URL;

  const handleCheckConnection = async () => {
    soundFX.playClick();
    setTesting(true);
    setStatusMsg('Lagi ngecek koneksi ke Supabase...');
    const res = await checkSupabaseConnection();
    if (res.ok && !res.missingTables) {
      await ensureInitialSyncRows();
    }
    setTesting(false);
    setStatusOk(res.ok);
    setStatusMsg(res.message);
    if (res.ok) {
      soundFX.playHeartBurst();
      onConnected?.();
    }
  };

  const handleSaveAndTest = async (e: React.FormEvent) => {
    e.preventDefault();
    soundFX.playClick();
    setTesting(true);
    setStatusMsg('Lagi ngetes koneksi ke Supabase...');

    saveSupabaseConfig(urlInput, anonInput);
    const res = await checkSupabaseConnection();
    if (res.ok && !res.missingTables) {
      await ensureInitialSyncRows();
    }
    setTesting(false);
    setStatusOk(res.ok);
    setStatusMsg(res.message);

    if (res.ok) {
      soundFX.playHeartBurst();
      onConnected?.();
    }
  };

  const handleCopySql = () => {
    soundFX.playPop();
    navigator.clipboard?.writeText(SUPABASE_SQL_SETUP).catch(() => {});
    setCopiedSql(true);
    setTimeout(() => setCopiedSql(false), 2000);
  };

  const handleCopyVercelUrl = () => {
    soundFX.playPop();
    navigator.clipboard?.writeText(shareUrl).catch(() => {});
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  const handleReset = async () => {
    soundFX.playClick();
    clearSupabaseConfig();
    const next = getSupabaseConfig();
    setUrlInput(next.url);
    setAnonInput(next.anonKey);
    const res = await checkSupabaseConnection();
    setStatusOk(res.ok);
    setStatusMsg(res.message);
  };

  return (
    <div
      className={`keiz-card bg-white ${
        compact ? 'p-3.5' : 'p-4'
      } border border-[#FFD6E7]`}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-[#ECFDF5] text-emerald-600">
            <Database className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-extrabold text-[#2D0A1E]">
              Koneksi Supabase &amp; Link Web
            </p>
            <p className="truncate text-[10px] font-semibold text-[#8A6A7A]">
              URL: {getMaskedSupabaseUrl()}
            </p>
          </div>
        </div>
        <span
          className={`shrink-0 rounded-full px-2.5 py-0.5 text-[10px] font-extrabold ${
            statusOk
              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
              : testing
              ? 'bg-amber-50 text-amber-700 border border-amber-200'
              : 'bg-rose-50 text-rose-600 border border-rose-200'
          }`}
        >
          {statusOk ? 'Terhubung' : testing ? 'Ngecek...' : 'Gagal'}
        </span>
      </div>

      {/* Primary Action Row: Cek Koneksi Supabase + Copy Link Web Vercel */}
      <div className="mt-3 grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={handleCheckConnection}
          disabled={testing}
          className="btn-bucin flex min-h-[38px] items-center justify-center gap-1.5 rounded-full bg-gradient-to-r from-[#FF2E7E] to-[#FF7AB8] px-3 text-[11px] font-extrabold text-white shadow-sm cursor-pointer disabled:opacity-60"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${testing ? 'animate-spin' : ''}`} />
          <span>{testing ? 'Ngecek...' : 'Cek Koneksi Supabase'}</span>
        </button>

        <button
          type="button"
          onClick={handleCopyVercelUrl}
          className="btn-bucin flex min-h-[38px] items-center justify-center gap-1.5 rounded-full border border-[#FFD6E7] bg-[#FFF2F7] px-3 text-[11px] font-extrabold text-[#D81B6E] cursor-pointer"
        >
          {copiedLink ? (
            <>
              <Check className="h-3.5 w-3.5" />
              <span>Link Disalin!</span>
            </>
          ) : (
            <>
              <Link2 className="h-3.5 w-3.5" />
              <span>Copy Link Web Vercel</span>
            </>
          )}
        </button>
      </div>

      {statusMsg && (
        <p
          className={`mt-2 rounded-xl px-3 py-1.5 text-[11px] font-bold ${
            statusOk
              ? 'bg-emerald-50 text-emerald-700'
              : 'bg-rose-50 text-rose-600'
          }`}
        >
          {statusMsg}
        </p>
      )}

      {/* Toggle manual env override (for local preview testing) */}
      <div className="mt-2.5 border-t border-[#FFD6E7]/70 pt-2">
        <button
          type="button"
          onClick={() => setShowManualFields((v) => !v)}
          className="flex w-full items-center justify-between text-[11px] font-extrabold text-[#8A6A7A] cursor-pointer"
        >
          <span>Isi Manual Env (kalau belum di Vercel Env)</span>
          {showManualFields ? (
            <ChevronUp className="h-3.5 w-3.5" />
          ) : (
            <ChevronDown className="h-3.5 w-3.5" />
          )}
        </button>

        {showManualFields && (
          <form onSubmit={handleSaveAndTest} className="mt-2 space-y-2">
            <div>
              <label className="mb-1 block text-[10px] font-extrabold text-[#8A6A7A]">
                VITE_SUPABASE_URL
              </label>
              <input
                type="url"
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
                placeholder="https://xxxx.supabase.co"
                className="min-h-[38px] w-full rounded-xl border border-[#FFD6E7] bg-[#FFF8FA] px-3 text-xs font-semibold text-[#2D0A1E] placeholder-[#B699A7] focus:border-[#FF2E7E] focus:outline-none"
              />
            </div>

            <div>
              <label className="mb-1 block text-[10px] font-extrabold text-[#8A6A7A]">
                VITE_SUPABASE_ANON_KEY
              </label>
              <input
                type="text"
                value={anonInput}
                onChange={(e) => setAnonInput(e.target.value)}
                placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
                className="min-h-[38px] w-full rounded-xl border border-[#FFD6E7] bg-[#FFF8FA] px-3 text-xs font-semibold text-[#2D0A1E] placeholder-[#B699A7] focus:border-[#FF2E7E] focus:outline-none"
              />
            </div>

            <div className="flex items-center gap-2 pt-0.5">
              <button
                type="submit"
                disabled={testing}
                className="btn-bucin flex min-h-[36px] flex-1 items-center justify-center gap-1.5 rounded-full bg-[#3B82F6] px-3 text-xs font-extrabold text-white shadow-sm cursor-pointer disabled:opacity-60"
              >
                <span>Simpan &amp; Test Koneksi</span>
              </button>
              <button
                type="button"
                onClick={handleReset}
                title="Reset"
                className="btn-bucin flex h-[36px] w-[36px] shrink-0 items-center justify-center rounded-full border border-[#FFD6E7] bg-[#FFF2F7] text-[#8A6A7A] cursor-pointer"
              >
                <RotateCcw className="h-3.5 w-3.5" />
              </button>
            </div>
          </form>
        )}
      </div>

      {/* Collapsible SQL Script */}
      <div className="mt-2 border-t border-[#FFD6E7]/70 pt-2">
        <button
          type="button"
          onClick={() => setShowSql((v) => !v)}
          className="flex w-full items-center justify-between text-[11px] font-extrabold text-[#D81B6E] cursor-pointer"
        >
          <span>SQL Tabel (supabase-setup.sql)</span>
          {showSql ? (
            <ChevronUp className="h-3.5 w-3.5" />
          ) : (
            <ChevronDown className="h-3.5 w-3.5" />
          )}
        </button>

        {showSql && (
          <div className="mt-2 space-y-2">
            <div className="flex justify-end">
              <button
                type="button"
                onClick={handleCopySql}
                className="btn-bucin inline-flex items-center gap-1 rounded-full bg-[#FFF2F7] px-3 py-1 text-[10px] font-extrabold text-[#D81B6E] border border-[#FFD6E7] cursor-pointer"
              >
                {copiedSql ? (
                  <>
                    <Check className="h-3 w-3" /> Disalin
                  </>
                ) : (
                  <>
                    <Copy className="h-3 w-3" /> Salin SQL
                  </>
                )}
              </button>
            </div>
            <pre className="max-h-40 overflow-auto rounded-xl bg-[#1B0611] p-2.5 text-[10px] leading-relaxed text-pink-100">
              {SUPABASE_SQL_SETUP}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
};
