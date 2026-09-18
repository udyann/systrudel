const MAX_ANALYSIS_EDGE = 512;
const MAX_FILE_BYTES = 20 * 1024 * 1024;

/** Decode a local image and draw a bounded, aspect-preserving analysis canvas. */
export async function loadImage(file) {
  const startedAt = performance.now();
  if (file.type && !file.type.startsWith('image/')) {
    throw new Error('Choose an image file, such as a PNG, JPEG, or WebP.');
  }
  if (file.size > MAX_FILE_BYTES) {
    throw new Error('Choose an image smaller than 20 MB.');
  }

  const objectUrl = URL.createObjectURL(file);
  const image = new Image();

  try {
    image.src = objectUrl;
    try {
      await image.decode();
    } catch {
      throw new Error('This image could not be opened. Try a PNG, JPEG, or WebP file.');
    }
    const decodedAt = performance.now();

    const scale = Math.min(1, MAX_ANALYSIS_EDGE / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) {
      throw new Error('Canvas image analysis is unavailable in this browser.');
    }

    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
    return {
      canvas,
      pixels,
      originalWidth: image.naturalWidth,
      originalHeight: image.naturalHeight,
      timing: {
        decodeMs: decodedAt - startedAt,
        canvasMs: performance.now() - decodedAt,
      },
    };
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}
