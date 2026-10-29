// SIT: lee portal.json (el menú) y un JSON por tablero de la fuente conectada, verifica su sha256 y los pinta.
// Formato visor/1:
//   portal.json   { contrato:"visor/1", titulo, subtitulo?, generado, tableros:[{ id, titulo, grupo?, descripcion?, archivo, sha256?, bytes? }] }
//   <tablero>.json{ contrato:"visor/1", id, titulo, subtitulo?, generado, fuente?, bloques:[ … ] }
// Bloques:
//   kpis   { tipo, titulo?, texto?, total?:{etiqueta, valor, formato, unidad?, franjas:[{hasta, estado, etiqueta?}]},
//            items:[{ etiqueta, valor|null, formato, unidad?, meta?, aceptable?, sentido?:"mayor"|"menor", estado?,
//                     comparacion?:{etiqueta, valor}, nota?, detalle?:[{etiqueta, valor|null, meta?, formato?, unidad?}] }] }
//   linea | barras  { tipo, titulo, formato, unidad?, x:[…], series:[{ nombre, valores:[número|null] }] }
//   tabla  { tipo, titulo, columnas:[{ id, titulo, formato?, unidad? }], filas:[[…]] }
//   texto  { tipo, titulo?, texto }
// formato: moneda, moneda_abrev, entero, decimal, pct (fracción: 0.91 = 91%), dias, piezas, fecha, texto, estado (sólo en tabla).
// estado: ok | warn | bad | na. null = “NA”: no es 0 y no entra en barras ni en cálculos.
import { h } from "./comun.js";
import { pintarBloques } from "./bloques.js";
import { FuenteURL, FuenteArchivos, hayCarpeta, elegirCarpeta, carpetaGuardada, olvidarCarpeta, sha256, aTexto } from "./fuente.js";

const $ = id => document.getElementById(id);
const VIGENCIA_H = 36;
let fuente = null, portal = null, actualId = null;

/* ---------- tema ---------- */
function tema(t) {
  if (t) document.documentElement.setAttribute("data-theme", t); else document.documentElement.removeAttribute("data-theme");
}
try { tema(localStorage.getItem("tema")); } catch (_) { /* sin almacenamiento */ }
$("tema").addEventListener("click", () => {
  const oscuro = document.documentElement.getAttribute("data-theme") === "dark" || (!document.documentElement.getAttribute("data-theme") && matchMedia("(prefers-color-scheme: dark)").matches);
  const n = oscuro ? "light" : "dark";
  tema(n);
  try { localStorage.setItem("tema", n); } catch (_) { /* sin almacenamiento */ }
});
$("menu-btn").addEventListener("click", () => { const a = $("lateral").classList.toggle("abierto"); $("menu-btn").setAttribute("aria-expanded", a); });

/* ---------- lectura con control ---------- */
async function leerJSON(ruta, esperado) {
  const buf = await fuente.leer(ruta);
  let sello = "sin";
  if (esperado) {
    const real = await sha256(buf);
    if (real !== String(esperado).toLowerCase()) throw new Error("El archivo " + ruta + " no cuadra con su sello (sha256). Puede estar a medio sincronizar: espera a que termine la sincronización y pulsa Actualizar.");
    sello = "ok";
  }
  let datos;
  try { datos = JSON.parse(aTexto(buf)); } catch (e) { throw new Error(ruta + " no es un JSON válido: " + e.message); }
  if (datos.contrato !== "visor/1") throw new Error(ruta + ": contrato " + JSON.stringify(datos.contrato) + " no soportado (el visor lee visor/1).");
  return { datos, sello };
}

function hace(iso) {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return { txt: "fecha desconocida", horas: Infinity };
  const hrs = (Date.now() - t) / 36e5;
  return { horas: hrs, txt: hrs < 1 ? "hace menos de 1 h" : hrs < 48 ? "hace " + Math.round(hrs) + " h" : "hace " + Math.round(hrs / 24) + " días" };
}

