// Copia lo que necesita la web desde el repositorio del bot: lista de personajes, iconos y fuentes.
//     npm run sync -- ../intel-jakdf-service      (ruta al repo del bot; tambien vale la variable BOT_DIR)
// Despues haz commit de lo que cambie en public/.
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const botDir = resolve(process.argv[2] || process.env.BOT_DIR || join(here, "..", "..", "intel-jakdf-service"));
const bot = join(botDir, "sys_save", "profile");
const out = join(here, "..", "public");
if (!existsSync(join(bot, "roster.json"))) {
  console.error(`No encuentro ${join(bot, "roster.json")}\nIndica la carpeta del repo del bot:  npm run sync -- ../mi-bot`);
  process.exit(1);
}

const roster = JSON.parse(readFileSync(join(bot, "roster.json"), "utf8"));
const characters = roster.characters.map((c) => ({
  uuid: c.uuid,
  name: c.full_name ?? c.name,
  prefix: c.prev_name ?? "",
  rarity: c.rarity ?? null,
  role: c.role ?? null,
  damage_type: c.damage_type ?? [],
  element: c.element ?? [],
}));
mkdirSync(out, { recursive: true });
writeFileSync(join(out, "roster.json"), JSON.stringify({ characters }));
console.log(`roster.json: ${characters.length} personajes`);

const copyAll = (from, to, ext) => {
  if (!existsSync(from)) return 0;
  mkdirSync(to, { recursive: true });
  let n = 0;
  for (const name of readdirSync(from)) if (name.toLowerCase().endsWith(ext)) { copyFileSync(join(from, name), join(to, name)); n++; }
  return n;
};
console.log(`iconos: ${copyAll(join(bot, "characters"), join(out, "characters"), ".png")}`);
console.log(`fuentes: ${copyAll(bot, join(out, "fonts"), ".ttf")}`);
