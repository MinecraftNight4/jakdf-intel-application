// GET /api/profile            -> tu perfil
// GET /api/profile?user=<id>  -> el perfil de otro usuario (los perfiles son publicos)
// PUT /api/profile { data }   -> guarda TU perfil (el usuario y su username salen del token, nunca del cuerpo)
import { requireUser } from "./_lib/auth.js";
import { normalizeUsername, readProfile, syncUsername, writeProfile } from "./_lib/db.js";
import { pack, unpack } from "../shared/profileCodec.js";

const lastWrite = new Map();             // freno basico por usuario (por instancia)
const MIN_WRITE_GAP_MS = 2000;

export default async function handler(req, res) {
  const me = await requireUser(req, res);
  if (!me) return;
  try {
    if (req.method === "GET") {
      const wanted = typeof req.query.user === "string" ? req.query.user : me.id;
      if (!/^\d{5,25}$/.test(wanted)) return res.status(400).json({ error: "ID de usuario invalido" });
      let { data, updatedAt, username } = await readProfile(wanted);
      // Al abrir tu propio perfil se mantiene al dia tu username (solo escribe si cambio).
      if (wanted === me.id && updatedAt > 0 && normalizeUsername(me.username) && username !== normalizeUsername(me.username)) {
        try { await syncUsername(me.id, me.username); username = normalizeUsername(me.username); } catch (err) { console.error("username sync:", err); }
      }
      return res.status(200).json({ userId: wanted, data, updatedAt, username });
    }
    if (req.method === "PUT") {
      if (Date.now() - (lastWrite.get(me.id) || 0) < MIN_WRITE_GAP_MS) return res.status(429).json({ error: "Demasiado rapido, espera un momento" });
      lastWrite.set(me.id, Date.now());
      let data = req.body && req.body.data;
      if (typeof data !== "string" || data.length > 600) return res.status(400).json({ error: "Perfil invalido" });
      try {
        data = pack(unpack(data));        // se vuelve a escribir en su forma canonica
      } catch {
        return res.status(400).json({ error: "Perfil invalido" });
      }
      await writeProfile(me.id, data, me.username);
      return res.status(200).json({ ok: true, data });
    }
    res.setHeader("Allow", "GET, PUT");
    return res.status(405).json({ error: "Method not allowed" });
  } catch (err) {
    console.error("profile api:", err);
    return res.status(502).json({ error: "La base de datos no responde" });
  }
}
