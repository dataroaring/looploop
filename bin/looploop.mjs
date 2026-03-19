#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const entry = resolve(__dirname, "../src/index.ts");
const tsx = resolve(__dirname, "../node_modules/.bin/tsx");

const result = spawnSync(tsx, [entry], {
  stdio: "inherit",
  env: process.env,
});

process.exit(result.status ?? 1);
