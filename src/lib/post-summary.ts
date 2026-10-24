import type { PostItem } from "@/db/types";
import { estimateReadingTime } from "./utils";

export interface PostSummary {
  id: number;
  slug: string;
  title: string;
  description: string;
  tags: string[];
  publishedAt: string;
  coverImage: string | null;
  readingTime: number;
}

export function toPostSummary(post: PostItem): PostSummary {
  return {
    id: post.id, slug: post.slug, title: post.title,
    description: post.description, tags: post.tags, publishedAt: post.publishedAt,
    coverImage: post.coverImage, readingTime: estimateReadingTime(post.content),
  };
}
