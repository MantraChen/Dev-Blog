import { useMemo } from "react";
import { diffLines } from "diff";
import type { EditorData } from "@/lib/editor-data";
export function RevisionDiff({
  before,
  after,
}: {
  before: EditorData;
  after: EditorData;
}) {
  const changes = useMemo(
    () =>
      diffLines(before.content, after.content, {
        timeout: 50,
        maxEditLength: 2000,
      }),
    [before.content, after.content],
  );
  const fields = (Object.keys(after) as (keyof EditorData)[]).filter(
    (key) => key !== "content" && before[key] !== after[key],
  );
  return (
    <section
      aria-label="Version differences"
      className="my-4 space-y-3 rounded border p-3 text-sm"
    >
      <h4 className="font-semibold">
        Changes from selected version to working draft
      </h4>
      {fields.map((key) => (
        <p key={key}>
          <strong>{key}</strong>: <del>{String(before[key] ?? "")}</del> →{" "}
          <ins>{String(after[key])}</ins>
        </p>
      ))}
      {changes ? (
        <pre className="max-h-96 overflow-auto whitespace-pre-wrap break-words font-mono text-xs">
          {changes.map((change, i) => (
            <span
              key={i}
              className={
                change.added
                  ? "block bg-emerald-500/15"
                  : change.removed
                    ? "block bg-red-500/15"
                    : "block"
              }
            >
              {change.added ? "+ " : change.removed ? "− " : "  "}
              {change.value}
            </span>
          ))}
        </pre>
      ) : (
        <p>Large change: use the side-by-side bodies below to compare.</p>
      )}
    </section>
  );
}
