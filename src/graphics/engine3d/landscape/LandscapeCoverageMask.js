// Authenticates a bounded same-level cover neighborhood and packs canonical reconstruction halos.
// @ts-check
// Planning-only samples read the terrain-driven label of their same-level owner's natural-soil page (owners are read one at a time,
// so at most one page is held), or the overview infill where the request names the fallback; the per-page counts report which.
import { loadLandscapeCoverMask } from '../../../app/landscape/LandscapeAppearancePayload.js';
import { loadLandscapeTerrainFieldPage } from '../../../app/landscape/LandscapeTerrainFieldsPayload.js';
import { createLandscapeNaturalSoilResolver } from '../../../app/landscape/LandscapeNaturalSoil.js';
import { landscapeCoverageMaskLayout } from './LandscapeSurfaceCoverage.js';
import { buildLandscapeContourCoverage } from './LandscapeContourCoverage.js';

/**
 * Same-level chunks whose samples fill a mask page's canonical source window (page plus reconstruction halo), in row-major order.
 * @param {any} manifest @param {any} descriptor
 */
export function landscapeCoverageMaskOwners(manifest, descriptor) {
    const { sourceHalo: halo, sourceWidth: width, sourceHeight: height } = landscapeCoverageMaskLayout(descriptor);
    const stride = descriptor.sampleStride, intervals = manifest.grid.chunkIntervals * stride, count = 2 ** descriptor.level;
    const ownerOf = (start, offset, limit) => Math.min(count - 1, Math.floor(Math.max(0, Math.min(limit - 1, start + (offset - halo) * stride)) / intervals));
    const columns = [...new Set(Array.from({ length: width }, (_, column) => ownerOf(descriptor.startColumn, column, manifest.grid.columns)))];
    const rows = [...new Set(Array.from({ length: height }, (_, row) => ownerOf(descriptor.startRow, row, manifest.grid.rows)))];
    const byPosition = new Map(manifest.chunks.filter(chunk => chunk.level === descriptor.level).map(chunk => [`${chunk.column}/${chunk.row}`, chunk]));
    return rows.flatMap(row => columns.map(column => {
        const owner = byPosition.get(`${column}/${row}`);
        if (!owner) throw new Error(`Coverage mask ${descriptor.id} lacks canonical same-level support ${column}/${row}`);
        return owner;
    }));
}

/**
 * @param {{manifest:any,manifestUrl:string,presentation:any,chunkId:string,landCover?:Uint8Array,loadCover?:(id:string)=>Promise<any>,natural?:any,
 *   loadNatural?:(entry:{url:string,sha256:string,byteLength:number},url:string)=>Promise<Uint8Array>}} options natural is a landscape-natural-soil-request
 *   covering every owner (null: overview infill everywhere)
 */
export async function createLandscapeCoverageMask({ manifest, manifestUrl, presentation, chunkId, landCover, loadCover = id => loadLandscapeCoverMask(manifest, id, { manifestUrl }),
    natural = null, loadNatural = (entry, url) => loadLandscapeTerrainFieldPage(entry, { manifestUrl: url }) }) {
    const descriptor = manifest.chunks.find(chunk => chunk.id === chunkId);
    if (!descriptor) throw new Error(`Unknown coverage mask ${chunkId}`);
    const layout = landscapeCoverageMaskLayout(descriptor), { sourceHalo: halo, sourceWidth: width, sourceHeight: height } = layout;
    if (landCover && (!(landCover instanceof Uint8Array) || landCover.length !== descriptor.columns * descriptor.rows)) throw new Error('Coverage mask dimensions do not match source cover');
    const resolver = createLandscapeNaturalSoilResolver(manifest, natural);
    const sourcePixels = new Uint8Array(width * height * 2), sourceIds = [], soils = new Set(), pagesRead = [];
    const statistics = { terrainSamples: 0, overviewSamples: 0, overviewByReason: { inactive: 0, stale: 0, unpublished: 0 } };
    const stride = descriptor.sampleStride, intervals = manifest.grid.chunkIntervals * stride, count = 2 ** descriptor.level;
    // owners sharing one content-addressed page (for example uniform forest) reuse it without holding a second page
    let held = { sha256: null, bytes: null };
    const readNatural = async (entry, url) => {
        if (held.sha256 !== entry.sha256) { held = { sha256: null, bytes: null }; held = { sha256: entry.sha256, bytes: await loadNatural(entry, url) }; }
        return held.bytes;
    };
    for (const owner of landscapeCoverageMaskOwners(manifest, descriptor)) {
        const cover = owner.id === chunkId && landCover ? landCover : (await loadCover(owner.id)).landCover;
        if (!(cover instanceof Uint8Array) || cover.length !== owner.columns * owner.rows) throw new Error(`Invalid coverage support ${owner.id}`);
        const labels = await resolver.load(owner, readNatural);
        if (labels) pagesRead.push(owner.id);
        sourceIds.push(owner.id);
        for (let row = 0; row < height; row++) for (let column = 0; column < width; column++) {
            const globalColumn = Math.max(0, Math.min(manifest.grid.columns - 1, descriptor.startColumn + (column - halo) * stride));
            const globalRow = Math.max(0, Math.min(manifest.grid.rows - 1, descriptor.startRow + (row - halo) * stride));
            if (Math.min(count - 1, Math.floor(globalColumn / intervals)) !== owner.column || Math.min(count - 1, Math.floor(globalRow / intervals)) !== owner.row) continue;
            const sourceColumn = (globalColumn - owner.startColumn) / stride, sourceRow = (globalRow - owner.startRow) / stride;
            const coverId = cover[sourceRow * owner.columns + sourceColumn];
            const x = manifest.bounds.minX + globalColumn * manifest.grid.spacingX, z = manifest.bounds.maxZ - globalRow * manifest.grid.spacingZ;
            const label = presentation.isPlanning(coverId) ? resolver.label(labels, owner, globalColumn, globalRow) : -1;
            const packed = presentation.sample(x, z, coverId, label), target = (row * width + column) * 2;
            sourcePixels[target] = packed; sourcePixels[target + 1] = coverId;
            if (column < halo || row < halo || column >= halo + descriptor.columns || row >= halo + descriptor.rows || !presentation.isPlanning(coverId)) continue;
            if (label >= 0) { statistics.terrainSamples++; continue; }
            statistics.overviewSamples++;
            statistics.overviewByReason[!resolver.active ? 'inactive' : resolver.usesOverview(globalColumn, globalRow) ? 'stale' : 'unpublished']++;
        }
    }
    held = { sha256: null, bytes: null };
    const pixels = buildLandscapeContourCoverage({ sourcePixels, sourceWidth: width, sourceHeight: height, sourceHalo: halo,
        columns: descriptor.columns, rows: descriptor.rows, spacingX: descriptor.sampleStride * manifest.grid.spacingX,
        spacingZ: descriptor.sampleStride * manifest.grid.spacingZ, soilCount: manifest.soil.catalog.length });
    for (let offset = 0; offset < pixels.length; offset += 4) soils.add(pixels[offset] >> 4);
    return { pixels, soils: [...soils].sort((a, b) => a - b), sourceIds, sourceRevision: manifest.revision,
        natural: { active: resolver.active, pages: pagesRead, ...statistics } };
}
