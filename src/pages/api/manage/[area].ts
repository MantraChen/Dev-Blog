import { z } from "zod";
import { adminEndpoint, body } from "@/lib/admin-endpoint";
import { HttpError } from "@/lib/http-error";
import {
  trashList,
  restoreTrash,
  purgeTrash,
  seriesList,
  saveSeries,
  seriesChapters,
  reorderSeries,
  mediaLibrary,
  deleteMedia,
  listSchedules,
  scheduleDraft,
  cancelSchedule,
  getNow,
  saveNow,
  brokenLinks,
} from "@/db/content";
import {
  backupList,
  backupCreate,
  backupInspect,
  backupRestore,
  backupSettings,
  setDailyBackup,
} from "@/lib/backups";
const slug = z
  .string()
  .regex(/^[\p{L}\p{N}][\p{L}\p{N} _.-]*$/u)
  .max(100);
export const GET = adminEndpoint(async ({ params, url }) => {
  switch (params.area) {
    case "trash":
      return Response.json(trashList());
    case "series":
      return Response.json(
        url.searchParams.has("slug")
          ? seriesChapters(url.searchParams.get("slug")!, true)
          : seriesList(),
      );
    case "library":
      return Response.json(
        mediaLibrary(
          (url.searchParams.get("q") || "").slice(0, 100),
          Math.max(
            1,
            Math.min(100000, Number(url.searchParams.get("page")) || 1),
          ),
        ),
      );
    case "schedules":
      return Response.json(listSchedules());
    case "now":
      return Response.json(getNow());
    case "links":
      return Response.json(brokenLinks());
    case "backups":
      return Response.json({
        items: await backupList(),
        settings: backupSettings(),
      });
    default:
      throw new HttpError(404, "Unknown management area");
  }
});
export const POST = adminEndpoint(async ({ params, request }) => {
  switch (params.area) {
    case "trash": {
      const input = await body(
        request,
        z.object({
          action: z.enum(["restore", "purge"]),
          id: z.number().int().positive(),
        }),
      );
      return Response.json(
        input.action === "restore"
          ? restoreTrash(input.id)
          : purgeTrash(input.id),
      );
    }
    case "series": {
      const input = await body(
        request,
        z.discriminatedUnion("action", [
          z.object({
            action: z.literal("save"),
            slug,
            title: z.string().trim().min(1).max(200),
            description: z.string().max(4000),
          }),
          z.object({
            action: z.literal("reorder"),
            slug,
            ids: z.array(z.number().int().positive()).max(2000),
          }),
        ]),
      );
      return Response.json(
        input.action === "save"
          ? saveSeries(input)
          : reorderSeries(input.slug, input.ids),
      );
    }
    case "library": {
      const input = await body(request, z.object({ id: z.uuid() }));
      return Response.json(await deleteMedia(input.id));
    }
    case "schedules": {
      const input = await body(
        request,
        z.discriminatedUnion("action", [
          z.object({
            action: z.literal("schedule"),
            id: z.uuid(),
            version: z.number().int().positive(),
            at: z.iso.datetime({ offset: true }),
          }),
          z.object({ action: z.literal("cancel"), id: z.uuid() }),
        ]),
      );
      return Response.json(
        input.action === "schedule"
          ? scheduleDraft(input.id, input.version, input.at)
          : cancelSchedule(input.id),
      );
    }
    case "now": {
      const input = await body(
        request,
        z.object({ content: z.string().max(100000) }),
      );
      return Response.json(saveNow(input.content));
    }
    case "backups": {
      const input = await body(
        request,
        z.discriminatedUnion("action", [
          z.object({ action: z.literal("create") }),
          z.object({ action: z.literal("inspect"), id: z.uuid() }),
          z.object({
            action: z.literal("restore"),
            id: z.uuid(),
            confirmation: z.uuid(),
            hash: z.string().regex(/^[a-f0-9]{64}$/),
          }),
          z.object({ action: z.literal("configure"), enabled: z.boolean() }),
        ]),
      );
      try {
        if (input.action === "create")
          return Response.json(await backupCreate());
        if (input.action === "inspect")
          return Response.json(await backupInspect(input.id));
        if (input.action === "configure")
          return Response.json(setDailyBackup(input.enabled));
        if (input.confirmation !== input.id)
          throw new HttpError(
            400,
            "Type the backup ID to confirm restoration.",
          );
        return Response.json(await backupRestore(input.id, input.hash));
      } catch (error) {
        if (error instanceof HttpError) throw error;
        console.error(
          "Backup operation failed",
          error instanceof Error ? error.name : "unknown",
        );
        throw new HttpError(
          400,
          "Backup operation failed. Check integrity, application version, disk space and permissions. Current content is preserved if validation fails.",
        );
      }
    }
    default:
      throw new HttpError(404, "Unknown management area");
  }
});
