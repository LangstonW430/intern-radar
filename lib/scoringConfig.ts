import { z } from "zod";
import scoringJson from "../shared/scoring.json";

/**
 * shared/scoring.json is the single source of truth for every tunable
 * constant in the keyword-weight scoring model.
 */

const scoringConfigSchema = z.object({
  version: z.number().int().positive(),
  comment: z.string().optional(),
  positionWeights: z.object({
    title: z.number().positive(),
    qualifications: z.number().positive(),
    body: z.number().positive(),
  }),
  // Keyword initial weights from interests; avoid is deliberately stronger
  // than want. Hard interests stay in the filters, ignore contributes nothing.
  initialWeights: z.object({
    want: z.object({ strong: z.number(), soft: z.number() }),
    avoid: z.object({ strong: z.number(), soft: z.number() }),
  }),
  weightClamp: z.tuple([z.number(), z.number()]),
});

export type ScoringConfig = z.infer<typeof scoringConfigSchema>;

export const SCORING_CONFIG: ScoringConfig =
  scoringConfigSchema.parse(scoringJson);
