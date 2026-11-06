// SIT: inicia sesión con la cuenta de la organización, lee el catálogo y los tableros con los permisos de esa cuenta,
// verifica el sha256 cuando el catálogo lo trae y los pinta. También abre una carpeta local con el mismo formato.
// Formato visor/1:
//   catálogo      { contrato:"visor/1", titulo, subtitulo?, generado, tableros:[{ id, titulo, grupo?, audiencias?:[etiqueta], descripcion?, tipo?:"datos"|"embebido", archivo, sha256?, bytes?, refresco_min? }] }
//                 refresco_min: cada cuántos minutos se revisa este tablero mientras está abierto y visible (1 a 1440; por omisión CONFIG.releerCadaMin)
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
import "./guardia.js";
import { h } from "./comun.js";
import { landing } from "./landing.js";
import { gerenciaDe, visiblesParaGerencia, esAdministrador, GENERAL } from "./gerencias.js";
import { menuLateral, portadaView, tableroView } from "./vistas.js";
import { carpetasALeer, unirCatalogos, nombreDeCarpeta } from "./catalogos.js";
import { FuenteURL, FuenteArchivos, hayCarpeta, elegirCarpeta, carpetaGuardada, olvidarCarpeta, sha256, aTexto } from "./fuente.js";
import { CONFIG } from "./config.js";
import { vigilar, cambio, refrescoMin } from "./relectura.js";
import { procesarRetorno, iniciarSesion, haySesion, cerrarSesion, puedeLeerArchivos, hostDeSesion, sesionBasica } from "./auth.js";
import { abrirCatalogo, fuenteHermana, listarHermanas, perfil, identidad, leerEmblemas, textoError, olvidarEquipo, leerUbicacion, tomarEnlaceDelFragmento, dejarPendiente, hayPendiente, tomarPendiente, hostConocido, configurarDesdeEnlace, mismaUbicacion, catalogoNoDisponible, AVISO_CATALOGO, ErrorGraph } from "./graph.js";

// Lo primero de todo: si la dirección trae el enlace del catálogo (#c=...), se saca de la barra y se deja en espera
// hasta que haya sesión. No se imprime, no se guarda en variables del sitio y se borra al usarlo.
let enlaceInvalido = false;
{ const id = tomarEnlaceDelFragmento(); if (id) dejarPendiente(id); else if (id === null) enlaceInvalido = true; }

const $ = id => document.getElementById(id);
const TITULO_PORTADA = document.title;
let fuente = null, portal = null, actualId = null, archivoCatalogo = "portal.json", usuario = "", gerencia = GENERAL;
// etiquetas: la entrada de la persona en el catálogo de acceso (null = sin entrada: se usa el departamento);
// accesoRoto: el catálogo de acceso existe pero no se pudo usar y se muestra sólo lo general
let etiquetas = null, accesoRoto = false;
// extras: qué carpetas hermanas le tocan a la persona ({ admin, carpetas }, null = sólo la del enlace); hermanas: su fuente por nombre de carpeta
let extras = null;
const hermanas = new Map();
const fuenteDe = t => (t && t.origen && hermanas.get(t.origen)) || fuente;
// emblema oficial de su gerencia, leído de la carpeta `marca` con su cuenta (null = se muestra la ilustración de respaldo)
let emblema = null;

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
async function leerJSON(ruta, esperado, f = fuente) {
  let buf;
  try { buf = await f.leer(ruta); } catch (e) { const err = new Error(textoError(e)); err.origen = e; throw err; }
  let sello = "sin";
  if (esperado) {
    const real = await sha256(buf);
    if (real !== String(esperado).toLowerCase()) throw new Error("El archivo " + ruta + " no cuadra con su sello (sha256). Puede estar a medio sincronizar: espera a que termine la sincronización y vuelve a intentarlo.");
    sello = "ok";
  }
  let datos;
  try { datos = JSON.parse(aTexto(buf)); } catch (e) { throw new Error(ruta + " no es un JSON válido: " + e.message); }
  if (datos.contrato !== "visor/1") throw new Error(ruta + ": contrato " + JSON.stringify(datos.contrato) + " no soportado (el visor lee visor/1).");
  return { datos, sello };
}

