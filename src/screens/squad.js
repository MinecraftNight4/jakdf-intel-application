import { CodeError, MAX_DESCRIPTION, MAX_NEWLINES, countNewlines, decode } from "../../shared/squadCodec.js";
import { h, mount } from "../dom.js";
import { charName, go, loadOwned, state, unitInfo } from "../state.js";
import * as S from "../squadState.js";
import { attachTooltips, copyText, dialog, header, scrollbox, toast, unitIcon } from "../ui.js";

/** Editor de builds. ``opts.mode === "profile"`` abre directamente con el roster de tu cuenta. */
export async function squadScreen(app, opts = {}) {
  let draft = state.draft;
  if (opts.mode === "profile") draft = { ...draft, mode: "profile", accountId: String(state.user.id) };
  let selected = -1;
  let owned = null;                              // { uuid: dupes } de la cuenta de referencia (modo "profile")

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

  // ---------------------------------------------------------------- elementos
  const countButtons = [4, 16].map((n) => h("button", { class: "seg", onClick: () => { commit(S.setCount(draft, n)); selected = -1; paint(); } }, String(n)));
  const tabAll = h("button", { class: "tab", onClick: () => switchMode("all") }, "All the Roster");
  const tabProfile = h("button", { class: "tab", onClick: () => switchMode("profile") });
  const slotsBox = h("div", { class: "slots" });
  const status = h("span", { class: "status" });
  const removeBtn = h("button", { class: "mini", onClick: () => { commit(S.clearSlot(draft, selected)); paint(); } }, "Remove");
  const resetBtn = h("button", { class: "mini", onClick: () => { commit(S.clearAll(draft)); selected = -1; paint(); } }, "Reset");
  const noteCount = h("span", { class: "hint" });
  const noteBox = h("textarea", { class: "note", maxlength: String(MAX_DESCRIPTION), placeholder: "Write a note!" });
  const filter = h("input", { type: "search", placeholder: "Filter by name", onInput: () => applyFilter() });
  const grid = h("div", { class: "grid" });
  const rosterBox = scrollbox(grid, "fill");
  const codeInput = h("input", { class: "code", type: "text", readonly: true, spellcheck: "false", onFocus: (e) => e.target.select() });
  const copyBtn = h("button", { class: "btn blue", onClick: () => copy(code(), "Squadcode copied ✔") }, "Copy code");
  const cmdBtn = h("button", { class: "btn", onClick: () => copy(`/squad share squadcode:${code()} private:`, "Command copied ✔") }, "Copy /squad share");
  const noteBtn = h("button", { class: "btn note-open", onClick: () => editNote() }, "Note ✎");
  const importBtn = h("button", { class: "btn", onClick: () => importCode() }, "Import");

  const code = () => S.toCode(draft, state.user.id);

  // ---------------------------------------------------------------- pintado
  function paintSlots() {
    slotsBox.className = `slots n${draft.count}`;
    slotsBox.replaceChildren(...S.visibleSlots(draft).map((uuid, i) => {
      const char = uuid ? charOf(uuid) : null;
      return h("button", {
        class: `slot${selected === i ? " sel" : ""}${uuid ? " filled" : ""}`, "aria-label": `Slot ${i + 1}`,
        onClick: () => { selected = selected === i ? -1 : i; paint(); },
      }, uuid ? unitIcon(char || { uuid, name: "?" }) : h("span", { class: "num" }, String(i + 1)),
      uuid && h("span", { class: "badge" }, String(i + 1)));
    }));
  }

  function paintStatus() {
    const filled = S.filledCount(draft);
    const char = selected >= 0 && draft.slots[selected] ? charOf(draft.slots[selected]) : null;
    status.textContent = selected >= 0
      ? `Slot ${selected + 1}: ${char ? charName(char) : "tap a character"}`
      : filled === draft.count ? "Build complete" : `${filled}/${draft.count} · tap a character or a slot`;
    removeBtn.hidden = !char;
    resetBtn.hidden = filled === 0;
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

  function paintCode() {
    const value = code();
    codeInput.value = value;
    codeInput.placeholder = `Fill all ${draft.count} slots to get the code`;
    copyBtn.disabled = cmdBtn.disabled = !value;
  }

  function paintNote() {
    const text = draft.description;
    noteCount.textContent = `${Array.from(text).length}/${MAX_DESCRIPTION} · ${countNewlines(text)}/${MAX_NEWLINES} line breaks`;
  }

  function paintTabs() {
    const mine = draft.accountId && String(draft.accountId) === String(state.user.id);
    tabProfile.textContent = draft.mode === "profile" && !mine ? "Shared profile" : "My profile";
    tabAll.classList.toggle("on", draft.mode === "all");
    tabProfile.classList.toggle("on", draft.mode === "profile");
    countButtons.forEach((b, i) => b.classList.toggle("on", [4, 16][i] === draft.count));
  }

  function paint() {
    paintTabs();
    paintSlots();
    paintStatus();
    paintUsed();
    paintCode();
  }

  // ---------------------------------------------------------------- acciones
  async function switchMode(mode) {
    if (draft.mode === mode) return;
    commit({ ...draft, mode, accountId: mode === "profile" ? String(state.user.id) : null });
    await loadPool();
    paintRoster();
    paint();
  }

  function pick(uuid) {
    const at = S.visibleSlots(draft).indexOf(uuid);
    if (selected < 0 && at >= 0) {                    // sin casilla elegida, tocar uno que ya esta lo quita
      commit(S.clearSlot(draft, at));
    } else {
      const result = S.place(draft, selected, uuid);
      if (!result) return toast("All slots are full: tap a slot to replace it");
      commit(result.draft);
      selected = result.selected;
    }
    paint();
  }

  async function copy(text, done) {
    if (!text) return;
    toast((await copyText(text)) ? done : "Couldn't copy: press and hold the code to copy it");
  }

  function editNote() {
    const area = h("textarea", { class: "note", maxlength: String(MAX_DESCRIPTION), placeholder: "Write a note!" });
    const counter = h("span", { class: "hint" });
    area.value = draft.description;
    const sync = () => { counter.textContent = `${Array.from(area.value).length}/${MAX_DESCRIPTION} · ${countNewlines(area.value)}/${MAX_NEWLINES} line breaks`; };
    area.addEventListener("input", () => {
      const clamped = S.clampDescription(area.value);
      if (clamped !== area.value) area.value = clamped;
      sync();
    });
    sync();
    dialog("Build note", [area, counter], (close) => [
      h("button", { class: "btn green", onClick: () => { noteBox.value = area.value; setNote(area.value); close(); } }, "Done"),
      h("button", { class: "btn", onClick: close }, "Cancel"),
    ]);
    area.focus();
  }

  function setNote(text) {
    commit({ ...draft, description: S.clampDescription(text) });
    paintNote();
    paintCode();
  }

  function importCode() {
    const area = h("textarea", { class: "note", placeholder: "Paste a squadcode…", spellcheck: "false" });
    const error = h("p", { class: "error" });
    dialog("Import squadcode", [area, error], (close) => [
      h("button", { class: "btn green", onClick: async () => {
        try {
          const next = S.fromDecoded(decode(area.value));
          commit(next);
          selected = -1;
          noteBox.value = next.description;
          await loadPool();
          paintRoster();
          paintNote();
          paint();
          close();
        } catch (err) {
          error.textContent = err instanceof CodeError ? err.message : String(err);
        }
      } }, "Import"),
      h("button", { class: "btn", onClick: close }, "Cancel"),
    ]);
    area.focus();
  }

  grid.addEventListener("click", (event) => {
    const cell = event.target.closest("[data-uuid]");
    if (cell) pick(Number(cell.dataset.uuid));
  });
  attachTooltips(grid, (uuid) => unitInfo(charOf(uuid), draft.mode === "profile" ? owned : null), { touch: false });
  noteBox.addEventListener("input", () => {
    const clamped = S.clampDescription(noteBox.value);
    if (clamped !== noteBox.value) noteBox.value = clamped;
    setNote(clamped);
  });

  // ---------------------------------------------------------------- montaje
  mount(app, h("div", { class: "screen squad" },
    header(() => go("home"), "SQUAD", h("div", { class: "segs" }, countButtons)),
    h("div", { class: "squad-body" },
      h("div", { class: "left" },
        slotsBox,
        h("div", { class: "status-row" }, status, removeBtn, resetBtn),
        h("div", { class: "notebox" }, noteBox, noteCount)),
      h("div", { class: "right" },
        h("div", { class: "tabs" }, tabAll, tabProfile),
        filter,
        rosterBox)),
    h("div", { class: "bar wrap" },
      codeInput, copyBtn,
      h("div", { class: "row2" }, noteBtn, cmdBtn, importBtn))));

  noteBox.value = draft.description;
  paintRoster();
  paintNote();
  paint();
}
