// Emblema de la gerencia. Los emblemas del Manual de Identidad son de uso interno: NO están en este repositorio. Viven en la carpeta
// `marca`, hermana de la carpeta del enlace, y el sitio los lee con la cuenta de cada persona (quien no tenga permiso ve la ilustración de respaldo).
// Archivos: emblema-<gerencia>.svg (positivo) y emblema-<gerencia>-negativo.svg (fondo oscuro; puede faltar). Módulo sin DOM ni red, para probarlo aparte.

export const MAX_SVG = 300 * 1024; // un archivo mayor se ignora

export function nombreEmblema(id, negativo) {
  if (typeof id !== "string" || !/^[a-z]{2,20}$/.test(id)) return null;
  return "emblema-" + id + (negativo ? "-negativo" : "") + ".svg";
}

// Convierte los bytes de un SVG en una dirección data: para un <img> (en un <img> un SVG no ejecuta nada). Devuelve null si no es un SVG simple.
export function aImagen(buf) {
  if (!buf || !buf.byteLength || buf.byteLength > MAX_SVG) return null;
  const bytes = new Uint8Array(buf);
  const texto = new TextDecoder("utf-8").decode(bytes).replace(/^﻿/, "").trim();
  if (!/^(<\?xml[^>]*\?>\s*)?<svg[\s>]/i.test(texto)) return null;
  if (/<script|<foreignObject|<iframe|<embed|<object|javascript:|\son[a-z]+\s*=/i.test(texto)) return null;
  let bin = "";
  for (let i = 0; i < bytes.length; i += 8192) bin += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return "data:image/svg+xml;base64," + btoa(bin);
}
