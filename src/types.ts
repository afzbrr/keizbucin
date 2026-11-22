export type Role = 'faiz' | 'kenat';

export type AppSection =
  | 'home'
  | 'profil'
  | 'chat'
  | 'lagu'
  | 'nobar'
  | 'unek'
  | 'galeri';

export interface YTPlayerInstance {
  loadVideoById: (videoId: string, startSeconds?: number) => void;
  cueVideoById: (videoId: string, startSeconds?: number) => void;
  playVideo: () => void;
  pauseVideo: () => void;
  unMute: () => void;
  mute?: () => void;
  isMuted: () => boolean;
  setVolume: (vol: number) => void;
  getVolume?: () => number;
  seekTo: (seconds: number, allowSeekAhead: boolean) => void;
  setPlaybackRate?: (suggestedRate: number) => void;
  getPlaybackRate?: () => number;
  getCurrentTime: () => number;
  getDuration: () => number;
  getPlayerState?: () => number;
  destroy: () => void;
}

declare global {
  interface Window {
    YT?: {
      Player: new (
        el: HTMLElement | string,
        opts: {
          height?: string | number;
          width?: string | number;
          videoId?: string;
          playerVars?: Record<string, string | number>;
          events?: {
            onReady?: (e: { target: YTPlayerInstance }) => void;
            onStateChange?: (e: { data: number; target: YTPlayerInstance }) => void;
            onError?: () => void;
          };
        }
      ) => YTPlayerInstance;
    };
    onYouTubeIframeAPIReady?: () => void;
  }
}

export interface CoupleProfile {
  faizName: string;
  kenatName: string;
  faizPhoto: string;
  kenatPhoto: string;
  bannerPhoto: string;
  faizBio: string;
  kenatBio: string;
  anniversaryDate: string;
  faizSong: string;
  kenatSong: string;
}

export type ChatMessageType =
  | 'text'
  | 'image'
  | 'voice'
  | 'sticker'
  | 'nobar_link'
  | 'music_link';

export interface ChatMessage {
  id: string;
  sender: Role;
  receiver: Role;
  message: string;
  type: ChatMessageType;
  image_url?: string;
  voice_url?: string;
  is_read: boolean;
  created_at: string;
  reply_to?: string;
  reply_to_text?: string;
  reply_to_sender?: Role;
  is_deleted?: boolean;
  react?: string;
  voice_duration?: string;
}

export interface SongItem {
  id: string;
  title: string;
  artist: string;
  artwork: string;
  youtube_query: string;
  youtube_video_id?: string;
  duration_ms: number;
  added_by?: Role;
  favorite?: boolean;
}

export type NobarAction = 'play' | 'pause' | 'seek' | 'change_video' | 'rate';

export interface NobarSyncState {
  id: number;
  youtube_url: string;
  videoId: string;
  title: string;
  is_playing: boolean;
  current_time: number;
  playback_rate: number;
  updated_by: Role;
  updated_at: string;
  action: NobarAction;
}

export type MusicAction =
  | 'play'
  | 'pause'
  | 'seek'
  | 'change_song'
  | 'next'
  | 'prev';

export interface MusicSyncState {
  id: number;
  youtube_url: string;
  videoId: string;
  title: string;
  artist: string;
  thumbnail: string;
  duration_ms?: number;
  is_playing: boolean;
  current_time: number;
  updated_by: Role;
  updated_at: string;
  action: MusicAction;
}

export type PresenceActivity =
  | 'di Home'
  | 'di Chat'
  | 'di Nobar'
  | 'di Musik'
  | 'di Call'
  | 'di Profil'
  | 'di Album'
  | 'di Unek Unek';

export interface PresenceState {
  user: Role;
  status: 'online' | 'offline';
  lagi_ngapain: PresenceActivity;
  lagi_play_apa: string;
  last_seen: string;
}

export type VoiceEffectMode = 'normal' | 'chipmunk' | 'deep' | 'robot' | 'anime';

export type CallStatus = 'ringing' | 'connected' | 'ended';

export interface CallState {
  id: string;
  caller: Role;
  callee: Role;
  status: CallStatus;
  offer?: string;
  answer?: string;
  voice_effect?: VoiceEffectMode;
  created_at: string;
}

export interface GalleryPhoto {
  id: string;
  author?: Role;
  url: string;
  caption: string;
  dateLabel: string;
  tag: 'faiz' | 'kenat' | 'berdua';
  created_at?: string;
}

export interface UnekItem {
  id: string;
  author: Role;
  mood?: string;
  text: string;
  reply?: string;
  is_anonymous?: boolean;
  createdAt: string;
}

export interface BurstParticle {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  color: string;
  emoji: string;
  size: number;
  rotation: number;
}