const errorConReintento = (mensaje, id) => h("div", {},
  h("div", { class: "aviso bad", role: "alert" }, mensaje),
  h("p", {}, h("button", { class: "boton sec", onclick: () => mostrarTablero(id) }, "Reintentar")));

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
const visibles = ts => fuente && fuente.tipo === "graph" ? visiblesParaGerencia(ts, gerencia, etiquetas) : ts;

// Inicio lleva a la portada (#/); va siempre primero, no lo filtra la búsqueda y se marca activo en la portada
function pintarMenu() {
  $("lateral").replaceChildren(...menuLateral({ tableros: visibles(portal.tableros), actualId, hrefDe, hrefInicio: "#/" }));
}

// silencioso: relectura automática del tablero ya abierto; no muestra "Cargando…", no toca el menú, conserva la posición de
// la página y, si algo falla, deja lo que ya se veía (sólo avisa si el catálogo dejó de estar disponible).
async function mostrarTablero(id, { releer = true, silencioso = false } = {}) {
  const c = $("contenido");
  const y = window.scrollY;
  // cada apertura vuelve a leer el catálogo: mover el catálogo o cambiar permisos surte efecto en la siguiente apertura
  if (releer && fuente && fuente.tipo === "graph") {
    if (!silencioso) c.replaceChildren(h("p", { class: "sub-tab" }, "Cargando…"));
    try { portal = await cargarCatalogo(fuente, archivoCatalogo); }
    catch (e) {
      if (catalogoNoDisponible(e.origen)) { mostrarCatalogoVacio(); return false; }
      if (silencioso) return false;
      c.replaceChildren(errorConReintento(e.message, id)); return false;
    }
  }
  const t = visibles(portal.tableros).find(x => x.id === id);
  actualId = t ? t.id : null;
  if (!silencioso || !t) { pintarMenu(); $("lateral").classList.remove("abierto"); $("menu-btn").setAttribute("aria-expanded", "false"); }
  if (!t) { document.title = TITULO_PORTADA; c.replaceChildren(portadaPortal()); return; }
  if (t.tipo === "embebido") { location.replace(hrefDe(t)); return; }
  if (!silencioso) c.replaceChildren(h("p", { class: "sub-tab" }, "Cargando…"));
  try {
    const { datos, sello } = await leerJSON(t.archivo, t.sha256, fuenteDe(t));
    if (actualId !== t.id) return;
    c.replaceChildren(...tableroView({ titulo: datos.titulo || t.titulo, subtitulo: datos.subtitulo, generado: datos.generado, fuente: datos.fuente, bloques: datos.bloques, sello }));
    document.title = (datos.titulo || t.titulo) + " · SIT";
    if (silencioso) window.scrollTo(0, y);
    ultimaOk = Date.now();
    if (vigilancia) vigilancia.marcar(); // recién leído: la siguiente revisión cuenta desde ahora
  } catch (e) {
    if (silencioso) return false;
    c.replaceChildren(errorConReintento(e.message, id));
    return false;
  }
  if (!silencioso) c.focus({ preventScroll: true });
  return true;
}

