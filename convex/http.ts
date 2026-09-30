import { httpRouter } from "convex/server";
import {
  embeddingsImportSchema,
  jdImportSchema,
  labelsImportSchema,
  modelImportSchema,
} from "../lib/schemas/mlPayloads";
import { seedProfilePayloadSchema } from "../lib/schemas/profileSeed";
import { internal } from "./_generated/api";
import { httpAction } from "./_generated/server";
import { auth } from "./auth";

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
    if (kind === "training") {
      return json(await ctx.runQuery(internal.ml.exportTraining, {}));
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
    const rows = await ctx.runQuery(internal.labels.exportLabelCandidates, {
      email,
      count: Number(url.searchParams.get("count")) || undefined,
    });
    return json({ rows });
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

http.route({
  path: "/ml/import/model",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    if (!isAuthorized(request)) {
      return new Response("Unauthorized", { status: 401 });
    }
    const parsed = modelImportSchema.safeParse(await request.json());
    if (!parsed.success) {
      return json({ issues: parsed.error.issues }, 400);
    }
    const result = await ctx.runMutation(internal.ml.importModel, parsed.data);
    return json(result);
  }),
});

export default http;
