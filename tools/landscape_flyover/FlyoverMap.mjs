// Rasterizes the flyover's map: hillshaded land cover of the landscape and its far-field surround, with the planned route on top.
// @ts-check
// The same base raster serves the per-frame minimap (drawn without the route; the HUD strokes the route and the camera in the page)
// and the plan image (route, keys and caption starts burnt in), so the minimap shows exactly what the plan validated. Each source is
// read at the coarsest hierarchy level that is at least as fine as one map pixel; the first source covering a pixel wins.
import { LANDSCAPE_LAND_COVER_CATALOG } from '../../src/app/landscape/LandscapeCatalog.js';
import { readLandscapeFileChunk, readLandscapeFileManifest } from '../landscape_authoring/LandscapeFileIO.mjs';
import { encodePng } from '../bake_landscape/terrain_synthesis/interchange/PngCodec.mjs';
import { createCanvas, drawLine, drawText, fillRect, mixRgb, rgbOf, textWidth } from '../bake_landscape/terrain_synthesis/review/RasterCanvas.mjs';

/** @typedef {{minX:number,maxX:number,minZ:number,maxZ:number}} MapWindow */
/** @typedef {{manifest:any,bounds:MapWindow,chunks:{descriptor:any,heights:Float32Array,landCover:Uint8Array}[]}} MapSource */

const COVER_COLORS = new Map(LANDSCAPE_LAND_COVER_CATALOG.map(entry => [entry.id, rgbOf(entry.color)]));
const WATER_SHALLOW = rgbOf('#8fc9c6'), WATER_DEEP = rgbOf('#1c4f6b'), WATER_FLOOR = rgbOf('#12344a');
const EXTENT_COLOR = rgbOf('#f4efe2'), ROUTE_COLOR = rgbOf('#ffd166'), ROUTE_SHADOW = rgbOf('#1b1f24'), KEY_COLOR = rgbOf('#ffffff'), CAPTION_COLOR = rgbOf('#ff7b54');

/**
 * Loads the chunks of one saved landscape that intersect the window at the coarsest level no coarser than `pixelMeters`.
 * @param {string} directory @param {MapWindow} window @param {number} pixelMeters @returns {Promise<MapSource>}
 */
export async function loadMapSource(directory, window, pixelMeters) {
    const { manifest } = await readLandscapeFileManifest(directory);
    const spacing = (/** @type {number} */ level) => manifest.chunks.find((/** @type {any} */ chunk) => chunk.level === level).sampleStride * manifest.grid.spacingX;
    let level = manifest.grid.maxLevel;
    for (let candidate = 0; candidate <= manifest.grid.maxLevel; candidate++) if (spacing(candidate) <= pixelMeters) { level = candidate; break; }
    const descriptors = manifest.chunks.filter((/** @type {any} */ chunk) => chunk.level === level && chunk.bounds.maxX >= window.minX && chunk.bounds.minX <= window.maxX && chunk.bounds.maxZ >= window.minZ && chunk.bounds.minZ <= window.maxZ);
    const chunks = [];
    for (const descriptor of descriptors) chunks.push(await readLandscapeFileChunk(directory, manifest, descriptor.id));
    return { manifest, bounds: manifest.bounds, chunks };
}

/** @param {MapSource} source @param {number} x @param {number} z */
function nearestSample(source, x, z) {
    const { minX, maxX, minZ, maxZ } = source.bounds;
    if (x < minX || x > maxX || z < minZ || z > maxZ) return null;
    const chunk = source.chunks.find(entry => x >= entry.descriptor.bounds.minX && x <= entry.descriptor.bounds.maxX && z >= entry.descriptor.bounds.minZ && z <= entry.descriptor.bounds.maxZ);
    if (!chunk) return null;
    const { columns, rows, bounds } = chunk.descriptor;
    const column = Math.round((x - bounds.minX) / (bounds.maxX - bounds.minX) * (columns - 1)), row = Math.round((bounds.maxZ - z) / (bounds.maxZ - bounds.minZ) * (rows - 1));
    const index = row * columns + column;
    return { height: chunk.heights[index], cover: chunk.landCover[index] };
}

/**
 * A square window around the route's ground track with a margin, never smaller than `minimumMeters`.
 * @param {readonly {position:readonly number[]}[]} frames @param {{marginFraction?:number, minimumMeters?:number}} [options] @returns {MapWindow}
 */
export function flyoverMapWindow(frames, { marginFraction = 0.08, minimumMeters = 4000 } = {}) {
    const xs = frames.map(frame => frame.position[0]), zs = frames.map(frame => frame.position[2]);
    const minX = Math.min(...xs), maxX = Math.max(...xs), minZ = Math.min(...zs), maxZ = Math.max(...zs);
    const half = Math.max(maxX - minX, maxZ - minZ, minimumMeters) * (0.5 + marginFraction), centerX = (minX + maxX) / 2, centerZ = (minZ + maxZ) / 2;
    return { minX: centerX - half, maxX: centerX + half, minZ: centerZ - half, maxZ: centerZ + half };
}

/**
 * Hillshaded land cover over the window: water by depth, land by its cover color under a NW light, the authoritative extent outlined.
 * @param {{window:MapWindow, size:number, sources:readonly MapSource[], seaLevel:number, extent:MapWindow}} options
 */
