/**
 * Extract normalized visual features from Canvas ImageData (or equivalent RGBA
 * bytes). This function has no DOM or music dependencies.
 *
 * RGB channels are averaged in sRGB space with alpha as a weight. Brightness
 * is a weighted sRGB proxy, not gamma-corrected physical luminance.
 * @param {{ data: Uint8ClampedArray }} imageData
 * @returns {{ brightness: number, rgb: { r: number, g: number, b: number } }}
 */
export function extractFeatures({ data }) {
  if (!(data instanceof Uint8ClampedArray) || data.length === 0 || data.length % 4 !== 0) {
    throw new Error('Expected a non-empty array of RGBA pixels.');
  }

  let red = 0;
  let green = 0;
  let blue = 0;
  let totalAlpha = 0;

  for (let index = 0; index < data.length; index += 4) {
    const alpha = data[index + 3] / 255;
    red += data[index] * alpha;
    green += data[index + 1] * alpha;
    blue += data[index + 2] * alpha;
    totalAlpha += alpha;
  }

  if (totalAlpha === 0) {
    throw new Error('This image is fully transparent. Choose an image with visible pixels.');
  }

  const rgb = {
    r: red / totalAlpha / 255,
    g: green / totalAlpha / 255,
    b: blue / totalAlpha / 255,
  };

  return {
    brightness: 0.2126 * rgb.r + 0.7152 * rgb.g + 0.0722 * rgb.b,
    rgb,
  };
}
