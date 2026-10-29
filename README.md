# SIT

Visor estático de tableros. Este repositorio es sólo código: el sitio no lleva cifras ni datos. Quien lo abre inicia sesión con
su cuenta de la organización y el sitio lee, con los permisos de esa cuenta, el catálogo y los tableros; verifica el sha256 de
cada archivo cuando el catálogo lo trae.

- `sitio/`: lo que publica GitHub Pages (HTML, CSS y JavaScript, sin librerías de terceros).
  - `index.html`, `app.js`: inicio de sesión, menú y tableros de datos (formato `visor/1`, ver el encabezado de `app.js`).
  - `ver.html`, `ver.js`: tableros embebidos, en un marco aislado (`sandbox` sin `allow-same-origin`).
  - `auth.js`, `graph.js`, `config.js`: inicio de sesión con PKCE y lectura de archivos con Microsoft Graph.
- `herramientas/sellar_portal.py`: pone el sha256 y el tamaño de cada tablero en el catálogo.
- `.github/workflows/pages.yml`: publica `sitio/` en Pages al subir a `main`.

No lleva secretos: el inicio de sesión usa el flujo de código con PKCE de una aplicación de página única.
