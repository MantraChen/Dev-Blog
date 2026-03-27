import React, { useState, useEffect, useCallback } from "react";

type Tab = "projects" | "statuses" | "skills" | "timeline";

export function AdminApp() {
  const [activeTab, setActiveTab] = useState<Tab>("projects");

  const tabs: { value: Tab; label: string }[] = [
    { value: "projects", label: "Projects" },
    { value: "statuses", label: "Statuses" },
    { value: "skills", label: "Skills" },
    { value: "timeline", label: "Timeline" },
  ];

  return (
    <div>
      <div className="flex border-b mb-6">
        {tabs.map((tab) => (
          <button
            key={tab.value}
            onClick={() => setActiveTab(tab.value)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === tab.value
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === "projects" && <ProjectsPanel />}
      {activeTab === "statuses" && <StatusesPanel />}
      {activeTab === "skills" && <SkillsPanel />}
      {activeTab === "timeline" && <TimelinePanel />}
    </div>
  );
}

// ─── Projects ────────────────────────────────────────────────────────

function ProjectsPanel() {
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

// ─── Statuses ────────────────────────────────────────────────────────

function StatusesPanel() {
  const [items, setItems] = useState<any[]>([]);
  const [text, setText] = useState("");

  const load = useCallback(async () => {
    const res = await fetch("/api/statuses?limit=50");
    setItems(await res.json());
  }, []);

  useEffect(() => { load(); }, [load]);

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    await fetch("/api/statuses", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
    setText("");
    load();
  };

  const remove = async (id: number) => {
    await fetch(`/api/statuses/${id}`, { method: "DELETE" });
    load();
  };

  return (
    <div>
      <h2 className="text-lg font-semibold mb-4">Statuses</h2>
      <form onSubmit={add} className="flex gap-2 mb-6">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="What are you up to?"
          className="flex h-9 flex-1 rounded-md border bg-transparent px-3 text-sm"
        />
        <button type="submit" className="text-sm px-3 py-1.5 rounded-md bg-primary text-primary-foreground hover:bg-primary/90">
          Post
        </button>
      </form>
      <div className="space-y-2">
        {items.map((s) => (
          <div key={s.id} className="flex items-center justify-between border rounded-lg px-4 py-2">
            <div>
              <p className="text-sm">{s.text}</p>
              <time className="text-xs text-muted-foreground">{new Date(s.createdAt).toLocaleString()}</time>
            </div>
            <button onClick={() => remove(s.id)} className="text-xs px-2 py-1 rounded border text-destructive hover:bg-destructive/10">Delete</button>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Skills ──────────────────────────────────────────────────────────

function SkillsPanel() {
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

// ─── Timeline ────────────────────────────────────────────────────────

function TimelinePanel() {
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
