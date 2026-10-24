import { useEffect, useState, useCallback } from "react";
import { editorRequest } from "@/lib/editor-client";
import type { healthReport } from "@/lib/operations";
import type { securityOverview } from "@/lib/passkeys";
const btn =
  "rounded border px-3 py-2 text-sm hover:bg-accent disabled:opacity-50";
const field = "w-full rounded border bg-background px-3 py-2 text-sm";
function useData<T>(path: string) {
  const [data, setData] = useState<T | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const reload = useCallback(
    async () => setData(await editorRequest<T>(path)),
    [path],
  );
  useEffect(() => {
    void reload().catch((e) => setError(e.message));
  }, [reload]);
  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError("");
    try {
      await fn();
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Operation failed");
    } finally {
      setBusy(false);
    }
  };
  return { data, error, busy, reload, run };
}
const bytes = (n: number | null | undefined) =>
  n == null
    ? "Unavailable"
    : `${(n / 1048576).toLocaleString(undefined, { maximumFractionDigits: 1 })} MiB`;
export function OperationsPanel() {
  const r =
    useData<Awaited<ReturnType<typeof healthReport>>>("/api/operations");
  useEffect(() => {
    if (!r.data?.operation.running) return;
    const timer = setInterval(() => void r.reload().catch(() => {}), 5000);
    return () => clearInterval(timer);
  }, [r.data?.operation.running, r.reload]);
  const [settings, setSettings] = useState({
    remoteDaily: false,
    retention: false,
    localKeep: 7,
  });
  useEffect(() => {
    if (r.data) setSettings(r.data.settings);
  }, [
    r.data?.settings.remoteDaily,
    r.data?.settings.retention,
    r.data?.settings.localKeep,
  ]);
  const report = r.data;
  return (
    <section className="space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Site health & backups</h2>
        <button
          className={btn}
          disabled={r.busy}
          onClick={() => void r.run(r.reload)}
        >
          Refresh
        </button>
      </div>
      {r.error && <p role="alert">{r.error}</p>}
      {report && (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            {[
              ["Database", bytes(report.storage.databaseBytes)],
              ["SQLite WAL", bytes(report.storage.walBytes)],
              ["Media on disk", bytes(report.storage.mediaDiskBytes)],
              ["Free disk", bytes(report.storage.freeBytes)],
              ["Process memory", bytes(report.runtime.memoryBytes)],
              [
                "Full backups",
                `${report.storage.backupCount} · ${bytes(report.storage.backupBytes)}`,
              ],
            ].map(([title, value]) => (
              <div key={title} className="rounded border p-4">
                <p className="text-sm text-muted-foreground">{title}</p>
                <strong>{value}</strong>
              </div>
            ))}
          </div>
          <p className="text-sm">
            {report.runtime.platform} · Node {report.runtime.node} · Uptime{" "}
            {Math.floor(report.runtime.uptimeSeconds / 60)} minutes · Release{" "}
            {report.runtime.release}
          </p>
          <div className="rounded border p-4 text-sm">
            <p>
              Latest local backup: {report.latestBackup?.createdAt || "None"}
            </p>
            <p>Latest remote upload: {report.lastRemoteSuccess || "Never"}</p>
            <p>
              Latest full remote integrity check:{" "}
              {report.lastRemoteCheck || "Never"}
            </p>
            {report.backupError && <p role="alert">{report.backupError}</p>}
            {report.storage.freeBytes !== null &&
              report.storage.freeBytes < 1073741824 && (
                <p role="alert" className="text-destructive">
                  Less than 1 GiB of free space remains.
                </p>
              )}
          </div>
          <fieldset
            disabled={r.busy || report.operation.running}
            className="space-y-4 rounded border p-4"
          >
            <h3 className="font-semibold">Encrypted off-site backups</h3>
            <p className="text-sm">
              {report.settings.configured
                ? "Restic environment is configured. A successful upload and integrity check are needed to verify the destination."
                : "Not connected. Configure RESTIC_BINARY, RESTIC_REPOSITORY (or its file), and RESTIC_PASSWORD_FILE on the server. Initialize the repository once before using these controls."}
            </p>
            <label className="flex gap-2 text-sm">
              <input
                type="checkbox"
                checked={settings.remoteDaily}
                onChange={(e) =>
                  setSettings({ ...settings, remoteDaily: e.target.checked })
                }
              />
              Automatically upload a complete backup daily
            </label>
            <label className="flex gap-2 text-sm">
              <input
                type="checkbox"
                checked={settings.retention}
                onChange={(e) =>
                  setSettings({ ...settings, retention: e.target.checked })
                }
              />
              Automatically apply retention after successful backups
            </label>
            <label className="block text-sm">
              Keep this many automatic local backups
              <input
                type="number"
                className={field + " mt-1 max-w-32"}
                min={3}
                max={365}
                value={settings.localKeep}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    localKeep: Number(e.target.value),
                  })
                }
              />
            </label>
            <p className="text-sm">
              Manual and pre-restore safety backups are preserved. Remote
              retention keeps the latest 3 snapshots plus 7 daily, 4 weekly and
              12 monthly snapshots for this site.
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                className={btn}
                onClick={() =>
                  void r.run(() =>
                    editorRequest("/api/operations", "POST", {
                      action: "configure",
                      ...settings,
                    }),
                  )
                }
              >
                Save backup policy
              </button>
              {[
                ["backup", "Back up & upload"],
                ["check", "Verify remote data"],
                ["retention-preview", "Preview cleanup"],
                ["retention", "Apply cleanup"],
              ].map(([action, label]) => (
                <button
                  key={action}
                  className={btn}
                  disabled={
                    ["backup", "check"].includes(action) &&
                    !report.settings.configured
                  }
                  onClick={() => {
                    if (
                      action === "retention" &&
                      !confirm(
                        "Permanently remove automatic backups outside the saved retention policy? Review the cleanup preview first.",
                      )
                    )
                      return;
                    void r.run(() =>
                      editorRequest("/api/operations", "POST", { action }),
                    );
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
          </fieldset>
          <p role="status" className="text-sm">
            Operation: {report.operation.phase}
            {report.operation.running ? " · Running in background" : ""}
            {report.operation.error ? ` · ${report.operation.error}` : ""}
          </p>
          {!report.operation.running &&
            !["idle", "complete", "failed"].includes(
              report.operation.phase,
            ) && (
              <p role="alert" className="text-sm">
                The previous operation was interrupted by a restart. Check the
                destination and retry.
              </p>
            )}
          {report.retention && (
            <details>
              <summary>Cleanup preview</summary>
              <pre className="overflow-auto text-xs">
                {JSON.stringify(report.retention, null, 2)}
              </pre>
            </details>
          )}
          <section>
            <h3 className="mb-2 font-semibold">Failed publication schedules</h3>
            {!report.schedules.length && (
              <p className="text-sm">No failed schedules.</p>
            )}
            {(
              report.schedules as {
                draftId: string;
                title: string;
                error: string;
              }[]
            ).map((item) => (
              <p className="rounded border p-3 text-sm" key={item.draftId}>
                {item.title}: {item.error}
              </p>
            ))}
          </section>
        </>
      )}
    </section>
  );
}
export function SecurityPanel() {
  const r = useData<ReturnType<typeof securityOverview>>("/api/auth/passkey"),
    [password, setPassword] = useState(""),
    [name, setName] = useState("");
  return (
    <section className="space-y-5">
      <h2 className="text-xl font-semibold">Passkeys & sessions</h2>
      {r.error && <p role="alert">{r.error}</p>}
      <p className="text-sm">
        Passkeys belong to {r.data?.rpID || "the configured domain"}. Keep the
        administrator password as a recovery method. Services sharing the same
        origin must all be trusted.
      </p>
      <fieldset disabled={r.busy} className="space-y-3 rounded border p-4">
        <label className="block text-sm">
          Passkey name
          <input
            className={field}
            maxLength={100}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="My phone or security key"
          />
        </label>
        <label className="block text-sm">
          Confirm administrator password
          <input
            className={field}
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        <button
          className={btn}
          disabled={!password || !name.trim()}
          onClick={() =>
            void r.run(async () => {
              const { startRegistration } =
                await import("@simplewebauthn/browser");
              const result = await editorRequest<{
                options: Parameters<typeof startRegistration>[0]["optionsJSON"];
                challengeId: string;
              }>("/api/auth/passkey", "POST", {
                action: "register-options",
                password,
              });
              setPassword("");
              const response = await startRegistration({
                optionsJSON: result.options,
              });
              await editorRequest("/api/auth/passkey", "POST", {
                action: "register-verify",
                challengeId: result.challengeId,
                name,
                response,
              });
              setName("");
            })
          }
        >
          Register a passkey
        </button>
        <p className="text-xs">
          Registration requires the device's PIN, fingerprint or other user
          verification. Password confirmation is also required when removing a
          key.
        </p>
        {(
          r.data?.passkeys as
            | {
                id: string;
                name: string;
                createdAt: string;
                lastUsedAt: string | null;
              }[]
            | undefined
        )?.map((key) => (
          <div
            className="flex flex-wrap justify-between gap-3 border-t pt-3 text-sm"
            key={key.id}
          >
            <span>
              {key.name} · Last used{" "}
              {key.lastUsedAt
                ? new Date(key.lastUsedAt).toLocaleString()
                : "Never"}
            </span>
            <button
              className={btn}
              disabled={!password}
              onClick={() => {
                if (confirm(`Remove passkey “${key.name}”?`))
                  void r.run(async () => {
                    await editorRequest("/api/auth/passkey", "POST", {
                      action: "delete-key",
                      id: key.id,
                      password,
                    });
                    setPassword("");
                  });
              }}
            >
              Remove
            </button>
          </div>
        ))}
      </fieldset>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="font-semibold">Active sessions</h3>
        <button
          className={btn}
          disabled={r.busy}
          onClick={() =>
            void r.run(() =>
              editorRequest("/api/auth/passkey", "POST", {
                action: "revoke-sessions",
              }),
            )
          }
        >
          Sign out other devices
        </button>
      </div>
      {(
        r.data?.sessions as unknown as
          | {
              id: string;
              userAgent: string;
              createdAt: string;
              lastSeenAt: string | null;
              authMethod: string;
              current: boolean;
            }[]
          | undefined
      )?.map((session) => (
        <div key={session.id} className="space-y-2 rounded border p-3 text-sm">
          <p className="break-words">
            {session.userAgent || "Unknown device"}{" "}
            {session.current ? "· This session" : ""}
          </p>
          <p className="text-xs">
            {session.authMethod} · Last active{" "}
            {session.lastSeenAt || session.createdAt}
          </p>
          {!session.current && (
            <button
              className={btn}
              disabled={r.busy}
              onClick={() =>
                void r.run(() =>
                  editorRequest("/api/auth/passkey", "POST", {
                    action: "revoke-sessions",
                    id: session.id,
                  }),
                )
              }
            >
              Revoke session
            </button>
          )}
        </div>
      ))}
    </section>
  );
}
type Asset = {
  id: string;
  kind: "template" | "snippet";
  name: string;
  content: string;
};
export function AssetsPanel() {
  const r = useData<Asset[]>("/api/publishing/assets"),
    [asset, setAsset] = useState<Partial<Asset>>({
      kind: "template",
      name: "",
      content: "",
    });
  return (
    <section className="space-y-5">
      <h2 className="text-xl font-semibold">Writing library</h2>
      <p className="text-sm">
        Templates replace an article body after confirmation. Snippets insert at
        the cursor. Use them from Writing tools inside the article editor.
      </p>
      {r.error && <p role="alert">{r.error}</p>}
      <fieldset disabled={r.busy} className="space-y-3 rounded border p-4">
        <label className="block text-sm">
          Name
          <input
            className={field}
            maxLength={100}
            value={asset.name}
            onChange={(e) => setAsset({ ...asset, name: e.target.value })}
          />
        </label>
        <label className="block text-sm">
          Type
          <select
            className={field}
            value={asset.kind}
            onChange={(e) =>
              setAsset({ ...asset, kind: e.target.value as Asset["kind"] })
            }
          >
            <option value="template">Template</option>
            <option value="snippet">Snippet</option>
          </select>
        </label>
        <label className="block text-sm">
          Markdown
          <textarea
            className={field + " min-h-60 font-mono"}
            value={asset.content}
            maxLength={50000}
            onChange={(e) => setAsset({ ...asset, content: e.target.value })}
          />
        </label>
        <div className="flex gap-3">
          <button
            className={btn}
            disabled={!asset.name?.trim()}
            onClick={() =>
              void r.run(async () => {
                await editorRequest("/api/publishing/assets", "POST", {
                  action: "save",
                  ...asset,
                });
                setAsset({ kind: "template", name: "", content: "" });
              })
            }
          >
            Save {asset.id ? "changes" : "new asset"}
          </button>
          <button
            className={btn}
            onClick={() =>
              setAsset({ kind: "template", name: "", content: "" })
            }
          >
            Clear form
          </button>
        </div>
      </fieldset>
      {r.data?.map((item) => (
        <div
          key={item.id}
          className="flex flex-wrap items-center justify-between gap-3 rounded border p-3 text-sm"
        >
          <span>
            {item.name} · {item.kind}
          </span>
          <div className="flex gap-2">
            <button
              className={btn}
              onClick={() =>
                setAsset({
                  ...item,
                  id: item.id.startsWith("builtin-") ? undefined : item.id,
                })
              }
            >
              {item.id.startsWith("builtin-") ? "Customize a copy" : "Edit"}
            </button>
            {!item.id.startsWith("builtin-") && (
              <button
                className={btn}
                disabled={r.busy}
                onClick={() => {
                  if (confirm(`Delete “${item.name}” from the library?`))
                    void r.run(() =>
                      editorRequest("/api/publishing/assets", "POST", {
                        action: "delete",
                        id: item.id,
                      }),
                    );
                }}
              >
                Delete
              </button>
            )}
          </div>
        </div>
      ))}
    </section>
  );
}
