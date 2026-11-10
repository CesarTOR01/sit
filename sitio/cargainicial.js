// Carga inicial de un tablero embebido con su sello (sha256 del renglón del catálogo), con reintentos.
// Cuando el exportador publica, el catálogo y el HTML pueden llegar por separado y durante unos minutos el sello no cuadra:
// en lugar de avisar al primer intento, se espera y se vuelven a leer los dos. Nunca devuelve un archivo que no cuadra.
// Sin DOM ni red propios: todo llega inyectado, para probarlo con relojes y fuentes simuladas.

export const INTENTOS = 10;      // reintentos después del intento inicial
export const CADA_MS = 30000;    // espera entre intentos (10 × 30 s = 5 minutos)

const sello = v => String(v).toLowerCase();

// leerCatalogo(): catálogo ya leído y validado · buscarTablero(catalogo): renglón del tablero o null ·
// leerArchivo(ruta): ArrayBuffer · sha256(buf): hex · esperar(ms): promesa · avisar({ intento, de }): opcional.
// Resultado: { estado: "ok", t, buf } | { estado: "sin_sello", t } | { estado: "no_existe" }.
// Los errores de lectura se propagan sin reintentar.
export async function cargarConSello({ leerCatalogo, leerArchivo, buscarTablero, sha256, esperar, avisar, intentos = INTENTOS, cadaMs = CADA_MS }) {
  const de = Math.max(0, Math.floor(Number(intentos)) || 0);
  for (let k = 0; ; k++) {
    const catalogo = await leerCatalogo();
    const t = buscarTablero(catalogo);
    if (!t) return { estado: "no_existe" };
    const buf = await leerArchivo(t.archivo);
    if (!t.sha256) return { estado: "ok", t, buf }; // el renglón no trae sello: no se compara
    if (sello(await sha256(buf)) === sello(t.sha256)) return { estado: "ok", t, buf };
    if (k >= de) return { estado: "sin_sello", t };
    if (typeof avisar === "function") avisar({ intento: k + 1, de });
    await esperar(cadaMs);
  }
}
