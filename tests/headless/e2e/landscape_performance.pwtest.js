// Measures identical coastal routes under hard residency profiles; never allocates a full native mesh.
// LANDSCAPE_PERFORMANCE_SOURCE (AI 596 D6) names the saved landscape directory the server on E2E_BASE_URL serves (relative to the repository
// or absolute; default the coastal v2 cache): the manifest and appearance manifest are read from it on disk. The served address stays the
// viewer's canonical cache prefix, because `LANDSCAPE_DIRECTORY=<directory> node tools/landscape_server/run.mjs` serves any directory there.
import { test, expect } from '@playwright/test';
import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { estimateLandscapeMeshBuffers } from '../../../src/graphics/engine3d/landscape/LandscapeMeshBuffers.js';
import { landscapeShippedBudgetMiB, landscapeViewerUrl } from '../../shared/landscape_viewer_url.js';

const artifacts = path.resolve(`tests/artifacts/screens/landscape/${process.env.LANDSCAPE_EVIDENCE_PHASE ?? 'ai576/d7'}/performance`);
const servedPrefix = '/assets/public/landscape/coastal-city/';
const sourcePath = `${servedPrefix}manifest.json`;
const sourceDirectory = path.resolve(process.env.LANDSCAPE_PERFORMANCE_SOURCE || 'assets/public/landscape/coastal-city');
await access(path.join(sourceDirectory, 'manifest.json')).catch(() => { throw new Error(`LANDSCAPE_PERFORMANCE_SOURCE ${sourceDirectory} holds no manifest.json; name the saved landscape directory the server serves`); });
const sourceText = await readFile(path.join(sourceDirectory, 'manifest.json'), 'utf8');
const manifest = JSON.parse(sourceText);
const appearance = JSON.parse(await readFile(path.join(sourceDirectory, 'appearance/manifest.json'), 'utf8'));
// The root-only settled startup and the root-only route end are the retained coastal v2's measured behaviour at the home pose (root error 1.81 m);
// a synthesized landscape's finer hierarchy settles a coarse set there (coastal v3: root error 12.76 m, 22 leaves with four natives), so another
// source is gated like the AI 596 D3/D4 harness instead: no native height payload requested before the first covered frame, the boot and end
// residency and the cold/warm end comparison recorded in the receipt.
const coastalDefault = sourceDirectory === path.resolve('assets/public/landscape/coastal-city');
const MiB = 1024 * 1024;
// standard: the shipped profile of the run's surface cache mode (LANDSCAPE_TEST_SURFACE_CACHE; the reduced profiles keep the cache off by its budget policy)
const profiles = [{ id: 'standard', ...landscapeShippedBudgetMiB() },
    { id: 'historical', cpuMiB: 128, gpuMiB: 64 }, { id: 'constrained', cpuMiB: 48, gpuMiB: 24 }];
const viewport = { width: 1920, height: 1080 }, warmupFrames = 30, sampleFrames = 120;
const details = manifest.chunks.filter(chunk => chunk.level === 2).sort((a, b) => b.geometricError - a.geometricError);
const center = tile => [(tile.bounds.minX + tile.bounds.maxX) / 2, (tile.bounds.minZ + tile.bounds.maxZ) / 2];
const [x, z] = center(details[0]);
const other = details.find(tile => Math.hypot(center(tile)[0] - x, center(tile)[1] - z) >= 1500);
const close = tile => { const [cx, cz] = center(tile); return { position: [cx + 120, tile.maxHeight + 160, cz - 160], target: [cx, tile.maxHeight / 2, cz], projection: 'perspective', fov: 35, zoom: 1 }; };
const home = { position: [4400, 3000, -2300], target: [2000, 0, 2000], projection: 'perspective', fov: 50, zoom: 1 };
const overview = { position: [4400, 6000, -4300], target: [2000, 0, 2000], projection: 'perspective', fov: 70, zoom: 1 };
const route = [
    { id: 'overview', view: overview },
    { id: 'approach-a', view: close(details[0]), travelFrames: 30 },
    { id: 'approach-b', view: close(other), travelFrames: 30 },
    { id: 'perspective-wide', view: { position: [x + 3000, details[0].maxHeight + 4000, z - 4000], target: [x, 0, z], projection: 'perspective', fov: 100, zoom: 1 } },
    { id: 'perspective-in', view: { fov: 5 } },
    { id: 'perspective-out', view: { fov: 100 } },
    { id: 'orthographic-wide', view: { position: [x, 5000, z - 1], target: [x, 0, z], projection: 'orthographic', orthoHeight: 12000, zoom: 1 } },
    { id: 'orthographic-in', view: { zoom: 70 } },
    { id: 'orthographic-material-close', view: { orthoHeight: 2000, zoom: 100 } },
    { id: 'orthographic-out', view: { orthoHeight: 12000, zoom: 1 } },
    { id: 'return-overview', view: overview }
];
test.use({ viewport, deviceScaleFactor: 1, video: 'off', trace: 'off' });

