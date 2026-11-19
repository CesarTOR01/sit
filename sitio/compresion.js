// Tableros embebidos guardados comprimidos (gzip): el renglón del catálogo lleva, además de su sello (sha256 y bytes de lo
// ALMACENADO, o sea del archivo comprimido), el tamaño del HTML ya descomprimido y, si quiere, su propio sello:
//   { archivo: "tablero.html.gz", compresion: "gzip", sha256, bytes, bytes_descomprimidos, sha256_descomprimido? }
// Sin `compresion` el archivo es el HTML tal cual, como siempre. El sitio nunca descomprime más de lo que el renglón declara:
// corta en cuanto se pasa y exige que el resultado mida exactamente eso. Sin DOM ni red: la descompresión es de la plataforma.

export const TOPE_DESCOMPRIMIDO = 64 * 1048576; // lo máximo que se acepta declarar y descomprimir (64 MB)
export const COMPRESIONES = ["gzip"];
const SELLO = /^[0-9a-f]{64}$/i;

// Qué dice el renglón sobre su compresión. Devuelve:
//   { ok: true, comprimido: false }                                   — sin compresión (como hoy)
//   { ok: true, comprimido: true, bytes, sello }                      — gzip válido (`sello`: sha256 del HTML, o null)
//   { ok: false, motivo }                                             — el renglón declara algo que el sitio no acepta
export function planDeCompresion(t) {
  const c = t && typeof t === "object" ? t.compresion : undefined;
  if (c === undefined || c === null) return { ok: true, comprimido: false };
  if (typeof c !== "string" || COMPRESIONES.indexOf(c) < 0) return { ok: false, motivo: "compresion" };
  if (typeof t.sha256 !== "string" || !SELLO.test(t.sha256)) return { ok: false, motivo: "sello" };
  const n = t.bytes_descomprimidos;
  if (!Number.isInteger(n) || n < 1 || n > TOPE_DESCOMPRIMIDO) return { ok: false, motivo: "tamano" };
  const s = t.sha256_descomprimido;
  if (s !== undefined && s !== null && (typeof s !== "string" || !SELLO.test(s))) return { ok: false, motivo: "sello_descomprimido" };
  return { ok: true, comprimido: true, bytes: n, sello: s == null ? null : s.toLowerCase() };
}

export const MENSAJES = {
  compresion: "Este tablero usa una compresión que el sitio no reconoce.",
  sello: "El renglón del tablero comprimido no trae su sello.",
  tamano: "El renglón del tablero comprimido no declara un tamaño válido.",
  sello_descomprimido: "El renglón del tablero comprimido trae un sello que no es válido.",
};

const aBytes = buf => (buf instanceof Uint8Array ? buf : new Uint8Array(buf));

// Devuelve el HTML (ArrayBuffer). Si el plan no es de gzip, devuelve `buf` sin tocarlo. Lanza Error en español, sin datos del
// archivo, si no es gzip, si se pasa o se queda corto del tamaño declarado, si el flujo está dañado o si el sello del HTML no cuadra.
// sha256(buf): hex (se inyecta; el mismo que usa el sitio) · DS: DecompressionStream (de la plataforma, inyectable para probar).
export async function descomprimir(buf, t, { sha256, DS = globalThis.DecompressionStream } = {}) {
  const plan = planDeCompresion(t);
  if (!plan.ok) throw new Error(MENSAJES[plan.motivo] || MENSAJES.compresion);
  if (!plan.comprimido) return buf;
  if (typeof DS !== "function") throw new Error("Este navegador no puede descomprimir el tablero. Actualiza el navegador e inténtalo de nuevo.");
  const entrada = aBytes(buf);
  if (entrada.length < 18 || entrada[0] !== 0x1f || entrada[1] !== 0x8b) throw new Error("El archivo del tablero no está comprimido como se declaró.");
  const flujo = new ReadableStream({ start(c) { c.enqueue(entrada); c.close(); } }).pipeThrough(new DS("gzip"));
  const lector = flujo.getReader();
  const salida = new Uint8Array(plan.bytes);
  let n = 0;
  try {
    for (;;) {
      const { done, value } = await lector.read();
      if (done) break;
      if (n + value.length > plan.bytes) { await lector.cancel().catch(() => {}); throw new Error("El tablero descomprimido pasa del tamaño declarado."); }
      salida.set(value, n); n += value.length;
    }
  } catch (e) {
    if (e && e.message === "El tablero descomprimido pasa del tamaño declarado.") throw e;
    throw new Error("El archivo comprimido del tablero está dañado.");
  }
  if (n !== plan.bytes) throw new Error("El tablero descomprimido no mide lo declarado.");
  if (plan.sello !== null) {
    if (typeof sha256 !== "function") throw new Error("Falta la función del sello.");
    if (String(await sha256(salida.buffer)).toLowerCase() !== plan.sello) throw new Error("El tablero descomprimido no cuadra con su sello (sha256).");
  }
  return salida.buffer;
}
