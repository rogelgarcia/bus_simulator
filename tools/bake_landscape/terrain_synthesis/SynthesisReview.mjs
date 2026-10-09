// Renders deterministic review images (hillshade, slope, relief, elevation, cover maps, profile and histogram plots, labeled sheets).
// @ts-check
// Review images are the visual side of the synthesis measurements: pure Node rasters encoded with the dependency-free PNG codec, so a
// bake leaf can produce them headlessly and two runs of the same grid produce identical bytes. Map renderers take the plain grid object
// and return {width, height, channels: 3, bitDepth: 8, data}; writeReviewPng encodes one to disk.
import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { encodePng } from './interchange/PngCodec.mjs';

export { createCanvas, fillRect, strokeRect, drawLine, drawText, blit, textWidth, textHeight, rgbOf, mixRgb, niceStep, tickLabel } from './review/RasterCanvas.mjs';
export { GLYPH_WIDTH, GLYPH_HEIGHT, GLYPH_ADVANCE, glyphRows } from './review/BitmapFont.mjs';
export { LEGEND_HEIGHT, SLOPE_COLORS, RELIEF_RAMP, HYPSOMETRIC_STOPS, resampleArea, resampleNearest, hillshadeRaster, renderHillshade, renderMultidirectionalHillshade, renderSlopeMap, renderReliefMap, renderElevationMap, renderCoverMap, hypsometricColor, rampColor } from './review/MapRenders.mjs';
export { SERIES_COLORS, renderProfilePlot, renderHistogramPlot, composeSheet } from './review/PlotRenders.mjs';

/** Encodes a review image as PNG and writes it (creating the directory). @param {string} file @param {import('./review/RasterCanvas.mjs').ReviewImage} image */
export async function writeReviewPng(file, image) {
    const bytes = encodePng(image);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, bytes);
    return { file, byteLength: bytes.length, width: image.width, height: image.height };
}