export function renderFlyoverBaseMap({ window, size, sources, seaLevel, extent }) {
    const pixel = (window.maxX - window.minX) / size, heights = new Float32Array(size * size), cover = new Int16Array(size * size).fill(-1);
    for (let row = 0; row < size; row++) {
        for (let column = 0; column < size; column++) {
            const x = window.minX + (column + 0.5) * pixel, z = window.maxZ - (row + 0.5) * pixel;
            let sample = null;
            for (const source of sources) if ((sample = nearestSample(source, x, z))) break;
            heights[row * size + column] = sample ? sample.height : seaLevel - 60;
            cover[row * size + column] = sample ? sample.cover : -1;
        }
    }
    const canvas = createCanvas(size, size), light = [-Math.SQRT1_2 * Math.cos(Math.PI / 4), Math.sin(Math.PI / 4), Math.SQRT1_2 * Math.cos(Math.PI / 4)];
    const at = (/** @type {number} */ column, /** @type {number} */ row) => heights[Math.min(size - 1, Math.max(0, row)) * size + Math.min(size - 1, Math.max(0, column))];
    for (let row = 0; row < size; row++) {
        for (let column = 0; column < size; column++) {
            const index = row * size + column, height = heights[index];
            const dx = (at(column + 1, row) - at(column - 1, row)) / (2 * pixel) * 1.6, dz = (at(column, row - 1) - at(column, row + 1)) / (2 * pixel) * 1.6;
            const length = Math.hypot(dx, 1, dz), shade = Math.max(0, (-dx * light[0] + light[1] - dz * light[2]) / length);
            let color;
            if (height < seaLevel) {
                const depth = seaLevel - height;
                color = depth <= 30 ? mixRgb(WATER_SHALLOW, WATER_DEEP, Math.sqrt(depth / 30)) : mixRgb(WATER_DEEP, WATER_FLOOR, Math.min(1, (depth - 30) / 30));
                color = mixRgb(color, [255, 255, 255], Math.max(0, shade - 0.7) * 0.4);
            } else {
                const base = COVER_COLORS.get(cover[index]) ?? COVER_COLORS.get(3);
                color = /** @type {[number,number,number]} */ ((base ?? [96, 120, 80]).map(channel => Math.min(255, Math.round(channel * (0.5 + 0.75 * shade)))));
            }
            canvas.data.set(color, index * 3);
        }
    }
    const toPixel = (/** @type {number} */ x, /** @type {number} */ z) => [(x - window.minX) / pixel, (window.maxZ - z) / pixel];
    const corners = [[extent.minX, extent.minZ], [extent.maxX, extent.minZ], [extent.maxX, extent.maxZ], [extent.minX, extent.maxZ]].map(([x, z]) => toPixel(x, z));
    corners.forEach((corner, index) => { const next = corners[(index + 1) % 4]; drawLine(canvas, Math.round(corner[0]), Math.round(corner[1]), Math.round(next[0]), Math.round(next[1]), EXTENT_COLOR, 1); });
    return canvas;
}

/**
 * Burns the planned route into a copy of the base map: the flown track, numbered keys and the start of every caption.
 * @param {ReturnType<typeof createCanvas>} base @param {MapWindow} window
 * @param {{frames:readonly {position:readonly number[]}[], keyTimes:readonly number[], fps:number, captions:readonly {index:number,startSeconds:number}[]}} plan @param {string} title
 */
export function renderFlyoverPlanMap(base, window, plan, title) {
    const size = base.width, pixel = (window.maxX - window.minX) / size, canvas = createCanvas(size, size + 28, [24, 28, 34]);
    canvas.data.set(base.data, 0);
    const toPixel = (/** @type {readonly number[]} */ position) => [Math.round((position[0] - window.minX) / pixel), Math.round((window.maxZ - position[2]) / pixel)];
    const track = plan.frames.map(frame => toPixel(frame.position));
    for (let index = 1; index < track.length; index++) drawLine(canvas, track[index - 1][0], track[index - 1][1], track[index][0], track[index][1], ROUTE_SHADOW, 5);
    for (let index = 1; index < track.length; index++) drawLine(canvas, track[index - 1][0], track[index - 1][1], track[index][0], track[index][1], ROUTE_COLOR, 2);
    const frameAt = (/** @type {number} */ seconds) => plan.frames[Math.min(plan.frames.length - 1, Math.round(seconds * plan.fps))];
    plan.keyTimes.forEach((seconds, key) => {
        const [x, y] = toPixel(frameAt(seconds).position);
        fillRect(canvas, x - 3, y - 3, 7, 7, ROUTE_SHADOW);
        fillRect(canvas, x - 2, y - 2, 5, 5, KEY_COLOR);
        drawText(canvas, x + 6, y - 4, `K${key}`, KEY_COLOR, 1);
    });
    for (const caption of plan.captions) {
        const [x, y] = toPixel(frameAt(caption.startSeconds).position), label = `F${caption.index + 1}`;
        fillRect(canvas, x - 4, y + 6, textWidth(label, 2) + 8, 20, ROUTE_SHADOW);
        drawText(canvas, x, y + 9, label, CAPTION_COLOR, 2);
    }
    drawText(canvas, 8, size + 8, title, [230, 230, 230], 2);
    return canvas;
}

/** @param {ReturnType<typeof createCanvas>} canvas */
export const encodeMapPng = canvas => encodePng({ width: canvas.width, height: canvas.height, channels: 3, bitDepth: 8, data: canvas.data });