/* ---------- pantallas ---------- */
function mostrarConexion(aviso, pendiente) {
  $("marco").hidden = true; $("conectar").hidden = false;
  $("refrescar").hidden = $("cambiar").hidden = true;
  $("marca").textContent = "SIT"; $("marca-sub").textContent = "Sistema de Información Tornel";
  const url = h("input", { type: "url", id: "url", placeholder: "https://…/carpeta-del-portal/", "aria-label": "Dirección base" });
  const porURL = () => { try { conectar(new FuenteURL(url.value.trim())); } catch (e) { mostrarConexion(e.message); } };
  const opciones = [];
  if (pendiente) opciones.push(h("div", { class: "opcion" }, h("h4", {}, "Reconectar “" + pendiente.nombre + "”"), h("p", {}, "Es la carpeta que usaste la última vez. El navegador pide tu permiso otra vez para leerla."),
    h("button", { class: "boton", onclick: async () => { const f = await pendiente.pendiente(); if (f) conectar(f); } }, "Dar permiso y abrir")));
  if (hayCarpeta()) opciones.push(h("div", { class: "opcion" }, h("h4", {}, "Carpeta de datos (recomendado)"), h("p", {}, "Elige la carpeta del portal sincronizada en tu equipo, la que contiene ", h("code", {}, "portal.json"), ". El navegador sólo la lee y la recuerda."),
    h("button", { class: "boton", onclick: async () => { try { conectar(await elegirCarpeta()); } catch (e) { if (e.name !== "AbortError") mostrarConexion(e.message); } } }, "Elegir carpeta")));
  opciones.push(h("div", { class: "opcion" }, h("h4", {}, hayCarpeta() ? "Elegir los archivos uno por uno" : "Elegir la carpeta o los archivos"), h("p", {}, "Selecciona ", h("code", {}, "portal.json"), " y los archivos de los tableros (o la carpeta completa)."),
    h("label", { class: "boton sec bloque" }, "Elegir archivos", h("input", { type: "file", multiple: true, accept: ".json,application/json", hidden: true, onchange: e => e.target.files.length && conectar(new FuenteArchivos(e.target.files)) })), " ",
    h("label", { class: "boton sec bloque" }, "Elegir carpeta", h("input", { type: "file", webkitdirectory: true, hidden: true, onchange: e => e.target.files.length && conectar(new FuenteArchivos(e.target.files)) }))));
  opciones.push(h("div", { class: "opcion" }, h("h4", {}, "Dirección web"), h("p", {}, "Una dirección base que sirva ", h("code", {}, "portal.json"), " y permita leerlo desde esta página (CORS)."), url,
    h("button", { class: "boton sec", onclick: porURL }, "Conectar")));
  $("conectar").replaceChildren(
    h("section", { class: "tarjeta" }, h("h2", { class: "sin-margen" }, "Conecta la fuente de datos"),
      h("p", {}, "Esta página es sólo el visor: no lleva cifras ni tableros de la empresa. Los lee de una carpeta con tus permisos y los verifica antes de mostrarlos."),
      aviso ? h("div", { class: "aviso bad", role: "alert" }, aviso) : null, ...opciones));
}

function pintarMenu() {
  const q = h("input", { type: "search", placeholder: "Buscar tablero…", "aria-label": "Buscar tablero" });
  const lista = h("div");
  const grupos = () => {
    const f = q.value.trim().toLowerCase(), por = new Map();
    for (const t of portal.tableros) {
      if (f && !(t.titulo + " " + (t.grupo || "") + " " + (t.descripcion || "")).toLowerCase().includes(f)) continue;
      const g = t.grupo || "Tableros"; if (!por.has(g)) por.set(g, []); por.get(g).push(t);
    }
    lista.replaceChildren(...[...por].flatMap(([g, ts]) => [h("h2", {}, g), ...ts.map(t => h("a", { href: "#/" + encodeURIComponent(t.id), "aria-current": t.id === actualId ? "page" : null, title: t.descripcion || null }, t.titulo))]));
    if (!por.size) lista.replaceChildren(h("p", { class: "sub-tab relleno" }, "Sin coincidencias."));
  };
  q.addEventListener("input", grupos);
  $("lateral").replaceChildren(q, lista);
  grupos();
}

