// Streams the render-only far-field surround beyond the authoritative landscape (AI 596 D5) through a second terrain stream bound to the loaded revision.
// @ts-check
// Design: the surround sidecar (LandscapeSurroundModel) is loaded with the bounded loaders, validated as a landscape document and checked against the
// loaded landscape's id and revision before anything is reserved; a stale, unbound, invalid or absent sidecar leaves the view exactly as without a
// surround and reports why. An active surround runs LandscapeStreamer without appearance, fields, surface cache or diagnostics, in soil-palette mode
// (one far colour per display soil under the shared lighting and aerial perspective: the loaded appearance's mean corrected albedo per soil through
// setPalette, the land-cover catalog colours until then; LandscapeSoilPalette), at a coarser screen-error goal, inside its own share of the shared
// ledger, with the authoritative bounds as a mesh exclusion (tiles inside are never built, straddling tiles drop to the authoritative overview less
// the skirt) and with its tiles drawn behind the authoritative ones. Its meshes are never returned to picking or queries: the view keeps them in this
// object, not in its authoritative stream.
import { loadLandscapeChunk, loadLandscapeManifest } from '../../../app/landscape/index.js';
import { LandscapeStreamer } from './LandscapeStreamer.js';
import { LANDSCAPE_SURROUND, createLandscapeSurroundLedger, landscapeSurroundBinding, landscapeSurroundResidency } from './LandscapeSurroundModel.js';

const ABSENT = /HTTP (404|410)$/;

/**
 * Loads and starts the surround of a loaded landscape. Resolves to a surround handle whatever happened: `status` is `active` only when its
 * stream renders; the other statuses carry a `reason` and hold no resources.
 * @param {{landscape:any,url:string,budget:any,renderer:any,scene:any,camera:any,coverageSlots:number,lighting:any,lightingTier?:string,materialSampling?:string,
 *   mode?:string,lodColors?:boolean,boundaries?:boolean,share?:{cpuBytes:number,gpuBytes:number},targetErrorPixels?:number,palette?:any,signal?:AbortSignal}} options landscape is the frozen
 *   result of loadLandscapeOverview for the authoritative landscape (its overview chunk is the exclusion reference); url the surround manifest; palette
 *   the appearance palette to start with (LandscapeMaterialPages soilPalette, null for the catalog colours)
 */
export async function createLandscapeSurround({ landscape, url, budget, renderer, scene, camera, coverageSlots, lighting, lightingTier, materialSampling, mode = 'shaded', lodColors = false, boundaries = false,
    share = LANDSCAPE_SURROUND.budgets, targetErrorPixels = LANDSCAPE_SURROUND.targetErrorPixels, palette = null, signal }) {
    if (!landscape?.manifest || !landscape.chunk) throw new Error('[LandscapeSurround] The surround needs the loaded authoritative landscape');
    if (typeof url !== 'string' || !url) throw new Error('[LandscapeSurround] The surround needs its manifest URL');
    const started = performance.now();
    const inert = (status, reason, extra = {}) => createInertSurround({ status, reason, url, landscape, loadMs: performance.now() - started, ...extra });
    let manifest;
    try { manifest = await loadLandscapeManifest(url, { signal }); }
    catch (error) {
        if (error.name === 'AbortError') throw error;
        // a 404 is the ordinary case of a landscape published without a surround; a validation refusal names the document invalid; anything else failed
        return inert(ABSENT.test(error.message) ? 'absent' : error.message.startsWith('[Landscape]') ? 'invalid' : 'failed', error.message);
    }
    const binding = landscapeSurroundBinding(manifest, landscape.manifest);
    if (binding.status !== 'bound') return inert(binding.status, binding.reason, { manifest });
    let loaded;
    try {
        const chunk = await loadLandscapeChunk(manifest, manifest.overviewId, { manifestUrl: url, signal });
        loaded = Object.freeze({ manifest, chunk, manifestUrl: url, encodedBytes: chunk.descriptor.channels.height.byteLength + chunk.descriptor.channels.landCover.byteLength, decodedBytes: chunk.heights.byteLength + chunk.landCover.byteLength });
    } catch (error) {
        if (error.name === 'AbortError') throw error;
        return inert('failed', error.message, { manifest });
    }
    const ledger = createLandscapeSurroundLedger(budget, share);
    let stream;
    try {
        stream = new LandscapeStreamer({ loaded, budget: ledger, renderer, scene, coverageSlots, materialSampling, lightingTier, lighting, mode, lodColors, boundaries, targetErrorPixels,
            naturalInference: 'overview', diagnostics: false, terrainAppearance: false, surfaceCache: false, workers: LANDSCAPE_SURROUND.workers, depthBehind: true, soilPalette: true,
            exclusion: { bounds: landscape.manifest.bounds, skirtDepth: LANDSCAPE_SURROUND.skirtDepthMeters, wallDepth: LANDSCAPE_SURROUND.boundaryWallMeters, reference: landscape.chunk } });
        if (palette) stream.setSoilPalette(palette);
        await stream.initialize(camera);
    } catch (error) {
        if (error.name === 'AbortError') throw error;
        stream?.dispose();
        return inert('failed', error.message, { manifest });
    }
    return createActiveSurround({ url, landscape, loaded, binding: binding.binding, stream, ledger, loadMs: performance.now() - started });
}

