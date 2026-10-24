import { sqlite } from "./index";
import { HttpError } from "../lib/http-error";
export function reserveSlug(slug: string, postId?: number, oldSlug?: string) {
  const alias = sqlite
    .prepare("SELECT postId FROM post_aliases WHERE slug=?")
    .get(slug) as { postId: number } | undefined;
  if (alias && alias.postId !== postId)
    throw new HttpError(
      409,
      "This address is reserved by an existing article redirect.",
    );
  if (postId && oldSlug && oldSlug !== slug) {
    sqlite
      .prepare("DELETE FROM post_aliases WHERE slug=? AND postId=?")
      .run(slug, postId);
    sqlite
      .prepare("INSERT OR REPLACE INTO post_aliases(slug,postId) VALUES (?,?)")
      .run(oldSlug, postId);
  }
}
export function resolveAlias(slug: string) {
  return sqlite
    .prepare(
      "SELECT p.slug FROM post_aliases a JOIN posts p ON p.id=a.postId WHERE a.slug=? AND p.draft=0 AND p.deletedAt IS NULL",
    )
    .get(slug) as { slug: string } | undefined;
}
