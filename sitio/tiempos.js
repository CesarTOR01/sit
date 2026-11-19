// Cuánto tardó en verse un tablero: marcas de tiempo acumuladas (milisegundos desde que abrió la página) y su texto para la banda.
// Sólo números y nombres fijos del propio sitio: nada del contenido del tablero ni de la persona. Sin DOM ni red.

const seg = ms => (ms / 1000).toFixed(1) + " s";

// marcas: [[nombre, ms], …] en el orden en que ocurrieron. Devuelve null si no hay ninguna marca válida; si no,
//   { texto: "Cargó en 2.2 s", detalle: "perfil 0.4 s · acceso 0.9 s · … · listo 2.2 s" } (el detalle es acumulado por etapa).
export function resumenTiempos(marcas) {
  const buenas = (Array.isArray(marcas) ? marcas : []).filter(m => Array.isArray(m) && typeof m[0] === "string" && /^[a-zñáéíóú ]{1,20}$/.test(m[0]) && Number.isFinite(m[1]) && m[1] >= 0);
  if (!buenas.length) return null;
  const total = buenas[buenas.length - 1][1];
  return { texto: "Cargó en " + seg(total), detalle: buenas.map(([n, ms]) => n + " " + seg(ms)).join(" · ") };
}
