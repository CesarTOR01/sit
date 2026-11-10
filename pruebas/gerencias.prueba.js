// Pruebas de la identidad por gerencia (ilustración, emblema y acento), sin navegador: node pruebas/gerencias.prueba.js
// Usa un DOM mínimo de juguete: sólo lo que necesitan h() y s() de comun.js.
import { readFileSync } from "node:fs";

let ok = 0, mal = 0;
const igual = (a, b, nombre) => {
  const A = JSON.stringify(a), B = JSON.stringify(b);
  if (A === B) ok++; else { mal++; console.log("FALLA:", nombre, "\n  obtenido:", A, "\n  esperado:", B); }
};

class Nodo {
  constructor(tag, ns) { this.tag = tag; this.ns = ns; this.attrs = {}; this.hijos = []; this.nodeType = 1; }
  setAttribute(k, v) { this.attrs[k] = String(v); }
  getAttribute(k) { return Object.prototype.hasOwnProperty.call(this.attrs, k) ? this.attrs[k] : null; }
  addEventListener() {}
  append(...c) { this.hijos.push(...c); }
}
globalThis.document = {
  createElement: t => new Nodo(t, null),
  createElementNS: (ns, t) => new Nodo(t, ns),
  createTextNode: t => ({ nodeType: 3, texto: String(t) }),
};
const { ilustracion, heroGerencia, todasLasGerencias } = await import("../sitio/gerencias.js");

const firma = n => n.nodeType === 3 ? n.texto : [n.tag, n.attrs, n.hijos.map(firma)];
const recorrer = (n, f) => { if (n.nodeType !== 1) return; f(n); n.hijos.forEach(x => recorrer(x, f)); };
const clases = n => { const s = new Set(); recorrer(n, x => (x.getAttribute("class") || "").split(/\s+/).filter(Boolean).forEach(c => s.add(c))); return s; };
const buscar = (n, f) => { const r = []; recorrer(n, x => { if (f(x)) r.push(x); }); return r; };

const SERV = todasLasGerencias().find(g => g.id === "servicios");

/* ---- ilustración ---- */
const arte = ilustracion("servicios");
igual([arte.tag, arte.getAttribute("viewBox"), arte.getAttribute("class")], ["svg", "0 0 320 180", "g-arte"], "ilustración de servicios: svg 320×180");
igual(arte.hijos.length > 12, true, "ilustración de servicios: lleva sus figuras además de los anillos");
igual(JSON.stringify(firma(arte)) !== JSON.stringify(firma(ilustracion("general"))), true, "ilustración de servicios: no es la general");
igual(JSON.stringify(firma(ilustracion("rrhh"))), JSON.stringify(firma(arte)), "ilustración: rrhh cae en servicios por el alias");
igual(JSON.stringify(firma(ilustracion("sistemas"))), JSON.stringify(firma(arte)), "ilustración: sistemas cae en servicios por el alias");
const dibujo = n => JSON.stringify(n.hijos.map(firma));
igual(dibujo(ilustracion("toString")), dibujo(ilustracion("general")), "ilustración: un nombre heredado usa la general");
igual(dibujo(ilustracion(undefined)), dibujo(ilustracion("general")), "ilustración: sin id usa la general");
igual(ilustracion(undefined).getAttribute("aria-label"), "Ilustración de SIT", "ilustración: sin id, texto de SIT");
igual(buscar(arte, x => x.tag === "circle").length >= 8 && buscar(arte, x => x.tag === "line").length >= 6, true, "ilustración de servicios: personas y red (círculos y enlaces)");

const css = readFileSync(new URL("../sitio/estilo.css", import.meta.url), "utf8");
const definida = c => new RegExp("\\." + c.replace(/[-]/g, "\\-") + "\\s*[{,]").test(css);
igual([...clases(arte)].filter(c => !definida(c)), [], "ilustración de servicios: toda clase que usa está definida en estilo.css");

