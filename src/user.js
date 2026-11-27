// Datos de presentacion del usuario de Discord (separado de discord.js para no cargar el SDK en las pruebas).
export function avatarUrl(user) {
  return user.avatar ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=128` : null;
}

export const displayName = (user) => user.global_name || user.username;
