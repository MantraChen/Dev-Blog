import React, { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";

export function StatusesPanel() {
  const [isLoading, setIsLoading] = useState(true);
  const [items, setItems] = useState<any[]>([]);
  const [text, setText] = useState("");

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/statuses?limit=50");
      if (res.ok) setItems(await res.json());
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    try {
      const res = await fetch("/api/statuses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      if (!res.ok) throw new Error();
      toast.success("Status posted");
      setText("");
      load();
    } catch {
      toast.error("Failed to post status");
    }
  };

  const remove = async (id: number) => {
    if (!confirm("Delete this status?")) return;
    try {
      const res = await fetch(`/api/statuses/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      toast.success("Status deleted");
      load();
    } catch {
      toast.error("Failed to delete status");
    }
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

      {isLoading ? (
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="flex gap-4 items-center">
              <div className="h-4 bg-muted rounded animate-pulse flex-1" />
              <div className="h-4 bg-muted rounded animate-pulse w-24" />
              <div className="h-4 bg-muted rounded animate-pulse w-16" />
            </div>
          ))}
        </div>
      ) : (
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
      )}
    </div>
  );
}
