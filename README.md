# SIT

Visor estático de tableros. Este repositorio es sólo código: el sitio no lleva cifras ni datos. Quien lo abre inicia sesión con
su cuenta de la organización y el sitio lee, con los permisos de esa cuenta, el catálogo y los tableros; verifica el sha256 de
cada archivo cuando el catálogo lo trae.

- `sitio/`: lo que publica GitHub Pages (HTML, CSS y JavaScript, sin librerías de terceros).
  - `index.html`, `app.js`: inicio de sesión, menú y tableros de datos (formato `visor/1`, ver el encabezado de `app.js`).
  - `ver.html`, `ver.js`: tableros embebidos, en un marco aislado (`sandbox` sin `allow-same-origin`); `ver.html` no permite nada en línea. El tablero va dentro de `marco.html`, una página estática sin datos con su propia política (sin red) que lo recibe por mensaje; así lo en línea del tablero no obliga a relajar la política de la página donde está la sesión.
  - `auth.js`, `graph.js`, `config.js`: inicio de sesión con PKCE; el perfil se lee con Microsoft Graph y los archivos con la API REST de SharePoint.
- `herramientas/sellar_portal.py`: pone el sha256 y el tamaño de cada tablero en el catálogo.
- `herramientas/crear_marcador.py`: arma la dirección de SIT con la dirección de la carpeta del catálogo en el fragmento (`#c=...`).
- `herramientas/crear_qr.py`: convierte esa dirección en un código QR (PNG) para entrar desde un celular o un iPad; necesita la librería `segno` (`python -m pip install segno`), toma la dirección sin mostrarla o del portapapeles y se niega a escribir la imagen dentro del repositorio (el QR lleva el enlace de la carpeta: se guarda fuera y se reparte por un canal interno).
- `herramientas/crear_acceso.py`: arma `sit-acceso.json` (catálogo de acceso) a partir de una hoja local de correo y etiquetas, con `--carpetas "Etiqueta=carpeta1,carpeta2"` para las carpetas que lee cada etiqueta; el archivo lleva el hash del correo, no el correo.
  - `vistas.js`: menú, portada (con el mapa de gerencias de Administrador) y vista de tablero, compartidas por el sitio y la maqueta local; `catalogos.js`: unión de los catálogos de carpetas hermanas; sus tableros embebidos se abren con `ver.html?t=<id>&o=<carpeta>` y sólo si a la persona le toca esa carpeta.
- `pruebas/*.prueba.js`: pruebas con datos ficticios, sin navegador (`node pruebas/acceso.prueba.js`, `catalogos`, `vistas`, `iconos`, `emblemas`, `estilo`, `gerencias`); `gerencias` cubre la ilustración, el emblema y el acento de cada gerencia con un DOM de juguete; `acceso` cubre el catálogo de acceso, las identidades y la lectura de carpetas hermanas con un servidor simulado; `tema` cubre el tema y su paso al tablero embebido; `csp` cubre la política de contenido de `ver.html` y del relevo `marco.html`; `enlaces` cubre la validación y el pintado de los enlaces del catálogo en `ver.html`; `cargainicial` cubre la carga inicial con sello y reintentos; `vercomo` cubre el "Ver como" de Administrador (identidad simulada, lectura del catálogo de acceso y que el correo no se guarde ni se imprima). `pruebas/crear_qr.prueba.py` prueba el generador de QR (`py pruebas/crear_qr.prueba.py`).
- `.github/workflows/pages.yml`: publica `sitio/` en Pages al subir a `main`.

No lleva secretos: el inicio de sesión usa el flujo de código con PKCE de una aplicación de página única.

## Dónde está el catálogo

El sitio no lleva la ubicación del catálogo ni lo busca por nombre. La primera vez se abre con una dirección que trae la de la carpeta del catálogo en el fragmento; el sitio la usa una vez con la cuenta de la persona, guarda en el navegador sólo el dominio de SharePoint y la ruta de la carpeta, y borra el fragmento de la barra. Si el catálogo se mueve de esa carpeta, el sitio muestra un aviso y un menú vacío. El botón "Olvidar este equipo" borra lo guardado.

