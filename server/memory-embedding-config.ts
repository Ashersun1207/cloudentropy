import { z } from "zod";

const memoryEmbeddingSchema = z.object({
  /** Off unless enabled: memory text leaves this machine for the configured endpoint. */
  enabled: z.boolean().optional(),
  url: z.string().optional(),
  model: z.string().optional(),
  key: z.string().optional(),
  dimensions: z.number().int().min(64).max(4096).optional(),
  timeoutMs: z.number().int().min(200).max(15000).optional(),
}).strict();

export type MemoryEmbeddingConfig = z.infer<typeof memoryEmbeddingSchema>;

export function memoryEmbeddingEnv(value: MemoryEmbeddingConfig = {}): MemoryEmbeddingConfig {
  return { ...value,
    ...(process.env.DASHSCOPE_API_KEY !== undefined ? { key: process.env.DASHSCOPE_API_KEY } : {}),
    ...(process.env.OMB_MEMORY_EMBEDDING_URL !== undefined ? { url: process.env.OMB_MEMORY_EMBEDDING_URL } : {}),
    ...(process.env.OMB_MEMORY_EMBEDDING_MODEL !== undefined ? { model: process.env.OMB_MEMORY_EMBEDDING_MODEL } : {}),
  };
}

export const memoryEmbeddingShape = { memoryEmbedding: memoryEmbeddingSchema.optional() };
export interface MemoryEmbeddingHostConfig {
  /** Enabled semantic recall sends memory text to the configured endpoint. */
  memoryEmbedding?: MemoryEmbeddingConfig;
}
