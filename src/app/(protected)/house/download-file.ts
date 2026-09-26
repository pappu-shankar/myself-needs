/** Triggers a browser download of a data/blob URL — shared by the 3D view's PNG export and the 2D plan's SVG export. */
export function downloadDataUrl(dataUrl: string, filename: string) {
  const a = document.createElement("a");
  a.href = dataUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}
