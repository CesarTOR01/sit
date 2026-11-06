// Catálogo de acceso: decide qué etiquetas (gerencias o audiencias) tiene una persona, sin depender del campo Departamento.
// Sólo decide qué se muestra. La barrera real son los permisos de cada carpeta de SharePoint.
//
//   sit-acceso.json  { contrato:"acceso/1", generado?, personas:{ "<sha256 del correo en minúsculas>": ["Etiqueta", …] },
//                      carpetas?:{ "<Etiqueta>": ["carpeta_hermana", …] } }
//   La etiqueta Administrador lee todas las carpetas hermanas con catálogo; las demás, sólo las que nombra `carpetas`.
//
// La llave es el hash del correo, calculado aquí con el perfil de la propia persona; el correo no se guarda, no se imprime y
// no sale de esta función. La ruta del catálogo no sale de ningún archivo: es la carpeta hermana `acceso` de la carpeta del enlace.
// Módulo sin DOM ni red, para poder probarlo aparte.

export const MAX_BYTES = 1024 * 1024; // un archivo mayor se trata como ilegible
const MAX_ETIQUETAS = 20, MAX_LARGO = 64;
// Carpetas hermanas que una etiqueta puede leer (campo opcional `carpetas`): nombres simples, sin las reservadas del propio sitio.
export const MAX_CARPETAS = 20;
const NOMBRE_CARPETA = /^[A-Za-z0-9_-]{1,64}$/;
const CARPETAS_RESERVADAS = ["acceso", "marca"];
const RAIZ_BIBLIOTECA = p => /^(sites|teams|personal)$/i.test(p[0] || "") ? 3 : 1; // partes de la ruta hasta la biblioteca

// SHA-256 del correo en minúsculas, en hexadecimal. Sin correo devuelve null.
export async function hashCorreo(correo) {
  const t = String(correo || "").trim().toLowerCase();
  if (!t) return null;
  const h = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(t));
  return [...new Uint8Array(h)].map(b => b.toString(16).padStart(2, "0")).join("");
}

// La carpeta del catálogo de acceso: la hermana `nombre` de la carpeta del enlace, dentro de la misma biblioteca.
// Devuelve {host, carpeta} o null si la carpeta del enlace no tiene una carpeta padre dentro de la biblioteca.
export function rutaAcceso(ubicacion, nombre) {
  if (!ubicacion || typeof ubicacion.host !== "string" || typeof ubicacion.carpeta !== "string") return null;
  if (typeof nombre !== "string" || !/^[A-Za-z0-9_-]+$/.test(nombre)) return null;
  const partes = ubicacion.carpeta.split("/").filter(Boolean);
  if (partes.some(p => p === ".." || p === "." || p.includes("\\"))) return null;
  const padre = partes.slice(0, -1);
  if (padre.length <= RAIZ_BIBLIOTECA(partes)) return null;
  return { host: ubicacion.host, carpeta: "/" + padre.join("/") + "/" + nombre };
}

const esObjeto = v => v !== null && typeof v === "object" && !Array.isArray(v);
const esEtiqueta = e => typeof e === "string" && e.trim() !== "" && e.length <= MAX_LARGO;

// Las carpetas hermanas que le tocan a la persona según `carpetas: { "<etiqueta>": ["carpeta", …] }`. Un campo mal formado, un
// nombre no válido o una carpeta reservada se ignoran sin afectar el acceso; el resultado no se repite y tiene tope.
function carpetasDe(carpetas, etiquetas) {
  if (!esObjeto(carpetas)) return [];
  const salida = [];
  for (const e of etiquetas) {
    const lista = Object.prototype.hasOwnProperty.call(carpetas, e) ? carpetas[e] : null;
    if (!Array.isArray(lista)) continue;
    for (const n of lista) {
      if (typeof n === "string" && NOMBRE_CARPETA.test(n) && !CARPETAS_RESERVADAS.includes(n.toLowerCase()) && !salida.includes(n) && salida.length < MAX_CARPETAS) salida.push(n);
    }
  }
  return salida;
}

// Interpreta el contenido ya leído. Devuelve:
//   { estado: "entrada", etiquetas: [...], carpetas?: [...] }  la persona está en el catálogo (carpetas sólo si le tocan)
//   { estado: "sin-entrada" }                el catálogo es válido y la persona no está
//   { estado: "roto" }                       el archivo no se puede usar (contrato, forma o tamaño)
export function interpretarAcceso(texto, llave) {
  if (typeof texto !== "string" || texto.length > MAX_BYTES) return { estado: "roto" };
  let datos;
  try { datos = JSON.parse(texto); } catch (_) { return { estado: "roto" }; }
  if (!esObjeto(datos) || datos.contrato !== "acceso/1" || !esObjeto(datos.personas)) return { estado: "roto" };
  if (!llave) return { estado: "sin-entrada" };
  if (!Object.prototype.hasOwnProperty.call(datos.personas, llave)) return { estado: "sin-entrada" };
  const v = datos.personas[llave];
  if (!Array.isArray(v) || !v.length || v.length > MAX_ETIQUETAS || !v.every(esEtiqueta)) return { estado: "roto" };
  const etiquetas = v.map(e => e.trim()), carpetas = carpetasDe(datos.carpetas, etiquetas);
  return carpetas.length ? { estado: "entrada", etiquetas, carpetas } : { estado: "entrada", etiquetas };
}
