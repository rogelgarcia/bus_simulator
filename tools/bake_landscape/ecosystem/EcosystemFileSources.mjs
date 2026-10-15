// Reads the saved landscape an ecosystem bake generates from: native chunks, the field and geology sidecars with their pages (hash checked) and the planning references, behind bounded caches.
// @ts-check
// The bake reads the same bytes the browser worker will stream: native chunks through the authenticated authoring IO, content-addressed pages
// verified against the sidecar entries, planning JSON through the domain loader with a file-backed fetch. Field and geology sidecars must be bound
// to the current terrain with no stale native (otherwise the inputs would mix revisions and the content keys could not name them); a missing
// sidecar leaves its inputs neutral and is recorded as absent. Caches are small LRUs so a whole-landscape pass stays within a few chunks of memory.
import path from 'node:path';
import { authoringFile, authoringHash, readAuthoringFile } from '../../landscape_authoring/AuthoringFiles.mjs';
import { readLandscapeFileChunk, readLandscapeFileManifest } from '../../landscape_authoring/LandscapeFileIO.mjs';
import { LANDSCAPE_TERRAIN_FIELDS_LIMIT, landscapeTerrainFieldsLayout, landscapeTerrainFieldsStaleness, validateLandscapeTerrainFields } from '../../../src/app/landscape/LandscapeTerrainFields.js';
import { LANDSCAPE_GEOLOGY_LIMIT, landscapeGeologyLayout, landscapeGeologyStaleness, validateLandscapeGeology } from '../../../src/app/landscape/LandscapeGeology.js';
import { LANDSCAPE_PLANNING_LIMITS, loadLandscapePlanningReferences } from '../../../src/app/landscape/LandscapePlanningReferences.js';
import { createEcosystemCellSources, ecosystemCellRequirements } from '../../../src/app/landscape/ecosystem/EcosystemCellSources.js';
import { createEcosystemInputSampler } from '../../../src/app/landscape/ecosystem/EcosystemInputs.js';
import { ecosystemCellBounds } from '../../../src/app/landscape/ecosystem/EcosystemTiles.js';

export const ECOSYSTEM_SOURCE_CACHE = Object.freeze({ chunks: 24, pages: 24 });
const PLANNING_BASE = 'http://landscape.local/manifest.json';

function createLru(limit, load) {
    const entries = new Map();
    return {
        async get(key) {
            if (entries.has(key)) { const value = entries.get(key); entries.delete(key); entries.set(key, value); return value; }
            const value = await load(key);
            entries.set(key, value);
            while (entries.size > limit) entries.delete(entries.keys().next().value);
            return value;
        }
    };
}

async function readSidecar(directory, relative, limit, validate) {
    let bytes;
    try { bytes = await readAuthoringFile(authoringFile(directory, relative), limit); }
    catch (error) { if (error.code === 'ENOENT') return null; throw error; }
    return { bytes, value: await validate(JSON.parse(bytes.toString('utf8'))) };
}

function requireFresh(label, sidecar, staleness, leaf) {
    if (!sidecar) return;
    if (!staleness.bound || staleness.staleChunks.length > 0) throw new Error(`[Ecosystem] the ${label} sidecar is bound to ${staleness.terrainRevision} while the terrain is ${staleness.currentRevision} (${staleness.staleChunks.length} stale natives); re-run ${leaf} first`);
}

/**
 * Opens a saved landscape for generation. `source` (the planned terrain snapshot: bytes and parsed manifest) defaults to the current manifest.
 * @param {{directory:string,recipe:any,source?:{bytes:Uint8Array,manifest:any}|null,signal?:AbortSignal,log?:(message:string)=>void}} options
 */
