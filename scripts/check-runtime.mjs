import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

export function supportedRuntime(version = process.versions.node) {
  const [major, minor, patch] = version.split('.').map(Number);
  const minimum = { 22: [23,4], 24: [22,1], 26: [12,1] }[major];
  return Boolean(minimum && (minor > minimum[0] || (minor === minimum[0] && patch >= minimum[1])));
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url && !supportedRuntime()) {
  console.error('Use a supported patched Node release: 22.23.4+, 24.22.1+ (recommended), or 26.12.1+ within that major.');
  process.exitCode = 1;
}
