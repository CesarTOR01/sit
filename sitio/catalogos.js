// Juntar los catálogos de varias carpetas: el de la carpeta del enlace y los de sus carpetas hermanas que le tocan a la persona.
// Módulo sin DOM ni red, para poder probarlo aparte. Sólo decide qué tableros se ofrecen: el acceso real a cada archivo lo decide
// SharePoint con los permisos de la cuenta.

export const MAX_TABLEROS = 300;
const NOMBRE_CARPETA = /^[A-Za-z0-9_-]{1,64}$/;
const RESERVADAS = ["acceso", "marca"]; // carpetas del propio sitio: no son de tableros

// El último tramo de la ruta de una carpeta (su nombre).
export const nombreDeCarpeta = ruta => String(ruta || "").split("/").filter(Boolean).pop() || "";

// Qué carpetas hermanas leer.
//   administrador: todas las que existen (`existentes`, enumeradas por la API de SharePoint);
//   si no: sólo las que la lista de su etiqueta nombra (`configuradas`).
// Se descartan los nombres no válidos, las reservadas, la propia carpeta del enlace y las repetidas.
export function carpetasALeer({ administrador, existentes = [], configuradas = [], propia = "" }) {
  const fuente = administrador ? existentes : configuradas;
  const salida = [];
  for (const n of Array.isArray(fuente) ? fuente : []) {
    if (typeof n !== "string" || !NOMBRE_CARPETA.test(n)) continue;
    const k = n.toLowerCase();
    if (RESERVADAS.includes(k) || k === String(propia).toLowerCase() || salida.some(x => x.toLowerCase() === k)) continue;
    salida.push(n);
  }
  return salida;
}

const valido = t => t !== null && typeof t === "object" && typeof t.id === "string" && typeof t.archivo === "string" && typeof t.titulo === "string";

// Une los tableros de la carpeta del enlace (`principal`) con los de las hermanas (`hermanos`: [{ carpeta, tableros }]).
// Cada tablero de una hermana trae `origen` = el nombre de su carpeta, para leerlo de ahí. Se descartan:
//   - los tableros mal formados,
//   - los ids repetidos (gana la carpeta del enlace y, después, la primera hermana),
//   - los embebidos de carpetas hermanas (el visor de embebidos sólo abre los de la carpeta del enlace),
//   - lo que pase de MAX_TABLEROS.
export function unirCatalogos(principal, hermanos) {
  const salida = [], ids = new Set();
  for (const t of Array.isArray(principal) ? principal : []) {
    if (!valido(t) || ids.has(t.id)) continue;
    // el origen sólo lo pone este módulo: un catálogo no puede mandar a leer sus archivos de otra carpeta
    const { origen: _ajeno, ...propio } = t;
    ids.add(t.id); salida.push(propio);
  }
  for (const h of Array.isArray(hermanos) ? hermanos : []) {
    if (!h || typeof h.carpeta !== "string" || !NOMBRE_CARPETA.test(h.carpeta) || !Array.isArray(h.tableros)) continue;
    for (const t of h.tableros) {
      if (salida.length >= MAX_TABLEROS) return salida;
      if (!valido(t) || t.tipo === "embebido" || ids.has(t.id)) continue;
      ids.add(t.id); salida.push({ ...t, origen: h.carpeta });
    }
  }
  return salida.slice(0, MAX_TABLEROS);
}
