// Pruebas de la carga de un tablero embebido (orden y número de peticiones, sello, compresión, relectura por catálogo y tope de
// lectura), sin navegador ni red: node pruebas/carga_tablero.prueba.js
// La fuente es simulada y registra cada petición; catálogos, archivos y sellos son de textos inventados.
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { gzipSync } from "node:zlib";
import { cargarTablero, releerPorCatalogo } from "../sitio/carga_tablero.js";
import { leerConTope, ErrorTope, DEMASIADO_GRANDE } from "../sitio/lecturatope.js";
import { MENSAJES } from "../sitio/compresion.js";

let ok = 0, mal = 0;
const igual = (a, b, nombre) => {
  const A = JSON.stringify(a), B = JSON.stringify(b);
  if (A === B) ok++; else { mal++; console.log("FALLA:", nombre, "\n  obtenido:", A, "\n  esperado:", B); }
};
const leer = r => readFileSync(new URL(r, import.meta.url), "utf8");
const falla = async f => { try { await f(); return null; } catch (e) { return e; } };

const enc = s => new TextEncoder().encode(s).buffer;
const hex = buf => createHash("sha256").update(Buffer.from(buf)).digest("hex");
const tick = () => new Promise(r => setImmediate(r));
const CATALOGO = "sit-catalogo.json";

/* ---------- datos de ejemplo ---------- */
const T1 = enc("<html>tablero de prueba, version 1</html>");
const T2 = enc("<html>tablero de prueba, version 2</html>");
const T3 = enc("<html>tablero de prueba, version 3</html>");
const S1 = hex(T1), S2 = hex(T2), S3 = hex(T3);
const renglon = (sello, extra = {}) => ({ id: "t1", tipo: "embebido", titulo: "Tablero de prueba", archivo: "t1.html", ...(sello === undefined ? {} : { sha256: sello }), ...extra });
const IDN = { gerencia: { id: "comercial" }, etiquetas: ["Comercial"], accesoRoto: false, entrada: true, carpetas: ["facturacion"] };

const CRUDO = "<html>" + "tablero comprimido de prueba ".repeat(60) + "</html>";
const CRUDO_BUF = Buffer.from(CRUDO);
const GZ = (() => { const g = gzipSync(CRUDO_BUF); return g.buffer.slice(g.byteOffset, g.byteOffset + g.length); })();
const filaGz = (extra = {}) => ({ id: "t1", tipo: "embebido", titulo: "Tablero comprimido", archivo: "t1.html.gz", compresion: "gzip", sha256: hex(GZ), bytes: GZ.byteLength, bytes_descomprimidos: CRUDO_BUF.length, sha256_descomprimido: hex(CRUDO_BUF), ...extra });

/* ---------- el mundo simulado ----------
   cat(k): catálogo en la k-ésima lectura (objeto, texto o Error) · archivo(k, ruta): contenido (ArrayBuffer o Error) */
function armar(opc = {}) {
  const log = [], n = { cat: 0, arch: 0, perfil: 0, identidad: 0, hermana: 0, sha: 0 }, rutas = [], esperas = [], marcas = [];
  const eventos = { perfil: [], encontrado: [], reintento: [], cambioRenglon: [], preparando: 0 };
  const origenDe = nombre => ({
    nombre,
    carpeta: "/sites/ejemplo/Documents/" + (nombre || "indicadores"),
    leer: async ruta => {
      const etiqueta = (nombre ? nombre + "/" : "") + ruta;
      log.push("ini:" + etiqueta); await tick(); log.push("fin:" + etiqueta);
      if (ruta === CATALOGO) {
        n.cat++;
        const c = opc.cat(n.cat);
        if (c instanceof Error) throw c;
        return enc(typeof c === "string" ? c : JSON.stringify(c));
      }
      n.arch++; rutas.push(etiqueta);
      const a = opc.archivo(n.arch, ruta);
      if (a instanceof Error) throw a;
      return a;
    },
  });
  const fuente = origenDe(null);
  const hermana = origenDe("facturacion");
  const params = {
    id: "t1", o: opc.o === undefined ? null : opc.o, fuente, rutaCatalogo: CATALOGO,
    perfil: async () => { n.perfil++; log.push("ini:perfil"); await tick(); log.push("fin:perfil"); if (opc.perfilFalla) throw new Error("sin perfil"); return { nombre: "Persona Ficticia", departamento: "Ventas", llave: "x" }; },
    identidad: async (f, p) => { n.identidad++; opc.alIdentidad && opc.alIdentidad(f, p); log.push("ini:acceso"); await tick(); log.push("fin:acceso"); return opc.idn || IDN; },
    fuenteHermana: (f, carpeta) => { n.hermana++; return opc.sinHermana ? null : (carpeta === "facturacion" ? hermana : origenDe(carpeta)); },
    visiblesParaGerencia: opc.visibles || ((ts) => ts),
    esAdministrador: et => Array.isArray(et) && et.includes("Administrador"),
    catalogoNoDisponible: e => !!e && e.codigo === "no-existe",
    sha256: async b => { n.sha++; return hex(b); },
    esperar: async ms => { esperas.push(ms); },
    marca: nombre => marcas.push(nombre),
    ui: {
      perfil: p => eventos.perfil.push(p && p.nombre),
      encontrado: t => eventos.encontrado.push(t.id),
      reintento: a => eventos.reintento.push(a),
      cambioRenglon: t => eventos.cambioRenglon.push(t.archivo),
      preparando: () => { eventos.preparando++; },
    },
  };
  return { params, log, n, rutas, esperas, marcas, eventos, fuente, hermana };
}
async function correr(opc) { const m = armar(opc); const res = await cargarTablero(m.params); return { res, ...m }; }
const pos = (log, s) => log.indexOf(s);

