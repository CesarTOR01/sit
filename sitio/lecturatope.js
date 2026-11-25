// Lectura de una respuesta con tope de tamaño, sin pedir antes los metadatos del archivo.
// Si la respuesta declara su largo (Content-Length) y pasa del tope, no se lee nada; si no lo declara, se cuentan los bytes que
// llegan y se corta la lectura en cuanto se pasa. Un archivo que mide exactamente el tope se acepta.
// Sin DOM, red ni almacenamiento: recibe la respuesta ya hecha (headers.get, body.getReader o arrayBuffer).

export const DEMASIADO_GRANDE = "demasiado-grande";

export class ErrorTope extends Error {
  constructor() { super("El archivo pasa del tamaño máximo permitido."); this.codigo = DEMASIADO_GRANDE; }
}

const cancelar = async r => {
  try { if (r && r.body && typeof r.body.cancel === "function") await r.body.cancel(); } catch (_) { /* ya estaba cerrada */ }
};

// Devuelve un ArrayBuffer con el cuerpo, o lanza ErrorTope si mide más de `max` bytes.
export async function leerConTope(respuesta, max) {
  const cabeceras = respuesta && respuesta.headers && typeof respuesta.headers.get === "function" ? respuesta.headers : null;
  const declarado = cabeceras ? Number(cabeceras.get("Content-Length")) || 0 : 0;
  if (declarado > max) { await cancelar(respuesta); throw new ErrorTope(); }
  if (!respuesta.body || typeof respuesta.body.getReader !== "function") {
    const buf = await respuesta.arrayBuffer();
    if (buf.byteLength > max) throw new ErrorTope();
    return buf;
  }
  const lector = respuesta.body.getReader(), partes = [];
  let n = 0;
  for (;;) {
    const { done, value } = await lector.read();
    if (done) break;
    n += value.length;
    if (n > max) { await lector.cancel().catch(() => {}); throw new ErrorTope(); }
    partes.push(value);
  }
  const salida = new Uint8Array(n);
  let o = 0;
  for (const p of partes) { salida.set(p, o); o += p.length; }
  return salida.buffer;
}
