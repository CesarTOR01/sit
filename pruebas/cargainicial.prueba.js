// Pruebas de la carga inicial con sello y reintentos, sin navegador ni red: node pruebas/cargainicial.prueba.js
// Catálogo, archivo y reloj simulados; los sellos son de textos inventados.
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { cargarConSello, INTENTOS, CADA_MS } from "../sitio/cargainicial.js";

let ok = 0, mal = 0;
const igual = (a, b, nombre) => {
  const A = JSON.stringify(a), B = JSON.stringify(b);
  if (A === B) ok++; else { mal++; console.log("FALLA:", nombre, "\n  obtenido:", A, "\n  esperado:", B); }
};
const leer = (r) => readFileSync(new URL(r, import.meta.url), "utf8");

const enc = s => new TextEncoder().encode(s).buffer;
const hex = buf => createHash("sha256").update(Buffer.from(buf)).digest("hex");
const ANTERIOR = enc("<html>tablero de prueba, version 1</html>");
const VIEJO = enc("<html>tablero de prueba, version 2</html>");
const NUEVO = enc("<html>tablero de prueba, version 3</html>");
const VACIO = enc("");
const S_ANTERIOR = hex(ANTERIOR), S_VIEJO = hex(VIEJO), S_NUEVO = hex(NUEVO);
const renglon = (sello, archivo = "t1.html") => ({ id: "t1", tipo: "embebido", archivo, ...(sello === undefined ? {} : { sha256: sello }) });

// renglonEn(k): renglón del tablero en la k-ésima lectura del catálogo (null: ya no está); archivoEn(k): contenido en la k-ésima lectura
async function correr({ renglonEn, archivoEn, ...extra }) {
  const r = { cat: 0, arch: 0, sha: 0, esperas: [], avisos: [], rutas: [] };
  const res = await cargarConSello({
    leerCatalogo: async () => { r.cat++; const x = renglonEn(r.cat); return { contrato: "visor/1", tableros: x ? [x] : [] }; },
    buscarTablero: c => c.tableros.find(x => x.id === "t1") || null,
    leerArchivo: async ruta => { r.arch++; r.rutas.push(ruta); return archivoEn(r.arch); },
    sha256: async b => { r.sha++; return hex(b); },
    esperar: async ms => { r.esperas.push(ms); },
    avisar: a => { r.avisos.push(a); },
    ...extra,
  });
  return { res, r };
}
const cuenta = r => ({ cat: r.cat, arch: r.arch, esperas: r.esperas.length, avisos: r.avisos.length });

/* ---- valores por omisión ---- */
igual([INTENTOS, CADA_MS, INTENTOS * CADA_MS], [10, 30000, 300000], "por omisión: 10 reintentos cada 30 s (5 minutos)");

/* ---- cuadra al primer intento ---- */
{
  const { res, r } = await correr({ renglonEn: () => renglon(S_NUEVO), archivoEn: () => NUEVO });
  igual(res.estado, "ok", "primer intento: ok");
  igual(cuenta(r), { cat: 1, arch: 1, esperas: 0, avisos: 0 }, "primer intento: 0 esperas y 0 avisos");
  igual(hex(res.buf) === S_NUEVO && res.t.id === "t1", true, "primer intento: devuelve el renglón y el archivo");
  igual(r.rutas, ["t1.html"], "lee el archivo que dice el renglón");
}

/* ---- cuadra al intento 4 ---- */
{
  const { res, r } = await correr({ renglonEn: () => renglon(S_NUEVO), archivoEn: k => k < 4 ? VIEJO : NUEVO });
  igual(res.estado, "ok", "intento 4: ok");
  igual(r.esperas, [30000, 30000, 30000], "intento 4: 3 esperas de 30000");
  igual(r.avisos, [{ intento: 1, de: 10 }, { intento: 2, de: 10 }, { intento: 3, de: 10 }], "intento 4: 3 avisos con intento 1, 2 y 3");
  igual([r.cat, r.arch], [4, 4], "intento 4: relee catálogo y archivo en cada intento");
}

/* ---- el sello cambia a mitad de carga ---- */
{
  // intento 1: el catálogo trae el sello anterior; desde el 2, el nuevo; el archivo viejo sigue hasta el 3
  const { res, r } = await correr({ renglonEn: k => renglon(k < 2 ? S_ANTERIOR : S_NUEVO), archivoEn: k => k <= 3 ? VIEJO : NUEVO });
  igual(res.estado, "ok", "sello que cambia: ok al final");
  igual([r.esperas.length, res.t.sha256, hex(res.buf)], [3, S_NUEVO, S_NUEVO], "sello que cambia: usa el renglón y el archivo releídos (intento 4)");
}
{
  // el archivo nuevo llega antes que el catálogo: los dos primeros intentos traen el sello viejo
  const { res, r } = await correr({ renglonEn: k => renglon(k <= 2 ? S_VIEJO : S_NUEVO), archivoEn: () => NUEVO });
  igual([res.estado, r.esperas.length, res.t.sha256], ["ok", 2, S_NUEVO], "archivo antes que catálogo: ok al intento 3");
}
{
  // el renglón cambia de archivo en un reintento: se lee el que dice el renglón vigente
  const { res, r } = await correr({ renglonEn: k => k === 1 ? renglon(S_NUEVO, "t1.html") : renglon(S_NUEVO, "t1-b.html"), archivoEn: k => k === 1 ? VIEJO : NUEVO });
  igual([res.estado, r.rutas], ["ok", ["t1.html", "t1-b.html"]], "el reintento lee el archivo del renglón releído");
}

