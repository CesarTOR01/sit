// "Ver como" (sólo Administrador): calcula cómo vería el menú y la portada otra persona que tiene entrada en el catálogo de
// acceso. Es sólo presentación: cada archivo se sigue abriendo con los permisos de SharePoint de la cuenta de quien administra,
// así que esto no dice qué puede abrir la otra persona.
// El correo se usa para calcular su llave y se descarta: no se guarda, no se imprime y no sale en el resultado.
// Módulo sin DOM, red ni almacenamiento, para poder probarlo aparte.
import { interpretarAcceso, listarPersonas } from "./acceso.js";
import { gerenciaDeEtiquetas, esAdministrador } from "./gerencias.js";

export const MAX_CORREO = 254;
// un solo signo de arroba con algo (sin espacios) a cada lado
const FORMA_CORREO = /^[^@\s]+@[^@\s]+$/;

export const AVISO_SIN_ENTRADA = "Esa persona no tiene entrada en el catálogo de acceso: el sitio la presentaría según su Departamento, que no se puede ver para otra cuenta.";
export const AVISO_SIN_CATALOGO = "No se pudo leer el catálogo de acceso; la vista no cambió.";

// ¿El texto tiene forma de correo? Se normaliza igual que hashCorreo (sin espacios a los lados, en minúsculas).
export function esCorreo(correo) {
  if (typeof correo !== "string" || correo.length > 4 * MAX_CORREO) return false;
  const t = correo.trim().toLowerCase();
  return t.length > 0 && t.length <= MAX_CORREO && FORMA_CORREO.test(t);
}

// La identidad con la que se pinta la vista simulada: { etiquetas, carpetas, gerencia }, con la misma forma que usa app.js.
// null si el correo no tiene forma de correo, si no tiene entrada, si el archivo no se puede interpretar o si la persona es
// Administrador (el modo no sirve para encadenar vistas de administrador). `hashCorreo` es la función de acceso.js.
// Nunca lanza.
export async function identidadComo(textoAcceso, correo, hashCorreo) {
  try {
    if (!esCorreo(correo) || typeof hashCorreo !== "function") return null;
    const llave = await hashCorreo(correo.trim().toLowerCase());
    if (typeof llave !== "string" || !llave) return null;
    const a = interpretarAcceso(textoAcceso, llave);
    if (a.estado !== "entrada" || esAdministrador(a.etiquetas)) return null;
    return { etiquetas: [...a.etiquetas], carpetas: [...(a.carpetas || [])], gerencia: gerenciaDeEtiquetas(a.etiquetas), inicio: a.inicio || null };
  } catch (_) {
    return null;
  }
}

// Lo mismo, pero con la llave de una persona de la lista (sin correo de por medio). null si la llave no es de una persona del
// catálogo, si no tiene entrada o si es Administrador. Nunca lanza.
export function identidadPorLlave(textoAcceso, llave) {
  try {
    if (typeof llave !== "string" || !/^[0-9a-f]{64}$/.test(llave)) return null;
    const a = interpretarAcceso(textoAcceso, llave);
    if (a.estado !== "entrada" || esAdministrador(a.etiquetas)) return null;
    return { etiquetas: [...a.etiquetas], carpetas: [...(a.carpetas || [])], gerencia: gerenciaDeEtiquetas(a.etiquetas), inicio: a.inicio || null };
  } catch (_) {
    return null;
  }
}

// La lista desplegable de "Ver como": las personas del catálogo que no son Administrador, con su rótulo (el puesto, si el archivo lo
// trae) y sus etiquetas. Devuelve [{ llave, texto }] ordenada por texto. Sin rótulo se lee "Sin rótulo" y sus etiquetas entre paréntesis.
export function opcionesVerComo(textoAcceso) {
  const lista = listarPersonas(textoAcceso).filter(p => !esAdministrador(p.etiquetas));
  return lista
    .map(p => ({ llave: p.llave, texto: (p.rotulo || "Sin rótulo") + " (" + p.etiquetas.join(", ") + ")" }))
    .sort((a, b) => a.texto.localeCompare(b.texto, "es"));
}

// En "Ver como" el catálogo de la carpeta del enlace es el de quien administra, no el de la otra persona. Sus tableros (los que no
// traen `origen`) sólo se conservan si esa carpeta (`propia`) está en la lista de la persona; los de las hermanas ya vienen de su lista.
export function tablerosDeSuLista(tableros, carpetas, propia) {
  const lista = Array.isArray(tableros) ? tableros : [];
  const suyas = (Array.isArray(carpetas) ? carpetas : []).filter(n => typeof n === "string").map(n => n.toLowerCase());
  const dentro = typeof propia === "string" && suyas.includes(propia.toLowerCase());
  return lista.filter(t => t && typeof t === "object" && (typeof t.origen === "string" || dentro));
}

// El parámetro `o` del enlace a un tablero embebido (ver.html lo abre con la identidad real y la carpeta guardada de quien administra):
// el de una hermana trae su `origen`; en una vista simulada, los de la carpeta de inicio de la persona (`inicio`) piden esa carpeta,
// salvo que sea la misma que la guardada (`propiaReal`), que ver.html no admite como `o`. null = sin `o`.
export function origenDeEnlace(t, inicio, propiaReal) {
  if (t && typeof t.origen === "string") return t.origen;
  if (typeof inicio !== "string" || !inicio || typeof propiaReal !== "string") return null;
  return inicio.toLowerCase() === propiaReal.toLowerCase() ? null : inicio;
}

// Texto de la franja fija mientras hay una vista simulada.
export const textoFranja = (etiquetas, inicio = null) =>
  "Vista como una persona del catálogo (etiquetas: " + (etiquetas || []).join(", ") + (typeof inicio === "string" && inicio ? "; enlace a la carpeta " + inicio : "") + ") · sólo presentación; el permiso real es el de SharePoint";
