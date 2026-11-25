// Pruebas de la carga del menú (lista de archivos por carpeta, relectura de una sola carpeta al abrir un tablero y `archivosDeCarpeta`),
// sin navegador ni red: node pruebas/menu_carga.prueba.js
// Las fuentes son simuladas y registran cada petición; carpetas, catálogos y archivos son textos inventados.
import { readFileSync } from "node:fs";
import { validarCatalogo, conMeta, leerCarpeta, cargarMenu, armarMenu, alAbrir } from "../sitio/menu_carga.js";
import { cambio } from "../sitio/relectura.js";

let ok = 0, mal = 0;
const igual = (a, b, nombre) => {
  const A = JSON.stringify(a), B = JSON.stringify(b);
  if (A === B) ok++; else { mal++; console.log("FALLA:", nombre, "\n  obtenido:", A, "\n  esperado:", B); }
};
const leer = r => readFileSync(new URL(r, import.meta.url), "utf8");
const falla = async f => { try { await f(); return null; } catch (e) { return e; } };
const msg = f => { try { f(); return null; } catch (e) { return e.message; } };
const tick = () => new Promise(r => setImmediate(r));

/* ---------- datos de ejemplo ---------- */
const T = (id, extra = {}) => ({ id, tipo: "datos", titulo: "Tablero " + id, archivo: id + ".json", ...extra });
const cat = (...ts) => ({ contrato: "visor/1", titulo: "Catálogo de prueba", tableros: ts });
const base = () => ({
  indicadores: { catalogo: cat(T("a"), T("b"), T("c")), lista: ["a.json", "b.json", "c.json", "sit-catalogo.json"] },
  facturacion: { catalogo: cat(T("f1"), T("f2")), lista: ["f1.json", "f2.json"] },
  ventas: { catalogo: cat(T("v1")), lista: ["v1.json"] },
});
// una carpeta propia con 3 tableros y `n` hermanas (h1..hn) con un tablero cada una (x1..xn)
const conHermanas = n => {
  const c = { indicadores: { catalogo: cat(T("a"), T("b"), T("c")), lista: ["a.json", "b.json", "c.json"] } };
  for (let i = 1; i <= n; i++) c["h" + i] = { catalogo: cat(T("x" + i)), lista: ["x" + i + ".json"] };
  return c;
};
const err = (codigo, estado) => Object.assign(new Error("fallo " + codigo), { codigo, estado: estado || null });
const envolver = e => Object.assign(new Error("texto " + e.codigo), { origen: e });

/* ---------- el mundo simulado ----------
   carpetas[nombre] = { catalogo (objeto o Error), lista (nombres, objetos o Error), meta: { ruta: metadatos | Error } } */
function mundo(carpetas, { admin = true, configuradas = [], extrasNulo = false, existentes = null, sinHermana = [], ajustar = null } = {}) {
  const log = [], ajustes = [], fuentes = new Map();
  const fuenteDe = nombre => {
    if (!fuentes.has(nombre)) fuentes.set(nombre, {
      tipo: "graph", nombre, carpeta: "/sites/ejemplo/Documents/" + nombre,
      archivosDeCarpeta: async () => {
        log.push("lista:" + nombre); await tick();
        const c = carpetas[nombre];
        if (!c) throw err("no-existe", 404);
        if (c.lista instanceof Error) throw c.lista;
        return c.lista.map(x => typeof x === "string" ? { nombre: x, bytes: 100, modificado: "2026-01-01T00:00:00Z" } : x);
      },
      metadatos: async rel => {
        log.push("meta:" + nombre + "/" + rel); await tick();
        const m = carpetas[nombre] && carpetas[nombre].meta && carpetas[nombre].meta[rel];
        if (!m) throw err("no-existe", 404);
        if (m instanceof Error) throw m;
        return m;
      },
    });
    return fuentes.get(nombre);
  };
  const P = {
    f: fuenteDe("indicadores"), archivo: "sit-catalogo.json", catalogo: "sit-catalogo.json",
    leerCatalogo: async (archivo, esperado, f) => {
      log.push("cat:" + f.nombre); await tick();
      const c = carpetas[f.nombre];
      if (!c) throw envolver(err("no-existe", 404));
      if (c.catalogo instanceof Error) throw envolver(c.catalogo);
      return { datos: JSON.parse(JSON.stringify(c.catalogo)) };
    },
    textoError: e => "ERR:" + e.codigo,
    extras: extrasNulo ? null : { admin, carpetas: configuradas },
    hermanas: new Map(),
    fuenteHermana: (f, n) => sinHermana.includes(n) ? null : fuenteDe(n),
    listarHermanas: async () => { log.push("enum"); return existentes || [...Object.keys(carpetas).filter(k => k !== "indicadores"), "acceso", "marca"]; },
    ajustar: ajustar ? (ts, fx) => { ajustes.push(fx.nombre); return ajustar(ts, fx); } : undefined,
  };
  return { P, log, ajustes, fuenteDe, carpetas };
}
const ids = ts => ts.map(t => t.id);
const cuenta = (log, pref) => log.filter(x => x.startsWith(pref)).length;

