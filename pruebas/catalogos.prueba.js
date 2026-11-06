// Pruebas de la unión de catálogos de varias carpetas, sin navegador: node pruebas/catalogos.prueba.js
import { readFileSync } from "node:fs";
import { carpetasALeer, unirCatalogos, nombreDeCarpeta, MAX_TABLEROS } from "../sitio/catalogos.js";

let ok = 0, mal = 0;
const igual = (a, b, nombre) => {
  const A = JSON.stringify(a), B = JSON.stringify(b);
  if (A === B) ok++; else { mal++; console.log("FALLA:", nombre, "\n  obtenido:", A, "\n  esperado:", B); }
};
const t = (id, extra = {}) => ({ id, titulo: "T " + id, archivo: id + ".json", ...extra });
const ids = l => l.map(x => x.id);

/* ---- nombreDeCarpeta ---- */
igual(nombreDeCarpeta("/personal/u/Documents/Raiz/indicadores"), "indicadores", "último tramo");
igual(nombreDeCarpeta("/a/b/"), "b", "con diagonal final");
igual(nombreDeCarpeta(""), "", "vacío");
igual(nombreDeCarpeta(undefined), "", "indefinido");

/* ---- carpetasALeer ---- */
igual(carpetasALeer({ administrador: true, existentes: ["facturacion", "acceso", "marca", "indicadores", "ventas"], propia: "ventas" }), ["facturacion", "indicadores"], "administrador: todas, sin reservadas ni la propia");
igual(carpetasALeer({ administrador: true, existentes: ["Acceso", "MARCA", "x"] }), ["x"], "reservadas sin importar mayúsculas");
igual(carpetasALeer({ administrador: true, existentes: ["a", "A", "a"] }), ["a"], "sin repetidas (ni por mayúsculas)");
igual(carpetasALeer({ administrador: true, existentes: [] }), [], "administrador sin carpetas");
igual(carpetasALeer({ administrador: true, existentes: ["../x", "a/b", "con espacio", "", 3, null, "a\\b", "x".repeat(65)] }), [], "nombres no válidos");
igual(carpetasALeer({ administrador: false, existentes: ["todas", "las", "demas"], configuradas: ["facturacion"] }), ["facturacion"], "sin ser administrador sólo las configuradas, aunque existan otras");
igual(carpetasALeer({ administrador: false, configuradas: ["facturacion", "acceso", "indicadores"], propia: "Indicadores" }), ["facturacion"], "configuradas: sin reservadas ni la propia");
igual(carpetasALeer({ administrador: false, configuradas: [] }), [], "sin configuradas");
igual(carpetasALeer({ administrador: false }), [], "sin nada");
igual(carpetasALeer({ administrador: true, existentes: "no es lista" }), [], "existentes que no es lista");
igual(carpetasALeer({}), [], "sin argumentos útiles");

/* ---- unirCatalogos ---- */
const P = [t("a"), t("b")];
const H = [{ carpeta: "indicadores", tableros: [t("c"), t("d")] }, { carpeta: "facturacion", tableros: [t("e")] }];
igual(unirCatalogos(P, H).map(x => [x.id, x.origen || null]), [["a", null], ["b", null], ["c", "indicadores"], ["d", "indicadores"], ["e", "facturacion"]], "une y marca el origen de las hermanas");
igual(unirCatalogos(P, []), P, "sin hermanas queda igual");
igual(unirCatalogos(P, undefined), P, "hermanas indefinidas");
igual(unirCatalogos(undefined, H).length, 3, "sin principal");
igual(unirCatalogos(P, [{ carpeta: "x", tableros: [t("a"), t("z")] }]).map(x => x.id), ["a", "b", "z"], "id repetido: gana la carpeta del enlace");
igual(unirCatalogos([], [{ carpeta: "x", tableros: [t("a")] }, { carpeta: "y", tableros: [t("a"), t("b")] }]).map(x => [x.id, x.origen]), [["a", "x"], ["b", "y"]], "id repetido entre hermanas: gana la primera");
igual(unirCatalogos(P, [{ carpeta: "x", tableros: [t("e1", { tipo: "embebido" }), t("e2", { tipo: "datos" })] }]).map(x => x.id), ["a", "b", "e2"], "los embebidos de hermanas se descartan");
igual(unirCatalogos([t("emb", { tipo: "embebido" })], []).length, 1, "los embebidos de la carpeta del enlace se conservan");
igual(unirCatalogos([{ id: 1 }, null, t("ok"), { id: "sin_archivo", titulo: "x" }], []).map(x => x.id), ["ok"], "tableros mal formados fuera (principal)");
igual(unirCatalogos([], [{ carpeta: "x", tableros: [null, 5, { id: "a" }, t("b")] }]).map(x => x.id), ["b"], "tableros mal formados fuera (hermanas)");
igual(unirCatalogos([], [{ carpeta: "../x", tableros: [t("a")] }, { carpeta: "ok", tableros: "no es lista" }, null, { tableros: [t("b")] }]).length, 0, "hermanas mal formadas fuera");
igual(unirCatalogos([t("a", { origen: "otra" })], []).map(x => x.origen), [undefined], "un catálogo no puede fijar su propio origen");
igual(unirCatalogos([], [{ carpeta: "x", tableros: [t("a", { origen: "otra" })] }])[0].origen, "x", "el origen de una hermana lo pone el sitio, no su catálogo");
igual(P[0].origen, undefined, "no se modifica el catálogo recibido");
const muchos = n => Array.from({ length: n }, (_, i) => t("m" + i));
igual(unirCatalogos(muchos(5), [{ carpeta: "x", tableros: muchos(MAX_TABLEROS + 50).map(x => ({ ...x, id: "h" + x.id })) }]).length, MAX_TABLEROS, "tope de tableros");
igual(unirCatalogos(muchos(MAX_TABLEROS + 10), []).length, MAX_TABLEROS, "tope también con sólo el principal");

/* ---- el juntado no toca red, almacenamiento ni HTML ---- */
const src = readFileSync(new URL("../sitio/catalogos.js", import.meta.url), "utf8");
igual(/fetch\(|localStorage|sessionStorage|innerHTML|document\./.test(src), false, "catalogos.js no toca red, almacenamiento ni DOM");
igual(/from "\.\/(auth|graph|fuente)\.js"/.test(src), false, "catalogos.js no depende de la sesión");

console.log(mal ? "FALLARON " + mal + " de " + (ok + mal) : "catalogos: " + ok + " de " + ok + " pruebas bien");
process.exit(mal ? 1 : 0);
