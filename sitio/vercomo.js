// "Ver como" (sólo Administrador): calcula cómo vería el menú y la portada otra persona que tiene entrada en el catálogo de
// acceso. Es sólo presentación: cada archivo se sigue abriendo con los permisos de SharePoint de la cuenta de quien administra,
// así que esto no dice qué puede abrir la otra persona.
// El correo se usa para calcular su llave y se descarta: no se guarda, no se imprime y no sale en el resultado.
// Módulo sin DOM, red ni almacenamiento, para poder probarlo aparte.
import { interpretarAcceso } from "./acceso.js";
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
    return { etiquetas: [...a.etiquetas], carpetas: [...(a.carpetas || [])], gerencia: gerenciaDeEtiquetas(a.etiquetas) };
  } catch (_) {
    return null;
  }
}

// Texto de la franja fija mientras hay una vista simulada.
export const textoFranja = etiquetas =>
  "Vista como una persona del catálogo (etiquetas: " + (etiquetas || []).join(", ") + ") · sólo presentación; el permiso real es el de SharePoint";