/* ================= 1. validarCatalogo ================= */
igual(msg(() => validarCatalogo({ tableros: [T("a")] })), null, "validarCatalogo: un catálogo bien formado vale");
igual(msg(() => validarCatalogo({ tableros: [] })), null, "validarCatalogo: sin tableros vale");
igual(msg(() => validarCatalogo({})), "El catálogo no trae la lista “tableros”.", "validarCatalogo: sin lista");
igual(msg(() => validarCatalogo({ tableros: [{ id: "a", archivo: "a.json" }] })), "El catálogo: cada tablero necesita id, titulo y archivo.", "validarCatalogo: falta el título");
igual(msg(() => validarCatalogo({ tableros: [null] })), "El catálogo: cada tablero necesita id, titulo y archivo.", "validarCatalogo: renglón nulo");
igual(msg(() => validarCatalogo({ tableros: [T("a"), T("b"), T("a")] })), "El catálogo: el id “a” está repetido.", "validarCatalogo: id repetido");

/* ================= 2. una lista de archivos por carpeta, no un metadatos por tablero ================= */
{
  const w = mundo(base());
  const d = await leerCarpeta(w.P);
  igual(w.log, ["cat:indicadores", "lista:indicadores"], "una carpeta con 3 tableros: el catálogo y una lista, sin metadatos");
  igual(ids(d.tableros), ["a", "b", "c"], "los tableros legibles quedan en el orden del catálogo");
  igual(d.titulo, "Catálogo de prueba", "el resto del catálogo se conserva");
}
{
  const ts = Array.from({ length: 40 }, (_, i) => T("t" + i));
  const w = mundo({ indicadores: { catalogo: cat(...ts), lista: ts.map(t => t.archivo) } });
  const d = await leerCarpeta(w.P);
  igual([w.log.length, cuenta(w.log, "lista:"), cuenta(w.log, "meta:"), d.tableros.length], [2, 1, 0, 40], "40 tableros en una carpeta: una lista y ningún metadatos (antes eran 40)");
}
{
  const w = mundo({ indicadores: { catalogo: cat(T("a"), T("b")), lista: [{ nombre: "a.json", bytes: 1234, modificado: "2026-03-01T10:00:00Z" }, { nombre: "b.json", bytes: "77", modificado: "2026-03-02T10:00:00Z" }] } });
  const d = await leerCarpeta(w.P);
  igual(d.tableros[0].meta, { id: "a.json", nombre: "a.json", bytes: 1234, modificado: "2026-03-01T10:00:00Z" }, "t.meta: misma forma { id, nombre, bytes, modificado } que los metadatos de hoy");
  igual(Object.keys(d.tableros[0].meta), ["id", "nombre", "bytes", "modificado"], "t.meta: mismas llaves y en el mismo orden");
  igual(d.tableros[1].meta.bytes, 77, "t.meta.bytes es un número aunque la lista lo traiga como texto");
}
{
  const w = mundo({ indicadores: { catalogo: cat(T("a"), T("b")), lista: [{ nombre: "A.JSON", bytes: 5, modificado: "m" }, { nombre: "b.json", bytes: "no es número", modificado: "m" }] } });
  const d = await leerCarpeta(w.P);
  igual([ids(d.tableros), d.tableros[0].meta.id, d.tableros[1].meta.bytes], [["a", "b"], "A.JSON", 0], "el nombre se compara sin distinguir mayúsculas; meta.id es el del servidor; bytes inválidos son 0");
}
{
  const w = mundo({ indicadores: { catalogo: cat(T("a"), T("b"), T("c")), lista: ["a.json", "c.json"] } });
  const d = await leerCarpeta(w.P);
  igual(ids(d.tableros), ["a", "c"], "un tablero cuyo archivo no está en la lista se omite");
  igual(cuenta(w.log, "meta:"), 0, "omitirlo no pide metadatos");
}
{
  const w = mundo({ indicadores: { catalogo: cat(T("a", { archivo: "./a.json" }), T("b", { archivo: "//b.json" }), T("c", { archivo: "../c.json" }), T("d", { archivo: "d\\x.json" }), T("e", { archivo: "" })), lista: ["a.json", "b.json", "c.json", "x.json", "e.json"] } });
  const d = await leerCarpeta(w.P);
  igual(ids(d.tableros), ["a", "b"], "rutas con . y diagonales repetidas valen; con .., contrabarra o vacías se omiten");
  igual(cuenta(w.log, "meta:"), 0, "las rutas no válidas se omiten sin pedir nada");
}
{
  const meta = { "sub/x.json": { id: "x.json", nombre: "x.json", bytes: 9, modificado: "m" } };
  const w = mundo({ indicadores: { catalogo: cat(T("a"), T("x", { archivo: "sub/x.json" }), T("y", { archivo: "sub/y.json" })), lista: ["a.json"], meta } });
  const d = await leerCarpeta(w.P);
  igual(ids(d.tableros), ["a", "x"], "un archivo en una subcarpeta se comprueba aparte (no sale en la lista) y, si no existe, se omite");
  igual([cuenta(w.log, "lista:"), cuenta(w.log, "meta:")], [1, 2], "subcarpetas: una lista y un metadatos por cada archivo de subcarpeta");
  igual(d.tableros[1].meta, meta["sub/x.json"], "el meta de un archivo de subcarpeta es el de metadatos");
}
{
  const w = mundo({ indicadores: { catalogo: cat(T("x", { archivo: "sub/x.json" })), lista: ["a.json"], meta: { "sub/x.json": { id: "x.json", nombre: "x.json", bytes: 1, modificado: "m" } } } });
  await leerCarpeta(w.P);
  igual(cuenta(w.log, "lista:"), 0, "si todos los archivos están en subcarpetas no se pide la lista");
}
{
  const w = mundo({ indicadores: { catalogo: cat(T("x", { archivo: "sub/x.json" })), lista: [], meta: { "sub/x.json": err("red") } } });
  const e = await falla(() => leerCarpeta(w.P));
  igual([e && e.message, e && e.origen], ["ERR:red", undefined], "un error de red al comprobar un archivo de subcarpeta se muestra");
}
{
  const w = mundo({ indicadores: { catalogo: cat(), lista: ["a.json"] } });
  const d = await leerCarpeta(w.P);
  igual([w.log, d.tableros], [["cat:indicadores"], []], "un catálogo sin tableros no pide la lista");
}

