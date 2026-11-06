import { beforeEach, expect, it, vi } from "vitest";

const fixture = vi.hoisted(() => ({ handlers: new Map(), open: vi.fn(), loadVendor: vi.fn() }));
vi.mock("electron", () => ({
  app: { isPackaged: true, getVersion: () => "0.2.0", getPath: () => "/unused", hide: vi.fn() },
  clipboard: {},
  ipcMain: { handle: (name, handler) => fixture.handlers.set(name, handler) },
  shell: { openExternal: fixture.open },
}));
vi.mock("node:module", () => ({ createRequire: () => fixture.loadVendor }));

beforeEach(() => {
  vi.resetModules();
  fixture.handlers.clear();
  vi.clearAllMocks();
});

it("never loads a binary updater or arms a download/install timer in manual mode", async () => {
  vi.useFakeTimers();
  try {
    const updater = await import("./updater.mjs");
    updater.startUpdater({ watch: () => { throw new Error("quiet install must not start"); } });
    updater.registerUpdaterIpc({ pageAllowed: () => true });
    const state = fixture.handlers.get("update:get-state")({});
    expect(state.mode).toBe("manual");
    expect(state.releasesUrl).toBe("https://github.com/Ashersun1207/entropybot/releases");
    expect(fixture.loadVendor).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
    expect(updater.reopenedOutOfSight()).toBe(false);
    expect(() => fixture.handlers.get("update:install")({})).toThrow(/GitHub Releases/);
  } finally {
    vi.useRealTimers();
  }
});

it("only an authorized window can open the fixed release URL", async () => {
  const updater = await import("./updater.mjs");
  updater.registerUpdaterIpc({ pageAllowed: (event) => event.trusted === true });
  expect(() => fixture.handlers.get("update:check")({ trusted: false })).toThrow(/only available/);
  expect(fixture.open).not.toHaveBeenCalled();
  await fixture.handlers.get("update:check")({ trusted: true });
  expect(fixture.open).toHaveBeenCalledExactlyOnceWith("https://github.com/Ashersun1207/entropybot/releases");
});
