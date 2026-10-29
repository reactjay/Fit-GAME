// Row types mirroring db/migrations/002_schema.sql.

export type AvatarLook = {
  skin: number;
  hair: number;
  hairColor: number;
  outfit: number;
  accessory: number;
};

export type Profile = {
  id: string;
  display_name: string;
  avatar: AvatarLook;
};

export type SleepSession = {
  id: string;
  world_id: string;
  user_id: string;
  kind: "sleep" | "nap" | "cuddle";
  energy_gained: number;
  love_points_gained: number;
  created_at: string;
};

export type Preferences = {
  user_id: string;
  sound_enabled: boolean;
  notify_messages: boolean;
  notify_calls: boolean;
  theme: "midnight" | "rose" | "dawn";
  reduced_motion: boolean;
};

export type World = {
  id: string;
  name: string;
  relationship_start: string | null;
  created_by: string;
  points: number;
  created_at: string;
};

export type MessageKind = "text" | "image" | "video" | "voice" | "gift" | "call";

export type MediaMeta = {
  width?: number;
  height?: number;
  duration_ms?: number;
  mime?: string;
  size?: number;
};

export type Message = {
  id: string;
  world_id: string;
  sender_id: string;
  client_id: string;
  kind: MessageKind;
  body: string | null;
  reply_to: string | null;
  media_path: string | null;
  media_meta: MediaMeta;
  reactions: Record<string, string[]>;
  starred_by: string[];
  created_at: string;
  deleted_at: string | null;
};

export type CallRow = {
  id: string;
  world_id: string;
  caller_id: string;
  callee_id: string;
  kind: "audio" | "video";
  status: "ringing" | "active" | "ended" | "missed" | "declined" | "failed";
  created_at: string;
  answered_at: string | null;
  ended_at: string | null;
};

export type StorySession = {
  id: string;
  world_id: string;
  story_id: string;
  node_id: string;
  history: { node: string; choice: number; by: string }[];
  votes: Record<string, number>;
  mode: "together" | "solo";
  endings_seen: string[];
  updated_at: string;
};

export type MemoryKind = "photo" | "letter" | "voice" | "milestone" | "open_when" | "capsule";

export type Memory = {
  id: string;
  world_id: string;
  author_id: string;
  kind: MemoryKind;
  title: string;
  body: string | null;
  media_path: string | null;
  occurred_on: string | null;
  unlock_at: string | null;
  mood: string | null;
  created_at: string;
  updated_at: string;
};

export type CalendarEvent = {
  id: string;
  world_id: string;
  author_id: string;
  title: string;
  event_date: string;
  yearly: boolean;
  emoji: string;
  note: string | null;
};

export type MusicLink = {
  id: string;
  author_id: string;
  url: string;
  title: string;
  note: string | null;
  created_at: string;
};

export type GameName = "trivia" | "wyr" | "cards";

export type GameSession = {
  id: string;
  world_id: string;
  game: GameName;
  round: number;
  prompt_id: string;
  subject_id: string | null;
  state: "answering" | "revealed";
  answered: string[];
  scores: Record<string, number>;
  judged_round: number;
  used_prompts: string[];
  updated_at: string;
};

export type GameAnswer = { session_id: string; round: number; user_id: string; answer: Record<string, unknown> };

export type RoomState = {
  world_id: string;
  wallpaper: string;
  ambience: string;
  placed: { slot: number; item: string }[];
  photo_paths: string[];
  updated_by: string | null;
  updated_at: string;
};

export type DecorItem = { id: string; name: string; emoji: string; cost: number };

export type Activity = { id: number; actor_id: string | null; kind: string; summary: string; created_at: string };
