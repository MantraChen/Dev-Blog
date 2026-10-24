import { diffLines } from "diff";
import type { EditorData } from "./editor-data";
const lines = (s: string) => s.match(/[^\n]*\n|[^\n]+$/g) || [];
type Edit = { start: number; end: number; text: string };
function edits(base: string, next: string): Edit[] | null {
  const changes = diffLines(base, next, { timeout: 50, maxEditLength: 2000 });
  if (!changes) return null;
  const edits: Edit[] = [];
  let position = 0,
    current: Edit | undefined;
  for (const change of changes) {
    if (!change.added && !change.removed) {
      current = undefined;
      position += change.count;
      continue;
    }
    if (!current) {
      current = { start: position, end: position, text: "" };
      edits.push(current);
    }
    if (change.removed) {
      position += change.count;
      current.end = position;
    } else current.text += change.value;
  }
  return edits;
}
export function mergeText(
  base: string,
  local: string,
  remote: string,
): string | null {
  if (local === remote || remote === base) return local;
  if (local === base) return remote;
  const left = edits(base, local),
    right = edits(base, remote);
  if (!left || !right) return null;
  const combined = [...left];
  for (const edit of right) {
    let duplicate = false;
    for (const other of left) {
      if (
        edit.start === other.start &&
        edit.end === other.end &&
        edit.text === other.text
      ) {
        duplicate = true;
        break;
      }
      // Insertions at the same boundary are intentionally treated as a conflict.
      if (edit.start <= other.end && other.start <= edit.end) return null;
    }
    if (!duplicate) combined.push(edit);
  }
  const result = lines(base);
  for (const edit of combined.sort((a, b) => b.start - a.start))
    result.splice(edit.start, edit.end - edit.start, ...lines(edit.text));
  return result.join("");
}
export function mergeEditorData(
  base: EditorData,
  local: EditorData,
  remote: EditorData,
) {
  const data = { ...local },
    conflicts: (keyof EditorData)[] = [];
  for (const key of Object.keys(local) as (keyof EditorData)[]) {
    let value: unknown;
    if (local[key] === remote[key] || remote[key] === base[key])
      value = local[key];
    else if (local[key] === base[key]) value = remote[key];
    else if (key === "content")
      value = mergeText(base.content, local.content, remote.content);
    else value = null;
    if (value === null) conflicts.push(key);
    else Object.assign(data, { [key]: value });
  }
  return { data, conflicts };
}
