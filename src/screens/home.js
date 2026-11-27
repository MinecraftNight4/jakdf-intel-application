import { h, mount } from "../dom.js";
import { go, state } from "../state.js";
import { userChip } from "../ui.js";

export function homeScreen(app) {
  mount(app, h("div", { class: "screen home" },
    h("div", { class: "news" }, "Carrusel de noticias (proximamente)"),
    h("div", { class: "menu" },
      h("button", { class: "tile squad", onClick: () => go("squad") }, h("span", { class: "big" }, "⚔"), "SQUAD"),
      h("button", { class: "tile profile", onClick: () => go("profile") }, h("span", { class: "big" }, "🪪"), "PROFILE")),
    h("footer", {}, `v${__APP_VERSION__}`, userChip(state.user))));
}
