// Pruebas de la lectura de los emblemas (una lista de archivos de `marca` y una lectura con tope por emblema que existe), sin navegador
// ni red: node pruebas/emblemas_carga.prueba.js
// Las fuentes son simuladas y registran cada petición; carpetas, nombres de gerencia y SVG son de juguete.
import { readFileSync } from "node:fs";
import { leerEmblemasEn } from "../sitio/emblemas_carga.js";
import { nombreEmblema, aImagen, MAX_SVG } from "../sitio/emblemas.js";

let ok = 0, mal = 0;
const igual = (a, b, nombre) => {
  const A = JSON.stringify(a), B = JSON.stringify(b);
  if (A === B) ok++; else { mal++; console.log("FALLA:", nombre, "\n  obtenido:", A, "\n  esperado:", B); }
};
const leer = r => readFileSync(new URL(r, import.meta.url), "utf8");
const falla = async f => { try { await f(); return null; } catch (e) { return e; } };
const tick = () => new Promise(r => setImmediate(r));
const bytes = t => new TextEncoder().encode(t).buffer;

const SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 5"><path fill="#003764" d="M0 0H10V5H0Z"/></svg>';
const SVG_NEG = SVG.replace("#003764", "#ffffff");
const err = (codigo, estado) => Object.assign(new Error("fallo " + codigo), { codigo, estado: estado || null });
// ids de gerencia de juguete: "geaa", "geab", ...
const idDe = i => "ge" + String.fromCharCode(97 + Math.floor(i / 26)) + String.fromCharCode(97 + (i % 26));
const ids = n => Array.from({ length: n }, (_, i) => idDe(i));
// la carpeta: positivo de cada gerencia y, si `conNeg` (número de gerencias con negativo), su negativo
const carpeta = (n, conNeg = n) => {
  const a = {};
  for (let i = 0; i < n; i++) { a[nombreEmblema(idDe(i), false)] = { texto: SVG }; if (i < conNeg) a[nombreEmblema(idDe(i), true)] = { texto: SVG_NEG }; }
  return a;
};

/* ---------- el mundo simulado ----------
   archivos[nombre] = { texto, bytes (tamaño en la lista), error (al leer) } · lista: Error | valor que devuelve `listaDe` */
function mundo(archivos, { lista = null } = {}) {
  const log = [];
  const P = {
    nombreEmblema, aImagen, max: MAX_SVG,
    listaDe: async () => {
      log.push("lista"); await tick();
      if (lista instanceof Error) throw lista;
      if (lista !== null) return lista;
      return Object.entries(archivos).map(([nombre, a]) => ({ nombre, bytes: a.bytes ?? a.texto.length, modificado: "2026-01-01T00:00:00Z" }));
    },
    leerArchivo: async nombre => {
      log.push("leer:" + nombre); await tick();
      const a = archivos[nombre];
      if (!a) throw err("no-existe", 404);
      if (a.error) throw a.error;
      return bytes(a.texto);
    },
  };
  return { P, log };
}
const cuenta = (log, pref) => log.filter(x => x.startsWith(pref)).length;
const claves = o => Object.keys(o);
const hayDatos = v => !!v && v.startsWith("data:image/svg+xml;base64,");

