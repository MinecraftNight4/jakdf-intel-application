import { DiscordSDK } from "@discord/embedded-app-sdk";

const clientId = import.meta.env.VITE_DISCORD_CLIENT_ID;
export const sdk = new DiscordSDK(clientId);

/** Abre sesion con Discord. Devuelve { token, user } (user: id, username, global_name, avatar). */
export async function login() {
  await sdk.ready();
  const { code } = await sdk.commands.authorize({
    client_id: clientId,
    response_type: "code",
    state: "",
    prompt: "none",
    scope: ["identify"],
  });
  const reply = await fetch("/api/token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code }),
  });
  if (!reply.ok) throw new Error("No se pudo iniciar sesion (el servidor rechazo el codigo)");
  const { access_token } = await reply.json();
  const auth = await sdk.commands.authenticate({ access_token });
  if (!auth) throw new Error("Discord rechazo la autenticacion");
  return { token: access_token, user: auth.user };
}

export function avatarUrl(user) {
  return user.avatar ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=128` : null;
}

export const displayName = (user) => user.global_name || user.username;
