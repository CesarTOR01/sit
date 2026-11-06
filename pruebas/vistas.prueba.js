// Pruebas de las piezas de pantalla compartidas, sin navegador: node pruebas/vistas.prueba.js
import { readFileSync } from "node:fs";
import { hace, fechaHora, VIGENCIA_H } from "../sitio/vistas.js";

let ok = 0, mal = 0;
const igual = (a, b, nombre) => {
  const A = JSON.stringify(a), B = JSON.stringify(b);
  if (A === B) ok++; else { mal++; console.log("FALLA:", nombre, "\n  obtenido:", A, "\n  esperado:", B); }
};
const leer = (r) => readFileSync(new URL(r, import.meta.url), "utf8");
const antes = h => new Date(Date.now() - h * 36e5).toISOString();

/* ---- hace: texto y horas ---- */
igual(hace(antes(0.2)).txt, "hace menos de 1 h", "menos de una hora");
igual(hace(antes(5)).txt, "hace 5 h", "horas");
igual(hace(antes(47)).txt, "hace 47 h", "justo antes de dos días");
igual(hace(antes(72)).txt, "hace 3 días", "días");
igual(hace("no es fecha").txt, "fecha desconocida", "fecha inválida: texto");
igual(hace("no es fecha").horas, null, "fecha inválida: horas infinitas (JSON las vuelve null)");
igual(Math.round(hace(antes(10)).horas), 10, "horas medidas");

/* ---- fechaHora ---- */
igual(/^\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}$/.test(fechaHora("2026-10-29T14:40:00Z")), true, "formato dd/mm/aaaa hh:mm");
igual(fechaHora("basura"), null, "fecha inválida: null");

igual(VIGENCIA_H, 36, "vigencia de 36 horas");

/* ---- el sitio y la maqueta usan las mismas piezas ---- */
const app = leer("../sitio/app.js");
igual(/import \{ menuLateral, portadaView, tableroView \} from "\.\/vistas\.js"/.test(app), true, "app.js importa las piezas de vistas.js");
igual(/function hace\(|function fechaHora\(/.test(app), false, "app.js ya no repite hace ni fechaHora");
igual(/menuLateral\(\{/.test(app) && /portadaView\(\{/.test(app) && /tableroView\(\{/.test(app), true, "app.js usa menuLateral, portadaView y tableroView");

/* ---- logos en las tarjetas del mapa ---- */
const vsrc = leer("../sitio/vistas.js");
igual(/emblemas && emblemas\[gerencia\.id\] \? emblemaImg\(emblemas\[gerencia\.id\], gerencia, "mapa-emblema"\) : null/.test(vsrc), true, "vistas.js: la tarjeta muestra el logo de su gerencia sólo si hay emblema");
igual(/mapaGerencias\(tableros, hrefDe, emblemas\)/.test(vsrc) && /emblemas = \{\}/.test(vsrc), true, "vistas.js: portadaView recibe los emblemas (vacíos por omisión)");
igual(/emblemas, accesoRoto \}\)/.test(app), true, "app.js: pasa los emblemas leídos a la portada");
igual(/leerEmblemasDe\(f, idsDeGerencias\(\)\)/.test(app) && /if \(admin\)/.test(app), true, "app.js: sólo Administrador lee los emblemas de todas");

/* ---- lo que no debe entrar a vistas.js: sesión, red, almacenamiento ---- */
const vistas = leer("../sitio/vistas.js");
igual(/fetch\(|localStorage|sessionStorage|innerHTML|insertAdjacentHTML|document\.write/.test(vistas), false, "vistas.js no toca red, almacenamiento ni HTML crudo");
igual(/from "\.\/(auth|graph|fuente)\.js"/.test(vistas), false, "vistas.js no depende de la sesión ni de SharePoint");

console.log(mal ? "FALLARON " + mal + " de " + (ok + mal) : "vistas: " + ok + " de " + ok + " pruebas bien");
process.exit(mal ? 1 : 0);