/* ================= 1. número de peticiones ================= */
{
  const w = mundo(carpeta(1));
  const r = await leerEmblemasEn({ ...w.P, ids: ids(1) });
  igual(w.log, ["lista", "leer:emblema-geaa.svg", "leer:emblema-geaa-negativo.svg"], "1 gerencia con negativo: una lista y una lectura por archivo");
  igual([hayDatos(r.geaa.claro), hayDatos(r.geaa.oscuro)], [true, true], "1 gerencia: el resultado trae positivo y negativo como direcciones data:");
}
for (const [n, conNeg, esperadas] of [[1, 0, 2], [8, 8, 17], [8, 0, 9], [8, 3, 12], [30, 30, 61], [30, 0, 31]]) {
  const w = mundo(carpeta(n, conNeg));
  const r = await leerEmblemasEn({ ...w.P, ids: ids(n) });
  igual([w.log.length, cuenta(w.log, "lista"), cuenta(w.log, "leer:")], [esperadas, 1, esperadas - 1], n + " gerencias, " + conNeg + " con negativo: una lista y una lectura por archivo que existe (ningún metadato)");
  igual([claves(r).length, Object.values(r).every(v => v && hayDatos(v.claro))], [n, true], n + " gerencias con " + conNeg + " negativos: todas con emblema");
}
{
  const w = mundo(carpeta(2, 1));
  const r = await leerEmblemasEn({ ...w.P, ids: ids(2) });
  igual([r.geaa.oscuro !== null, r.geab.oscuro], [true, null], "un negativo que falta deja oscuro en null");
  igual(w.log.some(x => x === "leer:emblema-geab-negativo.svg"), false, "un negativo que falta no genera petición");
}
{
  const a = carpeta(3, 3); delete a["emblema-geab.svg"];
  const w = mundo(a);
  const r = await leerEmblemasEn({ ...w.P, ids: ids(3) });
  igual([r.geab, hayDatos(r.geaa.claro), hayDatos(r.geac.claro)], [null, true, true], "una gerencia sin positivo queda en null y las demás siguen");
  igual(w.log.filter(x => x.includes("geab")), [], "sin positivo no se pide ni el negativo");
}
{
  const w = mundo({ "emblema-geaa-negativo.svg": { texto: SVG_NEG } });
  const r = await leerEmblemasEn({ ...w.P, ids: ids(1) });
  igual([r, w.log], [{ geaa: null }, ["lista"]], "sólo negativo: sin emblema y sin lecturas");
}
{
  const w = mundo({});
  const r = await leerEmblemasEn({ ...w.P, ids: ids(8) });
  igual([w.log, Object.values(r).every(v => v === null)], [["lista"], true], "carpeta sin emblemas: sólo la lista y todo null");
}

/* ================= 2. ids ================= */
{
  const w = mundo(carpeta(31));
  const r = await leerEmblemasEn({ ...w.P, ids: ids(31) });
  igual([claves(r).length, cuenta(w.log, "leer:")], [30, 60], "más de 30 gerencias: sólo las primeras 30");
}
{
  const w = mundo(carpeta(2));
  const r = await leerEmblemasEn({ ...w.P, ids: ["geaa", "geab", "geaa", "geab"] });
  igual([claves(r), cuenta(w.log, "leer:")], [["geaa", "geab"], 4], "ids repetidos se leen una sola vez");
}
{
  const w = mundo(carpeta(2));
  const r = await leerEmblemasEn({ ...w.P, ids: ["../x", "Comercial", "", 5, null, "a/b", "geaa"] });
  igual([claves(r), cuenta(w.log, "leer:")], [["geaa"], 2], "los ids no válidos se descartan");
}
for (const malos of [["../x", "Mayus"], [], "geaa", null, undefined]) {
  const w = mundo(carpeta(2));
  const r = await leerEmblemasEn({ ...w.P, ids: malos });
  igual([r, w.log], [{}, []], "sin ids válidos (" + JSON.stringify(malos) + "): ninguna petición");
}
{
  const w = mundo(carpeta(3));
  const r = await leerEmblemasEn({ ...w.P, ids: ["geac", "geaa", "geab"] });
  igual(claves(r), ["geac", "geaa", "geab"], "el resultado conserva el orden de los ids");
}

