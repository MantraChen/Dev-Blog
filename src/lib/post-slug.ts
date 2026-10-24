/** Keep existing ASCII URLs while providing a stable fallback for non-Latin titles. */
export function slugifyPostTitle(title: string, fallback: string): string {
  return title.normalize("NFKC").toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim().replace(/[\s-]+/g, "-").replace(/^-+|-+$/g, "") || fallback;
}