function statistics(values) {
    if (!values.length) return null;
    const sorted = values.slice().sort((a, b) => a - b), at = fraction => sorted[Math.max(0, Math.ceil(sorted.length * fraction) - 1)];
    const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
    return { count: values.length, median: sorted.length % 2 ? sorted[(sorted.length - 1) / 2] : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2,
        p95: at(.95), mean, min: sorted[0], max: sorted.at(-1) };
}

function unpack(values, columns) {
    const records = [];
    for (let offset = 0; offset < values.length; offset += columns.length) records.push(Object.fromEntries(columns.map((name, index) => [name, values[offset + index]])));
    return records;
}

// AI 596 D5/D6: the render-only surround (a second stream beside the authoritative one) settles like the other streams; absent or off it reports settled
const surroundSettled = state => !state?.surround || (state.surround.settled && (state.surround.pending ?? 0) === 0);

function compact(state) {
    const { streaming, appearance: surface, budget, surround } = state;
    return { revision: state.revision, camera: state.camera, canvas: state.canvas, frameIndex: state.frameIndex, loadTiming: state.loadTiming,
        budget: { cpuBytes: budget.cpuBytes, gpuBytes: budget.gpuBytes, peakCpuBytes: budget.peakCpuBytes, peakGpuBytes: budget.peakGpuBytes, limits: budget.limits, denied: budget.denied },
        sourceBytes: state.sourceBytes, renderer: state.renderer, peakUploadedBytesPerFrame: state.peakUploadedBytesPerFrame,
        streaming: { ...streaming, budget: undefined }, appearance: surface,
        planning: { ready: state.planning.ready, cpuBytes: state.planning.cpuBytes, gpuBytes: state.planning.gpuBytes, errors: state.planning.errors },
        surround: surround ? { mode: surround.mode, status: surround.status, reason: surround.reason ?? null, revision: surround.revision ?? null, settled: surround.settled, pending: surround.pending ?? 0,
            tiles: surround.tiles, residentByLevel: surround.residentByLevel, triangles: surround.triangles ?? 0, targetMet: surround.targetMet ?? null, degradationReason: surround.degradationReason ?? null,
            loadMs: surround.loadMs ?? null, programCompile: surround.programCompile ?? null, share: surround.share ? { cpuBytes: surround.share.cpuBytes, gpuBytes: surround.share.gpuBytes,
                peakCpuBytes: surround.share.peakCpuBytes, peakGpuBytes: surround.share.peakGpuBytes, limits: surround.share.limits, denied: surround.share.denied } : null } : null,
        mode: state.mode, helpers: state.helpers, water: state.water };
}

function assertBounded(state) {
    expect(state.revision).toBe(manifest.revision);
    expect(state.lastError).toBeNull();
    expect(state.mode).toBe('shaded');
    expect(state.helpers).toEqual({ grid: false, axes: false });
    expect(state.canvas.width).toBe(viewport.width);
    expect(state.canvas.height).toBeGreaterThanOrEqual(viewport.height - 48);
    expect(state.canvas.height).toBeLessThanOrEqual(viewport.height);
    expect(state.budget.cpuBytes).toBeLessThanOrEqual(state.budget.limits.cpuBytes);
    expect(state.budget.gpuBytes).toBeLessThanOrEqual(state.budget.limits.gpuBytes);
    expect(state.budget.peakCpuBytes).toBeLessThanOrEqual(state.budget.limits.cpuBytes);
    expect(state.budget.peakGpuBytes).toBeLessThanOrEqual(state.budget.limits.gpuBytes);
    expect(state.peakUploadedBytesPerFrame).toBeLessThanOrEqual(8 * MiB);
    expect(state.streaming.errors).toEqual([]); expect(state.appearance.errors).toEqual([]); expect(state.planning.errors).toEqual([]);
    expect(state.streaming.residentLeafIds.reduce((sum, id) => sum + 4 ** -manifest.chunks.find(chunk => chunk.id === id).level, 0)).toBe(1);
    if (!state.streaming.targetMet) expect(state.streaming.degradationReason).toBeTruthy();
}