/* ================= 1. sin `o`: tres peticiones en fila ================= */
{
  const { res, log, n, rutas, marcas, eventos, fuente } = await correr({ cat: () => ({ contrato: "visor/1", tableros: [renglon(S1)] }), archivo: () => T1 });
  igual(res.estado, "ok", "sin o: ok");
  igual(res.html, "<html>tablero de prueba, version 1</html>", "sin o: el HTML del tablero");
  igual([res.t.id, res.origen === fuente, res.idn.entrada], ["t1", true, true], "sin o: devuelve el renglón, la fuente y la identidad");
  const iPerfil = pos(log, "ini:perfil"), fPerfil = pos(log, "fin:perfil");
  const iAcc = pos(log, "ini:acceso"), fAcc = pos(log, "fin:acceso"), iCat = pos(log, "ini:" + CATALOGO), fCat = pos(log, "fin:" + CATALOGO), iArch = pos(log, "ini:t1.html");
  igual([iPerfil, fPerfil].every(i => i >= 0) && iPerfil < fPerfil, true, "sin o: el perfil va primero");
  igual(fPerfil < Math.min(iAcc, iCat), true, "sin o: acceso y catálogo empiezan después de terminar el perfil");
  igual(Math.max(iAcc, iCat) < Math.min(fAcc, fCat), true, "sin o: acceso y catálogo corren a la vez (los dos empiezan antes de que termine alguno)");
  igual(iArch > Math.max(fAcc, fCat), true, "sin o: el archivo se pide después de acceso y catálogo");
  igual(log.filter(x => x.startsWith("ini:")).length, 4, "sin o: 4 lecturas en total (perfil, acceso, catálogo, archivo), 3 en fila");
  igual([n.perfil, n.identidad, n.cat, n.arch], [1, 1, 1, 1], "sin o: perfil una sola vez, un acceso, un catálogo, un archivo");
  igual(rutas, ["t1.html"], "sin o: el archivo que dice el renglón");
  igual(marcas, ["perfil", "acceso y catálogo", "archivo"], "sin o: marcas de tiempo en orden, sin metadatos");
  igual([eventos.perfil, eventos.encontrado, eventos.reintento.length, eventos.cambioRenglon.length, eventos.preparando], [["Persona Ficticia"], ["t1"], 0, 0, 0], "sin o: la interfaz recibe el perfil una vez y el tablero encontrado");
}

/* ---- el origen simulado no tiene `metadatos`: pedirlo sería un error ---- */
{
  const m = armar({ cat: () => ({ contrato: "visor/1", tableros: [renglon(S1)] }), archivo: () => T1 });
  igual(typeof m.fuente.metadatos, "undefined", "la fuente simulada no ofrece metadatos");
  igual((await cargarTablero(m.params)).estado, "ok", "sin metadatos la carga funciona");
}

/* ---- perfil que falla: se sigue con {} ---- */
{
  let recibido = null;
  const { res, n } = await correr({ perfilFalla: true, alIdentidad: (_f, p) => { recibido = p; }, cat: () => ({ contrato: "visor/1", tableros: [renglon(S1)] }), archivo: () => T1 });
  igual([res.estado, recibido, n.perfil], ["ok", {}, 1], "perfil que falla: sigue con un perfil vacío y no lo vuelve a pedir");
}

