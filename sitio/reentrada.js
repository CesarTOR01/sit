// Reentrada automática: cuando el navegador ya conoce la carpeta del catálogo y no hay sesión (pestaña nueva, sesión vencida),
// el sitio abre el inicio de sesión de Microsoft solo, en lugar de pedir un clic. La cuenta de Microsoft sigue decidiendo si la
// persona entra: el sitio no guarda tokens ni cuentas, sólo dos marcas de esta pestaña (sessionStorage) para no repetirlo.
//
//   sit.auto   ya se intentó entrar solo en esta pestaña (evita un ciclo si el inicio de sesión no deja sesión)
//   sit.salio  la persona cerró la sesión a mano en esta pestaña (no se vuelve a entrar sola)
const AUTO = "sit.auto", SALIO = "sit.salio";

const hay = k => { try { return sessionStorage.getItem(k) === "1"; } catch (_) { return false; } };
const poner = k => { try { sessionStorage.setItem(k, "1"); } catch (_) { /* sin almacenamiento */ } };
const quitar = k => { try { sessionStorage.removeItem(k); } catch (_) { /* sin almacenamiento */ } };

// ubicacion: la carpeta guardada ({host, carpeta}) o null · sesion: hay sesión · pendiente: hay un enlace #c= por resolver ·
// local: el sitio corre en localhost · intentado y salio: las marcas de arriba.
export function debeEntrarSolo({ ubicacion, sesion, pendiente, local, intentado, salio }) {
  return !!(ubicacion && ubicacion.host && ubicacion.carpeta) && !sesion && !pendiente && !local && !intentado && !salio;
}

export const yaIntento = () => hay(AUTO);
// Deja la marca antes de salir al inicio de sesión. Devuelve false si no se pudo guardar: sin la marca no se entra solo, porque
// no habría cómo cortar un ciclo.
export function marcarIntento() { poner(AUTO); return hay(AUTO); }
// Con una sesión que sí quedó guardada, la marca se quita: si vence otra vez en esta pestaña, se vuelve a entrar solo.
export const limpiarIntento = () => quitar(AUTO);

export const salioAMano = () => hay(SALIO);
export const marcarSalida = () => poner(SALIO);
