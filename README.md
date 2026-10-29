# SIT

Visor estático de tableros. Este repositorio es sólo código: el sitio no lleva cifras ni datos, los lee de una fuente que
conecta quien lo abre, con sus propios permisos, y verifica el sha256 de cada archivo antes de mostrarlo.

- `sitio/`: lo que publica GitHub Pages (HTML, CSS y JavaScript, sin librerías de terceros).
- `herramientas/sellar_portal.py`: pone el sha256 y el tamaño de cada tablero en `portal.json`.
- `.github/workflows/pages.yml`: publica `sitio/` en Pages al subir a `main`.

Formato de los archivos (`visor/1`): ver el encabezado de `sitio/app.js`.
