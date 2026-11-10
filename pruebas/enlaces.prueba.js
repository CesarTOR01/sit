// Pruebas de los enlaces del catálogo en el encabezado de ver.html, sin navegador: node pruebas/enlaces.prueba.js
// Hosts y títulos inventados.
import { readFileSync } from "node:fs";
import { enlacesValidos, MAX_ENLACES } from "../sitio/enlaces.js";

let ok = 0, mal = 0;
const igual = (a, b, nombre) => {
  const A = JSON.stringify(a), B = JSON.stringify(b);
  if (A === B) ok++; else { mal++; console.log("FALLA:", nombre, "\n  obtenido:", A, "\n  esperado:", B); }
};
const leer = (r) => readFileSync(new URL(r, import.meta.url), "utf8");
const uno = (titulo, url) => enlacesValidos({ enlaces: [{ titulo, url }] });
const nada = (url, nombre) => igual(uno("Acciones", url), [], nombre);
const B = "https://ejemplo.sharepoint.com/";

/* ---- válidos ---- */
igual(uno("Acciones", "https://ejemplo-my.sharepoint.com/personal/lista"), [{ titulo: "Acciones", url: "https://ejemplo-my.sharepoint.com/personal/lista" }], "https a un host ejemplo-my.sharepoint.com");
igual(uno("Lista", "https://Ejemplo.SharePoint.COM/sites/a/Lista"), [{ titulo: "Lista", url: "https://ejemplo.sharepoint.com/sites/a/Lista" }], "host con mayúsculas: se acepta y el href lo normaliza");
const cinco = [1, 2, 3, 4, 5].map(n => ({ titulo: "Enlace " + n, url: B + "x" + n }));
igual(enlacesValidos({ enlaces: cinco }).map(e => e.titulo), ["Enlace 1", "Enlace 2", "Enlace 3", "Enlace 4", "Enlace 5"], "5 enlaces válidos, en su orden");
igual(uno("Puerto", "https://ejemplo.sharepoint.com:443/x"), [{ titulo: "Puerto", url: "https://ejemplo.sharepoint.com/x" }], "puerto 443 explícito: vale y se quita del href");
igual(uno("Consulta", B + "x?a=1&b=dos#parte"), [{ titulo: "Consulta", url: B + "x?a=1&b=dos#parte" }], "con consulta y fragmento");
igual(uno("Espacios", B + "lista con espacio"), [{ titulo: "Espacios", url: B + "lista%20con%20espacio" }], "normalización: se devuelve url.href");
igual(uno("  Acciones  ", B + "x"), [{ titulo: "Acciones", url: B + "x" }], "normalización: el título se recorta");
igual(uno("a".repeat(60), B + "x").length, 1, "título de 60 caracteres: vale");
const larga = B + "a".repeat(2048 - B.length);
igual(larga.length, 2048, "(la URL de prueba mide 2048)");
igual(uno("Larga", larga).length, 1, "URL de 2048 caracteres: vale");

/* ---- protocolo y forma ---- */
nada("http://ejemplo.sharepoint.com/x", "http: se descarta");
nada("javascript:alert(1)", "javascript: se descarta");
nada("JavaScript:alert(1)", "javascript: con mayúsculas se descarta");
nada("data:text/html,<b>x</b>", "data: se descarta");
nada("blob:https://ejemplo.sharepoint.com/123", "blob: se descarta");
nada("//ejemplo.sharepoint.com/x", "//host (sin protocolo) se descarta");
nada("/sites/a/lista", "ruta relativa se descarta");
nada("lista.aspx", "nombre suelto se descarta");
nada("", "URL vacía se descarta");
nada("https://", "https sin host se descarta");

/* ---- host ---- */
nada("https://sharepoint.com/x", "sharepoint.com solo se descarta");
nada("https://ejemplosharepoint.com/x", "ejemplosharepoint.com se descarta");
nada("https://sharepoint.com.otro.com/x", "sharepoint.com.otro.com se descarta");
nada("https://ejemplo.sharepoint.com.otro.com/x", "subdominio de sharepoint.com dentro de otro dominio se descarta");
nada("https://ejemplo.sharepoint.co/x", "otro dominio parecido se descarta");

/* ---- usuario, contraseña y puerto ---- */
nada("https://a@ejemplo.sharepoint.com/x", "con usuario se descarta");
nada("https://a:b@ejemplo.sharepoint.com/x", "con usuario y contraseña se descarta");
nada("https://ejemplo.sharepoint.com:8443/x", "puerto 8443 se descarta");
nada("https://ejemplo.sharepoint.com:80/x", "puerto 80 se descarta");

/* ---- largo ---- */
nada(larga + "a", "URL de 2049 caracteres se descarta");
nada(B + "a".repeat(3000), "URL de más de 2048 se descarta");

/* ---- cuántos ---- */
const seis = [1, 2, 3, 4, 5, 6].map(n => ({ titulo: "Enlace " + n, url: B + "x" + n }));
igual(enlacesValidos({ enlaces: seis }).length, MAX_ENLACES, "6 elementos: sólo 5");
igual(enlacesValidos({ enlaces: seis }).map(e => e.titulo).includes("Enlace 6"), false, "6 elementos: el sexto no entra");
const conMalo = [{ titulo: "", url: B }, ...seis.slice(0, 5)];
igual(enlacesValidos({ enlaces: conMalo }).map(e => e.titulo), ["Enlace 1", "Enlace 2", "Enlace 3", "Enlace 4"], "se miran sólo los primeros 5 del arreglo original (uno malo no deja pasar al sexto)");
igual(enlacesValidos({ enlaces: [{ titulo: "A", url: B + "a" }, { titulo: "B", url: "http://x" }, { titulo: "C", url: B + "c" }] }).map(e => e.titulo), ["A", "C"], "se conservan los válidos en su orden");

