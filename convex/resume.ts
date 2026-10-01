"use node";

import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { action } from "./_generated/server";

/**
 * Extracts text from an uploaded resume PDF, then deletes the PDF
 * immediately — only the extracted text ever persists (see /privacy).
 */
export const processResume = action({
  args: { storageId: v.id("_storage") },
  handler: async (ctx, { storageId }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Not signed in");

    const blob = await ctx.storage.get(storageId);
    if (!blob) throw new Error("Upload not found");
    try {
      const bytes = new Uint8Array(await blob.arrayBuffer());
      const { extractText, getDocumentProxy } = await import("unpdf");
      const pdf = await getDocumentProxy(bytes);
      const { text } = await extractText(pdf, { mergePages: true });
      const cleaned = text.replace(/\s+/g, " ").trim();
      if (!cleaned) {
        throw new Error("No extractable text found in that PDF");
      }
      const resumeText = cleaned.slice(0, 50_000);
      const { extractSkills } = await import("../lib/jdExtract");
      return { resumeText, detectedSkills: extractSkills(resumeText) };
    } finally {
      // The PDF is gone whether extraction succeeded or not.
      await ctx.storage.delete(storageId);
    }
  },
});