// Relectura automática: del tablero de datos abierto, sólo si su archivo cambió (fecha o tamaño), sin bajarlo si no.
// La frescura la fija la última publicación del exportador; esto sólo evita que la pestaña se quede con una copia vieja.
// Cada tablero puede traer su `refresco_min` en el catálogo; si no, vale CONFIG.releerCadaMin. Si la revisión falla se
// avisa (sin tocar lo que se ve) y se reintenta con espera creciente.
let vigilancia = null, ultimaOk = Date.now();
const tableroAbierto = () => portal && actualId ? portal.tableros.find(x => x.id === actualId) : null;
function avisoRelectura(mostrar) {
  let a = document.getElementById("aviso-relectura");
  if (!mostrar) { if (a) a.remove(); return; }
  if (!a) { a = h("div", { class: "aviso warn", id: "aviso-relectura", role: "status" }); $("contenido").prepend(a); }
  const d = new Date(ultimaOk), p = n => String(n).padStart(2, "0");
  a.textContent = "No se pudo actualizar este tablero; se vuelve a intentar solo. Lo que ves se revisó por última vez a las " + p(d.getHours()) + ":" + p(d.getMinutes()) + ".";
}
async function revisarTablero() {
  const t = tableroAbierto();
  if (document.hidden || !t || !fuente || fuente.tipo !== "graph" || t.tipo === "embebido") return true;
  try {
    const ahora = await fuenteDe(t).metadatos(t.archivo);
    if (cambio(t.meta, ahora) && actualId === t.id && !(await mostrarTablero(t.id, { silencioso: true }))) throw new Error("no se pudo leer");
    ultimaOk = Date.now(); avisoRelectura(false);
    return true;
  } catch (_) { avisoRelectura(true); return false; }
}
vigilancia = vigilar(revisarTablero, () => refrescoMin(tableroAbierto(), CONFIG.releerCadaMin));

const portadaPortal = () => portadaView({ portal, tableros: visibles(portal.tableros), hrefDe, graph: !!(fuente && fuente.tipo === "graph"), gerencia, usuario, emblema, accesoRoto });

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
async function cargarCatalogo(f, archivo, conHermanas = true) {
  const { datos } = await leerJSON(archivo, undefined, f);
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
  if (conHermanas && f.tipo === "graph") datos.tableros = unirCatalogos(datos.tableros, await cargarHermanas(f));
  return datos;
}

// Los catálogos de las carpetas hermanas que le tocan a la persona (Administrador: todas las que existen; otra etiqueta: las que su lista nombra).
// Cada una se lee con la cuenta de la persona; la que no se pueda leer se omite sin avisar y el sitio sigue con las demás.
async function cargarHermanas(f) {
  hermanas.clear();
  if (!extras) return [];
  const existentes = extras.admin ? await listarHermanas(f) : [];
  const nombres = carpetasALeer({ administrador: extras.admin, existentes, configuradas: extras.carpetas, propia: nombreDeCarpeta(f.carpeta) });
  const res = await Promise.allSettled(nombres.map(async n => {
    const fh = fuenteHermana(f, n);
    if (!fh) throw new Error("sin carpeta");
    const d = await cargarCatalogo(fh, CONFIG.catalogo, false);
    hermanas.set(n, fh);
    return { carpeta: n, tableros: d.tableros };
  }));
  return res.filter(r => r.status === "fulfilled").map(r => r.value);
}

async function conectar(f, archivo) {
  fuente = f; archivoCatalogo = archivo;
  try { portal = await cargarCatalogo(f, archivo); }
  catch (e) {
    if (f.tipo === "graph" && catalogoNoDisponible(e.origen)) { mostrarCatalogoVacio(); return; }
    fuente = null; mostrarConexion({ aviso: e.message }); return;
  }
  $("conectar").hidden = true; $("marco").hidden = false;
  // en la organización el tablero se relee solo: el botón Actualizar sólo queda para las fuentes locales de prueba
  $("cambiar").hidden = false; $("refrescar").hidden = f.tipo === "graph"; actualizarOlvidar();
  $("cambiar").textContent = f.tipo === "graph" ? "Cerrar sesión" : "Cambiar fuente";
  $("marca").textContent = "SIT";
  $("marca-sub").textContent = f.tipo === "graph" ? (usuario ? "Sesión de " + usuario : "Sesión iniciada") : "Fuente: " + f.nombre;
  $("marca-sub").title = f.tipo === "graph" ? "Carpeta de origen: " + f.host + f.carpeta : "";
  aplicarGerencia();
  await mostrarTablero(ruta(), { releer: false });
}

