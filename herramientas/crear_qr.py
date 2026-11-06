"""
crear_qr.py — convierte la dirección de SIT con el enlace del catálogo (#c=...) en un código QR (PNG), para entrar desde un celular o un iPad.

    python crear_qr.py --salida <carpeta fuera del repositorio>/sit.png [--portapapeles]
    (sin --portapapeles pide la dirección sin mostrarla; con --portapapeles la toma del portapapeles, donde la deja crear_marcador.py)

Necesita la librería segno (Python puro, sin dependencias):  python -m pip install segno

La dirección no se imprime ni se escribe en ningún archivo salvo dentro de la imagen del QR. La imagen lleva el mismo enlace que
crear_marcador.py: hay que guardarla fuera del repositorio y repartirla por un canal interno. Se niega a escribir dentro del repositorio.

Códigos: 0 imagen escrita; 1 la dirección no parece un enlace https; 2 falta --salida o apunta dentro del repositorio;
3 falta la librería segno; 4 no se pudo escribir la imagen.
"""
import getpass
import os
import subprocess
import sys

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def dentro_del_repo(ruta):
    """True si la ruta cae dentro de la carpeta del repositorio (donde nunca debe quedar un QR con el enlace)."""
    a, r = os.path.normcase(os.path.abspath(ruta)), os.path.normcase(REPO)
    try:
        return os.path.commonpath([a, r]) == r
    except ValueError:  # otra unidad
        return False


def leer_portapapeles():
    r = subprocess.run(["powershell", "-NoProfile", "-Command", "Get-Clipboard -Raw"], capture_output=True, text=True, encoding="utf-8")
    return r.stdout.strip() if r.returncode == 0 else ""


def armar(direccion):
    """El QR de la dirección: corrección de errores M (se lee bien desde una pantalla)."""
    import segno
    return segno.make(direccion, error="m", boost_error=False)


def crear_qr(direccion, salida, escala=10, margen=4):
    """Escribe el PNG del QR en `salida`. Devuelve el objeto QR (su `.version` dice el tamaño)."""
    qr = armar(direccion)
    qr.save(salida, kind="png", scale=escala, border=margen, dark="black", light="white")
    return qr


def main(argv):
    if "--salida" not in argv or argv.index("--salida") + 1 >= len(argv):
        print("crear_qr: falta --salida con la ruta del PNG (fuera del repositorio).")
        return 2
    salida = argv[argv.index("--salida") + 1]
    if dentro_del_repo(salida):
        print("crear_qr: la imagen lleva el enlace del catálogo y no puede quedar dentro del repositorio; elige otra carpeta.")
        return 2
    try:
        import segno  # noqa: F401
    except ImportError:
        print("crear_qr: falta la librería segno. Instálala con:  python -m pip install segno")
        return 3
    direccion = leer_portapapeles() if "--portapapeles" in argv else getpass.getpass("Pega la dirección de SIT con el enlace (no se muestra): ").strip()
    if not direccion.lower().startswith("https://"):
        print("crear_qr: el texto no parece una dirección https.")
        return 1
    try:
        os.makedirs(os.path.dirname(os.path.abspath(salida)), exist_ok=True)
        qr = crear_qr(direccion, salida)
    except OSError as e:
        print("crear_qr: no se pudo escribir la imagen (%s)." % e.__class__.__name__)
        return 4
    print("QR escrito: %s (versión %s, %d caracteres en el enlace)" % (salida, qr.version, len(direccion)))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