async function settled(page) {
    await page.waitForFunction(() => {
        const state = window.__landscapeTestHooks?.snapshot();
        if (state?.lastError) throw new Error(state.lastError);
        const surroundSettled = !state?.surround || (state.surround.settled && (state.surround.pending ?? 0) === 0);
        return state?.ready && state.loadTiming.firstCoveredFrameAtMs !== null && state.streaming.settled && state.appearance?.settled && state.planning.ready && state.planning.settled && surroundSettled;
    }, null, { timeout: 60000 });
    return page.evaluate(() => ({ state: window.__landscapeTestHooks.snapshot(), atMs: performance.now(), timeOrigin: performance.timeOrigin }));
}

function networkRecorder(page, baseURL) {
    let phase = 'setup';
    const records = [], requests = new Map(), jobs = new Set(), identities = new Map();
    const add = (channel, kind, id, parent = sourcePath) => {
        const key = new URL(channel.url, new URL(parent, baseURL)).pathname;
        const record = identities.get(key) ?? { kind, byteLength: channel.byteLength, chunkIds: [] };
        if (id) record.chunkIds.push(id); identities.set(key, record);
    };
    for (const chunk of manifest.chunks) { add(chunk.channels.height, 'height', chunk.id); add(chunk.channels.landCover, 'cover', chunk.id); }
    for (const material of appearance.materials) for (const tier of material.tiers) for (const channel of Object.values(tier.channels)) add(channel, 'material', null, `${servedPrefix}appearance/manifest.json`);
    page.on('request', request => {
        const url = new URL(request.url());
        if (!url.pathname.startsWith(servedPrefix)) return;
        const identity = identities.get(url.pathname);
        const record = { phase, path: url.pathname, kind: identity?.kind ?? (url.pathname.includes('/source/') ? 'reference' : 'metadata'),
            chunkIds: identity?.chunkIds ?? [], declaredPayloadBytes: identity?.byteLength ?? 0, status: 'pending' };
        records.push(record); requests.set(request, record);
    });
    page.on('requestfinished', request => {
        const record = requests.get(request); if (!record) return;
        const job = (async () => {
            try {
                const response = await request.response();
                Object.assign(record, { status: response.status(), cacheControl: response.headers()['cache-control'] ?? null,
                    fromServiceWorker: response.fromServiceWorker(), sizes: await request.sizes(), startedAtEpochMs: request.timing().startTime });
            } catch (error) { record.measurementError = error.message; }
        })();
        jobs.add(job); job.finally(() => jobs.delete(job));
    });
    page.on('requestfailed', request => { const record = requests.get(request); if (record) Object.assign(record, { status: 'failed', failure: request.failure()?.errorText }); });
    return { records, setPhase: value => { phase = value; }, flush: () => Promise.allSettled([...jobs]) };
}

function networkTotals(records) {
    const payloads = records.filter(record => record.declaredPayloadBytes > 0), completed = payloads.filter(record => record.status === 200);
    const unique = new Map(completed.map(record => [record.path, record.declaredPayloadBytes]));
    return { requests: records.length, payloadRequests: payloads.length, completedPayloads: completed.length,
        logicalPayloadBytes: completed.reduce((sum, record) => sum + record.declaredPayloadBytes, 0), uniquePayloadBytes: [...unique.values()].reduce((sum, bytes) => sum + bytes, 0),
        encodedPayloadResponseBodyBytes: completed.reduce((sum, record) => sum + (record.sizes?.responseBodySize ?? 0), 0),
        unmeasuredResponseSizes: completed.filter(record => !record.sizes).length,
        nativeHeightPayloads: new Set(completed.filter(record => record.kind === 'height' && record.chunkIds.some(id => id.startsWith(`l${manifest.grid.maxLevel}/`))).map(record => record.path)).size,
        failedPayloadRequests: payloads.filter(record => record.status === 'failed').length,
        cacheControl: [...new Set(completed.map(record => record.cacheControl))],
        cacheHitStatus: 'not measured: page and dedicated-worker cache hits are not inferred from timing; policy and response sizes are recorded' };
}

