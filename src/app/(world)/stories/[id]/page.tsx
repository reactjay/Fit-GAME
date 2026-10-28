import { notFound } from "next/navigation";
import { StoryReader } from "@/components/stories/reader";
import { getStory } from "@/content/stories";

export default async function StoryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!getStory(id)) notFound();
  return <StoryReader storyId={id} />;
}
