import { httpRouter } from "convex/server";
import {
  embeddingsImportSchema,
  jdImportSchema,
  labelsImportSchema,
} from "../lib/schemas/mlPayloads";
import { z } from "zod";
import { verifyFeedbackToken } from "../lib/feedbackToken";
import {
  evaluateTurnstileVerdict,
  expectedHostnameFromAppUrl,
  type SiteverifyResponse,
} from "../lib/turnstile";
import { seedProfilePayloadSchema } from "../lib/schemas/profileSeed";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { httpAction } from "./_generated/server";
import { auth } from "./auth";

const requestCodeSchema = z.object({
  email: z.email(),
  turnstileToken: z.string().optional(),
});

const EXPORT_PAGE_SIZE = 200;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const http = httpRouter();

auth.addHttpRoutes(http);

function isAuthorized(request: Request): boolean {
  const secret = process.env.ML_SHARED_SECRET;
  if (!secret) return false;
  return request.headers.get("Authorization") === `Bearer ${secret}`;
}

http.route({
  path: "/admin/seed-profile",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    if (!isAuthorized(request)) {
      return new Response("Unauthorized", { status: 401 });
    }
    const parsed = seedProfilePayloadSchema.safeParse(await request.json());
    if (!parsed.success) {
      return new Response(JSON.stringify({ issues: parsed.error.issues }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }
    const { digest, ...seed } = parsed.data;
    const result = await ctx.runMutation(internal.profile.upsertFromSeed, {
      ...seed,
      threshold: digest.threshold,
      frequency: digest.frequency,
      wildcards: digest.wildcards,
    });
    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }),
});

http.route({
  path: "/ml/export",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    if (!isAuthorized(request)) {
      return new Response("Unauthorized", { status: 401 });
    }
    const url = new URL(request.url);
    const kind = url.searchParams.get("kind");
    const cursor = url.searchParams.get("cursor");
    const paginationOpts = {
      numItems: EXPORT_PAGE_SIZE,
      cursor: cursor ?? null,
    };

    if (kind === "jd_pending") {
      return json(
        await ctx.runQuery(internal.ml.exportJdPending, { paginationOpts }),
      );
    }
    if (kind === "embed_pending") {
      return json(
        await ctx.runQuery(internal.ml.exportEmbedPending, { paginationOpts }),
      );
    }
    if (kind === "jd_texts") {
      return json(
        await ctx.runQuery(internal.ml.exportJdTexts, { paginationOpts }),
      );
    }
    if (kind === "resumes") {
      return json({
        page: await ctx.runQuery(internal.ml.exportResumesPending, {}),
        isDone: true,
        continueCursor: null,
      });
    }
    return json({ error: `unknown kind: ${kind}` }, 400);
  }),
});

http.route({
  path: "/admin/label-candidates",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    if (!isAuthorized(request)) {
      return new Response("Unauthorized", { status: 401 });
    }
    const url = new URL(request.url);
    const email = url.searchParams.get("email");
    if (!email) return json({ error: "email required" }, 400);
    const result = await ctx.runQuery(internal.labels.exportLabelCandidates, {
      email,
      count: Number(url.searchParams.get("count")) || undefined,
    });
    return json(result);
  }),
});

http.route({
  path: "/admin/import-labels",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    if (!isAuthorized(request)) {
      return new Response("Unauthorized", { status: 401 });
    }
    const parsed = labelsImportSchema.safeParse(await request.json());
    if (!parsed.success) {
      return json({ issues: parsed.error.issues }, 400);
    }
    const result = await ctx.runMutation(
      internal.labels.importLabels,
      parsed.data,
    );
    return json(result);
  }),
});

http.route({
  path: "/ml/import/jd",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    if (!isAuthorized(request)) {
      return new Response("Unauthorized", { status: 401 });
    }
    const parsed = jdImportSchema.safeParse(await request.json());
    if (!parsed.success) {
      return json({ issues: parsed.error.issues }, 400);
    }
    const result = await ctx.runMutation(
      internal.ml.importJdBatch,
      parsed.data,
    );
    return json(result);
  }),
});

http.route({
  path: "/ml/import/embeddings",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    if (!isAuthorized(request)) {
      return new Response("Unauthorized", { status: 401 });
    }
    const parsed = embeddingsImportSchema.safeParse(await request.json());
    if (!parsed.success) {
      return json({ issues: parsed.error.issues }, 400);
    }
    const result = await ctx.runMutation(
      internal.ml.importEmbeddingsBatch,
      parsed.data,
    );
    return json(result);
  }),
});

function corsHeaders(): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": process.env.APP_URL ?? "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    Vary: "Origin",
  };
}

