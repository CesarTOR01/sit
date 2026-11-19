// Pruebas de la lista desplegable de "Ver como" (sólo Administrador), sin navegador ni red: node pruebas/listaver.prueba.js
// Catálogo de acceso inventado: los correos son de ejemplo y sólo existen aquí para calcular su llave.
import { readFileSync } from "node:fs";
import { hashCorreo, listarPersonas, interpretarAcceso, MAX_LISTA } from "../sitio/acceso.js";
import { opcionesVerComo, identidadPorLlave, identidadComo } from "../sitio/vercomo.js";

let ok = 0, mal = 0;
const igual = (a, b, nombre) => {
  const A = JSON.stringify(a), B = JSON.stringify(b);
  if (A === B) ok++; else { mal++; console.log("FALLA:", nombre, "\n  obtenido:", A, "\n  esperado:", B); }
};
const leer = r => readFileSync(new URL(r, import.meta.url), "utf8");

const L = {
  admin: await hashCorreo("admin@ejemplo.invalid"),
  sub: await hashCorreo("subdirector@ejemplo.invalid"),
  ger: await hashCorreo("gerente@ejemplo.invalid"),
  otra: await hashCorreo("otra@ejemplo.invalid"),
};
const catalogo = (extra = {}) => JSON.stringify({
  contrato: "acceso/1",
  personas: { [L.admin]: ["Administrador", "Dirección"], [L.sub]: ["Comercial", "Subdirección Comercial", "Ventas 2027"], [L.ger]: ["Comercial", "Ventas 2027"], [L.otra]: ["Servicios Corporativos", "Comercial"] },
  carpetas: { Comercial: ["facturacion"], "Subdirección Comercial": ["inventario_pt"], "Ventas 2027": ["ventas_2027"] },
  rotulos: { [L.sub]: "Subdirector comercial", [L.ger]: "Gerente de ventas nacional" },
  ...extra,
});

/* ---- listarPersonas ---- */
{
  const l = listarPersonas(catalogo());
  igual(l.length, 4, "lista las 4 personas del archivo");
  igual(l.map(p => p.llave), [L.admin, L.sub, L.ger, L.otra], "en el orden del archivo");
  igual(l[1], { llave: L.sub, etiquetas: ["Comercial", "Subdirección Comercial", "Ventas 2027"], rotulo: "Subdirector comercial" }, "persona con rótulo");
  igual(l[3].rotulo, null, "persona sin rótulo: null");
}
igual(listarPersonas("no es json"), [], "texto que no es JSON: lista vacía");
igual(listarPersonas(JSON.stringify({ contrato: "acceso/2", personas: {} })), [], "otro contrato: vacía");
igual(listarPersonas(JSON.stringify({ contrato: "acceso/1", personas: [] })), [], "personas como lista: vacía");
igual(listarPersonas(null), [], "null: vacía");
igual(listarPersonas("x".repeat(1024 * 1024 + 1)), [], "archivo mayor al tope: vacía");
igual(listarPersonas(catalogo({ personas: { malo: ["A"], [L.sub]: [] , [L.ger]: ["Ok"], [L.otra]: "texto", [L.admin]: [""] } })).map(p => p.llave), [L.ger], "entradas mal formadas se saltan, las buenas quedan");
igual(listarPersonas(catalogo({ personas: { [L.ger]: Array.from({ length: 21 }, (_, i) => "E" + i) } })), [], "más de 20 etiquetas: se salta");
{
  const muchas = {}; for (let i = 0; i < 300; i++) muchas[i.toString(16).padStart(64, "0")] = ["Comercial"];
  igual(listarPersonas(catalogo({ personas: muchas })).length, MAX_LISTA, "tope de " + MAX_LISTA + " personas");
}
{
  const r = (x) => listarPersonas(catalogo({ rotulos: { [L.sub]: x } })).find(p => p.llave === L.sub).rotulo;
  igual(r("Subdirector comercial"), "Subdirector comercial", "rótulo válido");
  igual(r("  Con espacios  "), "Con espacios", "rótulo con espacios a los lados se recorta");
  igual(r("a".repeat(41)), null, "rótulo de 41 letras se ignora");
  igual(r("a".repeat(40)), "a".repeat(40), "rótulo de 40 letras vale");
  igual(r("<b>x</b>"), null, "rótulo con etiquetas HTML se ignora");
  igual(r("uno" + String.fromCharCode(64) + "dos.com"), null, "rótulo con arroba (parece correo) se ignora");
  igual(r(""), null, "rótulo vacío se ignora");
  igual(r(5), null, "rótulo numérico se ignora");
  igual(r("Línea\nnueva"), null, "rótulo con salto de línea se ignora");
  igual(r("Gerente (Ventas) y/o Nacional"), "Gerente (Ventas) y/o Nacional", "paréntesis y diagonal valen");
}
igual(listarPersonas(catalogo({ rotulos: "texto" })).every(p => p.rotulo === null), true, "rotulos que no es objeto: todos null");
igual(listarPersonas(catalogo({ rotulos: { __proto__: { [L.sub]: "Heredado" } } })).find(p => p.llave === L.sub).rotulo, null, "un rótulo heredado del prototipo no se toma");

