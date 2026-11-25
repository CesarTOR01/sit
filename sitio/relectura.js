// Relectura del tablero abierto: sólo mientras la pestaña está visible, cada cierto tiempo y al volver a verla.
// Antes de bajar un archivo completo se compara el renglón del catálogo con el que se mostró; si no cambió, no se baja.

// ¿Cambió el archivo entre dos lecturas de sus metadatos ({ modificado, bytes })? Sin una de las dos, se supone que sí.
export const cambio = (antes, ahora) => !antes || !ahora || antes.modificado !== ahora.modificado || antes.bytes !== ahora.bytes;

const sello = v => (v === undefined || v === null ? null : String(v).toLowerCase());
const numero = v => (v === undefined || v === null ? null : Number(v));

// ¿Cambió el renglón del tablero entre dos lecturas del catálogo? Compara `archivo`, `sha256`, `bytes` y `sha256_descomprimido`
// (los sellos sin distinguir mayúsculas; un campo ausente en los dos renglones no cuenta). Sin uno de los dos renglones, se supone que sí.
// Si ninguno de los dos renglones trae alguno de esos cuatro campos, compara `actualizado` (si alguno lo trae) y, si tampoco existe, se supone que cambió.
const CAMPOS = ["archivo", "sha256", "bytes", "sha256_descomprimido"];
const trae = r => CAMPOS.some(c => r[c] !== undefined && r[c] !== null);
export const cambioPorCatalogo = (antes, ahora) => {
  if (!antes || typeof antes !== "object" || !ahora || typeof ahora !== "object") return true;
  if (!trae(antes) && !trae(ahora)) {
    const a = antes.actualizado, b = ahora.actualizado;
    return (a === undefined || a === null) && (b === undefined || b === null) ? true : String(a) !== String(b);
  }
  return antes.archivo !== ahora.archivo
    || sello(antes.sha256) !== sello(ahora.sha256)
    || numero(antes.bytes) !== numero(ahora.bytes)
    || sello(antes.sha256_descomprimido) !== sello(ahora.sha256_descomprimido);
};

// Minutos entre revisiones de un tablero: su campo `refresco_min` del catálogo (de 1 a 1440 minutos) o, si no lo trae o no
// es válido, el valor por omisión de la configuración.
export const refrescoMin = (tablero, porOmision) => {
  const v = Number(tablero && tablero.refresco_min);
  return v >= 1 ? Math.min(v, 1440) : porOmision;
};

// Minutos a milisegundos; si no es un número positivo, 10 minutos; nunca menos de 0.1 (6 s).
export const intervaloMs = min => Math.max(0.1, Number(min) > 0 ? Number(min) : 10) * 60000;

// Espera antes del siguiente intento tras `fallos` fallos seguidos: 30 s, 60 s, 120 s… sin pasar del intervalo normal.
export const esperaTrasFallos = (fallos, normalMs) => fallos > 0 ? Math.min(normalMs, 30000 * 2 ** (fallos - 1)) : normalMs;

const REVISION_AL_VOLVER_MS = 30000, PULSO_MS = 5000;

// Llama a `revisar` cuando pasó el tiempo que dicen `minutos()` (se consulta cada vez, así cada tablero puede tener el suyo)
// mientras la pestaña está visible y, al volver a verla, si pasaron más de 30 s. `revisar` devuelve false si falló: los
// reintentos siguientes esperan cada vez más. Devuelve { detener, marcar }; `marcar()` cuenta como revisión hecha ahora
// (al abrir un tablero, que ya se leyó).
export function vigilar(revisar, minutos) {
  let reloj = null, ultima = Date.now(), fallos = 0, enCurso = false;
  const lanzar = () => {
    if (enCurso) return;
    enCurso = true; ultima = Date.now();
    Promise.resolve().then(revisar).then(ok => { fallos = ok === false ? fallos + 1 : 0; }, () => { fallos++; }).finally(() => { enCurso = false; });
  };
  const pulso = () => { if (!document.hidden && !enCurso && Date.now() - ultima >= esperaTrasFallos(fallos, intervaloMs(minutos()))) lanzar(); };
  const poner = () => { if (reloj == null) reloj = setInterval(pulso, PULSO_MS); };
  const quitar = () => { clearInterval(reloj); reloj = null; };
  const alCambiar = () => {
    if (document.hidden) { quitar(); return; }
    poner();
    if (Date.now() - ultima > REVISION_AL_VOLVER_MS) lanzar();
  };
  document.addEventListener("visibilitychange", alCambiar);
  if (!document.hidden) poner();
  return {
    marcar: () => { ultima = Date.now(); fallos = 0; },
    detener: () => { document.removeEventListener("visibilitychange", alCambiar); quitar(); },
  };
}