async function verifyTurnstile(
  token: string | undefined,
  ip: string,
): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) return true; // not configured (local dev) — skip
  if (!token) return false;
  try {
    const res = await fetch(
      "https://challenges.cloudflare.com/turnstile/v0/siteverify",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ secret, response: token, remoteip: ip }),
      },
    );
    const body = (await res.json()) as SiteverifyResponse;
    const verdict = evaluateTurnstileVerdict(body, {
      expectedHostname: expectedHostnameFromAppUrl(process.env.APP_URL),
    });
    if (!verdict.ok) {
      console.warn("turnstile rejected", verdict.reason);
    }
    return verdict.ok;
  } catch (error) {
    console.error("turnstile verify failed", error);
    return false;
  }
}

http.route({
  path: "/auth/request-code",
  method: "OPTIONS",
  handler: httpAction(async () => new Response(null, { status: 204, headers: corsHeaders() })),
});

http.route({
  path: "/auth/request-code",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const headers = { ...corsHeaders(), "Content-Type": "application/json" };
    const parsed = requestCodeSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return new Response(JSON.stringify({ error: "invalid request" }), {
        status: 400,
        headers,
      });
    }
    const email = parsed.data.email.trim().toLowerCase();
    const ip =
      request.headers.get("CF-Connecting-IP") ??
      request.headers.get("X-Forwarded-For")?.split(",")[0]?.trim() ??
      "unknown";

    if (!(await verifyTurnstile(parsed.data.turnstileToken, ip))) {
      return new Response(JSON.stringify({ error: "captcha failed" }), {
        status: 403,
        headers,
      });
    }
    const limit = await ctx.runMutation(
      internal.authGuard.checkLimitsAndIssuePermit,
      { email, ip },
    );
    if (!limit.allowed) {
      return new Response(
        JSON.stringify({ error: "too many requests, try again later" }),
        { status: 429, headers },
      );
    }
    try {
      await ctx.runAction(api.auth.signIn, {
        provider: "resend-otp",
        params: { email },
      });
    } catch (error) {
      console.error("request-code signIn failed", error);
      return new Response(JSON.stringify({ error: "could not send code" }), {
        status: 500,
        headers,
      });
    }
    return new Response(JSON.stringify({ ok: true }), { status: 200, headers });
  }),
});

http.route({
  path: "/email/unsubscribe",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    const token = new URL(request.url).searchParams.get("token");
    const secret = process.env.FEEDBACK_SIGNING_SECRET;
    const appUrl = process.env.APP_URL ?? "";
    const page = (message: string) =>
      new Response(
        `<!doctype html><meta charset="utf-8"><title>intern-radar</title>
         <body style="font-family:sans-serif;max-width:32rem;margin:4rem auto">
         <h2>intern-radar</h2><p>${message}</p>
         <p><a href="${appUrl}/settings">Email settings</a></p></body>`,
        { status: 200, headers: { "Content-Type": "text/html" } },
      );

    if (!token || !secret) return page("That unsubscribe link is invalid.");
    const payload = await verifyFeedbackToken(token, secret, Date.now());
    if (!payload || payload.kind !== "unsubscribe") {
      return page("That unsubscribe link is invalid or has expired.");
    }
    try {
      await ctx.runMutation(internal.digestData.setSubscribed, {
        userId: payload.userId as Id<"users">,
        subscribed: false,
      });
    } catch (error) {
      console.error("unsubscribe failed", error);
      return page("That unsubscribe link is invalid or has expired.");
    }
    return page(
      "You're unsubscribed from digest emails. You can re-enable them anytime in settings.",
    );
  }),
});

const FEEDBACK_KINDS = new Set([
  "applied",
  "thumbs_up",
  "thumbs_down",
  "good_suggestion",
  "bad_suggestion",
]);

http.route({
  path: "/feedback/redeem",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    const appUrl = process.env.APP_URL ?? "";
    const redirect = (params: string) =>
      new Response(null, {
        status: 302,
        headers: { Location: `${appUrl}/matches?${params}` },
      });

    const token = new URL(request.url).searchParams.get("token");
    const secret = process.env.FEEDBACK_SIGNING_SECRET;
    if (!token || !secret) return redirect("fb=invalid");
    const payload = await verifyFeedbackToken(token, secret, Date.now());
    if (!payload || !FEEDBACK_KINDS.has(payload.kind)) {
      return redirect("fb=invalid");
    }
    try {
      await ctx.runMutation(internal.digestData.recordEmailFeedback, {
        userId: payload.userId as Id<"users">,
        listingId: payload.listingId as Id<"listings">,
        kind: payload.kind as "applied",
      });
    } catch (error) {
      console.error("feedback redeem failed", error);
      return redirect("fb=invalid");
    }
    return payload.kind === "applied"
      ? redirect(`fb=ok&prompt=${payload.listingId}`)
      : redirect("fb=ok");
  }),
});

export default http;
