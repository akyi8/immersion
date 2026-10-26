/**
 * Turns a chosen picture into a data URL small enough to keep inside an encrypted story:
 * at most 1600 pixels on its longest side, as a JPEG. It never touches the disk unencrypted.
 */
export async function pictureData(bytes: Uint8Array, longest = 1600): Promise<string> {
  const bitmap = await createImageBitmap(new Blob([bytes as Uint8Array<ArrayBuffer>]));
  const scale = Math.min(1, longest / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return canvas.toDataURL('image/jpeg', 0.86);
}
