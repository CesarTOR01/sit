// Orquestación de la carga de un tablero embebido: el orden y la paralelización de las lecturas, el sello, la compresión y la
// relectura por catálogo. Sin DOM, red ni almacenamiento propios: todo llega por parámetros (la fuente, el perfil, la identidad,
// el sello, la espera), para probarlo con una fuente simulada que registra cada petición. ver.js sólo pinta lo que éste devuelve.
//
// Lecturas en fila para un tablero de la carpeta del enlace (sin `o`):
//   1) perfil · 2) catálogo de acceso y catálogo de tableros a la vez · 3) el archivo del tablero.
// Con `o` (carpeta hermana) el acceso va antes: de él depende qué carpeta se abre.
import { cargarConSello } from "./cargainicial.js";
import { planDeCompresion, descomprimir, MENSAJES } from "./compresion.js";
import { cambioPorCatalogo } from "./relectura.js";
import { carpetaDeEmbebido, nombreDeCarpeta } from "./catalogos.js";

const aTexto = buf => new TextDecoder("utf-8").decode(buf);
const sinHacer = () => {};

// Lee y valida el catálogo de tableros de una fuente.
async function leerCatalogoDe(origen, rutaCatalogo) {
  const c = JSON.parse(aTexto(await origen.leer(rutaCatalogo)));
  if (c.contrato !== "visor/1" || !Array.isArray(c.tableros)) throw new Error("El catálogo no tiene el formato esperado.");
  return c;
}

