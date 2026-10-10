// Measures the AI 596 D3 fixture landscapes (one synthesis recipe at finer native spacings) in the viewer: startup payloads, residency, uploads,
// frame and GPU cost, time to settled detail, and picking and query accuracy against the saved native heights.
// Each fixture is served on the verification port by this test (createLandscapeServer with its directory at the viewer's canonical cache address),
// so the canonical cache is never touched; a fixture whose manifest.json is missing is reported as not measured. Receipts follow the coastal
// performance harness (tests/headless/e2e/landscape_performance.pwtest.js): report.json, per-stop frame arrays, network records and screenshots
// under tests/artifacts/screens/landscape/ai596/d3/browser/<fixture>/ plus a cross-fixture comparison.md regenerated from every receipt present.
// LANDSCAPE_RESOLUTION_FIXTURES selects other ids or saved landscape directories; LANDSCAPE_RESOLUTION_ARTIFACTS moves the receipts (a directory
// relative to the repository root); LANDSCAPE_RESOLUTION_ROUTE=natural-world measures a 4 km coastal landscape along the natural-world review
// poses instead of the bounds-scaled fixture poses (AI 596 D4, coastal terrain v3); LANDSCAPE_RESOLUTION_SETTLE_MS raises the settle limit.
import { test, expect } from '@playwright/test';
import { access, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { createLandscapeServer } from '../../../tools/landscape_server/Server.mjs';
import { createNativeGroundSampler, loadReviewPoses, resolveReviewPose, reviewPoseDirection } from '../../../tools/landscape_review/ReviewPoses.mjs';
import { MISSING_APPEARANCE_ERROR } from '../../../tools/landscape_review/capture.mjs';
import { readLandscapeFileChunk, readLandscapeFileManifest } from '../../../tools/landscape_authoring/LandscapeFileIO.mjs';
import { landscapeEffectiveSurfaceCache, landscapeShippedBudgetMiB, landscapeViewerUrl } from '../../shared/landscape_viewer_url.js';

const root = path.resolve('.');
const MiB = 1024 * 1024;
const ARTIFACTS = path.resolve(root, process.env.LANDSCAPE_RESOLUTION_ARTIFACTS ?? 'tests/artifacts/screens/landscape/ai596/d3/browser');
const SERVED_PREFIX = '/assets/public/landscape/coastal-city/';
const DEFAULT_FIXTURES = ['ai596-d3-fixture-1953', 'ai596-d3-fixture-0977', 'ai596-d3-fixture-0488', 'ai596-d3-fixture-4km-1953', 'ai596-d3-fixture-4km-0977'];
const viewport = { width: 1920, height: 1080 }, warmupFrames = 30, sampleFrames = 120, uploadCapBytes = 8 * MiB;
const settleTimeoutMs = Number(process.env.LANDSCAPE_RESOLUTION_SETTLE_MS ?? 60000);
if (!Number.isInteger(settleTimeoutMs) || settleTimeoutMs < 1000) throw new Error(`LANDSCAPE_RESOLUTION_SETTLE_MS must be an integer number of milliseconds of at least 1000; received ${process.env.LANDSCAPE_RESOLUTION_SETTLE_MS}`);
// The probe patch is a 41 x 31 m rectangle on the D2 fixture's gully D (pose F-04) that lies inside one finest 257-sample tile at every fixture
// spacing (x 375-500, z 125-250 at 0.48828125 m). Vertex probes sit on multiples of 1.953125 m, native vertices of all three spacings; cell-center
// probes add half a 0.48828125 m cell (2.5 and 3.5 cells), the center of a finest cell and an interior point of the coarser cells.
const PROBE_PATCH = Object.freeze({ originX: 429.6875, originZ: 134.765625, stepX: 5.859375, stepZ: 9.765625, columns: 8, rows: 4, centerOffsetX: 1.220703125, centerOffsetZ: 1.708984375 });
// The coastal city's patch is the same rectangle translated by (2918, 2642) cells of 0.9765625 m onto the high-city south flank below pose NW-07
// (x 3279.3-3320.3, z 2714.8-2744.1), inside the one 250 m native tile x 3250-3500, z 2500-2750 of a 4097² landscape at 0.9765625 m.
const CITY_PROBE_PATCH = Object.freeze({ ...PROBE_PATCH, originX: 3279.296875, originZ: 2714.84375 });
// Route variants: the fixture route scales the AI 596 D3 fixture poses onto the manifest bounds; the natural-world route resolves the coastal
// review poses (tools/landscape_review/poses/natural-world-v1.json) on the measured landscape's own native ground.
const ROUTES = Object.freeze({
    fixture: Object.freeze({ id: 'fixture', label: 'D3', title: 'AI 596 D3 fixture resolution measurements', poseFile: 'tools/landscape_review/poses/ai596-d3-fixture-v1.json', probePatch: PROBE_PATCH,
        patch: 'the gully D patch', stops: Object.freeze(['overview', 'approach-bluff', 'gully-close', 'orthographic-close', 'return-overview']),
        settleColumns: Object.freeze([['approach-bluff', 'bluff'], ['gully-close', 'gully'], ['orthographic-close', 'ortho']]) }),
    'natural-world': Object.freeze({ id: 'natural-world', label: 'D4 (natural-world route)', title: 'AI 596 D4 coastal terrain browser measurements (natural-world route)', poseFile: 'tools/landscape_review/poses/natural-world-v1.json', probePatch: CITY_PROBE_PATCH,
        patch: 'the high-city south flank patch below NW-07', stops: Object.freeze(['overview', 'flyover-NW-10', 'bluff-toe-NW-03', 'low-city-NW-08', 'beach-NW-01', 'orthographic-close', 'return-overview']),
        settleColumns: Object.freeze([['flyover-NW-10', 'flyover'], ['bluff-toe-NW-03', 'bluff toe'], ['low-city-NW-08', 'low city'], ['beach-NW-01', 'beach'], ['orthographic-close', 'ortho']]) })
});
const ROUTE = ROUTES[process.env.LANDSCAPE_RESOLUTION_ROUTE ?? 'fixture'];
if (!ROUTE) throw new Error(`LANDSCAPE_RESOLUTION_ROUTE must be one of ${Object.keys(ROUTES).join(', ')}; received ${process.env.LANDSCAPE_RESOLUTION_ROUTE}`);
const POSE_FILE = path.join(root, ROUTE.poseFile);
// top-down orthographic probe camera: 60 m of ground over 1056 px asks the planner for every level whose error exceeds 0.085 m, so the finest level
// is resident on relief; the 0.3 m target offset keeps the look-at basis defined and tilts the rays by 0.001 rad
const PROBE_CAMERA = Object.freeze({ height: 300, orthoHeight: 60, targetOffsetZ: -0.3 });
// a ray through a mesh vertex can miss every triangle that shares it (the edge tests of the raycast round to the wrong side); a 0.5 mm nudge keeps the
// probe on the same cells and the error is still measured at the exact hit position
const PROBE_NUDGES = Object.freeze([[0, 0], [5e-4, 5e-4], [-5e-4, -5e-4]]);
const fixtures = (process.env.LANDSCAPE_RESOLUTION_FIXTURES ?? DEFAULT_FIXTURES.join(',')).split(',').map(entry => entry.trim()).filter(Boolean).map(entry => {
    const isPath = /[\\/]/.test(entry);
    return { id: isPath ? path.basename(entry) : entry, directory: isPath ? path.resolve(root, entry) : path.join(root, 'assets/public/landscape', entry) };
});
test.use({ viewport, deviceScaleFactor: 1, video: 'off', trace: 'off' });

const posix = value => value.split(path.sep).join('/');
const relative = file => posix(path.relative(root, file));

function statistics(values) {
    if (!values.length) return null;
    const sorted = values.slice().sort((a, b) => a - b), at = fraction => sorted[Math.max(0, Math.ceil(sorted.length * fraction) - 1)];
    const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
    return { count: values.length, median: sorted.length % 2 ? sorted[(sorted.length - 1) / 2] : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2, p95: at(.95), mean, min: sorted[0], max: sorted.at(-1) };
}

function unpack(values, columns) {
    const records = [];
    for (let offset = 0; offset < values.length; offset += columns.length) records.push(Object.fromEntries(columns.map((name, index) => [name, values[offset + index]])));
    return records;
}

function probePositions(patch) {
    const vertices = [], centers = [];
    for (let row = 0; row < patch.rows; row++) for (let column = 0; column < patch.columns; column++) {
        const x = patch.originX + column * patch.stepX, z = patch.originZ + row * patch.stepZ;
        vertices.push({ kind: 'vertex', x, z });
        centers.push({ kind: 'cell-center', x: x + patch.centerOffsetX, z: z + patch.centerOffsetZ });
    }
    return [...vertices, ...centers];
}

/** The probes of a patch, the top-down orthographic camera over their center and that center's stop record. */
async function probeStop(patch, ground) {
    const probes = probePositions(patch), xs = probes.map(probe => probe.x), zs = probes.map(probe => probe.z);
    const cx = (Math.min(...xs) + Math.max(...xs)) / 2, cz = (Math.min(...zs) + Math.max(...zs)) / 2;
    const probeCamera = { position: [cx, PROBE_CAMERA.height, cz + PROBE_CAMERA.targetOffsetZ], target: [cx, 0, cz], projection: 'orthographic', orthoHeight: PROBE_CAMERA.orthoHeight, zoom: 1 };
    return { probes, probeCamera, stop: { id: 'orthographic-close', view: probeCamera, world: { x: cx, z: cz, groundHeight: await ground(cx, cz) } } };
}

/** The route stops derived from the manifest bounds: the fixture poses scaled onto the bounds (identity on the 1 km fixtures) plus the probe camera. */
async function buildRoute(manifest, poses, ground, patch) {
    const { minX, maxX, minZ, maxZ } = manifest.bounds, width = maxX - minX, depth = maxZ - minZ;
    const pose = id => poses.poses.find(entry => entry.id === id);
    const scale = entry => ({ x: minX + entry.x / 1000 * width, z: minZ + entry.z / 1000 * depth });
    const aim = (position, entry) => { const direction = reviewPoseDirection(entry.headingDegrees, entry.pitchDegrees); return position.map((value, axis) => value + direction[axis] * entry.lookDistanceMeters); };
    const standing = async entry => {
        const { x, z } = scale(entry), groundHeight = await ground(x, z);
        if (groundHeight === null) throw new Error(`${entry.id} scaled onto (${x}, ${z}) has no native ground`);
        const position = [x, groundHeight + entry.eyeHeightMeters, z];
        return { view: { position, target: aim(position, entry), projection: 'perspective', fov: entry.fovDegrees, zoom: 1 }, world: { poseId: entry.id, x, z, groundHeight } };
    };
    const overviewPose = pose('F-08'), overviewAt = scale(overviewPose), overviewPosition = [overviewAt.x, overviewPose.altitudeMeters / 1000 * width, overviewAt.z];
    const overview = { view: { position: overviewPosition, target: aim(overviewPosition, overviewPose), projection: 'perspective', fov: overviewPose.fovDegrees, zoom: 1 }, world: { poseId: 'F-08', ...overviewAt, groundHeight: await ground(overviewAt.x, overviewAt.z) } };
    const bluff = await standing(pose('F-01')), gully = await standing(pose('F-04'));
    const { probes, probeCamera, stop } = await probeStop(patch, ground);
    return { probes, probeCamera, stops: [
        { id: 'overview', view: overview.view, world: overview.world },
        { id: 'approach-bluff', view: bluff.view, world: bluff.world, travelFrames: 30 },
        { id: 'gully-close', view: gully.view, world: gully.world },
        stop,
        { id: 'return-overview', view: overview.view, world: overview.world }
    ] };
}

/**
 * The coastal city route: the natural-world review poses resolved on the measured landscape's own native ground (eye-height poses follow the
 * terrain revision, LANDSCAPE_NATURAL_WORLD_ROADMAP.md §8): the 4 km overview (NW-13, the viewer's home camera), a 30-frame flyover approach
 * (NW-10), the bluff toe (NW-03), the high city from the low city (NW-08), the swim beach (NW-01), the probe camera, return to the overview.
 */
async function buildCityRoute(manifest, poses, ground, patch) {
    const resolve = async id => {
        const pose = poses.poses.find(entry => entry.id === id);
        if (!pose) throw new Error(`${poses.id} has no pose ${id}`);
        const camera = await resolveReviewPose(pose, ground);
        return { view: { position: [...camera.position], target: [...camera.target], projection: 'perspective', fov: camera.fov, zoom: 1 }, world: { poseId: id, x: camera.position[0], z: camera.position[2], groundHeight: camera.groundHeight } };
    };
    const overview = await resolve('NW-13'), flyover = await resolve('NW-10'), bluffToe = await resolve('NW-03'), lowCity = await resolve('NW-08'), beach = await resolve('NW-01');
    const { probes, probeCamera, stop } = await probeStop(patch, ground);
    return { probes, probeCamera, stops: [
        { id: 'overview', view: overview.view, world: overview.world },
        { id: 'flyover-NW-10', view: flyover.view, world: flyover.world, travelFrames: 30 },
        { id: 'bluff-toe-NW-03', view: bluffToe.view, world: bluffToe.world },
        { id: 'low-city-NW-08', view: lowCity.view, world: lowCity.world },
        { id: 'beach-NW-01', view: beach.view, world: beach.world },
        stop,
        { id: 'return-overview', view: overview.view, world: overview.world }
    ] };
}

const ROUTE_BUILDERS = Object.freeze({ fixture: buildRoute, 'natural-world': buildCityRoute });

async function settled(page) {
    await page.waitForFunction(() => {
        const state = window.__landscapeTestHooks?.snapshot();
        if (state?.lastError) throw new Error(state.lastError);
        return state?.ready && state.loadTiming.firstCoveredFrameAtMs !== null && state.streaming.settled && state.appearance?.settled && state.planning.ready && state.planning.settled;
    }, null, { timeout: settleTimeoutMs });
    return page.evaluate(() => ({ state: window.__landscapeTestHooks.snapshot(), atMs: performance.now(), timeOrigin: performance.timeOrigin }));
}

function networkRecorder(page, manifest) {
    let phase = 'startup';
    const records = [], requests = new Map(), jobs = new Set(), identities = new Map();
    const base = new URL(`http://127.0.0.1${SERVED_PREFIX}manifest.json`);
    for (const chunk of manifest.chunks) {
        identities.set(new URL(chunk.channels.height.url, base).pathname, { kind: 'height', byteLength: chunk.channels.height.byteLength, chunkId: chunk.id, level: chunk.level });
        identities.set(new URL(chunk.channels.landCover.url, base).pathname, { kind: 'cover', byteLength: chunk.channels.landCover.byteLength, chunkId: chunk.id, level: chunk.level });
    }
    page.on('request', request => {
        const url = new URL(request.url());
        if (!url.pathname.startsWith(SERVED_PREFIX)) return;
        const identity = identities.get(url.pathname);
        const kind = identity?.kind ?? (/\/(appearance|fields|geology)\//.test(url.pathname) ? 'sidecar' : url.pathname.includes('/source/') ? 'reference' : 'metadata');
        const record = { phase, path: url.pathname, kind, chunkId: identity?.chunkId ?? null, level: identity?.level ?? null, declaredPayloadBytes: identity?.byteLength ?? 0, status: 'pending', startedAtEpochMs: null };
        records.push(record); requests.set(request, record);
    });
    page.on('requestfinished', request => {
        const record = requests.get(request); if (!record) return;
        const job = (async () => {
            try {
                const response = await request.response();
                Object.assign(record, { status: response.status(), cacheControl: response.headers()['cache-control'] ?? null, sizes: await request.sizes(), startedAtEpochMs: request.timing().startTime });
            } catch (error) { record.measurementError = error.message; }
        })();
        jobs.add(job); job.finally(() => jobs.delete(job));
    });
    page.on('requestfailed', request => { const record = requests.get(request); if (record) Object.assign(record, { status: 'failed', failure: request.failure()?.errorText }); });
    return { records, setPhase: value => { phase = value; }, flush: () => Promise.allSettled([...jobs]) };
}

function networkTotals(records, maxLevel) {
    const payloads = records.filter(record => record.declaredPayloadBytes > 0), completed = payloads.filter(record => record.status === 200);
    const nativeHeights = completed.filter(record => record.kind === 'height' && record.level === maxLevel);
    return { requests: records.length, payloadRequests: payloads.length, completedPayloads: completed.length,
        logicalPayloadBytes: completed.reduce((sum, record) => sum + record.declaredPayloadBytes, 0),
        uniquePayloadBytes: [...new Map(completed.map(record => [record.path, record.declaredPayloadBytes])).values()].reduce((sum, bytes) => sum + bytes, 0),
        encodedPayloadResponseBodyBytes: completed.reduce((sum, record) => sum + (record.sizes?.responseBodySize ?? 0), 0),
        unmeasuredResponseSizes: completed.filter(record => !record.sizes).length,
        nativeHeightPayloads: new Set(nativeHeights.map(record => record.path)).size, nativeHeightChunkIds: [...new Set(nativeHeights.map(record => record.chunkId))].sort(),
        failedPayloadRequests: payloads.filter(record => record.status === 'failed').length,
        sidecarRequests: records.filter(record => record.kind === 'sidecar').map(record => ({ path: record.path, status: record.status })),
        cacheControl: [...new Set(completed.map(record => record.cacheControl))] };
}

async function measureStop(page, stop) {
    return page.evaluate(async ({ stop, warmupFrames, sampleFrames, settleTimeoutMs }) => {
        const hooks = window.__landscapeTestHooks, wait = () => new Promise(resolve => requestAnimationFrame(resolve));
        const capture = hooks.beginPerformanceCapture({ maxFrames: 4096 });
        const began = performance.now(), initial = hooks.snapshot();
        if (stop.travelFrames) {
            for (let step = 1; step <= stop.travelFrames; step++) {
                const fraction = step / stop.travelFrames;
                const interpolate = key => initial.camera[key].map((value, index) => value + (stop.view[key][index] - value) * fraction);
                hooks.setCamera({ ...stop.view, position: interpolate('position'), target: interpolate('target') });
                await wait();
            }
        } else hooks.setCamera(stop.view);
        const cameraAppliedAtMs = performance.now();
        let state, stable = 0;
        do {
            for (let index = 0; index < 6; index++) await wait();
            state = hooks.snapshot();
            if (state.lastError) throw new Error(state.lastError);
            stable = state.streaming.settled && state.appearance.settled && state.planning.settled ? stable + 1 : 0;
            if (performance.now() - began > settleTimeoutMs) throw new Error(`detail did not settle at ${stop.id} within ${settleTimeoutMs} ms`);
        } while (stable < 2);
        const settledAtMs = performance.now();
        for (let index = 0; index < warmupFrames; index++) await wait();
        const sampleStartMs = performance.now();
        for (let index = 0; index < sampleFrames; index++) await wait();
        const sampleEndMs = performance.now();
        for (let index = 0; index < 4; index++) await wait();
        return { state: hooks.snapshot(), capture: hooks.endPerformanceCapture(), travelMs: cameraAppliedAtMs - began, settledAfterCameraMs: settledAtMs - cameraAppliedAtMs,
            sampleStartElapsedMs: sampleStartMs - capture.startedAtMs, sampleEndElapsedMs: sampleEndMs - capture.startedAtMs };
    }, { stop, warmupFrames, sampleFrames, settleTimeoutMs });
}

function levelHistogram(ids, manifest) {
    const histogram = {};
    for (const id of ids) { const level = manifest.chunks.find(chunk => chunk.id === id)?.level ?? Number(/^l(\d+)\//.exec(id)[1]); histogram[level] = (histogram[level] ?? 0) + 1; }
    return histogram;
}

function residency(state, manifest) {
    const { streaming, budget } = state;
    return { residentLeaves: streaming.residentLeafIds.length, leafLevels: levelHistogram(streaming.residentLeafIds, manifest), residentLeafIds: streaming.residentLeafIds,
        residentSources: streaming.residentSourceIds.length, desiredLeaves: streaming.desiredLeafIds.length, sourceBytes: state.sourceBytes, geometryBytes: streaming.geometryBytes,
        vertices: streaming.vertices, triangles: streaming.triangles, cpuBytes: budget.cpuBytes, gpuBytes: budget.gpuBytes, peakCpuBytes: budget.peakCpuBytes, peakGpuBytes: budget.peakGpuBytes,
        appearanceCpuBytes: state.appearance.cpuBytes, appearanceGpuBytes: state.appearance.gpuBytes, rendererMemory: state.renderer.memory,
        targetMet: streaming.targetMet, achievedErrorPixels: streaming.achievedErrorPixels, degradationReason: streaming.degradationReason, appearanceDegradation: state.appearance.degradationReason };
}

function summarizeMeasurement(measured) {
    const frames = unpack(measured.capture.frames, measured.capture.columns), gpu = unpack(measured.capture.gpu, measured.capture.gpuColumns);
    const transitioning = frames.slice(0, Math.max(0, frames.length - warmupFrames - sampleFrames - 4));
    const transitionSubmissions = new Set(transitioning.map(frame => frame.gpuSubmission));
    const sampled = frames.filter(frame => frame.elapsedMs >= measured.sampleStartElapsedMs && frame.elapsedMs <= measured.sampleEndElapsedMs);
    const submissions = new Set(sampled.map(frame => frame.gpuSubmission));
    const gpuValues = gpu.filter(sample => submissions.has(sample.submission)).map(sample => sample.ms);
    const frameMs = statistics(sampled.map(frame => frame.intervalMs));
    return { sampleCount: sampled.length, frameMs, fps: 1000 / frameMs.mean, cpuFrameMs: statistics(sampled.map(frame => frame.cpuFrameMs)),
        geometryStreamingMs: statistics(sampled.map(frame => frame.geometryStreamingMs)), appearanceStreamingMs: statistics(sampled.map(frame => frame.appearanceStreamingMs)),
        gpuMs: gpuValues.length ? { status: 'measured', ...statistics(gpuValues) } : { status: 'not measured', reason: measured.capture.finalGpu.disabledReason ?? 'No completed GPU timer queries matched this sampling window' },
        gpuPendingAtEnd: measured.capture.finalGpu.pendingQueryCount, gpuDisjointCount: measured.capture.finalGpu.disjointCount,
        drawCalls: statistics(sampled.map(frame => frame.drawCalls)), triangles: statistics(sampled.map(frame => frame.triangles)),
        travelMs: measured.travelMs, settledAfterCameraMs: measured.settledAfterCameraMs, geometryTargetMet: measured.state.streaming.targetMet,
        detailStatus: measured.state.streaming.targetMet ? 'geometry at the 1.5 px target' : `geometry settled with ${measured.state.streaming.degradationReason}`,
        uploadedBytes: frames.reduce((sum, frame) => sum + frame.uploadedBytes, 0), peakUploadedBytesPerFrame: frames.length ? Math.max(...frames.map(frame => frame.uploadedBytes)) : 0,
        transition: { window: 'travel/load/settle prefix; excludes warm-up, sample and query-tail frames', frames: transitioning.length, frameMs: statistics(transitioning.map(frame => frame.intervalMs)),
            cpuFrameMs: statistics(transitioning.map(frame => frame.cpuFrameMs)), gpuMs: statistics(gpu.filter(sample => transitionSubmissions.has(sample.submission)).map(sample => sample.ms)) },
        captureCpuBytes: measured.capture.captureCpuBytes, sampledFrames: sampled, sampledGpuMs: gpuValues };
}

/** The leaf whose bounds hold the point, the deepest when the point lies on a shared border. */
function residentLevelAt(ids, manifest, x, z) {
    const leaves = ids.map(id => manifest.chunks.find(chunk => chunk.id === id)).filter(chunk => chunk && x >= chunk.bounds.minX && x <= chunk.bounds.maxX && z >= chunk.bounds.minZ && z <= chunk.bounds.maxZ);
    return leaves.length ? Math.max(...leaves.map(chunk => chunk.level)) : null;
}

/** Reads the stored float32 at a native vertex from the saved landscape (east/south chunk owns shared borders, like the ground sampler). */
function createStoredHeightReader(directory, manifest) {
    const natives = manifest.chunks.filter(chunk => chunk.level === manifest.grid.maxLevel), cache = new Map(), spacing = manifest.grid.spacingX;
    const { maxX, minZ } = manifest.bounds;
    return async (x, z) => {
        const descriptor = natives.find(chunk => x >= chunk.bounds.minX && (x < chunk.bounds.maxX || (x === maxX && chunk.bounds.maxX === maxX)) && z <= chunk.bounds.maxZ && (z > chunk.bounds.minZ || (z === minZ && chunk.bounds.minZ === minZ)));
        if (!descriptor) throw new Error(`no native chunk owns (${x}, ${z})`);
        if (!cache.has(descriptor.id)) cache.set(descriptor.id, readLandscapeFileChunk(directory, manifest, descriptor.id));
        const chunk = await cache.get(descriptor.id);
        const column = (x - descriptor.bounds.minX) / spacing, row = (descriptor.bounds.maxZ - z) / spacing;
        if (Math.abs(column - Math.round(column)) > 1e-9 || Math.abs(row - Math.round(row)) > 1e-9) throw new Error(`(${x}, ${z}) is not a native vertex`);
        return { chunkId: descriptor.id, value: chunk.heights[Math.round(row) * descriptor.columns + Math.round(column)] };
    };
}

/** Holds at the current camera until streaming, appearance and planning report settled on two polls six frames apart (as measureStop does). */
async function holdUntilSettled(page) {
    return page.evaluate(async ({ settleTimeoutMs }) => {
        const hooks = window.__landscapeTestHooks, wait = () => new Promise(resolve => requestAnimationFrame(resolve));
        const began = performance.now();
        let state, stable = 0;
        do {
            for (let index = 0; index < 6; index++) await wait();
            state = hooks.snapshot();
            if (state.lastError) throw new Error(state.lastError);
            stable = state.streaming.settled && state.appearance.settled && state.planning.settled ? stable + 1 : 0;
            if (performance.now() - began > settleTimeoutMs) throw new Error(`detail did not settle at the probe camera within ${settleTimeoutMs} ms`);
        } while (stable < 2);
        return performance.now() - began;
    }, { settleTimeoutMs });
}

async function runProbes(page, probes, truths) {
    return page.evaluate(async ({ probes, truths, nudges }) => {
        const hooks = window.__landscapeTestHooks, rect = document.getElementById('game-canvas').getBoundingClientRect(), view = hooks.snapshot().camera;
        // the planner's state around the probes: what it wanted, what is resident and why it stopped, so a coarse hit is never read as a picking defect
        const streamingState = state => ({ targetMet: state.streaming.targetMet, achievedErrorPixels: state.streaming.achievedErrorPixels, degradationReason: state.streaming.degradationReason,
            desiredLeaves: state.streaming.desiredLeafIds.length, residentLeaves: state.streaming.residentLeafIds.length, pending: state.streaming.pending, settled: state.streaming.settled,
            appearanceDegradation: state.appearance.degradationReason, cpuBytes: state.budget.cpuBytes, gpuBytes: state.budget.gpuBytes });
        const streamingBefore = streamingState(hooks.snapshot());
        // the viewer camera basis as three.js lookAt builds it (up = +Y): z toward the eye, x = up x z, y = z x x
        const sub = (a, b) => a.map((value, axis) => value - b[axis]), dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
        const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]], unit = v => { const length = Math.hypot(...v); return v.map(c => c / length); };
        const zc = unit(sub(view.position, view.target)), xc = unit(cross([0, 1, 0], zc)), yc = cross(zc, xc), aspect = rect.width / rect.height;
        const project = point => {
            const d = sub(point, view.position), cam = [dot(d, xc), dot(d, yc), dot(d, zc)];
            let nx, ny;
            if (view.projection === 'orthographic') { nx = cam[0] / (view.orthoHeight * aspect / 2 / view.zoom); ny = cam[1] / (view.orthoHeight / 2 / view.zoom); }
            else { const t = Math.tan(view.fov * Math.PI / 360) / view.zoom; nx = cam[0] / -cam[2] / (t * aspect); ny = cam[1] / -cam[2] / t; }
            return { nx, ny, clientX: rect.left + (nx + 1) / 2 * rect.width, clientY: rect.top + (1 - ny) / 2 * rect.height };
        };
        const pickOnce = (x, z, y) => {
            const pixel = project([x, y, z]);
            if (!(Math.abs(pixel.nx) <= 1 && Math.abs(pixel.ny) <= 1)) return { status: 'off-screen', ...pixel };
            const hit = hooks.pickPoint(pixel.clientX, pixel.clientY);
            return hit ? { status: 'hit', ...hit, clientX: pixel.clientX, clientY: pixel.clientY } : { status: 'miss', ...pixel };
        };
        const pick = (x, z, y) => {
            let last = null;
            for (const [dx, dz] of nudges) { last = pickOnce(x + dx, z + dz, y); if (last.status === 'hit') return { ...last, nudgeMeters: Math.hypot(dx, dz) }; }
            return last;
        };
        // two passes: the second aims the ray through the first hit's height so the ray crosses the surface at the probed (x, z)
        const picks = probes.map((probe, index) => { const first = pick(probe.x, probe.z, truths[index]); const second = first.status === 'hit' ? pick(probe.x, probe.z, first.y) : null; return { first, second }; });
        hooks.setSelectionRadius(0);
        const queries = [];
        for (const probe of probes) {
            const context = await hooks.select(probe.x, probe.z);
            queries.push(context ? { height: context.sample.height, chunkId: context.sample.chunkId, accuracy: context.sample.accuracy, provisional: context.provisional, editingReady: context.editingReady,
                decodedBytes: context.acquisition?.decodedBytes ?? null, chunkIds: context.acquisition?.chunkIds ?? null } : null);
        }
        const state = hooks.snapshot();
        return { camera: view, rect: { left: rect.left, top: rect.top, width: rect.width, height: rect.height }, residentLeafIds: state.streaming.residentLeafIds, picks, queries, lastError: state.lastError,
            streaming: { beforePicks: streamingBefore, afterQueries: streamingState(state) } };
    }, { probes, truths, nudges: PROBE_NUDGES });
}

async function summarizeProbes(result, probes, truths, manifest, ground, storedHeight) {
    const picking = [], query = [];
    for (let index = 0; index < probes.length; index++) {
        const probe = probes[index], pick = result.picks[index], hit = pick.second?.status === 'hit' ? pick.second : pick.first.status === 'hit' ? pick.first : null;
        const residentLevel = residentLevelAt(result.residentLeafIds, manifest, probe.x, probe.z);
        const record = { ...probe, truth: truths[index], residentLevel, passes: pick.second ? 2 : 1 };
        if (hit) {
            const truthAtHit = await ground(hit.x, hit.z);
            Object.assign(record, { status: 'hit', hit: { x: hit.x, y: hit.y, z: hit.z }, nudgeMeters: hit.nudgeMeters, lateralMeters: Math.hypot(hit.x - probe.x, hit.z - probe.z), truthAtHit,
                errorAtHitMeters: truthAtHit === null ? null : Math.abs(hit.y - truthAtHit), errorAtProbeMeters: Math.abs(hit.y - truths[index]) });
        } else Object.assign(record, { status: pick.first.status, detail: pick.first });
        picking.push(record);
        const answer = result.queries[index];
        const expected = probe.kind === 'vertex' ? await storedHeight(probe.x, probe.z) : { chunkId: null, value: truths[index] };
        query.push({ ...probe, expected: expected.value, expectedChunkId: expected.chunkId, answer, exact: answer ? Object.is(answer.height, expected.value) : false,
            comparison: probe.kind === 'vertex' ? 'stored float32 at the native vertex' : 'Node sampleLandscapeChunk on the saved native chunk' });
    }
    const errors = picking.filter(record => record.status === 'hit' && record.errorAtHitMeters !== null).map(record => record.errorAtHitMeters);
    const byKind = kind => { const values = picking.filter(record => record.kind === kind && record.status === 'hit' && record.errorAtHitMeters !== null).map(record => record.errorAtHitMeters); return values.length ? { count: values.length, max: Math.max(...values), mean: values.reduce((sum, value) => sum + value, 0) / values.length } : null; };
    const levels = {};
    for (const record of picking) levels[record.residentLevel] = (levels[record.residentLevel] ?? 0) + 1;
    return { camera: result.camera, canvasRect: result.rect, residentLeafIds: result.residentLeafIds, residentLevelHistogram: levels, streaming: result.streaming, lastError: result.lastError,
        picking: { probes: picking.length, hits: picking.filter(record => record.status === 'hit').length, maxErrorMeters: errors.length ? Math.max(...errors) : null,
            meanErrorMeters: errors.length ? errors.reduce((sum, value) => sum + value, 0) / errors.length : null, maxLateralMeters: Math.max(0, ...picking.filter(record => record.status === 'hit').map(record => record.lateralMeters)),
            vertices: byKind('vertex'), cellCenters: byKind('cell-center'), nudged: picking.filter(record => record.nudgeMeters > 0).length, records: picking,
            method: `two raycasts per probe through the pixel of (x, truth, z) then (x, firstHit.y, z) from a top-down orthographic camera, retried with ${PROBE_NUDGES.slice(1).map(([dx]) => `${dx} m`).join(' and ')} nudges when a ray through a vertex misses; error = |hit.y - authoritative native height at the hit (x, z)| (createNativeGroundSampler, exact NW-SE triangulation)` },
        query: { probes: query.length, answered: query.filter(record => record.answer).length, exactVertices: query.filter(record => record.kind === 'vertex' && record.exact).length, vertices: query.filter(record => record.kind === 'vertex').length,
            exactCellCenters: query.filter(record => record.kind === 'cell-center' && record.exact).length, cellCenters: query.filter(record => record.kind === 'cell-center').length, records: query,
            method: 'viewer select(x, z) with radius 0 (point region: one native lease, queryLandscapeSelection/sampleLandscapeChunk) compared with the stored float32 heights read from the saved landscape in Node' } };
}

function assertBounded(state, manifest, appearanceErrors) {
    expect(state.revision).toBe(manifest.revision);
    expect(state.lastError).toBeNull();
    expect(state.canvas.width).toBe(viewport.width);
    expect(state.canvas.height).toBeGreaterThanOrEqual(viewport.height - 48);
    expect(state.budget.cpuBytes).toBeLessThanOrEqual(state.budget.limits.cpuBytes);
    expect(state.budget.gpuBytes).toBeLessThanOrEqual(state.budget.limits.gpuBytes);
    expect(state.budget.peakCpuBytes).toBeLessThanOrEqual(state.budget.limits.cpuBytes);
    expect(state.budget.peakGpuBytes).toBeLessThanOrEqual(state.budget.limits.gpuBytes);
    expect(state.peakUploadedBytesPerFrame).toBeLessThanOrEqual(uploadCapBytes);
    expect(state.streaming.errors).toEqual([]); expect(state.planning.errors).toEqual([]);
    expect(state.appearance.errors.map(error => error.message)).toEqual(appearanceErrors);
    expect(state.streaming.residentLeafIds.reduce((sum, id) => sum + 4 ** -manifest.chunks.find(chunk => chunk.id === id).level, 0)).toBe(1);
    if (!state.streaming.targetMet) expect(state.streaming.degradationReason).toBeTruthy();
}

async function exists(file) { try { await access(file); return true; } catch { return false; } }

async function serve(directory, baseURL) {
    const url = new URL(baseURL);
    const server = createLandscapeServer({ root, landscapeDirectory: directory });
    await new Promise((resolve, reject) => {
        server.once('error', error => reject(new Error(`cannot listen on ${baseURL} (${error.code}); stop the other landscape server before measuring`)));
        server.listen(Number(url.port), url.hostname, () => resolve(undefined));
    });
    return server;
}

const number = (value, digits = 2) => Number.isFinite(value) ? value.toFixed(digits) : 'not measured';
const mib = value => number(value / MiB);

async function writeComparison() {
    const reports = [];
    for (const entry of await readdir(ARTIFACTS, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue;
        // rows are labeled by their receipt directory, so two runs of one landscape (for example coastal-city-v3 and coastal-city-v3-run1) stay distinguishable
        try { reports.push({ ...JSON.parse(await readFile(path.join(ARTIFACTS, entry.name, 'report.json'), 'utf8')), directoryName: entry.name }); } catch { /* a fixture directory without a receipt yet */ }
    }
    const order = report => { const index = DEFAULT_FIXTURES.indexOf(report.fixture.id); return index < 0 ? DEFAULT_FIXTURES.length : index; };
    reports.sort((a, b) => order(a) - order(b) || a.fixture.id.localeCompare(b.fixture.id));
    const measured = reports.filter(report => report.status === 'measured');
    const stopIds = ROUTE.stops, settleStops = ROUTE.settleColumns;
    const headline = measured.map(report => { const f = report.fixture, s = report.startup, r = report.routeTotals, p = report.probes;
        const stop = id => report.route.find(entry => entry.id === id);
        return `| ${report.directoryName ?? f.id} | ${f.grid.columns}² / ${f.grid.spacingX} m / L${f.grid.maxLevel} / ${f.nodes} | ${mib(f.nativePayloadBytes)} / ${mib(f.totalPayloadBytes)} | ${s.nativeHeightPayloadsBeforeFirstFrame} / ${s.network.nativeHeightPayloads} of ${f.natives} | ${number(s.coarseFromLoadMs, 0)} / ${number(s.settledFromLoadMs, 0)} | ${number(s.programCompileMs, 0)} | ${mib(report.end.peakCpuBytes)} / ${mib(report.end.peakGpuBytes)} | ${mib(r.peakUploadedBytesPerFrame)} / ${mib(r.uploadedBytes)} | ${number(r.frameMs.median)} / ${number(r.frameMs.p95)} | ${number(r.cpuFrameMs.median)} / ${number(r.cpuFrameMs.p95)} | ${r.gpuMs ? `${number(r.gpuMs.median)} / ${number(r.gpuMs.p95)}` : 'not measured'} | ${Math.round(r.triangles.max).toLocaleString('en-US')} | ${settleStops.map(([id]) => number(stop(id)?.settledAfterCameraMs, 0)).join(' / ')} | ${report.route.every(entry => entry.geometryTargetMet) ? 'yes' : report.route.filter(entry => !entry.geometryTargetMet).map(entry => entry.id).join(', ')} | ${p.status === 'measured' ? `${number(p.picking.maxErrorMeters, 4)} / ${number(p.picking.meanErrorMeters, 4)} (L${Object.keys(p.residentLevelHistogram).join('/L')})` : p.status} | ${p.status === 'measured' ? `${p.query.exactVertices}/${p.query.vertices} vertices, ${p.query.exactCellCenters}/${p.query.cellCenters} centers` : p.status} |`; });
    const missing = reports.filter(report => report.status !== 'measured').map(report => `| ${report.directoryName ?? report.fixture.id} | ${report.status}: ${report.reason} |`);
    const perStop = measured.flatMap(report => report.route.map(stop => `| ${report.directoryName ?? report.fixture.id} | ${stop.id} | ${stop.residency.residentLeaves} (${Object.entries(stop.residency.leafLevels).map(([level, count]) => `L${level}:${count}`).join(' ')}) | ${Math.round(stop.triangles.median).toLocaleString('en-US')} / ${number(stop.drawCalls.median, 0)} | ${number(stop.frameMs.median)} / ${number(stop.frameMs.p95)} / ${number(stop.frameMs.max)} | ${number(stop.cpuFrameMs.median)} / ${number(stop.cpuFrameMs.p95)} / ${number(stop.cpuFrameMs.max)} | ${stop.gpuMs.status === 'measured' ? `${number(stop.gpuMs.median)} / ${number(stop.gpuMs.p95)} / ${number(stop.gpuMs.max)}` : 'not measured'} | ${mib(stop.residency.cpuBytes)} / ${mib(stop.residency.gpuBytes)} | ${mib(stop.uploadedBytes)} / ${mib(stop.peakUploadedBytesPerFrame)} | ${number(stop.settledAfterCameraMs, 0)} | ${stop.geometryTargetMet ? 'met' : stop.detailStatus} |`));
    const conditions = measured[0]?.conditions;
    const text = `# ${ROUTE.title}\n\nGenerated ${new Date().toISOString()} from ${reports.length} receipt(s) under ${relative(ARTIFACTS)}/<fixture>/report.json.${conditions ? ` Host ${conditions.hardware.cpuModel}, ${conditions.hardware.logicalCpus} logical CPUs; ${conditions.metadata?.renderer?.renderer ?? 'GPU unknown'}; Chromium ${conditions.browserVersion}; ${conditions.viewport.width} × ${conditions.viewport.height} DPR ${conditions.viewport.dpr}, drawing buffer ${conditions.metadata?.renderer?.width} × ${conditions.metadata?.renderer?.height}; shipped profile ${conditions.profile.cpuMiB}/${conditions.profile.gpuMiB} MiB with the surface cache ${conditions.surfaceCache}.` : ''}\n\nEvery measured route has ${stopIds.length} stops (${stopIds.join(', ')}), ${warmupFrames} discarded warm-up frames then ${sampleFrames} sampled frames per stop; statistics are median / nearest-rank p95 (/ max) over the sampled windows, pooled per fixture. Startup counts native height payloads requested before the first covered frame (must be 0) and by the settled startup at the viewer's home camera. Picking: 64 probes on ${ROUTE.patch} (32 native vertices shared by all spacings, 32 finest-cell centers) raycast from a top-down orthographic camera against the authoritative native height at the hit; query: viewer select() against the stored float32. Fixtures without an appearance sidecar render fallback soil colors (the viewer records \`${MISSING_APPEARANCE_ERROR}\`); surface detail and PBR materials are therefore not part of these numbers.\n\n| Fixture | Grid / spacing / depth / nodes | Native / all payload MiB | Startup natives before first frame / by settled | Coarse / settled startup ms | Compile ms | Peak CPU / GPU MiB | Upload max per frame / route MiB | Frame median / p95 ms | CPU median / p95 ms | GPU median / p95 ms | Max triangles | Settle ms ${settleStops.map(([, label]) => label).join(' / ')} | Geometry 1.5 px met | Picking max / mean error m (resident levels) | Query exact |\n| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- | --- | --- |\n${headline.join('\n')}\n${missing.length ? `\n| Fixture | Not measured |\n| --- | --- |\n${missing.join('\n')}\n` : ''}\n## Per stop\n\n| Fixture | Stop | Resident leaves (by level) | Triangles / draw calls (median) | Frame ms median / p95 / max | CPU ms median / p95 / max | GPU ms median / p95 / max | CPU / GPU MiB at the stop | Uploads route / max per frame MiB | Settle ms | Detail |\n| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |\n${perStop.join('\n')}\n`;
    await writeFile(path.join(ARTIFACTS, 'comparison.md'), text);
}

for (const fixture of fixtures) {
    test(`Landscape ${ROUTE.label}: ${fixture.id} streams within budget and picks and queries exactly against its native heights`, async ({ browser }, testInfo) => {
        test.setTimeout(15 * 60 * 1000);
        const baseURL = String(testInfo.project.use.baseURL);
        expect(new URL(baseURL).port, 'Landscape verification uses port 8002').toBe('8002');
        const artifacts = path.join(ARTIFACTS, fixture.id);
        await mkdir(artifacts, { recursive: true });
        if (!(await exists(path.join(fixture.directory, 'manifest.json')))) {
            await writeFile(path.join(artifacts, 'report.json'), JSON.stringify({ format: 'landscape-resolution-report', schemaVersion: 1, status: 'not measured', reason: `missing ${relative(path.join(fixture.directory, 'manifest.json'))}`,
                createdAt: new Date().toISOString(), fixture: { id: fixture.id, directory: relative(fixture.directory) } }, null, 2));
            await writeComparison();
            test.skip(true, `not measured: ${fixture.id} has no manifest.json at ${fixture.directory}`);
        }
        const { bytes: manifestBytes, manifest } = await readLandscapeFileManifest(fixture.directory);
        const natives = manifest.chunks.filter(chunk => chunk.level === manifest.grid.maxLevel);
        const appearanceAbsent = !(await exists(path.join(fixture.directory, 'appearance/manifest.json')));
        const expectedAppearanceErrors = appearanceAbsent ? [MISSING_APPEARANCE_ERROR] : [];
        const ground = await createNativeGroundSampler(fixture.directory), storedHeight = createStoredHeightReader(fixture.directory, manifest);
        const poses = await loadReviewPoses(POSE_FILE);
        const { stops, probes, probeCamera } = await ROUTE_BUILDERS[ROUTE.id](manifest, poses, ground, ROUTE.probePatch);
        const probesInBounds = probes.every(probe => probe.x >= manifest.bounds.minX && probe.x <= manifest.bounds.maxX && probe.z >= manifest.bounds.minZ && probe.z <= manifest.bounds.maxZ);
        const report = { format: 'landscape-resolution-report', schemaVersion: 1, status: 'incomplete', complete: false, createdAt: new Date().toISOString(),
            fixture: { id: fixture.id, directory: relative(fixture.directory), manifestId: manifest.id, name: manifest.name, revision: manifest.revision, manifestSha256: createHash('sha256').update(manifestBytes).digest('hex'),
                manifestBytes: manifestBytes.length, grid: manifest.grid, bounds: manifest.bounds, nodes: manifest.chunks.length, natives: natives.length, provenance: manifest.provenance,
                nativePayloadBytes: natives.reduce((sum, chunk) => sum + chunk.channels.height.byteLength + chunk.channels.landCover.byteLength, 0),
                totalPayloadBytes: manifest.chunks.reduce((sum, chunk) => sum + chunk.channels.height.byteLength + chunk.channels.landCover.byteLength, 0),
                appearanceSidecar: appearanceAbsent ? 'absent' : 'present', fieldsSidecar: (await exists(path.join(fixture.directory, 'fields/manifest.json'))) ? 'present' : 'absent' },
            conditions: { baseURL, browserVersion: browser.version(), hardware: { platform: os.platform(), release: os.release(), arch: os.arch(), cpuModel: os.cpus()[0]?.model, logicalCpus: os.cpus().length, ramBytes: os.totalmem() },
                viewport: { ...viewport, dpr: 1 }, profile: landscapeShippedBudgetMiB(), surfaceCache: landscapeEffectiveSurfaceCache(), warmupFrames, sampleFrames, settleTimeoutMs,
                statistics: 'median, nearest-rank p95, max over the 120-frame sampled window per stop; route totals pool the equal-size windows', route: ROUTE.id, stops: ROUTE.stops, poseFile: relative(POSE_FILE), probePatch: ROUTE.probePatch, probeCamera: PROBE_CAMERA },
            route: [], probes: { status: 'not measured', reason: 'not reached' } };
        const server = await serve(fixture.directory, baseURL);
        const context = await browser.newContext({ baseURL, viewport, deviceScaleFactor: 1 });
        const page = await context.newPage(), errors = [], network = networkRecorder(page, manifest);
        page.on('pageerror', error => errors.push(error.message));
        page.on('console', message => { if (message.type() === 'error' && /shader|webgl|program|THREE/i.test(message.text())) errors.push(message.text()); });
        try {
            const servedText = await (await fetch(`${baseURL}${SERVED_PREFIX}manifest.json`)).text(), served = JSON.parse(servedText);
            expect(served.id, 'the server serves the fixture it measures').toBe(manifest.id);
            expect(served.revision).toBe(manifest.revision);
            report.server = { servedManifestId: served.id, servedRevision: served.revision, servedSha256: createHash('sha256').update(servedText).digest('hex') };
            expect(report.server.servedSha256, 'the served manifest is the fixture file byte for byte').toBe(report.fixture.manifestSha256);
            await page.goto(landscapeViewerUrl('/screens/landscape_fabrication.html'));
            const boot = await settled(page);
            assertBounded(boot.state, manifest, expectedAppearanceErrors);
            expect(boot.state.budget.limits).toEqual({ cpuBytes: report.conditions.profile.cpuMiB * MiB, gpuBytes: report.conditions.profile.gpuMiB * MiB });
            // the settled startup may hold natives: from the viewer's 4 km home camera a 1 km fixture's root error still projects above 1.5 px; the gate
            // is that none was requested before the first covered frame (request timing against the page clock), the settled residency is recorded
            await network.flush();
            const startupRecords = network.records.filter(record => record.phase === 'startup');
            const firstFrameEpochMs = boot.timeOrigin + boot.state.loadTiming.firstCoveredFrameAtMs;
            const nativeBeforeFirstFrame = startupRecords.filter(record => record.kind === 'height' && record.level === manifest.grid.maxLevel && record.startedAtEpochMs !== null && record.startedAtEpochMs < firstFrameEpochMs);
            expect(nativeBeforeFirstFrame, 'no native height payload is requested before the first covered frame').toHaveLength(0);
            const metadata = await page.evaluate(() => window.__landscapeTestHooks.performanceMetadata());
            expect(metadata.viewport).toEqual({ ...viewport, dpr: 1 });
            report.conditions.metadata = metadata;
            report.startup = { coarseFromNavigationMs: boot.state.loadTiming.firstCoveredFrameAtMs, coarseFromLoadMs: boot.state.loadTiming.firstCoveredFrameAtMs - boot.state.loadTiming.startedAtMs,
                settledFromLoadMs: boot.atMs - boot.state.loadTiming.startedAtMs, programCompileMs: boot.state.terrainProgram?.milliseconds ?? null, programCompile: boot.state.terrainProgram, programVariant: boot.state.terrainProgramVariant,
                residentLeafIdsAtFirstSettle: boot.state.streaming.residentLeafIds, leafLevelsAtFirstSettle: levelHistogram(boot.state.streaming.residentLeafIds, manifest),
                nativeSourcesAtFirstSettle: boot.state.streaming.residentSourceIds.filter(id => id.startsWith(`l${manifest.grid.maxLevel}/`)).length,
                nativeHeightPayloadsBeforeFirstFrame: nativeBeforeFirstFrame.length, network: networkTotals(startupRecords, manifest.grid.maxLevel),
                fetched: startupRecords.map(record => ({ path: record.path, kind: record.kind, chunkId: record.chunkId, status: record.status, bytes: record.declaredPayloadBytes, startedBeforeFirstFrame: record.startedAtEpochMs !== null && record.startedAtEpochMs < firstFrameEpochMs })),
                residency: residency(boot.state, manifest), appearanceErrors: boot.state.appearance.errors, naturalSoil: boot.state.streaming.naturalSoil, surfaceDetail: boot.state.surfaceDetail?.mode, terrainFields: boot.state.appearance.terrainFields?.status };
            const allFrames = [], allGpu = [];
            for (const stop of stops) {
                network.setPhase(stop.id);
                const measured = await measureStop(page, stop);
                assertBounded(measured.state, manifest, expectedAppearanceErrors);
                expect(measured.capture.droppedFrames).toBe(0); expect(measured.capture.droppedGpuSamples).toBe(0);
                const summary = summarizeMeasurement(measured);
                expect(summary.sampleCount).toBeGreaterThanOrEqual(sampleFrames - 1);
                expect(summary.sampleCount).toBeLessThanOrEqual(sampleFrames + 1);
                expect(summary.peakUploadedBytesPerFrame).toBeLessThanOrEqual(uploadCapBytes);
                allFrames.push(...summary.sampledFrames); allGpu.push(...summary.sampledGpuMs);
                delete summary.sampledFrames; delete summary.sampledGpuMs;
                await writeFile(path.join(artifacts, `${stop.id}-frames.json`), JSON.stringify(measured.capture));
                await page.screenshot({ path: path.join(artifacts, `${stop.id}.png`) });
                report.route.push({ id: stop.id, view: stop.view, world: stop.world, travelFrames: stop.travelFrames ?? 0, ...summary, residency: residency(measured.state, manifest), camera: measured.state.camera });
            }
            report.routeTotals = { frameMs: statistics(allFrames.map(frame => frame.intervalMs)), cpuFrameMs: statistics(allFrames.map(frame => frame.cpuFrameMs)), gpuMs: statistics(allGpu),
                triangles: statistics(allFrames.map(frame => frame.triangles)), drawCalls: statistics(allFrames.map(frame => frame.drawCalls)),
                uploadedBytes: report.route.reduce((sum, stop) => sum + stop.uploadedBytes, 0), peakUploadedBytesPerFrame: Math.max(...report.route.map(stop => stop.peakUploadedBytesPerFrame)),
                settledAfterCameraMs: Object.fromEntries(report.route.map(stop => [stop.id, stop.settledAfterCameraMs])) };
            report.routeTotals.fps = 1000 / report.routeTotals.frameMs.mean;
            // accuracy probes after the route, from the probe camera again, so the selection marker never enters the route's frames
            if (probesInBounds) {
                network.setPhase('probes');
                await page.evaluate(view => window.__landscapeTestHooks.setCamera(view), probeCamera);
                await settled(page);
                // the quick settled check can pass on the previous stop's state before the planner re-refines the patch: hold like a measured stop
                const probeSettleMs = await holdUntilSettled(page);
                const truths = [];
                for (const probe of probes) truths.push(await ground(probe.x, probe.z));
                const result = await runProbes(page, probes, truths);
                expect(result.lastError).toBeNull();
                report.probes = { status: 'measured', settleMs: probeSettleMs, ...(await summarizeProbes(result, probes, truths, manifest, ground, storedHeight)) };
                expect(report.probes.picking.hits, 'every probe ray hits the rendered terrain').toBe(probes.length);
                expect(report.probes.query.answered, 'every query resolves an authoritative native selection').toBe(probes.length);
                expect(report.probes.query.exactVertices, 'queries at native vertices return the stored float32 exactly').toBe(report.probes.query.vertices);
            } else report.probes = { status: 'not measured', reason: `the probe patch (x ${ROUTE.probePatch.originX}.., z ${ROUTE.probePatch.originZ}..) lies outside the fixture bounds` };
            await network.flush();
            report.network = { startup: report.startup.network, route: networkTotals(network.records.filter(record => record.phase !== 'startup' && record.phase !== 'probes'), manifest.grid.maxLevel),
                probes: networkTotals(network.records.filter(record => record.phase === 'probes'), manifest.grid.maxLevel), all: networkTotals(network.records, manifest.grid.maxLevel) };
            expect(report.network.all.unmeasuredResponseSizes).toBe(0);
            expect(errors).toEqual([]);
            report.status = 'measured'; report.complete = true;
            console.log(`Landscape ${ROUTE.label} ${fixture.id}: ${manifest.grid.columns}² at ${manifest.grid.spacingX} m, startup natives before first frame ${report.startup.nativeHeightPayloadsBeforeFirstFrame}, peak CPU/GPU ${mib(report.route.at(-1).residency.peakCpuBytes)}/${mib(report.route.at(-1).residency.peakGpuBytes)} MiB, frame median ${number(report.routeTotals.frameMs.median)} ms, picking max error ${report.probes.status === 'measured' ? number(report.probes.picking.maxErrorMeters, 4) : report.probes.status} m`);
        } catch (error) {
            report.status = 'failed'; report.reason = error.message; report.errors = errors;
            throw error;
        } finally {
            try { await page.evaluate(() => window.__landscapeTestHooks?.dispose()); } catch (error) { errors.push(`cleanup: ${error.message}`); }
            try {
                const disposed = await page.evaluate(() => window.__landscapeTestHooks?.snapshot());
                report.end = { disposed: disposed?.disposed ?? null, cpuBytes: disposed?.budget.cpuBytes ?? null, gpuBytes: disposed?.budget.gpuBytes ?? null, peakCpuBytes: disposed?.budget.peakCpuBytes ?? null, peakGpuBytes: disposed?.budget.peakGpuBytes ?? null, rendererMemory: disposed?.renderer.memory ?? null };
                await network.flush();
                await writeFile(path.join(artifacts, 'network.json'), JSON.stringify({ records: network.records, disposed, errors }, null, 2));
                await writeFile(path.join(artifacts, 'report.json'), JSON.stringify(report, null, 2));
                await writeComparison();
                expect(disposed?.budget.cpuBytes, 'controlled CPU allocations return to zero after disposal').toBe(0);
                expect(disposed?.budget.gpuBytes, 'estimated GPU allocations return to zero after disposal').toBe(0);
            } finally {
                await context.close();
                server.closeAllConnections();
                await new Promise(resolve => server.close(() => resolve(undefined)));
            }
        }
    });
}