function gridSummary(manifest) {
    return { columns: manifest.grid.columns, rows: manifest.grid.rows, spacing: manifest.grid.spacingX, chunkIntervals: manifest.grid.chunkIntervals, maxLevel: manifest.grid.maxLevel, nodes: manifest.chunks.length, seaLevel: manifest.coordinates.seaLevel };
}

function createInertSurround({ status, reason, url, landscape, loadMs, manifest = null }) {
    if (!LANDSCAPE_SURROUND.statuses.includes(status) || status === 'active') throw new Error(`[LandscapeSurround] ${status} is not an inert surround status`);
    const binding = manifest ? landscapeSurroundBinding(manifest, landscape.manifest).binding : null;
    const snapshot = Object.freeze({ recipe: LANDSCAPE_SURROUND.id, status, present: false, reason, url, id: manifest?.id ?? null, revision: manifest?.revision ?? null, binding, bounds: manifest?.bounds ?? null, grid: manifest ? gridSummary(manifest) : null,
        landscape: { id: landscape.manifest.id, revision: landscape.manifest.revision }, settled: true, tiles: 0, residentByLevel: {}, excludedIds: [], straddlingIds: [], pending: 0, targetErrorPixels: null, achievedErrorPixels: null, targetMet: null,
        degradationReason: null, triangles: 0, vertices: 0, geometryBytes: 0, share: { kind: LANDSCAPE_SURROUND.kind, cpuBytes: 0, gpuBytes: 0, peakCpuBytes: 0, peakGpuBytes: 0, limits: LANDSCAPE_SURROUND.budgets, denied: 0, entries: 0 },
        programCompile: null, errors: [], loadMs, skirtDepth: LANDSCAPE_SURROUND.skirtDepthMeters, palette: null });
    return Object.freeze({ status, reason, url, bounds: manifest?.bounds ?? null, stream: null, ledger: null, loaded: null, binding,
        update() {}, setInspection() {}, setLightingTier() {}, setMaterialSampling() {}, setLighting() {}, setPalette() { return false; }, renderedMeshes() { return []; },
        snapshot() { return snapshot; }, dispose() {} });
}

function createActiveSurround({ url, landscape, loaded, binding, stream, ledger, loadMs }) {
    const { manifest } = loaded;
    let disposed = false;
    const grid = gridSummary(manifest);
    return Object.freeze({
        status: 'active', reason: null, url, bounds: manifest.bounds, stream, ledger, loaded, binding,
        /** @param {number} dt @param {any} camera @param {number} viewportHeight @param {number} [uploadAllowance] */
        update(dt, camera, viewportHeight, uploadAllowance) { if (!disposed) stream.update(dt, camera, viewportHeight, uploadAllowance); },
        setInspection(options) { if (!disposed) stream.setInspection(options); },
        setLightingTier(tier) { if (!disposed) stream.setLightingTier(tier); },
        setMaterialSampling(sampling) { if (!disposed) stream.setMaterialSampling(sampling); },
        setLighting(lighting) { if (!disposed) stream.setLighting(lighting); },
        /** The far colours per display soil: the loaded appearance's palette, or null for the catalog colours. Returns whether they changed. @param {any} palette */
        setPalette(palette) { return disposed ? false : stream.setSoilPalette(palette); },
        /** The surround's own rendered meshes (never part of the authoritative pick set). */
        renderedMeshes() { return disposed ? [] : stream.renderedMeshes(); },
        snapshot() {
            if (disposed) return { recipe: LANDSCAPE_SURROUND.id, status: 'off', present: false, reason: 'disposed', url, id: manifest.id, revision: manifest.revision, binding, bounds: manifest.bounds, grid, settled: true, tiles: 0, residentByLevel: {}, share: ledger.shareSnapshot(), loadMs };
            const state = stream.snapshot(), residency = landscapeSurroundResidency(state);
            return { recipe: LANDSCAPE_SURROUND.id, status: 'active', present: true, reason: null, url, id: manifest.id, revision: manifest.revision, binding, bounds: manifest.bounds, grid,
                landscape: { id: landscape.manifest.id, revision: landscape.manifest.revision }, settled: state.settled, tiles: residency.tiles, residentByLevel: residency.byLevel, residentLeafIds: state.residentLeafIds,
                residentIds: state.residentIds.length, excludedIds: state.exclusion?.excludedIds ?? [], straddlingIds: state.exclusion?.straddlingIds ?? [], pending: state.pending, loaded: state.loaded, evicted: state.evicted,
                targetErrorPixels: state.targetErrorPixels, achievedErrorPixels: state.achievedErrorPixels, targetMet: state.targetMet, degradationReason: state.degradationReason,
                triangles: state.triangles, vertices: state.vertices, geometryBytes: state.geometryBytes, uploadedBytesPerFrame: state.uploadedBytesPerFrame, peakUploadedBytesPerFrame: state.peakUploadedBytesPerFrame, frameCostMs: state.frameCostMs,
                share: ledger.shareSnapshot(), programCompile: state.programCompile, programVariant: state.programVariant, errors: state.errors, loadMs, skirtDepth: LANDSCAPE_SURROUND.skirtDepthMeters, wallDepth: LANDSCAPE_SURROUND.boundaryWallMeters, workers: state.workers,
                palette: state.soilPalette };
        },
        dispose() { if (disposed) return; disposed = true; stream.dispose(); }
    });
}
