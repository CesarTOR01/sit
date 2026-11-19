// Pruebas del texto de tiempos de carga, sin navegador ni red: node pruebas/tiempos.prueba.js
import { readFileSync } from "node:fs";
import { resumenTiempos } from "../sitio/tiempos.js";

let ok = 0, mal = 0;
const igual = (a, b, nombre) => {
  const A = JSON.stringify(a), B = JSON.stringify(b);
  if (A === B) ok++; else { mal++; console.log("FALLA:", nombre, "\n  obtenido:", A, "\n  esperado:", B); }
};
const leer = r => readFileSync(new URL(r, import.meta.url), "utf8");

/* ---- texto ---- */
igual(resumenTiempos([["perfil", 420], ["acceso", 910], ["catálogo", 1300], ["archivo", 2140], ["listo", 2230]]),
  { texto: "Cargó en 2.2 s", detalle: "perfil 0.4 s · acceso 0.9 s · catálogo 1.3 s · archivo 2.1 s · listo 2.2 s" }, "etapas acumuladas y total en la última marca");
igual(resumenTiempos([["listo", 49]]), { texto: "Cargó en 0.0 s", detalle: "listo 0.0 s" }, "una sola marca, menos de 0.05 s");
igual(resumenTiempos([["listo", 1250]]).texto, "Cargó en 1.3 s", "redondeo a un decimal");
igual(resumenTiempos([["listo", 61500]]).texto, "Cargó en 61.5 s", "más de un minuto sigue en segundos");
igual(resumenTiempos([]), null, "sin marcas: nada");
igual(resumenTiempos(null), null, "null: nada");
igual(resumenTiempos("x"), null, "texto: nada");
igual(resumenTiempos([["perfil", NaN], ["x", -1], [5, 10], ["a".repeat(30), 5], null, ["con<tag>", 7]]), null, "marcas inválidas se descartan (NaN, negativas, nombre no texto, nombre largo, nulo, con símbolos)");
igual(resumenTiempos([["perfil", 100], ["malo", NaN], ["listo", 300]]), { texto: "Cargó en 0.3 s", detalle: "perfil 0.1 s · listo 0.3 s" }, "una inválida entre buenas: se salta");
igual(resumenTiempos([["descomprimido", 900], ["listo", 910]]).detalle, "descomprimido 0.9 s · listo 0.9 s", "nombre de la etapa de descompresión");

/* ---- estáticas ---- */
{
  const ver = leer("../sitio/ver.js"), html = leer("../sitio/ver.html"), modulo = leer("../sitio/tiempos.js");
  igual(/id="tiempo"[^>]*hidden/.test(html), true, "ver.html trae el chip de tiempo oculto");
  igual(/\$\("tiempo"\)\.textContent = r\.texto/.test(ver) && /\$\("tiempo"\)\.title = r\.detalle/.test(ver), true, "ver.js pone el texto con textContent y el detalle como title");
  igual(/innerHTML|insertAdjacentHTML|eval\(/.test(ver + modulo), false, "ni HTML crudo ni eval");
  igual(/localStorage|sessionStorage|fetch\(|XMLHttpRequest/.test(modulo), false, "tiempos.js no guarda ni envía nada");
  const nombres = [...ver.matchAll(/marca\("([^"]+)"\)/g)].map(m => m[1]);
  igual(nombres, ["perfil", "acceso", "catálogo", "metadatos", "archivo", "descomprimido", "listo"], "marcas en el orden de la carga");
  igual(/tiempoMostrado/.test(ver) && (ver.match(/tiempoMostrado = true/g) || []).length === 1, true, "el tiempo se muestra sólo en la primera carga, no en cada relectura");
  igual(nombres.every(n => /^[a-zñáéíóú ]{1,20}$/.test(n)), true, "todos los nombres de marca los acepta resumenTiempos");
  // ninguna marca lleva datos: sólo nombres fijos entre comillas
  igual(/marca\([^")]/.test(ver.replace(/const marca = nombre => marcas\.push/, "")), false, "marca() sólo recibe textos fijos");
}

console.log("tiempos: " + ok + " de " + (ok + mal) + " pruebas bien");
process.exit(mal ? 1 : 0);
