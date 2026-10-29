// Fuentes de datos del portal. El portal no lleva datos: los lee de una carpeta (portal.json + un JSON por tablero)
// con los permisos de quien lo abre. Tres maneras de llegar a esa carpeta:
//   - carpeta: la carpeta sincronizada en el equipo, con el selector de carpeta del navegador (Chrome/Edge);
//   - archivos: el selector de archivos, para navegadores sin selector de carpeta;
//   - url: una dirección base (servidor local de pruebas o un servicio con CORS).

const BD = "tornel-portal", ALMACEN = "fuentes";

function abrirBD() {
  return new Promise((ok, mal) => {
    const r = indexedDB.open(BD, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(ALMACEN);
    r.onsuccess = () => ok(r.result);
    r.onerror = () => mal(r.error);
  });
}
async function guardar(clave, valor) {
  try {
    const bd = await abrirBD();
    await new Promise((ok, mal) => { const t = bd.transaction(ALMACEN, "readwrite"); t.objectStore(ALMACEN).put(valor, clave); t.oncomplete = ok; t.onerror = () => mal(t.error); });
  } catch (_) { /* sin almacenamiento: se vuelve a elegir la carpeta cada vez */ }
}
async function leerGuardado(clave) {
  try {
    const bd = await abrirBD();
    return await new Promise((ok, mal) => { const q = bd.transaction(ALMACEN).objectStore(ALMACEN).get(clave); q.onsuccess = () => ok(q.result); q.onerror = () => mal(q.error); });
  } catch (_) { return undefined; }
}

function partes(ruta) {
  const p = String(ruta).split("/").filter(x => x && x !== ".");
  if (!p.length || p.some(x => x === ".." || x.includes("\\"))) throw new Error("ruta no válida: " + ruta);
  return p;
}

export class FuenteCarpeta {
  constructor(dir) { this.dir = dir; this.tipo = "carpeta"; this.nombre = dir.name; }
  async leer(ruta) {
    const p = partes(ruta);
    let d = this.dir;
    for (const s of p.slice(0, -1)) d = await d.getDirectoryHandle(s);
    return (await (await d.getFileHandle(p[p.length - 1])).getFile()).arrayBuffer();
  }
}

export class FuenteArchivos {
  constructor(lista) {
    this.tipo = "archivos";
    this.mapa = new Map();
    for (const f of lista) {
      const rel = (f.webkitRelativePath || f.name).split("/").slice(f.webkitRelativePath ? 1 : 0).join("/");
      this.mapa.set(rel, f);
      this.mapa.set(f.name, this.mapa.get(f.name) || f);
    }
    this.nombre = lista.length && lista[0].webkitRelativePath ? lista[0].webkitRelativePath.split("/")[0] : lista.length + " archivos";
  }
  async leer(ruta) {
    const f = this.mapa.get(partes(ruta).join("/"));
    if (!f) throw new Error("no está en lo que elegiste: " + ruta);
    return f.arrayBuffer();
  }
}

export class FuenteURL {
  constructor(base) {
    const u = new URL(base, location.href);
    if (!/^https?:$/.test(u.protocol)) throw new Error("sólo http o https");
    if (!u.pathname.endsWith("/")) u.pathname += "/";
    this.base = u; this.tipo = "url"; this.nombre = u.host + u.pathname;
  }
  async leer(ruta) {
    const u = new URL(partes(ruta).map(encodeURIComponent).join("/"), this.base);
    if (u.origin !== this.base.origin || !u.pathname.startsWith(this.base.pathname)) throw new Error("fuera de la base");
    const r = await fetch(u, { cache: "no-store" });
    if (!r.ok) throw new Error("HTTP " + r.status + " en " + ruta);
    return r.arrayBuffer();
  }
}

export const hayCarpeta = () => typeof window.showDirectoryPicker === "function";

export async function elegirCarpeta() {
  const dir = await window.showDirectoryPicker({ id: "tornel-portal", mode: "read" });
  await guardar("carpeta", dir);
  return new FuenteCarpeta(dir);
}

// La carpeta de la sesión anterior. Si el permiso hay que pedirlo otra vez, devuelve {pendiente} y el clic lo concede.
export async function carpetaGuardada() {
  const dir = await leerGuardado("carpeta");
  if (!dir) return null;
  const permiso = await dir.queryPermission({ mode: "read" });
  if (permiso === "granted") return { fuente: new FuenteCarpeta(dir) };
  return { pendiente: async () => (await dir.requestPermission({ mode: "read" })) === "granted" ? new FuenteCarpeta(dir) : null, nombre: dir.name };
}

export async function olvidarCarpeta() { await guardar("carpeta", undefined); }

export async function sha256(buf) {
  const h = await crypto.subtle.digest("SHA-256", buf);
  return [...new Uint8Array(h)].map(b => b.toString(16).padStart(2, "0")).join("");
}

export const aTexto = buf => new TextDecoder("utf-8").decode(buf);
