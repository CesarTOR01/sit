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

/* el botón Inicio: enlace a la portada (#/), oculto de inicio y sólo visible con un tablero abierto */
const app = leer("../sitio/app.js");
igual(/<a[^>]*id="inicio"[^>]*href="#\/"[^>]*hidden[^>]*>Inicio<\/a>/.test(index) || /<a[^>]*href="#\/"[^>]*id="inicio"[^>]*hidden[^>]*>Inicio<\/a>/.test(index), true, "index.html: enlace Inicio a #/ y oculto de inicio");
igual(/<a[^>]*href="index\.html"[^>]*id="volver"[^>]*>← Inicio<\/a>/.test(ver), true, "ver.html: el botón ← Inicio vuelve a index.html");
igual(/marcarInicio = \(\) => \{ \$\("inicio"\)\.hidden = !\(portal && actualId\); \}/.test(app), true, "app.js: Inicio sólo con portal y tablero abierto");
igual((app.match(/marcarInicio\(\)/g) || []).length >= 2, true, "app.js: se actualiza al abrir tablero y con el catálogo vacío");
igual(/function mostrarConexion[\s\S]{0,200}\$\("inicio"\)\.hidden = true/.test(app), true, "app.js: la pantalla de conexión oculta Inicio");
igual(/a\.pastilla \{[^}]*text-decoration: none/.test(css), true, "estilo.css: el enlace Inicio se ve como los botones");

console.log(mal ? "FALLARON " + mal + " de " + (ok + mal) : "estilo: " + ok + " de " + ok + " pruebas bien");
process.exit(mal ? 1 : 0);
