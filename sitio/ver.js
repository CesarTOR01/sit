// Ruta de un tablero embebido: baja su HTML con los permisos de la persona y lo muestra en un marco aislado (marco.html).
// El marco usa sandbox="allow-scripts" sin allow-same-origin: el tablero no alcanza el token ni el almacenamiento.
import "./guardia.js";
import { h } from "./comun.js";
import { haySesion, puedeLeerArchivos, cerrarSesion, recordarDestino } from "./auth.js";
import { abrirCatalogo, fuenteHermana, yo, perfil, identidad, textoError, catalogoNoDisponible, AVISO_CATALOGO } from "./graph.js";
import { visiblesParaGerencia, esAdministrador } from "./gerencias.js";
import { carpetaDeEmbebido, nombreDeCarpeta } from "./catalogos.js";
import { sha256, aTexto } from "./fuente.js";
import { CONFIG } from "./config.js";
import { vigilar, cambio, refrescoMin } from "./relectura.js";
import { temaGuardado, temaActual, aplicarTema, alternarTema, conTema, mensajeTema } from "./tema.js";
import { enlacesValidos } from "./enlaces.js";

const $ = id => document.getElementById(id);
const estado = (...hijos) => { $("estado").hidden = false; $("estado").replaceChildren(...hijos); };
const aviso = (txt, clase = "bad") => estado(h("div", { class: "aviso " + clase, role: "alert" }, txt), h("p", {}, h("a", { href: "index.html" }, "Volver a los tableros")));
const mb = n => (n / 1048576).toFixed(1) + " MB";

aplicarTema(temaGuardado());

// Si el navegador restaura la página desde su memoria de navegación (atrás/adelante), se vuelve a cargar: no se muestran copias.
addEventListener("pageshow", e => { if (e.persisted) location.reload(); });

$("salir").addEventListener("click", () => { cerrarSesion(); location.replace("index.html"); });

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
  const id = new URLSearchParams(location.search).get("t");
  if (!id) { aviso("Falta indicar el tablero."); return; }
  if (!haySesion()) { recordarDestino(location.href); location.replace("index.html"); return; }
  if (!puedeLeerArchivos()) { aviso("Tu sesión no tiene autorizada la lectura de archivos para SIT, así que no se puede abrir este tablero."); return; }
  estado(h("p", { class: "sub-tab" }, "Buscando el tablero…"));
  try {
    const fuente = await abrirCatalogo();
    $("salir").hidden = false;
    yo().then(n => { if (n) $("sub").textContent = "Sesión de " + n; }).catch(() => {});
    // sólo los tableros que le tocan a la persona (su entrada del catálogo de acceso o, sin ella, su Departamento): los demás no se abren desde aquí
    const idn = await identidad(fuente, await perfil().catch(() => ({})));
    // `o`: el tablero está en una carpeta hermana de la del enlace; sólo se abre si a la persona le toca esa carpeta (Administrador: cualquiera; otra etiqueta: las de su lista)
    let origen = fuente;
    const o = new URLSearchParams(location.search).get("o");
    if (o !== null) {
      const carpeta = carpetaDeEmbebido({ origen: o, administrador: esAdministrador(idn.etiquetas), configuradas: idn.carpetas, propia: nombreDeCarpeta(fuente.carpeta) });
      origen = carpeta ? fuenteHermana(fuente, carpeta) : null;
      if (!origen) { aviso("Ese tablero no existe o no se muestra en esta página."); return; }
    }
    let cat;
    try { cat = JSON.parse(aTexto(await origen.leer(CONFIG.catalogo))); }
    catch (e) { if (catalogoNoDisponible(e)) { aviso(AVISO_CATALOGO, "warn"); return; } throw e; }
    if (cat.contrato !== "visor/1" || !Array.isArray(cat.tableros)) throw new Error("El catálogo no tiene el formato esperado.");
    const t = visiblesParaGerencia(cat.tableros.filter(x => x && typeof x.id === "string"), idn.gerencia, idn.etiquetas).find(x => x.id === id);
    if (!t || t.tipo !== "embebido" || typeof t.archivo !== "string") { aviso("Ese tablero no existe o no se muestra en esta página."); return; }
    $("titulo").textContent = t.titulo || "SIT";
    document.title = (t.titulo || "Tablero") + " · SIT";
    pintarEnlaces(t);

    let meta = await origen.metadatos(t.archivo).catch(() => null); // para saber después si el archivo cambió
    const barra = h("progress", { max: 1, value: 0 }), texto = h("p", { class: "sub-tab" }, "Descargando…");
    estado(texto, barra);
    const buf = await origen.leer(t.archivo,
      (n, total) => { if (total) { barra.max = total; barra.value = n; texto.textContent = "Descargando " + mb(n) + " de " + mb(total); } else texto.textContent = "Descargando " + mb(n); },
      s => { texto.textContent = "Esperando respuesta del servidor… " + s + " s"; });
    if (t.sha256 && await sha256(buf) !== String(t.sha256).toLowerCase()) { aviso("El archivo no cuadra con su sello (sha256). Puede estar a medio sincronizar: vuelve a intentarlo en unos minutos."); return; }

    mostrar(aTexto(buf));
    // relectura automática: sólo si el archivo cambió (fecha o tamaño) y la pestaña está visible; cada `refresco_min` minutos
    // del catálogo (o el valor por omisión). Si falla se avisa y se reintenta con espera creciente.
    let minutos = refrescoMin(t, CONFIG.releerCadaMin);
    vigilar(async () => {
      try {
        const ahora = await origen.metadatos(t.archivo);
        if (cambio(meta, ahora)) {
          // el catálogo se relee también: trae el sello del archivo nuevo y el refresco vigente
          const c2 = JSON.parse(aTexto(await origen.leer(CONFIG.catalogo)));
          const t2 = (c2.tableros || []).find(x => x && x.id === t.id && typeof x.archivo === "string");
          if (!t2) throw new Error("el tablero ya no está en el catálogo");
          const b2 = await origen.leer(t2.archivo);
          if (t2.sha256 && await sha256(b2) !== String(t2.sha256).toLowerCase()) throw new Error("a medio sincronizar");
          meta = ahora; minutos = refrescoMin(t2, CONFIG.releerCadaMin);
          pintarEnlaces(t2);
          mostrar(aTexto(b2));
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
