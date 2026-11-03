// Si la página se abre dentro de un marco de otro sitio, no se muestra: así nadie puede encimar clics sobre SIT.
// Se importa antes que todo lo demás, en cada página.
if (window.top !== window.self) {
  const abrir = document.createElement("a");
  abrir.href = window.self.location.href; abrir.target = "_top"; abrir.rel = "noopener";
  abrir.textContent = "Abrir SIT en su propia ventana";
  document.body.replaceChildren(abrir);
  throw new Error("SIT no se muestra dentro de otro sitio.");
}
