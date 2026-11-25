// Carga del menú de tableros, sin DOM: lee el catálogo de cada carpeta, una lista de archivos por carpeta (en lugar de los
// metadatos de cada tablero) y, al abrir un tablero, relee sólo el catálogo de su carpeta. Todo entra por parámetros (la fuente,
// la lectura del catálogo, `listaDe`, el texto de los errores), así que se prueba con una fuente simulada que registra cada petición.
import { carpetasALeer, unirCatalogos, nombreDeCarpeta } from "./catalogos.js";

const DUROS = ["red", "sin-sesion"];
const esDuro = e => !!e && DUROS.includes(e.codigo);
const sinAjuste = t => t;
const listaPorOmision = f => f.archivosDeCarpeta();

// Las partes de una ruta relativa de archivo (sin vacíos ni "."); [] si no queda ninguna o si sale de la carpeta (`..`, contrabarra).
function partesDe(rel) {
  const partes = String(rel).split("/").filter(x => x && x !== ".");
  return partes.length && !partes.some(x => x === ".." || x.includes("\\")) ? partes : [];
}

// La forma que el sitio usa para los datos del archivo de un tablero.
const metaDe = x => ({ id: x.nombre, nombre: x.nombre, bytes: Number(x.bytes) || 0, modificado: x.modificado });

export function validarCatalogo(datos) {
  if (!datos || !Array.isArray(datos.tableros)) throw new Error("El catálogo no trae la lista “tableros”.");
  const ids = new Set();
  for (const t of datos.tableros) {
    if (!t || typeof t.id !== "string" || typeof t.archivo !== "string" || typeof t.titulo !== "string") throw new Error("El catálogo: cada tablero necesita id, titulo y archivo.");
    if (ids.has(t.id)) throw new Error("El catálogo: el id “" + t.id + "” está repetido.");
    ids.add(t.id);
  }
}

// Deja sólo los tableros cuyo archivo la persona puede leer (el archivo está en la lista de la carpeta) y les pone `meta`.
//  - Una sola petición de lista por carpeta, y sólo si algún tablero la necesita.
//  - Un archivo en una subcarpeta no sale en la lista de la carpeta: ése se pide aparte, como antes (`f.metadatos`).
//  - Una ruta que sale de la carpeta no vale: el tablero se omite.
//  - Un error de red o de sesión se muestra; cualquier otro (la lista no se pudo leer, un archivo no existe) omite los tableros afectados.
export async function conMeta({ f, tableros, listaDe = listaPorOmision, textoError }) {
  const partes = tableros.map(t => partesDe(t.archivo));
  let porNombre = new Map();
  if (partes.some(p => p.length === 1)) {
    try { porNombre = new Map((await listaDe(f)).map(x => [String(x.nombre).toLowerCase(), x])); }
    catch (e) { if (esDuro(e)) throw new Error(textoError(e)); }
  }
  const sueltos = await Promise.allSettled(tableros.map((t, i) => partes[i].length > 1 ? f.metadatos(t.archivo) : null));
  const duro = sueltos.find(r => r.status === "rejected" && esDuro(r.reason));
  if (duro) throw new Error(textoError(duro.reason));
  const salida = [];
  tableros.forEach((t, i) => {
    let meta = null;
    if (partes[i].length === 1) { const x = porNombre.get(partes[i][0].toLowerCase()); meta = x ? metaDe(x) : null; }
    else if (partes[i].length > 1 && sueltos[i].status === "fulfilled") meta = sueltos[i].value;
    if (meta) salida.push({ ...t, meta });
  });
  return salida;
}

// Lee el catálogo de una carpeta (en línea, con `leerCatalogo(archivo, undefined, f)`), lo valida y, en la organización, deja los tableros legibles.
export async function leerCarpeta({ f, archivo, leerCatalogo, listaDe = listaPorOmision, textoError }) {
  const { datos } = await leerCatalogo(archivo, undefined, f);
  validarCatalogo(datos);
  if (f.tipo === "graph") datos.tableros = await conMeta({ f, tableros: datos.tableros, listaDe, textoError });
  return datos;
}

// Los catálogos de las carpetas hermanas que le tocan a la persona (Administrador: todas las que existen; otra etiqueta: las que su lista nombra).
// La que no se pueda leer se omite sin avisar. `hermanas` (Map nombre → fuente) se vacía y se llena con las que se leyeron.
async function leerHermanas(p) {
  const { f, extras, hermanas, catalogo, fuenteHermana, listarHermanas, ajustar = sinAjuste } = p;
  hermanas.clear();
  if (!extras) return [];
  const existentes = extras.admin ? await listarHermanas(f) : [];
  const nombres = carpetasALeer({ administrador: extras.admin, existentes, configuradas: extras.carpetas, propia: nombreDeCarpeta(f.carpeta) });
  const res = await Promise.allSettled(nombres.map(async n => {
    const fh = fuenteHermana(f, n);
    if (!fh) throw new Error("sin carpeta");
    const d = await leerCarpeta({ ...p, f: fh, archivo: catalogo });
    hermanas.set(n, fh);
    return { carpeta: n, tableros: ajustar(d.tableros, fh) };
  }));
  return res.filter(r => r.status === "fulfilled").map(r => r.value);
}

// Lo leído de cada carpeta: { datos (el catálogo de la carpeta del enlace), propia (sus tableros), hermanos: [{ carpeta, tableros }] }.
// Lee todo el menú: el catálogo y la lista de archivos de la carpeta del enlace y, si le tocan, los de las hermanas.
export async function cargarMenu(p) {
  const datos = await leerCarpeta(p);
  const hermanos = p.f.tipo === "graph" ? await leerHermanas(p) : [];
  return { datos, propia: datos.tableros, hermanos };
}

// El menú que ve la persona a partir de lo leído: los tableros de la carpeta del enlace y los de las hermanas, ya unidos.
export function armarMenu(estado, f, ajustar = sinAjuste) {
  const tableros = f.tipo === "graph" ? ajustar(unirCatalogos(estado.propia, estado.hermanos), f) : estado.propia;
  return { ...estado.datos, tableros };
}

// Al abrir un tablero: relee sólo el catálogo (y la lista de archivos) de la carpeta a la que pertenece, la propia o la hermana de su
// `origen`; las demás conservan lo ya leído. Si el tablero no está en el menú (o no hay nada leído), vuelve a leer el menú completo.
// Un error al leer la carpeta propia se propaga; la hermana que no se pueda leer deja de ofrecerse, como al armar el menú.
export async function alAbrir(p) {
  const { estado, id, f, hermanas, catalogo, ajustar = sinAjuste } = p;
  const t = estado && id != null ? armarMenu(estado, f, ajustar).tableros.find(x => x && x.id === id) : null;
  if (!t) return cargarMenu(p);
  const origen = typeof t.origen === "string" ? t.origen : null;
  if (origen === null) {
    const datos = await leerCarpeta(p);
    return { datos, propia: datos.tableros, hermanos: estado.hermanos };
  }
  const fh = hermanas.get(origen);
  if (!fh) return estado;
  let nuevos;
  try { nuevos = ajustar((await leerCarpeta({ ...p, f: fh, archivo: catalogo })).tableros, fh); }
  catch (_) { hermanas.delete(origen); return { ...estado, hermanos: estado.hermanos.filter(h => h.carpeta !== origen) }; }
  return { ...estado, hermanos: estado.hermanos.map(h => h.carpeta === origen ? { carpeta: origen, tableros: nuevos } : h) };
}
