import fs from "node:fs";
import path from "node:path";

/** The workspace directory for this launch, moving a legacy default into place once. */
export function desktopDataDirFor(home, override) {
  if (override) return override;
  const dir = path.join(home, ".entropybot");
  const legacy = path.join(home, ".openmausbot");
  if (!fs.existsSync(dir) && fs.existsSync(legacy)) {
    try { fs.renameSync(legacy, dir); } catch {}
  }
  return dir;
}
