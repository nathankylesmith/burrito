import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  base: process.env.GITHUB_PAGES === "true" ? "/burrito/" : "/",
  plugins: [react()],
  test: {
    environment: "node",
  },
});
