// Lectura de archivos con el token de la persona: sólo ve lo que su cuenta ya puede ver.
// El perfil sale de Microsoft Graph; los archivos, de la API REST de SharePoint de la organización.
import { CONFIG } from "./config.js";
import { token, ErrorAuth } from "./auth.js";

export class ErrorGraph extends Error {
  constructor(codigo, mensaje, estado) { super(mensaje); this.codigo = codigo; this.estado = estado || null; }
}

const esperar = ms => new Promise(r => setTimeout(r, ms));

// Una petición con el token del recurso `tipo` ("graph" o "sp"). cache:"no-store": ni se lee ni se escribe la caché HTTP.
async function pedir(url, tipo, nombre, init = {}, intento = 0, renovado = false) {
  const t = await token(tipo, renovado);
  let r;
  try { r = await fetch(url, { ...init, cache: "no-store", headers: { Authorization: "Bearer " + t, ...(init.headers || {}) } }); }
  catch (e) { if (e && e.name === "AbortError") throw e; throw new ErrorGraph("red", "No hay conexión con el servicio de archivos."); }
  if (r.status === 401 && !renovado) return pedir(url, tipo, nombre, init, intento, true);
  if ((r.status === 429 || r.status === 503) && intento < 2) {
    await esperar(Math.min(10, Number(r.headers.get("Retry-After")) || 2) * 1000); return pedir(url, tipo, nombre, init, intento + 1, renovado);
  }
  if (r.ok) return r;
  const estado = r.status;
  throw new ErrorGraph(estado === 401 ? "sin-sesion" : estado === 403 ? "sin-permiso" : estado === 404 ? "no-existe" : "graph", nombre + " respondió " + estado + ".", estado);
}
const api = (ruta, init) => pedir(CONFIG.graph + ruta, "graph", "Graph", init);

export async function perfil() {
  const j = await (await api("me?$select=displayName,department")).json();
  return { nombre: j.displayName || "", departamento: j.department || "" };
}
export async function yo() { return (await perfil()).nombre; }

// ---- Ubicación del catálogo (interruptor general) ----
// Se guarda en este navegador sólo el dominio de SharePoint y la ruta de la carpeta del catálogo. No hay búsqueda por
// nombre: si el catálogo ya no está en esa carpeta, el sitio no lo busca en otro lugar. Mover el catálogo corta el acceso.
const UBICACION = "sit.ubicacion", PENDIENTE = "sit.pendiente";

export function leerUbicacion() {
  try { const u = JSON.parse(localStorage.getItem(UBICACION) || "null"); return u && u.host && u.carpeta ? u : null; } catch (_) { return null; }
}
function guardarUbicacion(u) { try { localStorage.setItem(UBICACION, JSON.stringify({ host: u.host, carpeta: u.carpeta })); } catch (_) { /* sin almacenamiento */ } }

// Borra todo lo que SIT guardó en este navegador.
export function olvidarEquipo() {
  try { localStorage.removeItem(UBICACION); } catch (_) { /* sin almacenamiento */ }
  try { Object.keys(sessionStorage).filter(k => k.startsWith("sit.")).forEach(k => sessionStorage.removeItem(k)); } catch (_) { /* sin almacenamiento */ }
}

const deBase64Url = b => {
  try {
    const s = b.replace(/-/g, "+").replace(/_/g, "/"); const bin = atob(s + "=".repeat((4 - s.length % 4) % 4));
    return new TextDecoder().decode(Uint8Array.from(bin, c => c.charCodeAt(0)));
  } catch (_) { return null; }
};

// El valor del fragmento (#c=...) es la dirección de la carpeta del catálogo en SharePoint, tal cual o en base64url
// (con o sin el prefijo "u!"). Devuelve {host, carpeta} (la ruta de la carpeta en el servidor) o null si no tiene esa forma.
// Nunca devuelve ni registra el valor original.
export function aUbicacion(valor) {
  let v;
  try { v = decodeURIComponent(String(valor || "").trim()); } catch (_) { return null; }
  if (!/^https:\/\//i.test(v)) {
    const b = v.replace(/^u!/, "");
    if (!/^[A-Za-z0-9_-]{16,}$/.test(b)) return null;
    v = deBase64Url(b);
  }
  let u;
  try { u = new URL(String(v || "")); } catch (_) { return null; }
  if (u.protocol !== "https:" || !/^[a-z0-9-]+(-my)?\.sharepoint\.com$/i.test(u.hostname)) return null;
  // la carpeta puede venir como parámetro "id" (vista de biblioteca) o en la ruta de la dirección
  let carpeta = u.searchParams.get("id") || safeDecode(u.pathname);
  carpeta = "/" + carpeta.split("/").filter(Boolean).join("/");
  const partes = carpeta.split("/").filter(Boolean);
  if (partes.length && partes[partes.length - 1].toLowerCase() === CONFIG.catalogo.toLowerCase()) partes.pop();
  if (partes.length < 2 || partes[0].startsWith(":") || partes.some(p => p === ".." || p === ".")) return null;
  return { host: u.hostname.toLowerCase(), carpeta: "/" + partes.join("/") };
}
function safeDecode(t) { try { return decodeURIComponent(t); } catch (_) { return t; } }

