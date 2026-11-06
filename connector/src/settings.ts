// Names, paths and limits the connector, install.sh and the e2e share. install.sh repeats the names it needs, and a
// test holds them equal.

export const CONNECTOR_VERSION = "1.0.0";

/** Docker objects the connector owns. */
export const NAMES = {
  connector: "entropybot-connector",
  connectorNext: "entropybot-connector-next",
  home: "entropybot-home",
  dataVolume: "entropybot-data",
  stateVolume: "entropybot-connector",
  snapshotVolume: "entropybot-snapshot",
  backupPrefix: "entropybot-backup-",
} as const;

export const LABELS = {
  role: "com.entropybot.role",
  instance: "com.entropybot.instance",
  created: "com.entropybot.created",
  image: "com.entropybot.image",
  env: "com.entropybot.env",
} as const;

/** Backups the connector keeps; a newer one replaces the oldest. */
export const BACKUPS_KEPT = 3;

/** Inside the connector's container. */
export const PATHS = {
  state: process.env.ENTROPYBOT_STATE_DIR || "/state",
  docker: process.env.ENTROPYBOT_DOCKER_SOCKET || "/var/run/docker.sock",
  /** /etc/entropybot on the host, mounted read-only: the seccomp profile install.sh put there. */
  hostConfig: process.env.ENTROPYBOT_HOST_CONFIG_DIR || "/etc/entropybot",
  /** The connector's own copies, which install.sh installs from this image. */
  profiles: process.env.ENTROPYBOT_PROFILES_DIR || "/app/profiles",
} as const;

export const SECCOMP_FILE = "seccomp-omb-home.json";
export const APPARMOR_PROFILE = "omb-home-narrow";

/** Where the home's edge listens on the server: loopback only, reached by the tunnel and by the connector. */
export const HOME_PORT = 8080;

/**
 * On a stock Docker host the bot box needs our AppArmor and seccomp profiles and no masked /proc paths; the home needs
 * Docker's init, shared memory for Chrome, time to stop cleanly (its launcher kills its children at 20 s), and only the
 * four capabilities its root launcher uses. No --privileged, no added capability, no restart policy: the connector
 * restarts the home.
 */
export const HOME_CAPABILITIES = ["CHOWN", "SETUID", "SETGID", "KILL"] as const;
export const HOME_STOP_TIMEOUT_S = 30;
export const HOME_SHM_BYTES = 512 * 1024 * 1024;
export const HOME_OOM_SCORE_ADJ = -800;

/** The first home image whose launcher clears another container's data-directory lease itself. */
export const LEASE_FIXED_VERSION = [0, 1, 131] as const;

export function envSeconds(name: string, fallback: number, min: number, max: number): number {
  const raw = process.env[name];
  const value = raw === undefined ? NaN : Number(raw);
  return Number.isInteger(value) && value >= min && value <= max ? value : fallback;
}
