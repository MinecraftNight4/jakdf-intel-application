// Quien llama? Nunca nos fiamos de un ID que mande el navegador: se le pregunta a Discord con el token OAuth.
const cache = new Map();                      // token -> { id, until }   (solo dura lo que viva la instancia)
const TTL_MS = 5 * 60 * 1000;

export async function requireUser(req, res) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!token) {
    res.status(401).json({ error: "Falta el token de Discord" });
    return null;
  }
  const hit = cache.get(token);
  if (hit && hit.until > Date.now()) return { id: hit.id };

  const reply = await fetch("https://discord.com/api/v10/users/@me", { headers: { Authorization: `Bearer ${token}` } });
  if (!reply.ok) {
    res.status(401).json({ error: "Token de Discord invalido o caducado" });
    return null;
  }
  const { id } = await reply.json();
  if (cache.size > 500) cache.clear();
  cache.set(token, { id, until: Date.now() + TTL_MS });
  return { id };
}
