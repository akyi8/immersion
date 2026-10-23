/**
 * Decides whether text laid over an image should be white or black, by measuring
 * the brightness of the part of the image the text will cover. The image is drawn
 * with `object-fit: cover`, so the function works out which part of the image is
 * actually on screen before sampling it.
 */
export interface Region {
  /** Left edge of the text area, as a fraction of the viewport width. */
  left: number;
  /** Top edge of the text area, as a fraction of the viewport height. */
  top: number;
  width: number;
  height: number;
}

export async function textColorOver(
  src: string,
  viewport: { width: number; height: number },
  region: Region,
): Promise<'light' | 'dark'> {
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.src = src;
  await img.decode();

  // object-fit: cover scales the image to fill the viewport and crops the overflow.
  const scale = Math.max(viewport.width / img.naturalWidth, viewport.height / img.naturalHeight);
  const shownW = viewport.width / scale;
  const shownH = viewport.height / scale;
  const offsetX = (img.naturalWidth - shownW) / 2;
  const offsetY = (img.naturalHeight - shownH) / 2;

  const sx = offsetX + region.left * shownW;
  const sy = offsetY + region.top * shownH;
  const sw = Math.max(1, region.width * shownW);
  const sh = Math.max(1, region.height * shownH);

  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return 'light';
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, 64, 64);

  let total = 0;
  try {
    const { data } = ctx.getImageData(0, 0, 64, 64);
    for (let i = 0; i < data.length; i += 4) {
      // Relative luminance weights for sRGB.
      total += 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
    }
  } catch {
    return 'light';
  }
  const mean = total / (64 * 64);
  // Bright backgrounds take dark text, and dark backgrounds take light text.
  return mean > 140 ? 'dark' : 'light';
}