/* ---- identidad recibe la fuente y el perfil ---- */
{
  let args = null;
  const m = armar({ alIdentidad: (f, p) => { args = [f === m.fuente, p.nombre]; }, cat: () => ({ contrato: "visor/1", tableros: [renglon(S1)] }), archivo: () => T1 });
  await cargarTablero(m.params);
  igual(args, [true, "Persona Ficticia"], "identidad se llama con la fuente del enlace y el perfil");
}

/* ================= 2. con `o`: el acceso va antes ================= */
{
  const { res, log, n, rutas, hermana } = await correr({ o: "facturacion", cat: () => ({ contrato: "visor/1", tableros: [renglon(S1)] }), archivo: () => T1 });
  igual(res.estado, "ok", "con o: ok");
  igual(res.origen === hermana, true, "con o: el origen es la carpeta hermana");
  igual(pos(log, "fin:acceso") < pos(log, "ini:facturacion/" + CATALOGO), true, "con o: el acceso termina antes de pedir el catálogo");
  igual(pos(log, "fin:perfil") < pos(log, "ini:acceso"), true, "con o: el perfil va antes que el acceso");
  igual(pos(log, "fin:facturacion/" + CATALOGO) < pos(log, "ini:facturacion/t1.html"), true, "con o: el archivo va después del catálogo");
  igual(log.filter(x => x.startsWith("ini:")).length, 4, "con o: 4 lecturas, todas en serie");
  igual(log.some(x => x === "ini:" + CATALOGO || x === "ini:t1.html"), false, "con o: nada se lee de la carpeta del enlace");
  igual(rutas, ["facturacion/t1.html"], "con o: el archivo sale de la carpeta hermana");
  igual([n.perfil, n.identidad, n.hermana], [1, 1, 1], "con o: perfil y acceso una sola vez");
}
{
  const { res, n, log } = await correr({ o: "contabilidad", cat: () => ({ contrato: "visor/1", tableros: [renglon(S1)] }), archivo: () => T1 });
  igual([res.estado, n.cat, n.arch, n.hermana], ["no_existe", 0, 0, 0], "con o que no le toca (no está en su lista): no_existe y no se lee nada");
  igual(log.some(x => x.includes(CATALOGO)), false, "con o que no le toca: ni el catálogo");
}
{
  const { res, n } = await correr({ o: "contabilidad", idn: { ...IDN, etiquetas: ["Administrador"], carpetas: [] }, cat: () => ({ contrato: "visor/1", tableros: [renglon(S1)] }), archivo: () => T1 });
  igual([res.estado, n.hermana], ["ok", 1], "con o: Administrador abre cualquier carpeta hermana válida");
}
for (const o of ["acceso", "marca", "indicadores", "../x", "a/b", "", "facturación"]) {
  const { res, n } = await correr({ o, idn: { ...IDN, etiquetas: ["Administrador"], carpetas: ["facturacion"] }, cat: () => ({ contrato: "visor/1", tableros: [renglon(S1)] }), archivo: () => T1 });
  igual([res.estado, n.cat], ["no_existe", 0], "con o no válida '" + o + "': no_existe sin leer el catálogo");
}
{
  const { res, n } = await correr({ o: "facturacion", sinHermana: true, cat: () => ({ contrato: "visor/1", tableros: [renglon(S1)] }), archivo: () => T1 });
  igual([res.estado, n.cat], ["no_existe", 0], "con o: si la fuente no puede abrir la hermana, no_existe");
}

