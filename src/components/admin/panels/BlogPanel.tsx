import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { withBase } from "@/lib/site-path";
import { editorRequest } from "@/lib/editor-client";
import type { EditorDraft, DraftSummary } from "@/lib/editor-data";
import type { PostItem } from "@/db/types";
import { WritingEditor } from "../WritingEditor";

const button =
  "rounded border px-3 py-1.5 text-sm hover:bg-accent disabled:opacity-50";

export function BlogPanel() {
  const [posts, setPosts] = useState<PostItem[]>([]);
  const [drafts, setDrafts] = useState<DraftSummary[]>([]);
  const [editor, setEditor] = useState<EditorDraft | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    try {
      const [articles, working] = await Promise.all([
        editorRequest<PostItem[]>("/api/posts?summary=1"),
        editorRequest<DraftSummary[]>("/api/editor/drafts"),
      ]);
      setPosts(articles);
      setDrafts(working);
      setError("");
    } catch (failure) {
      setError(
        failure instanceof Error ? failure.message : "Could not load articles",
      );
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  async function open(postId?: number, draftId?: string) {
    setBusy(true);
    try {
      const draft = draftId
        ? await editorRequest<EditorDraft>(`/api/editor/drafts/${draftId}`)
        : await editorRequest<EditorDraft>("/api/editor/drafts", "POST", {
            id: crypto.randomUUID(),
            ...(postId ? { postId } : {}),
          });
      setEditor(draft);
    } catch (failure) {
      toast.error(
        failure instanceof Error ? failure.message : "Could not open editor",
      );
    } finally {
      setBusy(false);
    }
  }
  async function cycleStatus(post: PostItem) {
    const next = post.draft
      ? { draft: false, hidden: false }
      : !post.hidden
        ? { draft: false, hidden: true }
        : { draft: true, hidden: false };
    try {
      await editorRequest(`/api/posts/${post.id}`, "PUT", next);
      await load();
    } catch (failure) {
      toast.error(
        failure instanceof Error
          ? failure.message
          : "Could not change visibility",
      );
    }
  }
  async function remove(post: PostItem) {
    if (
      !confirm(`Move “${post.title}” to Trash? You can restore it for 30 days.`)
    )
      return;
    try {
      await editorRequest(`/api/posts/${post.id}`, "DELETE");
      await load();
    } catch (failure) {
      toast.error(
        failure instanceof Error ? failure.message : "Could not delete article",
      );
    }
  }

  if (editor)
    return (
      <WritingEditor
        key={editor.id}
        initial={editor}
        onClose={() => {
          setEditor(null);
          void load();
        }}
      />
    );
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">Articles</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Write privately, preview, then publish.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <label className="text-sm">
            Import Markdown / ZIP
            <input
              aria-label="Import Markdown or ZIP"
              type="file"
              accept=".md,.zip"
              disabled={busy}
              className="block max-w-56 text-xs"
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                if (!file) return;
                if (file.size > 32 * 1024 * 1024) {
                  toast.error("Import files must be at most 32 MiB");
                  return;
                }
                setBusy(true);
                void fetch(withBase("/api/transfer/import"), {
                  method: "POST",
                  headers: {
                    "Content-Type": file.name.toLowerCase().endsWith(".zip")
                      ? "application/zip"
                      : "text/markdown",
                  },
                  body: file,
                })
                  .then(async (response) => {
                    const result = await response.json();
                    if (!response.ok)
                      throw new Error(result.error || "Import failed");
                    setEditor(result);
                  })
                  .catch((error) => toast.error(error.message))
                  .finally(() => setBusy(false));
              }}
            />
          </label>
          <button
            className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground disabled:opacity-50"
            disabled={busy}
            onClick={() => void open()}
          >
            New article
          </button>
        </div>
      </div>
      {error && (
        <div role="alert" className="rounded border p-3 text-sm">
          {error}{" "}
          <button className="ml-3 underline" onClick={() => void load()}>
            Retry
          </button>
        </div>
      )}
      {drafts.length > 0 && (
        <section
          aria-label="Working drafts"
          className="rounded-lg border bg-muted/20 p-4"
        >
          <h3 className="mb-3 text-sm font-semibold">Working drafts</h3>
          <div className="space-y-2">
            {drafts.map((draft) => (
              <div
                key={draft.id}
                className="flex flex-wrap items-center justify-between gap-2 border-t py-2 first:border-0"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">
                    {draft.title || "Untitled article"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {draft.postId ? "Unpublished changes" : "New draft"} ·{" "}
                    {new Date(draft.updatedAt).toLocaleString()}
                  </p>
                </div>
                <button
                  className={button}
                  disabled={busy}
                  onClick={() => void open(undefined, draft.id)}
                >
                  Continue writing
                </button>
              </div>
            ))}
          </div>
        </section>
      )}
      {loading ? (
        <p className="py-8 text-sm text-muted-foreground">Loading articles…</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b">
                <th className="py-3 font-medium">Title</th>
                <th className="px-3 font-medium">Visibility</th>
                <th className="px-3 font-medium">Date</th>
                <th className="text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {posts.map((post) => (
                <tr key={post.id} className="border-b">
                  <td className="py-3">
                    <p className="font-medium">{post.title}</p>
                    <p className="font-mono text-xs text-muted-foreground">
                      {post.slug}
                    </p>
                  </td>
                  <td className="px-3">
                    <button
                      className="rounded-full border px-2 py-1 text-xs"
                      title="Cycle visibility: draft → public → unlisted"
                      onClick={() => void cycleStatus(post)}
                    >
                      {post.draft
                        ? "Draft"
                        : post.hidden
                          ? "Unlisted"
                          : "Published"}
                    </button>
                  </td>
                  <td className="whitespace-nowrap px-3 text-xs text-muted-foreground">
                    {post.publishedAt.slice(0, 10)}
                  </td>
                  <td className="py-3">
                    <div className="flex justify-end gap-2">
                      {!post.draft && (
                        <a
                          className={button}
                          href={withBase(`/blog/${post.slug}`)}
                          target="_blank"
                          rel="noreferrer"
                        >
                          View
                        </a>
                      )}
                      <button
                        className={button}
                        disabled={busy}
                        onClick={() => void open(post.id)}
                      >
                        Edit
                      </button>
                      <a
                        className={button}
                        href={withBase(`/api/transfer/${post.id}`)}
                        download
                      >
                        Export
                      </a>
                      <button
                        className={`${button} text-destructive`}
                        onClick={() => void remove(post)}
                      >
                        Trash
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {posts.length === 0 && (
            <p className="py-10 text-center text-sm text-muted-foreground">
              No articles yet. Start a draft above.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
