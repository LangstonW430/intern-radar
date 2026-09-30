"use node";

import { render } from "@react-email/render";
import { v } from "convex/values";
import { createElement } from "react";
import { isEmailAllowed } from "../lib/allowlist";
import { selectDigestItems, shouldSendDigest } from "../lib/digestSelect";
import {
  FEEDBACK_TOKEN_TTL_MS,
  signFeedbackToken,
} from "../lib/feedbackToken";
import DigestEmail, { type DigestEmailItem } from "../emails/Digest";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { internalAction, type ActionCtx } from "./_generated/server";
import { sendEmail } from "./lib/resendClient";

interface DigestProfile {
  userId: Id<"users">;
  email: string;
  threshold: number;
  frequency: "instant" | "daily" | "weekly";
  wildcards: number;
  lastDigestAt: number | undefined;
}

interface DigestEnv {
  now: number;
  force: boolean;
  secret: string;
  appUrl: string;
  siteUrl: string;
}

/** Hourly tick: sends to every profile whose frequency window is open. */
export const tick = internalAction({
  args: { force: v.optional(v.boolean()) },
  handler: async (ctx, { force }) => {
    const secret = process.env.FEEDBACK_SIGNING_SECRET;
    const appUrl = process.env.APP_URL;
    const siteUrl = process.env.CONVEX_SITE_URL;
    if (!secret || !appUrl || !siteUrl) {
      console.warn(
        "digest: FEEDBACK_SIGNING_SECRET, APP_URL, and CONVEX_SITE_URL must be set — skipping",
      );
      return;
    }
    const env: DigestEnv = {
      now: Date.now(),
      force: force ?? false,
      secret,
      appUrl,
      siteUrl,
    };

    const profiles = await ctx.runQuery(internal.digestData.listProfiles, {});
    for (const profile of profiles) {
      try {
        await sendForProfile(ctx, profile as DigestProfile, env);
      } catch (error) {
        // One user's failure must not block the others' digests.
        console.error(`digest: failed for ${profile.email}`, error);
      }
    }
  },
});

async function sendForProfile(
  ctx: ActionCtx,
  profile: DigestProfile,
  env: DigestEnv,
): Promise<void> {
  // Only allowlisted users ever receive email.
  if (!isEmailAllowed(profile.email, process.env.ALLOWED_EMAILS)) {
    console.warn(`digest: ${profile.email} not on allowlist, skipping`);
    return;
  }
  if (
    !env.force &&
    !shouldSendDigest(profile.frequency, profile.lastDigestAt, env.now)
  ) {
    return;
  }

  const candidates = await ctx.runQuery(internal.digestData.candidates, {
    userId: profile.userId,
    since: profile.lastDigestAt,
  });
  const { top, wildcards } = selectDigestItems(candidates, {
    threshold: profile.threshold,
    wildcards: profile.wildcards,
    random: Math.random,
  });
  if (top.length === 0) return; // nothing above threshold → no digest

  const selected = [
    ...top.map((c) => ({ ...c, wildcard: false })),
    ...wildcards.map((c) => ({ ...c, wildcard: true })),
  ];

  const items: DigestEmailItem[] = [];
  for (const row of selected) {
    const link = async (kind: string) => {
      const token = await signFeedbackToken(
        {
          userId: profile.userId,
          listingId: row.listingId,
          kind,
          exp: env.now + FEEDBACK_TOKEN_TTL_MS,
        },
        env.secret,
      );
      return `${env.siteUrl}/feedback/redeem?token=${encodeURIComponent(token)}`;
    };
    items.push({
      title: row.title,
      company: row.company,
      locations: row.locations,
      url: row.url,
      score: row.score,
      hasJd: row.hasJd,
      wildcard: row.wildcard,
      appliedLink: await link("applied"),
      upLink: await link("thumbs_up"),
      downLink: await link("thumbs_down"),
    });
  }

  const html = await render(
    createElement(DigestEmail, {
      items,
      matchesUrl: `${env.appUrl}/matches`,
    }),
  );
  await sendEmail({
    to: profile.email,
    subject: `${top.length} internship match${top.length === 1 ? "" : "es"} for you`,
    html,
  });
  await ctx.runMutation(internal.digestData.markSent, {
    userId: profile.userId,
    matchIds: selected.map((c) => c.matchId),
    explorationIds: wildcards.map((c) => c.matchId),
    now: env.now,
  });
  console.log(
    `digest: sent ${top.length}+${wildcards.length} to ${profile.email}`,
  );
}