/* ================= 3. errores ================= */
for (const codigo of ["red", "sin-sesion"]) {
  const w = mundo({ indicadores: { catalogo: cat(T("a")), lista: err(codigo) } });
  const e = await falla(() => leerCarpeta(w.P));
  igual([e && e.message, e && e.origen], ["ERR:" + codigo, undefined], "error de " + codigo + " en la lista: se muestra con el texto de siempre");
}
for (const [codigo, estado] of [["sin-permiso", 403], ["no-existe", 404], ["graph", 500]]) {
  const w = mundo({ indicadores: { catalogo: cat(T("a"), T("b")), lista: err(codigo, estado) } });
  let d = null, e = null;
  try { d = await leerCarpeta(w.P); } catch (x) { e = x; }
  igual([e && e.message, d && d.tableros], [null, []], "la lista falla con " + estado + ": ningún tablero es legible y no hay error, igual que cuando cada metadatos fallaba");
}
{
  const w = mundo({ indicadores: { catalogo: err("no-existe", 404), lista: ["a.json"] } });
  const e = await falla(() => leerCarpeta(w.P));
  igual([e && e.message, e && e.origen && e.origen.codigo, cuenta(w.log, "lista:")], ["texto no-existe", "no-existe", 0], "el catálogo que no se puede leer propaga su error (con origen) y no pide la lista");
}
{
  const w = mundo({ indicadores: { catalogo: { contrato: "visor/1", tableros: [T("a"), T("a")] }, lista: ["a.json"] } });
  const e = await falla(() => leerCarpeta(w.P));
  igual([e && e.message, cuenta(w.log, "lista:")], ["El catálogo: el id “a” está repetido.", 0], "un catálogo inválido falla antes de pedir la lista");
}
{
  const log = [];
  const f = { tipo: "carpeta", nombre: "local", archivosDeCarpeta: async () => { log.push("lista"); return []; }, metadatos: async () => { log.push("meta"); throw err("red"); } };
  const d = await leerCarpeta({ f, archivo: "portal.json", leerCatalogo: async () => ({ datos: cat(T("a")) }), textoError: e => "ERR" });
  igual([log, d.tableros.map(t => [t.id, t.meta])], [[], [["a", undefined]]], "una fuente local no pide lista ni metadatos y no pone meta");
}
{
  const visto = [];
  const f = { tipo: "graph", nombre: "x" };
  const t = await conMeta({ f, tableros: [T("a")], listaDe: async fx => { visto.push(fx === f); return [{ nombre: "a.json", bytes: 1, modificado: "m" }]; }, textoError: e => "ERR" });
  igual([visto, ids(t)], [[true], ["a"]], "conMeta usa `listaDe` con la fuente que recibe");
}

