// Los bloques que un tablero puede pedir: kpis, linea, barras, tabla, texto. Un bloque desconocido se avisa, no se oculta.
import { h, fmt, esNumero, estadoValido } from "./comun.js";
import { grafica } from "./graficas.js";

// Semáforo de tres estados. Con `aceptable`: cumple la meta = ok, llega al aceptable = warn, no = bad.
// Sin `aceptable`: ok desde la meta, warn hasta 10% de la meta, bad más abajo. `sentido:"menor"` invierte la comparación.
function estadoDe(it) {
  const dado = estadoValido(it.estado);
  if (dado) return dado;
  if (!esNumero(it.valor) || !esNumero(it.meta)) return "na";
  const menor = it.sentido === "menor";
  const cumple = menor ? it.valor <= it.meta : it.valor >= it.meta;
  if (cumple) return "ok";
  if (esNumero(it.aceptable)) return (menor ? it.valor <= it.aceptable : it.valor >= it.aceptable) ? "warn" : "bad";
  if (it.meta === 0) return "bad";
  const r = menor ? it.valor / it.meta - 1 : 1 - it.valor / it.meta;
  return r <= 0.1 ? "warn" : "bad";
}

function detalle(it) {
  return h("ul", { class: "detalle" }, it.detalle.map(d => h("li", {},
    h("span", {}, d.etiqueta || ""),
    h("strong", {}, fmt(d.valor, d.formato || it.formato, d.unidad || it.unidad)),
    esNumero(d.meta) ? h("span", { class: "meta-det" }, "meta " + fmt(d.meta, d.formato || it.formato, d.unidad || it.unidad)) : null)));
}

const TEXTO_ESTADO = { ok: "Cumple", warn: "Aceptable", bad: "No cumple" };
function pastilla(e) { return TEXTO_ESTADO[e] ? h("span", { class: "estado-celda " + e }, TEXTO_ESTADO[e]) : null; }

function tarjeta(it) {
  // el pie va en dos renglones fijos: el cambio contra otro periodo, y la meta con su nivel aceptable
  const cambio = [], metas = [];
  if (esNumero(it.valor) && it.comparacion && esNumero(it.comparacion.valor) && it.comparacion.valor !== 0) {
    const d = (it.valor - it.comparacion.valor) / Math.abs(it.comparacion.valor);
    const bueno = it.sentido === "menor" ? d <= 0 : d >= 0;
    cambio.push(h("span", { class: "delta " + (d === 0 ? "na" : bueno ? "ok" : "bad") }, (d > 0 ? "▲ " : d < 0 ? "▼ " : "") + fmt(Math.abs(d), "pct")));
    cambio.push(h("span", {}, "vs " + (it.comparacion.etiqueta || "antes") + ": " + fmt(it.comparacion.valor, it.formato, it.unidad)));
  }
  if (esNumero(it.meta)) metas.push("meta " + fmt(it.meta, it.formato, it.unidad));
  if (esNumero(it.aceptable)) metas.push("aceptable " + fmt(it.aceptable, it.formato, it.unidad));
  if (it.nota) metas.push(it.nota);
  const pie = [];
  if (cambio.length) pie.push(h("div", { class: "pie-l" }, cambio));
  if (metas.length) pie.push(h("div", { class: "pie-l" }, metas.join(" · ")));
  return h("div", { class: "kpi " + estadoDe(it) },
    h("div", { class: "et-fila" }, h("div", { class: "et" }, it.etiqueta || ""), pastilla(estadoDe(it))),
    h("div", { class: "val" + (it.valor == null ? " na" : "") }, fmt(it.valor, it.formato, it.unidad)),
    h("div", { class: "pie" }, pie),
    Array.isArray(it.detalle) && it.detalle.length ? detalle(it) : null);
}

// total con franja de escala: franjas:[{hasta, estado, etiqueta?}] en orden creciente; el último `hasta` es el máximo de la escala
function total(t) {
  const fr = (t.franjas || []).filter(f => esNumero(f.hasta));
  const max = fr.length ? fr[fr.length - 1].hasta : (esNumero(t.max) ? t.max : null);
  const pos = esNumero(t.valor) && max ? Math.max(0, Math.min(1, t.valor / max)) : null;
  const pista = h("div", { class: "franja", role: "img", "aria-label": (t.etiqueta || "Total") + ": " + fmt(t.valor, t.formato, t.unidad) });
  let desde = 0;
  for (const f of fr) {
    const seg = h("span", { class: "tramo " + (estadoValido(f.estado) || "na"), title: f.etiqueta || null });
    seg.style.flexGrow = String(Math.max(0, f.hasta - desde));
    pista.append(seg); desde = f.hasta;
  }
  if (pos != null) { const m = h("i", { class: "marca" }); m.style.left = (pos * 100).toFixed(2) + "%"; pista.append(m); }
  const e = fr.find(f => esNumero(t.valor) && t.valor <= f.hasta);
  return h("div", { class: "total" },
    h("div", { class: "total-cab" }, h("span", { class: "et" }, t.etiqueta || "Total"), h("strong", { class: "total-val" }, fmt(t.valor, t.formato, t.unidad)), e && e.etiqueta ? h("span", { class: "chip " + (estadoValido(e.estado) || "") }, e.etiqueta) : null),
    fr.length ? pista : null);
}

