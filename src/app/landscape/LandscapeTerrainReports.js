// Surveys authoritative terrain through bounded probes and a single decoded native chunk.
// @ts-check
import { createLandscapeChunkId } from './LandscapeManifest.js';
import { validateAcquiredLandscapeChunk } from './LandscapeAcquisition.js';
import { sampleLandscapeChunk } from './LandscapeSampling.js';
import { createLandscapeDependency } from './LandscapeDependencies.js';
import { validateReportShape, reportShapeBounds, reportShapeArea, reportShapesOverlap, reportProbes } from './internal/LandscapeReportGeometry.js';
import { freezeData, requireBounds, requireCondition, requireFinite, requireId, requireInteger } from './internal/LandscapeValidation.js';
import { readBoundedResponse } from './internal/LandscapePayloadIO.js';

export const LANDSCAPE_REPORT_LIMITS = Object.freeze({ maxSamples: 8192, maxConstraints: 256, maxWorkingBytes: 8 * 1024 * 1024 });

/** Reads a bounded server report and refuses a foreign or stale response before presentation. */
/** @param {Response} response @param {{landscapeId:string,revision:string}} expected @returns {Promise<object>} */
export async function readLandscapeTerrainReport(response, expected) {
    const bytes = await readBoundedResponse(response, 512 * 1024, false, 'terrain report');
    const report = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
    requireCondition(report?.format === 'landscape-terrain-report' && report.schemaVersion === 1, 'unsupported terrain report format');
    requireCondition(report.landscapeId === expected.landscapeId && report.revision === expected.revision, 'terrain report identity/revision mismatch');
    requireCondition(['ready', 'partial', 'unavailable', 'outside'].includes(report.status) && report.sampling && Array.isArray(report.overlaps), 'invalid terrain report result');
    return freezeData(report);
}

/** @typedef {{expectedRevision:string,shape:object,sampleSpacingMeters:number,maxSamples?:number,constraints?:Array<{id:string,classification:'informational'|'advisory'|'reservation',shape:object}>}} LandscapeReportRequest */

