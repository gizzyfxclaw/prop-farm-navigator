/**
 * Client-side image downscale/compress to a JPEG data URL, so a phone photo
 * of a chart doesn't blow past D1's row-size limit. Only uses browser
 * globals (Image, canvas) inside function bodies — safe to import normally,
 * nothing runs at module load time so there's nothing for SSR to choke on.
 */
export async function resizeImageToDataUrl(
  file: File,
  { maxDim = 1600, quality = 0.72 }: { maxDim?: number; quality?: number } = {},
): Promise<string> {
  const src = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });

  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error("Could not decode image"));
    el.src = src;
  });

  const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
  const w = Math.round(img.width * scale);
  const h = Math.round(img.height * scale);

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas not supported");
  ctx.drawImage(img, 0, 0, w, h);

  return canvas.toDataURL("image/jpeg", quality);
}
