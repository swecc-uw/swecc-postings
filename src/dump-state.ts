import { readFileSync } from "node:fs";
import { decodeState } from "./state.ts";

const statePath = process.argv[2];
if (!statePath) throw new Error("usage: node src/dump-state.ts <path to state.bin>");
console.log(JSON.stringify(decodeState(readFileSync(statePath)), null, 2));
