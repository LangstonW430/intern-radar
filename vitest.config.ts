import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["lib/**/*.test.ts", "convex/**/*.test.ts", "scripts/**/*.test.ts"],
    passWithNoTests: true,
  },
});
