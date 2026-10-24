import { marked } from "marked";
import { sqlite } from "../db";
import { getDraft } from "../db/editor";
import { createPostSchema } from "./validation";
import { extractPostLinks } from "../../scripts/content-links.mjs";
import { checkExternalLinks } from "./external-links";
import { HttpError } from "./http-error";

export interface PreflightIssue {
  severity: "error" | "warning";
  message: string;
}
export async function preflight(id: string, version: number, external = false) {
  const draft = getDraft(id),
    data = draft.data,
    issues: PreflightIssue[] = [];
  if (draft.version !== version)
    throw new HttpError(409, "Draft changed. Save and check again.");
  const add = (message: string, severity: "error" | "warning" = "warning") =>
    issues.push({ severity, message });
  const parsed = createPostSchema.safeParse({
    ...data,
    tags: data.tags
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
    coverImage: data.coverImage || null,
    series: data.series || null,
    draft: false,
  });
  if (!parsed.success)
    for (const issue of parsed.error.issues)
      add(`${issue.path.join(".")}: ${issue.message}`, "error");
  if (!data.description.trim())
    add("Add a summary for search results and sharing.");
  if (!data.coverImage)
    add("No cover image. A generated title card will be used for sharing.");
  if (!data.content.trim()) add("The article body is empty.");
  if (data.hidden)
    add(
      "This article is unlisted and will not appear in feeds, search or translation links.",
    );
  if (
    sqlite
      .prepare(
        "SELECT 1 FROM posts WHERE slug=? AND id!=? UNION SELECT 1 FROM post_aliases WHERE slug=? AND postId!=?",
      )
      .get(data.slug, draft.postId || 0, data.slug, draft.postId || 0)
  )
    add("This slug is already used by an article or redirect.", "error");
  if (
    sqlite
      .prepare(
        "SELECT 1 FROM posts WHERE title=? AND id!=? AND deletedAt IS NULL",
      )
      .get(data.title, draft.postId || 0)
  )
    add("Another article already uses this title.");
  if (
    data.translationKey &&
    sqlite
      .prepare(
        "SELECT 1 FROM posts WHERE translationKey=? AND language=? AND id!=? AND deletedAt IS NULL",
      )
      .get(data.translationKey, data.language, draft.postId || 0)
  )
    add(
      "This translation group already has an article in the selected language.",
      "error",
    );
  const urls = new Set<string>();
  let missingAlt = 0;
  marked.walkTokens(marked.lexer(data.content), (token) => {
    if (token.type === "image" && !token.text.trim()) missingAlt++;
    if (
      (token.type === "link" || token.type === "image") &&
      /^https?:\/\//.test(token.href)
    )
      urls.add(token.href);
  });
  if (missingAlt)
    add(`${missingAlt} Markdown image(s) need descriptive alternative text.`);
  for (const slug of extractPostLinks(data.content)) {
    const target = sqlite
      .prepare(
        "SELECT draft,deletedAt FROM posts WHERE slug=? UNION SELECT p.draft,p.deletedAt FROM post_aliases a JOIN posts p ON p.id=a.postId WHERE a.slug=?",
      )
      .get(slug, slug) as
      { draft: number; deletedAt: string | null } | undefined;
    if (!target || target.draft || target.deletedAt)
      add(`Internal link is unavailable: ${slug}`);
  }
  let links: Awaited<ReturnType<typeof checkExternalLinks>> = [];
  if (external) {
    try {
      links = await checkExternalLinks([...urls]);
    } catch {
      throw new HttpError(
        409,
        "Another external link check is running. Try again shortly.",
      );
    }
    for (const result of links)
      if (result.status !== "ok")
        add(
          `External link ${result.status}${result.code ? ` (${result.code})` : ""}: ${result.url}`,
        );
    if (urls.size > 20)
      add("Only the first 20 unique external links were checked.");
  }
  return {
    version: draft.version,
    issues,
    links,
    externalCount: urls.size,
    checkedAt: new Date().toISOString(),
  };
}
