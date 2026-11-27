// Piezas de interfaz reutilizables: barra de scroll siempre visible, texto que se desplaza,
// tooltips (ratón y tacto), dialogos, avisos y copiar al portapapeles.
import { h } from "./dom.js";
import { avatarUrl, displayName } from "./user.js";

// ---------------- icono de personaje ----------------
export function unitIcon(char) {
  const fallback = h("span", { class: "fallback" }, char.name.slice(0, 2));
  const img = h("img", { src: `/characters/${char.uuid}.png`, alt: "", loading: "lazy", draggable: "false" });
  img.addEventListener("error", () => img.replaceWith(fallback));
  return img;
}

// ---------------- scroll con barra siempre visible ----------------
// En el movil la barra nativa desaparece sola; esta se queda y muestra de un vistazo lo larga que es la lista.
export function scrollbox(content, cls = "") {
  const view = h("div", { class: "sb-view" }, content);
  const thumb = h("div", { class: "sb-thumb" });
  const track = h("div", { class: "sb-track" }, thumb);
  const box = h("div", { class: `sb ${cls}`.trim() }, view, track);

  const update = () => {
    const { scrollHeight, clientHeight, scrollTop } = view;
    const room = track.clientHeight;
    const overflow = scrollHeight - clientHeight;
    track.classList.toggle("off", overflow <= 1);
    if (overflow <= 1 || !room) return;
    const size = Math.max(36, (room * clientHeight) / scrollHeight);
    thumb.style.height = `${size}px`;
    thumb.style.transform = `translateY(${(room - size) * (scrollTop / overflow)}px)`;
  };
  view.addEventListener("scroll", update, { passive: true });
  const resize = new ResizeObserver(update);
  resize.observe(view);
  resize.observe(content);
  new MutationObserver(update).observe(content, { childList: true, subtree: true, attributes: true, attributeFilter: ["hidden"] });

  thumb.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    thumb.setPointerCapture(event.pointerId);
    const startY = event.clientY;
    const startTop = view.scrollTop;
    const move = (ev) => {
      const room = track.clientHeight - thumb.offsetHeight;
      if (room > 0) view.scrollTop = startTop + ((ev.clientY - startY) * (view.scrollHeight - view.clientHeight)) / room;
    };
    const stop = () => {
      thumb.removeEventListener("pointermove", move);
      thumb.removeEventListener("pointerup", stop);
      thumb.removeEventListener("pointercancel", stop);
    };
    thumb.addEventListener("pointermove", move);
    thumb.addEventListener("pointerup", stop);
    thumb.addEventListener("pointercancel", stop);
  });
  track.addEventListener("pointerdown", (event) => {
    if (event.target !== track) return;
    const rect = thumb.getBoundingClientRect();
    view.scrollBy({ top: (event.clientY < rect.top ? -1 : 1) * view.clientHeight * 0.9, behavior: "smooth" });
  });

  requestAnimationFrame(update);
  return Object.assign(box, { view, update });
}

// ---------------- texto que se desplaza si no cabe ----------------
export function marquee(...children) {
  return h("div", { class: "mq" }, h("span", { class: "mq-in" }, ...children));
}

/** Mide los textos largos y activa la animacion solo en los que no caben. Llamar tras insertarlos en la pagina. */
export function fitMarquees(root = document) {
  requestAnimationFrame(() => {
    for (const box of root.querySelectorAll(".mq")) {
      const inner = box.firstElementChild;
      const over = inner.scrollWidth - box.clientWidth;
      if (box.clientWidth > 0 && over > 2) {
        box.style.setProperty("--mq-shift", `-${over + 6}px`);
        box.style.setProperty("--mq-time", `${Math.max(4, (over + 6) / 28)}s`);
        box.classList.add("run");
      } else {
        box.classList.remove("run");
      }
    }
  });
}
window.addEventListener("resize", () => fitMarquees());

// ---------------- tooltips (ratón: al pasar; tacto: al tocar) ----------------
let tip = null;
let tipTimer = 0;

function tipElement() {
  if (!tip) {
    tip = h("div", { class: "tip", hidden: true });
    document.body.append(tip);
    document.addEventListener("pointerdown", (event) => { if (!event.target.closest("[data-uuid]")) hideTip(); });
  }
  return tip;
}

