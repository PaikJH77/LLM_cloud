import { platform, arch, release } from "node:os";
import { createHash } from "node:crypto";
import { readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
if (
  platform() !== "win32" ||
  arch() !== "x64" ||
  Number(release().split(".")[2]) < 22000
) {
  console.error(
    "BLOCKED: actual Windows 11 x64 is required. Linux builds/tests cannot validate installation, updates or DPAPI.",
  );
  process.exit(2);
}
const root = "apps/desktop/out/make";
const files = await readdir(root, { recursive: true });
const artifacts = [];
for (const file of files) {
  if (/\.(exe|nupkg)$/.test(file)) {
    const path = join(root, file);
    artifacts.push({
      path,
      sha256: createHash("sha256")
        .update(await readFile(path))
        .digest("hex"),
    });
  }
}
if (!artifacts.length) {
  console.error("No Windows installer artifacts. Run npm run make:win first.");
  process.exit(2);
}
await writeFile(
  "docs/verification/windows-artifacts.json",
  JSON.stringify(
    {
      platform: platform(),
      arch: arch(),
      release: release(),
      createdAt: new Date().toISOString(),
      artifacts,
      manualAcceptance: "NOT_PERFORMED",
    },
    null,
    2,
  ),
);
console.log(
  "Checksums recorded; manual acceptance is still NOT_PERFORMED. Follow docs/windows-verification.md.",
);
