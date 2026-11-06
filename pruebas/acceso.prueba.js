// Pruebas del catálogo de acceso, sin navegador ni red: node pruebas/acceso.prueba.mjs
// Usa correos y dominios ficticios (dominio reservado .invalid) y un servidor simulado de SharePoint y Graph.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { hashCorreo, rutaAcceso, interpretarAcceso, MAX_BYTES, MAX_CARPETAS } from "../sitio/acceso.js";
import { visiblesParaGerencia, gerenciaDeEtiquetas, gerenciaDe, esAdministrador, repartoPorGerencia, idsDeGerencias, todasLasGerencias, GENERAL, ADMIN } from "../sitio/gerencias.js";

let ok = 0, mal = 0;
const igual = (a, b, nombre) => {
  const A = JSON.stringify(a), B = JSON.stringify(b);
  if (A === B) ok++; else { mal++; console.log("FALLA:", nombre, "\n  obtenido:", A, "\n  esperado:", B); }
};
const correo = (usuario, dominio) => usuario + String.fromCharCode(64) + dominio;
const ids = ts => ts.map(t => t.id);

/* ---- hashCorreo ---- */
const ana = correo("ana", "ejemplo.invalid");
const esperado = createHash("sha256").update(ana).digest("hex");
igual(await hashCorreo(ana), esperado, "hash del correo");
igual(await hashCorreo("  " + ana.toUpperCase() + " "), esperado, "el hash ignora mayúsculas y espacios");
igual(await hashCorreo(""), null, "sin correo");
igual(await hashCorreo(undefined), null, "correo indefinido");

/* ---- rutaAcceso ---- */
const R = (carpeta, host = "h.invalid") => rutaAcceso({ host, carpeta }, "acceso");
igual(R("/personal/u/Documents/Raiz/indicadores"), { host: "h.invalid", carpeta: "/personal/u/Documents/Raiz/acceso" }, "hermana en la biblioteca personal");
igual(R("/sites/x/Shared Documents/Raiz/facturacion"), { host: "h.invalid", carpeta: "/sites/x/Shared Documents/Raiz/acceso" }, "hermana en un sitio");
igual(R("/Shared Documents/Raiz/indicadores"), { host: "h.invalid", carpeta: "/Shared Documents/Raiz/acceso" }, "hermana en el sitio raíz");
igual(R("/personal/u/Documents/Sola"), null, "carpeta directa en la biblioteca: sin padre");
igual(R("/sites/x/Shared Documents/Sola"), null, "carpeta directa en la biblioteca de un sitio: sin padre");
igual(R("/Shared Documents/Sola"), null, "carpeta directa en el sitio raíz: sin padre");
igual(R("/personal/u/Documents/../Raiz/a"), null, "con ..");
igual(R("/personal/u/Documents/./Raiz/a"), null, "con .");
igual(R("/personal/u/Documents/Raiz\\x/a"), null, "con contrabarra");
igual(rutaAcceso({ host: "h.invalid", carpeta: "/personal/u/Documents/Raiz/a" }, "../x"), null, "nombre con ..");
igual(rutaAcceso({ host: "h.invalid", carpeta: "/personal/u/Documents/Raiz/a" }, "a/b"), null, "nombre con diagonal");
igual(rutaAcceso(null, "acceso"), null, "sin ubicación");
igual(R("/personal/u/Documents/Raiz/a", "otro.invalid").host, "otro.invalid", "el host es el del enlace");

