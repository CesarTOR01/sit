// Relectura del tablero abierto: sólo mientras la pestaña está visible, cada cierto tiempo y al volver a verla.
// Antes de bajar un archivo completo se compara su fecha de modificación y su tamaño; si no cambió, no se baja.

// ¿Cambió el archivo entre dos lecturas de sus metadatos ({ modificado, bytes })? Sin una de las dos, se supone que sí.
export const cambio = (antes, ahora) => !antes || !ahora || antes.modificado !== ahora.modificado || antes.bytes !== ahora.bytes;

// Minutos entre revisiones: el valor de la configuración, 10 si no es un número, y nunca menos de 0.1 (6 s).
export const intervaloMs = min => Math.max(0.1, Number(min) > 0 ? Number(min) : 10) * 60000;

const REVISION_AL_VOLVER_MS = 30000;

// Llama a `revisar` cada `cadaMin` minutos mientras la pestaña está visible y, al volver a verla, si pasaron más de
// 30 s desde la última revisión. Devuelve una función que lo detiene. `revisar` no debe lanzar errores.
export function vigilar(revisar, cadaMin) {
  let reloj = null, ultima = Date.now();
  const lanzar = () => { ultima = Date.now(); revisar(); };
  const poner = () => { if (reloj == null) reloj = setInterval(() => { if (!document.hidden) lanzar(); }, intervaloMs(cadaMin)); };
  const quitar = () => { clearInterval(reloj); reloj = null; };
  const alCambiar = () => {
    if (document.hidden) { quitar(); return; }
    poner();
    if (Date.now() - ultima > REVISION_AL_VOLVER_MS) lanzar();
  };
  document.addEventListener("visibilitychange", alCambiar);
  if (!document.hidden) poner();
  return () => { document.removeEventListener("visibilitychange", alCambiar); quitar(); };
}
