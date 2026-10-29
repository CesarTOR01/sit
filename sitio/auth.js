// Inicio de sesión con Microsoft Entra: flujo de código con PKCE, sin secretos ni librerías.
// La sesión (tokens y vencimiento) vive en sessionStorage: se pierde al cerrar la pestaña.
// Hay dos recursos: Graph (sólo el perfil, User.Read) y SharePoint (la lectura de archivos, con el dominio del catálogo).
import { CONFIG, urlRedirect } from "./config.js";

const CLAVE = "sit.sesion", PKCE = "sit.pkce", VOLVER = "sit.volver";
const MARGEN_MS = 120000;
const BASE = ["openid", "profile", "offline_access"];

export class ErrorAuth extends Error {
  constructor(codigo, mensaje) { super(mensaje); this.codigo = codigo; }
}

const guardar = (k, v) => { try { v == null ? sessionStorage.removeItem(k) : sessionStorage.setItem(k, JSON.stringify(v)); } catch (_) { /* sin almacenamiento */ } };
const leer = k => { try { return JSON.parse(sessionStorage.getItem(k) || "null"); } catch (_) { return null; } };

const b64url = b => btoa(String.fromCharCode(...new Uint8Array(b))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const azar = n => b64url(crypto.getRandomValues(new Uint8Array(n)));
export async function retoPKCE(verificador) {
  return b64url(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verificador)));
}

// El código de error de Entra que significa "falta el consentimiento de un administrador".
export function esConsentimiento(texto) {
  return /AADSTS65001|AADSTS90094|AADSTS650057|admin.*consent|consent_required/i.test(String(texto || ""));
}

// El alcance de SharePoint de un dominio de la organización, por ejemplo https://<dominio>/AllSites.Read
export const alcanceSP = host => "https://" + host + "/" + CONFIG.alcanceSharePoint;
const alcancesDe = (tipo, host) => tipo === "sp" ? [...BASE, alcanceSP(host)] : [...BASE, "User.Read"];

export function sesion() { return leer(CLAVE); }
export function haySesion() {
  const s = sesion();
  return !!(s && (s.refresh_token || Object.values(s.tokens || {}).some(x => x && x.vence > Date.now())));
}
export function alcanceConcedido() { return (sesion() || {}).alcance || ""; }
// La sesión puede leer archivos si el inicio de sesión incluyó el permiso de SharePoint.
export function puedeLeerArchivos() { const s = sesion(); return !!(s && s.sp); }
export function hostDeSesion() { const s = sesion(); return s && s.sp ? s.host : null; }
export function sesionBasica() { const s = sesion(); return !!(s && s.basico); }

// host: el dominio de SharePoint del catálogo. Sin él (o en modo básico) sólo se pide el perfil.
export async function iniciarSesion({ basico = false, volver = null, host = null } = {}) {
  const conSP = !basico && !!host;
  const verificador = azar(48), estado = azar(16);
  guardar(PKCE, { verificador, estado, basico, host: conSP ? host : null });
  guardar(VOLVER, volver || leer(VOLVER) || location.href);
  const alcances = conSP ? [...BASE, alcanceSP(host), "User.Read"] : alcancesDe("graph");
  const url = CONFIG.autoridad + "authorize?" + new URLSearchParams({
    client_id: CONFIG.cliente, response_type: "code", redirect_uri: urlRedirect(), response_mode: "query",
    scope: alcances.join(" "), state: estado, code_challenge: await retoPKCE(verificador), code_challenge_method: "S256",
  });
  location.assign(url);
}

