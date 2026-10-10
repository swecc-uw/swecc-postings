import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { run } from "./run.ts";
import type { State } from "./sources.ts";

const statePath = process.argv[2];
if (!statePath) throw new Error("usage: node src/main.ts <path to state.json>");

const prev: State = existsSync(statePath) ? JSON.parse(readFileSync(statePath, "utf8")) : {};
const { state, errors } = await run(process.env, prev);

// Written even when a source failed, so the sources that succeeded are not posted again next run.
writeFileSync(statePath, `${JSON.stringify(state, null, 1)}\n`);
if (errors.length > 0) process.exitCode = 1;