/* ================= 3. tamaño máximo ================= */
{
  const a = carpeta(2, 2); a["emblema-geaa.svg"].bytes = MAX_SVG + 1;
  const w = mundo(a);
  const r = await leerEmblemasEn({ ...w.P, ids: ids(2) });
  igual([r.geaa, hayDatos(r.geab.claro)], [null, true], "un emblema que la lista declara mayor que MAX_SVG se ignora");
  igual(w.log.filter(x => x.includes("geaa")), [], "y no se pide, ni el positivo ni su negativo");
}
{
  const a = carpeta(1, 1); a["emblema-geaa-negativo.svg"].bytes = MAX_SVG + 1;
  const w = mundo(a);
  const r = await leerEmblemasEn({ ...w.P, ids: ids(1) });
  igual([hayDatos(r.geaa.claro), r.geaa.oscuro, w.log.includes("leer:emblema-geaa-negativo.svg")], [true, null, false], "un negativo mayor que MAX_SVG deja oscuro en null y no se pide");
}
{
  const a = carpeta(1, 0); a["emblema-geaa.svg"].bytes = MAX_SVG;
  const w = mundo(a);
  const r = await leerEmblemasEn({ ...w.P, ids: ids(1) });
  igual([hayDatos(r.geaa.claro), w.log.length], [true, 2], "un archivo que la lista declara de exactamente MAX_SVG se lee");
}
{
  const a = carpeta(1, 0); a["emblema-geaa.svg"] = { texto: SVG, error: Object.assign(new Error("pasa del tope"), { codigo: "demasiado-grande" }) };
  const w = mundo(a);
  const r = await leerEmblemasEn({ ...w.P, ids: ids(1) });
  igual(r, { geaa: null }, "si la lectura con tope rechaza el archivo (la lista no lo sabía), queda en null");
}
{
  const grande = SVG + " ".repeat(MAX_SVG);
  const a = carpeta(1, 0); a["emblema-geaa.svg"] = { texto: grande, bytes: 10 };
  const w = mundo(a);
  const r = await leerEmblemasEn({ ...w.P, ids: ids(1) });
  igual(r, { geaa: null }, "si la lista miente y el archivo pasa del tope, aImagen lo rechaza igual");
}
{
  const justo = SVG + " ".repeat(MAX_SVG - SVG.length);
  const a = carpeta(1, 0); a["emblema-geaa.svg"] = { texto: justo };
  const w = mundo(a);
  const r = await leerEmblemasEn({ ...w.P, ids: ids(1) });
  igual(hayDatos(r.geaa.claro), true, "un SVG de exactamente MAX_SVG bytes se acepta");
}

/* ================= 4. contenido no válido (aImagen sin cambios) ================= */
for (const [rotulo, texto] of [["con script", SVG.replace("<path", "<script>x</script><path")], ["con evento", SVG.replace("<path", '<path onload="x()"')], ["con foreignObject", SVG.replace("<path", "<foreignObject></foreignObject><path")], ["con javascript:", SVG.replace('fill="#003764"', 'href="javascript:x()"')], ["que no es SVG", "<html><body>hola</body></html>"], ["vacío", ""]]) {
  const w = mundo({ "emblema-geaa.svg": { texto } });
  const r = await leerEmblemasEn({ ...w.P, ids: ids(1) });
  igual(r, { geaa: null }, "un positivo " + rotulo + " se rechaza");
}
{
  const w = mundo({ "emblema-geaa.svg": { texto: SVG }, "emblema-geaa-negativo.svg": { texto: SVG_NEG.replace("<path", "<script>x</script><path") } });
  const r = await leerEmblemasEn({ ...w.P, ids: ids(1) });
  igual([hayDatos(r.geaa.claro), r.geaa.oscuro], [true, null], "un negativo con script se rechaza y el positivo se conserva");
}

/* ================= 5. errores al leer un archivo ================= */
for (const [rotulo, e] of [["sin permiso", err("sin-permiso", 403)], ["de red", err("red")], ["de sesión", err("sin-sesion", 401)], ["del servidor", err("graph", 500)], ["que no es de la carpeta (TypeError)", new TypeError("x")]]) {
  const w = mundo({ "emblema-geaa.svg": { texto: SVG, error: e }, "emblema-geab.svg": { texto: SVG } });
  const r = await leerEmblemasEn({ ...w.P, ids: ids(2) });
  igual([r.geaa, hayDatos(r.geab.claro)], [null, true], "un error " + rotulo + " al leer deja null sin lanzar y las demás siguen");
}
{
  const w = mundo({ "emblema-geaa.svg": { texto: SVG } });
  const P = { ...w.P, leerArchivo: nombre => { throw new Error("fallo síncrono"); } };
  igual(await falla(async () => leerEmblemasEn({ ...P, ids: ids(1) })), null, "una lectura que lanza sin ser asíncrona no hace lanzar a leerEmblemasEn");
  igual(await leerEmblemasEn({ ...P, ids: ids(1) }), { geaa: null }, "y deja null");
}

