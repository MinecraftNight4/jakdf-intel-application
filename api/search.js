// GET /api/search?q=<texto>
//   - Solo digitos (5-25): busca ese ID de Discord.
//   - Si no: jugadores cuyo username empieza por el texto (minimo 2 caracteres, maximo 10 resultados).
// Los perfiles son publicos; la busqueda solo devuelve { userId, username }.
import { requireUser } from "./_lib/auth.js";
import { findById, searchUsernames } from "./_lib/db.js";

const lastSearch = new Map();            // freno basico por usuario (por instancia)
const MIN_GAP_MS = 300;

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }
  const me = await requireUser(req, res);
  if (!me) return;
  if (Date.now() - (lastSearch.get(me.id) || 0) < MIN_GAP_MS) return res.status(429).json({ error: "Demasiado rapido, espera un momento" });
  lastSearch.set(me.id, Date.now());

  const q = String(req.query.q ?? "").trim().replace(/^@/, "").toLowerCase();
  try {
    if (/^\d{5,25}$/.test(q)) {
      const hit = await findById(q);
      return res.status(200).json({ results: hit ? [hit] : [] });
    }
    if (q.length < 2 || q.length > 32) return res.status(400).json({ error: "Escribe entre 2 y 32 caracteres" });
    return res.status(200).json({ results: await searchUsernames(q) });
  } catch (err) {
    console.error("search api:", err);
    return res.status(502).json({ error: "La base de datos no responde" });
  }
}