// Carga inicial. Resultado:
//   { estado: "ok", t, html, origen, idn }
//   { estado: "no_existe" }   el tablero no está, no le toca a la persona o su carpeta no vale
//   { estado: "catalogo" }    el catálogo ya no está disponible (según catalogoNoDisponible)
//   { estado: "sello", t }    el archivo no cuadra con su sello después de todos los reintentos
//   { estado: "aviso", mensaje }   compresión no admitida o archivo comprimido dañado
// Los demás errores de lectura se propagan.
// Parámetros: id, o (carpeta hermana o null), fuente, rutaCatalogo, perfil(), identidad(fuente, p), fuenteHermana(fuente, carpeta),
// visiblesParaGerencia(tableros, gerencia, etiquetas), esAdministrador(etiquetas), catalogoNoDisponible(e), sha256(buf), esperar(ms),
// leerArchivo (opcional, recibe origen y ruta, para mostrar el avance), marca (opcional, recibe el nombre de la etapa) y ui (opcional,
// con las funciones perfil, encontrado, reintento, cambioRenglon y preparando).
export async function cargarTablero(a) {
  const { id, o, fuente, rutaCatalogo, perfil, identidad, fuenteHermana, visiblesParaGerencia, esAdministrador, catalogoNoDisponible, sha256, esperar } = a;
  const marca = a.marca || sinHacer;
  const ui = a.ui || {};
  const leerArchivo = a.leerArchivo || ((origen, ruta) => origen.leer(ruta));

  // sólo los tableros que le tocan a la persona (su entrada del catálogo de acceso o, sin ella, su Departamento)
  const p = await perfil().catch(() => ({}));
  (ui.perfil || sinHacer)(p);
  marca("perfil");

  let origen = fuente, idn, lectura;
  const leerCat = () => leerCatalogoDe(origen, rutaCatalogo);
  const intentar = () => leerCat().then(cat => ({ cat }), error => ({ error }));
  if (o === null || o === undefined) {
    // el catálogo de tableros está en la carpeta del enlace: no depende del de acceso, así que se leen a la vez
    [idn, lectura] = await Promise.all([identidad(fuente, p), intentar()]);
  } else {
    // `o`: el tablero está en una carpeta hermana; sólo se abre si a la persona le toca esa carpeta (Administrador: cualquiera; otra etiqueta: las de su lista)
    idn = await identidad(fuente, p);
    const carpeta = carpetaDeEmbebido({ origen: o, administrador: esAdministrador(idn.etiquetas), configuradas: idn.carpetas, propia: nombreDeCarpeta(fuente.carpeta) });
    origen = carpeta ? fuenteHermana(fuente, carpeta) : null;
    if (!origen) return { estado: "no_existe" };
    lectura = await intentar();
  }
  marca("acceso y catálogo");
  if (lectura.error) {
    if (catalogoNoDisponible(lectura.error)) return { estado: "catalogo" };
    throw lectura.error;
  }
  const cat = lectura.cat;
  const buscarTablero = c => {
    const x = visiblesParaGerencia(c.tableros.filter(y => y && typeof y.id === "string"), idn.gerencia, idn.etiquetas).find(y => y.id === id);
    return x && x.tipo === "embebido" && typeof x.archivo === "string" ? x : null;
  };
  let t = buscarTablero(cat);
  if (!t) return { estado: "no_existe" };
  const plan0 = planDeCompresion(t); // antes de bajar nada: un renglón con compresión que el sitio no acepta no se descarga
  if (!plan0.ok) return { estado: "aviso", mensaje: MENSAJES[plan0.motivo] || MENSAJES.compresion };
  (ui.encontrado || sinHacer)(t);

  // si el sello no cuadra (catálogo y archivo a medio publicar) se espera y se releen los dos: cada 30 s, hasta 10 veces
  let primera = true;
  const r = await cargarConSello({
    leerCatalogo: async () => { if (primera) { primera = false; return cat; } return leerCat(); },
    buscarTablero,
    leerArchivo: ruta => leerArchivo(origen, ruta),
    sha256,
    esperar,
    avisar: ui.reintento,
  });
  if (r.estado === "no_existe") return { estado: "no_existe" };
  if (r.estado !== "ok") return { estado: "sello", t: r.t };
  marca("archivo");
  const buf = r.buf;
  // si un reintento trajo otro renglón (otro archivo o refresco), la relectura sigue ese renglón y sus enlaces
  if (r.t && r.t !== t) { t = r.t; (ui.cambioRenglon || sinHacer)(t); }

  // si el archivo está guardado comprimido (gzip), aquí se descomprime con el tamaño y el sello que declara su renglón
  const planT = planDeCompresion(t);
  if (!planT.ok) return { estado: "aviso", mensaje: MENSAJES[planT.motivo] || MENSAJES.compresion };
  let html;
  try {
    if (planT.comprimido) (ui.preparando || sinHacer)();
    html = aTexto(await descomprimir(buf, t, { sha256 }));
    if (planT.comprimido) marca("descomprimido");
  } catch (e) { return { estado: "aviso", mensaje: e && e.message ? e.message : "No se pudo preparar el tablero." }; }
  return { estado: "ok", t, html, origen, idn };
}

// Una revisión de la relectura: lee el catálogo (pequeño) y compara el renglón del tablero con el que se mostró (`visto`).
// Si no cambió, no baja nada: { cambio: false }. Si cambió, baja el archivo nuevo, comprueba su sello y su compresión y devuelve
// { cambio: true, t, html }. Lanza Error si el catálogo no se puede leer, ya no trae el tablero o el archivo nuevo no cuadra: quien
// llama avisa y reintenta con espera creciente (vigilar).
export async function releerPorCatalogo({ origen, rutaCatalogo, visto, sha256 }) {
  const c2 = JSON.parse(aTexto(await origen.leer(rutaCatalogo)));
  if (!c2 || !Array.isArray(c2.tableros)) throw new Error("El catálogo no tiene el formato esperado.");
  const t2 = c2.tableros.find(x => x && x.id === visto.id && typeof x.archivo === "string");
  if (!t2) throw new Error("el tablero ya no está en el catálogo");
  if (!cambioPorCatalogo(visto, t2)) return { cambio: false };
  const b2 = await origen.leer(t2.archivo);
  if (t2.sha256 && await sha256(b2) !== String(t2.sha256).toLowerCase()) throw new Error("a medio sincronizar");
  if (!planDeCompresion(t2).ok) throw new Error("compresión no admitida");
  const html2 = aTexto(await descomprimir(b2, t2, { sha256 }));
  return { cambio: true, t: t2, html: html2 };
}
