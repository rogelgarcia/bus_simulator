// Partitions native coastal samples and preserves every supplied reference under content identities.
// @ts-check
import path from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';
import { createLandscapeManifest } from '../../src/app/landscape/index.js';
import { writeJson } from '../baking/Files.mjs';
import { sha256 } from './CoastalArchive.mjs';
import { COASTAL_BOUNDS, COASTAL_GRID, COASTAL_PREPARATION, COASTAL_PROVENANCE, inspectCoastalSource, measureCoastalOverviewError } from './CoastalSource.mjs';

const SOURCE_ROLES = Object.freeze({
    'README.txt': 'provenance', 'terrain_settings.json': 'provenance', 'validation.json': 'source-validation',
    'build_terrain.py': 'generator-source', 'height_m_float32_le.raw': 'original-elevation',
    'heightmap_16bit.png': 'alternate-elevation', 'landcover_ids.png': 'original-land-cover',
    'districts.json': 'planning-districts', 'district_ids.png': 'planning-district-ids',
    'roads.json': 'planning-road-centerlines', 'shoreline.json': 'planning-shoreline',
    'beach_points.json': 'planning-beach-reservations', 'contours_5m.json': 'planning-contours',
    'flat_urban_placement_mask.png': 'advisory-placement-mask', 'slope_degrees_16bit.png': 'reference-slope',
    'water_mask.png': 'water-validity', 'water_plane.obj': 'water-reference',
    'coastal_city_topographic_map.png': 'reference-topography-image', 'coastal_city_surface_map.png': 'reference-surface-image',
    'terrain_preview.obj': 'reference-coarse-mesh', 'terrain_materials.mtl': 'reference-coarse-materials'
});

/** @param {string} name */
function sourceEncoding(name) {
    if (name === 'height_m_float32_le.raw') return 'float32-le';
    if (name.endsWith('.png')) return name.includes('16bit') ? 'png-gray16-linear' : 'png';
    if (name.endsWith('.json')) return 'json';
    return 'utf8';
}

/** @param {{heightBytes:Buffer,landCover:Buffer}} source @param {{column:number,row:number,stride:number}} tile */
export function partitionCoastalTile(source, { column, row, stride }) {
    if (![1, 8].includes(stride) || !Number.isInteger(column) || !Number.isInteger(row) || column < 0 || row < 0
        || column >= 8 / stride || row >= 8 / stride || source.heightBytes.length !== 2049 * 2049 * 4
        || source.landCover.length !== 2049 * 2049) throw new Error('Invalid coastal partition request');
    const heightBytes = Buffer.alloc(257 * 257 * 4), landCover = Buffer.alloc(257 * 257);
    const startColumn = column * 256 * stride, startRow = row * 256 * stride;
    let minHeight = Infinity, maxHeight = -Infinity;
    for (let r = 0; r < 257; r++) {
        for (let c = 0; c < 257; c++) {
            const sourceIndex = (startRow + r * stride) * 2049 + startColumn + c * stride, index = r * 257 + c;
            source.heightBytes.copy(heightBytes, index * 4, sourceIndex * 4, sourceIndex * 4 + 4);
            landCover[index] = source.landCover[sourceIndex];
            const height = heightBytes.readFloatLE(index * 4);
            minHeight = Math.min(minHeight, height); maxHeight = Math.max(maxHeight, height);
        }
    }
    return { heightBytes, landCover, minHeight, maxHeight, startColumn, startRow };
}

