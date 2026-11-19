// Pruebas de los tableros embebidos comprimidos (gzip), sin navegador ni red: node pruebas/compresion.prueba.js
// HTML y sellos inventados; la compresión es la de node:zlib y la descompresión, DecompressionStream (la del navegador).
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { gzipSync } from "node:zlib";
import { planDeCompresion, descomprimir, TOPE_DESCOMPRIMIDO, COMPRESIONES, MENSAJES } from "../sitio/compresion.js";

let ok = 0, mal = 0;
const igual = (a, b, nombre) => {
  const A = JSON.stringify(a), B = JSON.stringify(b);
  if (A === B) ok++; else { mal++; console.log("FALLA:", nombre, "\n  obtenido:", A, "\n  esperado:", B); }
};
const rechaza = async (f, mensaje, nombre) => {
  try { await f(); mal++; console.log("FALLA:", nombre, "(no lanzó)"); }
  catch (e) { igual(mensaje === null ? true : e.message, mensaje === null ? true : mensaje, nombre); }
};
const leer = r => readFileSync(new URL(r, import.meta.url), "utf8");
const hex = buf => createHash("sha256").update(Buffer.from(buf)).digest("hex");
const sha256 = async b => hex(b);
const ab = u8 => u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength);

const HTML = "<!doctype html><title>tablero inventado</title><script>const D = " + JSON.stringify({ filas: Array.from({ length: 2000 }, (_, i) => [i, "CLI-INV-" + (i % 30), i * 3]) }) + ";</script>";
const CRUDO = new TextEncoder().encode(HTML);
const GZ = ab(gzipSync(Buffer.from(CRUDO), { level: 9 }));
const renglon = (extra = {}) => ({ id: "t1", tipo: "embebido", archivo: "t1.html.gz", compresion: "gzip", sha256: hex(GZ), bytes: GZ.byteLength, bytes_descomprimidos: CRUDO.length, ...extra });

/* ---- constantes ---- */
igual([TOPE_DESCOMPRIMIDO, COMPRESIONES], [64 * 1048576, ["gzip"]], "tope de 64 MB y sólo gzip");
igual(GZ.byteLength < CRUDO.length / 3, true, "el HTML de prueba sí se comprime");

/* ---- plan del renglón ---- */
igual(planDeCompresion({ archivo: "x.html" }), { ok: true, comprimido: false }, "sin compresion: como siempre");
igual(planDeCompresion({ archivo: "x.html", compresion: null }), { ok: true, comprimido: false }, "compresion null: sin compresión");
igual(planDeCompresion(null), { ok: true, comprimido: false }, "renglón nulo: sin compresión (otro módulo lo descarta)");
igual(planDeCompresion(renglon()), { ok: true, comprimido: true, bytes: CRUDO.length, sello: null }, "gzip válido sin sello del HTML");
igual(planDeCompresion(renglon({ sha256_descomprimido: hex(CRUDO).toUpperCase() })), { ok: true, comprimido: true, bytes: CRUDO.length, sello: hex(CRUDO) }, "sello del HTML en mayúsculas se normaliza");
igual(planDeCompresion(renglon({ compresion: "zip" })).motivo, "compresion", "zip no se acepta");
igual(planDeCompresion(renglon({ compresion: "GZIP" })).motivo, "compresion", "mayúsculas no se aceptan");
igual(planDeCompresion(renglon({ compresion: 1 })).motivo, "compresion", "compresion numérica no se acepta");
igual(planDeCompresion(renglon({ compresion: "" })).motivo, "compresion", "compresion vacía no se acepta");
igual(planDeCompresion({ ...renglon(), sha256: undefined }).motivo, "sello", "sin sello del archivo comprimido no se acepta");
igual(planDeCompresion(renglon({ sha256: "abc" })).motivo, "sello", "sello corto no se acepta");
igual(planDeCompresion(renglon({ bytes_descomprimidos: undefined })).motivo, "tamano", "sin tamaño descomprimido no se acepta");
igual(planDeCompresion(renglon({ bytes_descomprimidos: 0 })).motivo, "tamano", "tamaño 0 no se acepta");
igual(planDeCompresion(renglon({ bytes_descomprimidos: -5 })).motivo, "tamano", "tamaño negativo no se acepta");
igual(planDeCompresion(renglon({ bytes_descomprimidos: 1.5 })).motivo, "tamano", "tamaño con fracción no se acepta");
igual(planDeCompresion(renglon({ bytes_descomprimidos: "100" })).motivo, "tamano", "tamaño en texto no se acepta");
igual(planDeCompresion(renglon({ bytes_descomprimidos: TOPE_DESCOMPRIMIDO + 1 })).motivo, "tamano", "un byte sobre el tope no se acepta");
igual(planDeCompresion(renglon({ bytes_descomprimidos: TOPE_DESCOMPRIMIDO })).ok, true, "justo el tope sí");
igual(planDeCompresion(renglon({ sha256_descomprimido: "xyz" })).motivo, "sello_descomprimido", "sello del HTML mal formado no se acepta");
igual(planDeCompresion(renglon({ sha256_descomprimido: 5 })).motivo, "sello_descomprimido", "sello del HTML numérico no se acepta");
igual(Object.keys(MENSAJES).sort(), ["compresion", "sello", "sello_descomprimido", "tamano"], "un mensaje por motivo");

