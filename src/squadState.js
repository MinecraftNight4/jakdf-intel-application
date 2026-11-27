// Logica pura del editor de builds (sin DOM, para poder probarla en Node).
// Un "borrador" (draft) guarda SIEMPRE 16 casillas: al pasar de 16 a 4 no se pierde nada, solo se ocultan.
import { MAX_DESCRIPTION, MAX_NEWLINES, SLOT_COUNTS, encode } from "../shared/squadCodec.js";

export const MAX_SLOTS = 16;

export const emptyDraft = (count = 4) => ({
  count,                               // 4 o 16 casillas visibles
  slots: Array(MAX_SLOTS).fill(0),     // uuid por casilla, 0 = vacia
  description: "",
  mode: "all",                         // "all" = todo el roster | "profile" = solo lo de una cuenta
  accountId: null,                     // cuenta de referencia (texto) cuando mode === "profile"
});

export const visibleSlots = (d) => d.slots.slice(0, d.count);
export const filledCount = (d) => visibleSlots(d).filter(Boolean).length;
export const isComplete = (d) => filledCount(d) === d.count;

export function setCount(d, count) {
  if (!SLOT_COUNTS.includes(count)) throw new Error("a build has 4 or 16 slots");
  return { ...d, count };
}

/** Pone ``uuid`` en la casilla. Si ya estaba en otra, esa queda vacia (sin repetidos), igual que en el bot. */
export function assign(d, slot, uuid) {
  if (slot < 0 || slot >= d.count) throw new Error("casilla fuera de rango");
  const slots = d.slots.map((current) => (current === uuid ? 0 : current));
  slots[slot] = uuid;
  return { ...d, slots };
}

export function clearSlot(d, slot) {
  const slots = [...d.slots];
  slots[slot] = 0;
  return { ...d, slots };
}

export const clearAll = (d) => ({ ...d, slots: Array(MAX_SLOTS).fill(0) });

/** Siguiente casilla visible vacia despues de ``from`` (dando la vuelta), o -1 si no queda ninguna. */
export function nextEmpty(d, from = -1) {
  for (let step = 1; step <= d.count; step++) {
    const i = (from + step + d.count) % d.count;
    if (!d.slots[i]) return i;
  }
  return -1;
}

/** Elegir un personaje: va a la casilla seleccionada, o a la primera libre. Devuelve null si no hay donde ponerlo. */
export function place(d, selected, uuid) {
  const target = selected >= 0 ? selected : nextEmpty(d, -1);
  if (target < 0) return null;
  const next = assign(d, target, uuid);
  return { draft: next, selected: nextEmpty(next, target) };
}

/** Descripcion mientras se escribe: sin recortar espacios (eso solo al generar el codigo). */
export function clampDescription(text) {
  const clean = Array.from((text || "").replace(/\r\n?/g, "\n")).slice(0, MAX_DESCRIPTION).join("");
  const [head, ...rest] = clean.split("\n");
  const lines = [head];
  rest.forEach((line, i) => {
    if (i < MAX_NEWLINES) lines.push(line);
    else lines[lines.length - 1] += ` ${line}`;
  });
  return lines.join("\n");
}

/** Codigo de la build, o "" si aun faltan casillas (mismo criterio que el bot). */
export function toCode(d, creatorId) {
  if (!isComplete(d)) return "";
  const account = d.mode === "profile" ? d.accountId : null;
  return encode(creatorId, visibleSlots(d), account, d.description);
}

/** Borrador a partir de un codigo ya decodificado (``decode`` de squadCodec). */
export function fromDecoded(decoded) {
  const slots = Array(MAX_SLOTS).fill(0);
  decoded.slots.forEach((uuid, i) => { slots[i] = uuid; });
  return {
    count: decoded.slots.length,
    slots,
    description: decoded.description,
    mode: decoded.accountId ? "profile" : "all",
    accountId: decoded.accountId,
  };
}
