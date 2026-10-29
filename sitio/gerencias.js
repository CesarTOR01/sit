// Identidad por gerencia: una ilustración y un color de acento para el frente de cada persona.
// La gerencia sale del campo "departamento" del perfil de la cuenta (Graph /me); no se guarda y, si falta o no se
// reconoce, se usa la imagen general. Las ilustraciones son SVG propios que toman sus colores del tema (claro y oscuro).
import { h, s } from "./comun.js";

// Cada gerencia: texto con el que se reconoce el departamento (sin acentos, en minúsculas), nombre y lema.
const GERENCIAS = [
  { id: "comercial", nombre: "Comercial", lema: "Venta, clientes y mercados", claves: ["comercial", "ventas", "mercadotecnia", "marketing", "exportacion"] },
  { id: "operaciones", nombre: "Operaciones", lema: "Producción y planta", claves: ["operaciones", "produccion", "planta", "manufactura", "mantenimiento"] },
  { id: "calidad", nombre: "Calidad", lema: "Liberación y cumplimiento", claves: ["calidad", "aseguramiento", "regulatorio", "validacion", "laboratorio"] },
  { id: "finanzas", nombre: "Finanzas", lema: "Resultados, costos y cartera", claves: ["finanzas", "contabilidad", "tesoreria", "costos", "administracion", "cobranza"] },
  { id: "compras", nombre: "Compras", lema: "Abasto y proveedores", claves: ["compras", "abasto", "abastecimiento", "logistica", "almacen"] },
  { id: "planeacion", nombre: "Planeación", lema: "Plan, demanda y cobertura", claves: ["planeacion", "planificacion", "cadena de suministro", "supply", "demanda"] },
  { id: "rrhh", nombre: "Recursos Humanos", lema: "Personas y desarrollo", claves: ["recursos humanos", "capital humano", "rrhh", "talento", "personal", "nomina"] },
  { id: "sistemas", nombre: "Sistemas", lema: "Datos y plataformas", claves: ["sistemas", "tecnologia", "informatica", "datos", "ti"] },
  { id: "direccion", nombre: "Dirección", lema: "La empresa completa", claves: ["direccion", "director", "gerencia general", "ejecutivo", "presidencia"] },
];
export const GENERAL = { id: "general", nombre: "SIT", lema: "Los tableros de tu cuenta" };