/* ================= 6. la lista de archivos falla ================= */
for (const [rotulo, e] of [["red", err("red")], ["sesión", err("sin-sesion", 401)], ["permiso", err("sin-permiso", 403)], ["carpeta que no existe", err("no-existe", 404)]]) {
  const w = mundo(carpeta(8), { lista: e });
  const r = await leerEmblemasEn({ ...w.P, ids: ids(8) });
  igual([w.log, Object.values(r).every(v => v === null), claves(r).length], [["lista"], true, 8], "la lista falla por " + rotulo + ": todo null y ninguna petición más");
}
for (const [rotulo, lista] of [["500 del servidor", err("graph", 500)], ["página inválida", err("graph")], ["respuesta que no es una lista", "texto"], ["respuesta con un número", 5]]) {
  const w = mundo(carpeta(8, 8), { lista });
  const r = await leerEmblemasEn({ ...w.P, ids: ids(8) });
  igual([w.log.length, cuenta(w.log, "leer:"), Object.values(r).every(v => v && hayDatos(v.claro) && hayDatos(v.oscuro))], [17, 16, true], "la lista falla por " + rotulo + ": se intenta cada archivo por su nombre con la misma lectura");
}
{
  const a = carpeta(2, 2); delete a["emblema-geab.svg"]; delete a["emblema-geab-negativo.svg"];
  const w = mundo(a, { lista: err("graph", 500) });
  const r = await leerEmblemasEn({ ...w.P, ids: ids(2) });
  igual([hayDatos(r.geaa.claro), r.geab], [true, null], "sin lista, un emblema que no existe da null (404 al leerlo)");
}
{
  const w = mundo(carpeta(1, 0), { lista: err("graph", 500) });
  await leerEmblemasEn({ ...w.P, ids: ids(1) });
  igual(w.log, ["lista", "leer:emblema-geaa.svg", "leer:emblema-geaa-negativo.svg"], "sin lista se intentan positivo y negativo; el negativo que no existe falla en silencio");
}

/* ================= 7. la lista y sus nombres ================= */
{
  const w = mundo(carpeta(1, 1), { lista: [{ nombre: "EMBLEMA-geaa.SVG", bytes: 100 }, { nombre: "Emblema-geaa-Negativo.svg", bytes: 100 }] });
  const r = await leerEmblemasEn({ ...w.P, ids: ids(1) });
  igual(w.log, ["lista", "leer:EMBLEMA-geaa.SVG", "leer:Emblema-geaa-Negativo.svg"], "los nombres se comparan sin distinguir mayúsculas y se pide el nombre que da la lista");
  igual(r, { geaa: null }, "(la fuente simulada distingue mayúsculas, así que no encuentra esos nombres: el caso prueba qué nombre se pide)");
}
{
  const w = mundo(carpeta(2, 0), { lista: [null, {}, { nombre: 5 }, "x", { nombre: "emblema-geab.svg", bytes: 10 }] });
  const r = await leerEmblemasEn({ ...w.P, ids: ids(2) });
  igual([r.geaa, hayDatos(r.geab.claro)], [null, true], "los renglones de la lista sin nombre se ignoran");
}
{
  const w = mundo(carpeta(1, 0), { lista: [{ nombre: "emblema-geaa.svg" }] });
  const r = await leerEmblemasEn({ ...w.P, ids: ids(1) });
  igual(hayDatos(r.geaa.claro), true, "un renglón de la lista sin tamaño no impide leer el archivo");
}

