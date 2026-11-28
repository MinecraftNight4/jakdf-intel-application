import { CodeError, MAX_DESCRIPTION, MAX_NEWLINES, countNewlines, decode } from "../../shared/squadCodec.js";
import { searchProfiles, uploadShareImage } from "../api.js";
import { sdk } from "../discord.js";
import { enableDrag } from "../drag.js";
import { h, mount } from "../dom.js";
import { charName, go, loadOwned, state, unitInfo } from "../state.js";
import * as S from "../squadState.js";
import { displayName } from "../user.js";
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
  let searching = false;                         // la pestaña SEARCH esta abierta (caja de busqueda visible)

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
    if (id === "search") return openSearch();
    switchMode(id);
  }, "sub");
  const searchInput = h("input", { type: "search", placeholder: "Search a username or ID…", autocomplete: "off", spellcheck: "false", onInput: () => scheduleSearch() });
  const results = h("div", { class: "results" });
  const searchView = h("div", { class: "searchview" }, searchInput, results);
  searchView.hidden = true;
  const filter = h("input", { type: "search", placeholder: "Filter by name", onInput: () => applyFilter() });
  const grid = h("div", { class: "grid" });
  const rosterBox = scrollbox(grid, "fill");
  const rosterPane = h("div", { class: "pane roster" }, modeTabs.el, searchView, filter, rosterBox);

  // -- nota
  const noteBox = h("textarea", { class: "note", maxlength: String(MAX_DESCRIPTION), placeholder: "Write a note!" });
  const noteCount = h("span", { class: "limit" });
  const notePane = h("div", { class: "pane note" }, h("div", { class: "notewrap" }, noteBox, noteCount));

  // -- compartir / importar
  const codeBtn = h("button", { class: "big yellow", onClick: () => copy(code(), "Squadcode copied ✔") }, "COPY SQUADCODE TO CLIPBOARD");
  const cmdBtn = h("button", { class: "big green", onClick: () => copy(`/squad share squadcode:${code()} private:`, "Command copied ✔") }, "COPY \"/squad\" COMMAND");
  const imgBtn = h("button", { class: "big sky", onClick: () => shareImage() }, "SHARE SQUAD IMAGE");
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

  const viewingOther = () => draft.mode === "profile" && draft.accountId && String(draft.accountId) !== String(state.user.id);

  function paintTabs() {
    const other = viewingOther();
    const name = other ? state.names.get(String(draft.accountId)) : null;
    modeTabs.label("search", other ? (name ? `@${name}` : "SHARED") : "SEARCH");
    modeTabs.set(searching || other ? "search" : draft.mode);
    searchView.hidden = !searching;
    filter.hidden = rosterBox.hidden = searching;
    if (!searching) queueMicrotask(() => rosterBox.update?.());
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
    const account = mode === "profile" ? String(state.user.id) : null;
    searching = false;
    if (draft.mode === mode && (draft.accountId ? String(draft.accountId) : null) === account) return paint();
    commit({ ...draft, mode, accountId: account });
    await loadPool();
    paintRoster();
    paint();
  }

  function openSearch() {
    searching = true;
    paint();
    if (!searchInput.matches(":focus")) searchInput.focus({ preventScroll: true });
  }

  /** Elegir un jugador de los resultados: su roster pasa a ser la lista (modo "profile" de otra cuenta). */
  async function openAccount(userId, username) {
    searching = false;
    state.names.set(String(userId), username);
    commit({ ...draft, mode: "profile", accountId: String(userId) });
    await loadPool();
    paintRoster();
    paint();
  }

  let searchTimer = 0, searchSeq = 0;
  function scheduleSearch() {
    clearTimeout(searchTimer);
    const q = searchInput.value.trim();
    if (q.replace(/^@/, "").length < 2) { results.replaceChildren(h("p", { class: "hint" }, "Type at least 2 characters.")); return; }
    results.replaceChildren(h("p", { class: "hint" }, "Searching…"));
    searchTimer = setTimeout(async () => {
      const mine = ++searchSeq;
      try {
        const found = await searchProfiles(q);
        if (mine !== searchSeq) return;                       // llego una busqueda mas nueva
        results.replaceChildren(...(found.length
          ? found.map((p) => h("button", { class: "res", onClick: () => openAccount(p.userId, p.username) },
              h("span", { class: "at" }, `@${p.username}`), h("span", { class: "id" }, p.userId)))
          : [h("p", { class: "hint" }, "No players found. They need to have saved a profile.")]));
      } catch (err) {
        if (mine === searchSeq) results.replaceChildren(h("p", { class: "error" }, err.message));
      }
    }, 350);
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

  // Imagen de la build: titulo con el nombre del jugador, retratos con su nombre y la nota abajo.
  async function squadImage() {
    const cells = S.visibleSlots(draft), cols = 4, rows = Math.ceil(cells.length / cols);
    const size = 128, gap = 10, pad = 18, label = 22, head = 54;
    const width = pad * 2 + cols * size + (cols - 1) * gap;
    const note = draft.description.trim();
    const noteLines = note ? wrapLines(note, 58) : [];
    const foot = noteLines.length ? 14 + noteLines.length * 20 : 0;
    const height = head + pad + rows * (size + label) + (rows - 1) * gap + pad + foot;
    try { await document.fonts.load('24px "Bungee"'); } catch { /* sin fuente: se usa la de respaldo */ }

    const canvas = h("canvas");
    canvas.width = width; canvas.height = height;
    const ctx = canvas.getContext("2d");
    const sky = ctx.createLinearGradient(0, 0, 0, height);
    sky.addColorStop(0, "#248687"); sky.addColorStop(1, "#06161a");
    ctx.fillStyle = sky; ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = "#0006"; ctx.fillRect(0, 0, width, head);
    ctx.fillStyle = "#fff"; ctx.textBaseline = "middle";
    ctx.font = '24px "Bungee", sans-serif';
    ctx.fillText(fit(ctx, `${displayName(state.user)}'s squad`, width - pad * 2), pad, head / 2);

    await Promise.all(cells.map((uuid, i) => new Promise((resolve) => {
      const x = pad + (i % cols) * (size + gap), y = head + pad + Math.floor(i / cols) * (size + label + gap);
      ctx.fillStyle = "#0b2a3a"; ctx.fillRect(x, y, size, size);
      const char = charOf(uuid);
      ctx.fillStyle = "#fff"; ctx.font = '13px "Gothic", sans-serif'; ctx.textBaseline = "middle";
      ctx.fillText(fit(ctx, char ? char.name : "?", size), x, y + size + label / 2);
      const img = new Image();
      img.onload = () => { ctx.drawImage(img, x, y, size, size); resolve(); };
      img.onerror = () => resolve();
      img.src = `/characters/${uuid}.png`;
    })));

    if (noteLines.length) {
      ctx.fillStyle = "#ffffffcc"; ctx.font = '14px "Gothic", sans-serif';
      noteLines.forEach((line, i) => ctx.fillText(line, pad, height - foot + 14 + i * 20 + 6));
    }
    return new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
  }

  /** Comparte la imagen como lo hace Wordle: dialogo de Discord, el mensaje lo envia el propio usuario. */
  async function shareImage() {
    if (!code()) return;
    toast("Making the image…");
    const blob = await squadImage();
    if (!blob) return toast("Couldn't make the image");
    try {
      const mediaUrl = await uploadShareImage(blob);
      await sdk.commands.openShareMomentDialog({ mediaUrl });
      return;
    } catch (err) {
      console.warn("Share Moment no disponible:", err);
    }
    try {                                              // plan B: portapapeles
      await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
      return toast("Sharing isn't available here: image copied instead ✔");
    } catch { /* plan C: mostrarla */ }
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


/** Recorta el texto con "…" para que quepa en ``max`` pixeles. */
function fit(ctx, text, max) {
  if (ctx.measureText(text).width <= max) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(`${t}…`).width > max) t = t.slice(0, -1);
  return `${t}…`;
}

/** Parte un texto en lineas de ~``width`` caracteres, respetando los saltos de linea (maximo 6 lineas). */
function wrapLines(text, width) {
  const out = [];
  for (const para of text.split("\n")) {
    let line = "";
    for (const word of para.split(/\s+/).filter(Boolean)) {
      if (line && `${line} ${word}`.length > width) { out.push(line); line = word; } else line = line ? `${line} ${word}` : word;
    }
    out.push(line);
  }
  return out.slice(0, 6);
}
