import { BASE_PATH } from "./site-path";
export const READER_KEY = `howielog:reader:${BASE_PATH || "root"}`;
export type Bookmark = {
  id: number;
  slug: string;
  title: string;
  savedAt: string;
};
export function readBookmarks(): Bookmark[] {
  try {
    const value = JSON.parse(
      localStorage.getItem(READER_KEY + ":bookmarks") || "[]",
    );
    return Array.isArray(value)
      ? value
          .filter(
            (item) =>
              Number.isSafeInteger(item?.id) &&
              /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(item.slug) &&
              typeof item.title === "string" &&
              typeof item.savedAt === "string",
          )
          .slice(0, 100)
      : [];
  } catch {
    return [];
  }
}
export function writeBookmarks(items: Bookmark[]) {
  localStorage.setItem(
    READER_KEY + ":bookmarks",
    JSON.stringify(items.slice(0, 100)),
  );
}
