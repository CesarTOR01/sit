"""
crear_marcador.py — arma la dirección de SIT con el enlace del catálogo en el fragmento (#c=...).

    python crear_marcador.py [--base https://cesartor01.github.io/sit/]
    (el enlace de compartir se pega cuando el programa lo pide; no se escribe en ningún archivo)

El fragmento de una dirección nunca viaja al servidor que publica el sitio. SIT lo lee, lo borra de la barra de
direcciones, lo usa una sola vez con la cuenta de la persona y guarda sólo los identificadores de la carpeta.

Hay que ejecutarlo en un equipo propio y repartir la dirección resultante por un canal interno, no por el repositorio.

Códigos: 0 dirección impresa; 1 el texto pegado no parece un enlace.
"""
import base64
import getpass
import sys

BASE = "https://cesartor01.github.io/sit/"


def id_compartido(enlace):
    """Codificación de uso compartido de Microsoft Graph: u! + base64url del enlace, sin relleno."""
    b = base64.urlsafe_b64encode(enlace.encode("utf-8")).decode("ascii").rstrip("=")
    return "u!" + b


def main(argv):
    base = argv[argv.index("--base") + 1] if "--base" in argv else BASE
    if not base.endswith("/"):
        base += "/"
    enlace = getpass.getpass("Pega el enlace de compartir del catálogo (no se muestra): ").strip()
    if not enlace.lower().startswith("https://"):
        print("crear_marcador: el texto pegado no parece un enlace https.")
        return 1
    print(base + "#c=" + id_compartido(enlace))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
