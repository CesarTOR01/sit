// Enlaces que el renglón del catálogo ofrece para un tablero embebido (campo opcional `enlaces: [{ titulo, url }]`).
// El visor los valida y los pinta en su encabezado: el tablero no abre ventanas ni manda mensajes. Sin red y sin DOM.

export const MAX_ENLACES = 5;
export const MAX_TITULO = 60;
export const MAX_URL = 2048;

// true si la dirección es https a un host *.sharepoint.com, sin usuario ni contraseña y sin otro puerto que el 443
function urlValida(texto) {
  if (typeof texto !== "string" || texto.length === 0 || texto.length > MAX_URL) return null;
  let u;
  try { u = new URL(texto); } catch (_) { return null; } // sin base: una dirección relativa no se acepta
  if (u.protocol !== "https:") return null;
  if (u.username !== "" || u.password !== "") return null;
  if (u.port !== "" && u.port !== "443") return null;
  const host = u.hostname.toLowerCase();
  if (!host.endsWith(".sharepoint.com") || host.length <= ".sharepoint.com".length) return null;
  return u.href;
}

// De 0 a 5 enlaces { titulo, url } ya normalizados, en su orden; descarta lo que no cumple. Nunca lanza.
export function enlacesValidos(tablero) {
  let lista;
  try { lista = tablero && Array.isArray(tablero.enlaces) ? Array.prototype.slice.call(tablero.enlaces, 0, MAX_ENLACES) : []; }
  catch (_) { return []; }
  const salida = [];
  for (const e of lista) {
    try {
      if (!e || typeof e !== "object" || Array.isArray(e)) continue;
      const t = e.titulo, u = e.url; // se leen una sola vez
      if (typeof t !== "string" || typeof u !== "string") continue;
      const titulo = t.trim();
      if (titulo.length < 1 || titulo.length > MAX_TITULO) continue;
      const url = urlValida(u);
      if (url === null) continue;
      salida.push({ titulo, url });
    } catch (_) { /* elemento que no se deja leer: se descarta */ }
  }
  return salida;
}
