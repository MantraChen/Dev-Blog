import { withBase, BASE_PATH } from "./site-path";
import { editorDataSchema, type EditorData } from "./editor-data";

export class EditorRequestError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
export async function editorRequest<T>(path: string, method = "GET", data?: unknown): Promise<T> {
  const response = await fetch(withBase(path), { method,
    ...(data === undefined ? {} : { headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) }) });
  let result;
  try { result = await response.json(); }
  catch { throw new EditorRequestError(response.status, `The server returned an unreadable response (${response.status}). Please retry; your working copy is unchanged.`); }
  if (!response.ok) throw new EditorRequestError(response.status, result.error || "Request failed");
  return result as T;
}

export const RECOVERY_PREFIX = `howielog:editor:${BASE_PATH || "root"}:`;
export const BEFORE_EDITOR_LOGOUT = "howielog:editor:before-logout";
export const EDITOR_LOGOUT = "howielog:editor:logout";
export function recoveryKey(id: string) {
  let tab = "current";
  try {
    tab = sessionStorage.getItem(RECOVERY_PREFIX + "tab") || crypto.randomUUID();
    sessionStorage.setItem(RECOVERY_PREFIX + "tab", tab);
  } catch {}
  return RECOVERY_PREFIX + id + ":" + tab;
}
export function readRecovery(key: string): { data: EditorData; savedAt: string } | null {
  try {
    const cached = JSON.parse(localStorage.getItem(key) || "null");
    const parsed = editorDataSchema.safeParse(cached?.data);
    return parsed.success && typeof cached.savedAt === "string" ? { data: parsed.data, savedAt: cached.savedAt } : null;
  } catch { return null; }
}
export function clearEditorRecovery() {
  // Stop pending saves/unload handlers from recreating recovery data after logout.
  window.dispatchEvent(new Event(EDITOR_LOGOUT));
  try {
    localStorage.setItem(RECOVERY_PREFIX + "logout", crypto.randomUUID());
    for (const key of Object.keys(localStorage)) if (key.startsWith(RECOVERY_PREFIX)) localStorage.removeItem(key);
  } catch {}
}