async function measureStop(page, stop) {
    return page.evaluate(async ({ stop, warmupFrames, sampleFrames }) => {
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
        const surroundSettled = () => !state.surround || (state.surround.settled && (state.surround.pending ?? 0) === 0);
        do {
            for (let index = 0; index < 6; index++) await wait();
            state = hooks.snapshot();
            if (state.lastError) throw new Error(state.lastError);
            stable = state.streaming.settled && state.appearance.settled && state.planning.settled && surroundSettled() ? stable + 1 : 0;
            if (performance.now() - began > 60000) throw new Error(`Benchmark detail did not settle at ${stop.id}`);
        } while (stable < 2);
        const settledAtMs = performance.now();
        for (let index = 0; index < warmupFrames; index++) await wait();
        const sampleStartMs = performance.now();
        for (let index = 0; index < sampleFrames; index++) await wait();
        const sampleEndMs = performance.now();
        for (let index = 0; index < 4; index++) await wait();
        const result = hooks.endPerformanceCapture();
        return { state: hooks.snapshot(), capture: result, travelMs: cameraAppliedAtMs - began, settledAfterCameraMs: settledAtMs - cameraAppliedAtMs,
            sampleStartElapsedMs: sampleStartMs - capture.startedAtMs, sampleEndElapsedMs: sampleEndMs - capture.startedAtMs };
    }, { stop, warmupFrames, sampleFrames });
}

function summarizeMeasurement(measured) {
    const frames = unpack(measured.capture.frames, measured.capture.columns), gpu = unpack(measured.capture.gpu, measured.capture.gpuColumns);
    const transitioning = frames.slice(0, Math.max(0, frames.length - warmupFrames - sampleFrames - 4));
    const transitionSubmissions = new Set(transitioning.map(frame => frame.gpuSubmission));
    const transitionGpu = gpu.filter(sample => transitionSubmissions.has(sample.submission)).map(sample => sample.ms);
    const sampled = frames.filter(frame => frame.elapsedMs >= measured.sampleStartElapsedMs && frame.elapsedMs <= measured.sampleEndElapsedMs);
    const submissions = new Set(sampled.map(frame => frame.gpuSubmission));
    const gpuValues = gpu.filter(sample => submissions.has(sample.submission)).map(sample => sample.ms);
    const frameMs = statistics(sampled.map(frame => frame.intervalMs));
    const gpuResult = gpuValues.length ? { status: 'measured', ...statistics(gpuValues) }
        : { status: 'not measured', reason: measured.capture.finalGpu.disabledReason ?? 'No completed GPU timer queries matched this sampling window' };
    const detailMet = measured.state.streaming.targetMet && !measured.state.appearance.degradationReason;
    return { sampleCount: sampled.length, frameMs, fps: 1000 / frameMs.mean, cpuFrameMs: statistics(sampled.map(frame => frame.cpuFrameMs)),
        geometryStreamingMs: statistics(sampled.map(frame => frame.geometryStreamingMs)), appearanceStreamingMs: statistics(sampled.map(frame => frame.appearanceStreamingMs)),
        gpuMs: gpuResult, gpuPendingAtEnd: measured.capture.finalGpu.pendingQueryCount, gpuDisjointCount: measured.capture.finalGpu.disjointCount,
        drawCalls: statistics(sampled.map(frame => frame.drawCalls)), triangles: statistics(sampled.map(frame => frame.triangles)),
        travelMs: measured.travelMs, settledAfterCameraMs: measured.settledAfterCameraMs,
        requestedDetailMs: detailMet ? measured.settledAfterCameraMs : null,
        requestedDetailStatus: detailMet ? 'reached' : `settled with ${measured.state.streaming.degradationReason ?? measured.state.appearance.degradationReason}`,
        uploadedBytes: frames.reduce((sum, frame) => sum + frame.uploadedBytes, 0), peakUploadedBytesPerFrame: Math.max(...frames.map(frame => frame.uploadedBytes)),
        transition: { window: 'travel/load/settle prefix; excludes final warmup, sample and query-tail frames',
            frameMs: statistics(transitioning.map(frame => frame.intervalMs)), cpuFrameMs: statistics(transitioning.map(frame => frame.cpuFrameMs)), gpuMs: statistics(transitionGpu) },
        captureCpuBytes: measured.capture.captureCpuBytes, sampledFrames: sampled, sampledGpuMs: gpuValues, transitionFrames: transitioning, transitionGpuMs: transitionGpu };
}

