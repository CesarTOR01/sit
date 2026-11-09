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
const vistas = leer("../sitio/vistas.js");
igual(/h\("a", \{ href: hrefInicio, class: "inicio", "aria-current": actualId \? null : "page" \}, iconoClave\("casa"\)/.test(vistas), true, "vistas.js: Inicio es activo sólo sin tablero abierto");
igual(/return \[inicio, q, lista\]/.test(vistas), true, "vistas.js: Inicio va primero en el menú, antes de la búsqueda y de los grupos");
igual(/hrefInicio: "#\/"/.test(app), true, "app.js: Inicio apunta a la portada (#/)");
igual(/marcarInicio/.test(app), false, "app.js: ya no queda la lógica del botón del encabezado");
igual(/a\.pastilla \{[^}]*text-decoration: none/.test(css), true, "estilo.css: el enlace de regreso de ver.html se ve como botón");
igual(/nav\.lateral a\.inicio \{/.test(css), true, "estilo.css: Inicio se separa de los grupos");

/* la portada de entrada lleva el nombre del sistema como título */
const landing = leer("../sitio/landing.js");
igual(/h\("h1", \{ class: "landing-titulo" \}, "Sistema de Información Tornel"\)/.test(landing), true, "landing.js: el título de la portada es el nombre del sistema");
igual(/en un solo lugar/.test(landing), false, "landing.js: ya no queda el título anterior");

/* pantallas táctiles: zonas de toque de 44 px en el encabezado y el menú, sin tocar el escritorio */
const tactil = css.slice(css.indexOf("@media (pointer: coarse)"));
igual(tactil.length > 100, true, "estilo.css: hay reglas para pantallas táctiles");
igual(/\.pastilla, nav\.lateral input \{ min-height: 44px; \}/.test(tactil) && /details\.gm > summary \{ min-height: 44px; \}/.test(tactil) && /nav\.lateral \.gm-items a \{[^}]*min-height: 44px/.test(tactil), true, "estilo.css: botones, buscador, renglón de gerencia y tableros miden 44 px al tacto");
igual(/gradient\(|box-shadow|transition:|animation:/i.test(tactil), false, "estilo.css: las reglas táctiles no agregan efectos");

/* menú compacto: reglas del renglón de gerencia, de sus tableros, de la flecha y del foco; sin efectos que el manual prohíbe */
const menuCss = css.slice(css.indexOf("/* menú lateral compacto"));
igual(menuCss.length > 400, true, "estilo.css: está el bloque del menú compacto");
igual(/nav\.lateral details\.gm > summary \{[^}]*min-height: 40px/.test(menuCss), true, "estilo.css: el renglón de gerencia mide al menos 40 px (toque en teléfono)");
igual(/nav\.lateral details\.gm > summary:focus-visible \{/.test(menuCss), true, "estilo.css: el renglón se ve con el teclado");
igual(/nav\.lateral \.gm-items a\[aria-current="page"\] \{/.test(menuCss) && /nav\.lateral \.gm-items \{[^}]*border-left/.test(menuCss), true, "estilo.css: línea guía y tablero activo");
igual(/gradient\(|box-shadow|text-shadow|backdrop|blur\(|@keyframes|animation:|transition:/i.test(menuCss), false, "estilo.css: el menú compacto no lleva degradados, sombras, desenfoques ni animaciones");

/* mapa de gerencias: tarjetas de la misma altura en todas las filas, sólo con dos columnas o más */
const mapaIgual = /@media \(min-width: 608px\) and \(max-width: 860px\), \(min-width: 868px\) \{ \.mapa-gerencias \{ grid-auto-rows: 1fr; \} \}/.test(css);
igual(mapaIgual, true, "estilo.css: las tarjetas del mapa miden lo mismo con dos columnas o más");
igual(/^\.mapa-gerencias \{[^}]*grid-auto-rows/m.test(css), false, "estilo.css: la altura igual no aplica en una sola columna");
igual(/\.mapa-gerencias \{[^}]*repeat\(auto-fill, minmax\(min\(280px, 100%\), 1fr\)\)/.test(css), true, "estilo.css: el ancho de las columnas sigue igual");

console.log(mal ? "FALLARON " + mal + " de " + (ok + mal) : "estilo: " + ok + " de " + ok + " pruebas bien");
process.exit(mal ? 1 : 0);
