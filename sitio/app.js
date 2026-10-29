// SIT: inicia sesión con la cuenta de la organización, lee el catálogo y los tableros con los permisos de esa cuenta,
// verifica el sha256 cuando el catálogo lo trae y los pinta. También abre una carpeta local con el mismo formato.
// Formato visor/1:
//   catálogo      { contrato:"visor/1", titulo, subtitulo?, generado, tableros:[{ id, titulo, grupo?, descripcion?, tipo?:"datos"|"embebido", archivo, sha256?, bytes? }] }
//                 (en la organización se llama como CONFIG.catalogo; en una carpeta local, portal.json; `archivo` es relativo a su carpeta)
//   tablero datos { contrato:"visor/1", id, titulo, subtitulo?, generado, fuente?, bloques:[ … ] }
//   tablero embebido: un HTML completo sin red, que se muestra en un marco aislado (ver.html)
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
import { landing } from "./landing.js";
import { gerenciaDe, visiblesParaGerencia, heroGerencia, GENERAL } from "./gerencias.js";
import { pintarBloques } from "./bloques.js";
import { FuenteURL, FuenteArchivos, hayCarpeta, elegirCarpeta, carpetaGuardada, olvidarCarpeta, sha256, aTexto } from "./fuente.js";
import { CONFIG } from "./config.js";
import { procesarRetorno, iniciarSesion, haySesion, cerrarSesion, puedeLeerArchivos, hostDeSesion, sesionBasica } from "./auth.js";
import { abrirCatalogo, perfil, textoError, olvidarEquipo, leerUbicacion, tomarEnlaceDelFragmento, dejarPendiente, hayPendiente, tomarPendiente, hostConocido, configurarDesdeEnlace, catalogoNoDisponible, AVISO_CATALOGO, ErrorGraph } from "./graph.js";

// Lo primero de todo: si la dirección trae el enlace del catálogo (#c=...), se saca de la barra y se deja en espera
// hasta que haya sesión. No se imprime, no se guarda en variables del sitio y se borra al usarlo.
let enlaceInvalido = false;
{ const id = tomarEnlaceDelFragmento(); if (id) dejarPendiente(id); else if (id === null) enlaceInvalido = true; }

const $ = id => document.getElementById(id);
const VIGENCIA_H = 36;
let fuente = null, portal = null, actualId = null, archivoCatalogo = "portal.json", usuario = "", gerencia = GENERAL;

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
  let buf;
  try { buf = await fuente.leer(ruta); } catch (e) { const err = new Error(textoError(e)); err.origen = e; throw err; }
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

const hrefDe = t => t.tipo === "embebido" ? "ver.html?t=" + encodeURIComponent(t.id) : "#/" + encodeURIComponent(t.id);

/* ---------- pantallas ---------- */
const actualizarOlvidar = () => { $("olvidar").hidden = !(leerUbicacion() || haySesion() || hayPendiente()); };

function mostrarConexion({ aviso = null, pendiente = null, ofrecerBasico = false, info = null } = {}) {
  $("marco").hidden = true; $("conectar").hidden = false;
  $("refrescar").hidden = $("cambiar").hidden = true;
  actualizarOlvidar();
  $("marca").textContent = "SIT"; $("marca-sub").textContent = "Sistema de Información Tornel";
  const url = h("input", { type: "url", id: "url", placeholder: "http://localhost:8000/carpeta/", "aria-label": "Dirección base" });
  const porURL = () => { try { conectar(new FuenteURL(url.value.trim()), "portal.json"); } catch (e) { mostrarConexion({ aviso: e.message }); } };
  const locales = [];
  if (pendiente) locales.push(h("div", { class: "opcion" }, h("h4", {}, "Reconectar “" + pendiente.nombre + "”"), h("p", {}, "Es la carpeta que usaste la última vez. El navegador pide tu permiso otra vez para leerla."),
    h("button", { class: "boton", onclick: async () => { const f = await pendiente.pendiente(); if (f) conectar(f, "portal.json"); } }, "Dar permiso y abrir")));
  if (hayCarpeta()) locales.push(h("div", { class: "opcion" }, h("h4", {}, "Carpeta local"), h("p", {}, "Elige una carpeta con ", h("code", {}, "portal.json"), " y los archivos de sus tableros. El navegador sólo la lee y la recuerda."),
    h("button", { class: "boton sec", onclick: async () => { try { conectar(await elegirCarpeta(), "portal.json"); } catch (e) { if (e.name !== "AbortError") mostrarConexion({ aviso: e.message }); } } }, "Elegir carpeta")));
  locales.push(h("div", { class: "opcion" }, h("h4", {}, "Archivos sueltos"), h("p", {}, "Selecciona ", h("code", {}, "portal.json"), " y los archivos de los tableros (o la carpeta completa)."),
    h("label", { class: "boton sec bloque" }, "Elegir archivos", h("input", { type: "file", multiple: true, accept: ".json,application/json", hidden: true, onchange: e => e.target.files.length && conectar(new FuenteArchivos(e.target.files), "portal.json") })), " ",
    h("label", { class: "boton sec bloque" }, "Elegir carpeta", h("input", { type: "file", webkitdirectory: true, hidden: true, onchange: e => e.target.files.length && conectar(new FuenteArchivos(e.target.files), "portal.json") }))));
  if (["localhost", "127.0.0.1"].includes(location.hostname)) locales.push(h("div", { class: "opcion" }, h("h4", {}, "Dirección local"), h("p", {}, "Una dirección en este equipo que sirva ", h("code", {}, "portal.json"), "."), url, h("button", { class: "boton sec", onclick: porURL }, "Conectar")));
  document.body.removeAttribute("data-gerencia");
  $("conectar").replaceChildren(landing({ aviso, info, ofrecerBasico, entrar: () => iniciarSesion({ host: hostConocido() }), entrarBasico: () => iniciarSesion({ basico: true }), extras: ["localhost", "127.0.0.1"].includes(location.hostname) ? locales : [] }));
}

