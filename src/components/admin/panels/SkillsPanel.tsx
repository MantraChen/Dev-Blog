import React, { useState, useEffect, useCallback } from "react";

export function SkillsPanel() {
  const [items, setItems] = useState<any[]>([]);
  const [editing, setEditing] = useState<any | null>(null);
  const [showForm, setShowForm] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch("/api/skills");
    setItems(await res.json());
  }, []);

  useEffect(() => { load(); }, [load]);

  const save = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const body = {
      name: fd.get("name") as string,
      category: fd.get("category") as string,
      level: Number(fd.get("level")) || 3,
      iconSlug: (fd.get("iconSlug") as string) || null,
      sortOrder: Number(fd.get("sortOrder")) || 0,
    };

    if (editing) {
      await fetch(`/api/skills/${editing.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    } else {
      await fetch("/api/skills", {
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
    if (!confirm("Delete this skill?")) return;
    await fetch(`/api/skills/${id}`, { method: "DELETE" });
    load();
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-lg font-semibold">Skills</h2>
        <button
          onClick={() => { setEditing(null); setShowForm(!showForm); }}
          className="text-sm px-3 py-1.5 rounded-md bg-primary text-primary-foreground hover:bg-primary/90"
        >
          {showForm ? "Cancel" : "Add Skill"}
        </button>
      </div>

      {showForm && (
        <form onSubmit={save} className="border rounded-lg p-4 mb-6 space-y-3">
          <input name="name" placeholder="Skill name" defaultValue={editing?.name || ""} required className="flex h-9 w-full rounded-md border bg-transparent px-3 text-sm" />
          <input name="category" placeholder="Category (e.g. Languages, Frameworks)" defaultValue={editing?.category || ""} required className="flex h-9 w-full rounded-md border bg-transparent px-3 text-sm" />
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="text-xs text-muted-foreground">Level (1-5)</label>
              <input name="level" type="number" min="1" max="5" defaultValue={editing?.level || 3} className="flex h-9 w-full rounded-md border bg-transparent px-3 text-sm" />
            </div>
            <div className="flex-1">
              <label className="text-xs text-muted-foreground">Sort order</label>
              <input name="sortOrder" type="number" defaultValue={editing?.sortOrder || 0} className="flex h-9 w-full rounded-md border bg-transparent px-3 text-sm" />
            </div>
          </div>
          <input name="iconSlug" placeholder="Icon slug (optional)" defaultValue={editing?.iconSlug || ""} className="flex h-9 w-full rounded-md border bg-transparent px-3 text-sm" />
          <button type="submit" className="text-sm px-3 py-1.5 rounded-md bg-primary text-primary-foreground hover:bg-primary/90">
            {editing ? "Update" : "Create"}
          </button>
        </form>
      )}

      <table className="w-full text-sm">
        <thead>
          <tr className="border-b">
            <th className="text-left py-2 font-medium">Name</th>
            <th className="text-left py-2 font-medium">Category</th>
            <th className="text-left py-2 font-medium">Level</th>
            <th className="text-right py-2 font-medium">Actions</th>
          </tr>
        </thead>
        <tbody>
          {items.map((s) => (
            <tr key={s.id} className="border-b">
              <td className="py-2 font-medium">{s.name}</td>
              <td className="py-2 text-muted-foreground">{s.category}</td>
              <td className="py-2">{s.level}/5</td>
              <td className="py-2 text-right space-x-2">
                <button onClick={() => { setEditing(s); setShowForm(true); }} className="text-xs px-2 py-1 rounded border hover:bg-accent">Edit</button>
                <button onClick={() => remove(s.id)} className="text-xs px-2 py-1 rounded border text-destructive hover:bg-destructive/10">Delete</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
