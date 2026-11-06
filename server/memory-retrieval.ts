import type { DatabaseSync } from "node:sqlite";

export interface MemoryDocument {
  path: string;
  mtimeMs: number;
  text: string;
}

export interface MemoryVectorRow {
  path: string;
  hash: string;
  dim: number;
  vector: Uint8Array;
}

export interface MemoryFileStat {
  path: string;
  mtimeMs: number;
  bytes: number;
}

export interface MemoryHit {
  file: string;
  snippet: string;
  at: number;
}

export function ensureMemoryVectors(database: DatabaseSync): void {
  database.exec(`
    -- Optional semantic recall: one row per memory file and embedding model.
    CREATE TABLE IF NOT EXISTS memory_vectors (
      bot_id TEXT NOT NULL,
      path TEXT NOT NULL,
      model TEXT NOT NULL,
      dim INTEGER NOT NULL,
      hash TEXT NOT NULL,
      vector BLOB NOT NULL,
      updated_at INTEGER NOT NULL,
      PRIMARY KEY (bot_id, path, model)
    );
  `);
}

export function createMemoryRetrieval(db: () => DatabaseSync) {

  /** Every indexed memory file with its text, for the local bigram fallback and for vector staleness checks. */
  function memoryFileDocuments(botId: string): MemoryDocument[] {
    const rows = db()
      .prepare("SELECT path, mtime_ms, text FROM memory_files WHERE bot_id = ?")
      .all(botId) as Array<{ path: string; mtime_ms: number; text: string }>;
    return rows.map((row) => ({ path: row.path, mtimeMs: row.mtime_ms, text: row.text }));
  }

  function memoryVectorRows(botId: string, model: string): MemoryVectorRow[] {
    const rows = db()
      .prepare("SELECT path, hash, dim, vector FROM memory_vectors WHERE bot_id = ? AND model = ?")
      .all(botId, model) as Array<{ path: string; hash: string; dim: number; vector: Uint8Array }>;
    return rows.map((row) => ({ path: row.path, hash: row.hash, dim: row.dim, vector: row.vector }));
  }

  function upsertMemoryVector(botId: string, path: string, model: string, hash: string, vector: Float32Array): void {
    db()
      .prepare(
        "INSERT INTO memory_vectors (bot_id, path, model, dim, hash, vector, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?) " +
          "ON CONFLICT(bot_id, path, model) DO UPDATE SET dim = excluded.dim, hash = excluded.hash, vector = excluded.vector, updated_at = excluded.updated_at",
      )
      .run(botId, path, model, vector.length, hash, new Uint8Array(vector.buffer, vector.byteOffset, vector.byteLength), Date.now());
  }

  function clearMemoryVectors(botId: string): void {
    db().prepare("DELETE FROM memory_vectors WHERE bot_id = ?").run(botId);
  }

  const CJK_RUN = /[\u3400-\u9fff]+|[a-z0-9]+/gi;

  /** Chinese has no spaces: overlapping two-character runs are the unit FTS5's unicode61 cannot provide. */
  function memoryBigrams(text: string): string[] {
    const out: string[] = [];
    for (const run of text.toLowerCase().match(CJK_RUN) ?? []) {
      if (/^[\u3400-\u9fff]/.test(run)) {
        if (run.length === 1) out.push(run);
        for (let i = 0; i < run.length - 1; i += 1) out.push(run.slice(i, i + 2));
      } else if (run.length > 1) {
        // A single latin letter is noise ("c++" must not match every file with a c).
        out.push(run);
      }
    }
    return out;
  }

  interface BigramDoc {
    path: string;
    mtimeMs: number;
    grams: Map<string, number>;
    text: string;
  }

  const bigramCache = new Map<string, { stamp: string; docs: BigramDoc[] }>();

  function bigramDocs(botId: string): BigramDoc[] {
    const files = memoryFileDocuments(botId);
    const stamp = files.map((file) => `${file.path}:${file.mtimeMs}:${file.text.length}`).join("|");
    const cached = bigramCache.get(botId);
    if (cached?.stamp === stamp) return cached.docs;
    const docs = files.map((file) => {
      const text = withoutFrontmatter(file.text);
      const grams = new Map<string, number>();
      for (const gram of memoryBigrams(text)) grams.set(gram, (grams.get(gram) ?? 0) + 1);
      return { path: file.path, mtimeMs: file.mtimeMs, grams, text };
    });
    bigramCache.set(botId, { stamp, docs });
    return docs;
  }

  /** Topic frontmatter is matched by aliases elsewhere; folding it into bigrams would rank a file on its metadata. */
  function withoutFrontmatter(text: string): string {
    if (!text.startsWith("---")) return text;
    const end = text.indexOf("\n---", 3);
    return end === -1 ? text : text.slice(end + 4).replace(/^\n/, "");
  }

  /** A line that shares the most bigrams with the query; falls back to the head of the file. */
  function memorySnippet(text: string, query: Set<string>): string {
    text = withoutFrontmatter(text);
    let best = "";
    let bestScore = 0;
    for (const line of text.split("\n")) {
      let score = 0;
      for (const gram of new Set(memoryBigrams(line))) if (query.has(gram)) score += 1;
      if (score > bestScore) {
        bestScore = score;
        best = line;
      }
    }
    const chosen = bestScore > 0 ? best : text;
    return chosen.replace(/\s+/g, " ").trim().slice(0, 400);
  }

  /** Local fallback used when no embedding endpoint is configured or reachable. */
  function searchMemoryBigram(botId: string, query: string, limit = 12): MemoryHit[] {
    const docs = bigramDocs(botId);
    if (!docs.length) return [];
    // FTS deliberately skips punctuation-only terms, so "-10" and "c++" keep matching nothing here too.
    const queryGrams = new Set(memoryBigrams(query).filter((gram) => /[a-z\u3400-\u9fff]/.test(gram)));
    if (!queryGrams.size) return [];
    const df = new Map<string, number>();
    for (const doc of docs) for (const gram of doc.grams.keys()) if (queryGrams.has(gram)) df.set(gram, (df.get(gram) ?? 0) + 1);
    const n = docs.length;
    const idf = (gram: string) => Math.log((n + 1) / ((df.get(gram) ?? 0) + 1)) + 1;
    const scored = docs.map((doc) => {
      let dot = 0;
      for (const gram of queryGrams) dot += (doc.grams.get(gram) ?? 0) * idf(gram);
      const norm = Math.sqrt([...doc.grams].reduce((sum, [gram, count]) => sum + (count * idf(gram)) ** 2, 0)) || 1;
      return { doc, score: dot / norm };
    });
    return scored
      .filter((row) => row.score > 0)
      .sort((a, b) => b.score - a.score || b.doc.mtimeMs - a.doc.mtimeMs)
      .slice(0, limit)
      .map((row) => ({ file: row.doc.path, at: row.doc.mtimeMs, snippet: memorySnippet(row.doc.text, queryGrams) }));
  }

  return { memoryFileDocuments, memoryVectorRows, upsertMemoryVector, clearMemoryVectors, memoryBigrams, memorySnippet, searchMemoryBigram };
}
