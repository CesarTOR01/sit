// Pruebas del mini indicador de la tarjeta de un tablero, sin navegador ni red: node pruebas/mini.prueba.js
// Todas las cifras son inventadas.
import { readFileSync } from "node:fs";
import { miniKpi, FORMATOS_MINI, MAX_ETIQUETA_MINI } from "../sitio/mini.js";

let ok = 0, mal = 0;
const igual = (a, b, nombre) => {
  const A = JSON.stringify(a), B = JSON.stringify(b);
  if (A === B) ok++; else { mal++; console.log("FALLA:", nombre, "\n  obtenido:", A, "\n  esperado:", B); }
};
const leer = r => readFileSync(new URL(r, import.meta.url), "utf8");
const K = (extra = {}) => ({ etiqueta: "Facturado vs presupuesto", valor: 8800000, meta: 10000000, formato: "moneda_abrev", ...extra });

igual(FORMATOS_MINI, ["moneda", "moneda_abrev", "entero", "decimal", "pct", "dias", "piezas"], "formatos admitidos");

/* ---- el caso de la facturación: valor, meta y cumplimiento ---- */
{
  const m = miniKpi(K());
  igual([m.etiqueta, m.valorTxt, m.metaTxt, m.pctTxt, m.estado, m.barra], ["Facturado vs presupuesto", "$8.8 M", "$10.0 M", "88%", "bad", 0.88], "88 % de cumplimiento: bad");
}
igual(miniKpi(K({ valor: 9500000 })).estado, "warn", "95 %: warn");
igual(miniKpi(K({ valor: 9000000 })).estado, "warn", "justo 90 %: warn");
igual(miniKpi(K({ valor: 8999999 })).estado, "bad", "bajo 90 %: bad");
igual(miniKpi(K({ valor: 10000000 })).estado, "ok", "justo 100 %: ok");
{
  const m = miniKpi(K({ valor: 12500000 }));
  igual([m.pctTxt, m.barra, m.estado], ["125%", 1, "ok"], "más de 100 %: el texto dice 125 % y la barra se queda llena");
}
{
  const m = miniKpi(K({ valor: -500000 }));
  igual([m.barra, m.pctTxt], [0, "-5%"], "valor negativo: la barra en 0");
}
igual(miniKpi(K({ valor: 0 })).pctTxt, "0%", "valor 0 con meta: 0 %");

/* ---- sin meta ---- */
{
  const m = miniKpi({ etiqueta: "Valor del inventario al costo", valor: 54300000, formato: "moneda_abrev" });
  igual([m.valorTxt, m.metaTxt, m.pct, m.pctTxt, m.barra, m.estado], ["$54.3 M", null, null, null, null, "na"], "sin meta: sólo el valor, sin barra ni porcentaje, estado na");
}
igual(miniKpi(K({ meta: 0 })).pct, null, "meta 0: no hay porcentaje (no divide entre 0)");
igual(miniKpi(K({ meta: -5 })).pct, null, "meta negativa: no hay porcentaje");
igual(miniKpi(K({ meta: null })).pct, null, "meta null: no hay porcentaje");

/* ---- valor nulo = NA ---- */
{
  const m = miniKpi(K({ valor: null }));
  igual([m.valorTxt, m.pct, m.barra, m.estado], ["NA", null, null, "na"], "valor null: NA, no es 0");
}

/* ---- sentido menor (menos es mejor) ---- */
igual(miniKpi(K({ sentido: "menor", valor: 900000, meta: 1000000 })).estado, "ok", "menor: 90 % de la meta es ok");
igual(miniKpi(K({ sentido: "menor", valor: 1000000, meta: 1000000 })).estado, "ok", "menor: justo la meta es ok");
igual(miniKpi(K({ sentido: "menor", valor: 1100000, meta: 1000000 })).estado, "warn", "menor: 110 % es warn");
igual(miniKpi(K({ sentido: "menor", valor: 1100001, meta: 1000000 })).estado, "bad", "menor: más de 110 % es bad");
igual(miniKpi(K({ sentido: "raro" })).sentido, "mayor", "sentido desconocido: mayor");

/* ---- el estado del renglón manda ---- */
igual(miniKpi(K({ estado: "ok" })).estado, "ok", "estado dado por el exportador gana al calculado");
igual(miniKpi(K({ estado: "rojo" })).estado, "bad", "estado inválido: se calcula");

/* ---- formatos ---- */
igual(miniKpi({ etiqueta: "Cumplimiento", valor: 0.912, meta: 1, formato: "pct" }).valorTxt, "91.2%", "formato pct");
igual(miniKpi({ etiqueta: "Piezas", valor: 12345, meta: 20000, formato: "piezas" }).valorTxt, "12,345 pz", "formato piezas");
igual(miniKpi({ etiqueta: "Días", valor: 45, formato: "dias" }).valorTxt, "45 d", "formato dias");

