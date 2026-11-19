// Mini indicador de la tarjeta de un tablero en la portada: el KPI principal que el exportador deja en el renglón del catálogo.
//   kpi: { etiqueta, valor|null, meta?, formato, sentido?:"mayor"|"menor", estado?:"ok"|"warn"|"bad"|"na" }
// El sitio sólo calcula el porcentaje de cumplimiento (valor ÷ meta) y, si el renglón no trae estado, lo deduce:
//   sentido "mayor" (por omisión): 100 % o más es ok, de 90 % a menos de 100 % es warn, menos de 90 % es bad;
//   sentido "menor" (menos es mejor): hasta 100 % es ok, hasta 110 % es warn, más es bad.
// Un kpi mal formado se ignora (la tarjeta se pinta sin él). Sin DOM ni red.
import { fmt, esNumero, estadoValido } from "./comun.js";

export const FORMATOS_MINI = ["moneda", "moneda_abrev", "entero", "decimal", "pct", "dias", "piezas"];
export const MAX_ETIQUETA_MINI = 48;

export function miniKpi(k) {
  if (k === null || typeof k !== "object" || Array.isArray(k)) return null;
  const etiqueta = typeof k.etiqueta === "string" ? k.etiqueta.trim() : "";
  if (!etiqueta || etiqueta.length > MAX_ETIQUETA_MINI) return null;
  if (!FORMATOS_MINI.includes(k.formato)) return null;
  if (k.valor !== null && !esNumero(k.valor)) return null;
  if (k.meta !== undefined && k.meta !== null && !esNumero(k.meta)) return null;
  const sentido = k.sentido === "menor" ? "menor" : "mayor";
  if (k.valor === null) return { etiqueta, valorTxt: fmt(null), metaTxt: null, pct: null, pctTxt: null, barra: null, estado: estadoValido(k.estado) || "na", sentido };
  const hayMeta = esNumero(k.meta) && k.meta > 0;
  const pct = hayMeta ? k.valor / k.meta : null;
  let estado = estadoValido(k.estado);
  if (!estado) estado = pct === null ? "na" : sentido === "mayor" ? (pct >= 1 ? "ok" : pct >= 0.9 ? "warn" : "bad") : (pct <= 1 ? "ok" : pct <= 1.1 ? "warn" : "bad");
  return {
    etiqueta, valorTxt: fmt(k.valor, k.formato), metaTxt: hayMeta ? fmt(k.meta, k.formato) : null,
    pct, pctTxt: pct === null ? null : Math.round(pct * 100) + "%", barra: pct === null ? null : Math.min(1, Math.max(0, pct)), estado, sentido,
  };
}
