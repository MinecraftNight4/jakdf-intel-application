// Imagen de la build con el mismo aspecto que la que dibuja el bot (cogs/squad/share_template.typ):
// barra de titulo, nota, y tarjetas de 4 en fila con los iconos "∞" / "&" entre ellas. Medidas en px a 1x; se dibuja a 2x.
import { prefixColor } from "./md5.js";

export const EMPTY_NAME = "—";
const CELL = 150, SEP = 52, GAP = 10, PAD = 12, INNER = CELL - 16, NAME_H = 46;
const CARD_H = 8 + INNER + 6 + NAME_H + 8;
const WIDTH = PAD * 2 + CELL * 4 + SEP * 3;
const DUO = 47.6, AMP = 33.6;
const TITLE_FONT = '"Bungee", "DejaVu Sans", sans-serif', BODY_FONT = '"Gothic", "DejaVu Sans", sans-serif';

const loadImage = (src) => new Promise((resolve) => {
  const img = new Image();
  img.onload = () => resolve(img);
  img.onerror = () => resolve(null);
  img.src = src;
});

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Parte ``text`` en lineas que caben en ``max`` px (respeta los saltos de linea). ``limit`` = maximo de lineas (con "…"). */
function wrap(ctx, text, max, limit = Infinity) {
  const out = [];
  for (const para of String(text).split("\n")) {
    let line = "";
    for (const word of para.split(/\s+/).filter(Boolean)) {
      const next = line ? `${line} ${word}` : word;
      if (line && ctx.measureText(next).width > max) { out.push(line); line = word; } else line = next;
    }
    out.push(line);
  }
  if (out.length > limit) {
    out.length = limit;
    let last = out[limit - 1];
    while (last.length > 1 && ctx.measureText(`${last}…`).width > max) last = last.slice(0, -1);
    out[limit - 1] = `${last}…`;
  }
  return out.map((line) => {                                   // una palabra mas ancha que la caja: se recorta
    let t = line;
    while (t.length > 1 && ctx.measureText(t).width > max) t = t.slice(0, -1);
    return t === line ? line : `${t.slice(0, -1)}…`;
  });
}

function drawCover(ctx, img, x, y, w, h) {
  const k = Math.max(w / img.width, h / img.height);
  const sw = w / k, sh = h / k;
  ctx.drawImage(img, (img.width - sw) / 2, (img.height - sh) / 2, sw, sh, x, y, w, h);
}

/**
 * ``slots``: uuid por casilla (0 = vacia), 4 o 16. ``byUuid``: Map uuid -> { name, prefix }.
 * ``base``: carpeta de los recursos (iconos en ``/characters/{uuid}.png``, separadores en ``/icon/duo.png`` y ``/icon/and.png``).
 */
