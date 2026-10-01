import { z } from "zod";

/** bge-small-en-v1.5 output size; the Python job asserts the same value. */
export const EMBEDDING_DIM = 384;

/** Import batches are capped to keep individual mutations small (PLAN.md D8). */
export const IMPORT_BATCH_MAX = 100;

export const jdImportSchema = z.object({
  items: z
    .array(
      z.object({
        listingId: z.string(),
        jdStatus: z.enum(["fetched", "failed", "unsupported"]),
        jdSource: z.string().optional(),
        jdText: z.string().min(1).optional(),
        jdError: z.string().optional(),
      }),
    )
    .max(IMPORT_BATCH_MAX),
});
export type JdImport = z.infer<typeof jdImportSchema>;

export const labelsImportSchema = z.object({
  email: z.email(),
  items: z
    .array(
      z.object({
        listingId: z.string(),
        label: z.enum(["good", "bad"]),
        reason: z.string(),
        split: z.enum(["train", "eval"]),
        hadJd: z.boolean(),
      }),
    )
    .max(300),
});
export type LabelsImport = z.infer<typeof labelsImportSchema>;

export const embeddingsImportSchema = z.object({
  items: z
    .array(
      z.object({
        listingId: z.string(),
        embedding: z.array(z.number()).length(EMBEDDING_DIM),
        embeddingVersion: z.string().min(1),
      }),
    )
    .max(IMPORT_BATCH_MAX)
    .default([]),
  resumes: z
    .array(
      z.object({
        userId: z.string(),
        embedding: z.array(z.number()).length(EMBEDDING_DIM),
      }),
    )
    .max(20)
    .default([]),
});
export type EmbeddingsImport = z.infer<typeof embeddingsImportSchema>;
