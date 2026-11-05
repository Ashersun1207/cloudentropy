// Optional semantic recall over memory files. Off unless config.memoryEmbedding.enabled:
// enabling it sends memory text to the configured endpoint, so it stays an explicit choice.
import { createHash } from "node:crypto";
import type { AppConfig } from "./config.ts";
import {
  memoryBigrams,
  memoryFileDocuments,
  memorySnippet,
  memoryVectorRows,
  upsertMemoryVector,
  type MemoryHit,
} from "./message-db.ts";

const DEFAULT_URL = "https://dashscope.aliyuncs.com/compatible-mode/v1/embeddings";
const DEFAULT_MODEL = "text-embedding-v4";
const DEFAULT_DIMENSIONS = 1024;
const DEFAULT_TIMEOUT_MS = 4_000;
const BATCH = 10;
/** Bound the first turn's latency; anything beyond this is indexed in the background. */
const MAX_SYNC_FILES = 24;
/** Per-file cap: an oversized MEMORY.md should not send a megabyte in one request. */
const MAX_DOC_CHARS = 8_000;

export interface MemoryEmbeddingSettings {
  url: string;
  model: string;
  key: string;
  dimensions: number;
  timeoutMs: number;
}

export function memoryEmbeddingSettings(cfg: AppConfig): MemoryEmbeddingSettings | null {
  const raw = cfg.memoryEmbedding;
  if (!raw?.enabled) return null;
  const key = (raw.key ?? process.env.DASHSCOPE_API_KEY ?? "").trim();
  if (!key) return null;
  return {
    url: (raw.url ?? process.env.OMB_MEMORY_EMBEDDING_URL ?? DEFAULT_URL).replace(/\/+$/, ""),
    model: raw.model ?? process.env.OMB_MEMORY_EMBEDDING_MODEL ?? DEFAULT_MODEL,
    key,
    dimensions: raw.dimensions ?? DEFAULT_DIMENSIONS,
    timeoutMs: raw.timeoutMs ?? DEFAULT_TIMEOUT_MS,
  };
}

export function hashMemoryText(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

export function cosine(a: Float32Array, b: Float32Array): number {
  const n = Math.min(a.length, b.length);
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < n; i += 1) {
    const x = a[i]!;
    const y = b[i]!;
    dot += x * y;
    na += x * x;
    nb += y * y;
  }
  return na && nb ? dot / Math.sqrt(na * nb) : 0;
}

/** Reciprocal rank fusion: every list votes, so one retriever's weak tail cannot outrank another's head. */
export function mergeRanked(lists: readonly (readonly MemoryHit[])[], k = 60): MemoryHit[] {
  const scores = new Map<string, number>();
  const first = new Map<string, MemoryHit>();
  for (const list of lists) {
    list.forEach((hit, index) => {
      if (!first.has(hit.file)) first.set(hit.file, hit);
      scores.set(hit.file, (scores.get(hit.file) ?? 0) + 1 / (k + index + 1));
    });
  }
  return [...scores.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([file]) => first.get(file)!)
    .filter(Boolean);
}

async function embedTexts(texts: readonly string[], settings: MemoryEmbeddingSettings): Promise<Float32Array[]> {
  const response = await fetch(settings.url, {
    method: "POST",
    headers: { authorization: `Bearer ${settings.key}`, "content-type": "application/json" },
    body: JSON.stringify({ model: settings.model, input: texts, dimensions: settings.dimensions, encoding_format: "float" }),
    signal: AbortSignal.timeout(settings.timeoutMs),
  });
  if (!response.ok) throw new Error(`memory embeddings: HTTP ${response.status}`);
  const body = (await response.json()) as { data?: Array<{ index?: number; embedding?: number[] }> };
  const rows = (body.data ?? []).slice().sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
  if (rows.length !== texts.length) throw new Error("memory embeddings: unexpected response length");
  return rows.map((row) => Float32Array.from(row.embedding ?? []));
}

const indexing = new Set<string>();

/** Index stale files, bounded; the rest continues in the background so a turn is never held up by a large memory. */
export async function ensureMemoryVectors(botId: string, settings: MemoryEmbeddingSettings): Promise<void> {
  const docs = memoryFileDocuments(botId);
  if (!docs.length) return;
  const stored = new Map(memoryVectorRows(botId, settings.model).map((row) => [row.path, row.hash]));
  const stale = docs.filter((doc) => stored.get(doc.path) !== hashMemoryText(doc.text));
  if (!stale.length) return;
  const key = `${botId}:${settings.model}`;
  if (indexing.has(key)) return;
  indexing.add(key);
  const indexSome = async (files: typeof stale) => {
    for (let i = 0; i < files.length; i += BATCH) {
      const chunk = files.slice(i, i + BATCH);
      const vectors = await embedTexts(chunk.map((doc) => doc.text.slice(0, MAX_DOC_CHARS)), settings);
      chunk.forEach((doc, index) => {
        const vector = vectors[index];
        if (vector) upsertMemoryVector(botId, doc.path, settings.model, hashMemoryText(doc.text), vector);
      });
    }
  };
  try {
    await indexSome(stale.slice(0, MAX_SYNC_FILES));
    if (stale.length > MAX_SYNC_FILES) void indexSome(stale.slice(MAX_SYNC_FILES)).catch(() => {});
  } finally {
    indexing.delete(key);
  }
}

export async function semanticMemoryHits(
  botId: string,
  query: string,
  settings: MemoryEmbeddingSettings,
  limit = 12,
): Promise<MemoryHit[]> {
  await ensureMemoryVectors(botId, settings);
  const [queryVector] = await embedTexts([query.slice(0, 500)], settings);
  if (!queryVector?.length) return [];
  const docs = memoryFileDocuments(botId);
  if (!docs.length) return [];
  const texts = new Map(docs.map((doc) => [doc.path, doc.text]));
  const grams = new Set(memoryBigrams(query));
  const scored: Array<{ hit: MemoryHit; score: number }> = [];
  for (const row of memoryVectorRows(botId, settings.model)) {
    const text = texts.get(row.path);
    if (!text || row.dim !== queryVector.length) continue;
    // Copy: a BLOB's bytes are not guaranteed to be 4-byte aligned for a Float32 view.
    const vector = new Float32Array(row.vector.slice().buffer);
    scored.push({
      hit: { file: row.path, at: docs.find((doc) => doc.path === row.path)?.mtimeMs ?? Date.now(), snippet: memorySnippet(text, grams) },
      score: cosine(queryVector, vector),
    });
  }
  return scored
    .filter((row) => row.score > 0.2)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((row) => row.hit);
}
