import { z } from "zod";

/**
 * The profile seed file (profile.seed.json, gitignored) is external input —
 * everything crosses this schema before touching Convex.
 */

export const strengthSchema = z.enum(["hard", "strong", "soft", "ignore"]);
export type Strength = z.infer<typeof strengthSchema>;

export const workModeSchema = z.enum(["remote", "hybrid", "onsite"]);
export type WorkMode = z.infer<typeof workModeSchema>;

// Mirrors the Simplify source categories (decision D2 in PLAN.md).
export const roleCategorySchema = z.enum([
  "ai_ml_data",
  "swe",
  "hardware",
  "product",
  "quant",
]);
export type RoleCategory = z.infer<typeof roleCategorySchema>;

export const sponsorshipNeedSchema = z.enum([
  "needs_sponsorship",
  "no_sponsorship_needed",
]);

export const classYearSchema = z.enum([
  "freshman",
  "sophomore",
  "junior",
  "senior",
  "masters",
  "phd",
]);

export const degreeLevelSchema = z.enum(["bachelors", "masters", "phd"]);

export const preferenceSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("location"),
    value: z.object({
      places: z.array(z.string().min(1)).min(1),
      radiusMiles: z.number().positive().optional(),
    }),
    strength: strengthSchema,
  }),
  z.object({
    type: z.literal("workMode"),
    value: z.array(workModeSchema).min(1),
    strength: strengthSchema,
  }),
  z.object({
    type: z.literal("roleCategory"),
    value: z.array(roleCategorySchema).min(1),
    strength: strengthSchema,
  }),
  z.object({
    type: z.literal("sponsorship"),
    value: sponsorshipNeedSchema,
    strength: strengthSchema,
  }),
  z.object({
    type: z.literal("classYear"),
    value: z.literal("exclude_mismatched"),
    strength: strengthSchema,
  }),
  z.object({
    type: z.literal("degreeLevel"),
    value: z.literal("exclude_mismatched"),
    strength: strengthSchema,
  }),
  z.object({
    type: z.literal("excludeCompanies"),
    value: z.array(z.string()),
    strength: strengthSchema,
  }),
]);
export type Preference = z.infer<typeof preferenceSchema>;

export const profileSeedSchema = z.object({
  email: z.email(),
  gradDate: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "expected YYYY-MM"),
  classYear: classYearSchema,
  degreeLevel: degreeLevelSchema,
  resumePath: z.string().default("private/resume.pdf"),
  digest: z.object({
    frequency: z.enum(["instant", "daily", "weekly"]),
    threshold: z.number().min(0).max(1),
    wildcards: z.number().int().min(0).max(10),
  }),
  preferences: z.array(preferenceSchema),
});
export type ProfileSeed = z.infer<typeof profileSeedSchema>;

/** What the seed-profile endpoint accepts: the seed plus extracted resume text. */
export const seedProfilePayloadSchema = profileSeedSchema
  .omit({ resumePath: true })
  .extend({ resumeText: z.string().min(1).optional() });
export type SeedProfilePayload = z.infer<typeof seedProfilePayloadSchema>;