/* ---- nunca cuadra ---- */
{
  const { res, r } = await correr({ renglonEn: () => renglon(S_NUEVO), archivoEn: () => VIEJO });
  igual(res.estado, "sin_sello", "nunca cuadra: sin_sello");
  igual(r.arch, 11, "nunca cuadra: 11 lecturas del archivo");
  igual(r.esperas, Array(10).fill(30000), "nunca cuadra: 10 esperas de 30000");
  igual([r.avisos.length, r.avisos[9]], [10, { intento: 10, de: 10 }], "nunca cuadra: el último aviso es el intento 10 de 10");
  igual(["buf" in res, res.t && res.t.id], [false, "t1"], "nunca cuadra: no devuelve el archivo, sí el renglón");
}

/* ---- el tablero desaparece del catálogo ---- */
{
  const { res, r } = await correr({ renglonEn: k => k >= 3 ? null : renglon(S_NUEVO), archivoEn: () => VIEJO });
  igual(res, { estado: "no_existe" }, "desaparece en el intento 3: no_existe, sin renglón ni archivo");
  igual(cuenta(r), { cat: 3, arch: 2, esperas: 2, avisos: 2 }, "desaparece en el intento 3: no lee el archivo de un tablero que ya no está");
}
{
  const { res, r } = await correr({ renglonEn: () => null, archivoEn: () => NUEVO });
  igual([res.estado, r.arch], ["no_existe", 0], "no está desde el principio: no_existe sin leer el archivo");
}

/* ---- sin sello ---- */
{
  const { res, r } = await correr({ renglonEn: () => renglon(undefined), archivoEn: () => VIEJO });
  igual([res.estado, r.sha, r.esperas.length], ["ok", 0, 0], "sin sha256 en el renglón: éxito inmediato, sin comparar");
  igual(hex(res.buf), S_VIEJO, "sin sha256: devuelve el archivo leído");
}
{
  const { res, r } = await correr({ renglonEn: () => renglon(""), archivoEn: () => VIEJO });
  igual([res.estado, r.sha], ["ok", 0], "sha256 vacío: igual que sin sello (como hoy)");
}

/* ---- forma del sello ---- */
{
  const { res } = await correr({ renglonEn: () => renglon(S_NUEVO.toUpperCase()), archivoEn: () => NUEVO });
  igual(res.estado, "ok", "sello del catálogo en mayúsculas: cuadra");
}
{
  const { res } = await correr({ renglonEn: () => renglon(S_NUEVO), archivoEn: () => NUEVO, sha256: async b => hex(b).toUpperCase() });
  igual(res.estado, "ok", "sha256 calculado en mayúsculas: cuadra");
}
{
  const { res, r } = await correr({ renglonEn: () => renglon(" " + S_NUEVO + " "), archivoEn: () => NUEVO, intentos: 2 });
  igual([res.estado, r.arch, "buf" in res], ["sin_sello", 3, false], "sello con espacios: no cuadra (comparación exacta, como hoy)");
}
{
  const { res } = await correr({ renglonEn: () => renglon(hex(VACIO)), archivoEn: () => VACIO });
  igual([res.estado, res.buf.byteLength], ["ok", 0], "archivo vacío con su sello: ok");
}
{
  const { res } = await correr({ renglonEn: () => renglon(S_NUEVO), archivoEn: () => VACIO, intentos: 1 });
  igual([res.estado, "buf" in res], ["sin_sello", false], "archivo vacío que no cuadra: sin_sello");
}

