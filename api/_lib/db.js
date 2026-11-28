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

// Columna "username" (minuscula, con indice): permite buscar jugadores por nombre desde la Activity.
// Se crea sola la primera vez (una sola vez por instancia); si ya existe no se escribe nada.
let schemaReady = null;
/** true si la columna "username" esta disponible. Si la migracion falla, el resto de la app sigue funcionando sin busqueda. */
async function ensureSchema() {
  schemaReady ??= (async () => {
    try {
      const db = client(true);
      const info = await db.execute("PRAGMA table_info(profiles)");
      const columns = (info.rows ?? info).map((row) => String(row.name ?? row[1]));
      if (!columns.length) return false;                       // la tabla aun no existe (la crea el bot)
      if (!columns.includes("username")) await db.execute("ALTER TABLE profiles ADD COLUMN username TEXT");
      await db.execute("CREATE INDEX IF NOT EXISTS idx_profiles_username ON profiles(username)");
      return true;
    } catch (err) {
      console.error("schema username:", err);
      schemaReady = null;                                      // se reintenta en la proxima peticion
      return false;
    }
  })();
  return schemaReady;
}

export const normalizeUsername = (name) => String(name ?? "").trim().toLowerCase().slice(0, 64) || null;

/** { data, updatedAt, username }. Sin fila: data "" y updatedAt 0. */
export async function readProfile(userId) {
  const withName = await ensureSchema();
  const result = await client(false).execute(`SELECT data, updated_at, ${withName ? "username" : "NULL AS username"} FROM profiles WHERE user_id = ${ID}`, [String(userId)]);
  const row = (result.rows ?? result)[0];
  if (!row) return { data: "", updatedAt: 0, username: null };
  return { data: String(row.data ?? row[0] ?? ""), updatedAt: Number(row.updated_at ?? row[1] ?? 0), username: row.username ?? row[2] ?? null };
}

/** Pone el nombre en una fila que ya existe. Si ya es ese, no cambia ninguna fila (no cuenta como escritura). */
export async function syncUsername(userId, username) {
  const name = normalizeUsername(username);
  if (!name || !(await ensureSchema())) return;
  await client(true).execute(`UPDATE profiles SET username = ? WHERE user_id = ${ID} AND username IS NOT ?`, [name, String(userId), name]);
}

/** Guarda el perfil (1 fila). Texto vacio = borra la fila. Si ni el perfil ni el nombre cambian, la base no escribe nada. */
export async function writeProfile(userId, data, username) {
  const withName = await ensureSchema();
  const db = client(true);
  if (!data) {
    await db.execute(`DELETE FROM profiles WHERE user_id = ${ID}`, [String(userId)]);
    return;
  }
  if (!withName) {                                             // sin columna: guardado de siempre
    await db.execute(
      `INSERT INTO profiles(user_id, data, updated_at) VALUES(${ID}, ?, ?) ` +
        "ON CONFLICT(user_id) DO UPDATE SET data=excluded.data, updated_at=excluded.updated_at WHERE profiles.data != excluded.data",
      [String(userId), data, Math.floor(Date.now() / 1000)],
    );
    return;
  }
  await db.execute(
    `INSERT INTO profiles(user_id, data, updated_at, username) VALUES(${ID}, ?, ?, ?) ` +
      "ON CONFLICT(user_id) DO UPDATE SET data=excluded.data, " +
      "updated_at=CASE WHEN profiles.data != excluded.data THEN excluded.updated_at ELSE profiles.updated_at END, " +
      "username=COALESCE(excluded.username, profiles.username) " +
      "WHERE profiles.data != excluded.data OR profiles.username IS NOT COALESCE(excluded.username, profiles.username)",
    [String(userId), data, Math.floor(Date.now() / 1000), normalizeUsername(username)],
  );
}

/** Jugadores cuyo username empieza por ``prefix`` (ya en minusculas). Lee solo las filas que coinciden. */
export async function searchUsernames(prefix, limit = 10) {
  if (!(await ensureSchema())) throw new Error("la busqueda no esta disponible (falta la columna username)");
  const result = await client(false).execute(
    "SELECT CAST(user_id AS TEXT) AS id, username FROM profiles WHERE username >= ? AND username < ? ORDER BY username LIMIT ?",
    [prefix, `${prefix}\uffff`, limit],
  );
  return (result.rows ?? result).map((row) => ({ userId: String(row.id ?? row[0]), username: String(row.username ?? row[1]) }));
}

/** Busqueda exacta por ID de Discord. */
export async function findById(userId) {
  const { data, username } = await readProfile(userId);
  return data ? { userId: String(userId), username } : null;
}