/* ---- opcionesVerComo ---- */
{
  const o = opcionesVerComo(catalogo());
  igual(o.length, 3, "sin el Administrador");
  igual(o.map(x => x.texto), ["Gerente de ventas nacional (Comercial, Ventas 2027)", "Sin rótulo (Servicios Corporativos, Comercial)", "Subdirector comercial (Comercial, Subdirección Comercial, Ventas 2027)"], "texto = rótulo y etiquetas, ordenado");
  igual(o.map(x => x.llave).includes(L.admin), false, "el Administrador no está en la lista");
  igual(o.every(x => /^[0-9a-f]{64}$/.test(x.llave)), true, "cada opción lleva su llave");
  igual(JSON.stringify(o).includes("ejemplo.invalid"), false, "ninguna opción lleva correo");
}
igual(opcionesVerComo("no es json"), [], "archivo ilegible: sin opciones");
igual(opcionesVerComo(JSON.stringify({ contrato: "acceso/1", personas: { [L.admin]: ["Administrador"] } })), [], "sólo hay Administrador: sin opciones");

/* ---- identidadPorLlave ---- */
{
  const t = catalogo();
  const sub = identidadPorLlave(t, L.sub);
  igual([sub.etiquetas, sub.carpetas, sub.gerencia.id], [["Comercial", "Subdirección Comercial", "Ventas 2027"], ["facturacion", "inventario_pt", "ventas_2027"], "comercial"], "subdirector: etiquetas, carpetas y gerencia");
  const ger = identidadPorLlave(t, L.ger);
  igual(ger.carpetas, ["facturacion", "ventas_2027"], "gerente: sin inventario");
  igual(identidadPorLlave(t, L.otra).carpetas, ["facturacion"], "persona de Servicios Corporativos: sólo facturación");
  igual(identidadPorLlave(t, L.admin), null, "Administrador: no se encadena");
  igual(identidadPorLlave(t, "a".repeat(64)), null, "llave que no está: null");
  igual(identidadPorLlave(t, "ZZ"), null, "llave mal formada: null");
  igual(identidadPorLlave(t, null), null, "sin llave: null");
  igual(identidadPorLlave("roto", L.sub), null, "archivo roto: null");
  igual(identidadPorLlave(t, L.sub.toUpperCase()), null, "llave en mayúsculas: no vale (las llaves son en minúsculas)");
  // la misma persona por correo (camino anterior) y por llave dan lo mismo
  const porCorreo = await identidadComo(t, "Subdirector@Ejemplo.invalid ", hashCorreo);
  igual(porCorreo, sub, "por correo y por llave: la misma identidad");
  igual(interpretarAcceso(t, L.sub).estado, "entrada", "el catálogo sigue leyéndose como siempre");
}

/* ---- estáticas ---- */
{
  const app = leer("../sitio/app.js"), css = leer("../sitio/estilo.css"), ac = leer("../sitio/acceso.js"), vc = leer("../sitio/vercomo.js");
  const control = app.slice(app.indexOf("function controlVerComo()"), app.indexOf("async function volverAMiVista()"));
  igual(/h\("select"/.test(control) && /id: "vercomo-persona"/.test(control), true, "app.js: el control es una lista desplegable");
  igual(/type: "email"|vercomo-correo|placeholder/.test(control), false, "app.js: ya no hay campo de correo");
  igual(/hashCorreo|identidadComo/.test(app), false, "app.js: no calcula llaves ni recibe correos");
  igual(/identidadPorLlave\(texto, elegida\.llave\)/.test(control), true, "app.js: decide con la llave elegida y el catálogo leído en línea");
  igual(/innerHTML|insertAdjacentHTML|eval\(|localStorage|sessionStorage/.test(control + ac + vc), false, "ni HTML crudo ni almacenamiento en el control, acceso.js y vercomo.js");
  igual(/listaVC = null; listaVCDe = null/.test(app), true, "la lista se olvida al cerrar sesión o cambiar de equipo");
  igual(/\.vercomo select/.test(css) && /\.vercomo select:focus-visible/.test(css), true, "estilo.css: la lista tiene estilo y foco visible");
  igual(/@media \(pointer: coarse\)[^}]*\.vercomo select/.test(css), true, "estilo.css: 44 px de alto en pantallas táctiles");
  igual(/rotulos/.test(ac) && /MAX_ROTULO = 40/.test(ac), true, "acceso.js documenta y limita los rótulos");
}

console.log("listaver: " + ok + " de " + (ok + mal) + " pruebas bien");
process.exit(mal ? 1 : 0);