## Los datos se leen en línea

Cada vez que se abre un tablero el sitio vuelve a leer el catálogo y el archivo con `cache: "no-store"`, con el token de la persona. No guarda datos en `localStorage`, `IndexedDB` ni Cache Storage: el almacenamiento local sólo tiene punteros (dominio y ruta de la carpeta, y la preferencia de tema). Si el permiso se retira o el catálogo se mueve, la siguiente apertura lo refleja y no se muestra ninguna copia.

El tablero abierto se vuelve a leer solo: al volver a ver la pestaña (si pasaron más de 30 s) y, mientras está visible, con la tasa de refresco del propio tablero: el campo `refresco_min` de su renglón en el catálogo (de 1 a 1440 minutos) o, si no lo trae, `releerCadaMin` de `config.js` (10 minutos). Así la tasa se sube o se baja por tablero sin tocar el código. Antes de bajarlo se compara la fecha de modificación y el tamaño del archivo; si no cambiaron, no se baja. Si la relectura falla, se conserva lo que ya se veía, se muestra un aviso y se reintenta con espera creciente (30 s, 60 s, 120 s… sin pasar de la tasa normal). El sitio muestra la hora de publicación que trae el propio archivo (`generado`): la frescura de los datos la fija la última publicación del exportador, no la lectura. No hay botón Actualizar; ante un error aparece el botón Reintentar. En la carga inicial de un tablero embebido, si el sello del archivo no cuadra con el del catálogo (los dos pueden llegar por separado cuando el exportador publica), el visor vuelve a leer catálogo y archivo cada 30 s hasta 10 veces (`sitio/cargainicial.js`) antes de mostrar el aviso de sello; nunca muestra un archivo que no cuadra.


## Gerencias

`sitio/gerencias.js` define las gerencias del frente: Comercial, Operaciones (con Planeación y Compras dentro), Asuntos Regulatorios, Control y SGE, Calidad, Finanzas, Servicios Corporativos y Dirección, más las identidades Administrador y General. Cada una tiene id, nombre, lema, claves para reconocer el Departamento, ilustración, acento (`--acc-<id>` en `estilo.css`, claro y oscuro), ícono de menú y, si existe en la carpeta `marca`, el emblema `emblema-<id>.svg` (y `emblema-<id>-negativo.svg`); sin emblema, el frente usa la ilustración.

- **Servicios Corporativos** (id `servicios`, lema "Personas, datos y plataformas") reúne a las antiguas Recursos Humanos y Sistemas. Reconoce los Departamentos de las dos (por ejemplo "Capital Humano", "Recursos Humanos", "Sistemas", "TI", "Tecnología") y "Servicios Corporativos" o "Subdirección de Servicios".
- **Alias:** `Recursos Humanos`, `rrhh` y `Sistemas` (con o sin acentos y mayúsculas) siguen valiendo como etiqueta del catálogo de acceso y como `grupo` del catálogo de tableros, y desembocan en `servicios`. Un alias no crea una tarjeta propia en el mapa de Administrador ni pide `emblema-rrhh.svg` o `emblema-sistemas.svg`; el emblema que se lee es `emblema-servicios.svg`.

## Quién ve qué

El filtro por gerencia sólo decide qué tableros se muestran; la barrera real son los permisos de cada carpeta de SharePoint. Por omisión la gerencia sale del campo Departamento del perfil. Si junto a la carpeta del enlace hay una carpeta hermana `acceso` con `sit-acceso.json` (contrato `acceso/1`), la entrada de la persona en ese archivo reemplaza al Departamento:

