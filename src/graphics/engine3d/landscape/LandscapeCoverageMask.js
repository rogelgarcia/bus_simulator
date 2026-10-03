// Authenticates a bounded same-level cover neighborhood and packs canonical reconstruction halos.
// @ts-check
import { loadLandscapeCoverMask } from '../../../app/landscape/LandscapeAppearancePayload.js';
import { landscapeCoverageMaskLayout } from './LandscapeSurfaceCoverage.js';
import { buildLandscapeContourCoverage } from './LandscapeContourCoverage.js';

/** @param {{manifest:any,manifestUrl:string,presentation:any,chunkId:string,landCover?:Uint8Array,loadCover?:(id:string)=>Promise<any>}} options */
export async function createLandscapeCoverageMask({ manifest, manifestUrl, presentation, chunkId, landCover, loadCover = id => loadLandscapeCoverMask(manifest, id, { manifestUrl }) }) {
    const descriptor = manifest.chunks.find(chunk => chunk.id === chunkId);
    if (!descriptor) throw new Error(`Unknown coverage mask ${chunkId}`);
    const layout = landscapeCoverageMaskLayout(descriptor), { sourceHalo: halo, sourceWidth: width, sourceHeight: height } = layout;
    if (landCover && (!(landCover instanceof Uint8Array) || landCover.length !== descriptor.columns * descriptor.rows)) throw new Error('Coverage mask dimensions do not match source cover');
    const sourcePixels = new Uint8Array(width * height * 2), sourceIds = [], soils = new Set();
    const stride = descriptor.sampleStride, intervals = manifest.grid.chunkIntervals * stride, count = 2 ** descriptor.level;
    const neighbors = manifest.chunks.filter(chunk => chunk.level === descriptor.level);
    const byPosition = new Map(neighbors.map(chunk => [`${chunk.column}/${chunk.row}`, chunk]));
    const needed = new Map();
    for (let row = 0; row < height; row++) for (let column = 0; column < width; column++) {
        const globalColumn = Math.max(0, Math.min(manifest.grid.columns - 1, descriptor.startColumn + (column - halo) * stride));
        const globalRow = Math.max(0, Math.min(manifest.grid.rows - 1, descriptor.startRow + (row - halo) * stride));
        const ownerColumn = Math.min(count - 1, Math.floor(globalColumn / intervals)), ownerRow = Math.min(count - 1, Math.floor(globalRow / intervals));
        const owner = byPosition.get(`${ownerColumn}/${ownerRow}`);
        if (!owner) throw new Error(`Coverage mask ${chunkId} lacks canonical same-level support ${ownerColumn}/${ownerRow}`);
        if (!needed.has(owner.id)) needed.set(owner.id, owner);
    }
    for (const owner of needed.values()) {
        const cover = owner.id === chunkId && landCover ? landCover : (await loadCover(owner.id)).landCover;
        if (!(cover instanceof Uint8Array) || cover.length !== owner.columns * owner.rows) throw new Error(`Invalid coverage support ${owner.id}`);
        sourceIds.push(owner.id);
        for (let row = 0; row < height; row++) for (let column = 0; column < width; column++) {
            const globalColumn = Math.max(0, Math.min(manifest.grid.columns - 1, descriptor.startColumn + (column - halo) * stride));
            const globalRow = Math.max(0, Math.min(manifest.grid.rows - 1, descriptor.startRow + (row - halo) * stride));
            if (Math.min(count - 1, Math.floor(globalColumn / intervals)) !== owner.column || Math.min(count - 1, Math.floor(globalRow / intervals)) !== owner.row) continue;
            const sourceColumn = (globalColumn - owner.startColumn) / stride, sourceRow = (globalRow - owner.startRow) / stride;
            const coverId = cover[sourceRow * owner.columns + sourceColumn];
            const x = manifest.bounds.minX + globalColumn * manifest.grid.spacingX, z = manifest.bounds.maxZ - globalRow * manifest.grid.spacingZ;
            const packed = presentation.sample(x, z, coverId), target = (row * width + column) * 2;
            sourcePixels[target] = packed; sourcePixels[target + 1] = coverId;
        }
    }
    const pixels = buildLandscapeContourCoverage({ sourcePixels, sourceWidth: width, sourceHeight: height, sourceHalo: halo,
        columns: descriptor.columns, rows: descriptor.rows, spacingX: descriptor.sampleStride * manifest.grid.spacingX,
        spacingZ: descriptor.sampleStride * manifest.grid.spacingZ, soilCount: manifest.soil.catalog.length });
    for (let offset = 0; offset < pixels.length; offset += 4) soils.add(pixels[offset] >> 4);
    return { pixels, soils: [...soils].sort((a, b) => a - b), sourceIds, sourceRevision: manifest.revision };
}
