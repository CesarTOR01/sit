// Pruebas del "Ver como" de Administrador, sin navegador ni red: node pruebas/vercomo.prueba.js
// Usa correos inventados del dominio reservado .test y un servidor simulado de SharePoint.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { identidadComo, esCorreo, textoFranja, MAX_CORREO, AVISO_SIN_ENTRADA, AVISO_SIN_CATALOGO } from "../sitio/vercomo.js";
import { hashCorreo, MAX_BYTES } from "../sitio/acceso.js";
import { visiblesParaGerencia, GENERAL } from "../sitio/gerencias.js";
import { carpetasALeer } from "../sitio/catalogos.js";

let ok = 0, mal = 0;
const igual = (a, b, nombre) => {
  const A = JSON.stringify(a), B = JSON.stringify(b);
  if (A === B) ok++; else { mal++; console.log("FALLA:", nombre, "\n  obtenido:", A, "\n  esperado:", B); }
};
const leer = (r) => readFileSync(new URL(r, import.meta.url), "utf8");
const correo = (usuario, dominio = "ejemplo.test") => usuario + String.fromCharCode(64) + dominio;
const llave = c => createHash("sha256").update(c).digest("hex");

/* ---- catálogo de acceso inventado ---- */
const A = correo("persona.a"), B = correo("persona.b"), C = correo("persona.c"), D = correo("persona.d"), ADM = correo("admin.x"), ADM2 = correo("admin.y");
const largo = correo("p".repeat(MAX_CORREO - "ejemplo.test".length - 1)); // 254 caracteres justos
const doc = JSON.stringify({
  contrato: "acceso/1",
  personas: {
    [llave(A)]: ["Comercial"],
    [llave(B)]: ["Finanzas", "costo_utilidad"],
    [llave(C)]: ["Dirección"],
    [llave(D)]: ["Comercial", 3],
    [llave(ADM)]: ["Administrador", "Dirección"],
    [llave(ADM2)]: ["Comercial", "administrador"],
    [llave(largo)]: ["Calidad"],
  },
  carpetas: { "Dirección": ["facturacion", "indicadores"], "Finanzas": ["cartera"] },
});
const como = (c, texto = doc, hc = hashCorreo) => identidadComo(texto, c, hc);
const resumen = r => r && [r.gerencia.id, r.etiquetas, r.carpetas];

// lo que imprime la consola mientras se calcula la identidad (no debe haber nada)
const impreso = [];
const consolaReal = { log: console.log, warn: console.warn, error: console.error, info: console.info, debug: console.debug };
const callar = () => { for (const k of Object.keys(consolaReal)) console[k] = (...a) => impreso.push(a.map(String).join(" ")); };
const hablar = () => Object.assign(console, consolaReal);

callar();
const rA = await como(A), rB = await como(B), rC = await como(C), rD = await como(D);
const rMay = await como("  " + A.toUpperCase() + " "), rLargo = await como(largo), rLargo1 = await como("p" + largo);
const rSin = await como(correo("nadie")), rAdm = await como(ADM), rAdm2 = await como(ADM2);
const invalidos = await Promise.all(["sin-arroba.ejemplo.test", correo("", "ejemplo.test"), correo("persona", ""), correo("dos", correo("x", "ejemplo.test")), "persona .a" + String.fromCharCode(64) + "ejemplo.test", "", "   "].map(c => como(c)));
const noTexto = await Promise.all([undefined, null, 42, {}, [A]].map(c => como(c)));
const rotos = await Promise.all(["{ no es json", "", "null", JSON.stringify({ contrato: "visor/1", personas: {} }), JSON.stringify({ contrato: "acceso/1" }), null, " ".repeat(MAX_BYTES + 1)].map(t => como(A, t)));
const rLanza = await como(A, doc, async () => { throw new Error("falla"); });
const rSinHash = await como(A, doc, null);
const rHashVacio = await como(A, doc, async () => null);
hablar();

