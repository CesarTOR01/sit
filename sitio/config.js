// Configuración pública del sitio. Los identificadores de aplicación y de inquilino no son secretos: sin una sesión
// válida el sitio no puede leer nada. Ninguna ruta ni nombre de tablero va aquí: el catálogo se localiza por nombre de
// archivo, con los permisos de quien inicia sesión.
const BASE = {
  tenant: "5d9855c7-56a4-4456-b63f-4b78d8c8a338",
  cliente: "f295956c-7666-4730-9052-db3bf9c85fab",
  autoridad: "https://login.microsoftonline.com/5d9855c7-56a4-4456-b63f-4b78d8c8a338/oauth2/v2.0/",
  graph: "https://graph.microsoft.com/v1.0/",
  // alcances delegados: lectura de los archivos que la persona ya puede ver
  alcances: ["openid", "profile", "offline_access", "User.Read", "Files.Read.All"],
  alcancesBasicos: ["openid", "profile", "offline_access", "User.Read"],
  catalogo: "sit-catalogo.json",
  redirect: null, // por omisión: la carpeta de index.html, con "/" final
};

// Sólo en un servidor local se puede reemplazar la configuración (pruebas con servidores simulados).
function sobreescritura() {
  try {
    if (["localhost", "127.0.0.1"].includes(location.hostname)) return JSON.parse(sessionStorage.getItem("sit.config") || "null") || {};
  } catch (_) { /* sin almacenamiento */ }
  return {};
}

export const CONFIG = Object.freeze({ ...BASE, ...sobreescritura() });

export function urlRedirect() {
  return CONFIG.redirect || location.origin + location.pathname.replace(/[^/]*$/, "");
}
