import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
// npm run supplies its own entry point, including package-manager installations.
const npm =
  process.env.npm_execpath ||
  join(dirname(process.execPath), "node_modules", "npm", "bin", "npm-cli.js");
function run(args, env) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [npm, ...args], {
      env,
      stdio: "inherit",
      windowsHide: true,
    });
    child.on("error", reject);
    child.on("exit", (code) =>
      code === 0
        ? resolve()
        : reject(new Error(`npm ${args.join(" ")} failed (${code})`)),
    );
  });
}
const env = { ...process.env, ASTRO_TELEMETRY_DISABLED: "1" };
for (const command of ["check", "test", "test:scale"])
  await run(["run", command], env);
for (const [base, site] of [
  ["/", "https://howielog.com"],
  ["/howielog", "https://dyyjs.com"],
]) {
  const config = { ...env, PUBLIC_BASE_PATH: base, SITE_URL: site };
  await run(["run", "build"], config);
  await run(["run", "test:http"], config);
}
await run(["audit", "--audit-level=moderate"], env);
