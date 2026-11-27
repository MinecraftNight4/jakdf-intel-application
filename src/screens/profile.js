import { MAX_DUPES, pack } from "../../shared/profileCodec.js";
import { saveProfile } from "../api.js";
import { h, mount } from "../dom.js";
import { go, loadOwned, state, unitInfo } from "../state.js";
import { attachTooltips, fitMarquees, header, marquee, scrollbox, unitIcon, userChip } from "../ui.js";

const plural = (n) => `${n} dupe${n === 1 ? "" : "s"}`;

// ---------------------------------------------------------------- ver perfil
export async function profileScreen(app) {
  mount(app, h("p", { class: "loading" }, "Cargando perfil…"));
  let owned;
  try {
    owned = await loadOwned(undefined, true);
  } catch (err) {
    return mount(app, h("div", { class: "screen" }, header(() => go("home"), "PROFILE"), h("p", { class: "error" }, err.message)));
  }

  const grid = h("div", { class: "grid" }, state.roster.map((char) => {
    const dupes = owned[char.uuid];
    const has = dupes !== undefined;
    return h("div", { class: `cell${has ? "" : " locked"}`, "data-uuid": char.uuid },
      unitIcon(char), has && dupes > 0 && h("span", { class: "dupes" }, `★${dupes}`));
  }));
  attachTooltips(grid, (uuid) => unitInfo(state.byUuid.get(uuid), owned));

  mount(app, h("div", { class: "screen" },
    header(() => go("home"), "PROFILE", userChip(state.user)),
    scrollbox(grid, "fill"),
    h("div", { class: "bar" },
      h("span", { class: "hint" }, `${Object.keys(owned).length} / ${state.roster.length} unlocked`),
      h("span", { class: "grow" }),
      h("button", { class: "btn blue", onClick: () => go("squad", { mode: "profile" }) }, "Use this roster"),
      h("button", { class: "btn green", onClick: () => go("profileEdit") }, "Edit my profile"))));
}

// ---------------------------------------------------------------- editar perfil
export async function profileEditScreen(app) {
  const original = await loadOwned();
  const owned = { ...original };
  const savedText = pack(original);
  const dirty = () => pack(owned) !== savedText;

  const message = h("span", { class: "hint" });
  const counter = h("span", { class: "hint" });
  const save = h("button", { class: "btn green" }, "Save");
  const sync = () => {
    save.disabled = !dirty();
    counter.textContent = `${Object.keys(owned).length} / ${state.roster.length} unlocked`;
  };

  const rows = state.roster.map((char) => {
    const controls = h("div", { class: "ctl" });
    const paint = () => {
      const dupes = owned[char.uuid];
      const has = dupes !== undefined;
      row.classList.toggle("locked", !has);
      controls.replaceChildren(
        h("button", { class: `own${has ? " on" : ""}`, onClick: () => {
          if (has) delete owned[char.uuid]; else owned[char.uuid] = 0;
          paint();
          sync();
        } }, has ? "✔ Owned" : "+ Add"),
        ...Array.from({ length: MAX_DUPES }, (_, i) => h("button", {
          class: `star${has && dupes > i ? " on" : ""}`, disabled: !has, title: plural(i + 1), "aria-label": plural(i + 1),
          onClick: () => {
            owned[char.uuid] = dupes === i + 1 ? i : i + 1;      // tocar la ultima estrella encendida la apaga
            paint();
            sync();
          },
        }, "★")));
    };
    const row = h("div", { class: "row", "data-name": `${char.prefix} ${char.name}`.toLowerCase() },
      h("div", { class: "cell" }, unitIcon(char)),
      h("div", { class: "info" },
        marquee(h("small", {}, char.prefix), " ", h("strong", {}, char.name)),
        controls));
    paint();
    return row;
  });

  const list = h("div", { class: "list" }, rows);
  const box = scrollbox(list, "fill");
  const filter = h("input", { type: "search", placeholder: "Filter by name", onInput: (event) => {
    const q = event.target.value.trim().toLowerCase();
    for (const row of rows) row.hidden = Boolean(q) && !row.dataset.name.includes(q);
    box.view.scrollTop = 0;
    fitMarquees(list);
  } });

  save.addEventListener("click", async () => {
    save.disabled = true;
    message.textContent = "Guardando…";
    try {
      await saveProfile(pack(owned));
      state.ownedBy.set(String(state.user.id), { ...owned });
      message.textContent = "Saved ✔ (the bot will see it in a few minutes)";
      setTimeout(() => go("profile"), 900);
    } catch (err) {
      message.textContent = err.message;
      sync();
    }
  });

  mount(app, h("div", { class: "screen" },
    header(() => go("profile"), "EDIT PROFILE", userChip(state.user)),
    filter, box,
    h("div", { class: "bar" }, save, counter, message)));
  sync();
  fitMarquees(list);
}
