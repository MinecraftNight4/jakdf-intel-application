// POST /api/share   (cuerpo = imagen PNG, cabecera Authorization: Bearer <token del usuario>)
// Sube la imagen al CDN de Discord como adjunto efimero de la Activity y devuelve { url }.
// Esa URL es la que necesita openShareMomentDialog: el mensaje lo envia el propio usuario, sin bot en el servidor.
// Se hace desde aqui (y no desde el navegador) para no depender de la CSP/URL mapping de la Activity.
import { requireUser } from "./_lib/auth.js";

export const config = { api: { bodyParser: false } };

const MAX_BYTES = 1_500_000;
const PNG = [0x89, 0x50, 0x4e, 0x47];
const lastShare = new Map();               // freno basico por usuario (por instancia)
const MIN_GAP_MS = 3000;

async function readBody(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BYTES) return null;
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Metodo no permitido" });
  const me = await requireUser(req, res);
  if (!me) return;
  if (Date.now() - (lastShare.get(me.id) || 0) < MIN_GAP_MS) return res.status(429).json({ error: "Demasiado rapido, espera un momento" });
  lastShare.set(me.id, Date.now());

  const body = await readBody(req);
  if (!body || body.length < 100 || !PNG.every((byte, i) => body[i] === byte)) return res.status(400).json({ error: "Imagen invalida" });

  try {
    const form = new FormData();
    form.append("file", new Blob([body], { type: "image/png" }), "squad.png");
    const reply = await fetch(`https://discord.com/api/v10/applications/${process.env.DISCORD_CLIENT_ID}/attachment`, {
      method: "POST",
      headers: { Authorization: req.headers.authorization },
      body: form,
    });
    if (!reply.ok) return res.status(502).json({ error: `Discord rechazo la imagen (${reply.status})` });
    const { attachment } = await reply.json();
    if (!attachment?.url) return res.status(502).json({ error: "Discord no devolvio la URL" });
    return res.status(200).json({ url: attachment.url });
  } catch {
    return res.status(502).json({ error: "No se pudo subir la imagen" });
  }
}
