// Pruebas de los íconos del menú, sin navegador: node pruebas/iconos.prueba.js
import { readFileSync } from "node:fs";
import { TRAZOS, claveIcono, claveGerencia } from "../sitio/iconos.js";

let ok = 0, mal = 0;
const igual = (a, b, nombre) => {
  const A = JSON.stringify(a), B = JSON.stringify(b);
  if (A === B) ok++; else { mal++; console.log("FALLA:", nombre, "\n  obtenido:", A, "\n  esperado:", B); }
};

/* ---- qué ícono toca a cada tablero ---- */
igual(claveIcono({ id: "indicadores_empresa" }), "panel", "indicadores");
igual(claveIcono({ id: "facturacion_2026" }), "recibo", "facturación");
igual(claveIcono({ id: "cobranza" }), "recibo", "cobranza");
igual(claveIcono({ id: "venta_por_mercado" }), "pastel", "mercado");
igual(claveIcono({ id: "ventas_2027" }), "tendencia", "ventas");
igual(claveIcono({ id: "x", tipo: "embebido" }), "tendencia", "embebido");
igual(claveIcono({ id: "produccion_planta" }), "planta", "producción");
igual(claveIcono({ id: "costo_utilidad" }), "banco", "costo y utilidad");
igual(claveIcono({ id: "unidad_calidad" }), "calidad", "calidad");
igual(claveIcono({ id: "avisos" }), "doc", "avisos");
igual(claveIcono({ id: "otra_cosa" }), "panel", "sin coincidencia: panel");
igual(claveIcono({ id: "FACTURACION" }), "recibo", "sin importar mayúsculas");
igual(claveIcono({}), "panel", "sin id");
igual(claveIcono(null), "panel", "tablero nulo");
igual(claveIcono({ id: 5 }), "panel", "id que no es texto");

/* ---- los trazos ---- */
const claves = Object.keys(TRAZOS);
igual(claves.length, 13, "trece íconos");
igual(claves.every(k => Array.isArray(TRAZOS[k]) && TRAZOS[k].length > 0 && TRAZOS[k].every(d => /^M[0-9a-zA-Z .,\-]+$/.test(d))), true, "cada trazo es una ruta simple");
igual(["panel", "tendencia", "pastel", "recibo", "planta", "calidad", "banco", "doc", "casa"].every(k => claves.includes(k)), true, "están los nueve nombres de siempre");
igual(["factur", "x", "venta", "prod", "costo", "calidad", "aviso", ""].every(id => claves.includes(claveIcono({ id }))), true, "toda clave elegida existe");
igual(["regulatorios", "personas", "chip", "ajustes"].every(k => claves.includes(k)), true, "están los íconos de gerencia");

/* ---- el ícono de cada gerencia del menú ---- */
const GER = ["comercial", "operaciones", "regulatorios", "control", "calidad", "finanzas", "rrhh", "sistemas", "direccion"];
igual(GER.every(id => claves.includes(claveGerencia(id))), true, "toda gerencia tiene un ícono que existe");
igual(new Set(GER.filter(id => id !== "direccion").map(claveGerencia)).size, 8, "las ocho gerencias con ícono propio no repiten");
igual(claveGerencia("general"), "panel", "General usa el panel");
igual(claveGerencia("toString"), "panel", "un nombre heredado no es una gerencia");
igual(claveGerencia(undefined), "panel", "sin gerencia: panel");

/* ---- lo que se añade al sitio no lleva efectos que el manual prohíbe ---- */
const css = readFileSync(new URL("../sitio/estilo.css", import.meta.url), "utf8");
const bloque = css.slice(css.indexOf("/* v5 ·"));
igual(bloque.length > 500, true, "el bloque v5 está en estilo.css");
igual(/gradient\(|box-shadow|text-shadow|backdrop|blur\(|@keyframes|animation:/i.test(bloque), false, "el bloque v5 no lleva degradados, sombras, desenfoques ni animaciones");
igual(/https?:/i.test(bloque), false, "el bloque v5 no pide nada a otros servidores");

console.log(mal ? "FALLARON " + mal + " de " + (ok + mal) : "iconos: " + ok + " de " + ok + " pruebas bien");
process.exit(mal ? 1 : 0);