export async function squadImage({ slots, title, description, byUuid, scale = 2, base = "" }) {
  try { await Promise.all([document.fonts.load(`15px ${TITLE_FONT}`), document.fonts.load(`12px ${BODY_FONT}`)]); } catch { /* fuente de respaldo */ }
  const measure = document.createElement("canvas").getContext("2d");

  measure.font = `15px ${TITLE_FONT}`;
  const titleLines = wrap(measure, title, WIDTH - 24);
  const titleH = 24 + titleLines.length * 19;
  measure.font = `12px ${BODY_FONT}`;
  const noteLines = description ? wrap(measure, description, WIDTH - 24) : [];
  const noteH = noteLines.length ? 24 + noteLines.length * 17 : 0;
  const rows = Math.ceil(slots.length / 4);
  const gridH = PAD * 2 + rows * CARD_H + (rows - 1) * GAP;
  const height = titleH + noteH + gridH;

  const [duo, amp, ...icons] = await Promise.all([
    loadImage(`${base}/icon/duo.png`), loadImage(`${base}/icon/and.png`),
    ...slots.map((uuid) => (uuid ? loadImage(`${base}/characters/${uuid}.png`) : null)),
  ]);

  const canvas = document.createElement("canvas");
  canvas.width = Math.round(WIDTH * scale); canvas.height = Math.round(height * scale);
  const ctx = canvas.getContext("2d");
  ctx.scale(scale, scale);
  ctx.fillStyle = "#040406"; ctx.fillRect(0, 0, WIDTH, height);
  ctx.textBaseline = "middle"; ctx.textAlign = "center";

  ctx.fillStyle = "#43d7d7"; ctx.fillRect(0, 0, WIDTH, titleH);
  ctx.fillStyle = "#f3feff"; ctx.font = `15px ${TITLE_FONT}`;
  titleLines.forEach((line, i) => ctx.fillText(line, WIDTH / 2, 12 + 9.5 + i * 19));
  if (noteLines.length) {
    ctx.fillStyle = "#0a3535"; ctx.fillRect(0, titleH, WIDTH, noteH);
    ctx.fillStyle = "#9bfffd"; ctx.font = `12px ${BODY_FONT}`;
    noteLines.forEach((line, i) => ctx.fillText(line, WIDTH / 2, titleH + 12 + 8.5 + i * 17));
  }

  const top = titleH + noteH + PAD;
  slots.forEach((uuid, i) => {
    const col = i % 4, row = Math.floor(i / 4);
    const x = PAD + col * (CELL + SEP), y = top + row * (CARD_H + GAP);
    const char = uuid ? byUuid.get(uuid) : null;

    ctx.fillStyle = "#323033"; roundRect(ctx, x, y, CELL, CARD_H, 10); ctx.fill();
    const ix = x + 8, iy = y + 8;
    ctx.fillStyle = "#373246"; ctx.fillRect(ix, iy, INNER, INNER);
    if (icons[i]) drawCover(ctx, icons[i], ix, iy, INNER, INNER);
    else { ctx.fillStyle = "#78788c"; ctx.font = `28px ${BODY_FONT}`; ctx.fillText("?", ix + INNER / 2, iy + INNER / 2); }

    ctx.font = `9px ${BODY_FONT}`;
    const badgeW = ctx.measureText(String(i + 1)).width + 10;
    ctx.fillStyle = "#040406"; ctx.fillRect(ix + 5, iy + 5, badgeW, 15);
    ctx.fillStyle = "#fff"; ctx.fillText(String(i + 1), ix + 5 + badgeW / 2, iy + 5 + 7.5);

    const ny = iy + INNER + 6;
    ctx.fillStyle = "#4f4848"; ctx.fillRect(ix, ny, INNER, NAME_H);
    ctx.strokeStyle = "#6e7396"; ctx.lineWidth = 1.5; ctx.strokeRect(ix + 0.75, ny + 0.75, INNER - 1.5, NAME_H - 1.5);
    ctx.font = `12px ${BODY_FONT}`;
    ctx.font = `9.5px ${BODY_FONT}`;
    const prefixLines = char && char.prefix ? wrap(ctx, char.prefix, INNER - 10, 2) : [];
    ctx.font = `12px ${BODY_FONT}`;
    const nameLines = wrap(ctx, char ? char.name : (uuid ? `Unknown #${uuid}` : EMPTY_NAME), INNER - 10, prefixLines.length > 1 ? 1 : 2);
    const lines = [...prefixLines.map((t) => ({ t, size: 9.5, h: 12, color: prefixColor(char.prefix) })),
      ...nameLines.map((t) => ({ t, size: 12, h: 15, color: "#fff" }))];
    let ty = ny + (NAME_H - lines.reduce((sum, l) => sum + l.h, 0)) / 2;
    for (const l of lines) {
      ctx.font = `${l.size}px ${BODY_FONT}`; ctx.fillStyle = l.color;
      ctx.fillText(l.t, ix + INNER / 2, ty + l.h / 2);
      ty += l.h;
    }

    if (col < 3) {                                             // separador: 1∞2  2&3  3∞4, centrado con el icono
      const cx = x + CELL + SEP / 2, cy = y + CELL / 2;
      const img = col === 1 ? amp : duo, w = col === 1 ? AMP : DUO;
      if (img) ctx.drawImage(img, cx - w / 2, cy - (w * img.height) / img.width / 2, w, (w * img.height) / img.width);
      else { ctx.fillStyle = "#fff"; ctx.font = `16px ${TITLE_FONT}`; ctx.fillText(col === 1 ? "&" : "~", cx, cy); }
    }
  });
  return new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
}
