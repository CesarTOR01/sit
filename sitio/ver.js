// Ruta de un tablero embebido: baja su HTML con los permisos de la persona y lo muestra en un marco aislado (marco.html).
// El marco usa sandbox="allow-scripts" sin allow-same-origin: el tablero no alcanza el token ni el almacenamiento.
import "./guardia.js";
import { h } from "./comun.js";
import { haySesion, puedeLeerArchivos, cerrarSesion, recordarDestino } from "./auth.js";
import { marcarSalida } from "./reentrada.js";
import { abrirCatalogo, fuenteHermana, perfil, identidad, textoError, catalogoNoDisponible, AVISO_CATALOGO } from "./graph.js";
import { visiblesParaGerencia, esAdministrador } from "./gerencias.js";
import { sha256 } from "./fuente.js";
import { CONFIG } from "./config.js";
import { vigilar, refrescoMin } from "./relectura.js";
import { temaGuardado, temaActual, aplicarTema, alternarTema, conTema, mensajeTema } from "./tema.js";
import { enlacesValidos } from "./enlaces.js";
import { cargarTablero, releerPorCatalogo } from "./carga_tablero.js";
import { resumenTiempos } from "./tiempos.js";

const $ = id => document.getElementById(id);
const estado = (...hijos) => { $("estado").hidden = false; $("estado").replaceChildren(...hijos); };
const aviso = (txt, clase = "bad") => estado(h("div", { class: "aviso " + clase, role: "alert" }, txt), h("p", {}, h("a", { href: "index.html" }, "Volver a los tableros")));
const mb = n => (n / 1048576).toFixed(1) + " MB";

// Marcas de tiempo (ms desde que abrió la página) para ver en qué etapa se va el tiempo; se muestran al terminar la primera carga.
const marcas = [];
const marca = nombre => marcas.push([nombre, Math.round(performance.now())]);
let tiempoMostrado = false;

aplicarTema(temaGuardado());

// Si el navegador restaura la página desde su memoria de navegación (atrás/adelante), se vuelve a cargar: no se muestran copias.
addEventListener("pageshow", e => { if (e.persisted) location.reload(); });

$("salir").addEventListener("click", () => { marcarSalida(); cerrarSesion(); location.replace("index.html"); });

// El tablero corre en marco.html (aislado, con su propia política: lo que el tablero trae en línea no se permite en esta página).
// Le llega como mensaje de texto, igual que el tema: al abrirlo en su etiqueta <html> (conTema) y como aviso al cambiarlo sin recargar.
// El sitio no escucha nada del marco.
const marco = $("marco");
let marcoListo = false, pendiente = null;
const aMarco = msg => { try { marco.contentWindow.postMessage(msg, "*"); } catch (_) { /* el marco aún no está listo */ } };
const avisarTema = () => aMarco(mensajeTema(temaActual()));
const enviar = () => { if (pendiente !== null) { aMarco({ sit: "tablero", html: pendiente }); pendiente = null; } avisarTema(); };
$("tema").addEventListener("click", () => { alternarTema(); avisarTema(); });
marco.addEventListener("load", () => { marcoListo = true; enviar(); });
marco.src = "marco.html"; // después de escuchar su carga, para no perderla

// "2026-10-28" -> "28/10/2026"
const fechaCorta = iso => iso.slice(8, 10) + "/" + iso.slice(5, 7) + "/" + iso.slice(0, 4);

