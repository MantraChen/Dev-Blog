import React, { useState, useEffect, useCallback } from "react";

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .trim();
}

export function BlogPanel() {
  const [items, setItems] = useState<any[]>([]);
  const [editing, setEditing] = useState<any | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [preview, setPreview] = useState(false);
  const [previewHtml, setPreviewHtml] = useState("");
  const [content, setContent] = useState("");
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [autoSlug, setAutoSlug] = useState(true);
  const [coverImage, setCoverImage] = useState("");

  const load = useCallback(async () => {
    const res = await fetch("/api/posts");
    if (res.ok) setItems(await res.json());
  }, []);

  useEffect(() => { load(); }, [load]);

  // Auto-generate slug from title
  useEffect(() => {
    if (autoSlug && !editing) {
      setSlug(slugify(title));
    }
  }, [title, autoSlug, editing]);

  const startEdit = (post: any) => {
    setEditing(post);
    setTitle(post.title);
    setSlug(post.slug);
    setContent(post.content);
    setAutoSlug(false);
    setCoverImage(post.coverImage || "");
    setShowForm(true);
    setPreview(false);
  };

  const startNew = () => {
    setEditing(null);
    setTitle("");
    setSlug("");
    setContent("");
    setAutoSlug(true);
    setCoverImage("");
    setShowForm(!showForm);
    setPreview(false);
  };

  const save = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const body = {
      title,
      slug,
      description: fd.get("description") as string,
      content,
      tags: (fd.get("tags") as string).split(",").map((s) => s.trim()).filter(Boolean),
      featured: fd.get("featured") === "on",
      draft: fd.get("draft") === "on",
      publishedAt: (fd.get("publishedAt") as string) || new Date().toISOString(),
      coverImage: coverImage || null,
    };

    if (editing) {
      await fetch(`/api/posts/${editing.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    } else {
      await fetch("/api/posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    }
    setEditing(null);
    setShowForm(false);
    setContent("");
    setTitle("");
    setSlug("");
    setCoverImage("");
    load();
  };

  const remove = async (id: number) => {
    if (!confirm("Delete this post?")) return;
    await fetch(`/api/posts/${id}`, { method: "DELETE" });
    load();
  };

  const toggleDraft = async (post: any) => {
    await fetch(`/api/posts/${post.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ draft: !post.draft }),
    });
    load();
  };

  // Simple markdown to HTML for preview (basic conversion)
  const renderPreview = useCallback(async () => {
    // Use a simple client-side conversion for preview
    let html = content
      // Code blocks
      .replace(/```(\w*)\n([\s\S]*?)```/g, '<pre><code class="language-$1">$2</code></pre>')
      // Headings
      .replace(/^### (.+)$/gm, '<h3>$1</h3>')
      .replace(/^## (.+)$/gm, '<h2>$1</h2>')
      .replace(/^# (.+)$/gm, '<h1>$1</h1>')
      // Bold / italic
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      // Inline code
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      // Links
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>')
      // Lists
      .replace(/^- (.+)$/gm, '<li>$1</li>')
      // Paragraphs
      .replace(/\n\n/g, '</p><p>')
      .replace(/^(?!<[hlopu])/gm, '');
    html = `<p>${html}</p>`.replace(/<p><\/p>/g, '');
    setPreviewHtml(html);
  }, [content]);

  useEffect(() => {
    if (preview) renderPreview();
  }, [preview, content, renderPreview]);

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-lg font-semibold">Blog Posts</h2>
        <button
          onClick={startNew}
          className="text-sm px-3 py-1.5 rounded-md bg-primary text-primary-foreground hover:bg-primary/90"
        >
          {showForm ? "Cancel" : "New Post"}
        </button>
      </div>

      {showForm && (
        <form onSubmit={save} className="border rounded-lg p-4 mb-6 space-y-3">
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="text-xs text-muted-foreground">Title</label>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Post title"
                required
                className="flex h-9 w-full rounded-md border bg-transparent px-3 text-sm"
              />
            </div>
            <div className="flex-1">
              <label className="text-xs text-muted-foreground">
                Slug
                {!editing && (
                  <button
                    type="button"
                    onClick={() => setAutoSlug(!autoSlug)}
                    className="ml-2 text-[10px] text-muted-foreground/60 hover:text-muted-foreground"
                  >
                    [{autoSlug ? "auto" : "manual"}]
                  </button>
                )}
              </label>
              <input
                value={slug}
                onChange={(e) => { setSlug(e.target.value); setAutoSlug(false); }}
                placeholder="post-url-slug"
                required
                className="flex h-9 w-full rounded-md border bg-transparent px-3 text-sm font-mono"
              />
            </div>
          </div>

          <div>
            <label className="text-xs text-muted-foreground">Description</label>
            <input
              name="description"
              placeholder="Brief description (for SEO/previews)"
              defaultValue={editing?.description || ""}
              className="flex h-9 w-full rounded-md border bg-transparent px-3 text-sm"
            />
          </div>

          <div>
            <label className="text-xs text-muted-foreground">Cover Image URL</label>
            <div className="flex gap-2">
              <input
                value={coverImage}
                onChange={(e) => setCoverImage(e.target.value)}
                placeholder="https://example.com/image.jpg"
                className="flex h-9 w-full rounded-md border bg-transparent px-3 text-sm"
              />
              {coverImage && (
                <button
                  type="button"
                  onClick={() => setCoverImage("")}
                  className="text-xs px-2 py-1 rounded border text-destructive hover:bg-destructive/10 shrink-0"
                >
                  Clear
                </button>
              )}
            </div>
            {coverImage && (
              <div className="mt-2 rounded-md overflow-hidden border">
                <img src={coverImage} alt="Cover preview" className="w-full h-32 object-cover" />
              </div>
            )}
          </div>

          <div className="flex gap-3">
            <div className="flex-1">
              <label className="text-xs text-muted-foreground">Tags (comma separated)</label>
              <input name="tags" placeholder="rust, concurrency" defaultValue={editing?.tags?.join(", ") || ""} className="flex h-9 w-full rounded-md border bg-transparent px-3 text-sm" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Published date</label>
              <input name="publishedAt" type="date" defaultValue={editing?.publishedAt?.split("T")[0] || new Date().toISOString().split("T")[0]} className="flex h-9 rounded-md border bg-transparent px-3 text-sm" />
            </div>
          </div>

          <div className="flex gap-4 items-center">
            <label className="flex items-center gap-2 text-sm">
              <input name="draft" type="checkbox" defaultChecked={editing ? editing.draft : true} />
              Draft
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input name="featured" type="checkbox" defaultChecked={editing?.featured || false} />
              Featured
            </label>
          </div>

          {/* Editor with preview toggle */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs text-muted-foreground">Content (Markdown)</label>
              <button
                type="button"
                onClick={() => setPreview(!preview)}
                className="text-xs px-2 py-0.5 rounded border hover:bg-accent"
              >
                {preview ? "Edit" : "Preview"}
              </button>
            </div>
            {preview ? (
              <div className="min-h-[300px] max-h-[500px] overflow-auto rounded-md border p-4 prose prose-sm prose-zinc dark:prose-invert max-w-none" dangerouslySetInnerHTML={{ __html: previewHtml }} />
            ) : (
              <textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="Write your post in Markdown..."
                className="flex min-h-[300px] w-full rounded-md border bg-transparent px-3 py-2 text-sm font-mono leading-relaxed"
              />
            )}
          </div>

          <button type="submit" className="text-sm px-3 py-1.5 rounded-md bg-primary text-primary-foreground hover:bg-primary/90">
            {editing ? "Update" : "Create"}
          </button>
        </form>
      )}

      <table className="w-full text-sm">
        <thead>
          <tr className="border-b">
            <th className="text-left py-2 font-medium">Title</th>
            <th className="text-left py-2 font-medium">Slug</th>
            <th className="text-left py-2 font-medium">Status</th>
            <th className="text-left py-2 font-medium">Date</th>
            <th className="text-right py-2 font-medium">Actions</th>
          </tr>
        </thead>
        <tbody>
          {items.map((p) => (
            <tr key={p.id} className="border-b">
              <td className="py-2 font-medium">{p.title}</td>
              <td className="py-2 text-muted-foreground font-mono text-xs">{p.slug}</td>
              <td className="py-2">
                <button
                  onClick={() => toggleDraft(p)}
                  className={`text-xs px-2 py-0.5 rounded-full ${
                    p.draft
                      ? "bg-amber-500/10 text-amber-500 border border-amber-500/30"
                      : "bg-green-500/10 text-green-500 border border-green-500/30"
                  }`}
                >
                  {p.draft ? "Draft" : "Published"}
                </button>
              </td>
              <td className="py-2 text-muted-foreground text-xs">{p.publishedAt?.split("T")[0]}</td>
              <td className="py-2 text-right space-x-2">
                {!p.draft && (
                  <a href={`/blog/${p.slug}`} target="_blank" rel="noreferrer" className="text-xs px-2 py-1 rounded border hover:bg-accent inline-block">View</a>
                )}
                <button onClick={() => startEdit(p)} className="text-xs px-2 py-1 rounded border hover:bg-accent">Edit</button>
                <button onClick={() => remove(p.id)} className="text-xs px-2 py-1 rounded border text-destructive hover:bg-destructive/10">Delete</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {items.length === 0 && (
        <p className="text-sm text-muted-foreground text-center py-8">No posts yet. Create your first one above.</p>
      )}
    </div>
  );
}