/* ---- identidadComo: personas con entrada ---- */
igual(resumen(rA), ["comercial", ["Comercial"], []], "con entrada: una etiqueta, su gerencia y sin carpetas");
igual(resumen(rB), ["finanzas", ["Finanzas", "costo_utilidad"], ["cartera"]], "con varias etiquetas: la gerencia reconocida y la audiencia");
igual(resumen(rC), ["direccion", ["Dirección"], ["facturacion", "indicadores"]], "con carpetas: las de su etiqueta");
igual(Object.keys(rA), ["etiquetas", "carpetas", "gerencia"], "la forma es { etiquetas, carpetas, gerencia }, como en app.js");
igual(resumen(rMay), resumen(rA), "mayúsculas y espacios a los lados se normalizan igual que hashCorreo");
igual(resumen(rLargo), ["calidad", ["Calidad"], []], "correo de 254 caracteres: vale");

/* ---- identidadComo: null ---- */
igual(rSin, null, "sin entrada: null");
igual(rLargo1, null, "correo de 255 caracteres: null");
igual(invalidos, [null, null, null, null, null, null, null], "sin forma de correo (sin arroba, sin algo a un lado, dos arrobas, con espacio), vacío o en blanco: null");
igual(noTexto, [null, null, null, null, null], "correo que no es texto: null");
igual(rotos, [null, null, null, null, null, null, null], "archivo mal formado, sin contrato, sin personas, sin texto o demasiado grande: null");
igual(rD, null, "entrada mal formada de la persona: null");
igual(rAdm, null, "Administrador: no se puede simular");
igual(rAdm2, null, "Administrador junto a otra etiqueta y en minúsculas: tampoco");
igual([rLanza, rSinHash, rHashVacio], [null, null, null], "nunca lanza: si el hash falla, falta o viene vacío, null");

/* ---- el correo y su hash no salen ni se imprimen ---- */
const todo = JSON.stringify([rA, rB, rC, rMay, rLargo]).toLowerCase();
igual([A, B, C, largo, "persona.a", "ejemplo.test"].some(x => todo.includes(x.toLowerCase())), false, "el resultado no incluye el correo");
igual([A, B, C, largo].some(x => todo.includes(llave(x))), false, "el resultado no incluye el hash del correo");
igual(impreso, [], "nada se imprime en la consola al calcular la identidad");
igual([AVISO_SIN_ENTRADA, AVISO_SIN_CATALOGO, textoFranja(rB.etiquetas)].some(t => t.includes(String.fromCharCode(64))), false, "los avisos y la franja no llevan ningún correo");

/* ---- esCorreo y la franja ---- */
igual([esCorreo(A), esCorreo(" " + A.toUpperCase()), esCorreo(largo), esCorreo("p" + largo), esCorreo("x".repeat(5000))], [true, true, true, false, false], "esCorreo: forma, normalización y tope de 254");
igual(textoFranja(["Finanzas", "costo_utilidad"]), "Vista como una persona del catálogo (etiquetas: Finanzas, costo_utilidad) · sólo presentación; el permiso real es el de SharePoint", "franja: texto con las etiquetas");
igual(AVISO_SIN_ENTRADA, "Esa persona no tiene entrada en el catálogo de acceso: el sitio la presentaría según su Departamento, que no se puede ver para otra cuenta.", "aviso sin entrada: el texto pedido");

/* ---- la vista simulada usa las mismas reglas que la real ---- */
const T = [{ id: "a", grupo: "Comercial" }, { id: "b", grupo: "Finanzas" }, { id: "c", grupo: "Interno", audiencias: ["costo_utilidad"] }, { id: "d", grupo: "General" }, { id: "e" }];
igual(visiblesParaGerencia(T, rB.gerencia, rB.etiquetas).map(t => t.id), ["b", "c"], "menú simulado: sus tableros por grupo y por audiencia");
igual(visiblesParaGerencia(T, rC.gerencia, rC.etiquetas).map(t => t.id), ["a", "b", "c", "d", "e"], "menú simulado: Dirección ve todos");
igual(carpetasALeer({ administrador: false, existentes: ["facturacion", "otra", "cartera"], configuradas: rB.carpetas, propia: "indicadores" }), ["cartera"], "carpetas hermanas simuladas: sólo las de su lista, no todas las que existen");
igual(rA.gerencia === GENERAL, false, "la gerencia simulada es la de sus etiquetas, no la general");