/* ---- interpretarAcceso ---- */
const K = await hashCorreo(correo("beto", "ejemplo.invalid"));
const doc = personas => JSON.stringify({ contrato: "acceso/1", generado: "2026-01-01T00:00:00Z", personas });
igual(interpretarAcceso(doc({ [K]: ["Comercial", " Finanzas "] }), K), { estado: "entrada", etiquetas: ["Comercial", "Finanzas"] }, "entrada");
igual(interpretarAcceso(doc({ otra: ["Comercial"] }), K), { estado: "sin-entrada" }, "persona sin entrada");
igual(interpretarAcceso(doc({}), K), { estado: "sin-entrada" }, "catálogo vacío es válido");
igual(interpretarAcceso(doc({ otra: ["Comercial"] }), null), { estado: "sin-entrada" }, "sin llave");
igual(interpretarAcceso(doc({ [K]: ["Comercial"] }), "toString"), { estado: "sin-entrada" }, "llave que es nombre de propiedad heredada");
igual(interpretarAcceso(doc({ [K]: ["Comercial"] }), "constructor"), { estado: "sin-entrada" }, "llave constructor");
igual(interpretarAcceso("no es json", K), { estado: "roto" }, "no es JSON");
igual(interpretarAcceso("", K), { estado: "roto" }, "vacío");
igual(interpretarAcceso("[]", K), { estado: "roto" }, "arreglo en lugar de objeto");
igual(interpretarAcceso("null", K), { estado: "roto" }, "null");
igual(interpretarAcceso(JSON.stringify({ contrato: "visor/1", personas: { [K]: ["Dirección"] } }), K), { estado: "roto" }, "contrato equivocado");
igual(interpretarAcceso(JSON.stringify({ contrato: "acceso/1" }), K), { estado: "roto" }, "sin personas");
igual(interpretarAcceso(JSON.stringify({ contrato: "acceso/1", personas: [] }), K), { estado: "roto" }, "personas es arreglo");
igual(interpretarAcceso(doc({ [K]: "Dirección" }), K), { estado: "roto" }, "etiquetas no es lista");
igual(interpretarAcceso(doc({ [K]: [] }), K), { estado: "roto" }, "lista vacía");
igual(interpretarAcceso(doc({ [K]: ["Comercial", 3] }), K), { estado: "roto" }, "etiqueta que no es texto");
igual(interpretarAcceso(doc({ [K]: ["  "] }), K), { estado: "roto" }, "etiqueta en blanco");
igual(interpretarAcceso(doc({ [K]: ["x".repeat(65)] }), K), { estado: "roto" }, "etiqueta demasiado larga");
igual(interpretarAcceso(doc({ [K]: Array.from({ length: 21 }, (_, i) => "e" + i) }), K), { estado: "roto" }, "demasiadas etiquetas");
igual(interpretarAcceso(" ".repeat(MAX_BYTES + 1) + doc({}), K), { estado: "roto" }, "archivo demasiado grande");
igual(interpretarAcceso(JSON.stringify({ contrato: "acceso/1", personas: { [K]: ["Comercial"], malo: 5 } }), K), { estado: "entrada", etiquetas: ["Comercial"] }, "una entrada ajena mal formada no afecta a la persona");
igual(interpretarAcceso(undefined, K), { estado: "roto" }, "sin texto");

/* ---- gerencias con etiquetas ---- */
const T = [
  { id: "a", grupo: "Comercial" },
  { id: "b", grupo: "Finanzas" },
  { id: "c" },
  { id: "d", grupo: "General" },
  { id: "e", grupo: "Comercial", audiencias: ["costo_utilidad"] },
  { id: "f", grupo: "Dirección" },
  { id: "g", grupo: "Interno", audiencias: ["costo_utilidad"] },
  { id: "h", grupo: "Operaciones", audiencias: ["Dirección"] },
  { id: "i", grupo: "Interno", audiencias: "Comercial" },
  { id: "j", grupo: "Interno", audiencias: [1, null, {}] },
];
const ver = et => ids(visiblesParaGerencia(T, gerenciaDeEtiquetas(et), et));
igual(ver(["Dirección"]), ids(T), "Dirección ve todo");
igual(ver(["direccion"]), ids(T), "Dirección sin acento ni mayúscula");
igual(ver(["Comercial"]), ["a", "e"], "Comercial");
igual(ver(["Comercial", "costo_utilidad"]), ["a", "e", "g"], "Comercial con una audiencia");
igual(ver(["General"]), ["c", "d"], "General");
igual(ver(["Finanzas"]), ["b"], "Finanzas");
igual(ver(["desconocida"]), [], "etiqueta desconocida no muestra nada");
igual(ver(["Interno"]), ["g", "i", "j"], "un grupo que no es gerencia se compara exacto");
igual(ver(["costo_utilidad"]), ["e", "g"], "sólo una audiencia");
igual(ver(["Comercial"]).includes("h"), false, "un tablero no da Dirección con su audiencia");
igual(ver(["Comercial"]).includes("f"), false, "el grupo Dirección de un tablero no se lo da a nadie");
igual(ver(["Comerc"]), [], "la comparación de la etiqueta es exacta, no por fragmentos");
igual(gerenciaDeEtiquetas(["Comercial", "Dirección"]).id, "direccion", "identidad: Dirección primero");
igual(gerenciaDeEtiquetas(["zzz", "Finanzas"]).id, "finanzas", "identidad: la primera gerencia reconocida");
igual(gerenciaDeEtiquetas(["zzz"]) === GENERAL, true, "identidad: general si nada se reconoce");
igual(gerenciaDeEtiquetas([]) === GENERAL, true, "identidad: lista vacía");
// sin entrada, el departamento manda como antes
igual(ids(visiblesParaGerencia(T, gerenciaDe("Ventas"))), ["a", "e"], "sin etiquetas: por departamento");
igual(ids(visiblesParaGerencia(T, gerenciaDe(""))), ["c", "d"], "sin etiquetas ni departamento: general");
igual(ids(visiblesParaGerencia(T, gerenciaDe("Dirección general"))), ids(T), "sin etiquetas: Dirección por departamento");

