// Draws deterministic 8-bit RGB rasters (fills, Bresenham lines, bitmap text, blits) for the terrain review images and plots.
// @ts-check
// A canvas is the same plain object the PNG codec encodes ({width, height, channels: 3, bitDepth: 8, data}); every primitive clips to
// the canvas, writes integer pixels only and never reads system fonts or anti-aliasing tables, so two runs produce identical bytes.
import { GLYPH_ADVANCE, GLYPH_HEIGHT, GLYPH_WIDTH, glyphRows, textWidth } from './BitmapFont.mjs';

/** @typedef {{width:number,height:number,channels:3,bitDepth:8,data:Uint8Array}} ReviewImage */
/** @typedef {[number,number,number]} Rgb */

/** @param {string} hex #rrggbb @returns {Rgb} */
export function rgbOf(hex) {
    const match = /^#([0-9a-fA-F]{6})$/.exec(hex);
    if (!match) throw new Error(`[SynthesisReview] Invalid color ${hex}`);
    const value = parseInt(match[1], 16);
    return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

/** @param {Rgb} a @param {Rgb} b @param {number} t @returns {Rgb} */
export const mixRgb = (a, b, t) => /** @type {Rgb} */ ([0, 1, 2].map(k => Math.round(a[k] + (b[k] - a[k]) * t)));

/** @param {number} width @param {number} height @param {Rgb} [background] @returns {ReviewImage} */
export function createCanvas(width, height, background = [255, 255, 255]) {
    if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) throw new Error(`[SynthesisReview] Invalid canvas size ${width}x${height}`);
    const data = new Uint8Array(width * height * 3);
    for (let i = 0; i < width * height; i++) { data[i * 3] = background[0]; data[i * 3 + 1] = background[1]; data[i * 3 + 2] = background[2]; }
    return { width, height, channels: 3, bitDepth: 8, data };
}

/** @param {ReviewImage} canvas @param {number} x @param {number} y @param {Rgb} color */
export function setPixel(canvas, x, y, color) {
    if (x < 0 || y < 0 || x >= canvas.width || y >= canvas.height) return;
    const i = (y * canvas.width + x) * 3;
    canvas.data[i] = color[0]; canvas.data[i + 1] = color[1]; canvas.data[i + 2] = color[2];
}

/** @param {ReviewImage} canvas @param {number} x @param {number} y @param {number} width @param {number} height @param {Rgb} color */
export function fillRect(canvas, x, y, width, height, color) {
    const x0 = Math.max(0, Math.round(x)), y0 = Math.max(0, Math.round(y)), x1 = Math.min(canvas.width, Math.round(x + width)), y1 = Math.min(canvas.height, Math.round(y + height));
    for (let py = y0; py < y1; py++) for (let px = x0; px < x1; px++) { const i = (py * canvas.width + px) * 3; canvas.data[i] = color[0]; canvas.data[i + 1] = color[1]; canvas.data[i + 2] = color[2]; }
}

/** @param {ReviewImage} canvas @param {number} x @param {number} y @param {number} width @param {number} height @param {Rgb} color */
export function strokeRect(canvas, x, y, width, height, color) {
    drawLine(canvas, x, y, x + width - 1, y, color); drawLine(canvas, x, y + height - 1, x + width - 1, y + height - 1, color);
    drawLine(canvas, x, y, x, y + height - 1, color); drawLine(canvas, x + width - 1, y, x + width - 1, y + height - 1, color);
}

/** Bresenham line with an optional square pen. @param {ReviewImage} canvas @param {Rgb} color */
export function drawLine(canvas, x0, y0, x1, y1, color, thickness = 1) {
    let ax = Math.round(x0), ay = Math.round(y0);
    const bx = Math.round(x1), by = Math.round(y1), dx = Math.abs(bx - ax), dy = -Math.abs(by - ay), sx = ax < bx ? 1 : -1, sy = ay < by ? 1 : -1;
    let error = dx + dy;
    const half = Math.floor((thickness - 1) / 2);
    for (;;) {
        if (thickness === 1) setPixel(canvas, ax, ay, color);
        else for (let oy = -half; oy < thickness - half; oy++) for (let ox = -half; ox < thickness - half; ox++) setPixel(canvas, ax + ox, ay + oy, color);
        if (ax === bx && ay === by) break;
        const doubled = 2 * error;
        if (doubled >= dy) { error += dy; ax += sx; }
        if (doubled <= dx) { error += dx; ay += sy; }
    }
}

/** Draws text with the embedded 5x7 font scaled by an integer factor; returns the advance width. @param {ReviewImage} canvas @param {string} text @param {Rgb} color */
export function drawText(canvas, x, y, text, color, scale = 1) {
    if (!Number.isInteger(scale) || scale < 1) throw new Error('[SynthesisReview] Text scale must be a positive integer');
    const left = Math.round(x), top = Math.round(y);
    for (let index = 0; index < text.length; index++) {
        const rows = glyphRows(text[index]), originX = left + index * GLYPH_ADVANCE * scale;
        for (let row = 0; row < GLYPH_HEIGHT; row++) for (let column = 0; column < GLYPH_WIDTH; column++) {
            if (!(rows[row] & (1 << (GLYPH_WIDTH - 1 - column)))) continue;
            fillRect(canvas, originX + column * scale, top + row * scale, scale, scale, color);
        }
    }
    return textWidth(text, scale);
}

/** Pixel height of text at a scale. */
export const textHeight = scale => GLYPH_HEIGHT * scale;
export { textWidth };

/** Copies `source` onto `canvas` at (x, y), clipping at the edges. @param {ReviewImage} canvas @param {ReviewImage} source */
export function blit(canvas, source, x, y) {
    if (source.channels !== 3 || source.bitDepth !== 8) throw new Error('[SynthesisReview] Only 8-bit RGB images can be composed');
    const left = Math.round(x), top = Math.round(y);
    for (let sy = 0; sy < source.height; sy++) {
        const py = top + sy;
        if (py < 0 || py >= canvas.height) continue;
        for (let sx = 0; sx < source.width; sx++) {
            const px = left + sx;
            if (px < 0 || px >= canvas.width) continue;
            const s = (sy * source.width + sx) * 3, d = (py * canvas.width + px) * 3;
            canvas.data[d] = source.data[s]; canvas.data[d + 1] = source.data[s + 1]; canvas.data[d + 2] = source.data[s + 2];
        }
    }
}

/** "Nice" tick step (1, 2, 5 x 10^k) producing about `target` ticks across a span. */
export function niceStep(span, target) {
    if (!(span > 0) || !(target > 0)) throw new Error('[SynthesisReview] Tick span and target count must be positive');
    const rough = span / target, magnitude = 10 ** Math.floor(Math.log10(rough)), residual = rough / magnitude;
    return (residual >= 5 ? 5 : residual >= 2 ? 2 : 1) * magnitude;
}

/** Formats a tick value without floating noise. */
export function tickLabel(value, step) {
    const decimals = Math.max(0, -Math.floor(Math.log10(step) + 1e-9));
    return value.toFixed(decimals);
}
