import { defineConfig } from "oxlint";
import core from "ultracite/oxlint/core";

export default defineConfig({
  extends: [core],
  ignorePatterns: [
    ...(core.ignorePatterns ?? []),
    "src/rest/**",
    "scripts/**",
    "openapi.json",
  ],
  options: {
    typeAware: true,
    typeCheck: true,
  },
});
