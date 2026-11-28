import { CodeError, MAX_DESCRIPTION, MAX_NEWLINES, countNewlines, decode } from "../../shared/squadCodec.js";
import { searchProfiles, uploadShareImage } from "../api.js";
import { sdk } from "../discord.js";
import { enableDrag } from "../drag.js";
import { h, mount } from "../dom.js";
import { icon } from "../icons.js";
import { squadImage } from "../shareImage.js";
import { charName, go, loadOwned, state, unitInfo } from "../state.js";
import * as S from "../squadState.js";
import { attachTooltips, copyText, dialog, header, hideTip, scrollbox, toast, unitIcon } from "../ui.js";

/** Fila de pestañas (la activa se funde con el panel). ``items`` = [[id, texto, icono?], ...]. */
function tabBar(items, onPick, cls = "") {
  const labels = new Map();
  const buttons = new Map(items.map(([id, text, ico]) => {
    const label = h("span", { class: "lbl" }, text);
    labels.set(id, label);
    return [id, h("button", { class: "ptab", onClick: () => onPick(id) }, ico && icon(ico), label)];
  }));
  return {
    el: h("div", { class: `ptabs ${cls}`.trim() }, ...buttons.values()),
    set(active) { buttons.forEach((b, id) => b.classList.toggle("on", id === active)); },
    label(id, text) { labels.get(id).textContent = text; },
  };
}

/** Boton grande con el icono encima del texto. */
const bigButton = (cls, ico, text, onClick) => h("button", { class: `big ${cls}`, onClick }, icon(ico), h("span", {}, text));

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
  const mainTabs = tabBar([["roster", "ROSTER", "apps"], ["note", "NOTE", "notes"], ["share", "SHARE / IMPORT", "share"]], (id) => { pane = id; paintPane(); });

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
  const codeBtn = bigButton("yellow", "qr_code_scanner", "COPY SQUADCODE TO CLIPBOARD", () => copy(code(), "Squadcode copied ✔"));
  const cmdBtn = bigButton("green", "terminal_add", "COPY \"/squad\" COMMAND", () => copy(`/squad share squadcode:${code()} private:`, "Command copied ✔"));
  // Compartir la imagen abre el dialogo de Discord, que en el movil no esta disponible: alli el boton no se muestra.
  const imgBtn = document.documentElement.dataset.platform === "mobile" ? null : bigButton("sky", "document_share", "SHARE SQUAD IMAGE", () => shareImage());
  const importInput = h("input", { class: "code", type: "text", placeholder: "Paste a squadcode…", spellcheck: "false", autocomplete: "off",
    onKeydown: (e) => { if (e.key === "Enter") importCode(); } });
  const importBtn = h("button", { class: "big orange small", onClick: () => importCode() }, "IMPORT");
  const hintShare = h("p", { class: "hint" });
  const sharePane = h("div", { class: "pane share" },
    h("div", { class: "bigs" }, codeBtn, cmdBtn, imgBtn), hintShare,
    h("div", { class: "importrow" }, importInput, importBtn));

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
    noteCount.textContent = `character limit: ${MAX_DESCRIPTION - Array.from(draft.description).length}`;
    noteCount.title = `${countNewlines(draft.description)}/${MAX_NEWLINES} line breaks`;
  }

  function paintShare() {
    const value = code();
    codeBtn.disabled = cmdBtn.disabled = !value;
    if (imgBtn) imgBtn.disabled = !value;
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

  // Imagen de la build: la misma disposicion que dibuja el bot (ver shareImage.js).
  function buildImage() {
    const account = draft.mode === "profile" && draft.accountId ? String(draft.accountId) : null;
    let title = `BUILD MADE BY @${state.user.username}`;
    if (account) title += ` - @${state.names.get(account) || account} ACCOUNT`;
    return squadImage({ slots: S.visibleSlots(draft), title, description: draft.description.trim(), byUuid: state.byUuid });
  }

  /** Comparte la imagen como lo hace Wordle: dialogo de Discord, el mensaje lo envia el propio usuario. */
  async function shareImage() {
    if (!code()) return;
    toast("Making the image…");
    const blob = await buildImage();
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

  function importProblem(message) {
    dialog("Couldn't import the build", [h("p", {}, message)], (close) => [h("button", { class: "btn", onClick: close }, "OK")]);
  }

  async function importCode() {
    const text = importInput.value.trim();
    if (!text) return importProblem("Paste a squadcode first.");
    let next;
    try {
      next = S.fromDecoded(decode(text));
    } catch (err) {
      return importProblem(err instanceof CodeError ? err.message : "That doesn't look like a valid squadcode.");
    }
    commit(next);
    noteBox.value = next.description;
    importInput.value = "";
    await loadPool();
    paintRoster();
    paintNote();
    paint();
    pane = "note";                                   // la build ya esta cargada: se pasa a la nota
    paintPane();
    toast("Build imported ✔");
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
  attachTooltips(grid, (uuid) => unitInfo(charOf(uuid), null), { touch: false });
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