/* ---- encabezado: con y sin emblema ---- */
const sin = heroGerencia(SERV, "Persona A", null);
igual(sin.getAttribute("data-gerencia"), "servicios", "encabezado: lleva data-gerencia servicios");
igual(buscar(sin, x => x.tag === "h2")[0].hijos.map(firma), ["Servicios Corporativos"], "encabezado: el nombre de la gerencia");
igual(buscar(sin, x => x.getAttribute("class") === "g-arte").length, 1, "sin emblema-servicios.svg: el frente usa la ilustración");
igual(buscar(sin, x => x.tag === "img").length, 0, "sin emblema-servicios.svg: ninguna imagen");
const EMB = { claro: "data:image/svg+xml;base64,PHN2Zy8+", oscuro: null };
const con = heroGerencia(SERV, "Persona A", EMB);
igual(buscar(con, x => x.tag === "img").map(x => x.getAttribute("src")), [EMB.claro, EMB.claro], "con emblema-servicios.svg: el positivo (sin negativo, también en oscuro)");
igual(buscar(con, x => x.getAttribute("class") === "g-arte").length, 0, "con emblema-servicios.svg: no se dibuja la ilustración");
igual(buscar(con, x => x.tag === "img")[0].getAttribute("alt"), "Emblema de Servicios Corporativos", "con emblema: texto alternativo con el nombre");

/* ---- acento: un solo color para servicios, claro y oscuro ---- */
const bloques = [css.slice(css.indexOf(":root {"), css.indexOf("}", css.indexOf(":root {"))),
  css.slice(css.indexOf(':root[data-theme="dark"]'), css.indexOf("}", css.indexOf(':root[data-theme="dark"]'))),
  css.slice(css.indexOf(":root:not([data-theme=\"light\"])"), css.indexOf("}", css.indexOf(":root:not([data-theme=\"light\"])")))];
const token = (b, n) => { const m = new RegExp("--" + n + ":\\s*(#[0-9a-fA-F]{6})").exec(b); return m ? m[1].toLowerCase() : null; };
igual(bloques.map(b => token(b, "acc-servicios")), ["#1e3a8a", "#8ea8ec", "#8ea8ec"], "acento: azul marino en claro y su par claro en los dos bloques oscuros");
igual(/--acc-(rrhh|sistemas)\b/.test(css), false, "acento: ya no hay --acc-rrhh ni --acc-sistemas");
igual(/\[data-gerencia="servicios"\] \{ --acento: var\(--acc-servicios\); \}/.test(css), true, "acento: la regla de servicios");
igual(/\[data-gerencia="(rrhh|sistemas)"\]/.test(css), false, "acento: ya no hay reglas de rrhh ni sistemas");

const lin = v => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
const lum = hx => { const n = parseInt(hx.slice(1), 16); return 0.2126 * lin(n >> 16) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255); };
const contraste = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
const mezcla = (a, b, p) => "#" + [16, 8, 0].map(s => Math.round(((parseInt(a.slice(1), 16) >> s) & 255) * p + ((parseInt(b.slice(1), 16) >> s) & 255) * (1 - p)).toString(16).padStart(2, "0")).join("");
for (const [i, tema] of [[0, "claro"], [1, "oscuro"]]) {
  const acc = token(bloques[i], "acc-servicios"), tarjeta = token(bloques[i], "tarjeta"), fondo = token(bloques[i], "fondo");
  igual(contraste(acc, tarjeta) >= 4.5, true, "acento " + tema + ": al menos 4.5:1 contra la tarjeta (texto)");
  igual(contraste(acc, fondo) >= 4.5, true, "acento " + tema + ": al menos 4.5:1 contra el fondo de la página");
  igual(contraste(acc, mezcla(acc, tarjeta, 0.14)) >= 3, true, "acento " + tema + ": al menos 3:1 sobre su propio tinte (encabezado y menú)");
}

console.log(mal ? "FALLARON " + mal + " de " + (ok + mal) : "gerencias: " + ok + " de " + ok + " pruebas bien");
process.exit(mal ? 1 : 0);
