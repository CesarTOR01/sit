// Configuración pública del sitio. Los identificadores de aplicación y de inquilino no son secretos: sin una sesión
// válida el sitio no puede leer nada. Ninguna ruta ni nombre de tablero va aquí: la carpeta del catálogo se entrega en el
// fragmento de la dirección, se resuelve una vez con la cuenta de la persona y sólo se guardan los ids en su navegador.
const BASE = {
  tenant: "5d9855c7-56a4-4456-b63f-4b78d8c8a338",
  cliente: "9d8ec9f1-9ae8-42c8-8031-40c64434d7f7",
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