export function hideTip() {
  if (tip) tip.hidden = true;
}

/** info = { title, sub?, line? } */
export function showTip(target, info) {
  const el = tipElement();
  el.replaceChildren(
    h("strong", {}, info.title),
    info.sub && h("small", {}, info.sub),
    info.line && h("span", {}, info.line));
  el.hidden = false;
  const rect = target.getBoundingClientRect();
  const box = el.getBoundingClientRect();
  const x = Math.min(Math.max(4, rect.left + rect.width / 2 - box.width / 2), window.innerWidth - box.width - 4);
  const above = rect.top - box.height - 6;
  el.style.left = `${x}px`;
  el.style.top = `${above >= 4 ? above : rect.bottom + 6}px`;
}

/** Muestra el tooltip de cualquier hijo con data-uuid. ``describe(uuid)`` devuelve la info o null.
 *  ``touch: false`` = solo con el raton (para cuadriculas donde tocar ya hace otra cosa). */
export function attachTooltips(root, describe, { touch = true } = {}) {
  let kind = "mouse";
  const infoFor = (el) => (el ? describe(Number(el.dataset.uuid)) : null);
  root.addEventListener("pointerdown", (event) => { kind = event.pointerType || "mouse"; });
  root.addEventListener("pointerover", (event) => {
    if (event.pointerType !== "mouse") return;
    const el = event.target.closest("[data-uuid]");
    const info = infoFor(el);
    if (info) showTip(el, info); else hideTip();
  });
  root.addEventListener("pointerleave", (event) => { if (event.pointerType === "mouse") hideTip(); });
  root.addEventListener("click", (event) => {
    if (kind === "mouse" || !touch) return;
    const el = event.target.closest("[data-uuid]");
    const info = infoFor(el);
    if (!info) return hideTip();
    showTip(el, info);
    clearTimeout(tipTimer);
    tipTimer = setTimeout(hideTip, 2600);
  });
  root.addEventListener("scroll", hideTip, true);
}

// ---------------- dialogo ----------------
/** ``actions(close)`` devuelve los botones. Devuelve la funcion para cerrarlo. */
export function dialog(title, body, actions) {
  const onKey = (event) => { if (event.key === "Escape") close(); };
  const close = () => {
    overlay.remove();
    document.removeEventListener("keydown", onKey);
  };
  const overlay = h("div", { class: "overlay", onClick: (event) => { if (event.target === overlay) close(); } },
    h("div", { class: "dialog" }, h("h2", {}, title), ...body, h("div", { class: "actions" }, ...actions(close))));
  document.addEventListener("keydown", onKey);
  document.body.append(overlay);
  return close;
}

// ---------------- aviso breve ----------------
let toastTimer = 0;
export function toast(text) {
  let el = document.querySelector(".toast");
  if (!el) {
    el = h("div", { class: "toast" });
    document.body.append(el);
  }
  el.textContent = text;
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), 2300);
}

// ---------------- portapapeles ----------------
// Dentro de la Activity el navegador puede bloquear el portapapeles: se intenta la via moderna y luego la antigua.
export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch { /* se prueba la via antigua */ }
  const area = h("textarea", { readonly: true, style: "position:fixed;left:-1000px;top:0;opacity:0" });
  area.value = text;
  document.body.append(area);
  area.select();
  area.setSelectionRange(0, text.length);
  let ok = false;
  try { ok = document.execCommand("copy"); } catch { ok = false; }
  area.remove();
  return ok;
}

// ---------------- piezas comunes de pantalla ----------------
export function userChip(user) {
  const url = avatarUrl(user);
  return h("div", { class: "user" },
    url ? h("img", { class: "avatar", src: url, alt: "" }) : h("div", { class: "avatar" }, displayName(user)[0]),
    h("span", {}, "@" + user.username));
}

/** Cabecera: boton de volver, titulo y (opcional) algo a la derecha. */
export function header(onBack, title, right = null) {
  return h("header", {}, onBack && h("button", { class: "btn back", onClick: onBack, title: "Back" }, "←"), h("h1", {}, title), right);
}
