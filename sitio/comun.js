// Ayudas de DOM y de formato. Todo texto que viene de los archivos entra por textContent: nunca como HTML.

const SVGNS = "http://www.w3.org/2000/svg";

export function h(tag, attrs, ...hijos) {
  const e = document.createElement(tag);
  poner(e, attrs, hijos);
  return e;
}
export function s(tag, attrs, ...hijos) {
  const e = document.createElementNS(SVGNS, tag);
  poner(e, attrs, hijos);
  return e;
}
function poner(e, attrs, hijos) {
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === "class") e.setAttribute("class", v);
    else if (k.startsWith("on") && typeof v === "function") e.addEventListener(k.slice(2), v);
    else e.setAttribute(k, v === true ? "" : String(v));
  }
  for (const c of hijos.flat()) if (c != null && c !== false) e.append(c.nodeType ? c : document.createTextNode(String(c)));
}

const es = (o) => new Intl.NumberFormat("es-MX", o);
const ENT = es({ maximumFractionDigits: 0 });
const DEC1 = es({ minimumFractionDigits: 1, maximumFractionDigits: 1 });
const DEC2 = es({ minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function abreviado(v, moneda) {
  const a = Math.abs(v), p = moneda ? "$" : "";
  if (a >= 1e9) return p + DEC1.format(v / 1e9) + " mil M";
  if (a >= 1e6) return p + DEC1.format(v / 1e6) + " M";
  if (a >= 1e4) return p + DEC1.format(v / 1e3) + " mil";
  return p + ENT.format(v);
}

// formatos de los archivos: moneda, moneda_abrev, entero, decimal, pct, dias, piezas, fecha, texto; `unidad` libre opcional
function base(v, f) {
  if (f === "texto" || typeof v === "string" && f !== "fecha" && Number.isNaN(Number(v))) return String(v);
  const n = Number(v);
  switch (f) {
    case "moneda": return "$" + DEC2.format(n);
    case "moneda_abrev": return abreviado(n, true);
    case "entero": return ENT.format(n);
    case "decimal": return DEC2.format(n);
    case "pct": return DEC1.format(n * 100) + "%";
    case "dias": return (Number.isInteger(n) ? ENT.format(n) : DEC1.format(n)) + " d";
    case "piezas": return ENT.format(n) + " pz";
    case "fecha": { const d = new Date(v); return Number.isNaN(d.getTime()) ? String(v) : d.toLocaleDateString("es-MX", { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" }); }
    default: return Number.isFinite(n) ? (Number.isInteger(n) ? ENT.format(n) : DEC2.format(n)) : String(v);
  }
}

// null o vacío = “NA”: no es 0 y no entra en ninguna suma ni promedio
export function fmt(v, f, u) {
  if (v == null || v === "") return "NA";
  const t = base(v, f);
  return u && typeof v === "number" ? t + " " + u : t;
}
export const esNumero = v => typeof v === "number" && Number.isFinite(v);
export const ESTADOS = ["ok", "warn", "bad", "na"];
export const estadoValido = e => ESTADOS.includes(e) ? e : null;
