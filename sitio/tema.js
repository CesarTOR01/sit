// Tema claro u oscuro del sitio. Sólo se recuerda la elección ("light" o "dark") en este navegador; sin elección se sigue al sistema.
// Los tableros embebidos corren en un marco aislado (sin acceso al almacenamiento ni a la página): el tema les llega
// de dos formas, sin que el marco pueda devolver nada: `conTema` pone data-theme en la etiqueta <html> de su texto antes de
// mostrarlo, y `mensajeTema` es el aviso de texto que se manda al marco cuando la persona cambia el tema sin recargar.
const VALIDOS = ["light", "dark"];
const limpio = t => VALIDOS.includes(t) ? t : null;

export function temaGuardado() {
  try { return limpio(localStorage.getItem("tema")); } catch (_) { return null; } // sin almacenamiento: se sigue al sistema
}
export function guardarTema(t) {
  try { localStorage.setItem("tema", t); } catch (_) { /* sin almacenamiento */ }
}
// El tema que la página muestra ahora por elección (null = el del sistema); sale de la página, no del almacenamiento.
export const temaActual = () => limpio(document.documentElement.getAttribute("data-theme"));
// Pone o quita data-theme en la página; un valor que no es light ni dark es "seguir al sistema".
export function aplicarTema(t) {
  const r = document.documentElement, v = limpio(t);
  if (v) r.setAttribute("data-theme", v); else r.removeAttribute("data-theme");
}
// Cambia entre claro y oscuro (si no había elección, parte de lo que muestra el sistema), lo aplica, lo recuerda y devuelve el nuevo.
export function alternarTema() {
  const a = document.documentElement.getAttribute("data-theme");
  const oscuro = a === "dark" || (!a && matchMedia("(prefers-color-scheme: dark)").matches);
  const n = oscuro ? "light" : "dark";
  aplicarTema(n);
  guardarTema(n);
  return n;
}

// El texto de un tablero con data-theme en su primera etiqueta <html>: lo reemplaza si ya lo traía y lo quita si el tema es el del sistema.
// Sin etiqueta <html> devuelve el texto igual.
export function conTema(html, t) {
  const m = /<html\b[^>]*>/i.exec(html);
  if (!m) return html;
  let etiqueta = m[0].replace(/\sdata-theme\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/i, "");
  const v = limpio(t);
  if (v) { const fin = etiqueta.endsWith("/>") ? 2 : 1; etiqueta = etiqueta.slice(0, -fin) + ' data-theme="' + v + '"' + etiqueta.slice(-fin); }
  return html.slice(0, m.index) + etiqueta + html.slice(m.index + m[0].length);
}

// Lo único que se manda al marco: texto, sin datos de la persona ni del tablero. tema null = seguir al sistema.
export const mensajeTema = t => ({ sit: "tema", tema: limpio(t) });
