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

/** { userId, data, updatedAt }. Sin argumento: tu propio perfil. */
export const getProfile = (userId) => call(`/api/profile${userId ? `?user=${encodeURIComponent(userId)}` : ""}`);
export const saveProfile = (data) => call("/api/profile", { method: "PUT", body: JSON.stringify({ data }) });

export async function getRoster() {
  const reply = await fetch("/roster.json");
  if (!reply.ok) throw new Error("No se encontro roster.json (ejecuta `npm run sync` y sube los cambios)");
  return (await reply.json()).characters;
}