/* ================= 3. catálogo ================= */
{
  const e = Object.assign(new Error("no existe"), { codigo: "no-existe" });
  const { res, n, identidad } = await correr({ cat: () => e, archivo: () => T1 }).then(x => ({ ...x, identidad: x.n.identidad }));
  igual([res.estado, n.arch, identidad], ["catalogo", 0, 1], "catálogo no disponible: aviso, sin leer el archivo (el acceso ya se había pedido)");
}
{
  const e = Object.assign(new Error("fallo del servidor"), { codigo: "graph" });
  const m = armar({ cat: () => e, archivo: () => T1 });
  const err = await falla(() => cargarTablero(m.params));
  igual([err === e, m.n.arch], [true, 0], "otro error de lectura del catálogo: se propaga igual");
}
{
  const e = Object.assign(new Error("sin permiso"), { codigo: "no-existe" });
  const m = armar({ o: "facturacion", cat: () => e, archivo: () => T1 });
  igual((await cargarTablero(m.params)).estado, "catalogo", "con o: catálogo no disponible también avisa");
}
{
  const m = armar({ cat: () => ({ contrato: "otro/9", tableros: [] }), archivo: () => T1 });
  const err = await falla(() => cargarTablero(m.params));
  igual(err && err.message, "El catálogo no tiene el formato esperado.", "contrato que no es visor/1: error del catálogo");
}
{
  const m = armar({ cat: () => ({ contrato: "visor/1" }), archivo: () => T1 });
  igual((await falla(() => cargarTablero(m.params))).message, "El catálogo no tiene el formato esperado.", "catálogo sin lista de tableros: error del catálogo");
}
{
  const m = armar({ cat: () => "{ no es json", archivo: () => T1 });
  igual((await falla(() => cargarTablero(m.params))) instanceof SyntaxError, true, "catálogo que no es JSON: se propaga el error");
}
{
  const { res, n } = await correr({ cat: () => ({ contrato: "visor/1", tableros: [renglon(S1, { id: "otro" })] }), archivo: () => T1 });
  igual([res.estado, n.arch], ["no_existe", 0], "el tablero no está en el catálogo: no_existe sin bajar nada");
}
{
  const { res, n } = await correr({ cat: () => ({ contrato: "visor/1", tableros: [renglon(S1, { tipo: "enlace" })] }), archivo: () => T1 });
  igual([res.estado, n.arch], ["no_existe", 0], "un renglón que no es embebido: no_existe");
}
{
  const { res, n } = await correr({ cat: () => ({ contrato: "visor/1", tableros: [{ id: "t1", tipo: "embebido" }] }), archivo: () => T1 });
  igual([res.estado, n.arch], ["no_existe", 0], "un renglón embebido sin archivo: no_existe");
}
{
  const { res, n } = await correr({ visibles: () => [], cat: () => ({ contrato: "visor/1", tableros: [renglon(S1)] }), archivo: () => T1 });
  igual([res.estado, n.arch], ["no_existe", 0], "un tablero que no le toca por su gerencia: no_existe sin bajar nada");
}
{
  let vio = null;
  await correr({ visibles: (ts, g, et) => { vio = [ts.length, g.id, et]; return ts; }, cat: () => ({ contrato: "visor/1", tableros: [renglon(S1), null, { sin: "id" }] }), archivo: () => T1 });
  igual(vio, [1, "comercial", ["Comercial"]], "visiblesParaGerencia recibe los renglones con id, la gerencia y las etiquetas de la identidad");
}

/* ================= 4. sello y reintentos ================= */
{
  const { res, n, esperas, eventos } = await correr({ cat: () => ({ contrato: "visor/1", tableros: [renglon(S3)] }), archivo: () => T1 });
  igual(res.estado, "sello", "sello que nunca cuadra: sello");
  igual([n.cat, n.arch, esperas.length], [11, 11, 10], "sello que nunca cuadra: 1 intento más 10 reintentos, releyendo catálogo y archivo");
  igual(esperas.every(ms => ms === 30000), true, "sello que nunca cuadra: espera de 30 s entre intentos");
  igual(eventos.reintento.length, 10, "sello que nunca cuadra: 10 avisos de reintento");
  igual(res.html, undefined, "sello que nunca cuadra: no devuelve HTML");
}
{
  const { res, esperas, eventos, n } = await correr({ cat: () => ({ contrato: "visor/1", tableros: [renglon(S3)] }), archivo: k => k < 3 ? T2 : T3 });
  igual([res.estado, res.html], ["ok", "<html>tablero de prueba, version 3</html>"], "sello que cuadra al tercer intento: ok y con el HTML que cuadra");
  igual([esperas.length, eventos.reintento, n.cat, n.arch], [2, [{ intento: 1, de: 10 }, { intento: 2, de: 10 }], 3, 3], "sello que cuadra al tercer intento: 2 esperas y 2 avisos");
}
{
  const { res, n } = await correr({ cat: () => ({ contrato: "visor/1", tableros: [renglon(undefined)] }), archivo: () => T2 });
  igual([res.estado, n.sha], ["ok", 0], "renglón sin sello: no se compara");
}
{
  const { res, n } = await correr({ cat: () => ({ contrato: "visor/1", tableros: [renglon(S1.toUpperCase())] }), archivo: () => T1 });
  igual(res.estado, "ok", "sello del renglón en mayúsculas: cuadra");
  igual(n.sha >= 1, true, "sello del renglón: se calculó");
}
{
  const { res, eventos, rutas } = await correr({
    cat: k => ({ contrato: "visor/1", tableros: [k === 1 ? renglon(S1) : renglon(S2, { archivo: "t1b.html" })] }),
    archivo: (k, ruta) => ruta === "t1.html" ? T3 : T2,
  });
  igual([res.estado, res.t.archivo, eventos.cambioRenglon, rutas], ["ok", "t1b.html", ["t1b.html"], ["t1.html", "t1b.html"]], "un reintento trae otro renglón: se sigue ese renglón y se avisa a la interfaz");
}
{
  const e = new Error("sin red");
  const m = armar({ cat: () => ({ contrato: "visor/1", tableros: [renglon(S1)] }), archivo: () => e });
  const err = await falla(() => cargarTablero(m.params));
  igual([err === e, m.esperas.length, m.n.arch], [true, 0, 1], "error al leer el archivo: se propaga sin reintentar");
}
{
  const m = armar({ cat: k => k === 1 ? ({ contrato: "visor/1", tableros: [renglon(S3)] }) : new Error("catálogo roto"), archivo: () => T1 });
  const err = await falla(() => cargarTablero(m.params));
  igual([err && err.message, m.esperas.length], ["catálogo roto", 1], "error al releer el catálogo en un reintento: se propaga");
}

