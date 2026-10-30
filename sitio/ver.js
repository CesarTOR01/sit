// Ruta de un tablero embebido: baja su HTML con los permisos de la persona y lo muestra en un marco aislado.
// El marco usa sandbox="allow-scripts" sin allow-same-origin: el tablero no alcanza el token ni el almacenamiento.
import { h } from "./comun.js";
import { haySesion, puedeLeerArchivos, cerrarSesion, recordarDestino } from "./auth.js";
import { abrirCatalogo, yo, perfil, textoError, catalogoNoDisponible, AVISO_CATALOGO } from "./graph.js";
import { gerenciaDe, visiblesParaGerencia } from "./gerencias.js";
import { sha256, aTexto } from "./fuente.js";
import { CONFIG } from "./config.js";
import { vigilar, cambio, refrescoMin } from "./relectura.js";

const $ = id => document.getElementById(id);
const estado = (...hijos) => { $("estado").hidden = false; $("estado").replaceChildren(...hijos); };
const aviso = (txt, clase = "bad") => estado(h("div", { class: "aviso " + clase, role: "alert" }, txt), h("p", {}, h("a", { href: "index.html" }, "Volver a los tableros")));
const mb = n => (n / 1048576).toFixed(1) + " MB";

try { const t = localStorage.getItem("tema"); if (t) document.documentElement.setAttribute("data-theme", t); } catch (_) { /* sin almacenamiento */ }

// Si el navegador restaura la página desde su memoria de navegación (atrás/adelante), se vuelve a cargar: no se muestran copias.
addEventListener("pageshow", e => { if (e.persisted) location.reload(); });

$("salir").addEventListener("click", () => { cerrarSesion(); location.replace("index.html"); });

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
    let cat;
    try { cat = JSON.parse(aTexto(await fuente.leer(CONFIG.catalogo))); }
    catch (e) { if (catalogoNoDisponible(e)) { aviso(AVISO_CATALOGO, "warn"); return; } throw e; }
    if (cat.contrato !== "visor/1" || !Array.isArray(cat.tableros)) throw new Error("El catálogo no tiene el formato esperado.");
    // sólo los tableros de la gerencia de la persona: los demás no se abren desde aquí
    const gerencia = gerenciaDe((await perfil().catch(() => ({}))).departamento);
    const t = visiblesParaGerencia(cat.tableros.filter(x => x && typeof x.id === "string"), gerencia).find(x => x.id === id);
    if (!t || t.tipo !== "embebido" || typeof t.archivo !== "string") { aviso("Ese tablero no existe o no se muestra en esta página."); return; }
    $("titulo").textContent = t.titulo || "SIT";
    document.title = (t.titulo || "Tablero") + " · SIT";

    let meta = await fuente.metadatos(t.archivo).catch(() => null); // para saber después si el archivo cambió
    const barra = h("progress", { max: 1, value: 0 }), texto = h("p", { class: "sub-tab" }, "Descargando…");
    estado(texto, barra);
    const buf = await fuente.leer(t.archivo,
      (n, total) => { if (total) { barra.max = total; barra.value = n; texto.textContent = "Descargando " + mb(n) + " de " + mb(total); } else texto.textContent = "Descargando " + mb(n); },
      s => { texto.textContent = "Esperando respuesta del servidor… " + s + " s"; });
    if (t.sha256 && await sha256(buf) !== String(t.sha256).toLowerCase()) { aviso("El archivo no cuadra con su sello (sha256). Puede estar a medio sincronizar: vuelve a intentarlo en unos minutos."); return; }

    mostrar(aTexto(buf));
    // relectura automática: sólo si el archivo cambió (fecha o tamaño) y la pestaña está visible; cada `refresco_min` minutos
    // del catálogo (o el valor por omisión). Si falla se avisa y se reintenta con espera creciente.
    let minutos = refrescoMin(t, CONFIG.releerCadaMin);
    vigilar(async () => {
      try {
        const ahora = await fuente.metadatos(t.archivo);
        if (cambio(meta, ahora)) {
          // el catálogo se relee también: trae el sello del archivo nuevo y el refresco vigente
          const c2 = JSON.parse(aTexto(await fuente.leer(CONFIG.catalogo)));
          const t2 = (c2.tableros || []).find(x => x && x.id === t.id && typeof x.archivo === "string");
          if (!t2) throw new Error("el tablero ya no está en el catálogo");
          const b2 = await fuente.leer(t2.archivo);
          if (t2.sha256 && await sha256(b2) !== String(t2.sha256).toLowerCase()) throw new Error("a medio sincronizar");
          meta = ahora; minutos = refrescoMin(t2, CONFIG.releerCadaMin);
          mostrar(aTexto(b2));
        }
        $("aviso-relectura").hidden = true;
        return true;
      } catch (_) { $("aviso-relectura").hidden = false; return false; }
    }, () => minutos);
  } catch (e) { aviso(textoError(e)); }
})();

// Pone el HTML del tablero en el marco aislado y lee de su texto el corte y la versión (el marco no deja leerlos desde aquí).
function mostrar(html) {
  const i = html.indexOf('"snapshotBD":"');
  const corte = i >= 0 ? /^"snapshotBD":"(\d{4}-\d{2}-\d{2})"/.exec(html.slice(i, i + 40)) : null;
  if (corte) { $("corte").textContent = "Corte " + fechaCorta(corte[1]); $("corte").hidden = false; }
  const ver = /Versi[oó]n <b>([^<]{1,40})<\/b>/.exec(html);
  if (ver) { $("version").textContent = ver[1]; $("version").hidden = false; }
  $("estado").hidden = true;
  const marco = $("marco");
  marco.hidden = false;
  marco.srcdoc = html;
}
