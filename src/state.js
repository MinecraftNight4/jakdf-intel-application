import { unpack } from "../shared/profileCodec.js";
import { getProfile } from "./api.js";
import { emptyDraft } from "./squadState.js";

export const state = {
  user: null,
  roster: [],
  byUuid: new Map(),
  ownedBy: new Map(),            // id de usuario (texto) -> { uuid: dupes }
  names: new Map(),              // id de usuario (texto) -> username (para mostrar "@nombre")
  draft: emptyDraft(4),          // la build en curso: sobrevive mientras la Activity sigue abierta
};

// Navegacion minima: main.js registra las pantallas y cada una llama go("nombre", ...args).
export const routes = {};
export const go = (name, ...args) => routes[name](...args);

/** Personajes de un usuario ({uuid: dupes}). Sin id: el tuyo. Se pide una vez; ``force`` vuelve a pedirlo. */
export async function loadOwned(userId, force = false) {
  const id = String(userId ?? state.user.id);
  if (!force && state.ownedBy.has(id)) return state.ownedBy.get(id);
  const profile = await getProfile(id);
  const owned = unpack(profile.data);
  if (profile.username) state.names.set(id, profile.username);
  state.ownedBy.set(id, owned);
  return owned;
}

export const charName = (char) => `${char.prefix} ${char.name}`.trim();

/** Texto del tooltip. ``owned`` = mapa de la cuenta, o null si no hay cuenta de referencia. */
export function unitInfo(char, owned) {
  if (!char) return null;
  let line = "";
  if (owned) {
    const dupes = owned[char.uuid];
    line = dupes === undefined ? "Not unlocked" : `★ ${dupes} dupe${dupes === 1 ? "" : "s"}`;
  }
  return { title: char.name, sub: char.prefix, line };
}