/* ================= 4. el menú del Administrador con carpetas hermanas ================= */
for (const [n, esperadas] of [[1, 5], [3, 9], [11, 25]]) {
  const w = mundo(conHermanas(n));
  const e = await cargarMenu(w.P);
  igual([w.log.length, cuenta(w.log, "cat:"), cuenta(w.log, "lista:"), cuenta(w.log, "enum"), cuenta(w.log, "meta:")], [esperadas, n + 1, n + 1, 1, 0], "armar el menú con " + n + " hermanas: una lista por carpeta, una enumeración, ningún metadatos");
  igual(armarMenu(e, w.P.f).tableros.length, 3 + n, "el menú con " + n + " hermanas trae todos los tableros");
}
{
  const w = mundo(base());
  const e = await cargarMenu(w.P);
  const m = armarMenu(e, w.P.f);
  igual(m.tableros.map(t => [t.id, t.origen || null]), [["a", null], ["b", null], ["c", null], ["f1", "facturacion"], ["f2", "facturacion"], ["v1", "ventas"]], "propios sin origen y los de cada hermana con su origen");
  igual(m.tableros.every(t => t.meta && typeof t.meta.id === "string"), true, "todos los tableros del menú traen meta");
  igual([...w.P.hermanas.keys()], ["facturacion", "ventas"], "`hermanas` guarda la fuente de cada hermana leída (sin acceso ni marca)");
  igual(m.titulo, "Catálogo de prueba", "el menú conserva los campos del catálogo de la carpeta del enlace");
}
{
  const w = mundo(base(), { existentes: ["facturacion", "acceso", "marca", "indicadores", "../x", "con espacio", "ventas", "Ventas"] });
  await cargarMenu(w.P);
  igual(w.log.filter(x => x.startsWith("cat:")).sort(), ["cat:facturacion", "cat:indicadores", "cat:ventas"], "no se leen las reservadas, la propia, los nombres no válidos ni los repetidos");
}
{
  const w = mundo(base(), { admin: false, configuradas: ["facturacion"] });
  const e = await cargarMenu(w.P);
  igual([w.log, ids(armarMenu(e, w.P.f).tableros)], [["cat:indicadores", "lista:indicadores", "cat:facturacion", "lista:facturacion"], ["a", "b", "c", "f1", "f2"]], "quien no administra lee sólo las carpetas de su lista y no enumera las hermanas");
}
{
  const w = mundo(base(), { extrasNulo: true });
  const e = await cargarMenu(w.P);
  igual([w.log, e.hermanos], [["cat:indicadores", "lista:indicadores"], []], "sin carpetas hermanas (sin entrada en el acceso): sólo la del enlace");
}
{
  const c = base(); c.facturacion.catalogo = err("sin-permiso", 403);
  const w = mundo(c);
  const e = await cargarMenu(w.P);
  igual([ids(armarMenu(e, w.P.f).tableros), [...w.P.hermanas.keys()]], [["a", "b", "c", "v1"], ["ventas"]], "una hermana cuyo catálogo no se puede leer se omite sin avisar y las demás siguen");
}
{
  const c = base(); c.ventas.lista = err("red");
  const w = mundo(c);
  const e = await cargarMenu(w.P);
  igual(ids(armarMenu(e, w.P.f).tableros), ["a", "b", "c", "f1", "f2"], "una hermana cuya lista falla con un error de red se omite, como cuando fallaban sus metadatos");
}
{
  const w = mundo(base(), { sinHermana: ["ventas"] });
  const e = await cargarMenu(w.P);
  igual(ids(armarMenu(e, w.P.f).tableros), ["a", "b", "c", "f1", "f2"], "un nombre del que no sale una fuente se omite");
}
{
  const w = mundo(base());
  await cargarMenu(w.P);
  delete w.carpetas.facturacion;
  const e2 = await cargarMenu(w.P);
  igual([...w.P.hermanas.keys()], ["ventas"], "`hermanas` se vacía y se vuelve a llenar en cada lectura completa");
  igual(e2.hermanos.map(h => h.carpeta), ["ventas"], "el estado trae sólo las hermanas que se leyeron");
}
{
  const c = base(); c.facturacion.catalogo = cat(T("a", { titulo: "Repetido" }), T("f2"));
  c.facturacion.lista = ["a.json", "f2.json"];
  const w = mundo(c);
  const m = armarMenu(await cargarMenu(w.P), w.P.f);
  igual(m.tableros.filter(t => t.id === "a").map(t => [t.titulo, t.origen || null]), [["Tablero a", null]], "id repetido entre carpetas: gana la carpeta del enlace");
}
{
  const w = mundo(base(), { ajustar: (ts, fx) => ts.filter(t => t.id !== "f2" && t.id !== "b") });
  const e = await cargarMenu(w.P);
  igual(w.ajustes.sort(), ["facturacion", "ventas"], "el ajuste de la vista se aplica a cada hermana al leerla");
  const m = armarMenu(e, w.P.f, w.P.ajustar);
  igual([ids(m.tableros), w.ajustes.includes("indicadores")], [["a", "c", "f1", "v1"], true], "y al menú ya unido, con la fuente del enlace");
}
{
  const f = { tipo: "carpeta", nombre: "local" };
  const t = [{ id: "a", titulo: "A", archivo: "a.json", origen: "se queda" }];
  igual(armarMenu({ datos: { titulo: "x" }, propia: t, hermanos: [] }, f).tableros, t, "una fuente local no pasa por la unión: los tableros quedan como llegaron");
}

