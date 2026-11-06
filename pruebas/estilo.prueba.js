// Pruebas del estilo, sin navegador: node pruebas/estilo.prueba.js
import { readFileSync } from "node:fs";

let ok = 0, mal = 0;
const igual = (a, b, nombre) => {
  const A = JSON.stringify(a), B = JSON.stringify(b);
  if (A === B) ok++; else { mal++; console.log("FALLA:", nombre, "\n  obtenido:", A, "\n  esperado:", B); }
};
const leer = (r) => readFileSync(new URL(r, import.meta.url), "utf8");

const css = leer("../sitio/estilo.css");
const index = leer("../sitio/index.html");
const ver = leer("../sitio/ver.html");

/* el id "marco" lo llevan el contenedor de index.html y el iframe de ver.html: el fondo blanco es sólo del iframe */
igual(/<(div|main|section)[^>]*id="marco"/.test(index), true, "index.html: el contenedor lleva id marco");
igual(/<iframe[^>]*id="marco"/.test(ver), true, "ver.html: el iframe lleva id marco");
const reglas = css.split("}").filter(r => /#marco\b/.test(r));
igual(reglas.length > 0, true, "hay regla para #marco");
igual(reglas.every(r => /iframe#marco/.test(r)), true, "toda regla de #marco apunta sólo al iframe");
igual(reglas.filter(r => /background:\s*#fff/.test(r)).every(r => /iframe#marco/.test(r)), true, "el fondo blanco no alcanza al contenedor");

/* Inicio vive en el menú lateral: primer elemento, enlace a la portada (#/), activo sólo en la portada; el encabezado ya no lo lleva */
const app = leer("../sitio/app.js");
igual(/id="inicio"/.test(index), false, "index.html: el encabezado ya no trae el botón Inicio");
igual(/<a[^>]*href="index\.html"[^>]*id="volver"[^>]*>← Inicio<\/a>/.test(ver), true, "ver.html: el botón ← Inicio vuelve a index.html");
igual(/h\("a", \{ href: "#\/", class: "inicio", "aria-current": actualId \? null : "page" \}, iconoClave\("casa"\)/.test(app), true, "app.js: Inicio apunta a #/ y es activo sólo sin tablero abierto");
igual(/replaceChildren\(inicio, q, lista\)/.test(app), true, "app.js: Inicio va primero en el menú, antes de la búsqueda y de los grupos");
igual(/marcarInicio/.test(app), false, "app.js: ya no queda la lógica del botón del encabezado");
igual(/a\.pastilla \{[^}]*text-decoration: none/.test(css), true, "estilo.css: el enlace de regreso de ver.html se ve como botón");
igual(/nav\.lateral a\.inicio \{/.test(css), true, "estilo.css: Inicio se separa de los grupos");

console.log(mal ? "FALLARON " + mal + " de " + (ok + mal) : "estilo: " + ok + " de " + ok + " pruebas bien");
process.exit(mal ? 1 : 0);
