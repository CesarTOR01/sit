"""
crear_acceso.py — arma sit-acceso.json (catálogo de acceso de SIT) a partir de una hoja local de correo y etiquetas.

    python crear_acceso.py --hoja <hoja.csv|hoja.xlsx> --salida <carpeta\\sit-acceso.json>

La hoja tiene una columna "correo" (el correo con el que la persona inicia sesión, su nombre de usuario; si no coincide, la
persona cae al Departamento) y una columna "etiquetas" (varias, separadas por punto y coma). Una etiqueta es el nombre de
una gerencia, "Dirección", "General" o una audiencia declarada en los catálogos de tableros. Primer renglón: encabezados.

El archivo que se escribe no lleva correos: la llave de cada persona es el SHA-256 del correo en minúsculas, el mismo que SIT calcula
en el navegador con el perfil de quien entra. SIT sólo usa este archivo para decidir qué se muestra; la barrera real son los permisos
de la carpeta. La hoja y la salida se pasan por argumento: ninguna ruta va fija. La hoja no se guarda en ningún repositorio.

Hay que ejecutarlo en un equipo propio. La salida se escribe completa o no se escribe (archivo temporal y reemplazo).

Códigos: 0 escrito; 1 la hoja no sirve (columna, correo o etiqueta no válidos, o un correo repetido); 2 argumentos.
"""
import csv
import hashlib
import json
import os
import re
import sys
from datetime import datetime, timezone

MAX_ETIQUETAS = 20
MAX_LARGO = 64
CORREO = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


def llave(correo):
    """SHA-256 del correo recortado y en minúsculas, en hexadecimal."""
    return hashlib.sha256(correo.strip().lower().encode("utf-8")).hexdigest()


def renglones(ruta):
    """Lee la hoja y devuelve una lista de diccionarios con las claves en minúsculas."""
    ext = os.path.splitext(ruta)[1].lower()
    if ext == ".csv":
        with open(ruta, encoding="utf-8-sig", newline="") as f:
            muestra = f.read(4096)
            f.seek(0)
            try:
                dialecto = csv.Sniffer().sniff(muestra, delimiters=",;\t")
            except csv.Error:
                dialecto = csv.excel
            return [{(k or "").strip().lower(): (v or "") for k, v in r.items()} for r in csv.DictReader(f, dialect=dialecto)]
    if ext == ".xlsx":
        try:
            from openpyxl import load_workbook
        except ImportError:
            raise SystemExit("crear_acceso: para leer .xlsx hace falta openpyxl; guarda la hoja como .csv.")
        hoja = load_workbook(ruta, read_only=True, data_only=True).active
        filas = list(hoja.iter_rows(values_only=True))
        if not filas:
            return []
        claves = [str(c or "").strip().lower() for c in filas[0]]
        return [{k: ("" if v is None else str(v)) for k, v in zip(claves, f)} for f in filas[1:]]
    raise SystemExit("crear_acceso: la hoja debe ser .csv o .xlsx.")


def armar(filas):
    """Devuelve (personas, errores). Los errores dicen el renglón, nunca el correo."""
    personas, errores = {}, []
    for n, r in enumerate(filas, 2):
        correo = (r.get("correo") or "").strip()
        crudas = (r.get("etiquetas") or "").strip()
        if not correo and not crudas:
            continue
        if not CORREO.match(correo):
            errores.append("renglón %d: el correo no es válido" % n)
            continue
        etiquetas = []
        for e in (x.strip() for x in crudas.split(";")):
            if e and e not in etiquetas:
                etiquetas.append(e)
        if not etiquetas or len(etiquetas) > MAX_ETIQUETAS or any(len(e) > MAX_LARGO for e in etiquetas):
            errores.append("renglón %d: de 1 a %d etiquetas de hasta %d caracteres" % (n, MAX_ETIQUETAS, MAX_LARGO))
            continue
        k = llave(correo)
        if k in personas:
            errores.append("renglón %d: la persona ya apareció antes" % n)
            continue
        personas[k] = etiquetas
    return personas, errores


def escribir(salida, personas):
    datos = {"contrato": "acceso/1", "generado": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"), "personas": personas}
    temporal = salida + ".escribiendo"
    with open(temporal, "w", encoding="utf-8", newline="\n") as f:
        json.dump(datos, f, ensure_ascii=False, indent=1)
        f.write("\n")
    os.replace(temporal, salida)


def main(argv):
    def opcion(nombre):
        return argv[argv.index(nombre) + 1] if nombre in argv and argv.index(nombre) + 1 < len(argv) else None

    hoja, salida = opcion("--hoja"), opcion("--salida")
    if not hoja or not salida or os.path.basename(salida).lower() != "sit-acceso.json":
        print(__doc__)
        return 2
    filas = renglones(hoja)
    if filas and not {"correo", "etiquetas"} <= set(filas[0]):
        print("crear_acceso: la hoja necesita las columnas correo y etiquetas.")
        return 1
    personas, errores = armar(filas)
    for e in errores:
        print("crear_acceso:", e)
    if errores:
        return 1
    escribir(salida, personas)
    print("crear_acceso: %d personas escritas." % len(personas))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