// tipo: "sp" o "graph". Guarda el token de ese recurso junto a los que ya había.
async function pedirToken(cuerpo, tipo, host) {
  let r, j;
  try {
    r = await fetch(CONFIG.autoridad + "token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ client_id: CONFIG.cliente, ...cuerpo }) });
    j = await r.json();
  } catch (e) { throw new ErrorAuth("red", "No se pudo contactar el servicio de inicio de sesión."); }
  if (!j.access_token) {
    const d = (j.error_description || j.error || "HTTP " + r.status);
    throw new ErrorAuth(esConsentimiento(d) ? "consentimiento" : "token", d.split("\r\n")[0]);
  }
  const previa = sesion() || {};
  const nueva = {
    refresh_token: j.refresh_token || previa.refresh_token || null,
    tokens: { ...(previa.tokens || {}), [tipo]: { t: j.access_token, vence: Date.now() + (Number(j.expires_in) || 3600) * 1000 } },
    sp: tipo === "sp" ? true : !!previa.sp,
    host: tipo === "sp" ? host : (previa.host || null),
    basico: previa.basico || false,
    alcance: [previa.alcance, j.scope].filter(Boolean).join(" "),
  };
  guardar(CLAVE, nueva);
  return nueva;
}

// Si la página es el regreso del inicio de sesión, lo completa. Devuelve null si no lo era, o {volver} / {error}.
export async function procesarRetorno() {
  const q = new URLSearchParams(location.search);
  if (!q.has("code") && !q.has("error")) return null;
  const pk = leer(PKCE), volver = leer(VOLVER);
  history.replaceState(null, "", location.pathname);
  guardar(PKCE, null);
  if (q.has("error")) {
    const d = q.get("error_description") || q.get("error");
    return { error: new ErrorAuth(esConsentimiento(d) || esConsentimiento(q.get("error")) ? "consentimiento" : "cancelado", d.split("\r\n")[0]), basicoIntentado: !!(pk && (pk.basico || !pk.host)) };
  }
  if (!pk || q.get("state") !== pk.estado) return { error: new ErrorAuth("estado", "La respuesta del inicio de sesión no coincide con la solicitud. Inténtalo de nuevo.") };
  guardar(CLAVE, null); // una sesión nueva reemplaza a la anterior
  const tipo = pk.host ? "sp" : "graph";
  try {
    const s = await pedirToken({ grant_type: "authorization_code", code: q.get("code"), redirect_uri: urlRedirect(), code_verifier: pk.verificador, scope: alcancesDe(tipo, pk.host).join(" ") }, tipo, pk.host);
    if (pk.basico) guardar(CLAVE, { ...s, basico: true });
  } catch (e) { return { error: e, basicoIntentado: pk.basico || !pk.host }; }
  guardar(VOLVER, null);
  return { volver };
}

// Un token vigente del recurso pedido; lo renueva con el refresh token si está por vencer.
const renovando = {};
export async function token(tipo = "graph", forzar = false) {
  const s = sesion();
  if (!s) throw new ErrorAuth("sin-sesion", "No hay sesión iniciada.");
  if (tipo === "sp" && !s.sp) throw new ErrorAuth("consentimiento", "La sesión no incluye la lectura de archivos.");
  const c = (s.tokens || {})[tipo];
  if (!forzar && c && c.t && c.vence - Date.now() > MARGEN_MS) return c.t;
  if (!s.refresh_token) { cerrarSesion(); throw new ErrorAuth("vencida", "La sesión venció. Inicia sesión de nuevo."); }
  renovando[tipo] = renovando[tipo] || pedirToken({ grant_type: "refresh_token", refresh_token: s.refresh_token, scope: alcancesDe(tipo, s.host).join(" ") }, tipo, s.host)
    .finally(() => { delete renovando[tipo]; });
  try { return (await renovando[tipo]).tokens[tipo].t; }
  catch (e) { if (e.codigo !== "red") cerrarSesion(); throw e.codigo === "red" ? e : new ErrorAuth("vencida", "La sesión venció. Inicia sesión de nuevo."); }
}

export function cerrarSesion() { guardar(CLAVE, null); guardar(PKCE, null); }

export function recordarDestino(url) { guardar(VOLVER, url); }
export function destinoGuardado() { return leer(VOLVER); }
