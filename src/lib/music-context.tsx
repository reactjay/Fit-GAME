"use client";
import { createContext, useContext, useState, type ReactNode } from "react";
import { parseMusicUrl } from "@/lib/music";

export type ActiveTrack = {
  id?: string;
  url: string;
  title: string;
  note?: string | null;
  provider: string;
  embed: string;
  height: number;
};

type MusicContextType = {
  activeTrack: ActiveTrack | null;
  minimized: boolean;
  play: (link: { id?: string; url: string; title: string; note?: string | null }) => void;
  stop: () => void;
  toggleMinimized: () => void;
  setMinimized: (min: boolean) => void;
};

const MusicContext = createContext<MusicContextType | null>(null);

export function MusicProvider({ children }: { children: ReactNode }) {
  const [activeTrack, setActiveTrack] = useState<ActiveTrack | null>(null);
  const [minimized, setMinimized] = useState(false);

  const play = (link: { id?: string; url: string; title: string; note?: string | null }) => {
    const info = parseMusicUrl(link.url);
    if (!info?.embed) return;
    setActiveTrack({
      id: link.id,
      url: link.url,
      title: link.title,
      note: link.note,
      provider: info.provider,
      embed: info.embed,
      height: info.height,
    });
    setMinimized(false);
  };

  const stop = () => {
    setActiveTrack(null);
  };

  const toggleMinimized = () => {
    setMinimized((m) => !m);
  };

  return (
    <MusicContext.Provider value={{ activeTrack, minimized, play, stop, toggleMinimized, setMinimized }}>
      {children}
    </MusicContext.Provider>
  );
}

export function useMusic() {
  const ctx = useContext(MusicContext);
  if (!ctx) throw new Error("useMusic must be used within MusicProvider");
  return ctx;
}
