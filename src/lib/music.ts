// Music Corner links: we only store links and use each service's official embed
// player — no audio is hosted here.
export type MusicInfo = { provider: string; embed: string | null; height: number };

export function parseMusicUrl(raw: string): MusicInfo | null {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return null;
  }
  if (url.protocol !== "https:") return null;
  const host = url.hostname.replace(/^www\.|^m\./, "");
  if (host === "open.spotify.com") {
    const m = url.pathname.match(/^\/(?:intl-[a-z]+\/)?(track|album|playlist|episode|artist)\/([A-Za-z0-9]+)/);
    return { provider: "Spotify", embed: m ? `https://open.spotify.com/embed/${m[1]}/${m[2]}` : null, height: m?.[1] === "track" ? 152 : 352 };
  }
  if (host === "youtube.com" || host === "music.youtube.com" || host === "youtu.be") {
    const id = host === "youtu.be" ? url.pathname.slice(1) : url.searchParams.get("v");
    return { provider: "YouTube", embed: id && /^[\w-]{6,20}$/.test(id) ? `https://www.youtube-nocookie.com/embed/${id}` : null, height: 200 };
  }
  if (host === "music.apple.com") return { provider: "Apple Music", embed: `https://embed.music.apple.com${url.pathname}${url.search}`, height: 175 };
  if (host === "soundcloud.com") return { provider: "SoundCloud", embed: `https://w.soundcloud.com/player/?url=${encodeURIComponent(url.toString())}`, height: 166 };
  if (host.endsWith("audiomack.com")) {
    const m = url.pathname.match(/^\/([^\/]+)\/(song|album|playlist)\/([^\/]+)/);
    if (m) {
      const [, artist, type, slug] = m;
      return { provider: "Audiomack", embed: `https://audiomack.com/embed/${type}/${artist}/${slug}`, height: 252 };
    }
    const mEmbed = url.pathname.match(/^\/embed\/(song|album|playlist)\/([^\/]+)\/([^\/]+)/);
    if (mEmbed) {
      return { provider: "Audiomack", embed: `https://audiomack.com${url.pathname}`, height: 252 };
    }
    return { provider: "Audiomack", embed: `https://audiomack.com/embed${url.pathname}`, height: 252 };
  }
  if (host.endsWith("boomplay.com")) return { provider: "Boomplay", embed: null, height: 0 };
  if (host === "deezer.com" || host === "deezer.page.link") return { provider: "Deezer", embed: null, height: 0 };
  return { provider: host, embed: null, height: 0 };
}
