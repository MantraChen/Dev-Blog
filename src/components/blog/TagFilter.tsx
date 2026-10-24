import { withBase, contentUrl } from "@/lib/site-path";
import React, { useState, useEffect } from "react";

import type { PostSummary } from "@/lib/post-summary";

interface Props {
  posts: PostSummary[];
  tags: string[];
  tagCounts: Record<string, number>;
  initialQuery: string; initialTag: string; initialPage: number; initialTotal: number;
}

export function TagFilter({ posts, tags, tagCounts, initialQuery, initialTag, initialPage, initialTotal }: Props) {
  const [activeTag, setActiveTag] = useState<string | null>(initialTag || null);
  const [searchQuery, setSearchQuery] = useState(initialQuery);
  const [searchResults, setSearchResults] = useState<PostSummary[] | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  const [page, setPage] = useState(initialPage);
  const [total, setTotal] = useState(initialTotal);
  useEffect(() => {
    const query = searchQuery.trim();
    setSearchError(null);
    if (query === initialQuery && (activeTag || "") === initialTag && page === initialPage) {
      setSearchResults(null);
      setTotal(initialTotal);
      setIsSearching(false);
      return;
    }
    const controller = new AbortController();
    setIsSearching(true);
    const timer = setTimeout(async () => {
        try {
          const res = await fetch(withBase(`/api/posts/search?${new URLSearchParams({ q: query, tag: activeTag || "", page: String(page) })}`), { signal: controller.signal });
          if (!res.ok) throw new Error(res.status === 429 ? "Too many searches. Please try again shortly." : "Search failed. Please try again.");
          const data: PostSummary[] = await res.json();
          if (!controller.signal.aborted) {
            setSearchResults(data);
            setTotal(Number(res.headers.get("X-Total-Count")) || 0);
          }
        } catch (error) {
          if (!controller.signal.aborted) {
            setSearchResults([]);
            setSearchError(error instanceof Error ? error.message : "Search failed. Please try again.");
          }
        } finally {
          if (!controller.signal.aborted) setIsSearching(false);
        }
    }, 300);

    return () => { clearTimeout(timer); controller.abort(); };
  }, [searchQuery, activeTag, page, initialQuery, initialTag, initialPage, initialTotal]);

  const displayPosts = searchResults ?? posts;
  const pageUrl = (number: number) => withBase(`/blog?${new URLSearchParams({ q: searchQuery.trim(), tag: activeTag || "", page: String(number) })}`);

  return (
    <div>
      <form action={withBase("/blog")} method="get" onSubmit={e => e.preventDefault()}>
      {activeTag && <input type="hidden" name="tag" value={activeTag} />}
      <input
        name="q"
        type="text"
        placeholder="Search posts..."
        aria-label="Search posts"
        maxLength={200}
        value={searchQuery}
        onChange={(e) => { setSearchQuery(e.target.value); setPage(1); }}
        className="w-full px-4 py-2 rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 mb-6"
      />
      </form>

        <div className="flex flex-wrap gap-2 mb-8">
          <button
            onClick={() => { setActiveTag(null); setPage(1); }}
            aria-pressed={activeTag === null}
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
                onClick={() => { setActiveTag(tag === activeTag ? null : tag); setPage(1); }}
                aria-pressed={activeTag === tag}
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

      {searchError && <p role="alert" className="text-destructive mb-4">{searchError}</p>}

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
                  href={withBase(`/blog/${postSlug}`)}
                  className="group flex flex-col rounded-lg border transition-colors hover:bg-muted/50 overflow-hidden"
                >
                  {post.coverImage && (
                    <img
                      src={contentUrl(post.coverImage)}
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
                          {new Date(post.publishedAt).toLocaleDateString("en-US")}
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

            {displayPosts.length === 0 && !searchError && (
              <p className="text-muted-foreground text-center py-8">
                {searchResults !== null ? "No matching posts found" : "No posts yet"}
              </p>
            )}
          </>
        )}
      </div>
      {!isSearching && !searchError && total > 20 && <nav aria-label="Blog pages" className="flex items-center justify-between mt-8">
        {page > 1 ? <a href={pageUrl(page - 1)} rel="prev">← Previous</a> : <span />}
        <span>Page {page} of {Math.ceil(total / 20)}</span>
        {page < Math.ceil(total / 20) ? <a href={pageUrl(page + 1)} rel="next">Next →</a> : <span />}
      </nav>}
    </div>
  );
}
