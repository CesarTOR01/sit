# SIT

Visor estático de tableros. Este repositorio es sólo código: el sitio no lleva cifras ni datos. Quien lo abre inicia sesión con
su cuenta de la organización y el sitio lee, con los permisos de esa cuenta, el catálogo y los tableros; verifica el sha256 de
cada archivo cuando el catálogo lo trae.

- `sitio/`: lo que publica GitHub Pages (HTML, CSS y JavaScript, sin librerías de terceros).
  - `index.html`, `app.js`: inicio de sesión, menú y tableros de datos (formato `visor/1`, ver el encabezado de `app.js`).
  - `ver.html`, `ver.js`: tableros embebidos, en un marco aislado (`sandbox` sin `allow-same-origin`).
  - `auth.js`, `graph.js`, `config.js`: inicio de sesión con PKCE; el perfil se lee con Microsoft Graph y los archivos con la API REST de SharePoint.
- `herramientas/sellar_portal.py`: pone el sha256 y el tamaño de cada tablero en el catálogo.
- `herramientas/crear_marcador.py`: arma la dirección de SIT con la dirección de la carpeta del catálogo en el fragmento (`#c=...`).
- `.github/workflows/pages.yml`: publica `sitio/` en Pages al subir a `main`.

No lleva secretos: el inicio de sesión usa el flujo de código con PKCE de una aplicación de página única.

## Dónde está el catálogo

El sitio no lleva la ubicación del catálogo ni lo busca por nombre. La primera vez se abre con una dirección que trae la de la carpeta del catálogo en el fragmento; el sitio la usa una vez con la cuenta de la persona, guarda en el navegador sólo el dominio de SharePoint y la ruta de la carpeta, y borra el fragmento de la barra. Si el catálogo se mueve de esa carpeta, el sitio muestra un aviso y un menú vacío. El botón "Olvidar este equipo" borra lo guardado.

## Los datos se leen en línea

Cada vez que se abre un tablero el sitio vuelve a leer el catálogo y el archivo con `cache: "no-store"`, con el token de la persona. No guarda datos en `localStorage`, `IndexedDB` ni Cache Storage: el almacenamiento local sólo tiene punteros (dominio y ruta de la carpeta, y la preferencia de tema). Si el permiso se retira o el catálogo se mueve, la siguiente apertura lo refleja y no se muestra ninguna copia.

