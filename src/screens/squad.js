import { CodeError, MAX_DESCRIPTION, MAX_NEWLINES, countNewlines, decode } from "../../shared/squadCodec.js";
import { enableDrag } from "../drag.js";
import { h, mount } from "../dom.js";
import { charName, go, loadOwned, state, unitInfo } from "../state.js";
import * as S from "../squadState.js";
import { attachTooltips, copyText, dialog, header, hideTip, scrollbox, toast, unitIcon } from "../ui.js";

/** Fila de pestañas (la activa se funde con el panel). ``items`` = [[id, texto], ...]. */
function tabBar(items, onPick, cls = "") {
  const buttons = new Map(items.map(([id, text]) => [id, h("button", { class: "ptab", onClick: () => onPick(id) }, text)]));
  return {
    el: h("div", { class: `ptabs ${cls}`.trim() }, ...buttons.values()),
    set(active) { buttons.forEach((b, id) => b.classList.toggle("on", id === active)); },
    label(id, text) { buttons.get(id).textContent = text; },
  };
}

/** Editor de builds. ``opts.mode === "profile"`` abre directamente con el roster de tu cuenta. */
export async function squadScreen(app, opts = {}) {
  let draft = state.draft;
  if (opts.mode === "profile") draft = { ...draft, mode: "profile", accountId: String(state.user.id) };
  let owned = null;                              // { uuid: dupes } de la cuenta de referencia (modo "profile")
  let pane = "roster";                           // pestaña del panel principal

  const commit = (next) => { draft = next; state.draft = next; };
  commit(draft);

  async function loadPool() {
    owned = null;
    if (draft.mode !== "profile") return;
    try {
      owned = await loadOwned(draft.accountId);
    } catch {
      toast("Couldn't load that profile: showing the whole roster");
      commit({ ...draft, mode: "all", accountId: null });
    }
  }
  await loadPool();

  const pool = () => (draft.mode === "profile" && owned ? state.roster.filter((c) => owned[c.uuid] !== undefined) : state.roster);
  const charOf = (uuid) => state.byUuid.get(uuid);
  const code = () => S.toCode(draft, state.user.id);

  // ---------------------------------------------------------------- panel de la grilla
  const countTabs = tabBar([["4", "X4 UNITS"], ["16", "X16 UNITS"]], (n) => { commit(S.setCount(draft, Number(n))); paint(); });
  const slotsBox = h("div", { class: "slots" });
  const filledText = h("span", { class: "hint" });
  const resetBtn = h("button", { class: "mini", onClick: () => { commit(S.clearAll(draft)); paint(); } }, "Reset");
  const gridPanel = h("section", { class: "panel gridpanel" }, countTabs.el,
    h("div", { class: "pbody" }, slotsBox, h("div", { class: "pfoot" }, filledText, resetBtn)));

  // ---------------------------------------------------------------- panel principal
  const mainTabs = tabBar([["roster", "ROSTER"], ["note", "NOTE"], ["share", "SHARE / IMPORT"]], (id) => { pane = id; paintPane(); });

  // -- roster
  const modeTabs = tabBar([["all", "FULL ROSTER"], ["profile", "MY PROFILE"], ["search", "SEARCH"]], (id) => {
    if (id === "search") return toast("Search profile is coming soon");
    switchMode(id);
  }, "sub");
  modeTabs.el.querySelector(":scope > :last-child").classList.add("soon");
  const filter = h("input", { type: "search", placeholder: "Filter by name", onInput: () => applyFilter() });
  const grid = h("div", { class: "grid" });
  const rosterBox = scrollbox(grid, "fill");
  const rosterPane = h("div", { class: "pane roster" }, modeTabs.el, filter, rosterBox);

  // -- nota
  const noteBox = h("textarea", { class: "note", maxlength: String(MAX_DESCRIPTION), placeholder: "Write a note!" });
  const noteCount = h("span", { class: "limit" });
  const notePane = h("div", { class: "pane note" }, h("div", { class: "notewrap" }, noteBox, noteCount));

  // -- compartir / importar
  const codeBtn = h("button", { class: "big yellow", onClick: () => copy(code(), "Squadcode copied ✔") }, "COPY SQUADCODE TO CLIPBOARD");
  const cmdBtn = h("button", { class: "big green", onClick: () => copy(`/squad share squadcode:${code()} private:`, "Command copied ✔") }, "COPY \"/squad\" COMMAND");
  const imgBtn = h("button", { class: "big sky", onClick: () => copyImage() }, "COPY SQUAD IMAGE");
  const importInput = h("input", { class: "code", type: "text", placeholder: "Paste a squadcode…", spellcheck: "false", autocomplete: "off",
    onKeydown: (e) => { if (e.key === "Enter") importCode(); } });
  const importBtn = h("button", { class: "big orange small", onClick: () => importCode() }, "IMPORT");
  const importErr = h("p", { class: "error" });
  const hintShare = h("p", { class: "hint" });
  const sharePane = h("div", { class: "pane share" },
    h("div", { class: "bigs" }, codeBtn, cmdBtn, imgBtn), hintShare,
    h("div", { class: "importrow" }, importInput, importBtn), importErr);

  const panes = { roster: rosterPane, note: notePane, share: sharePane };
  const mainPanel = h("section", { class: "panel mainpanel" }, mainTabs.el, h("div", { class: "pbody" }, rosterPane, notePane, sharePane));

  // ---------------------------------------------------------------- pintado
  function paintSlots() {
    slotsBox.className = `slots n${draft.count}`;
    slotsBox.replaceChildren(...S.visibleSlots(draft).map((uuid, i) => h("button", {
      class: `slot${uuid ? " filled" : ""}`, "data-slot": String(i), "aria-label": `Slot ${i + 1}`,
    }, uuid ? unitIcon(charOf(uuid) || { uuid, name: "?" }) : h("span", { class: "num" }, String(i + 1)))));
  }

  function paintRoster() {
    grid.replaceChildren(...pool().map((char) => h("div", { class: "cell pick", role: "button", "data-uuid": char.uuid, "data-name": charName(char).toLowerCase() },
      unitIcon(char), h("span", { class: "badge" }))));
    if (!pool().length) grid.replaceChildren(h("p", { class: "hint empty" }, "This profile has no unlocked characters yet."));
    applyFilter();
    paintUsed();
  }

  function paintUsed() {
    const where = new Map();
    S.visibleSlots(draft).forEach((uuid, i) => { if (uuid) where.set(uuid, i + 1); });
    for (const cell of grid.querySelectorAll("[data-uuid]")) {
      const n = where.get(Number(cell.dataset.uuid));
      cell.classList.toggle("used", Boolean(n));
      cell.lastElementChild.textContent = n || "";
    }
  }

  function applyFilter() {
    const q = filter.value.trim().toLowerCase();
    for (const cell of grid.querySelectorAll("[data-uuid]")) cell.hidden = Boolean(q) && !cell.dataset.name.includes(q);
    rosterBox.view.scrollTop = 0;
  }

  function paintNote() {
    noteCount.textContent = `${Array.from(draft.description).length > 0 ? `${Array.from(draft.description).length} · ` : ""}character limit: ${MAX_DESCRIPTION}`;
    noteCount.title = `${countNewlines(draft.description)}/${MAX_NEWLINES} line breaks`;
  }

  function paintShare() {
    const value = code();
    codeBtn.disabled = cmdBtn.disabled = imgBtn.disabled = !value;
    hintShare.textContent = value ? "" : `Fill all ${draft.count} slots to share this build.`;
  }

  function paintTabs() {
    const mine = draft.accountId && String(draft.accountId) === String(state.user.id);
    modeTabs.label("profile", draft.mode === "profile" && !mine ? "SHARED PROFILE" : "MY PROFILE");
    modeTabs.set(draft.mode);
    countTabs.set(String(draft.count));
    mainTabs.set(pane);
  }

  function paintPane() {
    for (const [id, el] of Object.entries(panes)) el.hidden = id !== pane;
    mainTabs.set(pane);
    if (pane === "roster") rosterBox.update?.();
  }

  function paint() {
    paintTabs();
    paintSlots();
    paintUsed();
    const filled = S.filledCount(draft);
    filledText.textContent = filled === draft.count ? "Build complete" : `${filled}/${draft.count}`;
    resetBtn.hidden = filled === 0;
    paintShare();
  }

  // ---------------------------------------------------------------- acciones
  async function switchMode(mode) {
    if (draft.mode === mode) return;
    commit({ ...draft, mode, accountId: mode === "profile" ? String(state.user.id) : null });
    await loadPool();
    paintRoster();
    paint();
  }

  /** Tocar un personaje de la lista: si ya esta puesto se quita; si no, va al primer hueco libre. */
  function tapUnit(uuid) {
    const at = S.visibleSlots(draft).indexOf(uuid);
    if (at >= 0) commit(S.clearSlot(draft, at));
    else {
      const next = S.addFirst(draft, uuid);
      if (!next) return toast("All slots are full: drag a unit onto a slot to replace it");
      commit(next);
    }
    paint();
  }

  async function copy(text, done) {
    if (!text) return;
    if (await copyText(text)) return toast(done);
    const area = h("textarea", { class: "note", readonly: true, spellcheck: "false" });
    area.value = text;
    dialog("Copy this text", [h("p", { class: "hint" }, "Your browser blocked the clipboard: select it and copy it by hand."), area],
      (close) => [h("button", { class: "btn", onClick: close }, "Close")]);
    area.focus(); area.select();
  }

  async function squadImage() {
    const cells = S.visibleSlots(draft), cols = 4, rows = Math.ceil(cells.length / cols), size = 128, gap = 8, pad = 16;
    const canvas = h("canvas");
    canvas.width = pad * 2 + cols * size + (cols - 1) * gap;
    canvas.height = pad * 2 + rows * size + (rows - 1) * gap;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#0a3535";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await Promise.all(cells.map((uuid, i) => new Promise((resolve) => {
      const x = pad + (i % cols) * (size + gap), y = pad + Math.floor(i / cols) * (size + gap);
      ctx.fillStyle = "#0b2a3a";
      ctx.fillRect(x, y, size, size);
      const img = new Image();
      img.onload = () => { ctx.drawImage(img, x, y, size, size); resolve(); };
      img.onerror = () => resolve();
      img.src = `/characters/${uuid}.png`;
    })));
    return new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
  }

  async function copyImage() {
    if (!code()) return;
    toast("Making the image…");
    const blob = await squadImage();
    if (!blob) return toast("Couldn't make the image");
    try {
      await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
      return toast("Squad image copied ✔");
    } catch { /* sin permiso: se muestra para guardarla a mano */ }
    const url = URL.createObjectURL(blob);
    dialog("Squad image", [h("img", { class: "preview", src: url, alt: "Squad" }), h("p", { class: "hint" }, "Press and hold (or right-click) the image to copy or save it.")],
      (close) => [h("a", { class: "btn", href: url, download: "squad.png" }, "Download"), h("button", { class: "btn", onClick: () => { close(); URL.revokeObjectURL(url); } }, "Close")]);
  }

  async function importCode() {
    importErr.textContent = "";
    try {
      const next = S.fromDecoded(decode(importInput.value));
      commit(next);
      noteBox.value = next.description;
      importInput.value = "";
      await loadPool();
      paintRoster();
      paintNote();
      paint();
      toast("Build imported ✔");
    } catch (err) {
      importErr.textContent = err instanceof CodeError ? err.message : String(err);
    }
  }

  // ---------------------------------------------------------------- eventos
  grid.addEventListener("click", (event) => {
    const cell = event.target.closest("[data-uuid]");
    if (cell) tapUnit(Number(cell.dataset.uuid));
  });
  slotsBox.addEventListener("click", (event) => {
    const slot = event.target.closest(".slot.filled");
    if (!slot) return;
    commit(S.clearSlot(draft, Number(slot.dataset.slot)));
    paint();
  });
  attachTooltips(grid, (uuid) => unitInfo(charOf(uuid), draft.mode === "profile" ? owned : null), { touch: false });
  noteBox.addEventListener("input", () => {
    const clamped = S.clampDescription(noteBox.value);
    if (clamped !== noteBox.value) noteBox.value = clamped;
    commit({ ...draft, description: clamped });
    paintNote();
    paintShare();
  });

  // ---------------------------------------------------------------- montaje
  const body = h("div", { class: "squad-body" }, gridPanel, mainPanel);
  mount(app, h("div", { class: "screen squad" }, header(() => go("home"), "SQUAD"), body));

  enableDrag({
    root: body,
    source: (el) => {
      const slot = el.closest(".slot.filled");
      if (slot) return { from: "slot", index: Number(slot.dataset.slot), uuid: S.visibleSlots(draft)[Number(slot.dataset.slot)] };
      const cell = el.closest("[data-uuid]");
      return cell ? { from: "list", uuid: Number(cell.dataset.uuid) } : null;
    },
    target: (el, payload) => {
      const slot = el.closest(".slot");
      if (slot) return { el: slot, kind: "slot", index: Number(slot.dataset.slot) };
      if (payload.from === "slot" && el.closest(".mainpanel")) return { el: mainPanel, kind: "remove" };
      return null;
    },
    onDrop: (payload, t) => {
      commit(t.kind === "slot" ? S.placeAt(draft, t.index, payload.uuid) : S.clearSlot(draft, payload.index));
      paint();
    },
    ghost: (payload) => h("div", { class: "ghost-icon" }, unitIcon(charOf(payload.uuid) || { uuid: payload.uuid, name: "?" })),
    onStart: hideTip,
  });

  noteBox.value = draft.description;
  paintRoster();
  paintNote();
  paint();
  paintPane();
}

