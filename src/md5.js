// MD5 (solo para repetir el color de prefijo que calcula el bot con hashlib.md5). Devuelve el hash en hexadecimal.
const K = Array.from({ length: 64 }, (_, i) => Math.floor(Math.abs(Math.sin(i + 1)) * 2 ** 32) >>> 0);
const R = [7, 12, 17, 22, 5, 9, 14, 20, 4, 11, 16, 23, 6, 10, 15, 21];

export function md5(text) {
  const bytes = new TextEncoder().encode(text);
  const total = ((bytes.length + 8) >> 6) + 1;                 // bloques de 64 bytes
  const words = new Uint32Array(total * 16);
  for (let i = 0; i < bytes.length; i++) words[i >> 2] |= bytes[i] << ((i % 4) * 8);
  words[bytes.length >> 2] |= 0x80 << ((bytes.length % 4) * 8);
  words[total * 16 - 2] = (bytes.length * 8) >>> 0;
  words[total * 16 - 1] = Math.floor((bytes.length * 8) / 2 ** 32);

  let a0 = 0x67452301, b0 = 0xefcdab89, c0 = 0x98badcfe, d0 = 0x10325476;
  for (let off = 0; off < words.length; off += 16) {
    let a = a0, b = b0, c = c0, d = d0;
    for (let i = 0; i < 64; i++) {
      let f, g;
      if (i < 16) { f = (b & c) | (~b & d); g = i; }
      else if (i < 32) { f = (d & b) | (~d & c); g = (5 * i + 1) % 16; }
      else if (i < 48) { f = b ^ c ^ d; g = (3 * i + 5) % 16; }
      else { f = c ^ (b | ~d); g = (7 * i) % 16; }
      const sum = (a + f + K[i] + words[off + g]) >>> 0;
      const s = R[(i >> 4) * 4 + (i % 4)];
      a = d; d = c; c = b;
      b = (b + ((sum << s) | (sum >>> (32 - s)))) >>> 0;
    }
    a0 = (a0 + a) >>> 0; b0 = (b0 + b) >>> 0; c0 = (c0 + c) >>> 0; d0 = (d0 + d) >>> 0;
  }
  const hex = (n) => Array.from({ length: 4 }, (_, i) => ((n >>> (i * 8)) & 255).toString(16).padStart(2, "0")).join("");
  return hex(a0) + hex(b0) + hex(c0) + hex(d0);
}

/** Color del prefijo, igual que ``prefix_color`` del bot (siempre el mismo para el mismo texto). */
export function prefixColor(prefix) {
  const digest = md5(prefix.trim().toLowerCase());
  const hue = (parseInt(digest.slice(0, 4), 16) % 360) / 360;
  const sat = 0.55 + (parseInt(digest.slice(4, 6), 16) % 30) / 100;
  const light = 0.64 + (parseInt(digest.slice(6, 8), 16) % 14) / 100;
  const m2 = light <= 0.5 ? light * (1 + sat) : light + sat - light * sat, m1 = 2 * light - m2;
  const v = (h) => {                                           // colorsys._v
    h = ((h % 1) + 1) % 1;
    if (h < 1 / 6) return m1 + (m2 - m1) * h * 6;
    if (h < 0.5) return m2;
    if (h < 2 / 3) return m1 + (m2 - m1) * (2 / 3 - h) * 6;
    return m1;
  };
  const hex = (x) => Math.trunc(x * 255).toString(16).padStart(2, "0");
  return `#${hex(v(hue + 1 / 3))}${hex(v(hue))}${hex(v(hue - 1 / 3))}`;
}
