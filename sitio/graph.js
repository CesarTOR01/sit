// Lectura de archivos con el token de la persona: sólo ve lo que su cuenta ya puede ver.
// El perfil sale de Microsoft Graph; los archivos, de la API REST de SharePoint de la organización.
import { CONFIG } from "./config.js";
import { token, ErrorAuth } from "./auth.js";
import { hashCorreo, rutaAcceso, interpretarAcceso, MAX_BYTES } from "./acceso.js";
import { nombreEmblema, aImagen, MAX_SVG } from "./emblemas.js";
import { gerenciaDe, gerenciaDeEtiquetas, GENERAL } from "./gerencias.js";

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

// `llave` es el hash del correo de la cuenta (para buscarla en el catálogo de acceso): el correo se usa aquí y no sale de esta función.
export async function perfil() {
  const j = await (await api("me?$select=displayName,department,userPrincipalName")).json();
  return { nombre: j.displayName || "", departamento: j.department || "", llave: await hashCorreo(j.userPrincipalName) };
}
export async function yo() { return (await perfil()).nombre; }

// ---- Ubicación del catálogo (interruptor general) ----
// Se guarda en este navegador sólo el dominio de SharePoint y la ruta de la carpeta del catálogo. No hay búsqueda por
// nombre: si el catálogo ya no está en esa carpeta, el sitio no lo busca en otro lugar. Mover el catálogo corta el acceso.
const UBICACION = "sit.ubicacion", PENDIENTE = "sit.pendiente";

