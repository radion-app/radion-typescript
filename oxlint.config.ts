import { defineConfig } from "oxlint";
import core from "ultracite/oxlint/core";

export default defineConfig({
  extends: [core],
  ignorePatterns: core.ignorePatterns,
  options: {
    typeAware: true,
    typeCheck: true,
  },
  rules: {
    "no-barrel-file": ["error", { threshold: 150 }],
  },
});