export async function openEcosystemLandscape({ directory, recipe, source = null, signal, log = () => {} }) {
    const { bytes, manifest } = source ?? await readLandscapeFileManifest(directory, 'manifest.json', { signal });
    const fields = await readSidecar(directory, 'fields/manifest.json', LANDSCAPE_TERRAIN_FIELDS_LIMIT, value => validateLandscapeTerrainFields(value, manifest));
    if (fields) requireFresh('terrain-fields', fields, landscapeTerrainFieldsStaleness(fields.value, manifest), 'landscape/terrain-fields');
    const geology = await readSidecar(directory, 'geology/manifest.json', LANDSCAPE_GEOLOGY_LIMIT, value => validateLandscapeGeology(value, manifest));
    if (geology) requireFresh('geology', geology, landscapeGeologyStaleness(geology.value, manifest), 'landscape/synthesis/coastal-v3 (its geology)');
    const fileFetch = async url => {
        const relative = decodeURIComponent(new URL(url).pathname.replace(/^\//, ''));
        try { return new Response(await readAuthoringFile(authoringFile(directory, relative), LANDSCAPE_PLANNING_LIMITS.fileBytes, { signal }), { status: 200 }); }
        catch (error) { if (error.code === 'ENOENT') return new Response('', { status: 404 }); throw error; }
    };
    const planning = await loadLandscapePlanningReferences(manifest, { manifestUrl: PLANNING_BASE, fetchImpl: fileFetch, signal });
    log(`[Ecosystem] ${manifest.id} ${manifest.revision}: fields ${fields ? fields.value.revision : 'absent'}, geology ${geology ? geology.value.revision : 'absent'}, planning ${planning.features.length} features from ${planning.dependency.length} references`);
    const layerIds = Object.keys(recipe.layers), fieldsLayout = fields ? landscapeTerrainFieldsLayout(manifest.grid.chunkIntervals + 1) : null, geologyLayout = geology ? landscapeGeologyLayout(manifest.grid.chunkIntervals + 1) : null;
    const fieldPagesById = fields ? new Map(fields.value.pages.map(page => [page.id, page])) : null, geologyPagesById = geology ? new Map(geology.value.pages.map(page => [page.id, page])) : null;
    const reads = { chunks: 0, fieldPages: 0, naturalSoilPages: 0, geologyPages: 0 }, coverage = { samples: 0, land: 0, cover: new Uint32Array(256), counted: new Set() }, side = 2 ** manifest.grid.maxLevel;
    const readPage = async (relative, entry, label) => {
        const data = await readAuthoringFile(authoringFile(directory, relative), entry.byteLength, { signal });
        if (data.length !== entry.byteLength || authoringHash(data) !== entry.sha256) throw new Error(`[Ecosystem] ${label} page ${relative} does not match its sidecar entry`);
        return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
    };
    const chunks = createLru(ECOSYSTEM_SOURCE_CACHE.chunks, async id => {
        const chunk = await readLandscapeFileChunk(directory, manifest, id, { signal });
        reads.chunks++;
        if (!coverage.counted.has(id)) {
            coverage.counted.add(id);
            const { descriptor } = chunk, columns = descriptor.column === side - 1 ? descriptor.columns : descriptor.columns - 1, rows = descriptor.row === side - 1 ? descriptor.rows : descriptor.rows - 1;
            for (let r = 0; r < rows; r++) for (let c = 0; c < columns; c++) { const i = r * descriptor.columns + c; coverage.samples++; coverage.cover[chunk.landCover[i]]++; if (chunk.heights[i] >= manifest.coordinates.seaLevel) coverage.land++; }
        }
        return chunk;
    });
    const fieldPages = fields ? createLru(ECOSYSTEM_SOURCE_CACHE.pages, async id => { const page = fieldPagesById.get(id); if (!page) throw new Error(`[Ecosystem] the terrain-fields sidecar has no page ${id}`); reads.fieldPages++; return readPage(`fields/${page.fields.url}`, page.fields, 'terrain-fields'); }) : null;
    const naturalSoilPages = fields ? createLru(ECOSYSTEM_SOURCE_CACHE.pages, async id => { const page = fieldPagesById.get(id); if (!page?.naturalSoil) return null; reads.naturalSoilPages++; return readPage(`fields/${page.naturalSoil.url}`, page.naturalSoil, 'natural-soil'); }) : null;
    const geologyPages = geology ? createLru(ECOSYSTEM_SOURCE_CACHE.pages, async id => {
        const page = geologyPagesById.get(id);
        if (!page) throw new Error(`[Ecosystem] the geology sidecar has no page ${id}`);
        reads.geologyPages++;
        return { fields: await readPage(`geology/${page.fields.url}`, page.fields, 'geology'), categorical: await readPage(`geology/${page.categorical.url}`, page.categorical, 'geology categorical') };
    }) : null;
    return Object.freeze({
        directory, manifest, manifestBytes: bytes, fields: fields?.value ?? null, geology: geology?.value ?? null, planning, layerIds, reads,
        /** Native sample coverage seen so far (every chunk once): per land-cover class, land samples and the area of one sample. */
        coverage() {
            const areaPerSample = manifest.grid.spacingX * manifest.grid.spacingZ;
            return { samples: coverage.samples, landSamples: coverage.land, chunksCounted: coverage.counted.size, areaPerSampleSquareMeters: areaPerSample, cover: Object.fromEntries(manifest.landCover.catalog.map(entry => [entry.id, coverage.cover[entry.id]])) };
        },
        /** The generation's cell-sources factory: loads the cell's halo and builds its input sampler. */
        async cellSources({ layer, cellX, cellZ, haloMeters, layerFeatures }) {
            signal?.throwIfAborted();
            const requirements = ecosystemCellRequirements(manifest, layer, cellX, cellZ, haloMeters), loaded = new Map(), fieldMap = fieldPages ? new Map() : null, soilMap = naturalSoilPages ? new Map() : null, geologyMap = geologyPages ? new Map() : null;
            for (const id of requirements.chunkIds) {
                loaded.set(id, await chunks.get(id));
                if (fieldMap) fieldMap.set(id, await fieldPages.get(id));
                if (soilMap) { const page = await naturalSoilPages.get(id); if (page) soilMap.set(id, page); }
                if (geologyMap) geologyMap.set(id, await geologyPages.get(id));
            }
            const sources = createEcosystemCellSources({ manifest, chunks: loaded, fieldPages: fieldMap, fieldsLayout, naturalSoilPages: soilMap, geologyPages: geologyMap, geologyLayout, planning, bounds: ecosystemCellBounds(layer.cell.meters, cellX, cellZ), layerDistanceMeters: haloMeters, layerFeatures });
            return { sampler: createEcosystemInputSampler({ layerIds, sources }), viewCorridor: sources.viewCorridor, sources };
        }
    });
}

/** The planning reference files of a manifest (bake inputs). @param {string} directory @param {any} manifest */
export function ecosystemPlanningFiles(directory, manifest) {
    return manifest.references.filter(reference => ['planning-districts', 'planning-road-centerlines', 'planning-shoreline', 'planning-beach-reservations'].includes(reference.role)).map(reference => path.join(directory, reference.url));
}