/* ================= 5. compresión ================= */
{
  const { res, marcas, eventos, n, rutas } = await correr({ cat: () => ({ contrato: "visor/1", tableros: [filaGz()] }), archivo: () => GZ });
  igual([res.estado, res.html === CRUDO], ["ok", true], "gzip: se descomprime con el tamaño y el sello del renglón");
  igual([marcas, eventos.preparando, rutas], [["perfil", "acceso y catálogo", "archivo", "descomprimido"], 1, ["t1.html.gz"]], "gzip: marca 'descomprimido' y aviso de preparación");
  igual(n.sha >= 2, true, "gzip: se comprueba el sello del archivo y el del HTML");
}
{
  const { res, n } = await correr({ cat: () => ({ contrato: "visor/1", tableros: [filaGz({ compresion: "zip" })] }), archivo: () => GZ });
  igual([res.estado, res.mensaje, n.arch], ["aviso", MENSAJES.compresion, 0], "compresión que el sitio no acepta: aviso antes de bajar nada");
}
{
  const { sha256: _s, ...sinSello } = filaGz();
  const { res, n } = await correr({ cat: () => ({ contrato: "visor/1", tableros: [sinSello] }), archivo: () => GZ });
  igual([res.estado, res.mensaje, n.arch], ["aviso", MENSAJES.sello, 0], "gzip sin sello en el renglón: aviso antes de bajar nada");
}
{
  const { res, n } = await correr({ cat: () => ({ contrato: "visor/1", tableros: [filaGz({ bytes_descomprimidos: 0 })] }), archivo: () => GZ });
  igual([res.estado, res.mensaje, n.arch], ["aviso", MENSAJES.tamano, 0], "gzip con tamaño declarado inválido: aviso antes de bajar nada");
}
{
  const { res } = await correr({ cat: () => ({ contrato: "visor/1", tableros: [filaGz({ bytes_descomprimidos: CRUDO_BUF.length - 1 })] }), archivo: () => GZ });
  igual([res.estado, res.mensaje], ["aviso", "El tablero descomprimido pasa del tamaño declarado."], "gzip que pasa del tamaño declarado: aviso (tope)");
}
{
  const { res } = await correr({ cat: () => ({ contrato: "visor/1", tableros: [filaGz({ bytes_descomprimidos: CRUDO_BUF.length + 1 })] }), archivo: () => GZ });
  igual([res.estado, res.mensaje], ["aviso", "El tablero descomprimido no mide lo declarado."], "gzip que se queda corto del tamaño declarado: aviso");
}
{
  const { res } = await correr({ cat: () => ({ contrato: "visor/1", tableros: [filaGz({ sha256_descomprimido: "0".repeat(64) })] }), archivo: () => GZ });
  igual([res.estado, res.mensaje], ["aviso", "El tablero descomprimido no cuadra con su sello (sha256)."], "gzip con el sello del HTML equivocado: aviso");
}
{
  const plano = enc("<html>esto no es un archivo gzip</html>");
  const { res } = await correr({ cat: () => ({ contrato: "visor/1", tableros: [filaGz({ sha256: hex(plano), bytes: plano.byteLength })] }), archivo: () => plano });
  igual([res.estado, res.mensaje], ["aviso", "El archivo del tablero no está comprimido como se declaró."], "renglón gzip con un archivo que no es gzip: aviso");
}
{
  const { res, n, esperas } = await correr({ cat: () => ({ contrato: "visor/1", tableros: [filaGz()] }), archivo: () => T1 });
  igual([res.estado, n.arch, esperas.length], ["sello", 11, 10], "gzip: el sello del archivo comprimido se revisa antes de descomprimir");
}

