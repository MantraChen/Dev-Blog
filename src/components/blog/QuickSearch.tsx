import { useEffect, useRef, useState } from "react";
import { withBase } from "@/lib/site-path";
import type { PostSummary } from "@/lib/post-summary";
import { Highlight } from "./Highlight";
export function QuickSearch() {
  const dialog = useRef<HTMLDialogElement>(null),
    input = useRef<HTMLInputElement>(null),
    button = useRef<HTMLButtonElement>(null);
  const [query, setQuery] = useState(""),
    [results, setResults] = useState<PostSummary[]>([]),
    [status, setStatus] = useState("Type to search articles.");
  const previousFocus = useRef<HTMLElement | null>(null);
  const open = () => {
    previousFocus.current = document.activeElement as HTMLElement;
    dialog.current?.showModal();
    input.current?.focus();
  };
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        dialog.current?.open ? dialog.current.close() : open();
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    if (!query.trim()) {
      setResults([]);
      setStatus("Type to search articles.");
      return;
    }
    setStatus("Searching…");
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(
          withBase(`/api/posts/search?q=${encodeURIComponent(query)}`),
          { signal: controller.signal },
        );
        if (!response.ok)
          throw new Error("Search is unavailable. Try again shortly.");
        const rows = await response.json();
        if (!controller.signal.aborted) {
          setResults(rows);
          setStatus(
            rows.length
              ? `${response.headers.get("X-Total-Count")} matching articles`
              : "No matches. Try a shorter keyword or browse all articles.",
          );
        }
      } catch (error) {
        if (!controller.signal.aborted) {
          setResults([]);
          setStatus(
            error instanceof Error ? error.message : "Search unavailable",
          );
        }
      }
    }, 250);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query]);
  return (
    <>
      <button
        ref={button}
        className="rounded border px-3 py-1 text-sm"
        onClick={open}
      >
        Search <kbd className="ml-1 text-xs">Ctrl/⌘ K</kbd>
      </button>
      <dialog
        ref={dialog}
        aria-label="Quick article search"
        onClose={() => previousFocus.current?.focus()}
        className="m-auto w-[calc(100%-2rem)] max-w-2xl max-h-[80vh] rounded-xl border bg-background p-5 text-foreground backdrop:bg-black/60"
      >
        <div className="flex gap-3">
          <input
            ref={input}
            className="min-w-0 flex-1 rounded border bg-background p-3"
            aria-label="Quick search query"
            maxLength={200}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search articles…"
          />
          <button
            onClick={() => dialog.current?.close()}
            aria-label="Close search"
          >
            Close
          </button>
        </div>
        <p role="status" className="my-3 text-sm text-muted-foreground">
          {status}
        </p>
        <div className="space-y-2">
          {results.map((post) => (
            <a
              key={post.id}
              className="block rounded border p-3 hover:bg-accent"
              href={withBase(`/blog/${post.slug}`)}
            >
              <strong>
                <Highlight text={post.title} query={query} />
              </strong>
              <p className="line-clamp-2 text-sm text-muted-foreground">
                <Highlight
                  text={post.excerpt || post.description}
                  query={query}
                />
              </p>
            </a>
          ))}
        </div>
        <a
          className="mt-4 block underline text-sm"
          href={withBase(`/blog?q=${encodeURIComponent(query)}`)}
        >
          All results and filters →
        </a>
      </dialog>
    </>
  );
}
