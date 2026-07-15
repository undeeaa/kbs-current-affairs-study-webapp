import { defineConfig } from "vitest/config";

export default defineConfig({
  base: process.env.GITHUB_ACTIONS ? "/kbs-current-affairs-study-webapp/" : "/",
  build: {
    target: "es2022",
    sourcemap: true,
  },
  test: {
    environment: "jsdom",
    coverage: {
      reporter: ["text", "html"],
    },
  },
});
