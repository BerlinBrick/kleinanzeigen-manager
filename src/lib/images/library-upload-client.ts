const MAX_DIMENSION = 1800;
const MAX_UPLOAD_BYTES = 750 * 1024;

/**
 * Keeps every multipart request below nginx's 1 MB default body limit. Large
 * phone photos are resized and JPEG-compressed before being uploaded one by one.
 */
export async function prepareLibraryImage(file: File): Promise<File> {
  if (file.size <= MAX_UPLOAD_BYTES) return file;
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const context = canvas.getContext('2d');
  if (!context) throw new Error(`Bild ${file.name} konnte nicht verarbeitet werden`);
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();

  let quality = 0.84;
  let blob: Blob | null = null;
  while (quality >= 0.42) {
    blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
    if (blob && blob.size <= MAX_UPLOAD_BYTES) break;
    quality -= 0.08;
  }
  if (!blob || blob.size > MAX_UPLOAD_BYTES) throw new Error(`Bild ${file.name} ist auch nach Komprimierung zu groß`);
  return new File([blob], `${file.name.replace(/\.[^.]+$/, '')}.jpg`, { type: 'image/jpeg' });
}
