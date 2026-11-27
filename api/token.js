// POST /api/token  { code }  ->  { access_token }
// El "code" lo da Discord al abrir la Activity; aqui se cambia por un token usando el client secret (que nunca sale del servidor).
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const code = req.body && req.body.code;
  if (typeof code !== "string" || !code) return res.status(400).json({ error: "Falta el code" });

  const reply = await fetch("https://discord.com/api/oauth2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.DISCORD_CLIENT_ID,
      client_secret: process.env.DISCORD_CLIENT_SECRET,
      grant_type: "authorization_code",
      code,
    }),
  });
  if (!reply.ok) return res.status(502).json({ error: "Discord rechazo el codigo" });
  const { access_token } = await reply.json();
  return res.status(200).json({ access_token });
}