function comparisonMarkdown(report) {
    const number = value => Number.isFinite(value) ? value.toFixed(2) : 'not measured';
    const rows = report.runs.map(run => `| ${run.profile} | ${run.cacheState} | ${run.frameMs.count} | ${number(run.frameMs.median)} / ${number(run.frameMs.p95)} | ${number(run.fps)} | ${run.gpuMs ? number(run.gpuMs.median) + ' / ' + number(run.gpuMs.p95) : 'not measured'} | ${number(run.end.budget.cpuBytes / MiB)} / ${number(run.end.budget.peakCpuBytes / MiB)} | ${number(run.end.budget.gpuBytes / MiB)} / ${number(run.end.budget.peakGpuBytes / MiB)} | ${number(run.network.logicalPayloadBytes / MiB)} | ${number(run.startup.coarseFromLoadMs)} / ${number(run.startup.settledFromLoadMs)} |`);
    return `# Coastal landscape performance\n\nMeasured on ${report.createdAt}; ${report.hardware.cpuModel}; ${report.hardware.logicalCpus} logical CPUs; ${number(report.hardware.ramBytes / 1024 ** 3)} GiB RAM. Browser ${report.browserVersion}.\n\n${report.metadata?.renderer?.renderer ?? 'GPU metadata unavailable'}. 1920 × 1080, DPR 1; drawing buffer ${report.metadata?.renderer?.width} × ${report.metadata?.renderer?.height}. Shaded PBR, water on; wireframe, grid, axes, LOD, boundaries, and planning guides off.\n\n| Profile CPU/GPU MiB | Context/load | Sampled frames | Frame median / p95 ms | Mean FPS | GPU median / p95 ms | Controlled CPU current / lifetime peak MiB | Estimated GPU current / lifetime peak MiB | Logical payload I/O MiB | Coarse / settled startup ms |\n| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |\n${rows.join('\n')}\n| Full coastal resident reference | Not measured: no full-resident allocation is attempted; declared adapter geometry ${report.reference.exceedsShippedGpuLimit ? 'exceeds every profile GPU limit' : 'exceeds the historical and constrained GPU limits'} | — | not measured | not measured | not measured | not measured | not measured | not measured | not measured |\n\nEach measured route has ${route.length} stops, ${warmupFrames} discarded warm-up frames then ${sampleFrames} sampled frames per stop. Statistics pool equal-size settled windows; loading/travel frame statistics are separate under each stop and run's transition field. FPS = 1000 / mean measured frame interval. Timing is descriptive for this machine, with no portable FPS threshold.\n\nCold = fresh browser context and viewer. Warm = same context after one route, fine resources coarsened, then a viewer reload at the identical home pose; code/driver/OS caches may be warm. HTTP cache hits are not assumed: response Cache-Control and encoded body sizes are retained in network receipts.\n\nControlled CPU/GPU peaks are profile-lifetime high-water marks: warm includes the preceding cold run. They include worker/staging/transition reservations and the ${report.captureBytes} byte opt-in capture buffer. CPU excludes general JS/browser/driver heap; GPU values are allocation estimates, not VRAM measurements. GPU timing uses unique completed timer queries matched to sampled submissions; unavailable results remain not measured.\n\nSeparate analytic inventory (not measurements): native surface ${report.reference.nativeSurfaceTriangles.toLocaleString('en-US')} triangles; float32 XYZ plus uint32 triangle-list indices ${number(report.reference.xyzAndIndicesBytes / MiB)} MiB; all 64 current adapter native meshes including skirts/attributes ${number(report.reference.adapterNativeGeometryBytes / MiB)} MiB before textures, parents or temporary overlap. These estimates are not frame-time predictions.\n\nSee report.json for exact route, per-stop quality/degradation, resident tiles, triangles/draw calls, uploads, source/request bytes, startup fidelity assertions, browser settings and sampling metadata. Raw frames and request receipts are separate JSON artifacts.\n`;
}

