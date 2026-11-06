import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { RELEASES_URL, UPDATE_MODE } from "../electron/update-policy.mjs";

const pkg = JSON.parse(readFileSync("package.json", "utf8"));
const tag = `cloudentropy-v${pkg.version}`;
const builder = readFileSync("electron-builder.yml", "utf8");
if (pkg.name !== "cloudentropy" || UPDATE_MODE !== "manual" || !builder.includes("appId: ai.cloudentropy.desktop") ||
    !builder.includes("owner: Ashersun1207") || !builder.includes("repo: cloudentropy")) {
  throw new Error("Release identity or update policy does not belong to cloudentropy");
}
if (process.env.GITHUB_REF_TYPE === "tag" && process.env.GITHUB_REF_NAME !== tag) {
  throw new Error(`Tag must match package version: ${tag}`);
}
if (process.argv[2] === "manifest") {
  const files = readdirSync("release").filter(name => name.startsWith(`Cloudentropy-${pkg.version}-`) && /\.(dmg|zip)$/.test(name)).sort();
  if (!["dmg", "zip"].every(ext => files.includes(`Cloudentropy-${pkg.version}-arm64.${ext}`))) {
    throw new Error("Both the Apple silicon DMG and ZIP must exist before a release is prepared");
  }
  const artifacts = files.map(name => ({ name, sha256: createHash("sha256").update(readFileSync(join("release", name))).digest("hex") }));
  writeFileSync("release/SHA256SUMS", artifacts.map(file => `${file.sha256}  ${file.name}\n`).join(""));
  writeFileSync("release/cloudentropy-build.json", JSON.stringify({
    product: pkg.name, version: pkg.version, tag,
    commit: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
    updateMode: UPDATE_MODE, releasesUrl: RELEASES_URL,
    signing: "ad-hoc; not Apple notarized", artifacts,
  }, null, 2) + "\n");
} else if (process.argv[2] !== "check") {
  throw new Error("Usage: node scripts/cloudentropy-release.mjs check|manifest");
}
console.log(`Cloudentropy ${pkg.version}: ${tag}, ${UPDATE_MODE} updates`);