/* ---- Administrador: ve todo y manda sobre Dirección ---- */
igual(ver(["Administrador"]), ids(T), "Administrador ve todo");
igual(ver(["administrador"]), ids(T), "Administrador sin mayúscula");
igual(gerenciaDeEtiquetas(["Dirección", "Administrador"]) === ADMIN, true, "identidad: Administrador antes que Dirección");
igual(gerenciaDeEtiquetas(["Comercial", "Administrador"]) === ADMIN, true, "identidad: Administrador antes que una gerencia");
igual(esAdministrador(["Comercial", "Administrador"]), true, "esAdministrador: con la etiqueta");
igual(esAdministrador(["Dirección"]), false, "esAdministrador: Dirección no lo es");
igual(esAdministrador(["Admin"]), false, "esAdministrador: comparación exacta");
igual(esAdministrador(null), false, "esAdministrador: sin etiquetas");
igual(ids(visiblesParaGerencia(T, ADMIN)), ids(T), "sin etiquetas, la identidad Administrador ve todo");
igual(ver(["Comercial"]).includes("h"), false, "un tablero tampoco da Administrador con su audiencia");
igual(todasLasGerencias().some(g => g === ADMIN), true, "Administrador está en la lista de identidades");
igual(gerenciaDe("Administrador") === GENERAL, true, "el departamento Administrador no da la identidad: sólo el catálogo de acceso");

/* ---- carpetas que lee cada etiqueta (campo opcional `carpetas`) ---- */
const conCarpetas = (carpetas, etiquetas = ["Dirección"]) => interpretarAcceso(JSON.stringify({ contrato: "acceso/1", personas: { [K]: etiquetas }, carpetas }), K);
igual(conCarpetas({ "Dirección": ["facturacion", "indicadores"] }), { estado: "entrada", etiquetas: ["Dirección"], carpetas: ["facturacion", "indicadores"] }, "carpetas de la etiqueta");
igual(conCarpetas({ "Comercial": ["ventas"] }), { estado: "entrada", etiquetas: ["Dirección"] }, "carpetas de otra etiqueta no cuentan");
igual(conCarpetas({ "Dirección": ["a"], "Comercial": ["b", "a"] }, ["Dirección", "Comercial"]).carpetas, ["a", "b"], "se juntan las de varias etiquetas sin repetir");
igual(conCarpetas({ "Dirección": ["../otra", "a/b", "ok", "con espacio", "", 5, null, "a\\b"] }).carpetas, ["ok"], "nombres no válidos se ignoran");
igual(conCarpetas({ "Dirección": ["acceso", "MARCA", "util"] }).carpetas, ["util"], "las carpetas reservadas del sitio no se leen como tableros");
igual(conCarpetas({ "Dirección": "facturacion" }), { estado: "entrada", etiquetas: ["Dirección"] }, "lista que no es lista: se ignora, el acceso sigue");
igual(conCarpetas("facturacion"), { estado: "entrada", etiquetas: ["Dirección"] }, "campo que no es objeto: se ignora, el acceso sigue");
igual(conCarpetas([["x"]]), { estado: "entrada", etiquetas: ["Dirección"] }, "campo que es arreglo: se ignora");
igual(conCarpetas({ "Dirección": Array.from({ length: 30 }, (_, i) => "c" + i) }).carpetas.length, MAX_CARPETAS, "tope de carpetas");
igual(conCarpetas({ toString: ["x"], constructor: ["y"] }), { estado: "entrada", etiquetas: ["Dirección"] }, "nombres de propiedad heredada no cuentan");
igual(conCarpetas({ " Dirección": ["x"] }), { estado: "entrada", etiquetas: ["Dirección"] }, "la etiqueta se compara exacta");

