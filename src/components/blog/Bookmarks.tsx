import { useEffect, useState } from "react";
import {
  readBookmarks,
  writeBookmarks,
  type Bookmark,
} from "@/lib/reader-storage";
import { withBase } from "@/lib/site-path";
export function Bookmarks() {
  const [items, setItems] = useState<Bookmark[] | null>(null),
    [error, setError] = useState("");
  useEffect(() => {
    const load = () => setItems(readBookmarks());
    load();
    window.addEventListener("storage", load);
    return () => window.removeEventListener("storage", load);
  }, []);
  return (
    <div className="space-y-3">
      {error && <p role="alert">{error}</p>}
      {items === null ? (
        <p>Loading your local bookmarks…</p>
      ) : items.length === 0 ? (
        <p>No bookmarks yet. Use Bookmark on any article.</p>
      ) : (
        items.map((item) => (
          <div
            key={item.id}
            className="flex justify-between gap-4 rounded border p-4"
          >
            <a
              href={withBase(`/blog/${item.slug}`)}
              className="font-medium hover:underline"
            >
              {item.title}
            </a>
            <button
              className="text-sm underline"
              onClick={() => {
                try {
                  const next = items.filter((row) => row.id !== item.id);
                  writeBookmarks(next);
                  setItems(next);
                } catch {
                  setError("Unable to change browser storage.");
                }
              }}
            >
              Remove
            </button>
          </div>
        ))
      )}
    </div>
  );
}
