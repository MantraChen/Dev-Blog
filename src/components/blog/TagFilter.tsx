import React, { useState } from "react";

interface Post {
  id: string;
  title: string;
  description: string;
  tags: string[];
  publishedAt: string;
}

interface Props {
  posts: Post[];
  tags: string[];
}

export function TagFilter({ posts, tags }: Props) {
  const [activeTag, setActiveTag] = useState<string | null>(null);

  const filtered = activeTag
    ? posts.filter((p) => p.tags.includes(activeTag))
    : posts;

  return (
    <div>
      <div className="flex flex-wrap gap-2 mb-8">
        <button
          onClick={() => setActiveTag(null)}
          className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold transition-colors ${
            activeTag === null
              ? "bg-primary text-primary-foreground"
              : "hover:bg-accent"
          }`}
        >
          All
        </button>
        {tags.map((tag) => (
          <button
            key={tag}
            onClick={() => setActiveTag(tag === activeTag ? null : tag)}
            className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold transition-colors ${
              activeTag === tag
                ? "bg-primary text-primary-foreground"
                : "hover:bg-accent"
            }`}
          >
            {tag}
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-4">
        {filtered.map((post) => (
          <a
            key={post.id}
            href={`/blog/${post.id}`}
            className="group flex flex-col gap-2 rounded-lg border p-4 transition-colors hover:bg-muted/50"
          >
            <h3 className="font-semibold">{post.title}</h3>
            <p className="text-sm text-muted-foreground line-clamp-2">
              {post.description}
            </p>
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <time>
                {new Date(post.publishedAt).toLocaleDateString()}
              </time>
              <div className="flex gap-1">
                {post.tags.map((tag) => (
                  <span
                    key={tag}
                    className="inline-flex items-center rounded-full bg-secondary px-2 py-0.5 text-xs"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          </a>
        ))}
        {filtered.length === 0 && (
          <p className="text-muted-foreground text-center py-8">
            No posts found.
          </p>
        )}
      </div>
    </div>
  );
}