export function leerUbicacion() {
  try { const u = JSON.parse(localStorage.getItem(UBICACION) || "null"); return u && u.host && u.carpeta ? u : null; } catch (_) { return null; }
}
// Dos ubicaciones son la misma carpeta si coinciden dominio y ruta (sin distinguir mayúsculas).
export const mismaUbicacion = (a, b) => !!a && !!b && String(a.host).toLowerCase() === String(b.host).toLowerCase() && String(a.carpeta).toLowerCase() === String(b.carpeta).toLowerCase();
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
  // "Copiar vínculo" a veces da /:f:/r/<ruta>: esa forma lleva la ruta de la carpeta; /:f:/g/ y /:f:/s/ llevan un código de uso compartido
  const r = /^\/:[a-z]:\/r\/(.+)$/i.exec(carpeta);
  if (r) carpeta = r[1];
  carpeta = "/" + carpeta.split("/").filter(Boolean).join("/");
  const partes = carpeta.split("/").filter(Boolean);
  if (partes.length && partes[partes.length - 1].toLowerCase() === CONFIG.catalogo.toLowerCase()) partes.pop();
  if (partes.length < (/^(sites|teams|personal)$/i.test(partes[0] || "") ? 3 : 2) || partes[0].startsWith(":") || partes.some(p => p === ".." || p === ".")) return null;
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
    // la ruta del catálogo se queda dentro de la carpeta: sin `..`, sin `.` y sin contrabarras
    const partes = String(rel).split("/").filter(x => x && x !== ".");
    if (!partes.length || partes.some(x => x === ".." || x.includes("\\"))) throw new ErrorGraph("ruta", "El catálogo trae una ruta de archivo que no es válida.");
    const p = this.carpeta + "/" + partes.join("/");
    return this.base() + "/_api/web/GetFileByServerRelativePath(decodedurl='" + p.split("/").map(s => encodeURIComponent(s.replace(/'/g, "''"))).join("/") + "')";
  }
  pedir(url, init) { return pedir(url, "sp", "SharePoint", init); }
  // Los nombres de las carpetas que hay dentro de esta carpeta (sólo nombres). Si no se puede leer, devuelve [].
  async subcarpetas() {
    try {
      const ruta = this.carpeta.split("/").map(s => encodeURIComponent(s.replace(/'/g, "''"))).join("/");
      const url = this.base() + "/_api/web/GetFolderByServerRelativePath(decodedurl='" + ruta + "')/Folders?$select=Name";
      const j = await (await this.pedir(url, { headers: { Accept: "application/json;odata=nometadata" } })).json();
      return (Array.isArray(j.value) ? j.value : []).map(x => x && x.Name).filter(n => typeof n === "string");
    } catch (_) { return []; }
  }
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

// Una carpeta hermana de la del enlace (dentro de la misma biblioteca y el mismo dominio), o null si el nombre no vale o no hay carpeta padre.
export function fuenteHermana(f, nombre) {
  const r = f && f.tipo === "graph" ? rutaAcceso({ host: f.host, carpeta: f.carpeta }, nombre) : null;
  return r && r.host === f.host ? new FuenteSP(r.host, r.carpeta, nombre) : null;
}

// Los nombres de las carpetas hermanas de la del enlace (las que hay junto a ella en su carpeta padre). Nunca lanza: [] si no se pudo leer.
export async function listarHermanas(f) {
  const r = f && f.tipo === "graph" ? rutaAcceso({ host: f.host, carpeta: f.carpeta }, "x") : null;
  if (!r || r.host !== f.host) return [];
  return new FuenteSP(r.host, r.carpeta.slice(0, -2)).subcarpetas();
}

// El acceso de la persona, leído en línea con su propia cuenta (nunca de una copia). No lanza error nunca:
//   "entrada" + etiquetas   la persona está en el catálogo de acceso
//   "sin-entrada"           el catálogo es válido y no la trae
//   "sin-catalogo"          no hay catálogo de acceso para esta carpeta (no existe, o la carpeta del enlace no tiene padre)
//   "roto"                  existe pero no se puede leer o no sirve: se trata como la vista general
// La ruta sale de la carpeta del enlace (su carpeta hermana), no de ningún archivo ni del sitio.
export async function leerAcceso(f, llave) {
  const r = f && f.tipo === "graph" ? rutaAcceso({ host: f.host, carpeta: f.carpeta }, CONFIG.carpetaAcceso) : null;
  if (!r || r.host !== f.host) return { estado: "sin-catalogo" };
  const a = new FuenteSP(r.host, r.carpeta);
  try {
    const meta = await a.metadatos(CONFIG.acceso);
    if (meta.bytes > MAX_BYTES) return { estado: "roto" };
    return interpretarAcceso(new TextDecoder("utf-8").decode(await a.leer(CONFIG.acceso)), llave);
  } catch (e) {
    return e instanceof ErrorGraph && e.codigo === "no-existe" ? { estado: "sin-catalogo" } : { estado: "roto" };
  }
}

// Quién es la persona para decidir qué se le muestra, igual en el menú (index) y en los embebidos (ver): su entrada del catálogo de
// acceso si la tiene; si no, el Departamento de su perfil `p`; si el catálogo existe y no sirve, sólo lo general. Nunca lanza error.
//   { gerencia, etiquetas (null = por Departamento), accesoRoto, entrada (¿hay entrada en el catálogo?), carpetas }
export async function identidad(f, p) {
  const acceso = await leerAcceso(f, p && p.llave);
  if (acceso.estado === "entrada") return { gerencia: gerenciaDeEtiquetas(acceso.etiquetas), etiquetas: acceso.etiquetas, accesoRoto: false, entrada: true, carpetas: acceso.carpetas || [] };
  if (acceso.estado === "roto") return { gerencia: GENERAL, etiquetas: ["General"], accesoRoto: true, entrada: false, carpetas: [] };
  return { gerencia: gerenciaDe(p && p.departamento), etiquetas: null, accesoRoto: false, entrada: false, carpetas: [] };
}

// Los emblemas de la gerencia (positivo y, si existe, negativo), leídos con la cuenta de la persona desde la carpeta hermana `marca`.
// Devuelve { claro, oscuro } con direcciones data: (oscuro puede ser null: se usa el positivo en un recuadro claro) o null si no hay emblema
// o la persona no tiene permiso: nunca lanza error y no guarda nada en el navegador.
export async function leerEmblemas(f, id) {
  const r = f && f.tipo === "graph" ? rutaAcceso({ host: f.host, carpeta: f.carpeta }, CONFIG.carpetaMarca) : null;
  const pos = nombreEmblema(id, false);
  if (!r || r.host !== f.host || !pos) return null;
  const a = new FuenteSP(r.host, r.carpeta);
  const uno = async nombre => {
    try {
      const meta = await a.metadatos(nombre);
      return meta.bytes > MAX_SVG ? null : aImagen(await a.leer(nombre));
    } catch (_) { return null; }
  };
  const [claro, oscuro] = await Promise.all([uno(pos), uno(nombreEmblema(id, true))]);
  return claro ? { claro, oscuro } : null;
}

// Los emblemas de varias gerencias a la vez ({ id: {claro, oscuro} | null }), cada uno con las mismas reglas de `leerEmblemas`.
// Nunca lanza error: la gerencia cuyo emblema no se pueda leer queda en null.
export async function leerEmblemasDe(f, ids) {
  const lista = [...new Set(Array.isArray(ids) ? ids : [])].filter(id => nombreEmblema(id, false)).slice(0, 30);
  const res = await Promise.all(lista.map(id => leerEmblemas(f, id).catch(() => null)));
  return Object.fromEntries(lista.map((id, i) => [id, res[i]]));
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
