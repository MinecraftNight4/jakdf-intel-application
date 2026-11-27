// Arrastrar y soltar con eventos de puntero (funciona con raton y con dedo; el drag nativo de HTML5 no va en movil).
//
//   enableDrag({
//     root,                       // contenedor: se escuchan los eventos aqui (delegacion)
//     source(el)  -> payload|null // que se arrastra si se empezo sobre ``el`` (null = nada)
//     target(el, payload) -> {el, ...}|null  // que hay para soltar bajo el puntero
//     onDrop(payload, target),
//     ghost(payload) -> Node,     // lo que sigue al puntero
//   })
//
// - Raton/lapiz: empieza al mover unos pixeles (un clic normal sigue siendo clic).
// - Dedo: ``holdMs`` = mantener pulsado un momento antes de arrastrar, para no pelear con el scroll de las listas.
//   Con holdMs 0 (la grilla, que no hace scroll) empieza al mover.
// - Tras un arrastre se suprime el clic que el navegador lanza al soltar.

const MOVE_PX = 6;

export function enableDrag({ root, source, target, onDrop, ghost, holdMs = 220, onStart, onEnd }) {
  let press = null;       // { id, x, y, payload, type, timer }
  let drag = null;        // { payload, node, over }

  const dist = (e) => Math.hypot(e.clientX - press.x, e.clientY - press.y);

  function begin(e) {
    const node = h(ghost(press.payload));
    document.body.append(node);
    drag = { payload: press.payload, node, over: null };
    document.body.classList.add("dragging");
    onStart?.(press.payload);
    place(e);
  }

  function place(e) {
    drag.node.style.transform = `translate(${e.clientX}px, ${e.clientY}px) translate(-50%, -60%)`;
    const el = document.elementFromPoint(e.clientX, e.clientY);
    const hit = el && root.ownerDocument.body.contains(el) ? target(el, drag.payload) : null;
    if (drag.over?.el !== hit?.el) {
      drag.over?.el?.classList.remove("drop-ok");
      hit?.el?.classList.add("drop-ok");
    }
    drag.over = hit;
  }

  function finish(commit) {
    clearTimeout(press?.timer);
    document.removeEventListener("pointermove", onMove);
    document.removeEventListener("pointerup", onUp);
    document.removeEventListener("pointercancel", onCancel);
    document.removeEventListener("touchmove", onTouchMove);
    if (drag) {
      drag.node.remove();
      drag.over?.el?.classList.remove("drop-ok");
      document.body.classList.remove("dragging");
      const done = { payload: drag.payload, over: drag.over };
      drag = null;
      // El clic que sigue a pointerup no debe contar como un toque.
      const stop = (event) => { event.stopPropagation(); event.preventDefault(); };
      document.addEventListener("click", stop, { capture: true, once: true });
      setTimeout(() => document.removeEventListener("click", stop, { capture: true }), 80);
      onEnd?.();
      if (commit && done.over) onDrop(done.payload, done.over);
    }
    press = null;
  }

  function onMove(e) {
    if (!press || e.pointerId !== press.id) return;
    if (drag) return place(e);
    if (dist(e) <= MOVE_PX) return;
    if (press.type === "touch" && holdMs > 0) {       // se movio antes de la pausa: era un scroll
      clearTimeout(press.timer);
      press = null;
      document.removeEventListener("pointermove", onMove);
      return;
    }
    begin(e);
  }
  const onUp = (e) => { if (press && e.pointerId === press.id) finish(true); };
  const onCancel = (e) => { if (press && e.pointerId === press.id) finish(false); };
  // Ya arrastrando con el dedo: que la pagina no haga scroll.
  const onTouchMove = (e) => { if (drag && e.cancelable) e.preventDefault(); };

  root.addEventListener("pointerdown", (e) => {
    if (press || (e.pointerType === "mouse" && e.button !== 0)) return;
    const payload = source(e.target);
    if (!payload) return;
    press = { id: e.pointerId, x: e.clientX, y: e.clientY, payload, type: e.pointerType, timer: 0 };
    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerup", onUp);
    document.addEventListener("pointercancel", onCancel);
    document.addEventListener("touchmove", onTouchMove, { passive: false });
    if (e.pointerType === "touch" && holdMs > 0) {
      press.timer = setTimeout(() => {
        if (press && !drag) { navigator.vibrate?.(15); begin({ clientX: press.x, clientY: press.y }); }
      }, holdMs);
    }
  });

  // Evita el menu contextual / seleccion al mantener pulsado.
  root.addEventListener("contextmenu", (e) => { if (source(e.target)) e.preventDefault(); });
}

function h(node) {
  node.classList.add("ghost");
  return node;
}
