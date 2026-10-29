# SIT

Visor estático de tableros. Este repositorio es sólo código: el sitio no lleva cifras ni datos. Quien lo abre inicia sesión con
su cuenta de la organización y el sitio lee, con los permisos de esa cuenta, el catálogo y los tableros; verifica el sha256 de
cada archivo cuando el catálogo lo trae.

- `sitio/`: lo que publica GitHub Pages (HTML, CSS y JavaScript, sin librerías de terceros).
  - `index.html`, `app.js`: inicio de sesión, menú y tableros de datos (formato `visor/1`, ver el encabezado de `app.js`).
  - `ver.html`, `ver.js`: tableros embebidos, en un marco aislado (`sandbox` sin `allow-same-origin`).
  - `auth.js`, `graph.js`, `config.js`: inicio de sesión con PKCE y lectura de archivos con Microsoft Graph.
- `herramientas/sellar_portal.py`: pone el sha256 y el tamaño de cada tablero en el catálogo.
- `herramientas/crear_marcador.py`: arma la dirección de SIT con el enlace del catálogo en el fragmento (`#c=...`).
- `.github/workflows/pages.yml`: publica `sitio/` en Pages al subir a `main`.

No lleva secretos: el inicio de sesión usa el flujo de código con PKCE de una aplicación de página única.

## Dónde está el catálogo

El sitio no lleva la ubicación del catálogo ni lo busca por nombre. La primera vez se abre con una dirección que trae el enlace en el fragmento; el sitio la usa una vez con la cuenta de la persona, guarda en el navegador sólo el id del drive y el de la carpeta, y borra el fragmento de la barra. Si el catálogo se mueve de esa carpeta, el sitio muestra un aviso y un menú vacío. El botón "Olvidar este equipo" borra lo guardado.

