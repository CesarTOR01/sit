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

// ---- Ubicación del catálogo (interruptor general) ----
// Se guarda en este navegador sólo el id del drive y el de la carpeta del catálogo. No hay búsqueda por nombre: si el
// catálogo ya no está en esa carpeta, el sitio no lo busca en otro lugar. Mover el catálogo corta el acceso.
const UBICACION = "sit.ubicacion", PENDIENTE = "sit.pendiente";

export function leerUbicacion() {
  try { const u = JSON.parse(localStorage.getItem(UBICACION) || "null"); return u && u.drive && u.carpeta ? u : null; } catch (_) { return null; }
}
function guardarUbicacion(u) { try { localStorage.setItem(UBICACION, JSON.stringify({ drive: u.drive, carpeta: u.carpeta })); } catch (_) { /* sin almacenamiento */ } }

// Borra todo lo que SIT guardó en este navegador.
export function olvidarEquipo() {
  try { localStorage.removeItem(UBICACION); } catch (_) { /* sin almacenamiento */ }
  try { Object.keys(sessionStorage).filter(k => k.startsWith("sit.")).forEach(k => sessionStorage.removeItem(k)); } catch (_) { /* sin almacenamiento */ }
}

const b64url = bytes => btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

// El valor del fragmento (#c=...) puede ser un id de uso compartido (u!...), el enlace mismo o el enlace en base64url.
// Devuelve el id de uso compartido, o null si no tiene forma de enlace. Nunca devuelve ni registra el valor original.
export function aIdCompartido(valor) {
  let v;
  try { v = decodeURIComponent(String(valor || "").trim()); } catch (_) { return null; }
  if (/^u![A-Za-z0-9_-]{8,}$/.test(v)) return v;
  if (/^https:\/\/[^\s]+$/i.test(v)) return "u!" + b64url(new TextEncoder().encode(v));
  if (/^[A-Za-z0-9_-]{16,}$/.test(v)) return "u!" + v;
  return null;
}

// Saca el enlace del fragmento de la dirección y lo borra de la barra en el mismo instante, antes de cualquier otra cosa.
// Devuelve undefined si la dirección no trae fragmento de catálogo, null si lo trae pero no tiene forma de enlace, o el id.
export function tomarEnlaceDelFragmento() {
  const m = /^#c=(.*)$/.exec(location.hash);
  if (!m) return undefined;
  history.replaceState(null, "", location.pathname + location.search);
  return aIdCompartido(m[1]);
}
export function dejarPendiente(id) { try { sessionStorage.setItem(PENDIENTE, id); } catch (_) { /* sin almacenamiento */ } }
export function hayPendiente() { try { return !!sessionStorage.getItem(PENDIENTE); } catch (_) { return false; } }
export function tomarPendiente() {
  try { const id = sessionStorage.getItem(PENDIENTE); sessionStorage.removeItem(PENDIENTE); return id; } catch (_) { return null; }
}

// Resuelve el enlace con la cuenta de la persona y guarda sólo drive y carpeta. El id se descarta al terminar.
export async function configurarDesdeEnlace(idCompartido) {
  let item;
  try { item = await (await api("shares/" + encodeURIComponent(idCompartido) + "/driveItem?$select=id,name,folder,parentReference")).json(); }
  catch (e) {
    if (e instanceof ErrorAuth || (e instanceof ErrorGraph && ["red", "sin-sesion"].includes(e.codigo))) throw e;
    throw new ErrorGraph("enlace", "No se pudo abrir el enlace. Pide uno nuevo."); // sin detalles: el enlace no se repite en ningún mensaje
  }
  idCompartido = null;
  const esCarpeta = !!item.folder;
  const drive = (item.parentReference || {}).driveId;
  const carpeta = esCarpeta ? item.id : (item.parentReference || {}).id;
  if (!drive || !carpeta || (!esCarpeta && String(item.name || "").toLowerCase() !== CONFIG.catalogo.toLowerCase())) throw new ErrorGraph("enlace", "El enlace no corresponde al catálogo. Pide uno nuevo.");
  guardarUbicacion({ drive, carpeta });
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
  const u = leerUbicacion();
  if (!u) throw new ErrorGraph("sin-ubicacion", "No hay un catálogo configurado en este equipo.");
  return new FuenteGraph(u.drive, u.carpeta);
}

// El catálogo ya no está donde se guardó (movido, borrado o sin permiso): se avisa sin detalles y no se busca en otro lugar.
export const AVISO_CATALOGO = "El catálogo no está disponible; pide un enlace nuevo.";
export const catalogoNoDisponible = e => e instanceof ErrorGraph && ["no-existe", "sin-permiso", "enlace"].includes(e.codigo);

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
      "no-existe": "El archivo no existe o fue movido.", enlace: e.message,
      "sin-ubicacion": "Este equipo todavía no tiene un catálogo. Abre SIT con el enlace que te dieron.",
    })[e.codigo] || e.message;
  }
  return e && e.message ? e.message : String(e);
}
