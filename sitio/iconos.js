// Íconos del menú: trazo simple de un solo color, dibujados aquí en SVG en línea (nada se pide a otro servidor).
// `claveIcono` elige el ícono por el id y el tipo del tablero; sin coincidencia, el del panel.
import { h, s } from "./comun.js";

export const TRAZOS = {
  panel: ["M3 3h8v8H3z", "M13 3h8v5h-8z", "M13 10h8v11h-8z", "M3 13h8v8H3z"],
  tendencia: ["M3 17l6-6 4 4 8-9", "M15 6h6v6"],
  pastel: ["M12 3a9 9 0 1 0 9 9h-9z", "M14 3.5A9 9 0 0 1 20.5 10H14z"],
  recibo: ["M6 3h12v18l-3-2-3 2-3-2-3 2z", "M9 8h6", "M9 12h6"],
  planta: ["M3 21V11l6 3V8l6 3V4h6v17z"],
  calidad: ["M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z", "M8.5 12l2.5 2.5L16 9"],
  banco: ["M3 10l9-6 9 6", "M5 10v8", "M10 10v8", "M14 10v8", "M19 10v8", "M3 21h18"],
  doc: ["M7 3h8l4 4v14H7z", "M15 3v4h4", "M10 12h6", "M10 16h6"],
  casa: ["M3 11l9-8 9 8", "M5 10v11h14V10", "M10 21v-6h4v6"],
};

export function claveIcono(t) {
  const id = String((t && t.id) || "").toLowerCase();
  if (t && t.tipo === "embebido") return "tendencia";
  if (/factur|cobranza/.test(id)) return "recibo";
  if (/mercado/.test(id)) return "pastel";
  if (/venta/.test(id)) return "tendencia";
  if (/prod|planta/.test(id)) return "planta";
  if (/costo|utilidad|resultado/.test(id)) return "banco";
  if (/calidad/.test(id)) return "calidad";
  if (/aviso|doc/.test(id)) return "doc";
  return "panel";
}

// Un ícono por su nombre, como elemento (decorativo: el texto del elemento va al lado).
export const iconoClave = clave => h("span", { class: "ico", "aria-hidden": "true" }, s("svg", { viewBox: "0 0 24 24" }, ...TRAZOS[clave].map(d => s("path", { d }))));

// El ícono del tablero.
export const icono = t => iconoClave(claveIcono(t));
