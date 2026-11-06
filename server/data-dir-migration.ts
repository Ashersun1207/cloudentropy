import { existsSync, renameSync } from "node:fs";

/** Moves an older default data directory into place once; a failed rename leaves both paths untouched. */
export function migrateLegacyDataDir(dir: string, candidates: readonly string[]): void {
  if (existsSync(dir)) return;
  for (const legacy of candidates) {
    if (!existsSync(legacy)) continue;
    try {
      renameSync(legacy, dir);
    } catch {
    }
    return;
  }
}