(async () => {
  const consulta = new URLSearchParams(location.search);
  const id = consulta.get("t");
  if (!id) { aviso("Falta indicar el tablero."); return; }
  if (!haySesion()) { recordarDestino(location.href); location.replace("index.html"); return; }
  if (!puedeLeerArchivos()) { aviso("Tu sesión no tiene autorizada la lectura de archivos para SIT, así que no se puede abrir este tablero."); return; }
  estado(h("p", { class: "sub-tab" }, "Buscando el tablero…"));
  try {
    const fuente = await abrirCatalogo();
    $("salir").hidden = false;
    let barra = null, texto = null;
    // el orden de las lecturas (perfil, acceso y catálogo a la vez, archivo), el sello y la compresión los resuelve carga_tablero.js;
    // aquí sólo se pinta lo que va pasando
    const r = await cargarTablero({
      id, o: consulta.get("o"), fuente, rutaCatalogo: CONFIG.catalogo,
      perfil, identidad, fuenteHermana, visiblesParaGerencia, esAdministrador, catalogoNoDisponible, sha256, marca,
      esperar: ms => new Promise(listo => setTimeout(listo, ms)),
      leerArchivo: (origen, ruta) => origen.leer(ruta,
        (n, total) => { if (total) { barra.max = total; barra.value = n; texto.textContent = "Descargando " + mb(n) + " de " + mb(total); } else texto.textContent = "Descargando " + mb(n); },
        s => { texto.textContent = "Esperando respuesta del servidor… " + s + " s"; }),
      ui: {
        perfil: p => { if (p && p.nombre) $("sub").textContent = "Sesión de " + p.nombre; },
        encontrado: t => {
          $("titulo").textContent = t.titulo || "SIT";
          document.title = (t.titulo || "Tablero") + " · SIT";
          pintarEnlaces(t);
          barra = h("progress", { max: 1, value: 0 }); texto = h("p", { class: "sub-tab" }, "Descargando…");
          estado(texto, barra);
        },
        reintento: ({ intento, de }) => { barra.max = 1; barra.value = 0; texto.textContent = "Descargando…"; estado(h("p", { class: "sub-tab" }, "Actualizando el tablero… intento " + intento + " de " + de), texto, barra); },
        cambioRenglon: t => pintarEnlaces(t),
        preparando: () => { texto.textContent = "Preparando el tablero…"; barra.removeAttribute("value"); },
      },
    });
    if (r.estado === "catalogo") { aviso(AVISO_CATALOGO, "warn"); return; }
    if (r.estado === "no_existe") { aviso("Ese tablero no existe o no se muestra en esta página."); return; }
    if (r.estado === "sello") { aviso("El archivo no cuadra con su sello (sha256). Puede estar a medio sincronizar: vuelve a intentarlo en unos minutos."); return; }
    if (r.estado !== "ok") { aviso(r.mensaje); return; }
    const { origen, html } = r;
    let visto = r.t;
    mostrar(html);
    // relectura automática: cada revisión lee el catálogo y compara el renglón del tablero con el que se mostró; sólo si cambió
    // baja el archivo nuevo. Cada `refresco_min` minutos del catálogo (o el valor por omisión), con la pestaña visible.
    // Si falla se avisa y se reintenta con espera creciente.
    let minutos = refrescoMin(visto, CONFIG.releerCadaMin);
    vigilar(async () => {
      try {
        const res = await releerPorCatalogo({ origen, rutaCatalogo: CONFIG.catalogo, visto, sha256 });
        if (res.cambio) {
          const { t: t2, html: html2 } = res;
          visto = t2; minutos = refrescoMin(t2, CONFIG.releerCadaMin);
          pintarEnlaces(t2);
          mostrar(html2);
        }
        $("aviso-relectura").hidden = true;
        return true;
      } catch (_) { $("aviso-relectura").hidden = false; return false; }
    }, () => minutos);
  } catch (e) { aviso(textoError(e)); }
})();

// Enlaces del renglón del catálogo como botones del encabezado: sólo los que deja pasar enlacesValidos (https a *.sharepoint.com),
// con el texto como texto y una pestaña nueva sin acceso a esta página. El tablero no abre ventanas: el enlace lo ofrece el visor.
function pintarEnlaces(tablero) {
  const caja = $("enlaces");
  const lista = enlacesValidos(tablero);
  caja.replaceChildren(...lista.map(e => h("a", { class: "pastilla", href: e.url, target: "_blank", rel: "noopener noreferrer" }, e.titulo)));
  caja.hidden = lista.length === 0;
}

// Pone el HTML del tablero en el marco aislado y lee de su texto el corte y la versión (el marco no deja leerlos desde aquí).
function mostrar(html) {
  if (!tiempoMostrado) {
    tiempoMostrado = true; marca("listo");
    const r = resumenTiempos(marcas);
    if (r) { $("tiempo").textContent = r.texto; $("tiempo").title = r.detalle; $("tiempo").hidden = false; }
  }
  const i = html.indexOf('"snapshotBD":"');
  const corte = i >= 0 ? /^"snapshotBD":"(\d{4}-\d{2}-\d{2})"/.exec(html.slice(i, i + 40)) : null;
  if (corte) { $("corte").textContent = "Corte " + fechaCorta(corte[1]); $("corte").hidden = false; }
  const ver = /Versi[oó]n <b>([^<]{1,40})<\/b>/.exec(html);
  if (ver) { $("version").textContent = ver[1]; $("version").hidden = false; }
  $("estado").hidden = true;
  marco.hidden = false;
  pendiente = conTema(html, temaActual());
  if (marcoListo) enviar();
}
