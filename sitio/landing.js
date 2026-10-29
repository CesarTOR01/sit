// Landing de SIT: la primera pantalla. Es pública, así que no nombra tableros ni lleva cifras: sólo explica qué es,
// pide iniciar sesión con la cuenta de Tornel y deja una ilustración. Sin textos explicativos.
import { h, s } from "./comun.js";

// Ilustración mínima de farma veterinaria: un frasco con una huella. Una sola tinta (el acento), mucho aire.
function ilustracionLanding() {
  const r = (x, y, w, hh, cl, rx) => s("rect", { x, y, width: w, height: hh, rx, class: cl });
  const c = (cx, cy, rad, cl) => s("circle", { cx, cy, r: rad, class: cl });
  return s("svg", { class: "landing-arte", viewBox: "0 0 360 300", "aria-hidden": "true" },
    c(180, 160, 134, "g-anillo"), c(198, 148, 120, "g-anillo"), c(162, 172, 110, "g-anillo"),
    r(150, 34, 60, 26, "g-tenue", 7), r(158, 60, 44, 16, "g-tenue", 3),
    r(136, 76, 88, 178, "g-contorno", 24),
    r(140, 150, 80, 100, "g-liquido", 20),
    // huella: almohadilla y cuatro dedos
    s("path", { d: "M180 232 c-20 0 -30 -12 -28 -24 c2 -10 14 -16 28 -16 c14 0 26 6 28 16 c2 12 -8 24 -28 24 z", class: "g-acento" }),
    c(152, 186, 8, "g-acento"), c(168, 172, 8.5, "g-acento"), c(192, 172, 8.5, "g-acento"), c(208, 186, 8, "g-acento"),
    // marcas de volumen
    ...[110, 128, 146].map((y, i) => s("line", { x1: 236, y1: y, x2: i === 1 ? 250 : 260, y2: y, class: "g-base" })),
    c(164, 124, 4, "g-suave"), c(196, 112, 3, "g-suave"), c(184, 100, 5, "g-suave"),
    s("ellipse", { cx: 180, cy: 268, rx: 70, ry: 7, class: "g-suave" }));
}

// opciones: aviso (error), info (indicación), ofrecerBasico, entrar(), entrarBasico(), extras (nodos para "Abrir una carpeta local")
export function landing({ aviso = null, info = null, ofrecerBasico = false, entrar, entrarBasico, extras = [] } = {}) {
  return h("div", { class: "landing" },
    h("section", { class: "landing-hero" },
      h("div", { class: "landing-texto" },
        h("h1", { class: "landing-titulo" }, "Los tableros de Tornel, en un solo lugar"),
        info ? h("p", { class: "aviso warn" }, info) : null,
        aviso ? h("div", { class: "aviso bad", role: "alert" }, aviso) : null,
        h("div", { class: "acciones" },
          h("button", { class: "boton grande", onclick: entrar }, "Iniciar sesión con tu cuenta de Tornel"),
          ofrecerBasico ? h("button", { class: "boton sec grande", onclick: entrarBasico }, "Entrar sólo con mi perfil") : null)),
      h("div", { class: "landing-imagen" }, ilustracionLanding())),
    extras.length ? h("details", { class: "otras" }, h("summary", {}, "Abrir una carpeta local"), ...extras) : null);
}