/* ================= 5. al abrir un tablero sólo se relee el catálogo de su carpeta ================= */
for (const n of [1, 3, 11]) {
  const w = mundo(conHermanas(n));
  const e = await cargarMenu(w.P);
  w.log.length = 0;
  const e2 = await alAbrir({ ...w.P, estado: e, id: "x" + Math.ceil(n / 2) });
  const h = "h" + Math.ceil(n / 2);
  igual(w.log, ["cat:" + h, "lista:" + h], "abrir un tablero de una hermana con " + n + " hermanas: sólo se relee el catálogo y la lista de esa hermana");
  igual([e2.hermanos.filter((x, i) => x !== e.hermanos[i]).map(x => x.carpeta), e2.propia === e.propia], [[h], true], "con " + n + " hermanas, las demás carpetas conservan lo ya leído (mismos objetos)");
}
for (const n of [1, 3, 11]) {
  const w = mundo(conHermanas(n));
  const e = await cargarMenu(w.P);
  w.log.length = 0;
  const e2 = await alAbrir({ ...w.P, estado: e, id: "b" });
  igual([w.log, e2.hermanos === e.hermanos], [["cat:indicadores", "lista:indicadores"], true], "abrir un tablero de la carpeta propia con " + n + " hermanas: sólo se relee la propia");
}
{
  const w = mundo(base());
  const e = await cargarMenu(w.P);
  w.log.length = 0;
  await alAbrir({ ...w.P, estado: e, id: "f1" });
  igual([cuenta(w.log, "cat:"), cuenta(w.log, "enum"), cuenta(w.log, "meta:")], [1, 0, 0], "abrir un tablero: una sola petición de catálogo, sin enumerar carpetas ni pedir metadatos");
}
{
  const w = mundo(base());
  const e = await cargarMenu(w.P);
  w.carpetas.ventas.catalogo = cat(T("v1"), T("v2")); w.carpetas.ventas.lista = ["v1.json", "v2.json"];
  w.carpetas.facturacion.catalogo = cat(T("f1"));
  const e2 = await alAbrir({ ...w.P, estado: e, id: "f1" });
  igual(ids(armarMenu(e2, w.P.f).tableros), ["a", "b", "c", "f1", "v1"], "sólo cambia lo de la carpeta abierta: lo nuevo de otra carpeta espera a la próxima lectura completa");
  const e3 = await alAbrir({ ...w.P, estado: e2, id: null });
  igual(ids(armarMenu(e3, w.P.f).tableros), ["a", "b", "c", "f1", "v1", "v2"], "al volver a la portada (sin id) se lee el menú completo");
}
{
  const w = mundo(base());
  const e = await cargarMenu(w.P);
  w.carpetas.facturacion.lista = ["f2.json"];
  const e2 = await alAbrir({ ...w.P, estado: e, id: "f1" });
  igual(ids(armarMenu(e2, w.P.f).tableros).includes("f1"), false, "un archivo que dejó de ser legible desaparece del menú al abrir su tablero");
}
{
  const w = mundo(base());
  const e = await cargarMenu(w.P);
  w.carpetas.facturacion.catalogo = cat(T("f2"));
  const e2 = await alAbrir({ ...w.P, estado: e, id: "f1" });
  igual(ids(armarMenu(e2, w.P.f).tableros), ["a", "b", "c", "f2", "v1"], "un tablero que salió del catálogo de su carpeta desaparece al abrirlo");
}
{
  const w = mundo(base());
  const e = await cargarMenu(w.P);
  w.carpetas.facturacion.lista = [{ nombre: "f1.json", bytes: 555, modificado: "2027-01-01T00:00:00Z" }, "f2.json"];
  const m = armarMenu(await alAbrir({ ...w.P, estado: e, id: "f1" }), w.P.f);
  igual(m.tableros.find(t => t.id === "f1").meta, { id: "f1.json", nombre: "f1.json", bytes: 555, modificado: "2027-01-01T00:00:00Z" }, "t.meta se actualiza con la lista nueva de su carpeta");
}
{
  const w = mundo(base());
  const e = await cargarMenu(w.P);
  w.carpetas.indicadores.catalogo = { ...cat(T("a"), T("b"), T("c")), titulo: "Otro título" };
  const m = armarMenu(await alAbrir({ ...w.P, estado: e, id: "a" }), w.P.f);
  igual([m.titulo, ids(m.tableros)], ["Otro título", ["a", "b", "c", "f1", "f2", "v1"]], "al releer la carpeta propia se actualizan sus campos y se conservan las hermanas");
}
{
  const w = mundo(base());
  const e = await cargarMenu(w.P);
  w.carpetas.facturacion.catalogo = err("no-existe", 404);
  const antes = e.hermanos.length;
  const e2 = await alAbrir({ ...w.P, estado: e, id: "f1" });
  igual([ids(armarMenu(e2, w.P.f).tableros), [...w.P.hermanas.keys()], e.hermanos.length === antes], [["a", "b", "c", "v1"], ["ventas"], true], "si la hermana abierta ya no se puede leer deja de ofrecerse, sin lanzar, y no se toca el estado anterior");
}
{
  const w = mundo(base());
  const e = await cargarMenu(w.P);
  w.carpetas.indicadores.catalogo = err("sin-permiso", 403);
  const x = await falla(() => alAbrir({ ...w.P, estado: e, id: "a" }));
  igual([x && x.message, x && x.origen && x.origen.codigo], ["texto sin-permiso", "sin-permiso"], "si la carpeta propia no se puede leer el error se propaga con su origen (para mostrar el catálogo vacío)");
}
{
  const w = mundo(base());
  const e = await cargarMenu(w.P);
  w.carpetas.indicadores.lista = err("sin-sesion", 401);
  const x = await falla(() => alAbrir({ ...w.P, estado: e, id: "b" }));
  igual(x && x.message, "ERR:sin-sesion", "un error de sesión al releer la lista propia se muestra");
}
{
  const w = mundo(base());
  const e = await cargarMenu(w.P);
  w.log.length = 0;
  await alAbrir({ ...w.P, estado: e, id: "no-existe" });
  igual([cuenta(w.log, "enum"), cuenta(w.log, "cat:")], [1, 3], "un id que no está en el menú lleva a leer el menú completo");
  w.log.length = 0;
  await alAbrir({ ...w.P, estado: null, id: "a" });
  igual(cuenta(w.log, "enum"), 1, "sin nada leído antes, se lee el menú completo");
}
{
  const w = mundo(base());
  const e = await cargarMenu(w.P);
  w.P.hermanas.delete("ventas"); w.log.length = 0;
  const e2 = await alAbrir({ ...w.P, estado: e, id: "v1" });
  igual([w.log, e2 === e], [[], true], "una hermana sin fuente guardada no lee nada y deja el estado igual");
}
{
  const c = base(); c.facturacion.catalogo = cat(T("a", { titulo: "Repetido" }), T("f1"));
  c.facturacion.lista = ["a.json", "f1.json"];
  const w = mundo(c);
  const e = await cargarMenu(w.P);
  w.log.length = 0;
  await alAbrir({ ...w.P, estado: e, id: "a" });
  igual(w.log, ["cat:indicadores", "lista:indicadores"], "con un id repetido manda la carpeta del enlace, la que se relee");
}
{
  const w = mundo(base(), { ajustar: (ts) => ts.filter(t => t.id !== "f2") });
  const e = await cargarMenu(w.P);
  w.ajustes.length = 0;
  const e2 = await alAbrir({ ...w.P, estado: e, id: "f1" });
  const llamadas = [...w.ajustes];
  igual([llamadas, ids(armarMenu(e2, w.P.f, w.P.ajustar).tableros)], [["indicadores", "facturacion"], ["a", "b", "c", "f1", "v1"]], "el ajuste de la vista se aplica también al releer una hermana");
}
{
  const w = mundo(base());
  const e = await cargarMenu(w.P);
  const fotoAntes = JSON.stringify(e);
  w.carpetas.facturacion.catalogo = cat(T("f1"), T("f9")); w.carpetas.facturacion.lista = ["f1.json", "f9.json"];
  await alAbrir({ ...w.P, estado: e, id: "f1" });
  igual(JSON.stringify(e), fotoAntes, "alAbrir no modifica el estado que recibe");
  const e2 = await alAbrir({ ...w.P, estado: e, id: "f1" });
  igual(e2.hermanos.map(h => h.carpeta), ["facturacion", "ventas"], "la hermana releída conserva su lugar en el orden");
}

