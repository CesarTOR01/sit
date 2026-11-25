// Pruebas de la relectura (comparación por catálogo, intervalos y espera tras fallos), sin navegador ni red: node pruebas/relectura.prueba.js
// Renglones de catálogo inventados; los sellos son cadenas de prueba.
import { readFileSync } from "node:fs";
import { cambio, cambioPorCatalogo, refrescoMin, intervaloMs, esperaTrasFallos, vigilar } from "../sitio/relectura.js";

let ok = 0, mal = 0;
const igual = (a, b, nombre) => {
  const A = JSON.stringify(a), B = JSON.stringify(b);
  if (A === B) ok++; else { mal++; console.log("FALLA:", nombre, "\n  obtenido:", A, "\n  esperado:", B); }
};
const leer = r => readFileSync(new URL(r, import.meta.url), "utf8");

const S1 = "a".repeat(64), S2 = "b".repeat(64), S3 = "c".repeat(64);
const base = { id: "t1", tipo: "embebido", titulo: "Tablero de prueba", archivo: "t1.html", sha256: S1, bytes: 1000 };

/* ---- cambioPorCatalogo: cada campo ---- */
igual(cambioPorCatalogo(base, { ...base }), false, "renglón idéntico: no cambió");
igual(cambioPorCatalogo(base, { ...base, archivo: "t1.v2.html" }), true, "cambia `archivo`");
igual(cambioPorCatalogo(base, { ...base, archivo: "T1.html" }), true, "`archivo` distingue mayúsculas (es un nombre)");
igual(cambioPorCatalogo(base, { ...base, sha256: S2 }), true, "cambia `sha256`");
igual(cambioPorCatalogo(base, { ...base, bytes: 1001 }), true, "cambia `bytes`");
igual(cambioPorCatalogo(base, { ...base, sha256_descomprimido: S3 }), true, "aparece `sha256_descomprimido`");
igual(cambioPorCatalogo({ ...base, sha256_descomprimido: S2 }, { ...base, sha256_descomprimido: S3 }), true, "cambia `sha256_descomprimido`");
igual(cambioPorCatalogo({ ...base, sha256_descomprimido: S2 }, { ...base, sha256_descomprimido: S2 }), false, "`sha256_descomprimido` igual: no cambió");

/* ---- mayúsculas y minúsculas del sello ---- */
igual(cambioPorCatalogo(base, { ...base, sha256: S1.toUpperCase() }), false, "`sha256` en mayúsculas es el mismo sello");
igual(cambioPorCatalogo({ ...base, sha256: S1.toUpperCase() }, base), false, "`sha256` en mayúsculas al revés");
igual(cambioPorCatalogo({ ...base, sha256_descomprimido: S2.toUpperCase() }, { ...base, sha256_descomprimido: S2 }), false, "`sha256_descomprimido` en mayúsculas es el mismo sello");

/* ---- campos ausentes ---- */
{
  const { bytes: _b, ...sinBytes } = base;
  igual(cambioPorCatalogo(sinBytes, { ...sinBytes }), false, "sin `bytes` en los dos: no cuenta");
  igual(cambioPorCatalogo(sinBytes, base), true, "`bytes` aparece: cambió");
  igual(cambioPorCatalogo(base, sinBytes), true, "`bytes` desaparece: cambió");
  const { sha256: _s, ...sinSello } = base;
  igual(cambioPorCatalogo(sinSello, { ...sinSello }), false, "sin `sha256` en los dos: no cuenta");
  igual(cambioPorCatalogo(sinSello, base), true, "`sha256` aparece: cambió");
  igual(cambioPorCatalogo({ ...base, sha256: null }, sinSello), false, "`sha256` nulo y ausente son lo mismo");
}
igual(cambioPorCatalogo({ ...base, bytes: "1000" }, base), false, "`bytes` como texto numérico es el mismo tamaño");

/* ---- campos que no cuentan ---- */
igual(cambioPorCatalogo(base, { ...base, titulo: "Otro título" }), false, "el título no cuenta");
igual(cambioPorCatalogo(base, { ...base, refresco_min: 5 }), false, "`refresco_min` no cuenta");
igual(cambioPorCatalogo(base, { ...base, enlaces: [{ titulo: "x", url: "https://ejemplo.sharepoint.com/x" }] }), false, "los enlaces no cuentan");

/* ---- renglón ausente: se supone que cambió ---- */
igual(cambioPorCatalogo(null, base), true, "sin renglón anterior");
igual(cambioPorCatalogo(base, null), true, "sin renglón nuevo");
igual(cambioPorCatalogo(undefined, undefined), true, "sin ninguno");
igual(cambioPorCatalogo("t1", base), true, "un renglón que no es objeto");

