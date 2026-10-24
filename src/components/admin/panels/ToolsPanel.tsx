import { useCallback, useEffect, useState } from "react";
import { editorRequest, clearEditorRecovery } from "@/lib/editor-client";
import { withBase, contentUrl } from "@/lib/site-path";
import type { EditorDraft, DraftSummary } from "@/lib/editor-data";
const field = "w-full rounded border bg-background px-3 py-2 text-sm";
const btn =
  "rounded border px-3 py-2 text-sm hover:bg-accent disabled:opacity-50";
function useResource<T>(path: string) {
  const [value, setValue] = useState<T | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const reload = useCallback(async () => {
    setValue(await editorRequest<T>(path));
  }, [path]);
  useEffect(() => {
    let active = true;
    setValue(null);
    setError("");
    editorRequest<T>(path)
      .then((data) => {
        if (active) setValue(data);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [path]);
  const run = async (operation: () => Promise<unknown>) => {
    setBusy(true);
    setError("");
    try {
      await operation();
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Operation failed");
    } finally {
      setBusy(false);
    }
  };
  return { value, error, busy, run, reload, setError };
}
function Notice({ error, busy }: { error: string; busy: boolean }) {
  return (
    <>
      {error && (
        <p
          role="alert"
          className="rounded border border-destructive p-3 text-sm"
        >
          {error}
        </p>
      )}
      {busy && (
        <p role="status" className="text-sm">
          Working… Please keep this page open.
        </p>
      )}
    </>
  );
}
function Trash() {
  const r =
    useResource<{ id: number; title: string; deletedAt: string }[]>(
      "/api/manage/trash",
    );
  return (
    <div className="space-y-4">
      <p className="text-sm">
        Deleted articles stay here for 30 days. Restore returns them to an
        unpublished state, with drafts and history preserved.
      </p>
      <Notice {...r} />
      {r.value?.length === 0 && <p>Trash is empty.</p>}
      {r.value?.map((post) => (
        <div
          className="flex flex-wrap items-center justify-between gap-3 rounded border p-3"
          key={post.id}
        >
          <div>
            <strong>{post.title}</strong>
            <p className="text-xs text-muted-foreground">
              Deleted {new Date(post.deletedAt).toLocaleString()}
            </p>
          </div>
          <div className="flex gap-2">
            <button
              className={btn}
              disabled={r.busy}
              onClick={() =>
                void r.run(() =>
                  editorRequest("/api/manage/trash", "POST", {
                    action: "restore",
                    id: post.id,
                  }),
                )
              }
            >
              Restore as draft
            </button>
            <button
              className={btn}
              disabled={r.busy}
              onClick={() => {
                if (
                  confirm(
                    `Permanently delete “${post.title}”, its draft and history? This cannot be undone without a backup.`,
                  )
                )
                  void r.run(() =>
                    editorRequest("/api/manage/trash", "POST", {
                      action: "purge",
                      id: post.id,
                    }),
                  );
              }}
            >
              Delete permanently
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
type Asset = {
  id: string;
  name: string;
  url: string;
  bytes: number;
  width: number;
  height: number;
  references: { title: string; kind: string }[];
};
function Library() {
  const [q, setQ] = useState(""),
    [term, setTerm] = useState(""),
    [page, setPage] = useState(1);
  const r = useResource<{
    items: Asset[];
    total: number;
    page: number;
    bytes: number;
  }>(
    `/api/manage/library?${new URLSearchParams({ q: term, page: String(page) })}`,
  );
  return (
    <div className="space-y-4">
      <p className="text-sm">
        Images used by saved drafts, revision history, trashed articles or other
        pages cannot be deleted. Downloaded copies and unsaved browser edits are
        outside this reference check.
      </p>
      <Notice {...r} />
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          setTerm(q);
          setPage(1);
        }}
      >
        <input
          className={field}
          aria-label="Search image filenames"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          maxLength={100}
        />
        <button className={btn}>Search images</button>
      </form>
      {r.value && (
        <p className="text-sm">
          {r.value.total} matching images ·{" "}
          {(r.value.bytes / 1048576).toFixed(2)} MiB stored
        </p>
      )}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {r.value?.items.map((image) => (
          <article key={image.id} className="min-w-0 rounded border p-3">
            <img
              src={contentUrl(image.url)}
              alt={image.name}
              loading="lazy"
              className="h-36 w-full object-contain"
            />
            <p className="truncate mt-2 text-sm">{image.name}</p>
            <p className="text-xs text-muted-foreground">
              {image.width} × {image.height} · {(image.bytes / 1024).toFixed(0)}{" "}
              KiB
            </p>
            <input
              className={`${field} mt-2`}
              aria-label={`Image URL: ${image.name}`}
              readOnly
              value={image.url}
            />
            <details className="my-2 text-xs">
              <summary>{image.references.length} saved references</summary>
              <ul>
                {image.references.map((ref, i) => (
                  <li key={i}>
                    {ref.kind}: {ref.title}
                  </li>
                ))}
              </ul>
            </details>
            <button
              className={btn}
              disabled={r.busy || !!image.references.length}
              onClick={() => {
                if (confirm("Permanently delete this unused image?"))
                  void r.run(() =>
                    editorRequest("/api/manage/library", "POST", {
                      id: image.id,
                    }),
                  );
              }}
            >
              Delete unused image
            </button>
          </article>
        ))}
      </div>
      {r.value?.total === 0 && <p>No matching images.</p>}
      <div className="flex justify-between">
        <button
          className={btn}
          disabled={page <= 1}
          onClick={() => setPage(page - 1)}
        >
          Previous
        </button>
        <span>Page {r.value?.page || page}</span>
        <button
          className={btn}
          disabled={!r.value || r.value.page * 20 >= r.value.total}
          onClick={() => setPage(page + 1)}
        >
          Next
        </button>
      </div>
    </div>
  );
}
type Series = {
  slug: string;
  title: string;
  description: string;
  count: number;
};
type Chapter = { id: number; title: string; draft: number; hidden: number };
function SeriesManager() {
  const r = useResource<Series[]>("/api/manage/series");
  const [edit, setEdit] = useState<Series>({
      slug: "",
      title: "",
      description: "",
      count: 0,
    }),
    [chapters, setChapters] = useState<Chapter[]>([]);
  return (
    <div className="space-y-5">
      <Notice {...r} />
      <p className="text-sm">
        Create a series here, assign it in the article editor, then arrange its
        reading order.
      </p>
      <form
        className="space-y-3 rounded border p-4"
        onSubmit={(e) => {
          e.preventDefault();
          void r.run(() =>
            editorRequest("/api/manage/series", "POST", {
              action: "save",
              ...edit,
            }),
          );
        }}
      >
        <label className="block text-sm">
          Series address
          <input
            className={field}
            required
            maxLength={100}
            value={edit.slug}
            onChange={(e) => {
              setChapters([]);
              setEdit({ ...edit, slug: e.target.value });
            }}
          />
        </label>
        <label className="block text-sm">
          Title
          <input
            className={field}
            required
            maxLength={200}
            value={edit.title}
            onChange={(e) => setEdit({ ...edit, title: e.target.value })}
          />
        </label>
        <label className="block text-sm">
          Introduction
          <textarea
            className={field}
            maxLength={4000}
            value={edit.description}
            onChange={(e) => setEdit({ ...edit, description: e.target.value })}
          />
        </label>
        <button className={btn} disabled={r.busy}>
          Save series
        </button>
      </form>
      <div className="flex flex-wrap gap-2">
        {r.value?.map((series) => (
          <button
            key={series.slug}
            className={btn}
            disabled={r.busy}
            onClick={() =>
              void r.run(async () => {
                setEdit(series);
                setChapters(
                  await editorRequest<Chapter[]>(
                    `/api/manage/series?slug=${encodeURIComponent(series.slug)}`,
                  ),
                );
              })
            }
          >
            {series.title} · {series.count} public
          </button>
        ))}
      </div>
      {chapters.length > 0 && (
        <div className="space-y-2">
          <h3 className="font-semibold">Chapter order: {edit.title}</h3>
          {chapters.map((chapter, index) => (
            <div
              key={chapter.id}
              className="flex items-center justify-between gap-2 rounded border p-2"
            >
              <span>
                {index + 1}. {chapter.title}
                {chapter.draft
                  ? " (draft)"
                  : chapter.hidden
                    ? " (unlisted)"
                    : ""}
              </span>
              <div className="flex gap-1">
                {[-1, 1].map((step) => (
                  <button
                    type="button"
                    key={step}
                    className={btn}
                    disabled={
                      index + step < 0 || index + step >= chapters.length
                    }
                    aria-label={`${step < 0 ? "Move up" : "Move down"}: ${chapter.title}`}
                    onClick={() => {
                      const next = [...chapters];
                      [next[index], next[index + step]] = [
                        next[index + step],
                        next[index],
                      ];
                      setChapters(next);
                    }}
                  >
                    {step < 0 ? "↑" : "↓"}
                  </button>
                ))}
              </div>
            </div>
          ))}
          <button
            className={btn}
            disabled={r.busy}
            onClick={() =>
              void r.run(() =>
                editorRequest("/api/manage/series", "POST", {
                  action: "reorder",
                  slug: edit.slug,
                  ids: chapters.map((c) => c.id),
                }),
              )
            }
          >
            Save chapter order
          </button>
        </div>
      )}
    </div>
  );
}
type Schedule = {
  draftId: string;
  title: string;
  scheduledAt: string;
  status: string;
  error: string | null;
};
function Schedules() {
  const r = useResource<Schedule[]>("/api/manage/schedules"),
    drafts = useResource<DraftSummary[]>("/api/editor/drafts");
  const [id, setId] = useState(""),
    [at, setAt] = useState("");
  return (
    <div className="space-y-4">
      <Notice {...r} />
      <p className="text-sm">
        Times use your device timezone. The server checks every 30 seconds and
        catches up after a restart. Editing a scheduled draft cancels its
        schedule; failed publications remain private.
      </p>
      <form
        className="flex flex-wrap gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          void r.run(async () => {
            if (!at || !Number.isFinite(Date.parse(at)))
              throw new Error("Choose a valid local date and time.");
            const draft = await editorRequest<EditorDraft>(
              `/api/editor/drafts/${id}`,
            );
            await editorRequest("/api/manage/schedules", "POST", {
              action: "schedule",
              id,
              version: draft.version,
              at: new Date(at).toISOString(),
            });
          });
        }}
      >
        <select
          aria-label="Draft to schedule"
          className={field}
          required
          value={id}
          onChange={(e) => setId(e.target.value)}
        >
          <option value="">Select a saved draft</option>
          {drafts.value?.map((draft) => (
            <option key={draft.id} value={draft.id}>
              {draft.title || "Untitled"}
            </option>
          ))}
        </select>
        <input
          className={field}
          type="datetime-local"
          aria-label="Publication time"
          required
          value={at}
          onChange={(e) => setAt(e.target.value)}
        />
        <button className={btn} disabled={r.busy || !id}>
          Schedule publication
        </button>
      </form>
      {r.value?.length === 0 && <p>No scheduled articles.</p>}
      {r.value?.map((job) => (
        <div key={job.draftId} className="rounded border p-3">
          <strong>{job.title}</strong>
          <p className="text-sm">
            {new Date(job.scheduledAt).toLocaleString()} · {job.status}
          </p>
          {job.error && <p className="text-sm text-destructive">{job.error}</p>}
          {job.status === "pending" && (
            <button
              className={`${btn} mt-2`}
              disabled={r.busy}
              onClick={() =>
                void r.run(() =>
                  editorRequest("/api/manage/schedules", "POST", {
                    action: "cancel",
                    id: job.draftId,
                  }),
                )
              }
            >
              Cancel schedule
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
type Backup = {
  id: string;
  createdAt?: string;
  reason?: string;
  counts?: { posts: number; drafts: number; images: number };
  error?: string;
};
type Inspection = {
  id: string;
  createdAt: string;
  counts: { posts: number; drafts: number; images: number };
  current: { posts: number; drafts: number; images: number };
  databaseSha256: string;
};
function Backups() {
  const r = useResource<{
    items: Backup[];
    settings: { enabled?: { value: string }; lastError: string };
  }>("/api/manage/backups");
  const [preview, setPreview] = useState<Inspection | null>(null),
    [confirmation, setConfirmation] = useState("");
  return (
    <div className="space-y-4">
      <p className="text-sm">
        Each backup contains SQLite and all uploaded images. Keep an off-server
        copy of the backup directory. Backups are retained until you archive or
        remove them on the server; monitor available storage.
      </p>
      <Notice {...r} />
      <div className="flex flex-wrap items-center gap-4">
        <button
          className={btn}
          disabled={r.busy}
          onClick={() =>
            void r.run(() =>
              editorRequest("/api/manage/backups", "POST", {
                action: "create",
              }),
            )
          }
        >
          Create full backup
        </button>
        <label className="text-sm">
          <input
            type="checkbox"
            disabled={r.busy}
            checked={r.value?.settings.enabled?.value === "true"}
            onChange={(e) =>
              void r.run(() =>
                editorRequest("/api/manage/backups", "POST", {
                  action: "configure",
                  enabled: e.target.checked,
                }),
              )
            }
          />{" "}
          Automatic daily backup
        </label>
      </div>
      {r.value?.settings.lastError && (
        <p role="alert">{r.value.settings.lastError}</p>
      )}
      {r.value?.items.length === 0 && <p>No full backups yet.</p>}
      {r.value?.items.map((item) => (
        <div key={item.id} className="rounded border p-3">
          <p className="font-mono text-xs break-all">{item.id}</p>
          <p className="text-sm">
            {item.createdAt && new Date(item.createdAt).toLocaleString()} ·{" "}
            {item.reason} · {item.counts?.posts} articles /{" "}
            {item.counts?.images} images
          </p>
          {item.error ? (
            <p>{item.error}</p>
          ) : (
            <button
              className={`${btn} mt-2`}
              disabled={r.busy}
              onClick={() =>
                void r.run(async () => {
                  setPreview(
                    await editorRequest<Inspection>(
                      "/api/manage/backups",
                      "POST",
                      { action: "inspect", id: item.id },
                    ),
                  );
                  setConfirmation("");
                })
              }
            >
              Check and preview restoration
            </button>
          )}
        </div>
      ))}
      {preview && (
        <section className="space-y-3 rounded border border-amber-500 p-4">
          <h3 className="font-semibold">Restore backup {preview.id}</h3>
          <p className="text-sm">
            This replaces the entire database. A full backup of the current
            state is created first. All admin sessions end and pending
            publication schedules are cancelled.
          </p>
          <table className="w-full text-left text-sm">
            <thead>
              <tr>
                <th>Content</th>
                <th>Current</th>
                <th>After restore</th>
              </tr>
            </thead>
            <tbody>
              {(["posts", "drafts", "images"] as const).map((key) => (
                <tr key={key}>
                  <td>{key}</td>
                  <td>{preview.current[key]}</td>
                  <td>{preview.counts[key]}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <label className="block text-sm">
            Type the backup ID to confirm
            <input
              className={field}
              value={confirmation}
              onChange={(e) => setConfirmation(e.target.value)}
            />
          </label>
          <button
            className={btn}
            disabled={r.busy || confirmation !== preview.id}
            onClick={() =>
              void r.run(async () => {
                await editorRequest("/api/manage/backups", "POST", {
                  action: "restore",
                  id: preview.id,
                  confirmation,
                  hash: preview.databaseSha256,
                });
                clearEditorRecovery();
                window.location.href = withBase("/admin/login");
              })
            }
          >
            Restore database and images
          </button>
        </section>
      )}
    </div>
  );
}
function NowEditor() {
  const r = useResource<{ content: string; updatedAt: string }>(
    "/api/manage/now",
  );
  const [content, setContent] = useState("");
  useEffect(() => {
    if (r.value) setContent(r.value.content);
  }, [r.value]);
  return (
    <div className="space-y-4">
      <p className="text-sm">
        Write what you are doing, reading and learning. The public Now page also
        includes your recent updates and projects.
      </p>
      <Notice {...r} />
      <label className="block text-sm">
        Now page (Markdown)
        <textarea
          className={`${field} min-h-80 font-mono`}
          value={content}
          maxLength={100000}
          onChange={(e) => setContent(e.target.value)}
        />
      </label>
      <button
        className={btn}
        disabled={r.busy}
        onClick={() =>
          void r.run(() =>
            editorRequest("/api/manage/now", "POST", { content }),
          )
        }
      >
        Publish Now page
      </button>
      <a
        className="ml-3 underline text-sm"
        href={withBase("/now")}
        target="_blank"
        rel="noreferrer"
      >
        View Now
      </a>
    </div>
  );
}
function Links() {
  const r =
    useResource<{ id: number; title: string; targetSlug: string }[]>(
      "/api/manage/links",
    );
  return (
    <div className="space-y-3">
      <Notice {...r} />
      <p className="text-sm">
        Renamed article addresses redirect automatically. These internal
        references point to missing, trashed or unpublished articles; external
        URLs are not crawled.
      </p>
      {r.value?.length === 0 && <p>No missing internal article targets.</p>}
      {r.value?.map((item, i) => (
        <p key={i} className="rounded border p-3 text-sm">
          {item.title} → /blog/{item.targetSlug}
        </p>
      ))}
      <button
        className={btn}
        disabled={r.busy}
        onClick={() => void r.run(async () => {})}
      >
        Refresh report
      </button>
    </div>
  );
}
const sections = {
  Trash,
  Media: Library,
  Series: SeriesManager,
  Schedules,
  Backups,
  Now: NowEditor,
  Links,
};
export function ToolsPanel() {
  const [tab, setTab] = useState<keyof typeof sections>("Trash");
  const Panel = sections[tab];
  return (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold">Content tools</h2>
      <div className="flex flex-wrap gap-2">
        {(Object.keys(sections) as (keyof typeof sections)[]).map((key) => (
          <button
            key={key}
            className={btn}
            aria-pressed={tab === key}
            onClick={() => setTab(key)}
          >
            {key}
          </button>
        ))}
      </div>
      <Panel key={tab} />
    </div>
  );
}
