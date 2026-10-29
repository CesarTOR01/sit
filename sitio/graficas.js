// Gráficas de línea y de barras agrupadas en SVG, sin librerías: cruz guía y tooltip con todas las series,
// leyenda, y vista de tabla con los mismos valores.
import { h, s, fmt, abreviado, esNumero } from "./comun.js";

const L = 70, R = 14, T = 14, B = 32;

function escala(lo, hi, n = 5) {
  if (lo === hi) { hi = lo + 1; }
  const paso0 = (hi - lo) / n, mag = Math.pow(10, Math.floor(Math.log10(paso0))), e = paso0 / mag;
  const paso = mag * (e <= 1 ? 1 : e <= 2 ? 2 : e <= 5 ? 5 : 10);
  const a = Math.floor(lo / paso) * paso, b = Math.ceil(hi / paso) * paso, marcas = [];
  for (let v = a; v <= b + paso / 2; v += paso) marcas.push(Math.abs(v) < paso / 1e6 ? 0 : v);
  return { a, b, marcas };
}

const color = i => `var(--s${(i % 8) + 1})`;

// Se dibuja al ancho real del contenedor (1 unidad = 1 px) para que el texto conserve su tamaño en tarjetas angostas.
export function grafica(b, tipo) {
  const series = (b.series || []).filter(x => Array.isArray(x.valores));
  const x = Array.isArray(b.x) ? b.x.map(String) : [];
  if (!x.length || !series.some(sr => sr.valores.some(esNumero))) return h("p", { class: "sub-tab" }, "Sin datos para graficar.");

  const lienzo = h("div", { class: "graf-caja" });
  const tabla = vistaTabla(b, x, series);
  tabla.hidden = true;
  const alterna = h("button", { class: "boton sec chico", "aria-pressed": "false", onclick: () => {
    tabla.hidden = !tabla.hidden; lienzo.hidden = !tabla.hidden;
    alterna.setAttribute("aria-pressed", String(!tabla.hidden)); alterna.textContent = tabla.hidden ? "Ver tabla" : "Ver gráfica";
  } }, "Ver tabla");
  const ley = series.length > 1
    ? h("div", { class: "leyenda" }, series.map((sr, k) => h("span", {}, h("i", { class: "c" + ((k % 8) + 1) + (tipo === "linea" ? " linea" : "") }), sr.nombre || "serie " + (k + 1)))) : null;

  let ancho = 0;
  new ResizeObserver(es => {
    const w = Math.round(es[0].contentRect.width);
    if (w > 0 && Math.abs(w - ancho) > 8) { ancho = w; lienzo.replaceChildren(construir(b, tipo, Math.max(280, w), x, series)); }
  }).observe(lienzo);
  return h("div", { class: "graf-marco" }, lienzo, tabla, h("div", { class: "graf-pie" }, ley, alterna));
}

function vistaTabla(b, x, series) {
  return h("div", { class: "tabla-caja" }, h("table", {},
    h("thead", {}, h("tr", {}, h("th", { scope: "col" }, ""), series.map(sr => h("th", { class: "num", scope: "col" }, sr.nombre || "")))),
    h("tbody", {}, x.map((et, i) => h("tr", {}, h("th", { scope: "row" }, et), series.map(sr => h("td", { class: "num" }, fmt(sr.valores[i], b.formato, b.unidad))))))));
}

