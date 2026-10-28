import { describe, expect, it } from "vitest";
import { STORIES, fillNames, validateStory } from "./index";

describe("starter stories", () => {
  it("ships at least three stories with unique ids", () => {
    expect(STORIES.length).toBeGreaterThanOrEqual(3);
    expect(new Set(STORIES.map((s) => s.id)).size).toBe(STORIES.length);
  });

  for (const story of STORIES) {
    it(`${story.title} is a valid, complete graph`, () => {
      expect(validateStory(story)).toEqual([]);
      expect(story.chapters.length).toBeGreaterThanOrEqual(3);
      const endings = Object.values(story.nodes).filter((n) => n.ending);
      expect(endings.length).toBeGreaterThanOrEqual(3);
      // every chapter is actually used
      const used = new Set(Object.values(story.nodes).map((n) => n.chapter));
      story.chapters.forEach((_, i) => expect(used.has(i)).toBe(true));
    });
  }

  it("fills both partners' names", () => {
    expect(fillNames("{A} and {B}, {A}", "Ada", "Tobi")).toBe("Ada and Tobi, Ada");
  });
});