- La llave es el SHA-256 del correo en minúsculas, calculado en el navegador con el perfil de quien entra; el valor es una lista de etiquetas (una gerencia, "Dirección", "General" o una audiencia).
- Un tablero se muestra si su `grupo` es de alguna gerencia de las etiquetas, si su `grupo` es exactamente una etiqueta o si alguna de sus `audiencias` (campo opcional del catálogo) lo es. "Dirección" y "Administrador" ven todo lo que su cuenta puede leer, y sólo valen como etiqueta: ningún tablero las otorga. "Administrador" además abre, en lugar de la lista, una portada con todas las gerencias y sus tableros, y pesa más que "Dirección" si la persona trae ambas.
- Servicios Corporativos es una sola gerencia: quien trae la etiqueta `Sistemas` ve en el menú también los tableros del grupo `Recursos Humanos`, y al revés. Verlos y abrirlos depende de que su cuenta los pueda leer en SharePoint: la barrera real sigue siendo el permiso de la carpeta.
- Carpetas: la persona lee los tableros de la carpeta de su enlace. `sit-acceso.json` puede traer un campo opcional `carpetas` (`{ "Dirección": ["facturacion", "indicadores"] }`) con las carpetas hermanas que lee cada etiqueta; "Administrador" lee todas las hermanas que tengan catálogo, sin lista. Lo que la cuenta no pueda leer se omite sin aviso, y los tableros embebidos sólo se abren si están en la carpeta del enlace. Las carpetas `acceso` y `marca` son del sitio y no se leen como tableros.
- Sin entrada, o si no existe el catálogo de acceso, se usa el Departamento. Si el archivo existe y no se puede leer o está mal formado, se muestran sólo los tableros generales y un aviso.
- La ruta del catálogo de acceso no sale de ningún archivo: es la carpeta hermana de la del enlace. El correo y su hash no se guardan, no se imprimen y no van en ningún aviso.

## Ver como (Administrador)

Quien entra con la etiqueta "Administrador" en el catálogo de acceso ve arriba de la portada el control "Ver como…": escribe el correo de otra persona que tenga entrada en `sit-acceso.json` y el sitio vuelve a pintar el menú y la portada como se los presentaría a ella (`sitio/vercomo.js`).

- **Qué hace:** usa las etiquetas y las carpetas de esa entrada con las mismas reglas que la vista real: su gerencia, sus tableros por grupo y audiencia, y sólo las carpetas hermanas de su lista. Mientras dura, una franja fija dice "Vista como una persona del catálogo (etiquetas: …) · sólo presentación; el permiso real es el de SharePoint" y trae el botón "Volver a mi vista".
- **Qué no hace:** no muestra lo que SharePoint deja abrir a esa persona. Cada archivo se sigue leyendo con la cuenta de quien administra, y los tableros embebidos (`ver.html`) abren con su identidad real. No simula a otra persona con "Administrador" ni a quien no tiene entrada: a esa la presentaría su Departamento, que no se puede ver para otra cuenta, y el sitio lo dice así.
- **El correo no se guarda:** el catálogo de acceso se lee en línea en cada consulta. El correo sólo se usa para calcular su hash y se borra del campo al pulsar "Ver". No se guarda en el navegador, en la dirección ni en el historial, no se imprime y no sale en ningún aviso. La vista simulada vive en la memoria de la página: al recargar vuelve la propia.

## Enlaces de un tablero embebido

El renglón de un tablero embebido en el catálogo puede traer el campo opcional `enlaces: [{ "titulo": "...", "url": "..." }]`: hasta 5 enlaces (por ejemplo, a una lista de acciones) que `ver.html` muestra como botones en su encabezado y abre en una pestaña nueva (`noopener noreferrer`). `sitio/enlaces.js` los valida antes de pintarlos: título de 1 a 60 caracteres, dirección `https` de hasta 2048 caracteres a un host `*.sharepoint.com`, sin usuario ni contraseña y sin otro puerto que el 443; lo demás se descarta sin aviso y de un arreglo más largo sólo se miran los primeros 5. Los pinta el visor y no el tablero: el marco sigue aislado (sin `allow-popups`, sin `allow-same-origin`) y `ver.js` no escucha mensajes del marco, así que el tablero no puede abrir ventanas ni proponer direcciones. El texto entra como texto, nunca como HTML. Al releer el catálogo se vuelven a pintar.