const sinAcentos = t => String(t || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();

export function gerenciaDe(departamento) {
  const t = " " + sinAcentos(departamento) + " ";
  if (t.trim() === "") return GENERAL;
  return GERENCIAS.find(g => g.claves.some(c => t.includes(c.length <= 2 ? " " + c + " " : c))) || GENERAL;
}
export const esGrupoDe = (grupo, g) => g !== GENERAL && sinAcentos(grupo) === sinAcentos(g.nombre);
export const todasLasGerencias = () => [...GERENCIAS, GENERAL];

/* ---- ilustraciones (viewBox 0 0 320 180) ---- */
const r = (x, y, w, hh, cl, rx = 4) => s("rect", { x, y, width: w, height: hh, rx, class: cl });
const c = (cx, cy, rad, cl) => s("circle", { cx, cy, r: rad, class: cl });
const p = (d, cl) => s("path", { d, class: cl });
const l = (x1, y1, x2, y2, cl) => s("line", { x1, y1, x2, y2, class: cl });

const ARTE = {
  comercial: () => [
    ...[30, 52, 70, 96, 124].map((alto, i) => r(40 + i * 42, 152 - alto, 28, alto, i === 4 ? "g-acento" : "g-suave", 5)),
    p("M24 70 C80 22 130 96 190 52 S280 34 296 22", "g-ruta"),
    c(24, 70, 6, "g-nodo"), c(132, 70, 6, "g-nodo"), c(296, 22, 9, "g-acento"), c(296, 22, 3.5, "g-fondo"),
    l(16, 156, 304, 156, "g-base")],
  operaciones: () => [
    r(16, 128, 288, 14, "g-tenue", 7), ...[40, 100, 160, 220, 280].map(x => c(x, 150, 6, "g-tenue")),
    ...[0, 1, 2, 3, 4].map(i => [r(34 + i * 52, 84, 28, 44, i === 2 ? "g-acento" : "g-suave", 8), r(39 + i * 52, 74, 18, 12, "g-tenue", 3), r(34 + i * 52, 104, 28, 24, i === 2 ? "g-acento" : "g-suave", 8)]).flat(),
    c(262, 46, 26, "g-suave"), c(262, 46, 34, "g-engrane"), c(262, 46, 10, "g-fondo")],
  calidad: () => [
    p("M96 24 h44 v40 l40 76 a10 10 0 0 1 -9 15 h-106 a10 10 0 0 1 -9 -15 l40 -76 z", "g-contorno"),
    p("M66 120 l16 -30 h74 l16 30 l8 20 a8 8 0 0 1 -7 11 h-108 a8 8 0 0 1 -7 -11 z", "g-acento"),
    c(110, 108, 5, "g-fondo"), c(136, 96, 3.5, "g-fondo"), c(124, 122, 4, "g-fondo"),
    c(240, 74, 38, "g-lupa"), l(268, 102, 296, 130, "g-mango"), p("M222 76 l13 14 l25 -28", "g-palomita")],
  finanzas: () => [
    ...[0, 1, 2, 3].map(i => s("ellipse", { cx: 64, cy: 146 - i * 13, rx: 32, ry: 9, class: "g-moneda" })),
    ...[0, 1, 2].map(i => s("ellipse", { cx: 126, cy: 146 - i * 13, rx: 32, ry: 9, class: "g-moneda g-moneda-b" })),
    ...[40, 62, 84, 110].map((alto, i) => r(176 + i * 28, 152 - alto, 18, alto, "g-suave", 3)),
    p("M170 132 C200 122 222 92 252 70 S292 40 306 26", "g-ruta"), p("M306 26 l-14 2 l8 10 z", "g-flecha"), l(16, 156, 304, 156, "g-base")],
  compras: () => [
    r(40, 104, 62, 46, "g-acento", 5), l(71, 104, 71, 150, "g-cinta"), r(106, 118, 52, 32, "g-suave", 5),
    r(56, 62, 56, 42, "g-suave", 5), l(84, 62, 84, 104, "g-cinta"),
    r(186, 96, 82, 50, "g-acento", 6), r(270, 110, 34, 36, "g-tenue", 6), c(212, 150, 11, "g-tenue"), c(286, 150, 11, "g-tenue"),
    c(212, 150, 4, "g-fondo"), c(286, 150, 4, "g-fondo"), l(170, 104, 150, 104, "g-viento"), l(176, 120, 150, 120, "g-viento"), l(16, 162, 304, 162, "g-base")],
  planeacion: () => [
    ...[[24, 34, 110], [70, 62, 130], [122, 90, 92], [170, 118, 120]].map(([x, y, w], i) => r(x, y, w, 18, i % 2 ? "g-suave" : "g-acento", 9)),
    l(176, 18, 176, 150, "g-hoy"), p("M296 118 l12 12 l-12 12 l-12 -12 z", "g-hito"), ...[0, 1, 2, 3, 4, 5].map(i => l(24 + i * 50, 150, 24 + i * 50, 158, "g-base"))],
  rrhh: () => [
    ...[[84, 76, 0], [236, 76, 0], [160, 60, 1]].map(([x, y, grande]) => [c(x, y, grande ? 22 : 17, grande ? "g-acento" : "g-suave"), p(`M${x - (grande ? 40 : 32)} ${y + (grande ? 78 : 60)} a${grande ? 40 : 32} ${grande ? 40 : 32} 0 0 1 ${grande ? 80 : 64} 0 z`, grande ? "g-acento" : "g-suave")]).flat(),
    p("M84 150 C120 176 200 176 236 150", "g-ruta")],
  sistemas: () => [
    l(60, 50, 140, 90, "g-enlace"), l(140, 90, 230, 50, "g-enlace"), l(140, 90, 180, 140, "g-enlace"), l(140, 90, 80, 130, "g-enlace"), l(230, 50, 280, 110, "g-enlace"), l(180, 140, 280, 110, "g-enlace"),
    c(60, 50, 11, "g-suave"), c(230, 50, 13, "g-suave"), c(180, 140, 12, "g-suave"), c(80, 130, 10, "g-suave"), c(280, 110, 12, "g-suave"), c(140, 90, 24, "g-acento"), c(140, 90, 9, "g-fondo")],
  direccion: () => [
    c(262, 46, 24, "g-acento"),
    ...[[22, 70], [58, 104], [94, 56], [130, 88], [166, 112], [202, 74], [238, 100], [274, 84]].map(([x, alto], i) => r(x, 152 - alto, 30, alto, i === 2 ? "g-acento" : "g-suave", 3)),
    l(8, 152, 312, 152, "g-base")],
};
ARTE.general = ARTE.direccion;

export function ilustracion(id) {
  return s("svg", { class: "g-arte", viewBox: "0 0 320 180", role: "img", "aria-label": "Ilustración de " + (id || "SIT") }, c(160, 90, 100, "g-anillo"), c(176, 82, 86, "g-anillo"), ...(ARTE[id] || ARTE.general)());
}

// El encabezado del frente de la persona: su gerencia, su lema y la ilustración.
export function heroGerencia(g, nombre) {
  const primer = String(nombre || "").trim().split(/\s+/)[0];
  return h("section", { class: "hero-gerencia", "data-gerencia": g.id },
    h("div", { class: "hero-texto" },
      h("h2", { class: "hero-nombre" }, g.nombre),
      h("p", { class: "hero-lema" }, g.lema),
      primer ? h("p", { class: "hero-sesion" }, "Sesión de " + nombre) : null),
    ilustracion(g.id));
}