/* ================= 6. relectura por catálogo ================= */
function origenRelectura(cats, archivos = {}) {
  const lecturas = [];
  let k = 0;
  return {
    lecturas,
    leer: async ruta => {
      lecturas.push(ruta);
      if (ruta === CATALOGO) { const c = cats[Math.min(k++, cats.length - 1)]; if (c instanceof Error) throw c; return enc(typeof c === "string" ? c : JSON.stringify(c)); }
      const a = archivos[ruta]; if (a instanceof Error) throw a; if (a === undefined) throw new Error("no existe " + ruta); return a;
    },
  };
}
const catalogo = (...ts) => ({ contrato: "visor/1", tableros: ts });
const sha = async b => hex(b);
const visto = renglon(S1, { bytes: 40 });
const relee = (origen, v = visto) => releerPorCatalogo({ origen, rutaCatalogo: CATALOGO, visto: v, sha256: sha });

{
  const o = origenRelectura([catalogo(visto)]);
  igual(await relee(o), { cambio: false }, "relectura sin cambio: no baja");
  igual(o.lecturas, [CATALOGO], "relectura sin cambio: una sola lectura, la del catálogo");
}
{
  const o = origenRelectura([catalogo({ ...visto }), catalogo({ ...visto }), catalogo({ ...visto })]);
  const r = [await relee(o), await relee(o), await relee(o)];
  igual([r.every(x => x.cambio === false), o.lecturas.length, o.lecturas.every(x => x === CATALOGO)], [true, 3, true], "tres revisiones sin cambio: tres lecturas de catálogo y ningún archivo");
}
{
  const o = origenRelectura([catalogo({ ...visto, titulo: "Otro título", refresco_min: 3 })]);
  igual((await relee(o)).cambio, false, "relectura: un cambio de título o de refresco no baja el archivo");
}
{
  const o = origenRelectura([catalogo(renglon(S1.toUpperCase(), { bytes: 40 }))]);
  igual((await relee(o)).cambio, false, "relectura: el mismo sello en mayúsculas no cuenta como cambio");
}
{
  const nuevo = renglon(S2, { bytes: 40 });
  const o = origenRelectura([catalogo(nuevo)], { "t1.html": T2 });
  const r = await relee(o);
  igual([r.cambio, r.t.sha256, r.html], [true, S2, "<html>tablero de prueba, version 2</html>"], "relectura con otro sello: baja, verifica y devuelve el HTML nuevo");
  igual(o.lecturas, [CATALOGO, "t1.html"], "relectura con cambio: primero el catálogo y después el archivo");
}
{
  const nuevo = renglon(S2, { archivo: "t1.v2.html" });
  const o = origenRelectura([catalogo(nuevo)], { "t1.v2.html": T2 });
  const r = await relee(o);
  igual([r.cambio, r.t.archivo, o.lecturas[1]], [true, "t1.v2.html", "t1.v2.html"], "relectura con otro nombre de archivo: baja el archivo nuevo");
}
{
  const nuevo = renglon(S1, { bytes: 41 });
  const o = origenRelectura([catalogo(nuevo)], { "t1.html": T1 });
  igual((await relee(o)).cambio, true, "relectura con otro tamaño: baja");
}
{
  const antes = filaGz();
  const nueva = filaGz({ sha256_descomprimido: hex(Buffer.from("<html>otro</html>")) });
  const o = origenRelectura([catalogo(nueva)], { "t1.html.gz": GZ });
  const e = await falla(() => relee(o, antes));
  igual(e && e.message, "El tablero descomprimido no cuadra con su sello (sha256).", "relectura gzip con otro sello del HTML: baja y no se muestra si no cuadra");
}
{
  const antes = filaGz({ sha256_descomprimido: undefined });
  const o = origenRelectura([catalogo(filaGz())], { "t1.html.gz": GZ });
  const r = await relee(o, antes);
  igual([r.cambio, r.html === CRUDO], [true, true], "relectura gzip: aparece el sello del HTML y se descomprime");
}
{
  const o = origenRelectura([catalogo(renglon(S2, { id: "otro" }))], { "t1.html": T2 });
  const e = await falla(() => relee(o));
  igual([e && e.message, o.lecturas], ["el tablero ya no está en el catálogo", [CATALOGO]], "relectura: el catálogo ya no trae el tablero");
}
{
  const o = origenRelectura(["{ no es json"]);
  igual((await falla(() => relee(o))) instanceof SyntaxError, true, "relectura: catálogo ilegible");
}
{
  const o = origenRelectura([{ contrato: "visor/1" }]);
  igual((await falla(() => relee(o))).message, "El catálogo no tiene el formato esperado.", "relectura: catálogo sin lista de tableros");
}
{
  const e = new Error("sin red");
  const o = origenRelectura([e]);
  igual((await falla(() => relee(o))) === e, true, "relectura: error al leer el catálogo");
}
{
  const o = origenRelectura([catalogo(renglon(S2, { bytes: 40 }))], { "t1.html": T3 });
  igual((await falla(() => relee(o))).message, "a medio sincronizar", "relectura: el archivo nuevo no cuadra con su sello");
}
{
  const o = origenRelectura([catalogo(renglon(S2, { bytes: 40, compresion: "zip" }))], { "t1.html": T2 });
  igual((await falla(() => relee(o))).message, "compresión no admitida", "relectura: compresión no admitida en el renglón nuevo");
}
{
  const o = origenRelectura([catalogo(renglon(undefined, { archivo: "t1b.html", bytes: 40 }))], { "t1b.html": T2 });
  const r = await relee(o);
  igual([r.cambio, r.html], [true, "<html>tablero de prueba, version 2</html>"], "relectura: renglón nuevo sin sello, no se compara");
}
{
  const e = new Error("sin red");
  const o = origenRelectura([catalogo(renglon(S2, { bytes: 40 }))], { "t1.html": e });
  igual((await falla(() => relee(o))) === e, true, "relectura: error al bajar el archivo nuevo");
}