/* ---- título ---- */
igual(uno("", B + "x"), [], "título vacío se descarta");
igual(uno("    ", B + "x"), [], "título de puros espacios se descarta");
igual(uno("a".repeat(61), B + "x"), [], "título de 61 caracteres se descarta");
igual(uno(5, B + "x"), [], "título que no es texto (número) se descarta");
igual(uno(null, B + "x"), [], "título null se descarta");
igual(enlacesValidos({ enlaces: [{ url: B + "x" }] }), [], "elemento sin título se descarta");
igual(uno("Acciones", 5), [], "url que no es texto se descarta");
igual(uno("Acciones", { href: B }), [], "url objeto se descarta");

/* ---- el campo y el tablero ---- */
igual(enlacesValidos({ enlaces: { titulo: "A", url: B } }), [], "enlaces que no es arreglo (objeto)");
igual(enlacesValidos({ enlaces: B }), [], "enlaces que no es arreglo (texto)");
igual(enlacesValidos({ enlaces: null }), [], "enlaces null");
igual(enlacesValidos({ id: "x" }), [], "tablero sin el campo");
igual(enlacesValidos(null), [], "tablero null");
igual(enlacesValidos(undefined), [], "tablero undefined");
igual(enlacesValidos("texto"), [], "tablero que no es objeto");
igual(enlacesValidos({ enlaces: [null, "texto", 5, [B], { titulo: "Bueno", url: B + "b" }] }), [{ titulo: "Bueno", url: B + "b" }], "elementos que no son objetos se descartan");
const tramposo = { get titulo() { throw new Error("x"); }, url: B };
let lanzo = false, r = null;
try { r = enlacesValidos({ enlaces: [tramposo, { titulo: "Bueno", url: B + "b" }] }); } catch (_) { lanzo = true; }
igual([lanzo, r], [false, [{ titulo: "Bueno", url: B + "b" }]], "un elemento que lanza al leerse se descarta sin lanzar");
const resultado = enlacesValidos({ enlaces: [{ titulo: "A", url: B + "a", extra: "<b>" }] });
igual(Object.keys(resultado[0]), ["titulo", "url"], "sólo devuelve titulo y url");

/* ---- estático: ver.js pinta los enlaces sin HTML crudo y sigue sin escuchar al marco ---- */
const js = leer("../sitio/ver.js"), html = leer("../sitio/ver.html"), css = leer("../sitio/estilo.css");
igual(/import \{ enlacesValidos \} from "\.\/enlaces\.js"/.test(js), true, "ver.js importa enlacesValidos");
const ayuda = js.slice(js.indexOf("function pintarEnlaces"), js.indexOf("function mostrar"));
igual(ayuda.length > 50, true, "ver.js tiene el helper pintarEnlaces");
igual(/enlacesValidos\(tablero\)/.test(ayuda), true, "el helper sólo pinta lo que deja pasar enlacesValidos");
igual(/target: "_blank"/.test(ayuda) && /rel: "noopener noreferrer"/.test(ayuda), true, "el helper abre en pestaña nueva con noopener noreferrer");
igual(/h\("a", \{ class: "pastilla", href: e\.url,/.test(ayuda) && /\}, e\.titulo\)/.test(ayuda), true, "el href es la URL normalizada y el título entra como texto");
igual(/caja\.replaceChildren\(/.test(ayuda) && /caja\.hidden = lista\.length === 0/.test(ayuda), true, "el helper vacía el contenedor y lo oculta si no hay enlaces");
igual(/innerHTML|insertAdjacentHTML|outerHTML|document\.write/.test(js), false, "ver.js no usa HTML crudo");
igual(/pintarEnlaces\(t\);/.test(js) && /pintarEnlaces\(t2\);/.test(js), true, "ver.js pinta al elegir t y al releer t2");
igual(/addEventListener\("message"/.test(js), false, "ver.js no escucha mensajes del marco");
igual(/allow-popups/.test(js) || /allow-popups/.test(html), false, "sin allow-popups en ver.js ni en ver.html");
igual(/<span class="enlaces-banda" id="enlaces" hidden><\/span>/.test(html), true, "ver.html trae el contenedor #enlaces");
const banda = html.slice(html.indexOf('<div class="banda-in">'), html.indexOf("</header>"));
igual(banda.includes('id="enlaces"'), true, "el contenedor está dentro de .banda-in");
const CSP = "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self' https://login.microsoftonline.com https://graph.microsoft.com https://*.sharepoint.com; frame-src 'self'; base-uri 'none'; form-action 'none'";
igual((/<meta http-equiv="Content-Security-Policy" content="([^"]*)">/.exec(html) || [])[1], CSP, "la CSP de ver.html sigue igual byte por byte");
const reglas = css.split("}").filter(x => /\.enlaces-banda/.test(x));
igual(reglas.some(x => /\.enlaces-banda \{[^]*flex-wrap: wrap/.test(x)), true, "estilo.css: los enlaces se doblan en varias líneas");
igual(reglas.some(x => /\.enlaces-banda\[hidden\] \{ display: none;/.test(x)), true, "estilo.css: el contenedor oculto no se ve aunque sea flex");
igual(reglas.some(x => /#[0-9a-f]{3,8}\b|rgba?\(/i.test(x)), false, "estilo.css: los enlaces no traen colores fijos nuevos");

console.log(mal ? "FALLARON " + mal + " de " + (ok + mal) : "enlaces: " + ok + " de " + ok + " pruebas bien");
process.exit(mal ? 1 : 0);
