import { z } from "zod";
import scoringJson from "../shared/scoring.json";

/**
 * shared/scoring.json is the single source of truth for every tunable
 * constant in the keyword-weight scoring model: position weights, interest
 * initials, structural feature weights, IDF bounds, learning constants.
 */

const structuralFeatureSchema = z
  .object({
    name: z.string().min(1),
    // Weight comes from the matching preference's strength...
    strengthPref: z.string().optional(),
    // ...or is a fixed constant.
    weight: z.number().optional(),
    // enabled: false keeps a feature (embed_sim_resume) out of scoring.
    enabled: z.boolean().optional(),
  })
  .refine((f) => (f.strengthPref === undefined) !== (f.weight === undefined), {
    message: "structural feature needs exactly one of strengthPref | weight",
  });

const scoringConfigSchema = z.object({
  version: z.number().int().positive(),
  comment: z.string().optional(),
  bias: z.number(),
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
  strengthWeights: z.object({
    strong: z.number(),
    soft: z.number(),
    hard: z.number(),
    ignore: z.number(),
  }),
  structural: z.array(structuralFeatureSchema).min(1),
  // IDF for custom (out-of-vocabulary) keywords, which have no stats.
  defaultIdf: z.number().positive(),
  // Caps log((N+1)/(df+1))+1 so one ultra-rare keyword can't dominate.
  idfMax: z.number().positive(),
  noJdNeutral: z.number(),
  // Post-model freshness multiplier: 1.0 through graceDays, then halves
  // every halfLifeDays, never below floor. Fixed, never learned.
  agePenalty: z.object({
    graceDays: z.number().nonnegative(),
    halfLifeDays: z.number().positive(),
    floor: z.number().min(0).max(1),
  }),
  learning: z.object({
    learningRate: z.number().positive(),
    decay: z.number().nonnegative(),
    rareCap: z.number().positive(),
  }),
  feedbackWeights: z.object({
    applied: z.number().positive(),
    default: z.number().positive(),
  }),
});

export type ScoringConfig = z.infer<typeof scoringConfigSchema>;
export type StructuralFeatureDef = z.infer<typeof structuralFeatureSchema>;

export const SCORING_CONFIG: ScoringConfig =
  scoringConfigSchema.parse(scoringJson);

export function embedFeatureEnabled(config: ScoringConfig = SCORING_CONFIG): boolean {
  return config.structural.some(
    (f) => f.name === "embed_sim_resume" && f.enabled !== false,
  );
}