// El frente de la persona toma el acento y la imagen de su gerencia (la del departamento de su perfil).
function aplicarGerencia() {
  if (fuente && fuente.tipo === "graph") document.body.setAttribute("data-gerencia", gerencia.id); else document.body.removeAttribute("data-gerencia");
}
// Los tableros del grupo de su gerencia van primero.
const visibles = ts => fuente && fuente.tipo === "graph" ? visiblesParaGerencia(ts, gerencia) : ts;

function pintarMenu() {
  const q = h("input", { type: "search", placeholder: "Buscar tablero…", "aria-label": "Buscar tablero" });
  const lista = h("div");
  const grupos = () => {
    const f = q.value.trim().toLowerCase(), por = new Map();
    for (const t of visibles(portal.tableros)) {
      if (f && !(t.titulo + " " + (t.grupo || "") + " " + (t.descripcion || "")).toLowerCase().includes(f)) continue;
      const g = t.grupo || "Tableros"; if (!por.has(g)) por.set(g, []); por.get(g).push(t);
    }
    lista.replaceChildren(...[...por].flatMap(([g, ts]) => [h("h2", {}, g), ...ts.map(t => h("a", { href: hrefDe(t), "aria-current": t.id === actualId ? "page" : null, title: t.descripcion || null }, t.titulo))]));
    if (!por.size) lista.replaceChildren(h("p", { class: "sub-tab relleno" }, "Sin coincidencias."));
  };
  q.addEventListener("input", grupos);
  $("lateral").replaceChildren(q, lista);
  grupos();
}

async function mostrarTablero(id, { releer = true } = {}) {
  const c = $("contenido");
  // cada apertura vuelve a leer el catálogo: mover el catálogo o cambiar permisos surte efecto en la siguiente apertura
  if (releer && fuente && fuente.tipo === "graph") {
    c.replaceChildren(h("p", { class: "sub-tab" }, "Cargando…"));
    try { portal = await cargarCatalogo(fuente, archivoCatalogo); }
    catch (e) {
      if (catalogoNoDisponible(e.origen)) { mostrarCatalogoVacio(); return; }
      c.replaceChildren(h("div", { class: "aviso bad", role: "alert" }, e.message)); return;
    }
  }
  const t = visibles(portal.tableros).find(x => x.id === id);
  actualId = t ? t.id : null;
  pintarMenu(); $("lateral").classList.remove("abierto"); $("menu-btn").setAttribute("aria-expanded", "false");
  if (!t) { c.replaceChildren(portadaPortal()); return; }
  if (t.tipo === "embebido") { location.replace(hrefDe(t)); return; }
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
        h("span", { class: "chip " + (sello === "ok" ? "ok" : "warn"), title: sello === "ok" ? "El archivo cuadra con el sha256 del catálogo" : "El catálogo no trae sha256 para este archivo" }, sello === "ok" ? "Sello verificado" : "Sin sello"),
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
  const graph = fuente && fuente.tipo === "graph";
  return h("div", {},
    graph ? heroGerencia(gerencia, usuario) : h("h2", { class: "titulo-tab" }, portal.titulo || "SIT"),
    !graph && portal.subtitulo ? h("p", { class: "sub-tab" }, portal.subtitulo) : null,
    graph ? h("h3", { class: "tus-tableros" }, "Tus tableros") : null,
    h("div", { class: "fila-chips" }, h("span", { class: "chip " + (edad.horas > VIGENCIA_H ? "warn" : "ok") }, "Publicado " + edad.txt), h("span", { class: "chip" }, visibles(portal.tableros).length + (visibles(portal.tableros).length === 1 ? " tablero" : " tableros"))),
    visibles(portal.tableros).length ? h("div", { class: "kpis" }, visibles(portal.tableros).map(t => {
      const m = t.meta && t.meta.modificado ? hace(t.meta.modificado) : null;
      return h("a", { class: "kpi enlace", href: hrefDe(t) },
        h("div", { class: "et" }, t.grupo || "Tableros"), h("div", { class: "val chico" }, t.titulo),
        h("div", { class: "pie" }, t.descripcion ? h("span", {}, t.descripcion) : null, m ? h("span", {}, "Archivo actualizado " + m.txt) : null));
    })) : h("div", { class: "aviso warn" }, "Todavía no hay tableros disponibles para tu cuenta."));
}

