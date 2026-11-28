// Carrusel de noticias de la pantalla principal: tarjetas deslizables, avance automatico y puntos.
import { sdk } from "./discord.js";
import { h } from "./dom.js";

const ADVANCE_MS = 6000;

/** Dentro de Discord los enlaces se abren con el SDK (la Activity no puede navegar fuera). */
async function openLink(url) {
  try { await sdk.commands.openExternalLink({ url }); } catch { window.open(url, "_blank", "noopener"); }
}

const alive = (item, now = Date.now() / 1000) => !item.expire || item.expire > now;

/** ``items`` = noticias de /api/news. Devuelve el elemento, o null si no queda ninguna vigente. */
export function newsCarousel(items) {
  const list = items.filter((item) => alive(item));
  if (!list.length) return null;

  const cards = list.map((item) => h("button", { class: "card", onClick: () => openLink(item.url), title: item.text },
    item.image ? h("img", { src: item.image, alt: "", draggable: "false" }) : h("div", { class: "noimg" }),
    h("span", { class: "cap" }, item.text)));
  const track = h("div", { class: "track" }, cards);
  const dots = list.map((_, i) => h("button", { class: "dot", "aria-label": `News ${i + 1}`, onClick: () => show(i) }));
  const prev = h("button", { class: "nav prev", "aria-label": "Previous", onClick: () => show(index() - 1) }, "‹");
  const next = h("button", { class: "nav next", "aria-label": "Next", onClick: () => show(index() + 1) }, "›");
  const root = h("div", { class: "news" }, track, list.length > 1 && prev, list.length > 1 && next,
    list.length > 1 && h("div", { class: "dots" }, dots));

  const index = () => Math.round(track.scrollLeft / Math.max(1, track.clientWidth));
  function show(i) {
    const to = (i + list.length) % list.length;
    track.scrollTo({ left: to * track.clientWidth, behavior: "smooth" });
  }
  const mark = () => dots.forEach((d, i) => d.classList.toggle("on", i === index()));
  track.addEventListener("scroll", mark, { passive: true });
  requestAnimationFrame(mark);

  if (list.length > 1) {                                         // avance automatico; se detiene al tocarlo
    let paused = false;
    const stop = () => { paused = true; };
    root.addEventListener("pointerdown", stop);
    root.addEventListener("pointerenter", stop);
    root.addEventListener("pointerleave", () => { paused = false; });
    const timer = setInterval(() => {
      if (!root.isConnected) return clearInterval(timer);
      if (!paused) show(index() + 1);
    }, ADVANCE_MS);
  }
  return root;
}
