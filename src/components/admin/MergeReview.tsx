import { useState } from "react";
import { mergeEditorData } from "@/lib/merge";
import type { EditorData } from "@/lib/editor-data";
const field = "w-full rounded border bg-transparent p-2 text-sm";
export function MergeReview({
  base,
  local,
  remote,
  onSave,
  onCancel,
}: {
  base: EditorData;
  local: EditorData;
  remote: EditorData;
  onSave: (data: EditorData) => Promise<void>;
  onCancel: () => void;
}) {
  const [result] = useState(() => mergeEditorData(base, local, remote));
  const [data, setData] = useState(result.data),
    [resolved, setResolved] = useState<string[]>([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const choose = (key: keyof EditorData, value: EditorData[typeof key]) => {
    setData((current) => ({ ...current, [key]: value }));
    setResolved((current) => [...new Set([...current, key])]);
  };
  return (
    <section
      aria-label="Merge changes"
      className="my-4 space-y-4 rounded border border-amber-500 p-4"
    >
      <h3 className="font-semibold">Review merged changes</h3>
      <p className="text-sm">
        Changes in different places were combined. Resolve each overlapping
        field before saving. Publication remains a separate step.
      </p>
      {result.conflicts.map((key) => (
        <div key={key} className="space-y-2 border-t pt-3">
          <strong>{key}</strong>
          <div className="grid gap-3 sm:grid-cols-2">
            {[
              ["My edits", local],
              ["Server version", remote],
            ].map(([label, value]) => (
              <div key={String(label)}>
                <p>{String(label)}</p>
                <pre className="max-h-48 overflow-auto whitespace-pre-wrap text-xs">
                  {String((value as EditorData)[key])}
                </pre>
                <button
                  className="rounded border px-3 py-1 text-sm"
                  onClick={() => choose(key, (value as EditorData)[key])}
                >
                  Use {String(label).toLowerCase()}
                </button>
              </div>
            ))}
          </div>
          {typeof data[key] === "string" && (
            <label className="block text-sm">
              Merged {key}
              <textarea
                className={field}
                rows={key === "content" ? 12 : 2}
                value={String(data[key])}
                onChange={(e) => choose(key, e.target.value)}
              />
            </label>
          )}
          <p className="text-xs">
            {resolved.includes(key)
              ? "Resolved"
              : "Choose a version or edit the merged value."}
          </p>
        </div>
      ))}
      {!result.conflicts.length && (
        <p className="text-sm">No overlapping changes.</p>
      )}
      <details>
        <summary>Preview merged Markdown</summary>
        <pre className="max-h-80 overflow-auto whitespace-pre-wrap text-xs">
          {data.content}
        </pre>
      </details>
      {error && <p role="alert">{error}</p>}
      <div className="flex gap-3">
        <button
          disabled={
            busy || result.conflicts.some((key) => !resolved.includes(key))
          }
          className="rounded border px-3 py-2 disabled:opacity-50"
          onClick={async () => {
            setBusy(true);
            try {
              await onSave(data);
            } catch (e) {
              setError(e instanceof Error ? e.message : "Merge failed");
            } finally {
              setBusy(false);
            }
          }}
        >
          Save merged draft
        </button>
        <button disabled={busy} onClick={onCancel}>
          Cancel
        </button>
      </div>
    </section>
  );
}
