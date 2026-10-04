// Infers natural display ground from one immutable overview while preserving imported cover and semantic soil.
// @ts-check
import { landscapeRegionContains } from '../../../app/landscape/LandscapeRegions.js';

export const LANDSCAPE_NATURAL_PRESENTATION = 'natural-overview-infill-v1';

/** @param {any} descriptor @returns {{retainedBytes:number,workingBytes:number}} */
export function landscapeNaturalPresentationBytes(descriptor) {
    const count = descriptor.columns * descriptor.rows;
    return Object.freeze({ retainedBytes: count, workingBytes: count * 5 });
}

function naturalLabels(root, soilByCover, planning, fallback) {
    const { columns, rows } = root.descriptor, count = columns * rows;
    const labels = new Uint8Array(count), queue = new Uint32Array(count);
    labels.fill(255);
    let head = 0, tail = 0;
    for (let i = 0; i < count; i++) {
        if (planning.has(root.landCover[i])) continue;
        labels[i] = soilByCover.get(root.landCover[i]);
        queue[tail++] = i;
    }
    if (!tail) { labels.fill(fallback); return labels; }
    while (head < tail) {
        const i = queue[head++], column = i % columns, row = Math.floor(i / columns);
        for (let direction = 0; direction < 4; direction++) {
            const next = direction === 0 ? (row ? i - columns : -1) : direction === 1 ? (column ? i - 1 : -1)
                : direction === 2 ? (column < columns - 1 ? i + 1 : -1) : (row < rows - 1 ? i + columns : -1);
            if (next < 0 || labels[next] !== 255) continue;
            labels[next] = labels[i];
            queue[tail++] = next;
        }
    }
    return labels;
}

/** @param {any} manifest @param {{descriptor:any,landCover:Uint8Array}} root */
export function createLandscapeNaturalPresentation(manifest, root) {
    const { columns, rows, bounds } = root.descriptor;
    if (!(root.landCover instanceof Uint8Array) || root.landCover.length !== columns * rows || columns < 2 || rows < 2) throw new Error('Natural presentation requires a complete bounded overview cover');
    if (manifest.soil.catalog.length > 16) throw new Error('Natural presentation supports at most 16 packed soil identities');
    const soilIds = manifest.soil.catalog.map(soil => soil.id), soilByCover = new Map(manifest.soil.landCoverMapping.map(entry => [entry.landCoverId, soilIds.indexOf(entry.soilId)]));
    const planning = new Set(manifest.landCover.catalog.filter(entry => entry.planningOnly).map(entry => entry.id));
    for (const cover of root.landCover) if (!soilByCover.has(cover) || soilByCover.get(cover) < 0) throw new Error('Natural overview contains an unknown cover or soil identity');
    const fallback = soilIds.indexOf('loam') >= 0 ? soilIds.indexOf('loam') : soilIds.indexOf(manifest.soil.defaultId);
    if (fallback < 0) throw new Error('Natural presentation has no default soil identity');
    const labels = naturalLabels(root, soilByCover, planning, fallback);
    const reference = Object.freeze({ policy: LANDSCAPE_NATURAL_PRESENTATION, sourceHash: root.descriptor.channels.landCover.sha256,
        columns, rows, spacingX: (bounds.maxX - bounds.minX) / (columns - 1), spacingZ: (bounds.maxZ - bounds.minZ) / (rows - 1), ...landscapeNaturalPresentationBytes(root.descriptor) });
    const overrides = manifest.soil.overrides.map(override => ({ region: override.region, soil: soilIds.indexOf(override.soilId) }));

    function semanticOf(cover) {
        const semantic = soilByCover.get(cover);
        if (semantic === undefined) throw new Error(`Unknown natural presentation cover ${cover}`);
        return semantic;
    }

    function infill(x, z) {
        const column = Math.max(0, Math.min(columns - 1, Math.round((x - bounds.minX) / (bounds.maxX - bounds.minX) * (columns - 1))));
        const row = Math.max(0, Math.min(rows - 1, Math.round((bounds.maxZ - z) / (bounds.maxZ - bounds.minZ) * (rows - 1))));
        return labels[row * columns + column];
    }

    function sample(x, z, cover) {
        const semantic = semanticOf(cover);
        for (let i = overrides.length - 1; i >= 0; i--) if (landscapeRegionContains(overrides[i].region, x, z)) return overrides[i].soil * 17;
        if (!planning.has(cover)) return semantic * 17;
        return semantic | infill(x, z) << 4;
    }

    /** Packed semantic|display<<4 soil from cover and natural infill only, without authored overrides. */
    function sampleBase(x, z, cover) {
        const semantic = semanticOf(cover);
        return planning.has(cover) ? semantic | infill(x, z) << 4 : semantic * 17;
    }

    /** Semantic soil index after exact ordered override containment. */
    function semanticSoil(x, z, cover) {
        const semantic = semanticOf(cover);
        for (let i = overrides.length - 1; i >= 0; i--) if (landscapeRegionContains(overrides[i].region, x, z)) return overrides[i].soil;
        return semantic;
    }

    return Object.freeze({ sample, sampleBase, semanticSoil, reference });
}

/** @param {ReturnType<typeof createLandscapeNaturalPresentation>} presentation @param {any} descriptor @param {Uint8Array} landCover */
export function rasterizeLandscapeDisplayMask(presentation, descriptor, landCover) {
    const { columns, rows, bounds } = descriptor;
    if (!(landCover instanceof Uint8Array) || landCover.length !== columns * rows) throw new Error('Display mask dimensions do not match the cover channel');
    const pixels = new Uint8Array(landCover.length * 2), soils = new Set();
    for (let row = 0; row < rows; row++) for (let column = 0; column < columns; column++) {
        const index = row * columns + column;
        const x = bounds.minX + column * (bounds.maxX - bounds.minX) / (columns - 1), z = bounds.maxZ - row * (bounds.maxZ - bounds.minZ) / (rows - 1);
        pixels[index * 2] = presentation.sample(x, z, landCover[index]);
        pixels[index * 2 + 1] = landCover[index];
        soils.add(pixels[index * 2] >> 4);
    }
    return { pixels, soils: [...soils].sort((a, b) => a - b) };
}