/* ================= 7. tope de lectura sin metadatos (lecturatope.js) ================= */
const bytes = (n, v = 7) => new Uint8Array(n).fill(v);
function respuesta({ largo, trozos, tam, sinCabeceras }) {
  const est = { leidos: 0, cancelado: false, arrayBuffer: 0 };
  const r = {};
  if (!sinCabeceras) r.headers = { get: nombre => (nombre === "Content-Length" && largo !== undefined ? String(largo) : null) };
  if (trozos) {
    let i = 0;
    r.body = {
      cancel: async () => { est.cancelado = true; },
      getReader: () => ({
        read: async () => (i < trozos.length ? (est.leidos++, { done: false, value: trozos[i++] }) : { done: true, value: undefined }),
        cancel: async () => { est.cancelado = true; },
      }),
    };
  } else r.arrayBuffer = async () => { est.arrayBuffer++; return bytes(tam).buffer; };
  return { r, est };
}
{
  let a = respuesta({ tam: 10 });
  igual((await leerConTope(a.r, 10)).byteLength, 10, "tope: sin cuerpo en flujo ni Content-Length, exactamente el tope: se acepta");
  a = respuesta({ tam: 11 });
  const e = await falla(() => leerConTope(a.r, 10));
  igual([e instanceof ErrorTope, e && e.codigo, e instanceof Error], [true, DEMASIADO_GRANDE, true], "tope: un byte por encima: ErrorTope con su código");
  a = respuesta({ largo: 10, tam: 10 });
  igual((await leerConTope(a.r, 10)).byteLength, 10, "tope: Content-Length igual al tope: se acepta");
  a = respuesta({ largo: 11, tam: 11 });
  igual([(await falla(() => leerConTope(a.r, 10))) instanceof ErrorTope, a.est.arrayBuffer], [true, 0], "tope: Content-Length un byte por encima: se rechaza sin leer el cuerpo");
  a = respuesta({ largo: 11, trozos: [bytes(5), bytes(6)] });
  igual([(await falla(() => leerConTope(a.r, 10))) instanceof ErrorTope, a.est.leidos, a.est.cancelado], [true, 0, true], "tope: Content-Length por encima con cuerpo en flujo: no se lee ni un trozo y se cancela");
  a = respuesta({ largo: 10, trozos: [bytes(4), bytes(6)] });
  igual([(await leerConTope(a.r, 10)).byteLength, a.est.cancelado], [10, false], "tope: en flujo, exactamente el tope: se acepta y no se cancela");
  a = respuesta({ trozos: [bytes(6), bytes(6), bytes(6), bytes(6)] });
  igual([(await falla(() => leerConTope(a.r, 10))) instanceof ErrorTope, a.est.leidos, a.est.cancelado], [true, 2, true], "tope: sin Content-Length, se corta en cuanto se pasa (2 de 4 trozos) y se cancela");
  a = respuesta({ trozos: [bytes(4), bytes(4), bytes(2)] });
  igual((await leerConTope(a.r, 10)).byteLength, 10, "tope: sin Content-Length, en flujo, exactamente el tope: se acepta");
  a = respuesta({ trozos: [bytes(4), bytes(4), bytes(3)] });
  igual((await falla(() => leerConTope(a.r, 10))) instanceof ErrorTope, true, "tope: sin Content-Length, en flujo, un byte por encima: se rechaza");
  a = respuesta({ largo: "abc", trozos: [bytes(10)] });
  igual((await leerConTope(a.r, 10)).byteLength, 10, "tope: Content-Length que no es número se ignora y se cuentan los bytes");
  a = respuesta({ largo: "abc", trozos: [bytes(11)] });
  igual((await falla(() => leerConTope(a.r, 10))) instanceof ErrorTope, true, "tope: Content-Length que no es número y el cuerpo se pasa: se rechaza");
  a = respuesta({ largo: 0, trozos: [bytes(6), bytes(6)] });
  igual((await falla(() => leerConTope(a.r, 10))) instanceof ErrorTope, true, "tope: un Content-Length que miente (0) no evita el conteo");
  a = respuesta({ tam: 5, sinCabeceras: true });
  igual((await leerConTope(a.r, 10)).byteLength, 5, "tope: respuesta sin cabeceras: se cuentan los bytes");
  a = respuesta({ trozos: [] });
  igual((await leerConTope(a.r, 10)).byteLength, 0, "tope: cuerpo vacío");
  a = respuesta({ trozos: [Uint8Array.from([1, 2, 3]), Uint8Array.from([4, 5]), Uint8Array.from([6, 7])] });
  igual(Array.from(new Uint8Array(await leerConTope(a.r, 10))), [1, 2, 3, 4, 5, 6, 7], "tope: el contenido llega completo y en orden");
  a = respuesta({ largo: 1048577, tam: 1048577 });
  igual((await falla(() => leerConTope(a.r, 1024 * 1024))) instanceof ErrorTope, true, "tope: con el tope real de 1 MB, un byte por encima");
  a = respuesta({ largo: 1048576, trozos: [bytes(1048576)] });
  igual((await leerConTope(a.r, 1024 * 1024)).byteLength, 1048576, "tope: con el tope real de 1 MB, exacto");
}

