import { httpRouter } from "convex/server";
import { seedProfilePayloadSchema } from "../lib/schemas/profileSeed";
import { internal } from "./_generated/api";
import { httpAction } from "./_generated/server";
import { auth } from "./auth";

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

export default http;
