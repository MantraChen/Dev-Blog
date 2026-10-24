import { createHash, randomBytes, randomUUID } from "node:crypto";
import { sqlite } from "./index";
import { getDraft } from "./editor";
import { HttpError } from "../lib/http-error";
import { editorDataSchema, type EditorData } from "../lib/editor-data";

export const builtinAssets = [
  {
    id: "builtin-tutorial",
    kind: "template",
    name: "技术教程",
    content:
      '## 解决什么问题\n\n## 运行环境与前提\n\n## 实现步骤\n\n```ts title="example.ts"\n// 示例代码\n```\n\n## 验证结果\n\n## 常见问题\n\n## 参考资料\n',
  },
  {
    id: "builtin-retrospective",
    kind: "template",
    name: "项目复盘",
    content:
      "## 目标与约束\n\n## 架构与关键决策\n\n## 遇到的问题\n\n## 结果与证据\n\n## 下次改进\n",
  },
  {
    id: "builtin-reading",
    kind: "template",
    name: "读书笔记",
    content:
      "## 书籍与阅读背景\n\n## 核心观点\n\n## 我的理解\n\n## 实践与疑问\n\n## 引用与页码\n",
  },
] as const;
export function writingAssets() {
  return [
    ...builtinAssets,
    ...(sqlite
      .prepare("SELECT * FROM writing_assets ORDER BY updatedAt DESC")
      .all() as {
      id: string;
      kind: "template" | "snippet";
      name: string;
      content: string;
    }[]),
  ];
}
export function saveAsset(input: {
  id?: string;
  kind: string;
  name: string;
  content: string;
}) {
  const id = input.id || randomUUID();
  if (
    !sqlite.prepare("SELECT 1 FROM writing_assets WHERE id=?").get(id) &&
    (
      sqlite.prepare("SELECT count(*) n FROM writing_assets").get() as {
        n: number;
      }
    ).n >= 200
  )
    throw new HttpError(409, "Keep at most 200 custom assets.");
  sqlite
    .prepare(
      "INSERT INTO writing_assets VALUES (?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET kind=excluded.kind,name=excluded.name,content=excluded.content,updatedAt=excluded.updatedAt",
    )
    .run(id, input.kind, input.name, input.content, new Date().toISOString());
  return { id };
}
export const deleteAsset = (id: string) =>
  sqlite.prepare("DELETE FROM writing_assets WHERE id=?").run(id);
const tokenHash = (token: string) =>
  createHash("sha256").update(token).digest("hex");
export function listShares(draftId: string) {
  getDraft(draftId);
  return sqlite
    .prepare(
      "SELECT id,createdAt,expiresAt FROM preview_shares WHERE draftId=? ORDER BY createdAt DESC",
    )
    .all(draftId);
}
export function createShare(draftId: string, version: number, hours: number) {
  const draft = getDraft(draftId);
  if (draft.version !== version)
    throw new HttpError(409, "Draft changed. Save and try again.");
  sqlite
    .prepare("DELETE FROM preview_shares WHERE expiresAt<=?")
    .run(new Date().toISOString());
  if (
    (
      sqlite
        .prepare("SELECT count(*) n FROM preview_shares WHERE draftId=?")
        .get(draftId) as { n: number }
    ).n >= 10 ||
    (
      sqlite.prepare("SELECT count(*) n FROM preview_shares").get() as {
        n: number;
      }
    ).n >= 200
  )
    throw new HttpError(
      409,
      "Revoke an old preview link before creating another.",
    );
  const id = randomUUID(),
    token = randomBytes(32).toString("base64url"),
    now = new Date().toISOString(),
    expiresAt = new Date(Date.now() + hours * 3600000).toISOString();
  sqlite
    .prepare("INSERT INTO preview_shares VALUES (?,?,?,?,?,?)")
    .run(
      id,
      tokenHash(token),
      draftId,
      JSON.stringify(draft.data),
      now,
      expiresAt,
    );
  return { id, token, expiresAt };
}
export const revokeShare = (id: string) =>
  sqlite.prepare("DELETE FROM preview_shares WHERE id=?").run(id);
export function readShare(
  token: string,
): { data: EditorData; expiresAt: string } | null {
  if (!/^[\w-]{43}$/.test(token)) return null;
  const row = sqlite
    .prepare(
      `SELECT s.data,s.expiresAt FROM preview_shares s JOIN post_drafts d ON d.id=s.draftId LEFT JOIN posts p ON p.id=d.postId WHERE s.tokenHash=? AND s.expiresAt>? AND (d.postId IS NULL OR p.deletedAt IS NULL)`,
    )
    .get(tokenHash(token), new Date().toISOString()) as
    { data: string; expiresAt: string } | undefined;
  return row
    ? { ...row, data: editorDataSchema.parse(JSON.parse(row.data)) }
    : null;
}
export function sharedMediaIds(data: EditorData) {
  return new Set(
    [
      ...`${data.content}\n${data.coverImage}`.matchAll(
        /\/media\/([0-9a-f-]{36})\.webp/g,
      ),
    ].map((m) => m[1]),
  );
}
export function translations(key: string | null) {
  if (!key) return [];
  return sqlite
    .prepare(
      "SELECT slug,title,language FROM posts WHERE translationKey=? AND draft=0 AND hidden=0 AND deletedAt IS NULL ORDER BY language",
    )
    .all(key) as { slug: string; title: string; language: string }[];
}
