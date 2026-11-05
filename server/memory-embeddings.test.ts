import { rmSync } from "node:fs";
import { beforeEach, describe, expect, it } from "vitest";

import { DATA_DIR } from "./config.ts";
import { closeMessageDb, memoryBigrams, searchMemoryBigram, type MemoryHit } from "./message-db.ts";
import { cosine, mergeRanked } from "./memory-embeddings.ts";
import { ensureWorkspace, syncMemoryIndex, writeMemoryTopic } from "./workspace.ts";

beforeEach(() => {
  closeMessageDb();
  rmSync(DATA_DIR, { recursive: true, force: true });
});

const hit = (file: string): MemoryHit => ({ file, snippet: file, at: 0 });

describe("Chinese bigrams", () => {
  it("splits a run into overlapping pairs and keeps latin words whole", () => {
    expect(memoryBigrams("拿铁 latte")).toEqual(["拿铁", "latte"]);
    expect(memoryBigrams("燕麦奶")).toEqual(["燕麦", "麦奶"]);
  });

  it("ranks a memory file by shared pairs where unicode61 finds nothing", () => {
    const bot = "bigram-bot";
    ensureWorkspace(bot);
    writeMemoryTopic(bot, "coffee.md", "---\ntitle: 咖啡\n---\n- 只喝燕麦奶拿铁，不加糖\n");
    writeMemoryTopic(bot, "finance.md", "---\ntitle: 财务\n---\n- 信用卡每月 18 号还款\n");
    syncMemoryIndex(bot);
    expect(searchMemoryBigram(bot, "拿铁", 3)[0]?.file).toBe("memory/coffee.md");
    expect(searchMemoryBigram(bot, "还款日", 3)[0]?.file).toBe("memory/finance.md");
  });
});

describe("rank fusion", () => {
  it("keeps one copy per file and lets two lists outvote one", () => {
    const merged = mergeRanked([[hit("a.md"), hit("b.md")], [hit("b.md"), hit("c.md")]]);
    expect(merged.map((entry) => entry.file)).toEqual(["b.md", "a.md", "c.md"]);
  });

  it("is stable when every list is empty", () => {
    expect(mergeRanked([[], []])).toEqual([]);
  });
});

describe("cosine", () => {
  it("is 1 for identical and 0 for orthogonal vectors", () => {
    expect(cosine(Float32Array.from([1, 2]), Float32Array.from([1, 2]))).toBeCloseTo(1);
    expect(cosine(Float32Array.from([1, 0]), Float32Array.from([0, 1]))).toBeCloseTo(0);
  });
});