/* ================= 8. sin fuente ================= */
{
  const w = mundo(carpeta(2));
  igual(await leerEmblemasEn({ ...w.P, listaDe: null, ids: ids(2) }), { geaa: null, geab: null }, "sin lista (fuente sin carpeta): todo null");
  igual(await leerEmblemasEn({ ...w.P, leerArchivo: null, ids: ids(2) }), { geaa: null, geab: null }, "sin lectura: todo null");
  igual(w.log, [], "sin fuente no hay ninguna petición");
}
{
  const r = await leerEmblemasEn({ listaDe: async () => { throw new Error("x"); }, leerArchivo: async () => { throw new Error("y"); }, aImagen: () => { throw new Error("z"); }, nombreEmblema, max: MAX_SVG, ids: ids(2) });
  igual(r, { geaa: null, geab: null }, "nunca lanza error, ni con una fuente y un convertidor que fallan");
}

/* ================= 9. con graph.js: FuenteSP y un servidor simulado ================= */
const memoria = () => { const m = new Map(); return { getItem: k => m.has(k) ? m.get(k) : null, setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k), volcado: () => JSON.stringify([...m]) }; };
globalThis.sessionStorage = memoria();
globalThis.localStorage = memoria();
globalThis.location = { hostname: "pruebas.invalid", href: "https://pruebas.invalid/", origin: "https://pruebas.invalid", pathname: "/", search: "", hash: "" };
sessionStorage.setItem("sit.sesion", JSON.stringify({ refresh_token: "r", sp: true, host: "h.invalid", tokens: { graph: { t: "tg", vence: Date.now() + 3.6e6 }, sp: { t: "ts", vence: Date.now() + 3.6e6 } } }));
const almacenAntes = sessionStorage.volcado() + localStorage.volcado();
const { leerEmblemas, leerEmblemasDe, FuenteSP } = await import("../sitio/graph.js");

let peticiones = [], marca = {}, estadoLista = 200, leidos = 0;
const resp = (estado, json) => ({ ok: estado >= 200 && estado < 300, status: estado, headers: { get: () => null }, json: async () => json ?? {}, arrayBuffer: async () => new ArrayBuffer(0) });
globalThis.fetch = async url => {
  const u = String(url);
  peticiones.push(u);
  const m = /decodedurl='([^']+)'\)/.exec(u);
  const ruta = m ? decodeURIComponent(m[1]) : "";
  if (u.includes("/Files?")) {
    if (!ruta.endsWith("/Raiz/marca") || estadoLista !== 200) return resp(ruta.endsWith("/Raiz/marca") ? estadoLista : 404);
    return resp(200, { value: Object.entries(marca).filter(([, a]) => typeof a !== "number").map(([Name, a]) => ({ Name, Length: String(a.enLista ?? (typeof a === "string" ? a.length : a.texto.length)), TimeLastModified: "2026-01-01T00:00:00Z" })) });
  }
  if (!u.includes("/$value") || !ruta.includes("/Raiz/marca/")) return resp(404);
  const a = marca[ruta.split("/").pop()];
  if (a === undefined) return resp(404);
  if (typeof a === "number") return resp(a);
  const texto = typeof a === "string" ? a : a.texto;
  return { ok: true, status: 200, headers: { get: n => n === "Content-Length" && a.declarado !== undefined ? String(a.declarado) : null }, json: async () => ({}), arrayBuffer: async () => { leidos++; return bytes(texto); } };
};
const fuente = new FuenteSP("h.invalid", "/personal/u/Documents/Raiz/indicadores");
const de = async (m, idsPedidos, f = fuente) => { peticiones = []; marca = m; leidos = 0; return leerEmblemasDe(f, idsPedidos); };
const sinMetadatos = () => peticiones.every(u => !(u.includes("GetFileByServerRelativePath") && u.includes("$select")));
const arch = (n, conNeg = n) => { const a = {}; for (let i = 0; i < n; i++) { a[nombreEmblema(idDe(i), false)] = SVG; if (i < conNeg) a[nombreEmblema(idDe(i), true)] = SVG_NEG; } return a; };

