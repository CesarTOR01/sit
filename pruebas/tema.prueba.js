// Pruebas del tema y de su paso al tablero embebido, sin navegador: node pruebas/tema.prueba.js
import { readFileSync } from "node:fs";
import { conTema, mensajeTema, temaGuardado, guardarTema } from "../sitio/tema.js";

let ok = 0, mal = 0;
const igual = (a, b, nombre) => {
  const A = JSON.stringify(a), B = JSON.stringify(b);
  if (A === B) ok++; else { mal++; console.log("FALLA:", nombre, "\n  obtenido:", A, "\n  esperado:", B); }
};
const leer = (r) => readFileSync(new URL(r, import.meta.url), "utf8");

/* ---- conTema: data-theme en la primera etiqueta <html> ---- */
igual(conTema('<!doctype html><html lang="es"><head></head></html>', "dark"), '<!doctype html><html lang="es" data-theme="dark"><head></head></html>', "se agrega a la etiqueta con atributos");
igual(conTema("<html><body></body></html>", "light"), '<html data-theme="light"><body></body></html>', "se agrega a una etiqueta sin atributos");
igual(conTema('<html lang="es" data-theme="light"><body></body></html>', "dark"), '<html lang="es" data-theme="dark"><body></body></html>', "reemplaza el que ya traía");
igual(conTema('<html data-theme="dark" lang="es">', null), '<html lang="es">', "sin elección lo quita (sigue al sistema)");
igual(conTema('<HTML LANG="es">', "dark"), '<HTML LANG="es" data-theme="dark">', "sin importar mayúsculas");
igual(conTema("<div>sin etiqueta html</div>", "dark"), "<div>sin etiqueta html</div>", "sin etiqueta html queda igual");
igual(conTema('<html lang="es">', "azul"), '<html lang="es">', "un tema que no es light ni dark es el del sistema");
igual(conTema('<html lang="es">', undefined), '<html lang="es">', "tema indefinido: el del sistema");
igual(conTema('<html lang="es"><script>const a = "<html lang=x>";</script></html>', "dark"), '<html lang="es" data-theme="dark"><script>const a = "<html lang=x>";</script></html>', "sólo cambia la primera etiqueta");
igual(conTema("<htmlx>", "dark"), "<htmlx>", "<htmlx> no es la etiqueta html");
igual(conTema('<html lang="es"/>', "dark"), '<html lang="es" data-theme="dark"/>', "etiqueta que cierra sola");
const largo = '<!doctype html><html lang="es"><body>' + "x".repeat(13 * 1048576) + "</body></html>";
const t0 = Date.now();
const r = conTema(largo, "dark");
igual(r.length - largo.length, ' data-theme="dark"'.length, "13 MB: sólo crece lo que se agrega");
igual(Date.now() - t0 < 200, true, "13 MB: menos de 200 ms");
igual(r.endsWith("</body></html>") && r.slice(0, 60) === conTema(largo.slice(0, 200), "dark").slice(0, 60), true, "13 MB: el resto queda intacto");

/* ---- mensajeTema: sólo texto del tema ---- */
igual(mensajeTema("dark"), { sit: "tema", tema: "dark" }, "mensaje: oscuro");
igual(mensajeTema("light"), { sit: "tema", tema: "light" }, "mensaje: claro");
igual(mensajeTema(null), { sit: "tema", tema: null }, "mensaje: sistema");
igual(mensajeTema("<script>"), { sit: "tema", tema: null }, "mensaje: lo que no es un tema no pasa");
igual(Object.keys(mensajeTema("dark")), ["sit", "tema"], "mensaje: sólo dos campos");

/* ---- almacenamiento (simulado): sin almacenamiento no falla ---- */
igual(temaGuardado(), null, "sin localStorage: null, no falla");
guardarTema("dark"); // sin localStorage no lanza
globalThis.localStorage = { _: {}, getItem(k) { return k in this._ ? this._[k] : null; }, setItem(k, v) { this._[k] = String(v); } };
igual(temaGuardado(), null, "nada guardado: null");
guardarTema("dark");
igual(temaGuardado(), "dark", "guardado: dark");
globalThis.localStorage.setItem("tema", "otra cosa");
igual(temaGuardado(), null, "un valor raro guardado se ignora");

/* ---- cómo lo usan el sitio y el visor ---- */
const ver = leer("../sitio/ver.js"), verHtml = leer("../sitio/ver.html"), app = leer("../sitio/app.js"), fuenteTema = leer("../sitio/tema.js");
igual(/marco\.srcdoc = conTema\(html, temaActual\(\)\)/.test(ver), true, "ver.js: el tablero se muestra con el tema puesto en su etiqueta html");
igual(/contentWindow\.postMessage\(mensajeTema\(temaActual\(\)\), "\*"\)/.test(ver), true, "ver.js: avisa al marco sólo con mensajeTema");
igual(/marco\.addEventListener\("load", avisarTema\)/.test(ver) && /\$\("tema"\)\.addEventListener\("click", \(\) => \{ alternarTema\(\); avisarTema\(\); \}\)/.test(ver), true, "ver.js: avisa al cargar el marco y al cambiar el tema");
igual(/addEventListener\("message"/.test(ver), false, "ver.js: no escucha nada del marco");
igual(/\beval\(|new Function|innerHTML|insertAdjacentHTML|document\.write/.test(ver + fuenteTema), false, "ver.js y tema.js: ni eval ni HTML crudo");
const i = ver.indexOf("sha256(buf)"), j = ver.indexOf("mostrar(aTexto(buf))");
igual(i > 0 && j > i, true, "ver.js: el sello se comprueba antes de poner el tema");
igual(/const corte = .*snapshotBD/.test(ver) && ver.indexOf("conTema(html") > ver.indexOf("snapshotBD"), true, "ver.js: el corte y la versión se leen del texto original");
igual(/<button[^>]*id="tema"[^>]*aria-label=/.test(verHtml), true, "ver.html: botón Tema con su etiqueta");
igual(/<iframe[^>]*sandbox="allow-scripts"/.test(verHtml) && !/allow-same-origin/.test(verHtml), true, "ver.html: el marco sigue aislado");
igual(/from "\.\/tema\.js"/.test(app) && /from "\.\/tema\.js"/.test(ver), true, "app.js y ver.js usan tema.js");
igual(/localStorage/.test(app) && /getItem\("tema"\)/.test(app), false, "app.js ya no maneja el tema por su cuenta");
igual(/fetch\(|XMLHttpRequest|sessionStorage/.test(fuenteTema), false, "tema.js no toca la red");

console.log(mal ? "FALLARON " + mal + " de " + (ok + mal) : "tema: " + ok + " de " + ok + " pruebas bien");
process.exit(mal ? 1 : 0);
