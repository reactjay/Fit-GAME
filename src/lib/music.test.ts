import { describe, expect, it } from "vitest";
import { parseMusicUrl } from "./music";

describe("parseMusicUrl", () => {
  it("builds official embeds", () => {
    expect(parseMusicUrl("https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC?si=x")?.embed).toBe("https://open.spotify.com/embed/track/4uLU6hMCjMI75M1A2tKUQC");
    expect(parseMusicUrl("https://youtu.be/dQw4w9WgXcQ")?.embed).toBe("https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ");
    expect(parseMusicUrl("https://www.youtube.com/watch?v=dQw4w9WgXcQ")?.provider).toBe("YouTube");
    expect(parseMusicUrl("https://audiomack.com/artist/song/track-name")?.embed).toBe("https://audiomack.com/embed/song/artist/track-name");
    expect(parseMusicUrl("https://audiomack.com/artist/song/track-name")?.height).toBe(252);
  });
  it("keeps link-only services as links", () => {
    expect(parseMusicUrl("https://boomplay.com/songs/12345")).toMatchObject({ provider: "Boomplay", embed: null });
  });
  it("rejects non-https and junk", () => {
    expect(parseMusicUrl("http://open.spotify.com/track/x")).toBeNull();
    expect(parseMusicUrl("javascript:alert(1)")).toBeNull();
    expect(parseMusicUrl("not a url")).toBeNull();
  });
});
