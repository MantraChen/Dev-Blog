import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { withBase, contentUrl } from "@/lib/site-path";
import { slugifyPostTitle } from "@/lib/post-slug";
import { editorRequest, EditorRequestError, readRecovery, recoveryKey, BEFORE_EDITOR_LOGOUT, EDITOR_LOGOUT, RECOVERY_PREFIX } from "@/lib/editor-client";
import type { EditorData, EditorDraft } from "@/lib/editor-data";
import type { MediaItem } from "@/lib/media";

const field = "w-full rounded-md border bg-transparent px-3 py-2 text-sm disabled:opacity-60";
const button = "rounded-md border px-3 py-2 text-sm hover:bg-accent disabled:opacity-50";
type Revision = { id: number; version: number; title: string; savedAt: string; data?: EditorData };

export function WritingEditor({ initial, onClose }: { initial: EditorDraft; onClose: () => void }) {
  const [data, setData] = useState(initial.data);
  const [status, setStatus] = useState("Saved to server");
  const [error, setError] = useState("");
  const [cacheError, setCacheError] = useState("");
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const [recovery, setRecovery] = useState<ReturnType<typeof readRecovery>>(null);
  const [preview, setPreview] = useState(false);
  const [previewHtml, setPreviewHtml] = useState("");
  const [history, setHistory] = useState<Revision[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [revision, setRevision] = useState<Revision | null>(null);
  const [media, setMedia] = useState<MediaItem[] | null>(null);
  const [autoSlug, setAutoSlug] = useState(!initial.postId && !initial.data.slug);
  const server = useRef(initial);
  const current = useRef(initial.data);
  const committed = useRef(JSON.stringify(initial.data));
  const key = useRef("");
  const blocked = useRef(false);
  const recoveryPending = useRef(false);
  const closed = useRef(false);
  const mounted = useRef(true);
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const cacheTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const draftPath = `/api/editor/drafts/${initial.id}`;

  function persistLocal() {
    if (closed.current || recoveryPending.current || !key.current) return;
    try {
      if (JSON.stringify(current.current) === committed.current) localStorage.removeItem(key.current);
      else localStorage.setItem(key.current, JSON.stringify({ data: current.current, savedAt: new Date().toISOString() }));
      if (mounted.current) setCacheError("");
    } catch { if (mounted.current) setCacheError("Browser recovery storage is unavailable. Keep this page open until the server save succeeds."); }
  }
  function update(patch: Partial<EditorData>) {
    current.current = { ...current.current, ...patch };
    setData(current.current);
    setStatus("Unsaved changes");
    clearTimeout(cacheTimer.current);
    cacheTimer.current = setTimeout(persistLocal, 150);
  }
  function adopt(draft: EditorDraft) {
    server.current = draft;
    committed.current = JSON.stringify(draft.data);
    current.current = draft.data;
    setData(draft.data);
    blocked.current = false;
    setError("");
    setStatus("Saved to server");
    persistLocal();
  }
  function flush(): Promise<EditorDraft> {
    const pending = queue.current.catch(() => {}).then(async () => {
      if (closed.current) throw new Error("Editor closed");
      if (blocked.current) throw new Error("Resolve the draft conflict before saving again.");
      const snapshot = JSON.stringify(current.current);
      if (snapshot === committed.current) return server.current;
      if (mounted.current) { setStatus("Saving…"); setError(""); }
      try {
        const saved = await editorRequest<EditorDraft>(draftPath, "PUT", { version: server.current.version, data: JSON.parse(snapshot) });
        server.current = saved;
        committed.current = snapshot;
        persistLocal();
        if (mounted.current) setStatus(JSON.stringify(current.current) === snapshot ? "Saved to server" : "Unsaved changes");
        return saved;
      } catch (failure) {
        if (failure instanceof EditorRequestError && (failure.status === 409 || failure.status === 404)) blocked.current = true;
        if (mounted.current) {
          setStatus("Not saved to server");
          setError(failure instanceof Error ? failure.message : "Unable to save. Your working copy stays in this browser.");
        }
        persistLocal();
        throw failure;
      }
    });
    queue.current = pending;
    return pending;
  }

  useEffect(() => {
    mounted.current = true;
    key.current = recoveryKey(initial.id);
    const cached = readRecovery(key.current);
    if (cached && JSON.stringify(cached.data) !== committed.current) { recoveryPending.current = true; setRecovery(cached); }
    else setReady(true);
    const leaving = (event: BeforeUnloadEvent) => {
      if (!closed.current && JSON.stringify(current.current) !== committed.current) {
        persistLocal(); event.preventDefault();
      }
    };
    const online = () => { if (!blocked.current) void flush().catch(() => {}); };
    const beforeLogout = (event: Event) => {
      if ((recoveryPending.current || JSON.stringify(current.current) !== committed.current) &&
          !confirm("Sign out and clear browser recovery copies? Unsaved edits will be lost. Cancel to save or download them first.")) event.preventDefault();
    };
    const signedOut = () => {
      closed.current = true;
      clearTimeout(cacheTimer.current);
      setReady(false);
      setError("You have signed out. Reload this page to sign in again.");
    };
    const storage = (event: StorageEvent) => { if (event.key === RECOVERY_PREFIX + "logout" && event.newValue) signedOut(); };
    window.addEventListener("beforeunload", leaving);
    window.addEventListener("online", online);
    window.addEventListener(BEFORE_EDITOR_LOGOUT, beforeLogout);
    window.addEventListener(EDITOR_LOGOUT, signedOut);
    window.addEventListener("storage", storage);
    return () => {
      mounted.current = false;
      clearTimeout(cacheTimer.current);
      persistLocal();
      window.removeEventListener("beforeunload", leaving);
      window.removeEventListener("online", online);
      window.removeEventListener(BEFORE_EDITOR_LOGOUT, beforeLogout);
      window.removeEventListener(EDITOR_LOGOUT, signedOut);
      window.removeEventListener("storage", storage);
    };
  }, []);

  useEffect(() => {
    if (!ready || busy || blocked.current || closed.current) return;
    const timer = setTimeout(() => { void flush().catch(() => {}); }, 800);
    return () => clearTimeout(timer);
  }, [data, ready, busy]);

  useEffect(() => {
    if (!preview) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(withBase("/api/posts/preview"), { method: "POST", signal: controller.signal,
          headers: { "Content-Type": "application/json" }, body: JSON.stringify({ content: data.content }) });
        if (!response.ok) throw new Error("Preview failed");
        const result = await response.json();
        if (!controller.signal.aborted) setPreviewHtml(result.html);
      } catch { if (!controller.signal.aborted) setPreviewHtml("<p>Preview unavailable. Your Markdown is unchanged.</p>"); }
    }, 300);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [preview, data.content]);

  async function action(operation: () => Promise<void>) {
    setBusy(true); setError("");
    try { await operation(); }
    catch (failure) { setError(failure instanceof Error ? failure.message : "Operation failed"); }
    finally { if (mounted.current) setBusy(false); }
  }
  function finish() {
    closed.current = true;
    clearTimeout(cacheTimer.current);
    try { localStorage.removeItem(key.current); } catch {}
    onClose();
  }
  async function publish() {
    await action(async () => {
      const saved = await flush();
      await editorRequest(draftPath + "/publish", "POST", { version: saved.version });
      toast.success(initial.postId ? "Article updated" : "Article published");
      finish();
    });
  }
  async function upload(file: File, cover = false) {
    if (busy) return;
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type) || file.size > 8 * 1024 * 1024) {
      setError("Choose a JPEG, PNG or WebP image up to 8 MiB."); return;
    }
    const start = textarea.current?.selectionStart ?? current.current.content.length;
    const end = textarea.current?.selectionEnd ?? start;
    await action(async () => {
      const response = await fetch(withBase("/api/media"), { method: "POST", body: file,
        headers: { "Content-Type": file.type, "X-File-Name": encodeURIComponent(file.name) } });
      const image = await response.json();
      if (!response.ok) throw new Error(image.error || "Upload failed");
      if (cover) update({ coverImage: image.url });
      else {
        const alt = file.name.replace(/\.[^.]+$/, "").replace(/[\[\]\\\r\n]/g, "");
        const markdown = `\n![${alt}](${image.url})\n`;
        update({ content: current.current.content.slice(0, start) + markdown + current.current.content.slice(end) });
      }
      setMedia(null);
      toast.success("Image uploaded. It stays private until used in a published article.");
    });
  }

  return <section className="mb-8 rounded-xl border bg-card p-4 sm:p-6" aria-label="Article editor">
    <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
      <div><h2 className="text-xl font-semibold">{initial.postId ? "Edit article" : "New article"}</h2>
        <p className="mt-1 text-sm text-muted-foreground">Changes stay in your working draft until you publish.</p></div>
      <span className="text-xs text-muted-foreground" role="status" aria-live="polite">{status}</span>
    </div>
    {recovery && <div className="mb-4 rounded border border-amber-500/40 p-3 text-sm" role="alert">
      <p>A browser recovery copy from {new Date(recovery.savedAt).toLocaleString()} differs from the server draft.</p>
      <div className="mt-2 flex gap-2">
        <button className={button} onClick={() => { recoveryPending.current = false; update(recovery.data); setRecovery(null); setReady(true); }}>Restore browser copy</button>
        <button className={button} onClick={() => { recoveryPending.current = false; setRecovery(null); setReady(true); persistLocal(); }}>Use server draft</button>
      </div>
    </div>}
    {error && <div className="mb-4 rounded border border-destructive/40 p-3 text-sm" role="alert">
      <p>{error}</p>
      <div className="mt-2 flex flex-wrap gap-2">
        <button className={button} disabled={busy || !ready} onClick={() => void action(async () => { await flush(); })}>Retry save</button>
        <button className={button} disabled={busy} onClick={() => {
          const blob = new Blob([JSON.stringify(current.current, null, 2)], { type: "application/json" });
          const url = URL.createObjectURL(blob); const link = document.createElement("a");
          link.href = url; link.download = "article-recovery.json"; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
        }}>Download working copy</button>
        <button className={button} disabled={busy} onClick={() => {
          if (confirm("Replace this browser's edits with the current server draft? Download your working copy first if you need it.")) {
            void action(async () => { await queue.current.catch(() => {}); adopt(await editorRequest<EditorDraft>(draftPath)); });
          }
        }}>Reload server draft</button>
      </div>
    </div>}
    {cacheError && <p role="alert" className="mb-4 text-sm text-destructive">{cacheError}</p>}
    <fieldset disabled={!ready || busy} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="space-y-1 text-sm">Title<input aria-label="Title" className={field} value={data.title} maxLength={200} onChange={event => {
          const title = event.target.value;
          update({ title, ...(autoSlug ? { slug: title ? slugifyPostTitle(title, `post-${initial.id}`) : "" } : {}) });
        }} /></label>
        <label className="space-y-1 text-sm">URL slug<input aria-label="URL slug" className={field} value={data.slug} maxLength={200} onChange={event => { setAutoSlug(false); update({ slug: event.target.value }); }} /></label>
      </div>
      <label className="block space-y-1 text-sm">Description<input className={field} value={data.description} maxLength={500} onChange={event => update({ description: event.target.value })} /></label>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="space-y-1 text-sm">Tags (comma separated)<input className={field} value={data.tags} maxLength={1200} onChange={event => update({ tags: event.target.value })} /></label>
        <label className="space-y-1 text-sm">Publication date<input className={field} type="date" value={data.publishedAt.slice(0, 10)} onChange={event => update({ publishedAt: event.target.value })} /></label>
      </div>
      <div className="flex flex-wrap gap-4 text-sm">
        <label className="flex items-center gap-2"><input type="checkbox" checked={data.featured} onChange={event => update({ featured: event.target.checked })} />Featured</label>
        <label className="flex items-center gap-2"><input type="checkbox" checked={data.hidden} onChange={event => update({ hidden: event.target.checked })} />Unlisted (direct link only)</label>
      </div>
      <div className="space-y-2">
        <label className="block space-y-1 text-sm">Cover image URL<input className={field} value={data.coverImage} maxLength={2048} placeholder="https://… or /media/…" onChange={event => update({ coverImage: event.target.value })} /></label>
        <label className="inline-block text-sm">Upload cover<input aria-label="Upload cover" type="file" accept="image/jpeg,image/png,image/webp" className="ml-2 text-xs max-w-full" onChange={event => { const file = event.target.files?.[0]; event.target.value = ""; if (file) void upload(file, true); }} /></label>
        {data.coverImage && <img src={contentUrl(data.coverImage)} alt="Cover preview" className="max-h-40 rounded object-contain" />}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <label className="text-sm">Insert image<input aria-label="Insert image" type="file" accept="image/jpeg,image/png,image/webp" className="ml-2 text-xs max-w-full" onChange={event => { const file = event.target.files?.[0]; event.target.value = ""; if (file) void upload(file); }} /></label>
        <div className="flex gap-2"><button className={button} onClick={() => setPreview(!preview)}>{preview ? "Hide preview" : "Split preview"}</button>
          <button className={button} onClick={() => void action(async () => { setMedia(media ? null : await editorRequest<MediaItem[]>("/api/media")); })}>Recent images</button></div>
      </div>
      <p className="text-xs text-muted-foreground">Paste or drop a screenshot into the editor. JPEG / PNG / WebP, up to 8 MiB and 16 megapixels; images are resized and compressed automatically.</p>
      {media && <div className="grid grid-cols-3 gap-3 sm:grid-cols-5" aria-label="Recent images">
        {media.length === 0 && <p className="col-span-full text-sm">No uploaded images yet.</p>}
        {media.map(image => <button key={image.id} className="rounded border p-2 text-left" onClick={() => {
          update({ content: current.current.content + `\n![${image.name.replace(/[\[\]\\\r\n]/g, "")}](${image.url})\n` }); setMedia(null);
        }}><img src={contentUrl(image.url)} alt={image.name} loading="lazy" className="h-20 w-full object-cover" /><span className="block truncate text-xs">{image.name}</span></button>)}
      </div>}
      <div className={preview ? "grid gap-4 lg:grid-cols-2" : ""}>
        <textarea ref={textarea} aria-label="Markdown content" value={data.content} maxLength={500_000} placeholder="Write your article in Markdown…"
          className={`${field} min-h-[400px] font-mono leading-relaxed`} onChange={event => update({ content: event.target.value })}
          onPaste={event => { const file = [...event.clipboardData.files].find(item => item.type.startsWith("image/")); if (file) { event.preventDefault(); void upload(file); } }}
          onDragOver={event => { if (event.dataTransfer.types.includes("Files")) event.preventDefault(); }}
          onDrop={event => { if (event.dataTransfer.files.length) { event.preventDefault(); void upload(event.dataTransfer.files[0]); } }} />
        {preview && <div className="prose prose-sm prose-zinc dark:prose-invert min-w-0 max-w-none rounded border p-4 overflow-auto max-h-[650px]" aria-label="Markdown preview" dangerouslySetInnerHTML={{ __html: previewHtml }} />}
      </div>
    </fieldset>
    <div className="mt-5 flex flex-wrap gap-2">
      <button className={button} disabled={!ready || busy} onClick={() => void action(async () => { await flush(); finish(); })}>Save draft & close</button>
      <button className={button} disabled={!ready || busy} onClick={() => {
        const tab = window.open("about:blank", "_blank"); if (tab) tab.opener = null;
        void action(async () => { try { await flush(); if (tab) tab.location.href = withBase(`/admin/preview/${initial.id}`); else throw new Error("Allow pop-ups to open the full preview."); } catch (failure) { tab?.close(); throw failure; } });
      }}>Full-page preview</button>
      <button className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground disabled:opacity-50" disabled={!ready || busy} onClick={() => void publish()}>{initial.postId ? "Publish changes" : "Publish article"}</button>
      <button className={`${button} text-destructive ml-auto`} disabled={!ready || busy} onClick={() => {
        if (confirm("Discard this working draft? The published article and its history will stay unchanged.")) void action(async () => {
          await queue.current.catch(() => {});
          await editorRequest(draftPath, "DELETE", { version: server.current.version }); finish();
        });
      }}>Discard draft</button>
    </div>
    {initial.postId && <details className="mt-6 border-t pt-4" onToggle={event => {
      const open = event.currentTarget.open; setHistoryOpen(open);
      if (open) void editorRequest<Revision[]>(draftPath + "/history").then(setHistory).catch(failure => setError(failure.message));
    }}>
      <summary className="cursor-pointer text-sm font-medium">Version history · up to 30 saved article versions</summary>
      {historyOpen && <div className="mt-3 space-y-3">
        <div className="flex flex-wrap gap-2">{history.map(item => <button key={item.id} className={button} disabled={busy || !ready} onClick={() => void action(async () => {
          setRevision(await editorRequest<Revision>(draftPath + `/history?revision=${item.id}`));
        })}>v{item.version} · {new Date(item.savedAt).toLocaleString()}</button>)}</div>
        {revision?.data && <div className="rounded border p-3">
          <p className="mb-2 text-sm">Version {revision.version}: {revision.data.title}</p>
          <div className="grid gap-3 md:grid-cols-2">
            <label className="text-sm">Working draft<textarea readOnly className={`${field} h-48 font-mono`} value={data.content} /></label>
            <label className="text-sm">Selected version<textarea readOnly className={`${field} h-48 font-mono`} value={revision.data.content} /></label>
          </div>
          <button className={`${button} mt-3`} disabled={busy || !ready} onClick={() => {
            if (confirm("Replace the working draft with this historical version? It will not be published until you choose Publish changes.")) void action(async () => {
              const saved = await flush();
              adopt(await editorRequest<EditorDraft>(draftPath + "/history", "POST", { version: saved.version, revisionId: revision.id }));
              setRevision(null); toast.success("Version restored to your working draft");
            });
          }}>Restore into draft</button>
        </div>}
      </div>}
    </details>}
  </section>;
}