/* ================= 6. la relectura de los tableros de datos sigue con el meta nuevo ================= */
{
  const w = mundo({ indicadores: { catalogo: cat(T("a")), lista: [{ nombre: "a.json", bytes: 1000, modificado: "2026-05-01T10:00:00Z" }] } });
  const t = (await leerCarpeta(w.P)).tableros[0];
  const ahora = { id: "a.json", nombre: "a.json", bytes: 1000, modificado: "2026-05-01T10:00:00Z" };
  igual(cambio(t.meta, ahora), false, "revisarTablero: mismo archivo, `cambio` da false con el meta de la lista");
  igual(cambio(t.meta, { ...ahora, modificado: "2026-05-02T10:00:00Z" }), true, "revisarTablero: otra fecha, `cambio` da true");
  igual(cambio(t.meta, { ...ahora, bytes: 1001 }), true, "revisarTablero: otro tamaño, `cambio` da true");
}

/* ================= 7. archivosDeCarpeta (graph.js) con un servidor simulado ================= */
const memoria = () => { const m = new Map(); return { getItem: k => m.has(k) ? m.get(k) : null, setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k), volcado: () => JSON.stringify([...m]) }; };
globalThis.sessionStorage = memoria();
globalThis.localStorage = memoria();
globalThis.location = { hostname: "pruebas.invalid", href: "https://pruebas.invalid/", origin: "https://pruebas.invalid", pathname: "/", search: "", hash: "" };
sessionStorage.setItem("sit.sesion", JSON.stringify({ refresh_token: "r", sp: true, host: "h.invalid", tokens: { graph: { t: "tg", vence: Date.now() + 3.6e6 }, sp: { t: "ts", vence: Date.now() + 3.6e6 } } }));
const almacenAntes = sessionStorage.volcado() + localStorage.volcado();
const { FuenteSP, ErrorGraph } = await import("../sitio/graph.js");
let peticiones = [], inits = [], servidor = () => ({ estado: 404 });
globalThis.fetch = async (url, init) => {
  peticiones.push(String(url)); inits.push(init);
  const r = servidor(String(url), init);
  if (r.cae) throw new TypeError("sin red");
  return { ok: r.estado >= 200 && r.estado < 300, status: r.estado, headers: { get: () => null }, json: async () => r.json, arrayBuffer: async () => new ArrayBuffer(0) };
};
const CARPETA = "/personal/u/Documents/Raiz/indicadores";
const fSP = new FuenteSP("h.invalid", CARPETA);
const lista = async (f = fSP) => { peticiones = []; inits = []; return f.archivosDeCarpeta(); };
const fila = (k, i) => ({ Name: "f" + k + "_" + i + ".json", Length: String(10 + i), TimeLastModified: "2026-01-0" + (k % 9 + 1) + "T00:00:00Z" });
const URL_BASE = "https://h.invalid/personal/u/_api/web/GetFolderByServerRelativePath(decodedurl='" + CARPETA + "')/Files?$select=Name,Length,TimeLastModified&$top=1000";
const pagina = (k, cuantos, clave, siguiente) => ({ estado: 200, json: { value: Array.from({ length: cuantos }, (_, i) => fila(k, i)), ...(siguiente ? { [clave]: siguiente } : {}) } });