{
  const r = await de(arch(8), ids(8));
  igual([peticiones.length, peticiones.filter(u => u.includes("/Files?")).length, peticiones.filter(u => u.includes("/$value")).length, sinMetadatos()], [17, 1, 16, true], "ocho gerencias con negativo: una lista de marca y una lectura por emblema (17 peticiones; antes 32), sin metadatos");
  igual(peticiones[0].includes("/Files?$select=Name,Length,TimeLastModified&$top=1000") && decodeURIComponent(peticiones[0]).includes("(decodedurl='/personal/u/Documents/Raiz/marca')"), true, "la lista es la de la carpeta hermana marca");
  igual(peticiones.every(u => u.startsWith("https://h.invalid/personal/u/_api/web/GetF")), true, "todas las peticiones van al mismo dominio y a la API REST");
  igual(Object.values(r).every(v => v && hayDatos(v.claro) && hayDatos(v.oscuro)) && claves(r).length === 8, true, "las ocho traen positivo y negativo");
}
{
  const r = await de(arch(8, 0), ids(8));
  igual([peticiones.length, Object.values(r).every(v => v && v.oscuro === null)], [9, true], "ocho gerencias sin negativos: una lista y ocho lecturas, ninguna petición por un negativo que no hay");
}
{
  const r = await de(arch(30), ids(35));
  igual([peticiones.length, claves(r).length], [61, 30], "treinta gerencias: una lista y 60 lecturas; el tope de 30 se conserva");
}
{
  peticiones = []; marca = arch(1); estadoLista = 200;
  const r = await leerEmblemas(fuente, "geaa");
  igual([peticiones.length, hayDatos(r.claro), hayDatos(r.oscuro), Object.keys(r)], [3, true, true, ["claro", "oscuro"]], "leerEmblemas conserva la forma { claro, oscuro } (una lista y dos lecturas)");
  marca = { "emblema-geaa.svg": SVG };
  const r2 = await leerEmblemas(fuente, "geaa");
  igual([hayDatos(r2.claro), r2.oscuro], [true, null], "leerEmblemas: sin negativo, oscuro es null");
  marca = { "emblema-geaa-negativo.svg": SVG_NEG };
  igual(await leerEmblemas(fuente, "geaa"), null, "leerEmblemas: sin positivo devuelve null");
  igual(await leerEmblemas(fuente, "../x"), null, "leerEmblemas: id no válido devuelve null");
}
{
  await de({ "emblema-geaa.svg": SVG }, ["../x"]);
  igual(peticiones.length, 0, "un id no válido no hace ninguna petición");
  await de({ "emblema-geaa.svg": SVG }, ["geaa"], new FuenteSP("h.invalid", "/personal/u/Documents/Sola"));
  igual(peticiones.length, 0, "una carpeta sin padre no hace ninguna petición");
  igual(await de({ "emblema-geaa.svg": SVG }, ["geaa"], { tipo: "carpeta" }), { geaa: null }, "una fuente local no lee emblemas");
  igual(peticiones.length, 0, "una fuente local no hace ninguna petición");
}
{
  const r = await de({ "emblema-geaa.svg": { texto: SVG, enLista: MAX_SVG + 1 } }, ["geaa"]);
  igual([r, peticiones.filter(u => u.includes("/$value")).length], [{ geaa: null }, 0], "mayor que MAX_SVG por la lista: se ignora y no se baja");
  const r2 = await de({ "emblema-geaa.svg": { texto: SVG, declarado: MAX_SVG + 1 } }, ["geaa"]);
  igual([r2, leidos], [{ geaa: null }, 0], "mayor que MAX_SVG por Content-Length: se ignora sin leer el cuerpo");
  const r3 = await de({ "emblema-geaa.svg": { texto: SVG + " ".repeat(MAX_SVG), enLista: 10 } }, ["geaa"]);
  igual([r3, peticiones.filter(u => u.includes("/$value")).length], [{ geaa: null }, 1], "mayor que MAX_SVG sin Content-Length: se pide, se cuentan los bytes y se ignora");
  const r4 = await de({ "emblema-geaa.svg": { texto: SVG + " ".repeat(MAX_SVG - SVG.length), declarado: MAX_SVG, enLista: MAX_SVG } }, ["geaa"]);
  igual(hayDatos(r4.geaa.claro), true, "un archivo de exactamente MAX_SVG bytes se acepta");
}
{
  const r = await de({ "emblema-geaa.svg": { texto: SVG.replace("<path", "<script>x</script><path") } }, ["geaa"]);
  igual(r, { geaa: null }, "un SVG con script se rechaza");
  const r2 = await de({ "emblema-geaa.svg": 403, "emblema-geab.svg": SVG }, ids(2));
  igual([r2.geaa, hayDatos(r2.geab.claro)], [null, true], "un archivo sin permiso queda en null y los demás siguen");
}
{
  estadoLista = 404;
  const r = await de(arch(8), ids(8));
  igual([peticiones.length, Object.values(r).every(v => v === null)], [1, true], "la carpeta marca no existe: una petición y todo null");
  estadoLista = 403;
  await de(arch(8), ids(8));
  igual(peticiones.length, 1, "sin permiso sobre la carpeta marca: una petición y todo null");
  estadoLista = 500;
  const r3 = await de(arch(8), ids(8));
  igual([peticiones.length, peticiones.filter(u => u.includes("/$value")).length, Object.values(r3).every(v => v && hayDatos(v.claro))], [17, 16, true], "la lista falla con 500: se intenta cada archivo por su nombre (una lista y 16 lecturas)");
  estadoLista = 200;
}
{
  globalThis.fetch = async () => { throw new TypeError("sin red"); };
  const r = await de(arch(2), ids(2));
  igual(r, { geaa: null, geab: null }, "sin conexión: todo null sin lanzar");
  igual(await falla(() => leerEmblemas(fuente, "geaa")), null, "leerEmblemas no lanza sin conexión");
}
igual(sessionStorage.volcado() + localStorage.volcado(), almacenAntes, "no se guarda ningún emblema en el navegador");

