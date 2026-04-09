import React, { useState, useEffect } from "react";

interface Post {
  id: string;
  slug?: string;
  title: string;
  description: string;
  tags: string[];
  publishedAt: string;
  coverImage?: string | null;
  readingTime: number;
}

interface Props {
  posts: Post[];
  tags: string[];
  tagCounts: Record<string, number>;
}

export function TagFilter({ posts, tags, tagCounts }: Props) {
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<Post[] | null>(null);
  const [isSearching, setIsSearching] = useState(false);

  useEffect(() => {
    const timer = setTimeout(async () => {
      if (searchQuery.trim().length >= 2) {
        setIsSearching(true);
        try {
          const res = await fetch(`/api/posts/search?q=${encodeURIComponent(searchQuery)}`);
          if (res.ok) {
            const data = await res.json();
            setSearchResults(data);
          } else {
            setSearchResults([]);
          }
        } catch (error) {
          console.error("Failed to fetch search results:", error);
          setSearchResults([]);
        } finally {
          setIsSearching(false);
        }
      } else {
        setSearchResults(null);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  const filtered = activeTag
    ? posts.filter((p) => p.tags.includes(activeTag))
    : posts;

  const displayPosts = searchResults !== null ? searchResults : filtered;

  return (
    <div>
      <input
        type="text"
        placeholder="Search posts..."
        aria-label="Search posts"
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        className="w-full px-4 py-2 rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 mb-6"
      />

      {searchResults === null && (
        <div className="flex flex-wrap gap-2 mb-8">
          <button
            onClick={() => setActiveTag(null)}
            className={`inline-flex items-center rounded-full border px-3 py-1 text-sm font-semibold transition-colors ${
              activeTag === null
                ? "bg-primary text-primary-foreground"
                : "hover:bg-accent"
            }`}
          >
            All
          </button>
          {tags.map((tag) => {
            const count = tagCounts[tag] || 0;
            let sizeClass = "text-sm";
            if (count <= 2) sizeClass = "text-xs";
            else if (count >= 6) sizeClass = "text-sm font-semibold";

            return (
              <button
                key={tag}
                onClick={() => setActiveTag(tag === activeTag ? null : tag)}
                className={`inline-flex items-center rounded-full border px-3 py-1 transition-colors ${sizeClass} ${
                  activeTag === tag
                    ? "bg-primary text-primary-foreground"
                    : "hover:bg-accent"
                }`}
              >
                {tag} ({count})
              </button>
            );
          })}
        </div>
      )}

      <div className="flex flex-col gap-4">
        {isSearching ? (
          <div className="flex flex-col gap-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="rounded-lg border overflow-hidden transition-colors">
                <div className="h-32 w-full bg-muted animate-pulse border-b border-border" />
                <div className="p-4 flex flex-col gap-3">
                  <div className="h-5 w-3/4 rounded bg-muted animate-pulse" />
                  <div className="space-y-2">
                    <div className="h-4 w-full rounded bg-muted animate-pulse" />
                    <div className="h-4 w-2/3 rounded bg-muted animate-pulse" />
                  </div>
                  <div className="flex gap-2 pt-1">
                    <div className="h-3 w-16 rounded-full bg-muted animate-pulse" />
                    <div className="h-3 w-12 rounded-full bg-muted animate-pulse" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <>
            {displayPosts.map((post) => {
              const postSlug = post.slug || post.id;

              return (
                <a
                  key={postSlug}
                  href={`/blog/${postSlug}`}
                  className="group flex flex-col rounded-lg border transition-colors hover:bg-muted/50 overflow-hidden"
                >
                  {post.coverImage && (
                    <img
                      src={post.coverImage}
                      alt={post.title}
                      loading="lazy"
                      className="w-full h-32 aspect-video object-cover border-b border-border bg-muted/50"
                    />
                  )}
                  <div className="p-4 flex flex-col gap-2">
                    <h3 className="font-semibold">{post.title}</h3>
                    <p className="text-sm text-muted-foreground line-clamp-2">
                      {post.description}
                    </p>
                    <div className="flex flex-col gap-1.5 text-xs text-muted-foreground">
                      <div className="flex items-center gap-1.5">
                        <time dateTime={post.publishedAt}>
                          {new Date(post.publishedAt).toLocaleDateString()}
                        </time>
                        <span>·</span>
                        <span>{post.readingTime} min read</span>
                      </div>
                      <div className="flex flex-wrap gap-1">
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
                  </div>
                </a>
              );
            })}

            {displayPosts.length === 0 && (
              <p className="text-muted-foreground text-center py-8">
                {searchResults !== null ? "No matching posts found" : "No posts yet"}
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