servidor = () => ({ estado: 200, json: { value: [{ Name: "a.json", Length: "1234", TimeLastModified: "2026-03-01T10:00:00Z" }, { Name: "b.json", Length: 7, TimeLastModified: "2026-03-02T10:00:00Z" }, { Nombre: "x" }, null, { Name: 5 }] } });
igual(await lista(), [{ nombre: "a.json", bytes: 1234, modificado: "2026-03-01T10:00:00Z" }, { nombre: "b.json", bytes: 7, modificado: "2026-03-02T10:00:00Z" }], "archivosDeCarpeta: nombre, bytes (número) y fecha; los renglones sin nombre se ignoran");
igual([peticiones.length, decodeURIComponent(peticiones[0])], [1, decodeURIComponent(URL_BASE)], "archivosDeCarpeta: una petición a /Files con Name, Length y TimeLastModified");
igual(peticiones[0].startsWith("https://h.invalid/personal/u/_api/web/GetFolderByServerRelativePath(decodedurl='"), true, "archivosDeCarpeta: la API REST del sitio que contiene la carpeta");
igual(inits[0].headers.Accept, "application/json;odata=nometadata", "archivosDeCarpeta: pide el JSON sin metadatos de OData");
igual(inits[0].cache, "no-store", "archivosDeCarpeta: sin caché HTTP");
igual(inits[0].headers.Authorization, "Bearer ts", "archivosDeCarpeta: con el token de SharePoint de la persona");

servidor = () => ({ estado: 200, json: {} });
igual(await lista(), [], "archivosDeCarpeta: sin `value` devuelve una lista vacía");

servidor = () => ({ estado: 200, json: { value: [] } });
await lista(new FuenteSP("h.invalid", "/personal/u/Documents/Raíz/O'Brien ventas"));
igual([peticiones[0].includes("Ra%C3%ADz"), peticiones[0].includes("O''Brien%20ventas"), peticiones.length], [true, true, 1], "archivosDeCarpeta: acentos codificados y apóstrofo duplicado en la ruta");
await lista(new FuenteSP("h.invalid", "/sites/equipo/Documents/Carpeta"));
igual(peticiones[0].startsWith("https://h.invalid/sites/equipo/_api/web/GetFolderByServerRelativePath("), true, "archivosDeCarpeta: el sitio /sites/<x> es la base");

