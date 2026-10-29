// Lectura de archivos por Microsoft Graph con el token de la persona: sólo ve lo que su cuenta ya puede ver.
import { CONFIG } from "./config.js";
import { token, ErrorAuth } from "./auth.js";

export class ErrorGraph extends Error {
  constructor(codigo, mensaje, estado) { super(mensaje); this.codigo = codigo; this.estado = estado || null; }
}

const esperar = ms => new Promise(r => setTimeout(r, ms));

async function api(ruta, init = {}, intento = 0, renovado = false) {
  const t = await token();
  let r;
  try { r = await fetch(CONFIG.graph + ruta, { ...init, headers: { Authorization: "Bearer " + t, ...(init.headers || {}) } }); }
  catch (_) { throw new ErrorGraph("red", "No hay conexión con el servicio de archivos."); }
  if (r.status === 401 && !renovado) { await token(true); return api(ruta, init, intento, true); }
  if ((r.status === 429 || r.status === 503) && intento < 2) {
    await esperar(Math.min(10, Number(r.headers.get("Retry-After")) || 2) * 1000); return api(ruta, init, intento + 1, renovado);
  }
  if (r.ok) return r;
  const estado = r.status;
  throw new ErrorGraph(estado === 401 ? "sin-sesion" : estado === 403 ? "sin-permiso" : estado === 404 ? "no-existe" : "graph", "Graph respondió " + estado + ".", estado);
}

export async function yo() {
  const j = await (await api("me?$select=displayName")).json();
  return j.displayName || "";
}

const CACHE = "sit.catalogo.ubicacion";
const cache = () => { try { return JSON.parse(sessionStorage.getItem(CACHE) || "null"); } catch (_) { return null; } };
const ponerCache = v => { try { v ? sessionStorage.setItem(CACHE, JSON.stringify(v)) : sessionStorage.removeItem(CACHE); } catch (_) { /* sin almacenamiento */ } };
export function olvidarUbicacion() { ponerCache(null); }

// Busca el catálogo por nombre de archivo en lo que la persona puede leer. Exige el permiso de lectura de archivos.
export async function localizarCatalogo() {
  const c = cache();
  if (c && c.drive && c.carpeta) return c;
  const nombre = CONFIG.catalogo;
  const r = await api("search/query", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ requests: [{ entityTypes: ["driveItem"], query: { queryString: "filename:" + nombre }, from: 0, size: 25 }] }),
  });
  const j = await r.json();
  const hits = (((j.value || [])[0] || {}).hitsContainers || []).flatMap(h => h.hits || []);
  const candidatos = hits.map(h => h.resource || {}).filter(x => (x.name || "").toLowerCase() === nombre.toLowerCase() && x.parentReference && x.parentReference.driveId && x.parentReference.id);
  if (!candidatos.length) throw new ErrorGraph("sin-catalogo", "No se encontró el catálogo de tableros en lo que tu cuenta puede ver.");
  const u = { drive: candidatos[0].parentReference.driveId, carpeta: candidatos[0].parentReference.id };
  ponerCache(u);
  return u;
}

let fallosDirecto = 0;
const ruta = rel => String(rel).split("/").filter(Boolean).map(encodeURIComponent).join("/");

// Una carpeta de archivos de la organización. `leer` baja el archivo de una ruta relativa a ella.
export class FuenteGraph {
  constructor(drive, carpeta, nombre = "Archivos de la organización") { this.drive = drive; this.carpeta = carpeta; this.tipo = "graph"; this.nombre = nombre; }
  item(rel) { return `drives/${encodeURIComponent(this.drive)}/items/${encodeURIComponent(this.carpeta)}:/${ruta(rel)}`; }
  async metadatos(rel) {
    const j = await (await api(this.item(rel) + "?$select=id,name,size,lastModifiedDateTime")).json();
    return { id: j.id, nombre: j.name, bytes: j.size, modificado: j.lastModifiedDateTime };
  }
  // progreso(bytesLeidos, total) se llama mientras baja
  async leer(rel, progreso) {
    const meta = await (await api(this.item(rel))).json();
    // El camino seguro es /content con el token. El enlace directo sólo lo acelera: si falla (CORS, red o más de 20 s sin
    // respuesta) se baja por /content, y tras dos fallos en la sesión ya no se intenta.
    const directo = meta["@microsoft.graph.downloadUrl"];
    let r = null;
    if (directo && fallosDirecto < 2) {
      const ac = new AbortController(), reloj = setTimeout(() => ac.abort(), 20000);
      try { r = await fetch(directo, { signal: ac.signal }); if (!r.ok) { r = null; fallosDirecto++; } }
      catch (_) { r = null; fallosDirecto++; }
      finally { clearTimeout(reloj); }
    }
    if (!r) r = await api(`drives/${encodeURIComponent(this.drive)}/items/${encodeURIComponent(meta.id)}/content`);
    const total = Number(r.headers.get("Content-Length")) || meta.size || 0;
    if (!progreso || !r.body) return r.arrayBuffer();
    const lector = r.body.getReader(), partes = []; let n = 0;
    for (;;) { const { done, value } = await lector.read(); if (done) break; partes.push(value); n += value.length; progreso(n, total); }
    const salida = new Uint8Array(n); let o = 0;
    for (const p of partes) { salida.set(p, o); o += p.length; }
    return salida.buffer;
  }
}

export async function abrirCatalogo() {
  const u = await localizarCatalogo();
  return new FuenteGraph(u.drive, u.carpeta);
}

// Mensajes para la persona, sin jerga.
export function textoError(e) {
  if (e instanceof ErrorAuth) {
    return ({
      consentimiento: "Tu cuenta todavía no tiene autorizada la lectura de archivos para SIT. Puedes entrar sólo con tu perfil, pero no verás tableros hasta que esté autorizada.",
      cancelado: "No se completó el inicio de sesión.", estado: e.message, red: e.message,
      vencida: "Tu sesión venció. Inicia sesión de nuevo.", "sin-sesion": "Inicia sesión para continuar.",
    })[e.codigo] || "No se pudo iniciar sesión: " + e.message;
  }
  if (e instanceof ErrorGraph) {
    return ({
      red: e.message, "sin-sesion": "Tu sesión venció. Inicia sesión de nuevo.",
      "sin-permiso": "Tu cuenta no tiene permiso para leer este archivo o SIT no tiene autorizada la lectura de archivos.",
      "no-existe": "El archivo no existe o fue movido.", "sin-catalogo": e.message,
    })[e.codigo] || e.message;
  }
  return e && e.message ? e.message : String(e);
}