/* ---- leerTextoAcceso: lectura en línea del catálogo de acceso (servidor simulado) ---- */
const memoria = () => { const m = new Map(); return { getItem: k => m.has(k) ? m.get(k) : null, setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k), volcado: () => JSON.stringify([...m]) }; };
globalThis.sessionStorage = memoria();
globalThis.localStorage = memoria();
globalThis.location = { hostname: "pruebas.invalid", href: "https://pruebas.invalid/", origin: "https://pruebas.invalid", pathname: "/", search: "", hash: "" };
sessionStorage.setItem("sit.sesion", JSON.stringify({ refresh_token: "r", sp: true, host: "h.invalid", tokens: { graph: { t: "tg", vence: Date.now() + 3.6e6 }, sp: { t: "ts", vence: Date.now() + 3.6e6 } } }));
const antes = sessionStorage.volcado() + localStorage.volcado();
const { leerTextoAcceso, FuenteSP } = await import("../sitio/graph.js");
let peticiones = [], servidor = () => ({ estado: 404 });
globalThis.fetch = async (url, init) => {
  peticiones.push(String(url));
  const r = servidor(String(url), init);
  return { ok: r.estado >= 200 && r.estado < 300, status: r.estado, headers: { get: () => null }, json: async () => r.json, arrayBuffer: async () => new TextEncoder().encode(r.texto ?? "").buffer };
};
const fuente = new FuenteSP("h.invalid", "/personal/u/Documents/Raiz/indicadores");
const esCatalogo = u => u.includes("/Raiz/acceso/sit-acceso.json");
const sirve = (texto, largoArchivo) => (u) => u.includes("/$value") ? { estado: 200, texto } : { estado: 200, json: { Name: "sit-acceso.json", Length: String(largoArchivo ?? texto.length), TimeLastModified: "2026-01-01T00:00:00Z" } };
const texto = async (resp, f = fuente) => { peticiones = []; servidor = resp; return leerTextoAcceso(f); };

igual(await texto(u => esCatalogo(u) ? sirve(doc)(u) : { estado: 500 }), doc, "leerTextoAcceso: el texto del catálogo de la carpeta hermana");
igual(peticiones.length === 2 && peticiones.every(esCatalogo), true, "leerTextoAcceso: sólo pide ese archivo, en el mismo host");
igual(resumen(await como(B, await texto(sirve(doc)))), ["finanzas", ["Finanzas", "costo_utilidad"], ["cartera"]], "leerTextoAcceso + identidadComo: la persona del catálogo leído");
igual([await texto(() => ({ estado: 404 })), await texto(() => ({ estado: 403 })), await texto(() => ({ estado: 500 }))], [null, null, null], "leerTextoAcceso: sin archivo, sin permiso o con error, null");
igual(await texto(sirve(doc, MAX_BYTES + 1)), null, "leerTextoAcceso: demasiado grande, null");
igual(peticiones.length, 1, "leerTextoAcceso: el archivo demasiado grande no se baja");
igual([await texto(sirve(doc), new FuenteSP("h.invalid", "/personal/u/Documents/Sola")), peticiones.length], [null, 0], "leerTextoAcceso: carpeta sin padre, sin peticiones");
igual(await texto(sirve(doc), { tipo: "carpeta" }), null, "leerTextoAcceso: una fuente local no lee acceso");
igual(sessionStorage.volcado() + localStorage.volcado(), antes, "leerTextoAcceso: no guarda nada en el navegador");

