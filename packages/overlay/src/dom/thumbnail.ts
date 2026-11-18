/**
 * A small square preview of an image, as a JPEG data URL: the middle of it,
 * cropped to fill `size` px (twice the 42px it shows at, for sharp screens).
 * Small enough to keep with the thread in sessionStorage. Undefined when
 * the browser can't read the image.
 */
export async function thumbnail(file: Blob, size = 84): Promise<string | undefined> {
  if (typeof createImageBitmap !== "function") return undefined;
  try {
    const bitmap = await createImageBitmap(file);
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = size;
    const context = canvas.getContext("2d");
    if (!context) return undefined;
    const scale = Math.max(size / bitmap.width, size / bitmap.height);
    const width = bitmap.width * scale;
    const height = bitmap.height * scale;
    context.drawImage(bitmap, (size - width) / 2, (size - height) / 2, width, height);
    bitmap.close();
    return canvas.toDataURL("image/jpeg", 0.8);
  } catch {
    return undefined;
  }
}
