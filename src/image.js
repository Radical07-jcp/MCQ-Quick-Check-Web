/* Photo -> RGBA at a bounded size (the scan windows are relative, so a smaller image is equivalent and faster). */
export async function loadPhoto(file, maxSide = 1600) {
  const bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
  const k = Math.min(1, maxSide / Math.max(bmp.width, bmp.height)), w = Math.round(bmp.width * k), h = Math.round(bmp.height * k);
  const c = document.createElement("canvas"); c.width = w; c.height = h; const ctx = c.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(bmp, 0, 0, w, h); bmp.close && bmp.close();
  const id = ctx.getImageData(0, 0, w, h); return { data: id.data, width: w, height: h };
}
