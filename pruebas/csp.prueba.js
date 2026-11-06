// Pruebas de la política de contenido (CSP) de ver.html y del relevo marco.html, sin navegador: node pruebas/csp.prueba.js
import { readFileSync } from "node:fs";

let ok = 0, mal = 0;
const igual = (a, b, nombre) => {
  const A = JSON.stringify(a), B = JSON.stringify(b);
  if (A === B) ok++; else { mal++; console.log("FALLA:", nombre, "\n  obtenido:", A, "\n  esperado:", B); }
};
const leer = (r) => readFileSync(new URL(r, import.meta.url), "utf8");
const csp = html => { const m = /<meta http-equiv="Content-Security-Policy" content="([^"]*)"/.exec(html); return m ? m[1] : ""; };
const directiva = (p, nombre) => { const d = p.split(";").map(s => s.trim()).find(s => s.startsWith(nombre + " ")); return d ? d.slice(nombre.length + 1).split(/\s+/) : null; };

const ver = leer("../sitio/ver.html"), index = leer("../sitio/index.html"), marco = leer("../sitio/marco.html"), js = leer("../sitio/ver.js");
const pVer = csp(ver), pIndex = csp(index), pMarco = csp(marco);

/* ---- ver.html (aquí vive la sesión): sin nada en línea ---- */
igual(/unsafe-inline|unsafe-eval/.test(pVer), false, "ver.html: ni 'unsafe-inline' ni 'unsafe-eval'");
igual(directiva(pVer, "script-src"), ["'self'"], "ver.html: script-src sólo 'self'");
igual(directiva(pVer, "style-src"), ["'self'"], "ver.html: style-src sólo 'self'");
igual(directiva(pVer, "frame-src"), ["'self'"], "ver.html: el marco sólo puede ser de este sitio");
igual(directiva(pVer, "default-src"), ["'self'"], "ver.html: default-src 'self'");
igual(directiva(pVer, "base-uri"), ["'none'"], "ver.html: base-uri 'none'");
igual(directiva(pVer, "connect-src"), directiva(pIndex, "connect-src"), "ver.html: mismas salidas de red que index.html");
igual(directiva(pVer, "script-src"), directiva(pIndex, "script-src"), "ver.html y index.html: misma política de scripts");
igual(/<script(?![^>]*\bsrc=)[^>]*>/.test(ver) || /\son[a-z]+\s*=|\sstyle\s*=/.test(ver), false, "ver.html: sin script, manejador ni style en línea");
igual(/<style[\s>]/.test(ver), false, "ver.html: sin bloque style");

/* ---- el marco: sandbox sin allow-same-origin y sin dirección fija hasta que ver.js se la pone ---- */
igual(/<iframe[^>]*id="marco"[^>]*sandbox="allow-scripts"/.test(ver) && !/allow-same-origin/.test(ver), true, "ver.html: el marco sigue aislado (sandbox allow-scripts)");
igual(/<iframe[^>]*id="marco"[^>]*\ssrc=/.test(ver), false, "ver.html: la dirección del marco la pone ver.js tras escuchar su carga");
igual(/marco\.src = "marco\.html"/.test(js) && js.indexOf('marco.addEventListener("load"') < js.indexOf('marco.src = "marco.html"'), true, "ver.js: primero escucha la carga del marco y luego le pone la dirección");

/* ---- marco.html: sin red, sin datos, con su propia política ---- */
igual(directiva(pMarco, "default-src"), ["'none'"], "marco.html: nada permitido por omisión (sin red)");
igual(directiva(pMarco, "script-src"), ["'unsafe-inline'"], "marco.html: sólo lo en línea (lo que traen los tableros)");
igual(/connect-src|frame-src|'self'|https?:/.test(pMarco), false, "marco.html: sin conexiones, sin sitio propio, sin direcciones");
igual(/fetch\(|XMLHttpRequest|WebSocket|localStorage|sessionStorage|indexedDB|eval\(|new Function|importScripts/.test(marco), false, "marco.html: no toca red ni almacenamiento");
igual(/<script[^>]*\ssrc=|<link[^>]*href=|@import/.test(marco), false, "marco.html: no carga nada de afuera");
igual(/if \(e\.source !== parent\) return/.test(marco) && /if \(parent === window\) return/.test(marco), true, "marco.html: sólo escucha a la página que lo contiene y solo no hace nada");
igual(/d\.sit === "tablero" && typeof d\.html === "string"/.test(marco) && /limpio\(d\.tema\)/.test(marco) && /t === "dark" \|\| t === "light" \? t : null/.test(marco), true, "marco.html: sólo reenvía el tablero (texto) y el tema light, dark o null");
const marcoInterno = (/<iframe id="t"[^>]*>/.exec(marco) || [""])[0];
igual(/sandbox="allow-scripts"/.test(marcoInterno) && !/allow-same-origin|allow-top-navigation|allow-popups|allow-forms/.test(marcoInterno), true, "marco.html: el tablero va en otro marco aislado, sin permisos de más");

/* ---- ver.js: manda texto y no escucha nada del marco ---- */
igual(/addEventListener\("message"/.test(js), false, "ver.js: no escucha mensajes del marco");
igual(/aMarco\(\{ sit: "tablero", html: pendiente \}\)/.test(js), true, "ver.js: al marco le manda {sit, html}");
igual(/\.srcdoc\b/.test(js), false, "ver.js: ya no usa srcdoc (heredaría la política de esta página)");
const i = js.indexOf("sha256(buf)"), j = js.indexOf("mostrar(aTexto(buf))");
igual(i > 0 && j > i, true, "ver.js: el sello se comprueba antes de mandar el tablero");
igual(/innerHTML|insertAdjacentHTML|document\.write|\beval\(/.test(js), false, "ver.js: sin HTML crudo ni eval");

console.log(mal ? "FALLARON " + mal + " de " + (ok + mal) : "csp: " + ok + " de " + ok + " pruebas bien");
process.exit(mal ? 1 : 0);
