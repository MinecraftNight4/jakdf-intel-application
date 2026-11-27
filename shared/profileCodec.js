// Perfil ({uuid: dupes}) <-> texto corto. Es el mismo formato que cogs/profile/codec.py (el bot lo lee y lo escribe).
//
//   byte 0   version (1)
//   resto    entero little-endian con 3 bits por personaje: bits [3*(uuid-1), 3*(uuid-1)+3)
//            0 = no lo tiene, 1..7 = dupes 0..6 (dupes + 1)
import { fromB64url, toB64url } from "./b64.js";

export const VERSION = 1;
export const MAX_DUPES = 6;
export const MAX_UUID = 1000;            // tope razonable: evita textos enormes

/** @param {Record<string, number>} owned  uuid -> dupes @returns {string} "" si no hay personajes */
export function pack(owned) {
  let n = 0n;
  for (const [key, dupes] of Object.entries(owned)) {
    const uuid = Number(key);
    if (!Number.isInteger(uuid) || uuid < 1 || uuid > MAX_UUID) throw new Error(`uuid invalido: ${key}`);
    const d = Math.max(0, Math.min(MAX_DUPES, Math.trunc(Number(dupes)) || 0));
    n |= BigInt(d + 1) << BigInt(3 * (uuid - 1));
  }
  if (n === 0n) return "";
  const bytes = [VERSION];
  while (n > 0n) {
    bytes.push(Number(n & 0xffn));
    n >>= 8n;
  }
  return toB64url(bytes);
}

/** @returns {Record<number, number>} uuid -> dupes. Lanza Error si el texto no es un perfil valido. */
export function unpack(text) {
  if (!text) return {};
  let raw;
  try {
    raw = fromB64url(text);
  } catch {
    throw new Error("perfil ilegible");
  }
  if (raw.length === 0 || raw[0] !== VERSION) throw new Error("version de perfil desconocida");
  if (raw.length > 1 + Math.ceil((3 * MAX_UUID) / 8)) throw new Error("perfil demasiado grande");
  let n = 0n;
  for (let i = raw.length - 1; i >= 1; i--) n = (n << 8n) | BigInt(raw[i]);
  const owned = {};
  for (let uuid = 1; n > 0n; uuid++, n >>= 3n) {
    const value = Number(n & 7n);
    if (value) owned[uuid] = value - 1;
  }
  return owned;
}
