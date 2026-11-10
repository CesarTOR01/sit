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

/* ---- menú lateral compacto: un renglón por gerencia ---- */
const menu = vsrc.slice(vsrc.indexOf("export function menuLateral"), vsrc.indexOf("// Portada de Administrador"));
igual(/repartoPorGerencia\(tableros\.filter\(coincide\)\)\.filter\(x => x\.tableros\.length\)/.test(menu), true, "menú: reparto por gerencia, sin gerencias vacías");
igual(/h\("details", \{ class: "gm"/.test(menu) && /h\("summary"/.test(menu), true, "menú: cada gerencia es un details con su summary");
igual(/claveGerencia\(x\.gerencia\.id\)/.test(menu), true, "menú: el renglón lleva el ícono de la gerencia");
igual(/x\.tableros\.some\(t => t\.id === actualId\)/.test(menu) && /reparto\.length === 1/.test(menu) && /f !== ""/.test(menu), true, "menú: abierta la del tablero activo, la única que haya, o todas al buscar");
igual(/if \(d\.open\) for \(const o of detalles\) if \(o !== d && o\.open\) o\.open = false/.test(menu) && /if \(!f\) d\.addEventListener\("toggle"/.test(menu), true, "menú: una gerencia abierta a la vez, salvo al buscar");
igual(/"aria-current": t\.id === actualId \? "page" : null/.test(menu), true, "menú: el tablero activo se marca");
igual(/return \[inicio, q, lista\]/.test(menu) && /Sin coincidencias/.test(menu), true, "menú: Inicio, búsqueda, lista y aviso sin coincidencias");
igual(/localStorage|sessionStorage|innerHTML/.test(menu), false, "menú: no guarda qué estaba abierto ni usa HTML crudo");

/* ---- tableros embebidos de carpetas hermanas: el enlace lleva la carpeta (o) y ver.js la valida ---- */
const verjs = leer("../sitio/ver.js");
igual(/"ver\.html\?t=" \+ encodeURIComponent\(t\.id\) \+ \(t\.origen \? "&o=" \+ encodeURIComponent\(t\.origen\) : ""\)/.test(app), true, "app.js: el enlace de un embebido de hermana lleva &o=<carpeta>, el de la carpeta del enlace no");
igual(/carpetaDeEmbebido\(\{ origen: o, administrador: esAdministrador\(idn\.etiquetas\), configuradas: idn\.carpetas, propia: nombreDeCarpeta\(fuente\.carpeta\) \}\)/.test(verjs), true, "ver.js: la carpeta o se valida con las reglas de la persona");
igual(/origen = carpeta \? fuenteHermana\(fuente, carpeta\) : null/.test(verjs) && /if \(!origen\) \{ aviso\("Ese tablero no existe o no se muestra en esta página\."\); return; \}/.test(verjs), true, "ver.js: una carpeta no válida o que no le toca dice lo mismo que un tablero que no existe");
igual((verjs.match(/origen\.(leer|metadatos)\(/g) || []).length === 7 && !/\bfuente\.(leer|metadatos)\(/.test(verjs), true, "ver.js: catálogo, archivo, metadatos y relectura salen de la carpeta del tablero");

/* ---- lo que no debe entrar a vistas.js: sesión, red, almacenamiento ---- */
const vistas = leer("../sitio/vistas.js");
igual(/fetch\(|localStorage|sessionStorage|innerHTML|insertAdjacentHTML|document\.write/.test(vistas), false, "vistas.js no toca red, almacenamiento ni HTML crudo");
igual(/from "\.\/(auth|graph|fuente)\.js"/.test(vistas), false, "vistas.js no depende de la sesión ni de SharePoint");

console.log(mal ? "FALLARON " + mal + " de " + (ok + mal) : "vistas: " + ok + " de " + ok + " pruebas bien");
process.exit(mal ? 1 : 0);
