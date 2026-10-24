import { useEffect, useState } from "react";
import { editorRequest } from "@/lib/editor-client";
import { withBase } from "@/lib/site-path";
import type { EditorDraft } from "@/lib/editor-data";
import type { PreflightIssue } from "@/lib/preflight";
const btn = "rounded border px-3 py-2 text-sm disabled:opacity-50",
  field = "w-full rounded border bg-transparent p-2 text-sm";
type Asset = {
  id: string;
  kind: "template" | "snippet";
  name: string;
  content: string;
};
export function WritingTools({
  draftId,
  flush,
  insert,
}: {
  draftId: string;
  flush: () => Promise<EditorDraft>;
  insert: (content: string, replace: boolean) => void;
}) {
  const [assets, setAssets] = useState<Asset[]>([]),
    [selected, setSelected] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [report, setReport] = useState<{
      issues: PreflightIssue[];
      externalCount: number;
    } | null>(null),
    [link, setLink] = useState(""),
    [hours, setHours] = useState(24);
  const [shares, setShares] = useState<
    { id: string; createdAt: string; expiresAt: string }[]
  >([]);
  const reload = () =>
    editorRequest<typeof shares>(
      `/api/publishing/shares?draftId=${draftId}`,
    ).then(setShares);
  useEffect(() => {
    void editorRequest<Asset[]>("/api/publishing/assets")
      .then(setAssets)
      .catch((e) => setError(e.message));
    void reload().catch((e) => setError(e.message));
  }, [draftId]);
  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Operation failed");
    } finally {
      setBusy(false);
    }
  }
  return (
    <details className="rounded border p-3">
      <summary className="cursor-pointer text-sm font-medium">
        Writing tools · Templates, checks and private sharing
      </summary>
      <fieldset disabled={busy} className="mt-4 space-y-4">
        <div className="flex flex-wrap gap-2">
          <select
            aria-label="Writing template or snippet"
            className={field + " max-w-sm"}
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
          >
            <option value="">Choose template or snippet</option>
            {assets.map((asset) => (
              <option key={asset.id} value={asset.id}>
                {asset.kind} · {asset.name}
              </option>
            ))}
          </select>
          <button
            className={btn}
            disabled={!selected}
            onClick={() => {
              const asset = assets.find((a) => a.id === selected);
              if (asset) insert(asset.content, asset.kind === "template");
            }}
          >
            Insert
          </button>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            className={btn}
            onClick={() =>
              void run(async () => {
                const draft = await flush();
                setReport(
                  await editorRequest("/api/publishing/preflight", "POST", {
                    draftId,
                    version: draft.version,
                  }),
                );
              })
            }
          >
            Check before publishing
          </button>
          <button
            className={btn}
            onClick={() =>
              void run(async () => {
                const draft = await flush();
                setReport(
                  await editorRequest("/api/publishing/preflight", "POST", {
                    draftId,
                    version: draft.version,
                    external: true,
                  }),
                );
              })
            }
          >
            Check external links too
          </button>
        </div>
        {report && (
          <div aria-live="polite" className="space-y-1 text-sm">
            <p>
              {report.issues.length} finding(s) · {report.externalCount}{" "}
              external link(s)
            </p>
            {report.issues.map((issue, i) => (
              <p className="break-words" key={i}>
                {issue.severity === "error" ? "Error" : "Notice"}:{" "}
                {issue.message}
              </p>
            ))}
          </div>
        )}
        <div className="border-t pt-3">
          <p className="mb-2 text-sm">
            Share a saved snapshot. Anyone with the link can read it until
            expiry or revocation. Publishing or discarding the draft revokes its
            links.
          </p>
          <div className="flex flex-wrap gap-2">
            <label className="text-sm">
              Expires in{" "}
              <select
                className="rounded border bg-background p-2"
                value={hours}
                onChange={(e) => setHours(Number(e.target.value))}
              >
                <option value={1}>1 hour</option>
                <option value={24}>24 hours</option>
                <option value={168}>7 days</option>
              </select>
            </label>
            <button
              className={btn}
              onClick={() =>
                void run(async () => {
                  const draft = await flush();
                  const share = await editorRequest<{ token: string }>(
                    "/api/publishing/shares",
                    "POST",
                    {
                      action: "create",
                      draftId,
                      version: draft.version,
                      hours,
                    },
                  );
                  setLink(
                    new URL(withBase("/share/" + share.token), location.origin)
                      .href,
                  );
                  await reload();
                })
              }
            >
              Create preview link
            </button>
          </div>
          {link && (
            <label className="mt-3 block text-sm">
              Copy this link now; its token is not stored on the server.
              <input
                className={field}
                readOnly
                value={link}
                onFocus={(e) => e.target.select()}
              />
            </label>
          )}
          {shares.map((share) => (
            <div
              key={share.id}
              className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs"
            >
              <span>
                Created {new Date(share.createdAt).toLocaleString()} · Expires{" "}
                {new Date(share.expiresAt).toLocaleString()}
              </span>
              <button
                className={btn}
                onClick={() =>
                  void run(async () => {
                    await editorRequest("/api/publishing/shares", "POST", {
                      action: "revoke",
                      id: share.id,
                    });
                    setLink("");
                    await reload();
                  })
                }
              >
                Revoke link
              </button>
            </div>
          ))}
        </div>
        {busy && (
          <p role="status" className="text-sm">
            Working… External checks may take a minute.
          </p>
        )}
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
      </fieldset>
    </details>
  );
}
