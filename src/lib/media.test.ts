import { describe, expect, it } from "vitest";
import { baseMime, storagePath, validateMedia } from "./media";
import { safeNext } from "./safe-next";

describe("media validation", () => {
  it("accepts allowed types and strips codecs", () => {
    expect(validateMedia({ type: "image/jpeg", size: 1000 }, "image")).toBeNull();
    expect(validateMedia({ type: "audio/webm;codecs=opus", size: 1000 }, "voice")).toBeNull();
    expect(baseMime("audio/webm;codecs=opus")).toBe("audio/webm");
  });
  it("rejects wrong type, empty, and oversized files", () => {
    expect(validateMedia({ type: "image/svg+xml", size: 10 }, "image")).toMatch(/JPG/);
    expect(validateMedia({ type: "audio/webm", size: 10 }, "image")).toMatch(/JPG/);
    expect(validateMedia({ type: "image/png", size: 0 }, "image")).toMatch(/empty/);
    expect(validateMedia({ type: "video/mp4", size: 1000 }, "video")).toBeNull();
    expect(validateMedia({ type: "video/avi", size: 10 }, "video")).toMatch(/MP4, WebM or MOV/);
    expect(validateMedia({ type: "image/png", size: 51 * 1024 * 1024 }, "image")).toMatch(/50 MB/);
  });
  it("puts files under the world's folder", () => {
    expect(storagePath("w1", "image/png")).toMatch(/^w1\/[0-9a-f-]{36}\.png$/);
  });
});

describe("safeNext", () => {
  it("only allows same-site paths", () => {
    expect(safeNext("/chat")).toBe("/chat");
    expect(safeNext("//evil.com")).toBe("/home");
    expect(safeNext("https://evil.com")).toBe("/home");
    expect(safeNext(null)).toBe("/home");
  });
});