/* ---- lo mal formado se ignora ---- */
igual(miniKpi(null), null, "null");
igual(miniKpi(undefined), null, "undefined");
igual(miniKpi("texto"), null, "texto");
igual(miniKpi([]), null, "lista");
igual(miniKpi(K({ etiqueta: "" })), null, "etiqueta vacía");
igual(miniKpi(K({ etiqueta: "   " })), null, "etiqueta de espacios");
igual(miniKpi(K({ etiqueta: 5 })), null, "etiqueta numérica");
igual(miniKpi(K({ etiqueta: "a".repeat(MAX_ETIQUETA_MINI + 1) })), null, "etiqueta muy larga");
igual(miniKpi(K({ etiqueta: "a".repeat(MAX_ETIQUETA_MINI) })) === null, false, "etiqueta justo en el tope vale");
igual(miniKpi(K({ formato: "texto" })), null, "formato texto no se admite");
igual(miniKpi(K({ formato: undefined })), null, "sin formato");
igual(miniKpi(K({ valor: "8800000" })), null, "valor en texto");
igual(miniKpi(K({ valor: NaN })), null, "valor NaN");
igual(miniKpi(K({ valor: Infinity })), null, "valor infinito");
igual(miniKpi(K({ valor: undefined })), null, "sin valor (undefined) no es NA: se ignora");
igual(miniKpi(K({ meta: "100" })), null, "meta en texto");
igual(miniKpi(K({ meta: NaN })), null, "meta NaN");
igual(JSON.stringify(miniKpi(K({ etiqueta: "<b>x</b>" }))).includes("<b>"), true, "una etiqueta con marcas pasa como texto (el DOM la pone con textContent)");

/* ---- leyenda del porcentaje ---- */
igual(miniKpi(K()).leyenda, "de cumplimiento", "por omisión la leyenda es 'de cumplimiento'");
igual(miniKpi(K({ leyenda: "del mismo periodo de 2025" })).leyenda, "del mismo periodo de 2025", "leyenda propia (comparación contra el año anterior)");
igual(miniKpi(K({ leyenda: "  con espacios  " })).leyenda, "con espacios", "la leyenda se recorta");
igual(miniKpi(K({ leyenda: "a".repeat(32) })).leyenda, "a".repeat(32), "leyenda de 32 caracteres vale");
igual(miniKpi(K({ leyenda: "a".repeat(33) })).leyenda, "de cumplimiento", "leyenda de 33 caracteres: se vuelve a la de omisión");
igual(miniKpi(K({ leyenda: "<b>x</b>" })).leyenda, "de cumplimiento", "leyenda con marcas: se ignora");
igual(miniKpi(K({ leyenda: "uno\ndos" })).leyenda, "de cumplimiento", "leyenda con salto de línea: se ignora");
igual(miniKpi(K({ leyenda: 5 })).leyenda, "de cumplimiento", "leyenda numérica: se ignora");
igual(miniKpi(K({ leyenda: "" })).leyenda, "de cumplimiento", "leyenda vacía: se ignora");
igual(miniKpi(K({ valor: null, leyenda: "del año anterior" })).leyenda, "del año anterior", "con valor null también conserva la leyenda");
{
  const m = miniKpi({ etiqueta: "Venta neta 2026 vs 2025 · ene–oct", valor: 316960764.59, meta: 337238196.75, formato: "moneda_abrev", leyenda: "del mismo periodo de 2025" });
  igual([m.valorTxt, m.metaTxt, m.pctTxt, m.estado], ["$317.0 M", "$337.2 M", "94%", "warn"], "el caso de ventas 2026 contra 2025: 94 % (warn)");
}

/* ---- estáticas ---- */
{
  const vistas = leer("../sitio/vistas.js"), css = leer("../sitio/estilo.css"), mini = leer("../sitio/mini.js");
  const t = vistas.slice(vistas.indexOf("export function tarjetaTablero"), vistas.indexOf("// Un tablero de datos"));
  igual(/miniKpi\(t\.kpi\)/.test(t) && /t\.actualizado/.test(t) && /t\.meta\.modificado/.test(t), true, "la tarjeta usa kpi, actualizado y, sin él, la fecha del archivo");
  igual(/descripcion|t\.grupo/.test(t), false, "la tarjeta ya no lleva descripción ni grupo");
  igual(/innerHTML|insertAdjacentHTML|eval\(|style:/.test(t + mini), false, "sin HTML crudo, eval ni estilos en línea");
  igual(/<progress|"progress"/.test(t), true, "la barra es un progress nativo (sin estilo en línea: la CSP no lo permite)");
  igual(/\.mini-barra progress/.test(css) && /\.mini-pct\.bad/.test(css) && /\.tarjeta-tablero \.actualizado/.test(css), true, "estilo.css: barra, porcentaje por estado y fecha de la tarjeta");
  igual(/localStorage|sessionStorage|fetch\(/.test(mini), false, "mini.js no guarda ni envía nada");
  igual(/Actualizado "/.test(t) && /Fecha de actualización desconocida/.test(t), true, "texto de fecha y su aviso cuando no hay fecha");
  igual(/mk\.pctTxt \+ " " \+ mk\.leyenda/.test(t), true, "el porcentaje lleva la leyenda del kpi");
}

console.log("mini: " + ok + " de " + (ok + mal) + " pruebas bien");
process.exit(mal ? 1 : 0);
