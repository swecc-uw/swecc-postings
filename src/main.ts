import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { run } from "./run.ts";
import { decodeState, encodeState } from "./state.ts";

const statePath = process.argv[2];
if (!statePath) throw new Error("usage: node src/main.ts <path to state.bin>");

const prev = existsSync(statePath) ? decodeState(readFileSync(statePath)) : {};
const { state, errors } = await run(process.env, prev);

// Written even when a source failed, so the sources that succeeded are not posted again next run.
writeFileSync(statePath, encodeState(state));
if (errors.length > 0) process.exitCode = 1;
