import { defineConfig } from "@hey-api/openapi-ts";

export default defineConfig({
  input: "openapi.json",
  output: "src/rest",
  plugins: [
    "@hey-api/client-fetch",
    { name: "@hey-api/sdk", operations: { strategy: "byTags" } },
    "@hey-api/typescript",
  ],
});