/* ---- renglones sin ninguno de los cuatro campos: se compara `actualizado` ---- */
{
  const vacio = { id: "t1", tipo: "embebido", titulo: "Tablero de prueba" };
  igual(cambioPorCatalogo(vacio, { ...vacio }), true, "sin ninguno de los cuatro campos ni `actualizado`: se supone que cambió");
  igual(cambioPorCatalogo({ ...vacio, actualizado: "2026-11-01T10:00:00Z" }, { ...vacio, actualizado: "2026-11-01T10:00:00Z" }), false, "sin los cuatro campos, mismo `actualizado`: no cambió");
  igual(cambioPorCatalogo({ ...vacio, actualizado: "2026-11-01T10:00:00Z" }, { ...vacio, actualizado: "2026-11-02T10:00:00Z" }), true, "sin los cuatro campos, otro `actualizado`: cambió");
  igual(cambioPorCatalogo(vacio, { ...vacio, actualizado: "2026-11-01T10:00:00Z" }), true, "sin los cuatro campos, `actualizado` aparece: cambió");
  igual(cambioPorCatalogo({ ...vacio, actualizado: "2026-11-01T10:00:00Z" }, vacio), true, "sin los cuatro campos, `actualizado` desaparece: cambió");
  igual(cambioPorCatalogo({ ...vacio, actualizado: null }, { ...vacio, actualizado: null }), true, "`actualizado` nulo en los dos: se supone que cambió");
  igual(cambioPorCatalogo({ ...vacio, archivo: null, sha256: null }, { ...vacio, bytes: undefined }), true, "campos nulos o indefinidos cuentan como ausentes");
  igual(cambioPorCatalogo({ ...base, actualizado: "2026-11-01" }, { ...base, actualizado: "2026-11-02" }), false, "con alguno de los cuatro campos, `actualizado` no cuenta");
  igual(cambioPorCatalogo(vacio, base), true, "uno sin los campos y otro con ellos: cambió");
}

/* ---- cambio (metadatos del archivo), sigue igual ---- */
igual(cambio({ modificado: "2026-01-01", bytes: 5 }, { modificado: "2026-01-01", bytes: 5 }), false, "cambio: iguales");
igual(cambio({ modificado: "2026-01-01", bytes: 5 }, { modificado: "2026-01-02", bytes: 5 }), true, "cambio: otra fecha");
igual(cambio({ modificado: "2026-01-01", bytes: 5 }, { modificado: "2026-01-01", bytes: 6 }), true, "cambio: otro tamaño");
igual(cambio(null, { modificado: "x", bytes: 1 }), true, "cambio: sin lectura anterior");

/* ---- refrescoMin ---- */
igual(refrescoMin({ refresco_min: 5 }, 10), 5, "refrescoMin: el del renglón");
igual(refrescoMin({ refresco_min: 5000 }, 10), 1440, "refrescoMin: tope de un día");
igual(refrescoMin({ refresco_min: 0 }, 10), 10, "refrescoMin: cero usa el valor por omisión");
igual(refrescoMin({}, 10), 10, "refrescoMin: sin campo usa el valor por omisión");
igual(refrescoMin(null, 10), 10, "refrescoMin: sin renglón usa el valor por omisión");

/* ---- intervaloMs ---- */
igual(intervaloMs(10), 600000, "intervaloMs: 10 minutos");
igual(intervaloMs(0), 600000, "intervaloMs: cero cae a 10 minutos");
igual(intervaloMs("x"), 600000, "intervaloMs: texto cae a 10 minutos");
igual(Math.round(intervaloMs(0.01)), 6000, "intervaloMs: nunca menos de 6 s");

/* ---- esperaTrasFallos ---- */
const NORMAL = 600000;
igual(esperaTrasFallos(0, NORMAL), NORMAL, "esperaTrasFallos: sin fallos, el intervalo normal");
igual([1, 2, 3, 4].map(n => esperaTrasFallos(n, NORMAL)), [30000, 60000, 120000, 240000], "esperaTrasFallos: 30 s, 60 s, 120 s, 240 s");
igual(esperaTrasFallos(10, NORMAL), NORMAL, "esperaTrasFallos: nunca pasa del intervalo normal");
igual(esperaTrasFallos(3, 45000), 45000, "esperaTrasFallos: con un intervalo corto, el corto");

/* ---- vigilar: sin pestaña real, con un documento simulado ---- */
{
  const escuchas = new Set();
  globalThis.document = { hidden: false, addEventListener: (_n, f) => escuchas.add(f), removeEventListener: (_n, f) => escuchas.delete(f) };
  const v = vigilar(async () => true, () => 10);
  igual([typeof v.detener, typeof v.marcar, escuchas.size], ["function", "function", 1], "vigilar: devuelve detener y marcar, y escucha el cambio de visibilidad");
  v.marcar();
  v.detener();
  igual(escuchas.size, 0, "vigilar: detener deja de escuchar");
  delete globalThis.document;
}

/* ---- estáticas ---- */
{
  const rel = leer("../sitio/relectura.js"), carga = leer("../sitio/carga_tablero.js"), ver = leer("../sitio/ver.js");
  igual(/export const cambioPorCatalogo = /.test(rel), true, "relectura.js exporta cambioPorCatalogo");
  igual(["cambio", "refrescoMin", "intervaloMs", "esperaTrasFallos", "vigilar"].every(n => new RegExp("export (const|function) " + n + "\\b").test(rel)), true, "relectura.js conserva cambio, refrescoMin, intervaloMs, esperaTrasFallos y vigilar");
  igual(/localStorage|sessionStorage|fetch\(|XMLHttpRequest/.test(rel), false, "relectura.js no guarda ni envía nada");
  igual(/import \{ cambioPorCatalogo \} from "\.\/relectura\.js"/.test(carga), true, "carga_tablero.js usa cambioPorCatalogo en la relectura");
  igual(/\bcambio\(/.test(ver), false, "ver.js ya no compara metadatos del archivo");
  igual(/metadatos/.test(ver + carga), false, "ni ver.js ni carga_tablero.js piden metadatos");
}

console.log("relectura: " + ok + " de " + (ok + mal) + " pruebas bien");
process.exit(mal ? 1 : 0);
