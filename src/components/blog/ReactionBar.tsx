import { withBase } from "@/lib/site-path";
import { useState, useEffect, useRef } from "react";

const EMOJIS = ["👍", "🎉", "❤️", "🚀", "👀", "🤔"];
export function ReactionBar({ slug }: { slug: string }) {
  const [reactions, setReactions] = useState<Record<string, number>>({});
  const [pending, setPending] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const request = useRef<AbortController | null>(null);
  const submitting = useRef(false);
  useEffect(() => {
    const controller = new AbortController();
    request.current = controller;
    setPending(true);
    setReactions({});
    setError(null);
    fetch(withBase(`/api/reactions?slug=${encodeURIComponent(slug)}`), { signal: controller.signal })
      .then(async response => {
        if (!response.ok) throw new Error("Could not load reactions.");
        const counts = await response.json();
        if (!controller.signal.aborted) setReactions(counts);
      })
      .catch(() => { if (!controller.signal.aborted) setError("Could not load reactions."); })
      .finally(() => { if (!controller.signal.aborted) setPending(false); });
    return () => { controller.abort(); request.current?.abort(); };
  }, [slug]);

  const react = async (emoji: string) => {
    if (pending || submitting.current) return;
    submitting.current = true;
    setPending(true);
    setError(null);
    const controller = new AbortController();
    request.current = controller;
    try {
      const response = await fetch(withBase("/api/reactions"), {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, emoji }), signal: controller.signal,
      });
      if (!response.ok) throw new Error(response.status === 429 ? "Too many reactions. Please try again later." : "Reaction was not saved. Please try again.");
      const counts = await response.json();
      if (!controller.signal.aborted) setReactions(counts);
    } catch (error) {
      if (!controller.signal.aborted) setError(error instanceof Error ? error.message : "Could not save reaction.");
    } finally {
      submitting.current = false;
      if (!controller.signal.aborted) setPending(false);
    }
  };

  return <div className="flex flex-wrap gap-2 py-6 mt-8 border-t border-border" aria-busy={pending}>
    {EMOJIS.map(emoji => <button key={emoji} onClick={() => react(emoji)} disabled={pending}
      className="flex items-center gap-1.5 px-3 py-1.5 border border-border rounded-lg text-sm bg-background hover:bg-accent disabled:opacity-50"
      aria-label={`React with ${emoji}`}>
      <span>{emoji}</span>
      {(reactions[emoji] || 0) > 0 && <span className="text-muted-foreground font-medium text-xs">{reactions[emoji]}</span>}
    </button>)}
    {error && <p role="alert" className="w-full text-sm text-destructive">{error}</p>}
  </div>;
}