/* ---- estático: vercomo.js sin DOM, red ni almacenamiento ---- */
const vc = leer("../sitio/vercomo.js");
igual(/\bdocument\b|\bwindow\b|fetch\(|XMLHttpRequest|WebSocket|localStorage|sessionStorage|indexedDB|\bhistory\.|\blocation\.|console\.|innerHTML/.test(vc), false, "vercomo.js: sin DOM, red, almacenamiento, dirección ni consola");
igual((vc.match(/^import .* from "(.*)";$/gm) || []).map(l => /from "(.*)"/.exec(l)[1]), ["./acceso.js", "./gerencias.js"], "vercomo.js: sólo depende de acceso.js y gerencias.js");

/* ---- estático: app.js crea el control sólo con la identidad real de Administrador ---- */
const app = leer("../sitio/app.js");
igual(/const admin = idn\.entrada && esAdministrador\(etiquetas\);/.test(app) && /if \(admin\) \{ adminReal = true; miVista = \{/.test(app), true, "app.js: adminReal se enciende sólo detrás de esAdministrador de la identidad real");
igual((app.match(/adminReal = true/g) || []).length, 1, "app.js: adminReal se enciende en un solo lugar");
igual((app.match(/controlVerComo\(\)/g) || []).length === 2 && /adminReal && fuente && fuente\.tipo === "graph" \? h\("div", \{\}, controlVerComo\(\), p\) : p/.test(app), true, "app.js: el control sólo se pinta si adminReal (una definición, un uso)");
const iVer = app.indexOf("async function verComo("), cuerpo = app.slice(iVer, app.indexOf("async function volverAMiVista("));
igual(iVer > 0 && cuerpo.indexOf('campo.value = "";') > 0 && cuerpo.indexOf('campo.value = "";') < cuerpo.indexOf("await "), true, "app.js: el campo del correo se borra antes de leer nada");
igual(/aviso\.textContent = texto === null \? AVISO_SIN_CATALOGO : AVISO_SIN_ENTRADA;/.test(cuerpo) && !/correo\s*\+|\+\s*correo/.test(cuerpo), true, "app.js: el aviso es un texto fijo, sin el correo");
igual(/if \(!adminReal \|\| !miVista/.test(cuerpo) && /extras = \{ admin: false, carpetas: idn\.carpetas \}/.test(cuerpo), true, "app.js: la vista simulada no es de Administrador y lee sólo las carpetas de la persona");
const seccion = app.slice(app.indexOf('/* ---------- "Ver como"'),app.indexOf("function olvidarVerComo"));
igual(seccion.length > 500 && !/localStorage|sessionStorage|\bhistory\.|\blocation\.|innerHTML|insertAdjacentHTML|console\./.test(seccion), true, "app.js: Ver como no usa almacenamiento, dirección, historial, consola ni HTML crudo");
igual([(app.match(/localStorage|sessionStorage/g) || []).length, (app.match(/innerHTML|insertAdjacentHTML/g) || []).length, (app.match(/\bhistory\./g) || []).length], [0, 0, 3], "app.js: sin almacenamiento ni HTML crudo; el historial, igual que antes (3 usos)");
igual((app.match(/olvidarVerComo\(\);/g) || []).length, 3, "app.js: se olvida la vista simulada al entrar, al cerrar sesión y al olvidar el equipo");

/* ---- estático: ver.html y ver.js no cambian de identidad; la CSP no cambia ---- */
igual(/vercomo|vistaComo|identidadComo/.test(leer("../sitio/ver.js") + leer("../sitio/ver.html")), false, "ver.html y ver.js no saben de Ver como: los enlaces abren con la identidad real");
const csp = html => { const m = /<meta http-equiv="Content-Security-Policy" content="([^"]*)"/.exec(html); return m ? m[1] : ""; };
igual(csp(leer("../sitio/index.html")), "default-src 'self'; img-src 'self' data:; connect-src 'self' https://login.microsoftonline.com https://graph.microsoft.com https://*.sharepoint.com; style-src 'self'; script-src 'self'; base-uri 'none'; form-action 'none'", "index.html: la CSP no cambia");

/* ---- estático: estilos con los tokens del sitio ---- */
const css = leer("../sitio/estilo.css");
const reglasVc = css.split("}").filter(r => /vercomo|con-franja/.test(r));
igual(reglasVc.length >= 6 && reglasVc.every(r => !/#[0-9a-fA-F]{3,8}\b|rgba?\(/.test(r)), true, "estilo.css: el control y la franja usan sólo los tokens del tema (claro y oscuro)");
igual(/\.franja-vercomo \{[^}]*position: fixed/.test(css) && /@media \(max-width: 440px\) \{[^\n]*\.franja-vercomo/.test(css), true, "estilo.css: franja fija, ajustada en pantallas angostas");

console.log(mal ? "FALLARON " + mal + " de " + (ok + mal) : "vercomo: " + ok + " de " + ok + " pruebas bien");
process.exit(mal ? 1 : 0);
