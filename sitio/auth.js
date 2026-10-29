// Inicio de sesión con Microsoft Entra: flujo de código con PKCE, sin secretos ni librerías.
// La sesión (tokens y vencimiento) vive en sessionStorage: se pierde al cerrar la pestaña.
import { CONFIG, urlRedirect } from "./config.js";

const CLAVE = "sit.sesion", PKCE = "sit.pkce", VOLVER = "sit.volver";
const MARGEN_MS = 120000;

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

export function sesion() { return leer(CLAVE); }
export function haySesion() { const s = sesion(); return !!(s && (s.access_token && s.vence > Date.now() || s.refresh_token)); }
export function alcanceConcedido() { return (sesion() || {}).alcance || ""; }
export function puedeLeerArchivos() { return /Files\.Read/i.test(alcanceConcedido()); }

export async function iniciarSesion({ basico = false, volver = null } = {}) {
  const verificador = azar(48), estado = azar(16);
  guardar(PKCE, { verificador, estado, basico });
  guardar(VOLVER, volver || leer(VOLVER) || location.href);
  const alcances = basico ? CONFIG.alcancesBasicos : CONFIG.alcances;
  const url = CONFIG.autoridad + "authorize?" + new URLSearchParams({
    client_id: CONFIG.cliente, response_type: "code", redirect_uri: urlRedirect(), response_mode: "query",
    scope: alcances.join(" "), state: estado, code_challenge: await retoPKCE(verificador), code_challenge_method: "S256",
  });
  location.assign(url);
}

async function pedirToken(cuerpo) {
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
    access_token: j.access_token, refresh_token: j.refresh_token || previa.refresh_token || null,
    vence: Date.now() + (Number(j.expires_in) || 3600) * 1000, alcance: j.scope || previa.alcance || "",
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
    return { error: new ErrorAuth(esConsentimiento(d) || esConsentimiento(q.get("error")) ? "consentimiento" : "cancelado", d.split("\r\n")[0]), basicoIntentado: !!(pk && pk.basico) };
  }
  if (!pk || q.get("state") !== pk.estado) return { error: new ErrorAuth("estado", "La respuesta del inicio de sesión no coincide con la solicitud. Inténtalo de nuevo.") };
  try {
    await pedirToken({ grant_type: "authorization_code", code: q.get("code"), redirect_uri: urlRedirect(), code_verifier: pk.verificador, scope: (pk.basico ? CONFIG.alcancesBasicos : CONFIG.alcances).join(" ") });
  } catch (e) { return { error: e, basicoIntentado: pk.basico }; }
  guardar(VOLVER, null);
  return { volver };
}

// Un token vigente; lo renueva con el refresh token si está por vencer.
let renovando = null;
export async function token(forzar = false) {
  const s = sesion();
  if (!s) throw new ErrorAuth("sin-sesion", "No hay sesión iniciada.");
  if (!forzar && s.access_token && s.vence - Date.now() > MARGEN_MS) return s.access_token;
  if (!s.refresh_token) { cerrarSesion(); throw new ErrorAuth("vencida", "La sesión venció. Inicia sesión de nuevo."); }
  renovando = renovando || pedirToken({ grant_type: "refresh_token", refresh_token: s.refresh_token, scope: (s.alcance || CONFIG.alcancesBasicos.join(" ")) })
    .finally(() => { renovando = null; });
  try { return (await renovando).access_token; }
  catch (e) { if (e.codigo !== "red") cerrarSesion(); throw e.codigo === "red" ? e : new ErrorAuth("vencida", "La sesión venció. Inicia sesión de nuevo."); }
}

export function cerrarSesion() { guardar(CLAVE, null); guardar(PKCE, null); }

export function recordarDestino(url) { guardar(VOLVER, url); }
export function destinoGuardado() { return leer(VOLVER); }
