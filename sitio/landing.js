// Landing de SIT: la primera pantalla. Es pública, así que no nombra tableros ni lleva cifras: sólo explica qué es,
// pide iniciar sesión con la cuenta de Tornel y muestra la marca. Sin textos explicativos.
import { h } from "./comun.js";

// Marca de Laboratorios Tornel: variante vertical del Manual de Identidad, clara u oscura según el tema (ver estilo.css).
// Sólo se fija el ancho; el alto sigue la proporción del archivo y no se le aplica ningún efecto.
const logoLanding = () => [
  h("img", { class: "landing-arte marca-claro", src: "marca/tornel-vertical.svg", alt: "Laboratorios Tornel, creamos bienestar", width: 207, height: 224 }),
  h("img", { class: "landing-arte marca-oscuro", src: "marca/tornel-vertical-oscuro.svg", alt: "Laboratorios Tornel, creamos bienestar", width: 207, height: 224 }),
];

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
      h("div", { class: "landing-imagen" }, ...logoLanding())),
    extras.length ? h("details", { class: "otras" }, h("summary", {}, "Abrir una carpeta local"), ...extras) : null);
}
