import assert from "node:assert/strict";
import zlib from "node:zlib";
import * as codec from "../shared/squadCodec.js";
import * as S from "../src/squadState.js";

codec.configureZlib({
  deflate: (b) => new Uint8Array(zlib.deflateSync(b, { level: 9 })),
  inflate: (b) => new Uint8Array(zlib.inflateSync(b)),
});

let d = S.emptyDraft(4);
assert.equal(S.filledCount(d), 0); assert.equal(S.isComplete(d), false); assert.equal(S.toCode(d, "1"), "");

// colocar con seleccion y avance automatico
let r = S.place(d, 1, 10); assert.deepEqual(S.visibleSlots(r.draft), [0, 10, 0, 0]); assert.equal(r.selected, 2);
d = r.draft;
r = S.place(d, -1, 11); assert.deepEqual(S.visibleSlots(r.draft), [11, 10, 0, 0]); assert.equal(r.selected, 2);   // sin seleccion: primera libre
d = r.draft;
// repetido: se mueve (la casilla vieja queda vacia, como en el bot)
r = S.place(d, 3, 10); assert.deepEqual(S.visibleSlots(r.draft), [11, 0, 0, 10]); d = r.draft;
// completar
d = S.place(d, -1, 12).draft; d = S.place(d, -1, 13).draft;
assert.equal(S.isComplete(d), true); assert.equal(S.place(d, -1, 99), null);                                       // llena y sin seleccion
assert.deepEqual(S.visibleSlots(S.place(d, 0, 99).draft), [99, 12, 13, 10]);

// codigo: igual que el del bot y sin cuenta en modo "all"
const code = S.toCode(d, "1486421370123456789");
assert.deepEqual(codec.decode(code), { creatorId: "1486421370123456789", accountId: null, slots: S.visibleSlots(d), description: "" });
const prof = { ...d, mode: "profile", accountId: "987654321098765432", description: "hola\nmundo" };
assert.deepEqual(codec.decode(S.toCode(prof, "42")), { creatorId: "42", accountId: "987654321098765432", slots: S.visibleSlots(d), description: "hola\nmundo" });

// 4 <-> 16 no pierde nada
let big = S.setCount(S.assign(S.setCount(d, 16), 9, 77), 4);
assert.equal(big.slots[9], 77); assert.equal(S.visibleSlots(big).length, 4);
assert.equal(S.visibleSlots(S.setCount(big, 16))[9], 77);
assert.throws(() => S.assign(big, 9, 5));                                    // casilla oculta
assert.equal(S.assign(S.setCount(big, 16), 0, 77).slots[9], 0);              // el duplicado oculto tambien se limpia
assert.equal(S.isComplete(S.setCount(d, 16)), false);

// nextEmpty da la vuelta
let w = S.emptyDraft(4); w = S.assign(S.assign(w, 2, 1), 3, 2);
assert.equal(S.nextEmpty(w, 3), 0); assert.equal(S.nextEmpty(w, 0), 1); assert.equal(S.nextEmpty(S.assign(S.assign(w, 0, 3), 1, 4), 0), -1);

// descripcion
assert.equal(S.clampDescription("a".repeat(300)).length, 240);
assert.equal(S.clampDescription("x\n".repeat(20)).split("\n").length, 11);
assert.equal(S.clampDescription("  hola  "), "  hola  ");                    // no recorta mientras se escribe

// importar
const back = S.fromDecoded(codec.decode(S.toCode(prof, "42")));
assert.equal(back.count, 4); assert.equal(back.mode, "profile"); assert.equal(back.accountId, "987654321098765432");
assert.deepEqual(S.visibleSlots(back), S.visibleSlots(d));
console.log("OK: logica del editor de builds");

// ---- tap en orden y arrastrar (v2)
{
  let d = S.emptyDraft(4);
  d = S.addFirst(d, 10); d = S.addFirst(d, 11); assert.deepEqual(S.visibleSlots(d), [10, 11, 0, 0]);
  d = S.clearSlot(d, 0); d = S.addFirst(d, 12); assert.deepEqual(S.visibleSlots(d), [12, 11, 0, 0]);   // rellena el hueco menor
  d = S.addFirst(S.addFirst(d, 13), 14); assert.equal(S.addFirst(d, 15), null);                        // llena
  d = S.placeAt(d, 3, 99); assert.deepEqual(S.visibleSlots(d), [12, 11, 13, 99]);                      // soltar sobre ocupada: reemplaza
  d = S.placeAt(d, 0, 99); assert.deepEqual(S.visibleSlots(d), [99, 11, 13, 12]);                      // ya estaba: intercambia
  assert.equal(S.placeAt(d, 0, 99), d);                                                               // misma casilla: nada
  d = S.swapSlots(d, 1, 2); assert.deepEqual(S.visibleSlots(d), [99, 13, 11, 12]);
  let e = S.setCount(S.emptyDraft(4), 16); assert.throws(() => S.placeAt(S.setCount(e, 4), 5, 1));
  e = S.emptyDraft(16); e = S.placeAt(e, 15, 7); assert.equal(e.slots[15], 7);
}
console.log("squadstate v2 OK");
