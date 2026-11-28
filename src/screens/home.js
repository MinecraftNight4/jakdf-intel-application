import { getNews } from "../api.js";
import { h, mount } from "../dom.js";
import { icon } from "../icons.js";
import { newsCarousel } from "../news.js";
import { go, state } from "../state.js";
import { userChip } from "../ui.js";

export function homeScreen(app) {
  const newsSlot = h("div", { class: "newsslot" });
  mount(app, h("div", { class: "screen home" },
    newsSlot,
    h("div", { class: "menu" },
      h("button", { class: "tile squad", onClick: () => go("squad") }, icon("strategy"), "SQUAD BUILDER"),
      h("button", { class: "tile profile", onClick: () => go("profile") }, icon("assignment_ind"), "PROFILE")),
    h("footer", {}, `v${__APP_VERSION__}`, userChip(state.user))));

  // Las noticias llegan despues: si fallan o no hay ninguna vigente, el hueco simplemente no aparece.
  getNews().then((items) => {
    const carousel = newsCarousel(items);
    if (carousel && newsSlot.isConnected) newsSlot.replaceChildren(carousel);
  }).catch((err) => console.warn("Noticias no disponibles:", err));
}
