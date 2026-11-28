// GET /api/news -> { items: [{ id, kind, text, url, image, expire }] }
// Lee las noticias del JSON publicado en GitHub (``news_list``), descarta las que ya caducaron y las sirve con cache
// en el CDN de Vercel. Se pide desde aqui (y no desde la Activity) porque Discord no deja a la Activity hablar con
// dominios externos sin un "URL mapping".
const DEFAULT_URL = "https://raw.githubusercontent.com/MinecraftNight4/jakdf-backup-data/refs/heads/main/last.json";
const MAX_ITEMS = 12;

/** Segundos unix; 0 / vacio = no caduca. Acepta milisegundos por si algun dia se guardan asi. */
function expiry(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return n > 1e12 ? Math.floor(n / 1000) : Math.floor(n);
}

const httpsUrl = (value) => {
  try { return new URL(String(value)).protocol === "https:" ? String(value) : ""; } catch { return ""; }
};

export function parseNews(json, now = Math.floor(Date.now() / 1000)) {
  const list = json && typeof json === "object" ? json.news_list : null;
  const entries = Array.isArray(list) ? list.map((v, i) => [String(i), v]) : Object.entries(list || {});
  const items = [];
  for (const [kind, item] of entries) {
    if (!item || typeof item !== "object") continue;
    const expire = expiry(item.expire ?? item.item_expire);
    if (expire && expire <= now) continue;                       // ya caduco
    const url = httpsUrl(item.http ?? item.url);
    const text = String(item.text ?? "").replace(/\s+/g, " ").trim();
    const image = typeof item.icon === "string" && /^data:image\/(webp|png|jpe?g);base64,/.test(item.icon) ? item.icon : "";
    if (!text || !url) continue;
    items.push({ id: String(item.entry ?? kind), kind, text, url, image, expire });
  }
  return items.slice(0, MAX_ITEMS);
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }
  try {
    const reply = await fetch(process.env.NEWS_URL || DEFAULT_URL, { signal: AbortSignal.timeout(8000) });
    if (!reply.ok) throw new Error(`GitHub respondio ${reply.status}`);
    const items = parseNews(await reply.json());
    res.setHeader("Cache-Control", "public, s-maxage=300, stale-while-revalidate=900");
    return res.status(200).json({ items });
  } catch (err) {
    console.error("news api:", err);
    res.setHeader("Cache-Control", "no-store");
    return res.status(502).json({ error: "No se pudieron cargar las noticias" });
  }
}
