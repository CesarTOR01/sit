// Pruebas de la reentrada automática, sin navegador ni red: node pruebas/reentrada.prueba.js
import { readFileSync } from "node:fs";

let ok = 0, mal = 0;
const igual = (a, b, nombre) => {
  const A = JSON.stringify(a), B = JSON.stringify(b);
  if (A === B) ok++; else { mal++; console.log("FALLA:", nombre, "\n  obtenido:", A, "\n  esperado:", B); }
};
const leer = r => readFileSync(new URL(r, import.meta.url), "utf8");

// sessionStorage de mentira: una pestaña, o una que no deja guardar
const pestana = (bloqueada = false) => {
  const m = new Map();
  globalThis.sessionStorage = {
    getItem: k => { if (bloqueada) throw new Error("bloqueado"); return m.has(k) ? m.get(k) : null; },
    setItem: (k, v) => { if (bloqueada) throw new Error("bloqueado"); m.set(k, String(v)); },
    removeItem: k => { if (bloqueada) throw new Error("bloqueado"); m.delete(k); },
  };
  return m;
};
const R = await import("../sitio/reentrada.js");
const U = { host: "ejemplo.invalid", carpeta: "/sites/x/Documents/SIT/ventas" };
const base = { ubicacion: U, sesion: false, pendiente: false, local: false, intentado: false, salio: false };

/* ---- cuándo entra sola ---- */
igual(R.debeEntrarSolo(base), true, "carpeta conocida y sin sesión: entra sola");
igual(R.debeEntrarSolo({ ...base, ubicacion: null }), false, "sin carpeta guardada: no entra sola");
igual(R.debeEntrarSolo({ ...base, ubicacion: { host: "", carpeta: "" } }), false, "carpeta sin host ni ruta: no");
igual(R.debeEntrarSolo({ ...base, sesion: true }), false, "con sesión: no hace falta");
igual(R.debeEntrarSolo({ ...base, pendiente: true }), false, "con un enlace #c= por resolver: lo resuelve la persona");
igual(R.debeEntrarSolo({ ...base, local: true }), false, "en localhost: no");
igual(R.debeEntrarSolo({ ...base, intentado: true }), false, "ya se intentó en esta pestaña: no se repite");
igual(R.debeEntrarSolo({ ...base, salio: true }), false, "la persona cerró la sesión a mano: no");
igual(R.debeEntrarSolo({}), false, "sin datos: no");

/* ---- las marcas de la pestaña ---- */
{
  const m = pestana();
  igual([R.yaIntento(), R.salioAMano()], [false, false], "pestaña nueva: sin marcas");
  igual(R.marcarIntento(), true, "marcar el intento funciona");
  igual(R.yaIntento(), true, "el intento queda marcado");
  R.limpiarIntento();
  igual(R.yaIntento(), false, "con sesión guardada la marca se quita");
  R.marcarSalida();
  igual(R.salioAMano(), true, "la salida a mano queda marcada");
  igual([...m.keys()].sort(), ["sit.salio"], "sólo hay marcas, nunca tokens ni cuentas");
  igual([...m.values()].every(v => v === "1"), true, "las marcas valen 1");
}
{
  pestana(true);
  igual(R.marcarIntento(), false, "sin almacenamiento no se puede marcar: no se entra sola (sin ciclo)");
  igual([R.yaIntento(), R.salioAMano()], [false, false], "sin almacenamiento no lanza");
  R.marcarSalida(); R.limpiarIntento();
  igual(true, true, "sin almacenamiento ninguna función lanza");
}

/* ---- el cableado ---- */
{
  const app = leer("../sitio/app.js"), ver = leer("../sitio/ver.js"), re = leer("../sitio/reentrada.js");
  igual(/debeEntrarSolo\(\{[^}]*ubicacion: leerUbicacion\(\)[^}]*sesion: false[^}]*\}\) && marcarIntento\(\)/.test(app), true, "app.js: sólo entra sola si decide la función y la marca quedó guardada");
  igual(/marcarIntento\(\)\) \{\s*mostrarConexion\(\{ info:[^\n]*\n\s*await iniciarSesion\(\{ host: hostConocido\(\) \}\);\s*return;/.test(app), true, "app.js: avisa y abre el inicio de sesión del dominio conocido");
  igual(app.indexOf("debeEntrarSolo({") > app.indexOf("if (haySesion()) { await conectarSesion()") && app.indexOf("debeEntrarSolo({") > app.indexOf("if (hayPendiente())"), true, "app.js: después de revisar la sesión y el enlace pendiente");
  igual(app.indexOf("debeEntrarSolo({") > app.indexOf("if (ret && ret.error)"), true, "app.js: después de un error de inicio de sesión no se entra sola");
  igual(/if \(ret && ret\.volver && haySesion\(\)\) limpiarIntento\(\)/.test(app), true, "app.js: la marca sólo se quita si la sesión quedó guardada");
  igual(/\$\("cambiar"\)\.addEventListener\("click", async \(\) => \{\s*marcarSalida\(\);/.test(app), true, "app.js: el botón de cerrar sesión marca la salida");
  igual(/\$\("salir"\)\.addEventListener\("click", \(\) => \{ marcarSalida\(\); cerrarSesion\(\)/.test(ver), true, "ver.js: el botón de salir marca la salida");
  igual(/localStorage|innerHTML|eval\(|new Function|fetch\(/.test(re), false, "reentrada.js: sin almacenamiento persistente, HTML crudo, eval ni red");
  igual(/token|refresh|correo|mail/i.test(re.replace(/\/\/.*$/gm, "")), false, "reentrada.js: no toca tokens ni correos");
}

console.log("reentrada: " + ok + " de " + (ok + mal) + " pruebas bien");
process.exit(mal ? 1 : 0);
