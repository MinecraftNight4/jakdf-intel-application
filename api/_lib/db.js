// Turso, solo desde el servidor. Los tokens viven en variables de entorno de Vercel, nunca en el navegador.
import { createClient } from "@tursodatabase/serverless/compat";

const clients = {};

function client(write) {
  const key = write ? "write" : "read";
  if (!clients[key]) {
    clients[key] = createClient({
      url: process.env.TURSO_DATABASE_URL,
      authToken: (write ? process.env.TURSO_AUTH_TOKEN : process.env.TURSO_READ_TOKEN || process.env.TURSO_AUTH_TOKEN),
    });
  }
  return clients[key];
}

// Los IDs de Discord no caben en un Number de JavaScript: viajan como texto y la base los convierte.
const ID = "CAST(? AS INTEGER)";

export async function readProfile(userId) {
  const result = await client(false).execute(`SELECT data, updated_at FROM profiles WHERE user_id = ${ID}`, [String(userId)]);
  const row = (result.rows ?? result)[0];
  if (!row) return { data: "", updatedAt: 0 };
  return { data: String(row.data ?? row[0] ?? ""), updatedAt: Number(row.updated_at ?? row[1] ?? 0) };
}

/** Guarda el perfil (1 fila). Texto vacio = borra la fila. Si el texto no cambia, la base no escribe nada. */
export async function writeProfile(userId, data) {
  const db = client(true);
  if (!data) {
    await db.execute(`DELETE FROM profiles WHERE user_id = ${ID}`, [String(userId)]);
    return;
  }
  await db.execute(
    `INSERT INTO profiles(user_id, data, updated_at) VALUES(${ID}, ?, ?) ` +
      "ON CONFLICT(user_id) DO UPDATE SET data=excluded.data, updated_at=excluded.updated_at " +
      "WHERE profiles.data != excluded.data",
    [String(userId), data, Math.floor(Date.now() / 1000)],
  );
}