function kpis(b) {
  const rejilla = h("div", { class: "kpis" }, (b.items || []).map(tarjeta));
  if (!b.titulo && !b.texto && !b.total) return rejilla;
  return h("section", { class: "grupo-kpis" },
    b.titulo ? h("h3", {}, b.titulo) : null,
    b.texto ? h("p", { class: "sub-tab" }, b.texto) : null,
    b.total ? total(b.total) : null,
    rejilla);
}

const NUM = new Set(["moneda", "moneda_abrev", "entero", "decimal", "pct", "dias", "piezas"]);

function tabla(b) {
  const cols = b.columnas || [], filas = (b.filas || []).map(f => Array.isArray(f) ? f : cols.map(c => f[c.id]));
  const est = { orden: -1, desc: false, texto: "", limite: 200 };
  const cuerpo = h("tbody"), caja = h("div", { class: "tabla-caja" });
  const cabeza = h("tr", {}, cols.map((c, i) => h("th", { class: NUM.has(c.formato) || c.unidad ? "num" : "", scope: "col", tabindex: 0, title: "Ordenar", onclick: () => ordenar(i), onkeydown: e => { if (e.key === "Enter") ordenar(i); } }, c.titulo || c.id)));
  const mas = h("button", { class: "boton sec mas", hidden: true, onclick: () => { est.limite += 500; pintar(); } }, "Mostrar más");
  const nfilas = h("span", { class: "chip" });

  function ordenar(i) {
    est.desc = est.orden === i ? !est.desc : false; est.orden = i;
    [...cabeza.children].forEach((th, j) => { if (j === i) th.setAttribute("aria-sort", est.desc ? "descending" : "ascending"); else th.removeAttribute("aria-sort"); });
    pintar();
  }
  function pintar() {
    let v = filas;
    if (est.texto) { const q = est.texto.toLowerCase(); v = v.filter(f => f.some(x => x != null && String(x).toLowerCase().includes(q))); }
    if (est.orden >= 0) {
      const i = est.orden, k = est.desc ? -1 : 1;
      v = [...v].sort((p, q) => { const a = p[i], c = q[i]; if (a == null) return 1; if (c == null) return -1; return (typeof a === "number" && typeof c === "number" ? a - c : String(a).localeCompare(String(c), "es")) * k; });
    }
    cuerpo.replaceChildren(...v.slice(0, est.limite).map(f => h("tr", {}, cols.map((c, i) => {
      const x = f[i];
      if (c.formato === "estado") { const e = estadoValido(x) || "na"; return h("td", {}, h("span", { class: "estado-celda " + e }, ({ ok: "Cumple", warn: "Aceptable", bad: "No cumple", na: "NA", ...(c.etiquetas || {}) })[e])); }
      return h("td", { class: NUM.has(c.formato) || c.unidad ? "num" : "" }, fmt(x, c.formato, c.unidad));
    }))));
    mas.hidden = v.length <= est.limite;
    nfilas.textContent = v.length === filas.length ? filas.length + " renglones" : v.length + " de " + filas.length;
  }
  caja.append(h("table", {}, h("thead", {}, cabeza), cuerpo));
  pintar();
  return h("div", {}, h("div", { class: "tabla-barra" }, h("input", { type: "search", placeholder: "Buscar…", "aria-label": "Buscar en la tabla", oninput: e => { est.texto = e.target.value; est.limite = 200; pintar(); } }), nfilas), caja, mas);
}

function texto(b) {
  return h("div", { class: "texto" }, String(b.texto || "").split(/\n{2,}/).map(p => h("p", {}, p)));
}

const TIPOS = { linea: b => grafica(b, "linea"), barras: b => grafica(b, "barras"), tabla, texto };

export function pintarBloques(bloques) {
  const raiz = h("div");
  let rejilla = null;
  for (const b of bloques || []) {
    if (b.tipo === "kpis") { rejilla = null; raiz.append(kpis(b)); continue; }
    if (!rejilla) { rejilla = h("div", { class: "rejilla" }); raiz.append(rejilla); }
    const f = TIPOS[b.tipo];
    const cuerpo = f ? f(b) : h("p", { class: "aviso warn" }, "Este tipo de bloque no lo conoce el portal: " + String(b.tipo));
    const ancho = b.tipo === "tabla" || b.ancho === "completo";
    rejilla.append(h("section", { class: "tarjeta" + (ancho ? " ancho" : "") }, b.titulo ? h("h3", {}, b.titulo) : null, b.subtitulo ? h("p", { class: "sub-tab" }, b.subtitulo) : null, cuerpo));
  }
  return raiz;
}
