// Codigo de una build (/squad share y /squad editor). Mismo formato que cogs/squad/codec.py.
// Bytes: [cabecera][creador: 8][cuenta de referencia: 8, opcional][uuid de cada casilla: 1 o 2 bytes]
//        [largo: 2 + descripcion comprimida con zlib, opcional][crc: 2]  -> base64url sin '='
//
// La compresion zlib no esta incluida: hay que llamar a ``configureZlib`` una vez
// (en el navegador con fflate, en Node con el modulo zlib).
import { fromB64url, toB64url } from "./b64.js";

export const VERSION = 1;
export const MAX_DESCRIPTION = 240;
export const MAX_NEWLINES = 10;
export const SLOT_COUNTS = [4, 16];
const F_WIDE16 = 1, F_WIDE_UUID = 2, F_ACCOUNT = 4, F_DESC = 8;

let zlib = null;
/** @param {{deflate:(b:Uint8Array)=>Uint8Array, inflate:(b:Uint8Array)=>Uint8Array}} impl */
export function configureZlib(impl) {
  zlib = impl;
}

export class CodeError extends Error {}

const TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function checksum(bytes) {                      // los 16 bits bajos de CRC32 (igual que zlib.crc32(...) & 0xFFFF)
  let c = 0xffffffff;
  for (const b of bytes) c = TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return ((c ^ 0xffffffff) >>> 0) & 0xffff;
}

function bigToBytes(value, size) {
  const out = new Uint8Array(size);
  let v = BigInt(value);
  for (let i = size - 1; i >= 0; i--) {
    out[i] = Number(v & 0xffn);
    v >>= 8n;
  }
  return out;
}

function bytesToBig(bytes) {
  let v = 0n;
  for (const b of bytes) v = (v << 8n) | BigInt(b);
  return v;
}

export function countNewlines(text) {
  return ((text || "").replace(/\r\n?/g, "\n").match(/\n/g) || []).length;
}

/** Sin \r, sin espacios en los bordes, maximo 240 caracteres y 10 saltos (los que sobran pasan a espacios). */
export function fitDescription(text) {
  const clean = Array.from((text || "").replace(/\r\n?/g, "\n").trim()).slice(0, MAX_DESCRIPTION).join("");
  const [head, ...rest] = clean.split("\n");
  const lines = [head];
  rest.forEach((line, i) => {
    if (i < MAX_NEWLINES) lines.push(line);
    else lines[lines.length - 1] = `${lines[lines.length - 1]} ${line}`.trim();
  });
  return lines.join("\n");
}

function concat(parts) {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let pos = 0;
  for (const p of parts) {
    out.set(p, pos);
    pos += p.length;
  }
  return out;
}

/** @param {string|bigint} creatorId  @param {number[]} slots  @param {string|bigint|null} accountId */
export function encode(creatorId, slots, accountId = null, description = "") {
  if (!SLOT_COUNTS.includes(slots.length)) throw new Error("a build has 4 or 16 slots");
  const desc = fitDescription(description);
  const wide = slots.some((u) => u > 255);
  const flags = (VERSION << 4) | (slots.length === 16 ? F_WIDE16 : 0) | (wide ? F_WIDE_UUID : 0)
    | (accountId ? F_ACCOUNT : 0) | (desc ? F_DESC : 0);
  const parts = [Uint8Array.of(flags), bigToBytes(creatorId, 8)];
  if (accountId) parts.push(bigToBytes(accountId, 8));
  for (const u of slots) parts.push(bigToBytes(u, wide ? 2 : 1));
  if (desc) {
    if (!zlib) throw new Error("falta configureZlib()");
    const packed = zlib.deflate(new TextEncoder().encode(desc));
    parts.push(bigToBytes(packed.length, 2), packed);
  }
  const body = concat(parts);
  return toB64url(concat([body, bigToBytes(checksum(body), 2)]));
}

/** @returns {{creatorId: string, accountId: string|null, slots: number[], description: string}} (ids como texto: no caben en un Number) */
export function decode(code) {
  let text = (code || "").replace(/`/g, "").replace(/\s+/g, "");
  if (text.toLowerCase().startsWith("squadcode:")) text = text.slice("squadcode:".length);
  const damaged = new CodeError("the code is damaged (was it copied completely?)");
  let raw;
  try {
    raw = fromB64url(text);
  } catch {
    throw new CodeError("that doesn't look like a squad code");
  }
  if (raw.length < 13 || raw[0] >> 4 !== VERSION) throw new CodeError("that doesn't look like a squad code");
  const body = raw.slice(0, -2);
  if (checksum(body) !== Number(bytesToBig(raw.slice(-2)))) throw damaged;
  const flags = raw[0];
  const count = flags & F_WIDE16 ? 16 : 4;
  const width = flags & F_WIDE_UUID ? 2 : 1;
  let pos = 1;
  const creatorId = bytesToBig(body.slice(pos, pos + 8)).toString();
  pos += 8;
  let accountId = null;
  if (flags & F_ACCOUNT) {
    accountId = bytesToBig(body.slice(pos, pos + 8)).toString();
    pos += 8;
  }
  const end = pos + count * width;
  if (end > body.length) throw damaged;
  const slots = [];
  for (let i = 0; i < count; i++) slots.push(Number(bytesToBig(body.slice(pos + i * width, pos + (i + 1) * width))));
  pos = end;
  let description = "";
  if (flags & F_DESC) {
    if (pos + 2 > body.length) throw damaged;
    const size = Number(bytesToBig(body.slice(pos, pos + 2)));
    const chunk = body.slice(pos + 2, pos + 2 + size);
    if (chunk.length !== size || size > 1024) throw damaged;        // una descripcion valida comprime a muy poco
    if (!zlib) throw new Error("falta configureZlib()");
    try {
      description = fitDescription(new TextDecoder("utf-8", { fatal: true }).decode(zlib.inflate(chunk)));
    } catch {
      throw damaged;
    }
    pos += 2 + size;
  }
  if (pos !== body.length) throw damaged;
  return { creatorId, accountId, slots, description };
}
