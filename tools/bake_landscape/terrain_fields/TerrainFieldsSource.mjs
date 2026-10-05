// Assembles the authoritative native height and land-cover grid from authenticated chunk payloads for the global analyses.
// @ts-check
// Native chunks are read one at a time through the authoring file IO (hash-authenticated, bounded) and copied into one global grid;
// duplicated shared border samples must agree bit for bit. Coarser levels are not read: they are aligned decimations of these samples.
import { readLandscapeFileChunk } from '../../landscape_authoring/LandscapeFileIO.mjs';

/**
 * @param {string} directory saved landscape directory @param {any} manifest validated manifest
 * @param {import('./TerrainFieldsGrid.mjs').TerrainFieldMemory} memory @param {{signal?:AbortSignal}} [options]
 */
export async function readTerrainFieldSource(directory, manifest, memory, { signal } = {}) {
    const { columns, rows, spacingX, spacingZ, maxLevel } = manifest.grid, n = columns * rows;
    const heights = memory.allocate('source/heights', Float32Array, n), cover = memory.allocate('source/cover', Uint8Array, n);
    const written = memory.allocate('source/written', Uint8Array, n);
    const natives = manifest.chunks.filter(chunk => chunk.level === maxLevel);
    if (natives.length !== 4 ** maxLevel) throw new Error('[TerrainFields] The native chunk level is incomplete');
    let comparisons = 0;
    for (const descriptor of natives) {
        const chunk = await readLandscapeFileChunk(directory, manifest, descriptor.id, { signal });
        for (let r = 0; r < descriptor.rows; r++) for (let c = 0; c < descriptor.columns; c++) {
            const i = (descriptor.startRow + r) * columns + descriptor.startColumn + c, local = r * descriptor.columns + c;
            if (written[i]) {
                comparisons++;
                if (!Object.is(heights[i], chunk.heights[local]) || cover[i] !== chunk.landCover[local]) throw new Error(`[TerrainFields] Shared native sample ${descriptor.startColumn + c},${descriptor.startRow + r} differs in ${descriptor.id}`);
                continue;
            }
            heights[i] = chunk.heights[local]; cover[i] = chunk.landCover[local]; written[i] = 1;
        }
    }
    for (let i = 0; i < n; i++) if (!written[i] || !Number.isFinite(heights[i])) throw new Error(`[TerrainFields] Native sample ${i} is missing or not finite`);
    memory.free('source/written');
    return { grid: { columns, rows, spacingX, spacingZ, minX: manifest.bounds.minX, maxZ: manifest.bounds.maxZ }, heights, cover, nativeChunks: natives.length, sharedSampleComparisons: comparisons };
}

/** Maps every land-cover ID to its catalog soil index (255 = unmapped) and planning-only flag. @param {any} manifest */
export function terrainFieldCoverTables(manifest) {
    const soilIds = manifest.soil.catalog.map(soil => soil.id), coverSoil = new Uint8Array(256).fill(255), planningCover = new Uint8Array(256);
    for (const entry of manifest.soil.landCoverMapping) coverSoil[entry.landCoverId] = soilIds.indexOf(entry.soilId);
    for (const entry of manifest.landCover.catalog) planningCover[entry.id] = entry.planningOnly ? 1 : 0;
    return { soilIds, coverSoil, planningCover };
}
