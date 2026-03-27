import React, { useState, useEffect } from "react";

interface Post {
  id: string;
  slug?: string;
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
        } catch {
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
        placeholder="搜索文章..."
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        className="w-full px-4 py-2 rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 mb-6"
      />

      {searchResults === null && (
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
      )}

      <div className="flex flex-col gap-4">
        {isSearching ? (
          <p className="text-muted-foreground text-center py-8">正在搜索...</p>
        ) : (
          <>
            {displayPosts.map((post) => {
              const postSlug = post.slug || post.id;
              return (
                <a
                  key={postSlug}
                  href={`/blog/${postSlug}`}
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
              );
            })}
            {displayPosts.length === 0 && (
              <p className="text-muted-foreground text-center py-8">
                {searchResults !== null ? "没有找到相关文章" : "没有文章"}
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
