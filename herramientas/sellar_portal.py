"""
sellar_portal.py — pone el sha256, el tamaño y la fecha en el portal.json de una carpeta de datos del portal.

    python sellar_portal.py <carpeta> [--generado AAAA-MM-DDTHH:MM:SSZ]

La carpeta lleva `portal.json` (contrato visor/1, con `tableros[].archivo`) y un JSON por tablero. Para cada tablero lee el
archivo, comprueba que sea un JSON de contrato visor/1 con el mismo `id` que su renglón, y escribe en `portal.json` su
`sha256` y `bytes`. El portal vuelve a calcular el sha256 al abrir el archivo y no lo muestra si no coincide.

ESCRITURA: `portal.json` se escribe completo como `portal.json.escribiendo` y pasa con `os.replace`.

Códigos: 0 sellado; 1 un archivo falta, no es JSON, no es contrato visor/1 o su id no coincide.
"""
import datetime
import hashlib
import json
import os
import sys

VERSION = "0.1"


class SelloError(Exception):
    pass


def sellar(carpeta, generado=None):
    ruta = os.path.join(carpeta, "portal.json")
    try:
        with open(ruta, encoding="utf-8") as f:
            portal = json.load(f)
    except (OSError, ValueError) as e:
        raise SelloError("no se pudo leer %s: %s" % (ruta, e))
    if portal.get("contrato") != "visor/1" or not isinstance(portal.get("tableros"), list):
        raise SelloError("portal.json: se esperaba contrato visor/1 con la lista tableros")

    vistos = set()
    for t in portal["tableros"]:
        for k in ("id", "titulo", "archivo"):
            if not isinstance(t.get(k), str) or not t[k]:
                raise SelloError("portal.json: un tablero sin %s" % k)
        if t["id"] in vistos:
            raise SelloError("portal.json: id repetido %s" % t["id"])
        vistos.add(t["id"])
        destino = os.path.normpath(os.path.join(carpeta, t["archivo"]))
        if os.path.commonpath([os.path.abspath(carpeta), os.path.abspath(destino)]) != os.path.abspath(carpeta):
            raise SelloError("%s: el archivo sale de la carpeta" % t["id"])
        try:
            with open(destino, "rb") as f:
                crudo = f.read()
            datos = json.loads(crudo.decode("utf-8"))
        except (OSError, ValueError) as e:
            raise SelloError("%s: no se pudo leer %s: %s" % (t["id"], t["archivo"], e))
        if datos.get("contrato") != "visor/1":
            raise SelloError("%s: %s no es contrato visor/1" % (t["id"], t["archivo"]))
        if datos.get("id") != t["id"]:
            raise SelloError("%s: %s trae el id %r" % (t["id"], t["archivo"], datos.get("id")))
        t["sha256"] = hashlib.sha256(crudo).hexdigest()
        t["bytes"] = len(crudo)

    portal["generado"] = generado or datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    tmp = ruta + ".escribiendo"
    with open(tmp, "w", encoding="utf-8", newline="\n") as f:
        json.dump(portal, f, ensure_ascii=False, indent=2)
        f.write("\n")
    os.replace(tmp, ruta)
    return portal


def main(argv):
    if len(argv) < 2 or argv[1].startswith("-"):
        print(__doc__)
        return 1
    generado = argv[argv.index("--generado") + 1] if "--generado" in argv else None
    try:
        p = sellar(argv[1], generado)
    except SelloError as e:
        print("sellar_portal %s: %s" % (VERSION, e))
        return 1
    print("sellar_portal %s: %d tableros sellados en %s" % (VERSION, len(p["tableros"]), os.path.join(argv[1], "portal.json")))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