/* ---- errores de lectura: se propagan sin reintentar ---- */
const falla = async (opciones) => { try { await correr(opciones); return null; } catch (e) { return e.message; } };
{
  let n = 0, esperas = 0;
  const m = await falla({ renglonEn: () => renglon(S_NUEVO), archivoEn: () => NUEVO, leerCatalogo: async () => { n++; throw new Error("HTTP 403"); }, esperar: async () => { esperas++; } });
  igual([m, n, esperas], ["HTTP 403", 1, 0], "error al leer el catálogo: se propaga y no se reintenta");
}
{
  let n = 0, esperas = 0;
  const m = await falla({ renglonEn: () => renglon(S_NUEVO), archivoEn: () => NUEVO, leerArchivo: async () => { n++; throw new Error("red"); }, esperar: async () => { esperas++; } });
  igual([m, n, esperas], ["red", 1, 0], "error al leer el archivo: se propaga y no se reintenta");
}
{
  let n = 0, esperas = 0;
  const m = await falla({ renglonEn: () => renglon(S_NUEVO), archivoEn: () => NUEVO,
    leerCatalogo: async () => { n++; if (n === 2) throw new Error("HTTP 404"); return { tableros: [renglon(S_NUEVO)] }; },
    leerArchivo: async () => VIEJO, esperar: async () => { esperas++; } });
  igual([m, n, esperas], ["HTTP 404", 2, 1], "error al releer el catálogo en un reintento: se propaga sin más esperas");
}

/* ---- número de intentos y espera ---- */
{
  const { res, r } = await correr({ renglonEn: () => renglon(S_NUEVO), archivoEn: () => VIEJO, intentos: 0 });
  igual([res.estado, r.arch, r.esperas.length, r.avisos.length], ["sin_sello", 1, 0, 0], "intentos = 0: una sola comprobación");
}
{
  const { res } = await correr({ renglonEn: () => renglon(S_NUEVO), archivoEn: () => NUEVO, intentos: 0 });
  igual(res.estado, "ok", "intentos = 0 y cuadra: ok");
}
{
  const { r } = await correr({ renglonEn: () => renglon(S_NUEVO), archivoEn: k => k < 3 ? VIEJO : NUEVO, intentos: 3, cadaMs: 5 });
  igual([r.esperas, r.avisos.map(a => a.de)], [[5, 5], [3, 3]], "intentos y espera se pueden cambiar");
}
{
  let lanzo = false, res = null;
  try { ({ res } = await correr({ renglonEn: () => renglon(S_NUEVO), archivoEn: k => k < 2 ? VIEJO : NUEVO, avisar: undefined })); } catch (_) { lanzo = true; }
  igual([lanzo, res && res.estado], [false, "ok"], "avisar es opcional");
}

/* ---- nunca devuelve el archivo si no cuadra ---- */
{
  let algunoConBuf = false;
  for (const intentos of [0, 1, 3, 10]) {
    const { res } = await correr({ renglonEn: () => renglon(S_ANTERIOR), archivoEn: k => k % 2 ? VIEJO : NUEVO, intentos });
    if (res.estado !== "ok" && "buf" in res) algunoConBuf = true;
    if (res.estado === "ok") algunoConBuf = true; // ninguno de los dos archivos cuadra con S_ANTERIOR
  }
  igual(algunoConBuf, false, "con ningún número de intentos devuelve buf si no cuadra");
}

/* ---- estático: ver.js usa cargarConSello y sólo muestra lo que cuadra ---- */
const js = leer("../sitio/ver.js"), mod = leer("../sitio/cargainicial.js");
igual(/import \{ cargarConSello \} from "\.\/cargainicial\.js"/.test(js), true, "ver.js importa cargarConSello");
igual(/await cargarConSello\(\{/.test(js), true, "ver.js usa cargarConSello en la carga inicial");
igual(/"Actualizando el tablero… intento " \+ intento \+ " de " \+ de/.test(js), true, "ver.js avisa: Actualizando el tablero… intento k de 10");
igual(js.includes('aviso("El archivo no cuadra con su sello (sha256). Puede estar a medio sincronizar: vuelve a intentarlo en unos minutos.")'), true, "ver.js conserva el aviso de sello");
igual(/r\.estado === "no_existe"\) \{ aviso\("Ese tablero no existe o no se muestra en esta página\."\)/.test(js), true, "ver.js: no_existe dice que el tablero no existe");
igual(/await sha256\(buf\)/.test(js), false, "ver.js ya no compara el sello de la carga inicial por su cuenta");
igual(/addEventListener\("message"/.test(js), false, "ver.js no escucha mensajes del marco");
const usos = [...js.matchAll(/\bmostrar\(/g)].map(m => m.index).filter(i => !js.slice(Math.max(0, i - 9), i).includes("function"));
const iOk = js.indexOf('if (r.estado !== "ok") {'), iB2 = js.indexOf("await sha256(b2)");
igual(usos.length, 2, "ver.js llama a mostrar en dos lugares (carga inicial y relectura)");
igual(iOk > 0 && usos[0] > iOk && iB2 > 0 && usos[1] > iB2, true, "mostrar sólo se llama después de comprobar estado ok o, en la relectura, el sello");
igual(/document\.|window\.|fetch\(|XMLHttpRequest|setTimeout|localStorage|sessionStorage|indexedDB/.test(mod), false, "cargainicial.js sin DOM, red, almacenamiento ni reloj propios");

console.log(mal ? "FALLARON " + mal + " de " + (ok + mal) : "cargainicial: " + ok + " de " + ok + " pruebas bien");
process.exit(mal ? 1 : 0);