/* ---- reparto para la portada de Administrador ---- */
const REP = repartoPorGerencia([...T, { id: "k", grupo: "Subdirección Comercial" }, { id: "l", grupo: "Ventas Nacional" }, { id: "m", grupo: "Marketing" }, { id: "n", grupo: "Producción planta" }, { id: "o", grupo: "Planeación" }, { id: "q", grupo: "Planeación y demanda" }, { id: "r", grupo: "Compras" }, null, undefined]);
const todos = REP.flatMap(x => x.tableros.map(t => t.id));
igual(todos.length, T.length + 7, "reparto: cada tablero aparece exactamente una vez (los nulos se ignoran)");
igual(new Set(todos).size, todos.length, "reparto: ningún tablero repetido");
igual(REP.filter(x => x.gerencia !== GENERAL).length, 9, "reparto: las nueve gerencias (Planeación y Compras van dentro de Operaciones) siempre salen");
igual(REP.find(x => x.gerencia.id === "comercial").tableros.map(t => t.id), ["a", "e", "k", "l", "m"], "reparto: Subdirección Comercial, Ventas y Marketing son Comercial");
igual(REP.find(x => x.gerencia.id === "operaciones").tableros.map(t => t.id), ["h", "n", "o", "q", "r"], "reparto: Operaciones, producción y los tableros de Planeación y de Compras");
igual(REP.find(x => x.gerencia.id === "direccion").tableros.map(t => t.id), ["f"], "reparto: el grupo Dirección");
igual(REP.find(x => x.gerencia.id === "calidad").tableros, [], "reparto: una gerencia sin tableros sale vacía");
igual(REP.find(x => x.gerencia === GENERAL).tableros.map(t => t.id), ["c", "d", "g", "i", "j"], "reparto: sin grupo, General y grupos desconocidos van a General");
igual(repartoPorGerencia([]).length, 9, "reparto: sin tableros no sale General");
igual(repartoPorGerencia(undefined).length, 9, "reparto: sin lista");
igual(REP.every(x => x.tableros.every(t => t && typeof t.id === "string")), true, "reparto: sólo tableros");
igual(REP.some(x => x.gerencia.id === "planeacion" || x.gerencia.id === "compras"), false, "reparto: Planeación y Compras no tienen tarjeta propia");
igual(REP.find(x => x.gerencia.id === "operaciones").lema, "Producción, planta, planeación y compras", "reparto: el lema de Operaciones incluye planeación y compras");
igual(REP.find(x => x.gerencia.id === "comercial").lema, "Venta, clientes y mercados", "reparto: las demás conservan su lema");
igual(REP.find(x => x.gerencia === GENERAL).lema, "Tableros sin gerencia", "reparto: lema de General");
igual(idsDeGerencias().length === 9 && idsDeGerencias().includes("operaciones") && !idsDeGerencias().includes("planeacion") && !idsDeGerencias().includes("compras") && !idsDeGerencias().includes("administrador") && !idsDeGerencias().includes("general"), true, "idsDeGerencias: las nueve gerencias con tarjeta, para leer sus emblemas");

/* ---- perfil y leerAcceso con un servidor simulado ---- */
const memoria = () => { const m = new Map(); return { getItem: k => m.has(k) ? m.get(k) : null, setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k), get claves() { return [...m.keys()]; }, volcado: () => JSON.stringify([...m]) }; };
globalThis.sessionStorage = memoria();
globalThis.localStorage = memoria();
globalThis.location = { hostname: "pruebas.invalid", href: "https://pruebas.invalid/", origin: "https://pruebas.invalid", pathname: "/", search: "", hash: "" };
sessionStorage.setItem("sit.sesion", JSON.stringify({ refresh_token: "r", sp: true, host: "h.invalid", tokens: { graph: { t: "tg", vence: Date.now() + 3.6e6 }, sp: { t: "ts", vence: Date.now() + 3.6e6 } } }));
const antes = sessionStorage.volcado() + localStorage.volcado();

