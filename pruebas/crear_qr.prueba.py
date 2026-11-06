"""Pruebas de crear_qr.py, sólo con direcciones inventadas:  py pruebas/crear_qr.prueba.py"""
import importlib.util
import io
import os
import sys
import tempfile
from contextlib import redirect_stdout

AQUI = os.path.dirname(os.path.abspath(__file__))
HERR = os.path.join(os.path.dirname(AQUI), "herramientas", "crear_qr.py")
spec = importlib.util.spec_from_file_location("crear_qr", HERR)
crear_qr = importlib.util.module_from_spec(spec)
spec.loader.exec_module(crear_qr)

ok = mal = 0


def igual(a, b, nombre):
    global ok, mal
    if a == b:
        ok += 1
    else:
        mal += 1
        print("FALLA:", nombre, "\n  obtenido:", a, "\n  esperado:", b)


def correr(argv, entrada=None):
    """main() con la salida capturada; `entrada` reemplaza la lectura de la dirección."""
    antes = crear_qr.getpass.getpass
    if entrada is not None:
        crear_qr.getpass.getpass = lambda *_: entrada
    f = io.StringIO()
    try:
        with redirect_stdout(f):
            codigo = crear_qr.main(["crear_qr.py", *argv])
    finally:
        crear_qr.getpass.getpass = antes
    return codigo, f.getvalue()


import segno
from PIL import Image

carpeta = tempfile.mkdtemp(prefix="qr_prueba_")
CORTA = "https://example.invalid/sit/#c=u!AAAAAAAAAAAAAAAA"
LARGA = "https://example.invalid/sit/#c=u!" + "Ab3_-" * 56  # unos 300 caracteres

# ---- el PNG ----
for nombre, texto in (("corta", CORTA), ("larga", LARGA)):
    ruta = os.path.join(carpeta, nombre + ".png")
    qr = crear_qr.crear_qr(texto, ruta)
    with open(ruta, "rb") as f:
        igual(f.read(8), b"\x89PNG\r\n\x1a\n", nombre + ": firma de PNG")
    igual(qr.error, "M", nombre + ": corrección de errores M")
    im = Image.open(ruta).convert("L")
    modulos = len(qr.matrix)
    igual(im.size, ((modulos + 8) * 10, (modulos + 8) * 10), nombre + ": tamaño = módulos + margen de 4, a escala 10")
    # los píxeles del PNG reproducen la matriz del QR (se lee el centro de cada módulo)
    lectura = [[im.getpixel(((4 + c) * 10 + 5, (4 + r) * 10 + 5)) < 128 for c in range(modulos)] for r in range(modulos)]
    igual(lectura == [[bool(v) for v in fila] for fila in qr.matrix], True, nombre + ": la imagen reproduce la matriz del QR")
    igual(im.getpixel((2, 2)), 255, nombre + ": el margen es blanco")
igual(segno.make(LARGA, error="m", boost_error=False).version <= 14, True, "300 caracteres caben en una versión chica")

# ---- reglas de la herramienta ----
igual(crear_qr.dentro_del_repo(os.path.join(crear_qr.REPO, "sitio", "qr.png")), True, "dentro del repositorio se detecta")
igual(crear_qr.dentro_del_repo(os.path.join(carpeta, "qr.png")), False, "fuera del repositorio se permite")
cod, texto = correr(["--salida", os.path.join(crear_qr.REPO, "herramientas", "x.png")], entrada=CORTA)
igual((cod, os.path.exists(os.path.join(crear_qr.REPO, "herramientas", "x.png"))), (2, False), "se niega a escribir dentro del repositorio y no deja archivo")
cod, texto = correr([], entrada=CORTA)
igual(cod, 2, "sin --salida: código 2")
cod, texto = correr(["--salida", os.path.join(carpeta, "a.png")], entrada="no es una dirección")
igual(cod, 1, "texto que no es https: código 1")
salida = os.path.join(carpeta, "sub", "b.png")
cod, texto = correr(["--salida", salida], entrada=CORTA)
igual((cod, os.path.exists(salida)), (0, True), "escribe la imagen y crea la carpeta de salida")
igual(CORTA in texto or "u!AAAA" in texto, False, "no imprime la dirección")
igual("versión" in texto, True, "dice la versión del QR")

# sin la librería: mensaje claro y código 3
guardado = sys.modules.get("segno")
sys.modules["segno"] = None  # hace fallar el import
try:
    cod, texto = correr(["--salida", os.path.join(carpeta, "c.png")], entrada=CORTA)
finally:
    sys.modules["segno"] = guardado
igual((cod, "pip install segno" in texto), (3, True), "sin segno: código 3 y el comando para instalarlo")

# limpieza de lo que esta prueba creó
for raiz, _, archivos in os.walk(carpeta, topdown=False):
    for a in archivos:
        os.unlink(os.path.join(raiz, a))
    os.rmdir(raiz)

print("FALLARON %d de %d" % (mal, ok + mal) if mal else "crear_qr: %d de %d pruebas bien" % (ok, ok))
sys.exit(1 if mal else 0)
