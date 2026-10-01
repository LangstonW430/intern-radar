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
});

export type ScoringConfig = z.infer<typeof scoringConfigSchema>;

export const SCORING_CONFIG: ScoringConfig =
  scoringConfigSchema.parse(scoringJson);
