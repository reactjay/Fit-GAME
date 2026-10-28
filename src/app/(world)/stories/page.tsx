"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { StoryScene } from "@/components/stories/scene";
import { PageHeader } from "@/components/ui/primitives";
import { STORIES } from "@/content/stories";
import { db } from "@/lib/db/client";
import type { StorySession } from "@/lib/types";
import { useActivity, useWorld } from "@/lib/world-context";

export default function StoriesPage() {
  useActivity("Browsing the storybook 📖");
  const { world } = useWorld();
  const [sessions, setSessions] = useState<Record<string, StorySession>>({});

  useEffect(() => {
    db()
      .from("story_sessions")
      .select("*")
      .eq("world_id", world.id)
      .then(({ data }) => setSessions(Object.fromEntries(((data ?? []) as StorySession[]).map((s) => [s.story_id, s]))));
  }, [world.id]);

  return (
    <>
      <PageHeader title="Our Storybook" subtitle="Read together, choose together. Your choices shape how each story ends." />
      <div className="grid gap-4 sm:grid-cols-2">
        {STORIES.map((story) => {
          const s = sessions[story.id];
          const node = s ? story.nodes[s.node_id] : null;
          const totalEndings = new Set(Object.values(story.nodes).flatMap((n) => (n.ending ? [n.ending.id] : []))).size;
          return (
            <Link key={story.id} href={`/stories/${story.id}`} className="card group overflow-hidden transition hover:border-rose">
              <StoryScene scene={story.nodes[story.start].scene} palette={story.palette} className="h-36 w-full transition group-hover:scale-[1.02]" />
              <div className="p-4">
                <div className="flex items-center justify-between gap-2">
                  <h2 className="font-display text-xl">
                    {story.emoji} {story.title}
                  </h2>
                </div>
                <p className="mt-1 text-sm text-ink-soft">{story.tagline}</p>
                <div className="mt-3 flex items-center justify-between text-xs text-ink-faint">
                  <span>{node ? (node.ending ? "Finished — read again?" : `Chapter ${node.chapter + 1}: ${story.chapters[node.chapter]}`) : `${story.chapters.length} chapters`}</span>
                  <span className="text-gold">
                    {s?.endings_seen.length ?? 0}/{totalEndings} endings
                  </span>
                </div>
              </div>
            </Link>
          );
        })}
      </div>
      <p className="mt-6 text-center text-xs text-ink-faint">Every chapter written with love for you two 💞</p>
    </>
  );
}
