import React, { useState, useEffect, useCallback } from "react";

export function TimelinePanel() {
  const [items, setItems] = useState<any[]>([]);
  const [editing, setEditing] = useState<any | null>(null);
  const [showForm, setShowForm] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch("/api/timeline");
    setItems(await res.json());
  }, []);

  useEffect(() => { load(); }, [load]);

  const save = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const body = {
      title: fd.get("title") as string,
      description: fd.get("description") as string,
      type: fd.get("type") as string,
      date: fd.get("date") as string,
      tags: (fd.get("tags") as string).split(",").map((s) => s.trim()).filter(Boolean),
      url: (fd.get("url") as string) || null,
      sortOrder: Number(fd.get("sortOrder")) || 0,
    };

    if (editing) {
      await fetch(`/api/timeline/${editing.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    } else {
      await fetch("/api/timeline", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    }
    setEditing(null);
    setShowForm(false);
    load();
  };

  const remove = async (id: number) => {
    if (!confirm("Delete this entry?")) return;
    await fetch(`/api/timeline/${id}`, { method: "DELETE" });
    load();
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-lg font-semibold">Timeline</h2>
        <button
          onClick={() => { setEditing(null); setShowForm(!showForm); }}
          className="text-sm px-3 py-1.5 rounded-md bg-primary text-primary-foreground hover:bg-primary/90"
        >
          {showForm ? "Cancel" : "Add Entry"}
        </button>
      </div>

      {showForm && (
        <form onSubmit={save} className="border rounded-lg p-4 mb-6 space-y-3">
          <input name="title" placeholder="Title" defaultValue={editing?.title || ""} required className="flex h-9 w-full rounded-md border bg-transparent px-3 text-sm" />
          <textarea name="description" placeholder="Description" defaultValue={editing?.description || ""} required className="flex min-h-[80px] w-full rounded-md border bg-transparent px-3 py-2 text-sm" />
          <div className="flex gap-3">
            <select name="type" defaultValue={editing?.type || "career"} className="flex h-9 rounded-md border bg-transparent px-3 text-sm">
              <option value="career">Career</option>
              <option value="education">Education</option>
              <option value="milestone">Milestone</option>
              <option value="learning">Learning</option>
            </select>
            <input name="date" type="date" defaultValue={editing?.date || ""} required className="flex h-9 rounded-md border bg-transparent px-3 text-sm" />
            <input name="sortOrder" type="number" placeholder="Sort" defaultValue={editing?.sortOrder || 0} className="flex h-9 w-20 rounded-md border bg-transparent px-3 text-sm" />
          </div>
          <input name="tags" placeholder="Tags (comma separated)" defaultValue={editing?.tags?.join(", ") || ""} className="flex h-9 w-full rounded-md border bg-transparent px-3 text-sm" />
          <input name="url" placeholder="URL (optional)" defaultValue={editing?.url || ""} className="flex h-9 w-full rounded-md border bg-transparent px-3 text-sm" />
          <button type="submit" className="text-sm px-3 py-1.5 rounded-md bg-primary text-primary-foreground hover:bg-primary/90">
            {editing ? "Update" : "Create"}
          </button>
        </form>
      )}

      <table className="w-full text-sm">
        <thead>
          <tr className="border-b">
            <th className="text-left py-2 font-medium">Title</th>
            <th className="text-left py-2 font-medium">Type</th>
            <th className="text-left py-2 font-medium">Date</th>
            <th className="text-right py-2 font-medium">Actions</th>
          </tr>
        </thead>
        <tbody>
          {items.map((t) => (
            <tr key={t.id} className="border-b">
              <td className="py-2 font-medium">{t.title}</td>
              <td className="py-2 text-muted-foreground">{t.type}</td>
              <td className="py-2 text-muted-foreground">{t.date}</td>
              <td className="py-2 text-right space-x-2">
                <button onClick={() => { setEditing(t); setShowForm(true); }} className="text-xs px-2 py-1 rounded border hover:bg-accent">Edit</button>
                <button onClick={() => remove(t.id)} className="text-xs px-2 py-1 rounded border text-destructive hover:bg-destructive/10">Delete</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
