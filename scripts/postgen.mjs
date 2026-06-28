import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = "src/rest";
const BANNER = "// @ts-nocheck\n";

const walk = (dir) => {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) {
      walk(path);
      continue;
    }
    if (!path.endsWith(".ts")) {
      continue;
    }
    const content = readFileSync(path, "utf8");
    if (!content.startsWith(BANNER)) {
      writeFileSync(path, BANNER + content);
    }
  }
};

walk(ROOT);
