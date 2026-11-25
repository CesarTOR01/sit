// Lectura de los emblemas de varias gerencias, sin DOM: una lista de archivos de la carpeta `marca` y una lectura con tope de tamaño
// por cada emblema que aparece en ella (sin pedir antes los metadatos de cada archivo). Todo entra por parámetros (`listaDe`,
// `leerArchivo`, `aImagen`, `nombreEmblema`), así que se prueba con una fuente simulada que registra cada petición. Nunca lanza error.

const MAX_GERENCIAS = 30;
// Si la lista falla por alguno de estos motivos, la carpeta no se puede leer: ningún emblema y ninguna petición más.
// Con cualquier otro fallo de la lista se intenta cada archivo por su nombre, con la misma lectura con tope.
const SIN_LECTURA = ["red", "sin-sesion", "sin-permiso", "no-existe"];

// ids: gerencias ({ id: { claro, oscuro } | null }); `claro` es el positivo y `oscuro` el negativo (puede ser null).
// listaDe(): [{ nombre, bytes }] de la carpeta; leerArchivo(nombre): ArrayBuffer o error (el tope de tamaño lo aplica quien lee);
// max: bytes máximos de un emblema; con la lista, un archivo que la lista declara mayor no se pide.
export async function leerEmblemasEn({ ids, listaDe, leerArchivo, aImagen, nombreEmblema, max }) {
  const lista = [...new Set(Array.isArray(ids) ? ids : [])].filter(id => nombreEmblema(id, false)).slice(0, MAX_GERENCIAS);
  const vacio = () => Object.fromEntries(lista.map(id => [id, null]));
  if (!lista.length || typeof listaDe !== "function" || typeof leerArchivo !== "function") return vacio();
  try {
    let presentes = null; // null: no hay lista y se intenta cada nombre
    try {
      const archivos = await listaDe();
      presentes = new Map(archivos.filter(x => x && typeof x.nombre === "string").map(x => [x.nombre.toLowerCase(), x]));
    } catch (e) {
      if (e && SIN_LECTURA.includes(e.codigo)) return vacio();
      presentes = null;
    }
    // el nombre con el que se pide el archivo, o null si no se debe pedir (no está en la lista o la lista dice que pasa del tope)
    const pedible = nombre => {
      if (!presentes) return nombre;
      const x = presentes.get(nombre.toLowerCase());
      return x && !(Number(x.bytes) > max) ? x.nombre : null;
    };
    const uno = async nombre => {
      if (nombre === null) return null;
      try { return aImagen(await leerArchivo(nombre)); } catch (_) { return null; }
    };
    const res = await Promise.all(lista.map(async id => {
      const pos = pedible(nombreEmblema(id, false));
      if (pos === null) return null; // sin positivo no hay emblema: tampoco se pide el negativo
      const [claro, oscuro] = await Promise.all([uno(pos), uno(pedible(nombreEmblema(id, true)))]);
      return claro ? { claro, oscuro } : null;
    }));
    return Object.fromEntries(lista.map((id, i) => [id, res[i]]));
  } catch (_) { return vacio(); }
}