/** Reports sampled suitability, never exhaustive extrema or construction permission. Inject a hash-verifying, non-retaining native reader. */
/** @param {object} manifest @param {LandscapeReportRequest} request @param {{readChunk:Function,signal?:AbortSignal,maxWorkingBytes?:number}} options @returns {Promise<object>} */
export async function reportLandscapeTerrain(manifest, request, { readChunk, signal, maxWorkingBytes = LANDSCAPE_REPORT_LIMITS.maxWorkingBytes }) {
    signal?.throwIfAborted();
    requireCondition(request?.expectedRevision === manifest.revision, 'report expectedRevision is stale or missing');
    requireCondition(typeof readChunk === 'function', 'report readChunk is required');
    const shape = validateReportShape(request.shape), bounds = reportShapeBounds(shape);
    requireBounds(bounds, 'report bounds');
    const nativeSpacing = Math.max(manifest.grid.spacingX, manifest.grid.spacingZ), spacing = request.sampleSpacingMeters;
    requireFinite(spacing, 'sampleSpacingMeters'); requireCondition(spacing >= nativeSpacing, `report sampleSpacingMeters must be at least native spacing ${nativeSpacing}`);
    const maxSamples = request.maxSamples ?? 4096;
    requireInteger(maxSamples, 1, LANDSCAPE_REPORT_LIMITS.maxSamples, 'report maxSamples');
    requireInteger(maxWorkingBytes, 1, LANDSCAPE_REPORT_LIMITS.maxWorkingBytes, 'report maxWorkingBytes');
    const constraints = request.constraints ?? [];
    requireCondition(Array.isArray(constraints) && constraints.length <= LANDSCAPE_REPORT_LIMITS.maxConstraints, 'report constraints exceed bounded limit');
    const constraintIds = new Set();
    const overlaps = constraints.map(entry => {
        requireId(entry.id, 'constraint.id'); requireCondition(!constraintIds.has(entry.id), 'duplicate report constraint id'); constraintIds.add(entry.id);
        requireCondition(['informational', 'advisory', 'reservation'].includes(entry.classification), 'invalid report constraint classification');
        return { id: entry.id, classification: entry.classification, shape: validateReportShape(entry.shape) };
    }).filter(entry => reportShapesOverlap(shape, entry.shape)).map(({ id, classification }) => ({ id, classification, intersects: true, method: 'exact-horizontal-shape-contact' }));
    const probes = reportProbes(shape, spacing, maxSamples), groups = new Map(), outside = [];
    const descriptors = new Map(manifest.chunks.filter(chunk => chunk.level === manifest.grid.maxLevel).map(chunk => [chunk.id, chunk]));
    const count = 2 ** manifest.grid.maxLevel;
    for (let index = 0; index < probes.length; index++) {
        const point = probes[index], world = manifest.bounds;
        if (point.x < world.minX || point.x > world.maxX || point.z < world.minZ || point.z > world.maxZ) { outside.push(index); continue; }
        const column = Math.min(count - 1, Math.floor((point.x - world.minX) / (manifest.grid.spacingX * manifest.grid.chunkIntervals)));
        const row = Math.min(count - 1, Math.floor((world.maxZ - point.z) / (manifest.grid.spacingZ * manifest.grid.chunkIntervals)));
        const id = createLandscapeChunkId(manifest.grid.maxLevel, column, row);
        if (!groups.has(id)) groups.set(id, []);
        groups.get(id).push(index);
    }
    let workingBytes = 0;
    for (const id of groups.keys()) {
        const descriptor = descriptors.get(id);
        requireCondition(!!descriptor, `native coverage missing for ${id}`);
        const decodedBytes = descriptor.channels.height.decodedByteLength + descriptor.channels.landCover.decodedByteLength;
        workingBytes = Math.max(workingBytes, decodedBytes * 4);
    }
    requireCondition(workingBytes <= maxWorkingBytes, `report needs ${workingBytes} binary working bytes; budget ${maxWorkingBytes}`);
    const heights = [], slopes = [], depths = [], soil = new Map(), cover = new Map(), profile = new Map(), failures = [];
    let ready = 0, unknown = 0, submerged = 0, reads = 0;
    const mark = (index, status, sample = null) => {
        const point = probes[index];
        if (point.profileDistance !== null) profile.set(index, { x: point.x, z: point.z, distanceMeters: point.profileDistance,
            status, heightMeters: sample?.height ?? null, gradePercent: null });
    };
    outside.forEach(index => mark(index, 'outside'));
    for (const [id, indices] of groups) {
        signal?.throwIfAborted();
        let chunk = null;
        try {
            reads++; chunk = await readChunk(id, { signal }); signal?.throwIfAborted();
            validateAcquiredLandscapeChunk(manifest, chunk);
            const samples = indices.map(index => {
                const point = probes[index], sample = sampleLandscapeChunk(manifest, chunk, point.x, point.z);
                requireCondition(sample.status === 'ready', `native report sample ${index} is not ready`);
                return sample;
            });
            for (let offset = 0; offset < indices.length; offset++) {
                const index = indices[offset], sample = samples[offset];
                ready++; heights.push(sample.height); slopes.push(sample.slopeDegrees); depths.push(sample.waterDepth); submerged += Number(sample.submerged);
                soil.set(sample.soilId, (soil.get(sample.soilId) ?? 0) + 1); cover.set(sample.landCoverId, (cover.get(sample.landCoverId) ?? 0) + 1);
                mark(index, 'ready', sample);
            }
        } catch (error) {
            signal?.throwIfAborted();
            unknown += indices.length; failures.push({ chunkId: id, reason: error.message }); indices.forEach(index => mark(index, 'unavailable'));
        } finally { chunk = null; }
    }
    const corridorProfile = [...profile.values()].sort((a, b) => a.distanceMeters - b.distanceMeters);
    for (let index = 1; index < corridorProfile.length; index++) {
        const a = corridorProfile[index - 1], b = corridorProfile[index], distance = b.distanceMeters - a.distanceMeters;
        if (a.status === 'ready' && b.status === 'ready' && distance > 0) b.gradePercent = (b.heightMeters - a.heightMeters) / distance * 100;
    }
    const statistics = values => values.length ? { min: Math.min(...values), max: Math.max(...values), mean: values.reduce((sum, value) => sum + value, 0) / values.length } : null;
    const elevation = statistics(heights), slopeDegrees = statistics(slopes), waterDepth = statistics(depths);
    if (elevation) elevation.range = elevation.max - elevation.min;
    const composition = counts => [...counts].map(([id, samples]) => ({ id, samples, fraction: samples / ready })).sort((a, b) => String(a.id).localeCompare(String(b.id)));
    const fullyWithinBounds = bounds.minX >= manifest.bounds.minX && bounds.maxX <= manifest.bounds.maxX && bounds.minZ >= manifest.bounds.minZ && bounds.maxZ <= manifest.bounds.maxZ;
    return freezeData({ format: 'landscape-terrain-report', schemaVersion: 1, landscapeId: manifest.id, revision: manifest.revision,
        status: ready ? unknown || outside.length || !fullyWithinBounds ? 'partial' : 'ready' : outside.length === probes.length ? 'outside' : 'unavailable',
        shape, bounds, area: reportShapeArea(shape),
        sampling: { requested: probes.length, ready, unknown, outside: outside.length, spacingMeters: spacing, spacingMeaning: 'requested-maximum-probe-interval', nativeSpacingMeters: nativeSpacing,
            gridSpacingMeters: { x: (bounds.maxX - bounds.minX) / Math.max(1, Math.ceil((bounds.maxX - bounds.minX) / spacing)),
                z: (bounds.maxZ - bounds.minZ) / Math.max(1, Math.ceil((bounds.maxZ - bounds.minZ) / spacing)) },
            accuracy: 'authoritative-native-probes', fullyWithinBounds, method: 'cell-centers-plus-shape-anchors-and-corridor-profile',
            interpretation: 'Sample extrema and equally weighted probe fractions; unsampled terrain may differ. Not an exhaustive area survey or buildability approval.' },
        elevation, slopeDegrees, soilComposition: composition(soil), coverComposition: composition(cover),
        water: waterDepth ? { minDepth: waterDepth.min, maxDepth: waterDepth.max, submergedFraction: submerged / ready, seaLevel: manifest.coordinates.seaLevel } : null,
        corridorProfile, overlaps, constraintCoverage: { status: request.constraints === undefined ? 'not-requested' : 'evaluated', tested: constraints.length,
            interpretation: 'Only caller-supplied shapes are evaluated; absent constraints are not proof of an unrestricted site.' },
        failures, resources: { chunkReads: reads, maxDecodedChunks: reads ? 1 : 0, workingBytes, workingByteLimit: maxWorkingBytes,
            accounting: 'binary I/O/decode reservation; bounded JS probe/result objects and process overhead excluded', maxSamples },
        dependency: createLandscapeDependency(manifest, { bounds, channels: ['height', 'landCover', 'soil', 'water'], algorithm: 'terrain-report-v1' }) });
}