function construir(b, tipo, W, x, series) {
  const H = Math.round(Math.min(360, Math.max(240, W * 0.45)));
  const valores = series.flatMap(sr => sr.valores.filter(esNumero));
  const moneda = b.formato === "moneda" || b.formato === "moneda_abrev";
  const lo = tipo === "barras" ? Math.min(0, ...valores) : Math.min(...valores);
  const hi = Math.max(tipo === "barras" ? 0 : -Infinity, ...valores);
  const esc = escala(tipo === "barras" ? lo : lo - (hi - lo) * 0.05, hi + (hi - lo || Math.abs(hi) || 1) * 0.05);
  const paso = (W - L - R) / x.length;
  const px = i => L + (x.length === 1 ? (W - L - R) / 2 : (i + .5) * paso);
  const py = v => T + (esc.b - v) * (H - T - B) / (esc.b - esc.a);
  const svg = s("svg", { class: "graf", width: W, height: H, viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": (b.titulo || "gráfica") + ". Hay una vista de tabla con los mismos valores." });

  for (const m of esc.marcas) {
    svg.append(s("line", { class: m === 0 ? "cero" : "rej", x1: L, x2: W - R, y1: py(m), y2: py(m) }));
    svg.append(s("text", { x: L - 6, y: py(m) + 4, "text-anchor": "end" }, abreviado(m, moneda)));
  }
  const cada = Math.max(1, Math.ceil(x.length / Math.max(1, Math.floor((W - L - R) / 64))));
  x.forEach((et, i) => { if (i % cada === 0) svg.append(s("text", { x: px(i), y: H - 11, "text-anchor": "middle" }, et)); });

  // la cruz guía o la banda de la columna activa va debajo de las marcas
  const guia = s("rect", { class: "guia", y: T, height: H - T - B, width: tipo === "barras" ? paso : 1, x: 0, visibility: "hidden" });
  svg.append(guia);

  if (tipo === "barras") {
    const grupo = paso * 0.74, bw = grupo / series.length;
    series.forEach((sr, k) => sr.valores.forEach((v, i) => {
      if (!esNumero(v)) return;
      const y0 = py(Math.max(v, 0)), y1 = py(Math.min(v, 0));
      svg.append(s("rect", { class: "barra", x: px(i) - grupo / 2 + k * bw + 1, y: y0, width: Math.max(1, bw - 2), height: Math.max(1, y1 - y0), rx: 3, fill: color(k) }));
    }));
  } else {
    series.forEach((sr, k) => {
      let d = "", abierto = false;
      sr.valores.forEach((v, i) => { if (!esNumero(v)) { abierto = false; return; } d += (abierto ? "L" : "M") + px(i).toFixed(1) + " " + py(v).toFixed(1); abierto = true; });
      svg.append(s("path", { d, fill: "none", stroke: color(k), "stroke-width": 2, "stroke-linejoin": "round", "stroke-linecap": "round" }));
      sr.valores.forEach((v, i) => { if (esNumero(v)) svg.append(s("circle", { class: "punto", cx: px(i), cy: py(v), r: 4, fill: color(k), visibility: "hidden", "data-i": i })); });
    });
  }

  // tooltip: una sola lectura con todas las series en esa X
  const tip = h("div", { class: "tip", role: "status", hidden: true });
  const caja = h("div", { class: "graf-rel" }, svg, tip);
  function mostrar(i) {
    const cx = px(i);
    guia.setAttribute("visibility", "visible"); puntos(i);
    guia.setAttribute("x", tipo === "barras" ? cx - paso / 2 : cx - .5);
    tip.replaceChildren(h("div", { class: "tip-x" }, x[i]), ...series.map((sr, k) => h("div", { class: "tip-fila" },
      h("i", { class: "c" + ((k % 8) + 1) + " linea" }), h("strong", {}, fmt(sr.valores[i], b.formato, b.unidad)), h("span", {}, sr.nombre || ""))));
    tip.hidden = false;
    const ancho = tip.offsetWidth, alto = tip.offsetHeight;
    tip.style.left = Math.max(0, Math.min(W - ancho, cx + 12 + ancho > W ? cx - ancho - 12 : cx + 12)) + "px";
    tip.style.top = Math.max(0, Math.min(H - alto, T + 8)) + "px";
  }
  // los puntos sólo aparecen en la posición bajo el puntero o el foco
  function puntos(i) { svg.querySelectorAll(".punto").forEach(p => p.setAttribute("visibility", Number(p.getAttribute("data-i")) === i ? "visible" : "hidden")); }
  function ocultar() { guia.setAttribute("visibility", "hidden"); tip.hidden = true; puntos(-1); }
  x.forEach((et, i) => {
    const zona = s("rect", { class: "zona", x: px(i) - paso / 2, y: T, width: paso, height: H - T - B, tabindex: 0, "aria-label": et + ": " + series.map(sr => (sr.nombre || "") + " " + fmt(sr.valores[i], b.formato, b.unidad)).join(", ") });
    zona.addEventListener("pointerenter", () => mostrar(i));
    zona.addEventListener("pointermove", () => mostrar(i));
    zona.addEventListener("focus", () => mostrar(i));
    zona.addEventListener("pointerleave", ocultar);
    zona.addEventListener("blur", ocultar);
    svg.append(zona);
  });
  return caja;
}
