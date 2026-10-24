import { z } from "zod";

export const loginSchema = z.object({ password: z.string().min(1).max(1024) });

// ─── Shared Helpers ─────────────────────────────────────────────────

/** Parse a route param as a positive integer, or return null */
export function parseId(raw: string | undefined): number | null {
  if (!raw || !/^[1-9]\d*$/.test(raw)) return null;
  const id = Number(raw);
  return Number.isSafeInteger(id) ? id : null;
}

const httpUrl = z
  .url()
  .refine((u) => u.startsWith("http://") || u.startsWith("https://"), {
    message: "URL must start with http:// or https://",
  });

const tags = z.array(z.string().trim().min(1).max(50)).max(20).transform(values => [...new Set(values)]);
const publishedDate = z.union([z.iso.date(), z.iso.datetime({ offset: true })])
  .transform(value => new Date(value).toISOString());

// ─── Posts ───────────────────────────────────────────────────────────

export const createPostSchema = z.object({
  title: z.string().min(1).max(200),
  slug: z
    .string()
    .min(1)
    .max(200)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Slug must be lowercase alphanumeric with hyphens"),
  description: z.string().max(500).default(""),
  coverImage: httpUrl.nullable().default(null),
  series: z.string().max(100).nullable().default(null),
  content: z.string().max(500_000).default(""),
  tags: tags.default([]),
  featured: z.boolean().default(false),
  draft: z.boolean().default(true),
  hidden: z.boolean().default(false),
  publishedAt: publishedDate.default(() => new Date().toISOString()),
});

export const updatePostSchema = z.object({
  title: z.string().min(1).max(200),
  slug: z
    .string()
    .min(1)
    .max(200)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Slug must be lowercase alphanumeric with hyphens"),
  description: z.string().max(500),
  coverImage: httpUrl.nullable(),
  series: z.string().max(100).nullable(),
  content: z.string().max(500_000),
  tags,
  featured: z.boolean(),
  draft: z.boolean(),
  hidden: z.boolean(),
  publishedAt: publishedDate,
}).partial();

// ─── Projects ───────────────────────────────────────────────────────

export const createProjectSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().min(1).max(2000),
  techStack: z.array(z.string().max(50)).max(30).default([]),
  demoUrl: httpUrl.nullable().default(null),
  repoUrl: httpUrl.nullable().default(null),
  sortOrder: z.number().int().min(0).max(10000).default(0),
});

export const updateProjectSchema = createProjectSchema.extend({
  techStack: createProjectSchema.shape.techStack.removeDefault(),
  demoUrl: createProjectSchema.shape.demoUrl.removeDefault(),
  repoUrl: createProjectSchema.shape.repoUrl.removeDefault(),
  sortOrder: createProjectSchema.shape.sortOrder.removeDefault(),
}).partial();

// ─── Skills ─────────────────────────────────────────────────────────

export const createSkillSchema = z.object({
  name: z.string().min(1).max(100),
  category: z.string().min(1).max(100),
  level: z.number().int().min(1).max(5).default(3),
  iconSlug: z.string().max(100).nullable().default(null),
  sortOrder: z.number().int().min(0).max(10000).default(0),
});

export const updateSkillSchema = createSkillSchema.extend({
  level: createSkillSchema.shape.level.removeDefault(),
  iconSlug: createSkillSchema.shape.iconSlug.removeDefault(),
  sortOrder: createSkillSchema.shape.sortOrder.removeDefault(),
}).partial();

// ─── Friends ────────────────────────────────────────────────────────

export const createFriendSchema = z.object({
  name: z.string().min(1).max(100),
  url: httpUrl,
  avatar: httpUrl.nullable().default(null),
  description: z.string().max(500).nullable().default(null),
  sortOrder: z.number().int().min(0).max(10000).default(0),
});

export const updateFriendSchema = createFriendSchema.extend({
  avatar: createFriendSchema.shape.avatar.removeDefault(),
  description: createFriendSchema.shape.description.removeDefault(),
  sortOrder: createFriendSchema.shape.sortOrder.removeDefault(),
}).partial();

// ─── Statuses ───────────────────────────────────────────────────────

export const createStatusSchema = z.object({
  text: z.string().min(1).max(1000),
});

// ─── Timeline ───────────────────────────────────────────────────────

const timelineTypes = [
  "career",
  "education",
  "milestone",
  "learning",
  "project-completed",
  "project-in-progress",
  "project-abandoned",
] as const;

export const createTimelineSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().min(1).max(2000),
  type: z.enum(timelineTypes),
  date: z.iso.date(),
  tags: tags.nullable().default(null),
  url: httpUrl.nullable().default(null),
  sortOrder: z.number().int().min(0).max(10000).default(0),
});

export const updateTimelineSchema = createTimelineSchema.extend({
  tags: createTimelineSchema.shape.tags.removeDefault(),
  url: createTimelineSchema.shape.url.removeDefault(),
  sortOrder: createTimelineSchema.shape.sortOrder.removeDefault(),
}).partial();

// ─── Reactions ──────────────────────────────────────────────────────

export const reactionSchema = z.object({
  slug: z.string().min(1).max(200),
  emoji: z.enum(["👍", "🎉", "❤️", "🚀", "👀", "🤔"]),
});

// ─── Preview ────────────────────────────────────────────────────────

export const previewSchema = z.object({
  content: z.string().max(500_000),
});

// ─── Views ──────────────────────────────────────────────────────────

export const viewSchema = z.object({
  slug: z.string().min(1).max(200),
});

// ─── Safe JSON parse ────────────────────────────────────────────────

export async function safeParseBody<T>(
  request: Request,
  schema: z.ZodType<T>,
): Promise<{ success: true; data: T } | { success: false; error: string; status: number }> {
  if (request.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase() !== "application/json") {
    return { success: false, error: "Content-Type must be application/json", status: 415 };
  }
  const maxBytes = 1024 * 1024;
  if (Number(request.headers.get("content-length")) > maxBytes) {
    return { success: false, error: "Request body too large", status: 413 };
  }
  let raw: unknown;
  const reader = request.body?.getReader();
  try {
    if (!reader) return { success: false, error: "JSON body required", status: 400 };
    const chunks: Uint8Array[] = [];
    let bytes = 0;
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > maxBytes) {
        void reader.cancel().catch(() => {});
        return { success: false, error: "Request body too large", status: 413 };
      }
      chunks.push(chunk.value);
    }
    raw = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("Body size limit exceeded:")) {
      return { success: false, error: "Request body too large", status: 413 };
    }
    return { success: false, error: "Invalid JSON body", status: 400 };
  } finally {
    reader?.releaseLock();
  }

  const result = schema.safeParse(raw);
  if (!result.success) {
    const message = result.error.issues
      .map((i) => `${i.path.join(".")}: ${i.message}`)
      .join("; ");
    return { success: false, error: message, status: 400 };
  }

  return { success: true, data: result.data };
}
