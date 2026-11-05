// Pruebas de los emblemas de gerencia, sin navegador ni red: node pruebas/emblemas.prueba.js
// Usa un servidor simulado de SharePoint y archivos SVG de juguete: el repositorio no lleva ningún emblema real (son de uso interno).
import { nombreEmblema, aImagen, MAX_SVG } from "../sitio/emblemas.js";
import { rutaAcceso } from "../sitio/acceso.js";

let ok = 0, mal = 0;
const igual = (a, b, nombre) => {
  const A = JSON.stringify(a), B = JSON.stringify(b);
  if (A === B) ok++; else { mal++; console.log("FALLA:", nombre, "\n  obtenido:", A, "\n  esperado:", B); }
};
const bytes = t => new TextEncoder().encode(t).buffer;
const SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 5"><path fill="#003764" d="M0 0H10V5H0Z"/></svg>';

/* ---- nombres ---- */
igual(nombreEmblema("comercial", false), "emblema-comercial.svg", "nombre positivo");
igual(nombreEmblema("rrhh", true), "emblema-rrhh-negativo.svg", "nombre negativo");
igual(nombreEmblema("../x", false), null, "nombre con ..");
igual(nombreEmblema("a/b", false), null, "nombre con diagonal");
igual(nombreEmblema("Comercial", false), null, "nombre con mayúsculas");
igual(nombreEmblema("", false), null, "nombre vacío");
igual(nombreEmblema(undefined, false), null, "nombre indefinido");

/* ---- aImagen ---- */
const uri = aImagen(bytes(SVG));
igual(uri.startsWith("data:image/svg+xml;base64,"), true, "es una dirección data: de SVG");
igual(atob(uri.split(",")[1]), SVG, "la dirección conserva los bytes");
igual(aImagen(bytes("﻿  " + SVG)) !== null, true, "acepta BOM y espacios");
igual(aImagen(bytes('<?xml version="1.0"?>\n' + SVG)) !== null, true, "acepta la declaración xml");
igual(aImagen(bytes("<html><body>hola</body></html>")), null, "no es SVG");
igual(aImagen(bytes("")), null, "vacío");
igual(aImagen(null), null, "nulo");
igual(aImagen(bytes(SVG.replace("<path", "<script>x</script><path"))), null, "con script");
igual(aImagen(bytes(SVG.replace("<path", '<path onload="x()"'))), null, "con evento");
igual(aImagen(bytes(SVG.replace("<path", "<foreignObject></foreignObject><path"))), null, "con foreignObject");
igual(aImagen(bytes(SVG + " ".repeat(MAX_SVG))), null, "demasiado grande");
igual(aImagen(bytes(SVG.replace("</svg>", "á é ñ</svg>"))) !== null, true, "acepta texto con acentos");

/* ---- la ruta es la de la carpeta hermana marca ---- */
igual(rutaAcceso({ host: "h.invalid", carpeta: "/personal/u/Documents/Raiz/indicadores" }, "marca"), { host: "h.invalid", carpeta: "/personal/u/Documents/Raiz/marca" }, "carpeta hermana marca");
igual(rutaAcceso({ host: "h.invalid", carpeta: "/personal/u/Documents/Sola" }, "marca"), null, "sin padre no se busca");

/* ---- leerEmblemas con un servidor simulado ---- */
const memoria = () => { const m = new Map(); return { getItem: k => m.has(k) ? m.get(k) : null, setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k), volcado: () => JSON.stringify([...m]) }; };
globalThis.sessionStorage = memoria();
globalThis.localStorage = memoria();
globalThis.location = { hostname: "pruebas.invalid", href: "https://pruebas.invalid/", origin: "https://pruebas.invalid", pathname: "/", search: "", hash: "" };
sessionStorage.setItem("sit.sesion", JSON.stringify({ refresh_token: "r", sp: true, host: "h.invalid", tokens: { graph: { t: "tg", vence: Date.now() + 3.6e6 }, sp: { t: "ts", vence: Date.now() + 3.6e6 } } }));
const antes = sessionStorage.volcado() + localStorage.volcado();

const { leerEmblemas, FuenteSP } = await import("../sitio/graph.js");
let peticiones = [], archivos = {};
globalThis.fetch = async (url) => {
  const u = String(url);
  peticiones.push(u);
  const m = /decodedurl='([^']+)'\)(\/\$value)?/.exec(u);
  const ruta = m ? decodeURIComponent(m[1]) : "";
  const nombre = ruta.split("/").pop();
  const a = archivos[nombre];
  if (!a || !ruta.includes("/Raiz/marca/")) return { ok: false, status: a === 403 ? 403 : 404, headers: { get: () => null }, json: async () => ({}), arrayBuffer: async () => new ArrayBuffer(0) };
  const texto = typeof a === "string" ? a : "";
  return { ok: true, status: 200, headers: { get: () => null }, json: async () => ({ Name: nombre, Length: String(a.largo ?? texto.length), TimeLastModified: "2026-01-01T00:00:00Z" }), arrayBuffer: async () => bytes(texto) };
};
const fuente = new FuenteSP("h.invalid", "/personal/u/Documents/Raiz/indicadores");
const leer = async (arch, id = "comercial", f = fuente) => { peticiones = []; archivos = arch; return leerEmblemas(f, id); };

let r = await leer({ "emblema-comercial.svg": SVG, "emblema-comercial-negativo.svg": SVG });
igual(r && r.claro.startsWith("data:image/svg+xml") && r.oscuro.startsWith("data:image/svg+xml"), true, "positivo y negativo");
igual(peticiones.every(u => u.startsWith("https://h.invalid/personal/u/_api/web/GetFileByServerRelativePath") && u.includes("/Raiz/marca/")), true, "sólo pide archivos de la carpeta hermana, en el mismo host");
r = await leer({ "emblema-comercial.svg": SVG });
igual(r && r.claro !== null && r.oscuro === null, true, "sin negativo: oscuro es null (se usa el positivo en recuadro)");
igual(await leer({ "emblema-comercial-negativo.svg": SVG }), null, "sólo negativo: sin emblema");
igual(await leer({}), null, "no existe (404)");
igual(await leer({ "emblema-comercial.svg": 403 }), null, "sin permiso (403)");
igual(await leer({ "emblema-comercial.svg": "<html>no</html>" }), null, "no es SVG");
igual(await leer({ "emblema-comercial.svg": { largo: MAX_SVG + 1 } }), null, "demasiado grande por sus metadatos, sin bajarlo");
igual(peticiones.some(u => u.includes("/$value")), false, "el archivo grande no se baja");
igual(await leer({ "emblema-comercial.svg": SVG }, "../x"), null, "gerencia inválida: sin peticiones");
igual(peticiones.length, 0, "gerencia inválida: ninguna petición");
igual(await leer({ "emblema-comercial.svg": SVG }, "comercial", new FuenteSP("h.invalid", "/personal/u/Documents/Sola")), null, "carpeta sin padre: sin emblema");
igual(peticiones.length, 0, "carpeta sin padre: ninguna petición");
igual(await leer({ "emblema-comercial.svg": SVG }, "comercial", { tipo: "carpeta" }), null, "fuente local: sin emblema");

const despues = sessionStorage.volcado() + localStorage.volcado();
igual(despues, antes, "el almacenamiento queda como estaba (no se guarda ningún emblema)");

console.log(mal ? "FALLARON " + mal + " de " + (ok + mal) : "emblemas: " + ok + " de " + ok + " pruebas bien");
process.exit(mal ? 1 : 0);
