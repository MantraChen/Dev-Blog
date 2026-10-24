import { useEffect, useState } from "react";
import {
  readBookmarks,
  writeBookmarks,
  READER_KEY,
} from "@/lib/reader-storage";
import { withBase } from "@/lib/site-path";
export function ReaderTools({
  id,
  slug,
  title,
}: {
  id: number;
  slug: string;
  title: string;
}) {
  const [saved, setSaved] = useState(false),
    [font, setFont] = useState(18),
    [error, setError] = useState(""),
    [resume, setResume] = useState<{ ratio: number; anchor: string } | null>(
      null,
    );
  useEffect(() => {
    const update = () =>
      setSaved(readBookmarks().some((item) => item.id === id));
    update();
    window.addEventListener("storage", update);
    const article = document.querySelector<HTMLElement>(".article-body");
    let timer: ReturnType<typeof setTimeout> | undefined,
      scrolled = false;
    try {
      const size = Number(localStorage.getItem(READER_KEY + ":font"));
      if ([16, 18, 20, 22].includes(size)) {
        setFont(size);
        article?.style.setProperty("--reader-size", `${size}px`);
      }
      const previous = JSON.parse(
        localStorage.getItem(`${READER_KEY}:position:${id}`) || "null",
      );
      if (
        previous &&
        typeof previous.ratio === "number" &&
        previous.ratio > 0.05 &&
        previous.ratio < 0.95 &&
        typeof previous.anchor === "string"
      )
        setResume(previous);
    } catch {}
    const persist = () => {
      if (!article || !scrolled) return;
      const rect = article.getBoundingClientRect();
      const ratio = Math.max(
        0,
        Math.min(
          1,
          (80 - rect.top) / Math.max(1, rect.height - innerHeight + 100),
        ),
      );
      const headings = [
        ...article.querySelectorAll<HTMLElement>("h1[id],h2[id],h3[id]"),
      ];
      const anchor =
        headings.filter((h) => h.getBoundingClientRect().top <= 100).at(-1)
          ?.id || "";
      try {
        localStorage.setItem(
          `${READER_KEY}:position:${id}`,
          JSON.stringify({ ratio, anchor, at: Date.now() }),
        );
      } catch {
        setError(
          "Browser storage is unavailable. Reading progress cannot be saved.",
        );
      }
    };
    const scroll = () => {
      scrolled = true;
      clearTimeout(timer);
      timer = setTimeout(persist, 300);
    };
    window.addEventListener("scroll", scroll, { passive: true });
    window.addEventListener("pagehide", persist);
    return () => {
      clearTimeout(timer);
      persist();
      window.removeEventListener("scroll", scroll);
      window.removeEventListener("pagehide", persist);
      window.removeEventListener("storage", update);
    };
  }, [id]);
  return (
    <div className="mb-6 flex flex-wrap items-center gap-3 rounded border p-3 text-sm">
      <button
        className="rounded border px-3 py-1"
        aria-pressed={saved}
        onClick={() => {
          try {
            const items = readBookmarks().filter((item) => item.id !== id);
            if (!saved)
              items.unshift({
                id,
                slug,
                title,
                savedAt: new Date().toISOString(),
              });
            writeBookmarks(items);
            setSaved(!saved);
          } catch {
            setError("Unable to save bookmarks in this browser.");
          }
        }}
      >
        {saved ? "Bookmarked" : "Bookmark"}
      </button>
      <a className="underline" href={withBase("/bookmarks")}>
        My bookmarks
      </a>
      <label>
        Text size{" "}
        <select
          aria-label="Article text size"
          className="rounded border bg-background p-1"
          value={font}
          onChange={(e) => {
            const size = Number(e.target.value);
            setFont(size);
            document
              .querySelector<HTMLElement>(".article-body")
              ?.style.setProperty("--reader-size", `${size}px`);
            try {
              localStorage.setItem(READER_KEY + ":font", String(size));
            } catch {
              setError("Text size applies to this page only.");
            }
          }}
        >
          {[16, 18, 20, 22].map((size) => (
            <option key={size} value={size}>
              {size}px
            </option>
          ))}
        </select>
      </label>
      {resume && (
        <button
          className="underline"
          onClick={() => {
            const article =
              document.querySelector<HTMLElement>(".article-body");
            const heading = resume.anchor
              ? document.getElementById(resume.anchor)
              : null;
            if (heading && article?.contains(heading)) heading.scrollIntoView();
            else if (article)
              window.scrollTo({
                top:
                  scrollY +
                  article.getBoundingClientRect().top +
                  resume.ratio *
                    Math.max(1, article.offsetHeight - innerHeight + 100) -
                  80,
              });
            setResume(null);
          }}
        >
          Continue reading ({Math.round(resume.ratio * 100)}%)
        </button>
      )}
      {error && <span role="status">{error}</span>}
    </div>
  );
}
