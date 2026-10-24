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
  excerpt?: string;
}

export function toPostSummary(post: PostItem, query = ""): PostSummary {
  const needle = query.trim().slice(0, 200);
  const plain = needle
    ? post.content
        .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
        .replace(/^\s*\[[^\]]+\]:\s*\S+.*$/gm, "")
        .replace(/<[^>]+>/g, " ")
        .replace(/[#*`>\[\]{}]/g, " ")
        .replace(/\s+/g, " ")
    : "";
  const position = plain
    .toLocaleLowerCase()
    .indexOf(needle.toLocaleLowerCase());
  return {
    id: post.id,
    slug: post.slug,
    title: post.title,
    description: post.description,
    tags: post.tags,
    publishedAt: post.publishedAt,
    coverImage: post.coverImage,
    readingTime: estimateReadingTime(post.content),
    ...(needle
      ? {
          excerpt:
            position >= 0
              ? `${position > 60 ? "…" : ""}${plain.slice(Math.max(0, position - 60), position + 160)}${position + 160 < plain.length ? "…" : ""}`
              : post.description,
        }
      : {}),
  };
}