function ruta() { const m = location.hash.match(/^#\/(.+)$/); return m ? decodeURIComponent(m[1]) : null; }

// El catálogo ya no está donde se guardó: menú vacío y un aviso neutro, nada más (ni dónde estaba ni por qué).
function mostrarCatalogoVacio() {
  portal = null; actualId = null;
  $("conectar").hidden = true; $("marco").hidden = false;
  $("refrescar").hidden = true; $("cambiar").hidden = false; $("cambiar").textContent = "Cerrar sesión"; actualizarOlvidar();
  $("marca").textContent = "SIT"; $("marca-sub").textContent = usuario ? "Sesión de " + usuario : "Sesión iniciada";
  $("lateral").replaceChildren(); aplicarGerencia();
  $("contenido").replaceChildren(h("div", { class: "aviso warn", role: "alert" }, AVISO_CATALOGO));
}

// Lee el catálogo EN LÍNEA (nunca de una copia) y, en la organización, deja sólo los tableros cuyo archivo esta
// persona puede leer en este momento. Se llama al conectar y cada vez que se abre un tablero.
async function cargarCatalogo(f, archivo) {
  const { datos } = await leerJSON(archivo);
  if (!Array.isArray(datos.tableros)) throw new Error("El catálogo no trae la lista “tableros”.");
  const ids = new Set();
  for (const t of datos.tableros) {
    if (!t || typeof t.id !== "string" || typeof t.archivo !== "string" || typeof t.titulo !== "string") throw new Error("El catálogo: cada tablero necesita id, titulo y archivo.");
    if (ids.has(t.id)) throw new Error("El catálogo: el id “" + t.id + "” está repetido.");
    ids.add(t.id);
  }
  if (f.tipo === "graph") {
    const res = await Promise.allSettled(datos.tableros.map(t => f.metadatos(t.archivo)));
    const duro = res.find(r => r.status === "rejected" && ["red", "sin-sesion"].includes(r.reason.codigo));
    if (duro) throw new Error(textoError(duro.reason));
    datos.tableros = datos.tableros.filter((t, i) => res[i].status === "fulfilled" && (t.meta = res[i].value));
  }
  return datos;
}

async function conectar(f, archivo) {
  fuente = f; archivoCatalogo = archivo;
  try { portal = await cargarCatalogo(f, archivo); }
  catch (e) {
    if (f.tipo === "graph" && catalogoNoDisponible(e.origen)) { mostrarCatalogoVacio(); return; }
    fuente = null; mostrarConexion({ aviso: e.message }); return;
  }
  $("conectar").hidden = true; $("marco").hidden = false;
  $("refrescar").hidden = $("cambiar").hidden = false; actualizarOlvidar();
  $("cambiar").textContent = f.tipo === "graph" ? "Cerrar sesión" : "Cambiar fuente";
  $("marca").textContent = "SIT";
  $("marca-sub").textContent = f.tipo === "graph" ? (usuario ? "Sesión de " + usuario : "Sesión iniciada") : "Fuente: " + f.nombre;
  aplicarGerencia();
  await mostrarTablero(ruta(), { releer: false });
}

async function conectarSesion() {
  const dominio = hostConocido();
  // la sesión se abrió para otro dominio de SharePoint (o sin lectura de archivos): se pide entrar de nuevo con el del catálogo
  if (dominio && !sesionBasica() && hostDeSesion() !== dominio) {
    mostrarConexion({ info: "Para abrir SIT con este enlace, inicia sesión con tu cuenta de la organización." });
    $("cambiar").hidden = false; $("cambiar").textContent = "Cerrar sesión";
    return;
  }
  if (!dominio && !puedeLeerArchivos() && !sesionBasica()) {
    mostrarConexion({ aviso: textoError(new ErrorGraph("sin-ubicacion", "")) });
    $("cambiar").hidden = false; $("cambiar").textContent = "Cerrar sesión";
    return;
  }
  if (!puedeLeerArchivos()) {
    mostrarConexion({ aviso: "Entraste con tu perfil, pero SIT todavía no tiene autorizada la lectura de archivos para tu cuenta. No hay tableros que mostrar hasta que esté autorizada.", ofrecerBasico: false });
    $("cambiar").hidden = false; $("cambiar").textContent = "Cerrar sesión";
    return;
  }
  const p = await perfil().catch(() => ({}));
  usuario = p.nombre || ""; gerencia = gerenciaDe(p.departamento);
  // primera visita con enlace: se resuelve una vez, se guardan sólo drive y carpeta y el enlace se descarta
  const id = tomarPendiente();
  if (id) {
    try { await configurarDesdeEnlace(id); }
    catch (e) { mostrarConexion({ aviso: textoError(e) }); $("cambiar").hidden = false; $("cambiar").textContent = "Cerrar sesión"; return; }
  }
  try { fuente = await abrirCatalogo(); }
  catch (e) { mostrarConexion({ aviso: textoError(e) }); $("cambiar").hidden = false; $("cambiar").textContent = "Cerrar sesión"; return; }
  await conectar(fuente, CONFIG.catalogo);
}

$("refrescar").addEventListener("click", () => { if (fuente) conectar(fuente, archivoCatalogo); });
$("cambiar").addEventListener("click", async () => {
  if (fuente && fuente.tipo === "graph" || haySesion()) cerrarSesion(); else await olvidarCarpeta();
  fuente = portal = null; actualId = null; usuario = ""; gerencia = GENERAL;
  history.replaceState(null, "", location.pathname); mostrarConexion();
});
// Borra todo lo que SIT guardó en este navegador: la ubicación del catálogo, la sesión y la carpeta local recordada.
$("olvidar").addEventListener("click", async () => {
  olvidarEquipo(); try { await olvidarCarpeta(); } catch (_) { /* sin carpeta guardada */ }
  fuente = portal = null; actualId = null; usuario = ""; gerencia = GENERAL;
  history.replaceState(null, "", location.pathname); mostrarConexion({ info: "Este equipo quedó olvidado. Para volver a abrir SIT necesitas el enlace del catálogo." });
});
addEventListener("hashchange", () => { if (portal) mostrarTablero(ruta()); });
// Si el navegador restaura la página desde su memoria de navegación (atrás/adelante), se vuelve a cargar: no se muestran copias.
addEventListener("pageshow", e => { if (e.persisted) location.reload(); });

/* ---------- arranque ---------- */
(async () => {
  if (enlaceInvalido && !haySesion()) { mostrarConexion({ aviso: "El enlace no es válido; pide uno nuevo." }); return; }
  const ret = await procesarRetorno();
  if (ret && ret.error) { mostrarConexion({ aviso: textoError(ret.error), ofrecerBasico: ret.error.codigo === "consentimiento" && !ret.basicoIntentado }); return; }
  if (ret && ret.volver) {
    const u = new URL(ret.volver, location.href);
    if (u.origin === location.origin && u.pathname !== location.pathname) { location.replace(u.href); return; }
    if (u.hash) history.replaceState(null, "", location.pathname + u.hash);
  }
  const base = new URLSearchParams(location.search).get("fuente");
  if (base && ["localhost", "127.0.0.1"].includes(location.hostname)) { try { await conectar(new FuenteURL(base), "portal.json"); } catch (e) { mostrarConexion({ aviso: e.message }); } return; }
  if (haySesion()) { await conectarSesion(); return; }
  if (hayPendiente()) { mostrarConexion({ info: "Para abrir SIT con este enlace, inicia sesión con tu cuenta de la organización." }); return; }
  let guardada = null;
  try { guardada = await carpetaGuardada(); } catch (_) { /* sin carpeta guardada */ }
  if (guardada && guardada.fuente) await conectar(guardada.fuente, "portal.json");
  else mostrarConexion({ pendiente: guardada });
})();