/** @param {string} directory @param {{files:Map<string,Buffer>,sourceSha256:string,archiveByteLength:number}} archive */
export async function prepareCoastalLandscape(directory, archive) {
    const source = inspectCoastalSource(archive.files), error = measureCoastalOverviewError(source.heightBytes, 8);
    const revision = `coastal-v1-${archive.sourceSha256.slice(0, 16)}`, files = new Set(), chunks = [];
    await mkdir(path.join(directory, 'payloads'), { recursive: true });
    async function writeChannel(bytes, encoding) {
        const hash = sha256(bytes), url = `payloads/${hash}.${encoding === 'float32-le' ? 'f32le' : 'u8'}`;
        const file = path.join(directory, url);
        if (!files.has(file)) { await writeFile(file, bytes); files.add(file); }
        return { url, encoding, byteLength: bytes.length, decodedByteLength: bytes.length, sha256: hash, revision };
    }
    for (const stride of [8, 1]) {
        for (let row = 0; row < 8 / stride; row++) {
            for (let column = 0; column < 8 / stride; column++) {
                const tile = partitionCoastalTile(source, { column, row, stride }), level = stride === 8 ? 0 : 3;
                const span = 500 * stride, bounds = { minX: column * span, maxX: (column + 1) * span, minZ: 4000 - (row + 1) * span, maxZ: 4000 - row * span };
                chunks.push({ id: `l${level}/c${column}/r${row}`, level, column, row,
                    startColumn: tile.startColumn, startRow: tile.startRow, sampleStride: stride, columns: 257, rows: 257, bounds,
                    minHeight: level === 0 ? source.minHeight : tile.minHeight, maxHeight: level === 0 ? source.maxHeight : tile.maxHeight,
                    geometricError: level === 0 ? error.maximumMeters : 0, revision,
                    parentId: level ? 'l0/c0/r0' : null,
                    channels: { height: await writeChannel(tile.heightBytes, 'float32-le'), landCover: await writeChannel(tile.landCover, 'uint8') } });
            }
        }
    }
    const references = [];
    for (const [name, bytes] of [...archive.files].sort(([a], [b]) => a.localeCompare(b))) {
        const role = name.startsWith('material_masks/') ? 'reference-material-mask' : SOURCE_ROLES[name];
        if (!role) throw new Error(`Unclassified coastal source file: ${name}`);
        const url = `source/${archive.sourceSha256}/${name}`, file = path.join(directory, url);
        await mkdir(path.dirname(file), { recursive: true }); await writeFile(file, bytes); files.add(file);
        references.push({ id: `source-${name.replaceAll(/[/.]/g, '-')}`, role, url, sha256: sha256(bytes), byteLength: bytes.length, encoding: sourceEncoding(name) });
    }
    const manifest = createLandscapeManifest({ id: 'coastal-city', name: 'Coastal City Terrain v2', revision,
        bounds: COASTAL_BOUNDS, grid: COASTAL_GRID, chunks, overviewId: 'l0/c0/r0', provenance: COASTAL_PROVENANCE, references });
    const manifestFile = path.join(directory, 'manifest.json'), provenanceFile = path.join(directory, 'PROVENANCE.json');
    await writeJson(manifestFile, manifest); files.add(manifestFile);
    await writeJson(provenanceFile, { ...COASTAL_PROVENANCE, archiveByteLength: archive.archiveByteLength,
        sourceFiles: references, primarySource: 'height_m_float32_le.raw', retainedByteForByte: true,
        authority: 'Native chunks preserve original float32 bits and uint8 class IDs; overview and meshes are derived',
        runtimePolicy: 'Read manifest and bounded overview; original full rasters, ZIP and preview OBJ are not viewer dependencies',
        reproduction: 'node tools/bake.mjs --target landscape/coastal-import --set landscape/coastal-import:source=<source.zip> --publish' });
    files.add(provenanceFile);
    return { directory, manifestFile, provenanceFile, files: [...files], sourceSummary: {
        sourceSha256: archive.sourceSha256, sourceFiles: references.length, dimensions: [2049, 2049],
        nativeSamples: 2049 * 2049, nativeHeightBytes: source.heightBytes.length, sourceLandCoverBytes: source.landCover.length,
        minHeight: source.minHeight, maxHeight: source.maxHeight, negativeSamples: source.negativeSamples, zeroSamples: source.zeroSamples,
        seaLevel: 0, landCoverCounts: source.landCoverCounts, checkpoints: source.checkpoints,
        nativeChunks: 64, overview: { columns: 257, rows: 257, stride: COASTAL_PREPARATION.overviewStride,
            spacingMeters: 15.625, payloadBytes: 257 * 257 * 5, ...error },
        nativePartitionBytesWithSharedBorders: 64 * 257 * 257 * 5 } };
}