/* ---- descomprimir ---- */
{
  const sinComp = ab(CRUDO);
  const r = await descomprimir(sinComp, { archivo: "x.html" }, { sha256 });
  igual(r === sinComp, true, "sin compresión devuelve el mismo buffer sin tocarlo");
}
{
  const r = await descomprimir(GZ, renglon(), { sha256 });
  igual(new TextDecoder().decode(r), HTML, "gzip válido: el HTML sale idéntico");
  igual(hex(r), hex(CRUDO), "gzip válido: mismo sha256 que el original");
}
{
  const r = await descomprimir(GZ, renglon({ sha256_descomprimido: hex(CRUDO) }), { sha256 });
  igual(hex(r), hex(CRUDO), "con sello del HTML correcto: sale");
  let veces = 0;
  await descomprimir(GZ, renglon({ sha256_descomprimido: hex(CRUDO) }), { sha256: async b => { veces++; return hex(b); } });
  igual(veces, 1, "el sello del HTML se calcula una sola vez, sobre lo descomprimido");
  veces = 0;
  await descomprimir(GZ, renglon(), { sha256: async b => { veces++; return hex(b); } });
  igual(veces, 0, "sin sello del HTML no se calcula nada");
}
await rechaza(() => descomprimir(GZ, renglon({ sha256_descomprimido: "0".repeat(64) }), { sha256 }), "El tablero descomprimido no cuadra con su sello (sha256).", "sello del HTML distinto: rechaza");
await rechaza(() => descomprimir(GZ, renglon({ bytes_descomprimidos: CRUDO.length - 1 }), { sha256 }), "El tablero descomprimido pasa del tamaño declarado.", "declara un byte de menos: rechaza");
await rechaza(() => descomprimir(GZ, renglon({ bytes_descomprimidos: CRUDO.length + 1 }), { sha256 }), "El tablero descomprimido no mide lo declarado.", "declara un byte de más: rechaza");
await rechaza(() => descomprimir(ab(CRUDO), renglon(), { sha256 }), "El archivo del tablero no está comprimido como se declaró.", "HTML sin comprimir declarado como gzip: rechaza");
await rechaza(() => descomprimir(new ArrayBuffer(0), renglon(), { sha256 }), "El archivo del tablero no está comprimido como se declaró.", "archivo vacío: rechaza");
await rechaza(() => descomprimir(GZ.slice(0, 10), renglon(), { sha256 }), "El archivo del tablero no está comprimido como se declaró.", "cabecera cortada: rechaza");
await rechaza(() => descomprimir(GZ.slice(0, Math.floor(GZ.byteLength / 2)), renglon(), { sha256 }), "El archivo comprimido del tablero está dañado.", "gzip cortado a la mitad: rechaza");
{
  const roto = new Uint8Array(GZ.slice(0)); roto[Math.floor(roto.length / 2)] ^= 0xff;
  await rechaza(() => descomprimir(roto.buffer, renglon(), { sha256 }), null, "un byte alterado en el medio: rechaza (daño o tamaño distinto)");
}
await rechaza(() => descomprimir(GZ, renglon({ compresion: "zip" }), { sha256 }), MENSAJES.compresion, "compresión no admitida: rechaza con su mensaje");
await rechaza(() => descomprimir(GZ, renglon(), { sha256, DS: null }), "Este navegador no puede descomprimir el tablero. Actualiza el navegador e inténtalo de nuevo.", "navegador sin DecompressionStream: mensaje claro");
await rechaza(() => descomprimir(GZ, renglon({ sha256_descomprimido: hex(CRUDO) }), {}), "Falta la función del sello.", "sin función de sello inyectada: rechaza");