const { perfil, leerAcceso, FuenteSP } = await import("../sitio/graph.js");
let peticiones = [], servidor = () => ({ estado: 404 });
globalThis.fetch = async (url, init) => {
  peticiones.push(String(url));
  const r = servidor(String(url), init);
  return { ok: r.estado >= 200 && r.estado < 300, status: r.estado, headers: { get: () => null }, json: async () => r.json, arrayBuffer: async () => new TextEncoder().encode(r.texto ?? "").buffer };
};
const carpetaEnlace = "/personal/u/Documents/Raiz/indicadores";
const fuente = new FuenteSP("h.invalid", carpetaEnlace);
const esCatalogo = u => u.includes("/Raiz/acceso/sit-acceso.json");
const sirve = (texto, largo) => (u) => u.includes("/$value") ? { estado: 200, texto } : { estado: 200, json: { Name: "sit-acceso.json", Length: String(largo ?? texto.length), TimeLastModified: "2026-01-01T00:00:00Z" } };

servidor = () => ({ estado: 200, json: { displayName: "Persona Ficticia", department: "Ventas", userPrincipalName: ana.toUpperCase() } });
const p = await perfil();
igual(p.llave, esperado, "perfil: la llave sale del correo");
igual(JSON.stringify(p).toLowerCase().includes("ejemplo.invalid"), false, "perfil: el correo no sale en el resultado");
igual(peticiones.some(u => u.includes("userPrincipalName")), true, "perfil: se pide el correo a Graph");

const acceso = async (resp, llave = esperado, f = fuente) => { peticiones = []; servidor = resp; return leerAcceso(f, llave); };
const entradaAna = JSON.stringify({ contrato: "acceso/1", personas: { [esperado]: ["Comercial", "costo_utilidad"] } });

igual(await acceso(u => esCatalogo(u) ? sirve(entradaAna)(u) : { estado: 500 }), { estado: "entrada", etiquetas: ["Comercial", "costo_utilidad"] }, "leerAcceso: entrada");
igual(peticiones.every(u => u.startsWith("https://h.invalid/personal/u/_api/web/GetFileByServerRelativePath")) && peticiones.every(esCatalogo) && peticiones.length === 2, true, "leerAcceso: sólo pide el archivo de la carpeta hermana, en el mismo host");
igual(await acceso(sirve(entradaAna), await hashCorreo(correo("otra", "ejemplo.invalid"))), { estado: "sin-entrada" }, "leerAcceso: sin entrada");
igual(await acceso(() => ({ estado: 404 })), { estado: "sin-catalogo" }, "leerAcceso: el archivo no existe");
igual(await acceso(() => ({ estado: 403 })), { estado: "roto" }, "leerAcceso: sin permiso sobre la carpeta de acceso");
igual(await acceso(() => ({ estado: 500 })), { estado: "roto" }, "leerAcceso: error del servidor");
igual(await acceso(sirve("{ no es json")), { estado: "roto" }, "leerAcceso: JSON malformado");
igual(await acceso(sirve("{}")), { estado: "roto" }, "leerAcceso: contrato ausente");
igual(await acceso(sirve(entradaAna, MAX_BYTES + 1)), { estado: "roto" }, "leerAcceso: archivo demasiado grande, sin bajarlo");
igual(peticiones.length, 1, "leerAcceso: el archivo demasiado grande no se baja");
igual(await acceso(sirve(entradaAna), esperado, new FuenteSP("h.invalid", "/personal/u/Documents/Sola")), { estado: "sin-catalogo" }, "leerAcceso: carpeta sin padre");
igual(peticiones.length, 0, "leerAcceso: sin padre no hay ninguna petición");
igual(await acceso(sirve(entradaAna), esperado, { tipo: "carpeta" }), { estado: "sin-catalogo" }, "leerAcceso: una fuente local no busca acceso");