/* ================= 10. estáticas ================= */
{
  const mod = leer("../sitio/emblemas_carga.js"), graph = leer("../sitio/graph.js"), emb = leer("../sitio/emblemas.js"), app = leer("../sitio/app.js");
  igual(/^import /m.test(mod), false, "emblemas_carga.js no importa nada: recibe todo por parámetros");
  igual(/\bdocument\b|\bwindow\b|fetch\(|XMLHttpRequest|localStorage|sessionStorage|innerHTML|insertAdjacentHTML|\beval\(|new Function|blob:/.test(mod), false, "emblemas_carga.js: sin DOM, red, almacenamiento ni HTML o código dinámico");
  const seccion = graph.slice(graph.indexOf("export async function leerEmblemas("), graph.indexOf("export const AVISO_CATALOGO"));
  igual(seccion.length > 300 && !/metadatos|\.leer\(/.test(seccion), true, "graph.js: los emblemas no piden metadatos ni la lectura sin tope");
  igual(/a\.archivosDeCarpeta\(\)/.test(seccion) && /a\.leerTope\(nombre, MAX_SVG\)/.test(seccion), true, "graph.js: lista de la carpeta y lectura con tope MAX_SVG");
  igual(/import \{ leerEmblemasEn \} from "\.\/emblemas_carga\.js";/.test(graph), true, "graph.js usa emblemas_carga.js");
  igual(/<script\|<foreignObject\|<iframe\|<embed\|<object\|javascript:/.test(emb), true, "emblemas.js conserva la lista de lo que aImagen rechaza");
  igual(/leerEmblemas\(fuente, gerencia\.id\)/.test(app) && /leerEmblemasDe\(f, idsDeGerencias\(\)\)/.test(app), true, "app.js sigue llamando a leerEmblemas y leerEmblemasDe igual");
  igual(/MAX_GERENCIAS = 30/.test(mod), true, "el tope de 30 gerencias está en el módulo");
  igual(/[\u00ab\u00bb]/.test(mod + graph), false, "emblemas_carga.js y graph.js: sin comillas angulares de cita");
}

console.log("emblemas_carga: " + ok + " de " + (ok + mal) + " pruebas bien");
process.exit(mal ? 1 : 0);
