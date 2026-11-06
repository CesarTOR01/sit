// Piezas de pantalla que no dependen de la sesión ni de SharePoint: reciben sus datos y devuelven elementos.
// El sitio (app.js) y la maqueta local usan estas mismas funciones, así lo que se ve en una se ve en la otra.
import { h } from "./comun.js";
import { iconoClave, claveGerencia } from "./iconos.js";
import { heroGerencia, emblemaImg, repartoPorGerencia, GENERAL } from "./gerencias.js";
import { pintarBloques } from "./bloques.js";

// Pasadas más de estas horas desde la última publicación, la marca de frescura se pone en ámbar.
export const VIGENCIA_H = 36;

export function hace(iso) {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return { txt: "fecha desconocida", horas: Infinity };
  const hrs = (Date.now() - t) / 36e5;
  return { horas: hrs, txt: hrs < 1 ? "hace menos de 1 h" : hrs < 48 ? "hace " + Math.round(hrs) + " h" : "hace " + Math.round(hrs / 24) + " días" };
}

// "2026-10-29T14:40:00Z" -> "29/10/2026 14:40" (hora local de quien mira), o null si no es una fecha
export function fechaHora(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const p = n => String(n).padStart(2, "0");
  return p(d.getDate()) + "/" + p(d.getMonth() + 1) + "/" + d.getFullYear() + " " + p(d.getHours()) + ":" + p(d.getMinutes());
}

// Menú lateral: Inicio primero (siempre visible, activo en la portada), la búsqueda y un renglón por gerencia que se abre con sus tableros.
// Cada tablero va a una sola gerencia (el mismo reparto del mapa de Administrador); las gerencias sin tableros no salen.
// Una gerencia abierta a la vez: la del tablero que se está viendo (o la única que haya); al buscar se abren todas las que coinciden.
// `tableros` ya viene filtrado y ordenado para la persona; `hrefDe(t)` da el enlace de cada tablero.
export function menuLateral({ tableros, actualId, hrefDe, hrefInicio = "#/" }) {
  const q = h("input", { type: "search", placeholder: "Buscar tablero…", "aria-label": "Buscar tablero" });
  const lista = h("div", { class: "grupos" });
  const grupos = () => {
    const f = q.value.trim().toLowerCase();
    const coincide = t => !f || (t.titulo + " " + (t.grupo || "") + " " + (t.descripcion || "")).toLowerCase().includes(f);
    const reparto = repartoPorGerencia(tableros.filter(coincide)).filter(x => x.tableros.length);
    if (!reparto.length) { lista.replaceChildren(h("p", { class: "sub-tab relleno" }, "Sin coincidencias.")); return; }
    const abierto = x => f !== "" || reparto.length === 1 || x.tableros.some(t => t.id === actualId);
    const detalles = reparto.map(x => {
      const d = h("details", { class: "gm", "data-gerencia": x.gerencia.id },
        h("summary", {}, iconoClave(claveGerencia(x.gerencia.id)), h("span", { class: "gm-nombre" }, x.gerencia === GENERAL ? "General" : x.gerencia.nombre), h("span", { class: "gm-cuenta" }, String(x.tableros.length))),
        h("div", { class: "gm-items" }, x.tableros.map(t => h("a", { href: hrefDe(t), "aria-current": t.id === actualId ? "page" : null, title: t.descripcion || null }, h("span", {}, t.titulo)))));
      d.open = abierto(x);
      if (!f) d.addEventListener("toggle", () => { if (d.open) for (const o of detalles) if (o !== d && o.open) o.open = false; });
      return d;
    });
    lista.replaceChildren(...detalles);
  };
  q.addEventListener("input", grupos);
  const inicio = h("a", { href: hrefInicio, class: "inicio", "aria-current": actualId ? null : "page" }, iconoClave("casa"), h("span", {}, "Inicio"));
  grupos();
  return [inicio, q, lista];
}