/* ================= 8. estáticas ================= */
{
  const ver = leer("../sitio/ver.js"), carga = leer("../sitio/carga_tablero.js"), graph = leer("../sitio/graph.js"), tope = leer("../sitio/lecturatope.js");
  igual(/metadatos/.test(ver), false, "ver.js ya no contiene `metadatos`");
  igual(/\byo\b/.test(ver) || /\byo\(/.test(ver), false, "ver.js ya no usa `yo`");
  igual(/identidad\(/.test(ver) || /\bperfil\(/.test(ver), false, "ver.js no llama a `identidad(` ni a `perfil(`: los recibe cargarTablero");
  igual(/import \{ cargarTablero, releerPorCatalogo \} from "\.\/carga_tablero\.js"/.test(ver), true, "ver.js importa cargarTablero y releerPorCatalogo");
  igual(/document|window|fetch|localStorage|sessionStorage|innerHTML/.test(carga), false, "carga_tablero.js sin document, window, fetch, localStorage, sessionStorage ni innerHTML");
  igual((carga.match(/^import .* from "(.*)";$/gm) || []).map(l => /from "(.*)"/.exec(l)[1]), ["./cargainicial.js", "./compresion.js", "./relectura.js", "./catalogos.js"], "carga_tablero.js sólo importa módulos puros");
  igual(/\beval\(|new Function|insertAdjacentHTML|document\.write|blob:/.test(carga + tope), false, "carga_tablero.js y lecturatope.js sin eval, HTML crudo ni blob:");
  igual(/document|window|fetch|localStorage|sessionStorage|innerHTML|setTimeout/.test(tope), false, "lecturatope.js sin DOM, red, almacenamiento ni reloj");
  const acceso = graph.slice(graph.indexOf("export async function leerAcceso"), graph.indexOf("export async function identidad"));
  igual(acceso.length > 300 && !/metadatos/.test(acceso) && (acceso.match(/leerTope\(CONFIG\.acceso, MAX_BYTES\)/g) || []).length === 2, true, "graph.js: leerAcceso y leerTextoAcceso leen con tope y sin metadatos");
  igual(/async metadatos\(rel\)/.test(graph), true, "graph.js conserva `metadatos` para quien lo usa (configurar el enlace y los emblemas)");
  igual(/storage|localStorage/.test(graph.slice(graph.indexOf("async leerTope"), graph.indexOf("async leerTope") + 200)), false, "leerTope no guarda nada");
  igual((ver.match(/\bmostrar\(/g) || []).length, 3, "ver.js: la definición de mostrar y sus dos usos");
  igual((ver.match(/marca\("/g) || []).length, 1, "ver.js: sólo la marca 'listo'; las demás las pone carga_tablero.js");
}

console.log(mal ? "FALLARON " + mal + " de " + (ok + mal) : "carga_tablero: " + ok + " de " + ok + " pruebas bien");
process.exit(mal ? 1 : 0);