test('Landscape D7: repeatable cold and warm coastal routes stay bounded under shipped, historical and constrained budgets', async ({ browser }, testInfo) => {
    test.setTimeout((coastalDefault ? 18 : 30) * 60 * 1000);
    const baseURL = String(testInfo.project.use.baseURL);
    expect(new URL(baseURL).port, 'Landscape verification uses port 8002').toBe('8002');
    await mkdir(artifacts, { recursive: true });
    const native = manifest.chunks.filter(chunk => chunk.level === manifest.grid.maxLevel);
    const reference = { status: 'not measured', reason: 'No unsafe full-resident coastal allocation is attempted',
        nativeSurfaceTriangles: 2 * (manifest.grid.columns - 1) * (manifest.grid.rows - 1),
        xyzAndIndicesBytes: manifest.grid.columns * manifest.grid.rows * 12 + 2 * (manifest.grid.columns - 1) * (manifest.grid.rows - 1) * 3 * 4,
        adapterNativeGeometryBytes: native.reduce((sum, chunk) => sum + estimateLandscapeMeshBuffers(chunk).geometryBytes, 0),
        nativeChannelBytes: native.reduce((sum, chunk) => sum + chunk.channels.height.byteLength + chunk.channels.landCover.byteLength, 0) };
    expect(reference.xyzAndIndicesBytes).toBeGreaterThan(64 * MiB);
    // since AI577 D4 the realism-first shipped GPU limit can hold native geometry alone; the reduced profiles must still force streaming
    reference.exceedsShippedGpuLimit = reference.adapterNativeGeometryBytes > profiles[0].gpuMiB * MiB;
    expect(reference.adapterNativeGeometryBytes).toBeGreaterThan(Math.max(...profiles.slice(1).map(profile => profile.gpuMiB)) * MiB);
    const report = { format: 'landscape-performance-report', schemaVersion: 1, complete: false, createdAt: new Date().toISOString(),
        browserVersion: browser.version(), hardware: { platform: os.platform(), release: os.release(), arch: os.arch(), cpuModel: os.cpus()[0]?.model, logicalCpus: os.cpus().length, ramBytes: os.totalmem() },
        dataset: { id: manifest.id, revision: manifest.revision, manifestSha256: createHash('sha256').update(sourceText).digest('hex'), sourceSha256: manifest.provenance.sourceSha256 ?? null,
            sourceDirectory: path.relative(process.cwd(), sourceDirectory).split(path.sep).join('/'), servedPrefix, provenanceKind: manifest.provenance.kind ?? null,
            columns: manifest.grid.columns, rows: manifest.grid.rows, spacingMeters: manifest.grid.spacingX, nativeTileCount: native.length },
        viewport: { ...viewport, dpr: 1 }, profiles, route, warmupFrames, sampleFrames, reference, runs: [], captureBytes: 0 };
    try {
        for (const profile of profiles) {
            const context = await browser.newContext({ baseURL, viewport, deviceScaleFactor: 1 });
            const page = await context.newPage(), errors = [], network = networkRecorder(page, baseURL);
            page.on('pageerror', error => errors.push(error.message));
            page.on('console', message => { if (message.type() === 'error' && /shader|webgl|program|THREE/i.test(message.text())) errors.push(message.text()); });
            const filename = `${profile.id}-${profile.cpuMiB}-${profile.gpuMiB}`;
            let previousEnd;
            try {
                for (const cacheState of ['cold', 'warm']) {
                    network.setPhase(`${cacheState}/${cacheState === 'warm' ? 'preparation' : 'startup'}`);
                    if (cacheState === 'cold') await page.goto(landscapeViewerUrl(`/screens/landscape_fabrication.html?landscapeCpuMiB=${profile.cpuMiB}&landscapeGpuMiB=${profile.gpuMiB}`));
                    else {
                        await page.evaluate(view => window.__landscapeTestHooks.setCamera(view), home);
                        await settled(page); network.setPhase(`${cacheState}/startup`);
                        await page.evaluate(() => window.__landscapeTestHooks.reload());
                    }
                    const boot = await settled(page); assertBounded(boot.state);
                    expect(boot.state.budget.limits).toEqual({ cpuBytes: profile.cpuMiB * MiB, gpuBytes: profile.gpuMiB * MiB });
                    const nativeSourcesAtSettle = boot.state.streaming.residentSourceIds.filter(id => id.startsWith(`l${manifest.grid.maxLevel}/`)).length;
                    if (coastalDefault) {
                        expect(boot.state.streaming.residentLeafIds).toEqual([manifest.overviewId]);
                        expect(nativeSourcesAtSettle).toBe(0);
                    }
                    await network.flush();
                    const startupRecords = network.records.filter(record => record.phase === `${cacheState}/startup`);
                    const startupNetwork = networkTotals(startupRecords);
                    expect(startupNetwork.nativeHeightPayloads).toBeLessThan(native.length);
                    // the AI 596 D3/D4 startup gate: no native height payload requested before the first covered frame (request timing against the page clock)
                    const firstFrameEpochMs = boot.timeOrigin + boot.state.loadTiming.firstCoveredFrameAtMs;
                    const nativeBeforeFirstFrame = startupRecords.filter(record => record.kind === 'height' && record.chunkIds.some(id => id.startsWith(`l${manifest.grid.maxLevel}/`)) && record.startedAtEpochMs !== undefined && record.startedAtEpochMs < firstFrameEpochMs);
                    if (!coastalDefault) expect(nativeBeforeFirstFrame, 'no native height payload is requested before the first covered frame').toHaveLength(0);
                    expect(boot.state.sourceBytes).toBeLessThan(reference.nativeChannelBytes);
                    const metadata = await page.evaluate(() => window.__landscapeTestHooks.performanceMetadata());
                    expect(metadata.viewport).toEqual({ ...viewport, dpr: 1 }); report.metadata ??= metadata;
                    const run = { profile: `${profile.cpuMiB}/${profile.gpuMiB}`, profileId: profile.id, cacheState, metadata,
                        startup: { coarseFromNavigationMs: cacheState === 'cold' ? boot.state.loadTiming.firstCoveredFrameAtMs : null,
                            coarseFromLoadMs: boot.state.loadTiming.firstCoveredFrameAtMs - boot.state.loadTiming.startedAtMs,
                            settledFromLoadMs: boot.atMs - boot.state.loadTiming.startedAtMs, network: startupNetwork, state: compact(boot.state) }, stops: [] };
                    report.runs.push(run);
                    const allFrames = [], allGpu = [], transitionFrames = [], transitionGpu = [];
                    for (const stop of route) {
                        network.setPhase(`${cacheState}/${stop.id}`);
                        const measured = await measureStop(page, stop); assertBounded(measured.state);
                        expect(measured.capture.droppedFrames).toBe(0); expect(measured.capture.droppedGpuSamples).toBe(0);
                        const summary = summarizeMeasurement(measured);
                        expect(summary.sampleCount).toBeGreaterThanOrEqual(sampleFrames - 1);
                        expect(summary.sampleCount).toBeLessThanOrEqual(sampleFrames + 1);
                        expect(summary.peakUploadedBytesPerFrame).toBeLessThanOrEqual(8 * MiB);
                        report.captureBytes = measured.capture.captureCpuBytes;
                        allFrames.push(...summary.sampledFrames); allGpu.push(...summary.sampledGpuMs);
                        transitionFrames.push(...summary.transitionFrames); transitionGpu.push(...summary.transitionGpuMs);
                        delete summary.sampledFrames; delete summary.sampledGpuMs; delete summary.transitionFrames; delete summary.transitionGpuMs;
                        run.stops.push({ id: stop.id, ...summary, state: compact(measured.state) });
                        await writeFile(path.join(artifacts, `${filename}-${cacheState}-${stop.id}-frames.json`), JSON.stringify(measured.capture));
                        if (cacheState === 'cold' && ['overview', 'approach-a', 'orthographic-material-close'].includes(stop.id)) await page.screenshot({ path: path.join(artifacts, `${filename}-${stop.id}.png`) });
                    }
                    const byId = Object.fromEntries(run.stops.map(stop => [stop.id, stop]));
                    for (const [wide, closeId] of [['perspective-wide', 'perspective-in'], ['orthographic-wide', 'orthographic-in']]) {
                        byId[closeId].state.camera.position.forEach((value, index) => expect(value).toBeCloseTo(byId[wide].state.camera.position[index], 9));
                        expect(byId[closeId].state.streaming.desiredLeafIds.length).toBeGreaterThanOrEqual(byId[wide].state.streaming.desiredLeafIds.length);
                    }
                    const end = await page.evaluate(() => window.__landscapeTestHooks.snapshot()); assertBounded(end);
                    run.endComparison = { residentLeafIds: end.streaming.residentLeafIds, rootOnly: end.streaming.residentLeafIds.length === 1 && end.streaming.residentLeafIds[0] === manifest.overviewId,
                        bootResidentLeafIds: boot.state.streaming.residentLeafIds, nativeSourcesAtSettle, nativeHeightPayloadsBeforeFirstFrame: nativeBeforeFirstFrame.length,
                        previousEnd: previousEnd ? { cpuBytesEqual: end.budget.cpuBytes === previousEnd.budget.cpuBytes, gpuBytesEqual: end.budget.gpuBytes === previousEnd.budget.gpuBytes,
                            rendererMemoryEqual: JSON.stringify(end.renderer.memory) === JSON.stringify(previousEnd.renderer.memory), cpuBytes: [previousEnd.budget.cpuBytes, end.budget.cpuBytes], gpuBytes: [previousEnd.budget.gpuBytes, end.budget.gpuBytes] } : null };
                    if (coastalDefault) {
                        expect(end.streaming.residentLeafIds).toEqual([manifest.overviewId]);
                        if (previousEnd) {
                            expect(end.budget.cpuBytes).toBe(previousEnd.budget.cpuBytes); expect(end.budget.gpuBytes).toBe(previousEnd.budget.gpuBytes);
                            expect(end.renderer.memory).toEqual(previousEnd.renderer.memory);
                        }
                    }
                    previousEnd = end; run.end = compact(end);
                    run.frameMs = statistics(allFrames.map(frame => frame.intervalMs)); run.fps = 1000 / run.frameMs.mean;
                    run.cpuFrameMs = statistics(allFrames.map(frame => frame.cpuFrameMs)); run.gpuMs = statistics(allGpu);
                    run.transition = { window: 'travel/load/settle prefix; excludes warmup, sample and query-tail frames', frameMs: statistics(transitionFrames.map(frame => frame.intervalMs)),
                        cpuFrameMs: statistics(transitionFrames.map(frame => frame.cpuFrameMs)), gpuMs: statistics(transitionGpu) };
                    run.triangles = statistics(allFrames.map(frame => frame.triangles)); run.drawCalls = statistics(allFrames.map(frame => frame.drawCalls));
                    run.uploadedBytes = run.stops.reduce((sum, stop) => sum + stop.uploadedBytes, 0);
                    await network.flush();
                    run.preparationNetwork = networkTotals(network.records.filter(record => record.phase === `${cacheState}/preparation`));
                    run.network = networkTotals(network.records.filter(record => record.phase.startsWith(`${cacheState}/`) && record.phase !== `${cacheState}/preparation`));
                    expect(run.network.unmeasuredResponseSizes).toBe(0);
                    console.log(`Landscape benchmark ${run.profile} ${cacheState}: ${run.frameMs.count} frames, median ${run.frameMs.median.toFixed(2)} ms, p95 ${run.frameMs.p95.toFixed(2)} ms, ${run.fps.toFixed(1)} FPS, peak CPU/GPU ${(end.budget.peakCpuBytes / MiB).toFixed(2)}/${(end.budget.peakGpuBytes / MiB).toFixed(2)} MiB`);
                }
                expect(errors).toEqual([]);
            } finally {
                try { await page.evaluate(() => window.__landscapeTestHooks?.dispose()); } catch (error) { errors.push(`cleanup: ${error.message}`); }
                try {
                    const disposed = await page.evaluate(() => window.__landscapeTestHooks?.snapshot());
                    expect(disposed?.budget.cpuBytes).toBe(0); expect(disposed?.budget.gpuBytes).toBe(0);
                    await network.flush(); await writeFile(path.join(artifacts, `${filename}-network.json`), JSON.stringify({ records: network.records, disposed, errors }, null, 2));
                } finally { await context.close(); }
            }
        }
        report.complete = true;
    } finally {
        await writeFile(path.join(artifacts, 'report.json'), JSON.stringify(report, null, 2));
        if (report.runs.every(run => run.frameMs && run.end)) await writeFile(path.join(artifacts, 'comparison.md'), comparisonMarkdown(report));
    }
});