// Portada de Administrador: una tarjeta por gerencia con sus tableros (las gerencias sin tableros lo dicen), nada queda fuera.
function mapaGerencias(tableros, hrefDe, emblemas) {
  return h("div", { class: "mapa-gerencias" }, repartoPorGerencia(tableros).map(({ gerencia, tableros: ts, lema }) =>
    h("section", { class: "mapa-gerencia", "data-gerencia": gerencia.id },
      h("div", { class: "mapa-cab" },
        h("div", { class: "mapa-titulo" }, h("h3", {}, gerencia === GENERAL ? "General" : gerencia.nombre), h("p", { class: "mapa-lema" }, lema)),
        emblemas && emblemas[gerencia.id] ? emblemaImg(emblemas[gerencia.id], gerencia, "mapa-emblema") : null),
      h("p", { class: "mapa-cuenta" }, ts.length ? ts.length + (ts.length === 1 ? " tablero" : " tableros") : "Aún sin tableros publicados"),
      ts.length ? h("ul", {}, ts.map(t => h("li", {}, h("a", { href: hrefDe(t), title: t.descripcion || null }, t.titulo)))) : null)));
}

// Portada: encabezado de la gerencia (o el título del portal si no hay sesión de la organización), aviso de acceso y el bloque Tus tableros.
// Para Administrador, en lugar de la lista va el mapa de todas las gerencias.
export function portadaView({ portal, tableros, hrefDe, graph, gerencia, usuario, emblema, emblemas = {}, accesoRoto }) {
  const edad = hace(portal.generado);
  const admin = !!(graph && gerencia && gerencia.id === "administrador");
  return h("div", {},
    graph ? heroGerencia(gerencia, usuario, emblema) : h("h2", { class: "titulo-tab" }, portal.titulo || "SIT"),
    !graph && portal.subtitulo ? h("p", { class: "sub-tab" }, portal.subtitulo) : null,
    graph && accesoRoto ? h("div", { class: "aviso warn", role: "status" }, "No se pudo leer tu acceso; por ahora sólo se muestran los tableros generales.") : null,
    graph ? h("h3", { class: "tus-tableros" }, admin ? "Todas las gerencias" : "Tus tableros") : null,
    h("div", { class: "fila-chips" }, h("span", { class: "chip " + (edad.horas > VIGENCIA_H ? "warn" : "ok") }, "Publicado " + edad.txt), h("span", { class: "chip" }, tableros.length + (tableros.length === 1 ? " tablero" : " tableros"))),
    admin ? mapaGerencias(tableros, hrefDe, emblemas) : tableros.length ? h("div", { class: "kpis" }, tableros.map(t => {
      const m = t.meta && t.meta.modificado ? hace(t.meta.modificado) : null;
      return h("a", { class: "kpi enlace", href: hrefDe(t) },
        h("div", { class: "et" }, t.grupo || "Tableros"), h("div", { class: "val chico" }, t.titulo),
        h("div", { class: "pie" }, t.descripcion ? h("span", {}, t.descripcion) : null, m ? h("span", {}, "Archivo actualizado " + m.txt) : null));
    })) : h("div", { class: "aviso warn" }, "Todavía no hay tableros disponibles para tu cuenta."));
}

// Un tablero de datos: título, subtítulo, chips de fecha, sello y fuente, y sus bloques. Devuelve la lista de elementos.
// `sello`: "ok" si el archivo cuadra con el sha256 del catálogo; cualquier otro valor = sin sello.
export function tableroView({ titulo, subtitulo, generado, fuente, bloques, sello }) {
  const edad = hace(generado), alas = fechaHora(generado);
  return [
    h("h2", { class: "titulo-tab" }, titulo),
    ...(subtitulo ? [h("p", { class: "sub-tab" }, subtitulo)] : []),
    h("div", { class: "fila-chips" },
      h("span", { class: "chip " + (edad.horas > VIGENCIA_H ? "warn" : "ok"), title: "Hora de la última publicación de este tablero" }, alas ? "Datos al " + alas + " (" + edad.txt + ")" : "Datos de fecha desconocida"),
      h("span", { class: "chip " + (sello === "ok" ? "ok" : "warn"), title: sello === "ok" ? "El archivo cuadra con el sha256 del catálogo" : "El catálogo no trae sha256 para este archivo" }, sello === "ok" ? "Sello verificado" : "Sin sello"),
      fuente ? h("span", { class: "chip" }, "Fuente: " + fuente) : null),
    pintarBloques(bloques),
  ];
}