// Saca la dirección del fragmento y la borra de la barra en el mismo instante, antes de cualquier otra cosa.
// Devuelve undefined si la dirección no trae fragmento de catálogo, null si lo trae pero no tiene forma de carpeta, o {host, carpeta}.
export function tomarEnlaceDelFragmento() {
  const m = /^#c=(.*)$/.exec(location.hash);
  if (!m) return undefined;
  history.replaceState(null, "", location.pathname + location.search);
  return aUbicacion(m[1]);
}
export function dejarPendiente(u) { try { sessionStorage.setItem(PENDIENTE, JSON.stringify(u)); } catch (_) { /* sin almacenamiento */ } }
function leerPendiente() { try { const u = JSON.parse(sessionStorage.getItem(PENDIENTE) || "null"); return u && u.host && u.carpeta ? u : null; } catch (_) { return null; } }
export function hayPendiente() { return !!leerPendiente(); }
export function tomarPendiente() {
  const u = leerPendiente();
  try { sessionStorage.removeItem(PENDIENTE); } catch (_) { /* sin almacenamiento */ }
  return u;
}
// El dominio de SharePoint del catálogo (el del enlace pendiente o el de la carpeta guardada), para pedir su permiso al entrar.
export function hostConocido() { const p = leerPendiente(), u = leerUbicacion(); return p ? p.host : u ? u.host : null; }

// Comprueba con la cuenta de la persona que el catálogo está en esa carpeta y guarda sólo dominio y ruta.
export async function configurarDesdeEnlace(ubicacion) {
  const f = new FuenteSP(ubicacion.host, ubicacion.carpeta);
  try { await f.metadatos(CONFIG.catalogo); }
  catch (e) {
    if (e instanceof ErrorAuth || (e instanceof ErrorGraph && ["red", "sin-sesion"].includes(e.codigo))) throw e;
    // la dirección no se repite en ningún mensaje; sólo se muestra el código de estado de SharePoint
    throw new ErrorGraph("enlace", "No se pudo abrir la carpeta del catálogo" + (e instanceof ErrorGraph && e.estado ? " (SharePoint " + e.estado + ")" : "") + ". Pide un enlace nuevo.", e instanceof ErrorGraph ? e.estado : null);
  }
  guardarUbicacion(ubicacion);
}

// Una carpeta de archivos de la organización en SharePoint. `leer` baja el archivo de una ruta relativa a ella.
export class FuenteSP {
  constructor(host, carpeta, nombre = "Archivos de la organización") { this.host = host; this.carpeta = carpeta; this.tipo = "graph"; this.nombre = nombre; }
  // la API REST vive en el sitio que contiene la carpeta: /sites/<x>, /teams/<x>, /personal/<x> o la raíz
  base() { const m = /^\/(?:sites|teams|personal)\/[^/]+/i.exec(this.carpeta); return "https://" + this.host + (m ? m[0] : ""); }
  archivo(rel) {
    const p = this.carpeta + "/" + String(rel).split("/").filter(Boolean).join("/");
    return this.base() + "/_api/web/GetFileByServerRelativePath(decodedurl='" + p.split("/").map(s => encodeURIComponent(s.replace(/'/g, "''"))).join("/") + "')";
  }
  pedir(url, init) { return pedir(url, "sp", "SharePoint", init); }
  async metadatos(rel) {
    const j = await (await this.pedir(this.archivo(rel) + "?$select=Name,Length,TimeLastModified", { headers: { Accept: "application/json;odata=nometadata" } })).json();
    return { id: j.Name, nombre: j.Name, bytes: Number(j.Length) || 0, modificado: j.TimeLastModified };
  }
  // progreso(bytesLeidos, total) se llama mientras baja; espera(segundos) se llama cada segundo hasta que llega la respuesta.
  async leer(rel, progreso, espera) {
    const t0 = Date.now();
    let reloj = null;
    if (espera) { espera(0); reloj = setInterval(() => espera(Math.floor((Date.now() - t0) / 1000)), 1000); }
    let r;
    try { r = await this.pedir(this.archivo(rel) + "/$value"); } finally { clearInterval(reloj); }
    const total = Number(r.headers.get("Content-Length")) || 0;
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
  return new FuenteSP(u.host, u.carpeta);
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
