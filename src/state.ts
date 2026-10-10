import type { State } from "./sources.ts";

// Layout, all integers big-endian:
//   u8 version, u8 source count, then per source:
//     u8 length + UTF-8 source id
//     u8 length + UTF-8 etag
//     u16 count, then per listing: 16-byte UUID + u32 date posted
//     u16 count, then per listing: u8 length + UTF-8 id + u32 date posted (ids that are not UUIDs)
// Entries are sorted so the same state always encodes to the same bytes. The file is left
// uncompressed on purpose: git already deflates it, and near-identical versions delta well.
const VERSION = 1;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const UUID_DASHES = [8, 13, 18, 23];

const utf8 = new TextEncoder();

function shortString(value: string, what: string): number[] {
  const bytes = utf8.encode(value);
  if (bytes.length > 0xff) throw new Error(`${what} is too long to store: ${value}`);
  return [bytes.length, ...bytes];
}

const u16 = (n: number, what: string): number[] => {
  if (n > 0xffff) throw new Error(`Too many ${what} to store: ${n}`);
  return [n >>> 8, n & 0xff];
};
const u32 = (n: number): number[] => [n >>> 24, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff];

function uuidBytes(id: string): number[] {
  const hex = id.replaceAll("-", "");
  return Array.from({ length: 16 }, (_, i) => Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16));
}

export function encodeState(state: State): Uint8Array {
  const sources = Object.entries(state).sort(([a], [b]) => (a < b ? -1 : 1));
  if (sources.length > 0xff) throw new Error(`Too many sources to store: ${sources.length}`);
  const out: number[] = [VERSION, sources.length];
  for (const [sourceId, { etag, seen }] of sources) {
    const entries = Object.entries(seen).sort(([a, at], [b, bt]) => at - bt || (a < b ? -1 : 1));
    const uuids = entries.filter(([id]) => UUID.test(id));
    const others = entries.filter(([id]) => !UUID.test(id));
    out.push(...shortString(sourceId, "Source id"), ...shortString(etag, "Etag"));
    out.push(...u16(uuids.length, "seen ids"));
    for (const [id, posted] of uuids) out.push(...uuidBytes(id), ...u32(posted));
    out.push(...u16(others.length, "seen ids"));
    for (const [id, posted] of others) out.push(...shortString(id, "Listing id"), ...u32(posted));
  }
  return Uint8Array.from(out);
}

export function decodeState(bytes: Uint8Array): State {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const text = new TextDecoder("utf-8", { fatal: true });
  let at = 0;
  const u8 = () => view.getUint8(at++);
  const read16 = () => ((at += 2), view.getUint16(at - 2));
  const read32 = () => ((at += 4), view.getUint32(at - 4));
  const readString = () => {
    const length = u8();
    return text.decode(bytes.subarray(at, (at += length)));
  };
  const readUuid = () => {
    const hex = Array.from(bytes.subarray(at, (at += 16)), (b) => b.toString(16).padStart(2, "0")).join("");
    return UUID_DASHES.reduce((id, dash) => `${id.slice(0, dash)}-${id.slice(dash)}`, hex);
  };

  const version = u8();
  if (version !== VERSION) throw new Error(`Unsupported state format version ${version}`);
  const state: State = {};
  for (let sources = u8(); sources > 0; sources--) {
    const sourceId = readString();
    const etag = readString();
    const seen: Record<string, number> = {};
    for (let n = read16(); n > 0; n--) seen[readUuid()] = read32();
    for (let n = read16(); n > 0; n--) seen[readString()] = read32();
    state[sourceId] = { etag, seen };
  }
  if (at !== bytes.length) throw new Error(`State file has ${bytes.length - at} unexpected trailing bytes`);
  return state;
}
