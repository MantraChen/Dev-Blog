import React, { useState, useEffect, useCallback } from "react";

export function ProjectsPanel() {
  const [items, setItems] = useState<any[]>([]);
  const [editing, setEditing] = useState<any | null>(null);
  const [showForm, setShowForm] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch("/api/projects");
    setItems(await res.json());
  }, []);

  useEffect(() => { load(); }, [load]);

  const save = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const body = {
      name: fd.get("name") as string,
      description: fd.get("description") as string,
      techStack: (fd.get("techStack") as string).split(",").map((s) => s.trim()).filter(Boolean),
      demoUrl: (fd.get("demoUrl") as string) || null,
      repoUrl: (fd.get("repoUrl") as string) || null,
      sortOrder: Number(fd.get("sortOrder")) || 0,
    };

    if (editing) {
      await fetch(`/api/projects/${editing.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    } else {
      await fetch("/api/projects", {
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
    if (!confirm("Delete this project?")) return;
    await fetch(`/api/projects/${id}`, { method: "DELETE" });
    load();
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-lg font-semibold">Projects</h2>
        <button
          onClick={() => { setEditing(null); setShowForm(!showForm); }}
          className="text-sm px-3 py-1.5 rounded-md bg-primary text-primary-foreground hover:bg-primary/90"
        >
          {showForm ? "Cancel" : "Add Project"}
        </button>
      </div>

      {showForm && (
        <form onSubmit={save} className="border rounded-lg p-4 mb-6 space-y-3">
          <input name="name" placeholder="Name" defaultValue={editing?.name || ""} required className="flex h-9 w-full rounded-md border bg-transparent px-3 text-sm" />
          <textarea name="description" placeholder="Description" defaultValue={editing?.description || ""} required className="flex min-h-[80px] w-full rounded-md border bg-transparent px-3 py-2 text-sm" />
          <input name="techStack" placeholder="Tech stack (comma separated)" defaultValue={editing?.techStack?.join(", ") || ""} className="flex h-9 w-full rounded-md border bg-transparent px-3 text-sm" />
          <input name="demoUrl" placeholder="Demo URL" defaultValue={editing?.demoUrl || ""} className="flex h-9 w-full rounded-md border bg-transparent px-3 text-sm" />
          <input name="repoUrl" placeholder="Repo URL" defaultValue={editing?.repoUrl || ""} className="flex h-9 w-full rounded-md border bg-transparent px-3 text-sm" />
          <input name="sortOrder" type="number" placeholder="Sort order" defaultValue={editing?.sortOrder || 0} className="flex h-9 w-32 rounded-md border bg-transparent px-3 text-sm" />
          <button type="submit" className="text-sm px-3 py-1.5 rounded-md bg-primary text-primary-foreground hover:bg-primary/90">
            {editing ? "Update" : "Create"}
          </button>
        </form>
      )}

      <table className="w-full text-sm">
        <thead>
          <tr className="border-b">
            <th className="text-left py-2 font-medium">Name</th>
            <th className="text-left py-2 font-medium">Description</th>
            <th className="text-right py-2 font-medium">Actions</th>
          </tr>
        </thead>
        <tbody>
          {items.map((p) => (
            <tr key={p.id} className="border-b">
              <td className="py-2 font-medium">{p.name}</td>
              <td className="py-2 text-muted-foreground truncate max-w-[200px]">{p.description}</td>
              <td className="py-2 text-right space-x-2">
                <button onClick={() => { setEditing(p); setShowForm(true); }} className="text-xs px-2 py-1 rounded border hover:bg-accent">Edit</button>
                <button onClick={() => remove(p.id)} className="text-xs px-2 py-1 rounded border text-destructive hover:bg-destructive/10">Delete</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
