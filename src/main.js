import { unzlibSync, zlibSync } from "fflate";
import { pack, unpack, MAX_DUPES } from "../shared/profileCodec.js";
import { CodeError, configureZlib, decode } from "../shared/squadCodec.js";
import { getProfile, getRoster, saveProfile, setToken } from "./api.js";
import { avatarUrl, displayName, login } from "./discord.js";
import { h, mount } from "./dom.js";
import "./styles.css";

configureZlib({ deflate: (b) => zlibSync(b, { level: 9 }), inflate: (b) => unzlibSync(b) });

const app = document.getElementById("app");
const state = { user: null, roster: [], byUuid: new Map(), owned: {} };

const back = (go) => h("button", { class: "btn back", onClick: go, title: "Back" }, "←");

function unitIcon(char) {
  const fallback = h("span", { class: "fallback" }, char.name.slice(0, 2));
  const img = h("img", { src: `/characters/${char.uuid}.png`, alt: "", loading: "lazy" });
  img.addEventListener("error", () => img.replaceWith(fallback));
  return img;
}

function userChip(user) {
  const url = avatarUrl(user);
  return h("div", { class: "user" },
    url ? h("img", { class: "avatar", src: url, alt: "" }) : h("div", { class: "avatar" }, displayName(user)[0]),
    h("span", {}, "@" + user.username));
}

// ---------------- inicio ----------------
function home() {
  mount(app,
    h("div", { class: "news" }, "Carrusel de noticias (proximamente)"),
    h("div", { class: "menu" },
      h("button", { class: "tile squad", onClick: squad }, h("span", { class: "big" }, "⚔"), "SQUAD"),
      h("button", { class: "tile profile", onClick: () => profile() }, h("span", { class: "big" }, "🪪"), "PROFILE")),
    h("footer", {}, `v${__APP_VERSION__}`, userChip(state.user)));
}

// ---------------- squad (por ahora: solo lee un squadcode) ----------------
function squad() {
  const out = h("div", { class: "decoded" });
  const input = h("input", { type: "text", placeholder: "Pega un squadcode…", spellcheck: "false" });
  const show = () => {
    try {
      const build = decode(input.value);
      out.replaceChildren(
        h("p", {}, `${build.slots.length} slots · creador ${build.creatorId}${build.accountId ? ` · cuenta ${build.accountId}` : ""}`),
        h("div", { class: "grid small" }, build.slots.map((uuid) => {
          const char = state.byUuid.get(uuid);
          return h("div", { class: "cell", title: char ? char.name : "(vacio)" }, char ? unitIcon(char) : h("span", { class: "fallback" }, "·"));
        })),
        build.description && h("p", { class: "note" }, build.description));
    } catch (err) {
      out.replaceChildren(h("p", { class: "error" }, err instanceof CodeError ? err.message : String(err)));
    }
  };
  input.addEventListener("input", show);
  mount(app,
    h("header", {}, back(home), h("h1", {}, "SQUAD")),
    h("p", {}, "El editor de builds llegara pronto. Mientras tanto, esto comprueba que la Activity lee los codigos del bot:"),
    input, out);
}

// ---------------- perfil ----------------
async function profile() {
  mount(app, h("p", { class: "loading" }, "Cargando perfil…"));
  try {
    state.owned = unpack((await getProfile()).data);
  } catch (err) {
    return mount(app, h("header", {}, back(home)), h("p", { class: "error" }, err.message));
  }
  profileView();
}

function profileView() {
  const cells = state.roster.map((char) => {
    const dupes = state.owned[char.uuid];
    const has = dupes !== undefined;
    return h("div", { class: `cell${has ? "" : " locked"}`, title: has ? `${char.prefix} ${char.name} · ${dupes} dupes` : `${char.name} (not unlocked)` },
      unitIcon(char), has && dupes > 0 && h("span", { class: "dupes" }, `★${dupes}`));
  });
  mount(app,
    h("header", {}, back(home), h("h1", {}, "PROFILE"), userChip(state.user)),
    h("div", { class: "grid" }, cells),
    h("p", { class: "hint" }, `${Object.keys(state.owned).length} / ${state.roster.length} personajes`),
    h("div", { class: "actions" }, h("button", { class: "btn green", onClick: profileEdit }, "Edit my profile")));
}

function profileEdit() {
  const original = pack(state.owned);
  const owned = { ...state.owned };
  const message = h("span", { class: "hint" });
  const save = h("button", { class: "btn green" }, "Save");
  const dirty = () => pack(owned) !== original;
  const sync = () => { save.disabled = !dirty(); };

  const rows = state.roster.map((char) => {
    const row = h("div", { class: "row", "data-name": `${char.prefix} ${char.name}`.toLowerCase() });
    const paint = () => {
      const dupes = owned[char.uuid];
      const has = dupes !== undefined;
      row.className = `row${has ? "" : " locked"}`;
      row.replaceChildren(
        h("div", { class: "cell" }, unitIcon(char)),
        h("div", { class: "who" }, h("small", {}, char.prefix), char.name),
        h("button", { class: `own${has ? " on" : ""}`, title: has ? "Remove" : "Add", onClick: () => {
          if (has) delete owned[char.uuid]; else owned[char.uuid] = 0;
          paint(); sync();
        } }, has ? "✔" : "＋"),
        ...Array.from({ length: MAX_DUPES }, (_, i) => h("button", {
          class: `star${has && dupes > i ? " on" : ""}`, disabled: !has, title: `${i + 1} dupes`,
          onClick: () => { owned[char.uuid] = dupes === i + 1 ? i : i + 1; paint(); sync(); },
        }, "★")));
    };
    paint();
    return row;
  });

  const filter = h("input", { type: "search", placeholder: "Filter by name", onInput: (e) => {
    const q = e.target.value.trim().toLowerCase();
    for (const row of rows) row.hidden = q && !row.dataset.name.includes(q);
  } });

  save.addEventListener("click", async () => {
    save.disabled = true;
    message.textContent = "Guardando…";
    try {
      await saveProfile(pack(owned));
      state.owned = { ...owned };
      message.textContent = "Guardado ✔ (el bot lo vera en unos minutos)";
      setTimeout(profileView, 900);
    } catch (err) {
      message.textContent = err.message;
      sync();
    }
  });
  sync();
  mount(app,
    h("header", {}, back(profileView), h("h1", {}, "EDIT PROFILE"), userChip(state.user)),
    filter, h("div", { class: "list" }, rows),
    h("div", { class: "actions" }, save, message));
}

// ---------------- arranque ----------------
(async () => {
  mount(app, h("p", { class: "loading" }, "Conectando con Discord…"));
  try {
    const session = await login();
    setToken(session.token);
    state.user = session.user;
    state.roster = await getRoster();
    state.byUuid = new Map(state.roster.map((c) => [c.uuid, c]));
    home();
  } catch (err) {
    console.error(err);
    mount(app, h("p", { class: "error" }, `No se pudo iniciar: ${err.message}`),
      h("p", { class: "hint" }, "Esta pagina solo funciona dentro de Discord (Activity)."));
  }
})();
