// Pruebas del catálogo de acceso, sin navegador ni red: node pruebas/acceso.prueba.mjs
// Usa correos y dominios ficticios (dominio reservado .invalid) y un servidor simulado de SharePoint y Graph.
import { createHash } from "node:crypto";
import { hashCorreo, rutaAcceso, interpretarAcceso, MAX_BYTES } from "../sitio/acceso.js";
import { visiblesParaGerencia, gerenciaDeEtiquetas, gerenciaDe, GENERAL } from "../sitio/gerencias.js";

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

// nada del correo ni de su hash se guardó en el navegador
const despues = sessionStorage.volcado() + localStorage.volcado();
igual(despues.includes(esperado) || despues.toLowerCase().includes("ejemplo.invalid"), false, "el correo y su hash no se guardan");
igual(despues, antes, "el almacenamiento queda como estaba");

console.log(mal ? "FALLARON " + mal + " de " + (ok + mal) : "acceso: " + ok + " de " + ok + " pruebas bien");
process.exit(mal ? 1 : 0);