for (const clave of ["odata.nextLink", "@odata.nextLink", "__next"]) {
  servidor = u => u.includes("skiptoken=p3") ? pagina(3, 500) : u.includes("skiptoken=p2") ? pagina(2, 1000, clave, URL_BASE + "&$skiptoken=p3") : pagina(1, 1000, clave, URL_BASE + "&$skiptoken=p2");
  const todos = await lista();
  igual([peticiones.length, todos.length, todos[0].nombre, todos[1000].nombre, todos[2499].nombre], [3, 2500, "f1_0.json", "f2_0.json", "f3_499.json"], "archivosDeCarpeta: sigue la paginación con " + clave + " (3 páginas, 2500 archivos, en orden)");
}
servidor = u => u.includes("skiptoken=p2") ? pagina(2, 1) : pagina(1, 1, "odata.nextLink", "/personal/u/_api/web/GetFolderByServerRelativePath(decodedurl='x')/Files?$skiptoken=p2");
{
  const todos = await lista();
  igual([peticiones.length, peticiones[1].startsWith("https://h.invalid/personal/u/_api/"), todos.length], [2, true, 2], "archivosDeCarpeta: una dirección de página relativa se resuelve contra el sitio");
}
for (const [rotulo, sig] of [["otro dominio", "https://otro.invalid/personal/u/_api/web/Files?$skiptoken=p2"], ["http sin cifrar", "http://h.invalid/personal/u/_api/web/Files?$skiptoken=p2"], ["fuera de la API", "https://h.invalid/personal/u/Documents/x?$skiptoken=p2"], ["texto sin sentido", "https://"]]) {
  servidor = () => pagina(1, 3, "odata.nextLink", sig);
  const e = await falla(lista);
  igual([e instanceof ErrorGraph, e && e.codigo, peticiones.length], [true, "graph", 1], "archivosDeCarpeta: una página siguiente en " + rotulo + " falla y no se pide (el token no sale)");
}
{
  let k = 0;
  servidor = () => pagina(++k, 1000, "odata.nextLink", URL_BASE + "&$skiptoken=p" + (k + 1));
  const e = await falla(lista);
  igual([e instanceof ErrorGraph, e && e.codigo, peticiones.length], [true, "graph", 6], "archivosDeCarpeta: con más de 5000 archivos falla (ErrorGraph graph) en cuanto se pasa");
}
{
  let k = 0;
  servidor = () => pagina(++k, 1, "odata.nextLink", URL_BASE + "&$skiptoken=p" + (k + 1));
  const e = await falla(lista);
  igual([e instanceof ErrorGraph, e && e.codigo, peticiones.length], [true, "graph", 10], "archivosDeCarpeta: una lista que nunca termina se corta en 10 páginas");
}
for (const [estado, codigo] of [[403, "sin-permiso"], [404, "no-existe"], [500, "graph"]]) {
  servidor = () => ({ estado });
  const e = await falla(lista);
  igual([e instanceof ErrorGraph, e && e.codigo, e && e.estado], [true, codigo, estado], "archivosDeCarpeta: " + estado + " es ErrorGraph " + codigo + ", como metadatos");
}
servidor = () => ({ cae: true });
{
  const e = await falla(lista);
  igual([e instanceof ErrorGraph, e && e.codigo], [true, "red"], "archivosDeCarpeta: sin conexión es ErrorGraph red, como metadatos");
}
igual(sessionStorage.volcado() + localStorage.volcado(), almacenAntes, "archivosDeCarpeta: no escribe en el almacenamiento del navegador");

/* ================= 8. estáticas ================= */
{
  const app = leer("../sitio/app.js"), menu = leer("../sitio/menu_carga.js"), graph = leer("../sitio/graph.js");
  igual(/import \{ cargarMenu, armarMenu, alAbrir \} from "\.\/menu_carga\.js";/.test(app), true, "app.js usa menu_carga.js");
  igual([/async function cargarCatalogo\(f, archivo\) \{\s*estadoMenu = await cargarMenu\(/.test(app), /try \{ portal = await releerMenu\(id\); \}/.test(app), /cargarHermanas/.test(app), /\bmetadatos\(t\.archivo\)\)\);/.test(app)], [true, true, false, false], "app.js: cargarCatalogo y mostrarTablero usan el módulo; ya no hay cargarHermanas ni un metadatos por tablero");
  igual(/const ahora = await fuenteDe\(t\)\.metadatos\(t\.archivo\);\s*if \(cambio\(t\.meta, ahora\)/.test(app), true, "app.js: revisarTablero sigue comparando t.meta con los metadatos del archivo");
  igual(/hrefInicio: "#\/"/.test(app) && /tablerosDeSuLista/.test(app) && /listarHermanas/.test(app) && /fuenteHermana/.test(app), true, "app.js conserva la portada, la vista de otra persona, las hermanas y su enumeración");
  igual(/extras = null; hermanas\.clear\(\); estadoMenu = null;/.test(app) && (app.match(/estadoMenu = null/g) || []).length >= 4, true, "app.js: lo leído se olvida al cerrar sesión, al olvidar el equipo y con el catálogo vacío");
  igual((menu.match(/^import .* from "(.*)";$/gm) || []).map(l => /from "(.*)"/.exec(l)[1]), ["./catalogos.js"], "menu_carga.js sólo importa catalogos.js (módulo puro)");
  igual(/carpetasALeer|unirCatalogos|nombreDeCarpeta/.test(menu), true, "menu_carga.js usa carpetasALeer, unirCatalogos y nombreDeCarpeta de catalogos.js");
  igual(/\bdocument\b|\bwindow\b|fetch\(|XMLHttpRequest|localStorage|sessionStorage|innerHTML|insertAdjacentHTML|\beval\(|new Function|blob:/.test(menu), false, "menu_carga.js: sin DOM, red, almacenamiento ni HTML o código dinámico");
  igual(/async archivosDeCarpeta\(\)/.test(graph) && /\$top=" \+ LISTA_PAGINA/.test(graph) && /async metadatos\(rel\)/.test(graph), true, "graph.js: archivosDeCarpeta nueva y metadatos conservado");
  igual(/[\u00ab\u00bb]/.test(menu + graph), false, "menu_carga.js y graph.js: sin comillas angulares de cita");
}

console.log("menu_carga: " + ok + " de " + (ok + mal) + " pruebas bien");
process.exit(mal ? 1 : 0);