/* ---- identidad: la usan el menú (index) y los embebidos (ver) ---- */
const { identidad } = await import("../sitio/graph.js");
const quien = async (resp, p) => { peticiones = []; servidor = resp; return identidad(fuente, p); };
const conAdmin = JSON.stringify({ contrato: "acceso/1", personas: { [esperado]: ["Administrador", "Dirección"] }, carpetas: { "Dirección": ["facturacion"] } });
const iAdmin = await quien(u => esCatalogo(u) ? sirve(conAdmin)(u) : { estado: 500 }, { llave: esperado, departamento: "Contabilidad" });
igual([iAdmin.gerencia === ADMIN, iAdmin.etiquetas, iAdmin.entrada, iAdmin.accesoRoto, iAdmin.carpetas], [true, ["Administrador", "Dirección"], true, false, ["facturacion"]], "identidad: Administrador por el catálogo, aunque el Departamento diga otra cosa");
const iDir = await quien(u => esCatalogo(u) ? sirve(JSON.stringify({ contrato: "acceso/1", personas: { [esperado]: ["Dirección"] } }))(u) : { estado: 500 }, { llave: esperado, departamento: "" });
igual([iDir.gerencia.id, iDir.entrada, iDir.carpetas], ["direccion", true, []], "identidad: Dirección por el catálogo con Departamento vacío (el caso de un perfil sin gerencia)");
igual(ids(visiblesParaGerencia(T, iDir.gerencia, iDir.etiquetas)), ids(T), "identidad: Dirección con Departamento vacío ve un tablero del grupo Comercial en los embebidos");
const iSin = await quien(sirve(entradaAna), { llave: await hashCorreo(correo("otra", "ejemplo.invalid")), departamento: "Ventas" });
igual([iSin.gerencia.id, iSin.etiquetas, iSin.entrada, iSin.accesoRoto], ["comercial", null, false, false], "identidad: sin entrada manda el Departamento");
const iNo = await quien(() => ({ estado: 404 }), { llave: esperado, departamento: "Finanzas" });
igual([iNo.gerencia.id, iNo.etiquetas, iNo.accesoRoto], ["finanzas", null, false], "identidad: sin catálogo de acceso manda el Departamento");
const iRoto = await quien(() => ({ estado: 403 }), { llave: esperado, departamento: "Ventas" });
igual([iRoto.gerencia === GENERAL, iRoto.etiquetas, iRoto.accesoRoto], [true, ["General"], true], "identidad: catálogo ilegible, sólo lo general y aviso");
igual((await quien(() => ({ estado: 404 }), undefined)).gerencia === GENERAL, true, "identidad: sin perfil queda general");
const veriSrc = readFileSync(new URL("../sitio/ver.js", import.meta.url), "utf8");
igual(/identidad\(fuente, await perfil\(\)/.test(veriSrc) && /visiblesParaGerencia\([\s\S]*?idn\.gerencia, idn\.etiquetas\)/.test(veriSrc), true, "ver.js decide con la identidad del catálogo de acceso, no sólo con el Departamento");
igual(/gerenciaDe\(/.test(veriSrc), false, "ver.js ya no decide sólo por Departamento");

/* ---- carpetas hermanas: enumerar y abrir ---- */
const { listarHermanas, fuenteHermana } = await import("../sitio/graph.js");
const respuestaCarpetas = { value: [{ Name: "facturacion" }, { Name: "acceso" }, { Name: "marca" }, { Name: "indicadores" }, { Nombre: "x" }, { Name: 5 }] };
peticiones = []; servidor = u => u.includes("/Folders") ? { estado: 200, json: respuestaCarpetas } : { estado: 404 };
igual(await listarHermanas(fuente), ["facturacion", "acceso", "marca", "indicadores"], "listarHermanas: los nombres de las carpetas junto a la del enlace");
igual(peticiones.length === 1 && decodeURIComponent(peticiones[0]).includes("(decodedurl='/personal/u/Documents/Raiz')"), true, "listarHermanas: lista la carpeta padre, no la del enlace");
igual(peticiones.every(u => u.startsWith("https://h.invalid/")), true, "listarHermanas: en el mismo dominio");
servidor = () => ({ estado: 403 });
igual(await listarHermanas(fuente), [], "listarHermanas: sin permiso devuelve lista vacía, sin error");
servidor = () => ({ estado: 200, json: { value: "no es lista" } });
igual(await listarHermanas(fuente), [], "listarHermanas: respuesta mal formada");
peticiones = [];
igual(await listarHermanas(new FuenteSP("h.invalid", "/personal/u/Documents/Sola")), [], "listarHermanas: sin carpeta padre en la biblioteca");
igual(await listarHermanas({ tipo: "carpeta" }), [], "listarHermanas: una fuente local no enumera nada");
igual(peticiones.length, 0, "listarHermanas: en esos casos no hay peticiones");
const hermana = fuenteHermana(fuente, "facturacion");
igual([hermana.host, hermana.carpeta, hermana.tipo], ["h.invalid", "/personal/u/Documents/Raiz/facturacion", "graph"], "fuenteHermana: la carpeta junto a la del enlace");
igual(fuenteHermana(fuente, "../otra"), null, "fuenteHermana: sin salirse de la biblioteca");
igual(fuenteHermana(fuente, "a/b"), null, "fuenteHermana: un solo nombre, sin diagonales");
igual(fuenteHermana({ tipo: "carpeta" }, "x"), null, "fuenteHermana: una fuente local no tiene hermanas");
igual(fuenteHermana(new FuenteSP("h.invalid", "/personal/u/Documents/Sola"), "x"), null, "fuenteHermana: sin padre");

/* ---- emblemas de varias gerencias (mapa de Administrador) ---- */
const { leerEmblemasDe } = await import("../sitio/graph.js");
const SVG = '<svg xmlns="http://www.w3.org/2000/svg"><rect width="1" height="1"/></svg>';
const sirveSvg = nombres => u => {
  const n = nombres.find(x => decodeURIComponent(u).includes("/Raiz/marca/" + x));
  if (!n) return { estado: 404 };
  return u.includes("/$value") ? { estado: 200, texto: SVG } : { estado: 200, json: { Name: n, Length: String(SVG.length), TimeLastModified: "2026-01-01T00:00:00Z" } };
};
peticiones = []; servidor = sirveSvg(["emblema-comercial.svg", "emblema-comercial-negativo.svg", "emblema-compras.svg"]);
const em = await leerEmblemasDe(fuente, ["comercial", "compras", "calidad", "comercial", "../x", 5]);
igual(Object.keys(em), ["comercial", "compras", "calidad"], "emblemas: una entrada por gerencia válida, sin repetidas ni nombres raros");
igual(em.comercial && em.comercial.claro.startsWith("data:image/svg+xml;base64,") && em.comercial.oscuro.startsWith("data:image/svg+xml;base64,"), true, "emblemas: positivo y negativo como direcciones data:");
igual(em.compras && em.compras.claro.startsWith("data:") && em.compras.oscuro === null, true, "emblemas: sin negativo, el positivo solo (va en recuadro claro)");
igual(em.calidad, null, "emblemas: la gerencia sin emblema queda en null");
igual(peticiones.every(u => u.startsWith("https://h.invalid/personal/u/_api/web/GetFileByServerRelativePath") && decodeURIComponent(u).includes("/Raiz/marca/")), true, "emblemas: sólo se pide a la carpeta marca hermana, en el mismo dominio");
servidor = () => ({ estado: 500 });
igual(await leerEmblemasDe(fuente, ["comercial", "calidad"]), { comercial: null, calidad: null }, "emblemas: un error del servidor no lanza, deja null");
servidor = () => ({ estado: 403 });
igual(await leerEmblemasDe(fuente, ["comercial"]), { comercial: null }, "emblemas: sin permiso sobre marca, null");
igual(await leerEmblemasDe({ tipo: "carpeta" }, ["comercial"]), { comercial: null }, "emblemas: una fuente local no los lee");
igual(await leerEmblemasDe(fuente, undefined), {}, "emblemas: sin lista");
igual(Object.keys(await leerEmblemasDe(fuente, Array.from({ length: 50 }, (_, i) => "g" + String.fromCharCode(97 + (i % 26)) + String.fromCharCode(97 + Math.floor(i / 26))))).length <= 30, true, "emblemas: tope de 30 gerencias");

// nada del correo ni de su hash se guardó en el navegador
const despues = sessionStorage.volcado() + localStorage.volcado();
igual(despues.includes(esperado) || despues.toLowerCase().includes("ejemplo.invalid"), false, "el correo y su hash no se guardan");
igual(despues, antes, "el almacenamiento queda como estaba");

console.log(mal ? "FALLARON " + mal + " de " + (ok + mal) : "acceso: " + ok + " de " + ok + " pruebas bien");
process.exit(mal ? 1 : 0);
