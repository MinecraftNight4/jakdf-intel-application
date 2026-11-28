// Iconos en SVG incrustado (sin depender de Google Fonts, que Discord bloquea dentro de la Activity).
// Estilo "outlined" de Material Symbols: cuadricula de 24, trazo de 2. Para usar el glifo oficial de alguno,
// sustituye su entrada: ``body`` es el contenido del <svg> y hereda el color del texto (currentColor).
const S = 'fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"';
const F = 'fill="currentColor"';

const ICONS = {
  apps: `<g ${F}><rect x="4" y="4" width="4" height="4"/><rect x="10" y="4" width="4" height="4"/><rect x="16" y="4" width="4" height="4"/>
    <rect x="4" y="10" width="4" height="4"/><rect x="10" y="10" width="4" height="4"/><rect x="16" y="10" width="4" height="4"/>
    <rect x="4" y="16" width="4" height="4"/><rect x="10" y="16" width="4" height="4"/><rect x="16" y="16" width="4" height="4"/></g>`,
  notes: `<path ${S} d="M4 6h16M4 12h16M4 18h10"/>`,
  share: `<g ${S}><circle cx="18" cy="5" r="2.6"/><circle cx="6" cy="12" r="2.6"/><circle cx="18" cy="19" r="2.6"/>
    <path d="M8.3 10.7l7.4-4.4M8.3 13.3l7.4 4.4"/></g>`,
  qr_code_scanner: `<g ${S}><path d="M3 8V5a2 2 0 0 1 2-2h3M16 3h3a2 2 0 0 1 2 2v3M21 16v3a2 2 0 0 1-2 2h-3M8 21H5a2 2 0 0 1-2-2v-3"/></g>
    <g ${F}><rect x="7" y="7" width="3.5" height="3.5"/><rect x="13.5" y="7" width="3.5" height="3.5"/><rect x="7" y="13.5" width="3.5" height="3.5"/><rect x="13.5" y="13.5" width="3.5" height="3.5"/></g>`,
  terminal_add: `<g ${S}><path d="M13 4H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-6"/><path d="M7 10l3 3-3 3M12.5 16.5H16"/><path d="M18 2.5v7M14.5 6h7"/></g>`,
  document_share: `<g ${S}><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/><path d="M12 17v-5.5M9.5 13.5L12 11l2.5 2.5"/></g>`,
  strategy: `<g ${S}><path d="M4 4l5 5M9 4L4 9"/><circle cx="17.5" cy="18.5" r="2.7"/><path d="M12 6.5h2.5a3 3 0 0 1 3 3v3.3M15.5 10.8l2 2 2-2"/><path d="M4 18.5h5.5"/></g>`,
  assignment_ind: `<g ${S}><path d="M9 4H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-3"/><rect x="9" y="2" width="6" height="4" rx="1"/>
    <circle cx="12" cy="11" r="2.3"/><path d="M7.8 18c.6-2.1 2.4-3.2 4.2-3.2s3.6 1.1 4.2 3.2"/></g>`,
};

/** Elemento <span class="ico"> con el icono dentro; el tamaño lo da el CSS (1em por defecto). */
export function icon(name) {
  const span = document.createElement("span");
  span.className = "ico";
  span.setAttribute("aria-hidden", "true");
  span.innerHTML = `<svg viewBox="0 0 24 24" focusable="false">${ICONS[name] || ""}</svg>`;
  return span;
}
