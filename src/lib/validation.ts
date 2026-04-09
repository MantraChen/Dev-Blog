import { z } from "zod";

// ─── Shared Helpers ─────────────────────────────────────────────────

/** Parse a route param as a positive integer, or return null */
export function parseId(raw: string | undefined): number | null {
  const id = parseInt(raw || "", 10);
  return Number.isInteger(id) && id > 0 ? id : null;
}

const httpUrl = z
  .string()
  .url()
  .refine((u) => u.startsWith("http://") || u.startsWith("https://"), {
    message: "URL must start with http:// or https://",
  });

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
  tags: z.array(z.string().max(50)).max(20).default([]),
  featured: z.boolean().default(false),
  draft: z.boolean().default(true),
  publishedAt: z.string().max(50).default(() => new Date().toISOString()),
});

export const updatePostSchema = createPostSchema.partial();

// ─── Projects ───────────────────────────────────────────────────────

export const createProjectSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().min(1).max(2000),
  techStack: z.array(z.string().max(50)).max(30).default([]),
  demoUrl: httpUrl.nullable().default(null),
  repoUrl: httpUrl.nullable().default(null),
  sortOrder: z.number().int().min(0).max(10000).default(0),
});

export const updateProjectSchema = createProjectSchema.partial();

// ─── Skills ─────────────────────────────────────────────────────────

export const createSkillSchema = z.object({
  name: z.string().min(1).max(100),
  category: z.string().min(1).max(100),
  level: z.number().int().min(1).max(5).default(3),
  iconSlug: z.string().max(100).nullable().default(null),
  sortOrder: z.number().int().min(0).max(10000).default(0),
});

export const updateSkillSchema = createSkillSchema.partial();

// ─── Friends ────────────────────────────────────────────────────────

export const createFriendSchema = z.object({
  name: z.string().min(1).max(100),
  url: httpUrl,
  avatar: httpUrl.nullable().default(null),
  description: z.string().max(500).nullable().default(null),
  sortOrder: z.number().int().min(0).max(10000).default(0),
});

export const updateFriendSchema = createFriendSchema.partial();

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
  date: z.string().min(1).max(50),
  tags: z.array(z.string().max(50)).max(20).nullable().default(null),
  url: httpUrl.nullable().default(null),
  sortOrder: z.number().int().min(0).max(10000).default(0),
});

export const updateTimelineSchema = createTimelineSchema.partial();

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
  schema: z.ZodSchema<T>,
): Promise<{ success: true; data: T } | { success: false; error: string }> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return { success: false, error: "Invalid JSON body" };
  }

  const result = schema.safeParse(raw);
  if (!result.success) {
    const message = result.error.issues
      .map((i) => `${i.path.join(".")}: ${i.message}`)
      .join("; ");
    return { success: false, error: message };
  }

  return { success: true, data: result.data };
}