// Pantalla de confirmación: muestra de dónde vendrán los tableros antes de guardar la carpeta del enlace.
function confirmarUbicacion(nueva, previa) {
  return new Promise(ok => {
    $("marco").hidden = true; $("conectar").hidden = false; $("refrescar").hidden = true;
    document.body.removeAttribute("data-gerencia");
    const fila = (titulo, u) => h("p", {}, h("strong", {}, titulo), h("br"), h("code", { class: "ubicacion" }, u.host + u.carpeta));
    $("conectar").replaceChildren(h("div", { class: "landing" }, h("section", { class: "landing-hero" }, h("div", { class: "landing-texto" },
      h("h1", { class: "landing-titulo" }, previa ? "Este enlace abre otra carpeta" : "Confirma la carpeta de este enlace"),
      h("p", { class: "aviso warn" }, "SIT mostrará los tableros que haya en esa carpeta. Continúa sólo si conoces a quien te mandó el enlace."),
      fila("Carpeta del enlace", nueva),
      previa ? fila("Carpeta que SIT tenía guardada", previa) : null,
      h("div", { class: "acciones" },
        h("button", { class: "boton grande", onclick: () => ok(true) }, "Abrir esta carpeta"),
        h("button", { class: "boton sec grande", onclick: () => ok(false) }, previa ? "Mantener la anterior" : "Cancelar"))))));
  });
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
  usuario = p.nombre || ""; gerencia = gerenciaDe(p.departamento); etiquetas = null; accesoRoto = false; extras = null;
  // primera visita con enlace: se resuelve una vez, se guardan sólo drive y carpeta y el enlace se descarta
  const id = tomarPendiente();
  // un enlace que no abre la carpeta ya guardada se confirma a la vista de la persona, con el dominio y la carpeta de origen
  let aplicar = id;
  if (id && !mismaUbicacion(id, leerUbicacion()) && !(await confirmarUbicacion(id, leerUbicacion()))) {
    aplicar = null;
    if (!leerUbicacion()) {
      mostrarConexion({ aviso: "No se abrió ninguna carpeta. Pide un enlace nuevo si lo necesitas." });
      $("cambiar").hidden = false; $("cambiar").textContent = "Cerrar sesión";
      return;
    }
  }
  if (aplicar) {
    try { await configurarDesdeEnlace(aplicar); }
    catch (e) { mostrarConexion({ aviso: textoError(e) }); $("cambiar").hidden = false; $("cambiar").textContent = "Cerrar sesión"; return; }
  }
  try { fuente = await abrirCatalogo(); }
  catch (e) { mostrarConexion({ aviso: textoError(e) }); $("cambiar").hidden = false; $("cambiar").textContent = "Cerrar sesión"; return; }
  // el catálogo de acceso reemplaza al departamento; si existe y no se puede usar, sólo se muestra lo general
  const idn = await identidad(fuente, p);
  gerencia = idn.gerencia; etiquetas = idn.etiquetas; accesoRoto = idn.accesoRoto;
  if (idn.entrada) extras = { admin: esAdministrador(etiquetas), carpetas: idn.carpetas };
  emblema = gerencia === GENERAL ? null : await leerEmblemas(fuente, gerencia.id);
  await conectar(fuente, CONFIG.catalogo);
}

$("refrescar").addEventListener("click", () => { if (fuente) conectar(fuente, archivoCatalogo); });
$("cambiar").addEventListener("click", async () => {
  if (fuente && fuente.tipo === "graph" || haySesion()) cerrarSesion(); else await olvidarCarpeta();
  fuente = portal = null; actualId = null; usuario = ""; gerencia = GENERAL; etiquetas = null; accesoRoto = false; emblema = null; extras = null; hermanas.clear();
  history.replaceState(null, "", location.pathname); mostrarConexion();
});
// Borra todo lo que SIT guardó en este navegador: la ubicación del catálogo, la sesión y la carpeta local recordada.
$("olvidar").addEventListener("click", async () => {
  olvidarEquipo(); try { await olvidarCarpeta(); } catch (_) { /* sin carpeta guardada */ }
  fuente = portal = null; actualId = null; usuario = ""; gerencia = GENERAL; etiquetas = null; accesoRoto = false; emblema = null; extras = null; hermanas.clear();
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
