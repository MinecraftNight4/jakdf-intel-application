// node test/codec.test.mjs  (o: npm test)
// Comprueba que los codecs de JavaScript leen y escriben igual que los de Python (test/vectors.json).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import zlib from "node:zlib";
import * as profile from "../shared/profileCodec.js";
import * as squad from "../shared/squadCodec.js";

squad.configureZlib({
  deflate: (b) => new Uint8Array(zlib.deflateSync(b, { level: 9 })),
  inflate: (b) => new Uint8Array(zlib.inflateSync(b)),
});
const vectors = JSON.parse(readFileSync(new URL("./vectors.json", import.meta.url), "utf8"));

for (const { owned, text } of vectors.profiles) {
  const expected = Object.fromEntries(Object.entries(owned).map(([k, v]) => [Number(k), v]));
  assert.deepEqual(profile.unpack(text), expected, `unpack ${text}`);
  assert.equal(profile.pack(expected), text, `pack ${text}`);
}
for (const bad of ["!!!", "AAAA", "Zm9v", "AQ" + "A".repeat(600)]) assert.throws(() => profile.unpack(bad), bad.slice(0, 8));
assert.equal(profile.pack({ 3: 99, 2: -4 }), profile.pack({ 3: 6, 2: 0 }));       // se recorta a 0..6
assert.throws(() => profile.pack({ 0: 1 }));
assert.throws(() => profile.pack({ 5000: 1 }));

for (const b of vectors.builds) {
  const got = squad.decode(b.code);
  assert.deepEqual(got, { creatorId: b.creator, accountId: b.account, slots: b.slots, description: b.description });
  const again = squad.encode(b.creator, b.slots, b.account, b.description);
  assert.equal(again, b.code, "JS escribe el mismo codigo que Python");
  assert.deepEqual(squad.decode(again), got);
  assert.deepEqual(squad.decode(`  squadcode:\`${b.code}\`\n`), got);              // como lo pega la gente
}
const good = vectors.builds[0].code;
assert.throws(() => squad.decode(good.slice(0, -3)), squad.CodeError);
assert.throws(() => squad.decode(good.slice(0, 10) + (good[10] === "A" ? "B" : "A") + good.slice(11)), squad.CodeError);
assert.throws(() => squad.decode("hola"), squad.CodeError);
assert.equal(squad.fitDescription("a\n".repeat(14)).split("\n").length, 11);

console.log(`OK: ${vectors.profiles.length} perfiles y ${vectors.builds.length} builds iguales a Python`);