async function mostrarTablero(id) {
  const t = portal.tableros.find(x => x.id === id);
  actualId = t ? t.id : null;
  pintarMenu(); $("lateral").classList.remove("abierto"); $("menu-btn").setAttribute("aria-expanded", "false");
  const c = $("contenido");
  if (!t) { c.replaceChildren(portadaPortal()); return; }
  c.replaceChildren(h("p", { class: "sub-tab" }, "Cargando…"));
  try {
    const { datos, sello } = await leerJSON(t.archivo, t.sha256);
    if (actualId !== t.id) return;
    const edad = hace(datos.generado);
    c.replaceChildren(
      h("h2", { class: "titulo-tab" }, datos.titulo || t.titulo),
      datos.subtitulo ? h("p", { class: "sub-tab" }, datos.subtitulo) : null,
      h("div", { class: "fila-chips" },
        h("span", { class: "chip " + (edad.horas > VIGENCIA_H ? "warn" : "ok") }, "Datos de " + edad.txt),
        h("span", { class: "chip " + (sello === "ok" ? "ok" : "warn"), title: sello === "ok" ? "El archivo cuadra con el sha256 de portal.json" : "portal.json no trae sha256 para este archivo" }, sello === "ok" ? "Sello verificado" : "Sin sello"),
        datos.fuente ? h("span", { class: "chip" }, "Fuente: " + datos.fuente) : null),
      pintarBloques(datos.bloques));
    document.title = (datos.titulo || t.titulo) + " · SIT";
  } catch (e) {
    c.replaceChildren(h("div", { class: "aviso bad", role: "alert" }, e.message));
  }
  c.focus({ preventScroll: true });
}

function portadaPortal() {
  const edad = hace(portal.generado);
  return h("div", {},
    h("h2", { class: "titulo-tab" }, portal.titulo || "SIT"),
    portal.subtitulo ? h("p", { class: "sub-tab" }, portal.subtitulo) : null,
    h("div", { class: "fila-chips" }, h("span", { class: "chip " + (edad.horas > VIGENCIA_H ? "warn" : "ok") }, "Publicado " + edad.txt), h("span", { class: "chip" }, portal.tableros.length + " tableros")),
    h("div", { class: "kpis" }, portal.tableros.map(t => h("a", { class: "kpi enlace", href: "#/" + encodeURIComponent(t.id) },
      h("div", { class: "et" }, t.grupo || "Tableros"), h("div", { class: "val chico" }, t.titulo), h("div", { class: "pie" }, t.descripcion || "")))));
}

function ruta() { const m = location.hash.match(/^#\/(.+)$/); return m ? decodeURIComponent(m[1]) : null; }

async function conectar(f) {
  fuente = f;
  try {
    const { datos } = await leerJSON("portal.json");
    if (!Array.isArray(datos.tableros)) throw new Error("portal.json no trae la lista “tableros”.");
    const ids = new Set();
    for (const t of datos.tableros) {
      if (!t || typeof t.id !== "string" || typeof t.archivo !== "string" || typeof t.titulo !== "string") throw new Error("portal.json: cada tablero necesita id, titulo y archivo.");
      if (ids.has(t.id)) throw new Error("portal.json: el id “" + t.id + "” está repetido.");
      ids.add(t.id);
    }
    portal = datos;
  } catch (e) { fuente = null; mostrarConexion(e.message); return; }
  $("conectar").hidden = true; $("marco").hidden = false;
  $("refrescar").hidden = $("cambiar").hidden = false;
  $("marca").textContent = portal.titulo || "SIT";
  $("marca-sub").textContent = "Fuente: " + fuente.nombre;
  await mostrarTablero(ruta());
}

$("refrescar").addEventListener("click", () => conectar(fuente));
$("cambiar").addEventListener("click", async () => { await olvidarCarpeta(); fuente = portal = null; actualId = null; history.replaceState(null, "", location.pathname + location.search); mostrarConexion(); });
addEventListener("hashchange", () => { if (portal) mostrarTablero(ruta()); });

/* ---------- arranque ---------- */
(async () => {
  const base = new URLSearchParams(location.search).get("fuente");
  if (base) { try { await conectar(new FuenteURL(base)); } catch (e) { mostrarConexion(e.message); } return; }
  let guardada = null;
  try { guardada = await carpetaGuardada(); } catch (_) { /* sin carpeta guardada */ }
  if (guardada && guardada.fuente) await conectar(guardada.fuente);
  else mostrarConexion(null, guardada);
})();
