import React, { useState, useEffect, useCallback } from "react";

const EMOJIS = ["👍", "🎉", "❤️", "🚀", "👀", "🤔"];

export function ReactionBar({ slug }: { slug: string }) {
  const [reactions, setReactions] = useState<Record<string, number>>({});

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/reactions?slug=${slug}`);
      if (res.ok) {
        setReactions(await res.json());
      }
    } catch (e) {
      console.error("Failed to load reactions", e);
    }
  }, [slug]);

  useEffect(() => {
    load();
  }, [load]);

  const react = async (emoji: string) => {
    // Optimistic UI update
    setReactions((prev) => ({
      ...prev,
      [emoji]: (prev[emoji] || 0) + 1,
    }));

    try {
      const res = await fetch("/api/reactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, emoji }),
      });

      if (res.ok) {
        // Sync with actual updated data from server
        const updated = await res.json();
        setReactions(updated);
      } else {
        // Revert on failure
        load();
      }
    } catch (e) {
      console.error("Failed to post reaction", e);
      load();
    }
  };

  return (
    <div className="flex flex-wrap gap-2 py-6 mt-8 border-t border-border">
      {EMOJIS.map((emoji) => (
        <button
          key={emoji}
          onClick={() => react(emoji)}
          className="flex items-center gap-1.5 px-3 py-1.5 border border-border rounded-lg text-sm bg-background hover:bg-accent active:scale-95 transition-all"
          aria-label={`React with ${emoji}`}
        >
          <span>{emoji}</span>
          {(reactions[emoji] || 0) > 0 && (
            <span className="text-muted-foreground font-medium text-xs">
              {reactions[emoji]}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}
