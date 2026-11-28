let token = "";
export const setToken = (value) => { token = value; };

async function call(path, options = {}) {
  const reply = await fetch(path, {
    ...options,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...(options.headers || {}) },
  });
  if (!reply.ok) {
    const body = await reply.json().catch(() => ({}));
    throw new Error(body.error || `Error ${reply.status}`);
  }
  return reply.json();
}

/** { userId, data, updatedAt, username }. Sin argumento: tu propio perfil. */
export const getProfile = (userId) => call(`/api/profile${userId ? `?user=${encodeURIComponent(userId)}` : ""}`);
export const saveProfile = (data) => call("/api/profile", { method: "PUT", body: JSON.stringify({ data }) });

export async function getRoster() {
  const reply = await fetch("/roster.json");
  if (!reply.ok) throw new Error("No se encontro roster.json (ejecuta `npm run sync` y sube los cambios)");
  return (await reply.json()).characters;
}

/** Sube una imagen PNG (Blob) y devuelve su URL efimera del CDN de Discord (para openShareMomentDialog). */
export async function uploadShareImage(blob) {
  const reply = await fetch("/api/share", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/octet-stream" },
    body: blob,
  });
  const body = await reply.json().catch(() => ({}));
  if (!reply.ok) throw new Error(body.error || `Error ${reply.status}`);
  return body.url;
}

/** Busca jugadores por username (prefijo) o por ID de Discord. Devuelve [{ userId, username }]. */
export async function searchProfiles(query) {
  return (await call(`/api/search?q=${encodeURIComponent(query)}`)).results;
}

/** Noticias vigentes: [{ id, kind, text, url, image, expire }]. No necesita sesion. */
export async function getNews() {
  const reply = await fetch("/api/news");
  if (!reply.ok) throw new Error(`Error ${reply.status}`);
  return (await reply.json()).items;
}