/* ---- bomba de descompresión: poco comprimido, mucho al abrir ---- */
{
  const grande = Buffer.alloc(200 * 1048576, 0x41);      // 200 MB de la misma letra: pesa unos 200 KB comprimido
  const bomba = ab(gzipSync(grande, { level: 9 }));
  igual(bomba.byteLength < 2 * 1048576, true, "la bomba de prueba pesa poco comprimida");
  const t0 = Date.now(), m0 = process.memoryUsage().rss;
  await rechaza(() => descomprimir(bomba, { archivo: "b.html.gz", compresion: "gzip", sha256: hex(bomba), bytes: bomba.byteLength, bytes_descomprimidos: 1048576 }, { sha256 }), "El tablero descomprimido pasa del tamaño declarado.", "bomba contra un tamaño declarado de 1 MB: corta");
  igual(Date.now() - t0 < 5000, true, "la bomba se corta en menos de 5 s");
  igual(process.memoryUsage().rss - m0 < 150 * 1048576, true, "la bomba no llena la memoria (menos de 150 MB de más)");
  await rechaza(() => descomprimir(bomba, { archivo: "b.html.gz", compresion: "gzip", sha256: hex(bomba), bytes: bomba.byteLength, bytes_descomprimidos: TOPE_DESCOMPRIMIDO }, { sha256 }), "El tablero descomprimido pasa del tamaño declarado.", "bomba contra el tope de 64 MB: corta");
}

/* ---- tamaño real: un HTML de 16 MB sale igual ---- */
{
  const relleno = "const D = " + JSON.stringify(Array.from({ length: 400000 }, (_, i) => ({ i, c: "CLI-INV-" + (i % 997), v: (i * 7919) % 100003 }))) + ";";
  const crudo = new TextEncoder().encode("<html><script>" + relleno + "</script></html>");
  const gz = ab(gzipSync(Buffer.from(crudo), { level: 9 }));
  const t0 = Date.now();
  const r = await descomprimir(gz, { archivo: "g.html.gz", compresion: "gzip", sha256: hex(gz), bytes: gz.byteLength, bytes_descomprimidos: crudo.length, sha256_descomprimido: hex(crudo) }, { sha256 });
  igual(r.byteLength, crudo.length, "HTML grande (" + (crudo.length / 1048576).toFixed(1) + " MB): mismo tamaño");
  console.log("  (descomprimir " + (crudo.length / 1048576).toFixed(1) + " MB con sello: " + (Date.now() - t0) + " ms en node)");
}

/* ---- estáticas: ver.js usa el módulo en la carga inicial y en la relectura ---- */
{
  const ver = leer("../sitio/ver.js");
  igual(/from "\.\/compresion\.js"/.test(ver), true, "ver.js importa compresion.js");
  igual(/planDeCompresion\(t\)/.test(ver), true, "ver.js revisa el plan antes de bajar el archivo");
  igual(/mostrar\(aTexto\(buf\)\)/.test(ver), false, "ver.js ya no pinta el buffer sin pasar por descomprimir");
  igual(/mostrar\(aTexto\(b2\)\)/.test(ver), false, "la relectura tampoco pinta sin descomprimir");
  igual((ver.match(/descomprimir\(/g) || []).length >= 2, true, "descomprimir se usa en la carga y en la relectura");
  igual(/descomprimir\(buf, t, \{ sha256 \}\)/.test(ver) && /descomprimir\(b2, t2, \{ sha256 \}\)/.test(ver), true, "se pasa el renglón y la función del sello");
  const ordenSello = ver.indexOf("cargarConSello") < ver.indexOf("descomprimir(buf");
  igual(ordenSello, true, "el sello del archivo comprimido se revisa antes de descomprimir");
  const modulo = leer("../sitio/compresion.js");
  igual(/\b(eval|innerHTML|document\.write|localStorage|sessionStorage|fetch|XMLHttpRequest|import\()/.test(modulo.replace(/\/\/[^\n]*/g, "")), false, "compresion.js sin eval, DOM, almacenamiento ni red");
  igual(/https?:\/\//.test(modulo), false, "compresion.js sin direcciones externas");
  const ver_html = leer("../sitio/ver.html");
  igual(/blob:|unsafe-eval|unsafe-inline/.test(ver_html), false, "ver.html sigue sin blob:, unsafe-eval ni unsafe-inline");
}

console.log("compresion: " + ok + " de " + (ok + mal) + " pruebas bien");
process.exit(mal ? 1 : 0);
