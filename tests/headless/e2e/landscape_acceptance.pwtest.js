// AI577 D7 integrated acceptance of a saved, editable copy of the coastal landscape: a scripted journey, edits, delayed/corrupt requests and low budgets.
// One isolated fixture server serves a copy of the published landscape (terrain, appearance, companion, fields and planning sources), so the authoring
// API can edit it while the shared published assets stay untouched. Stability is judged on settled frames: a repeated visit, a pause, a source or page
// reload and an edit followed by its revert must reproduce the first frame within the capture noise (mean and outlier bytes below), the ledger must
// stay inside the shipped profile of the run's surface cache mode without a single denial, and camera paths may not pop (a frame-to-frame change far
// above its neighbors'). The D4 temporal metrics (popping ratio and temporal Laplacian of luminance on its four camera paths) are recorded beside
// the AI577 D6 measurements of the same paths. Runs once per LANDSCAPE_TEST_SURFACE_CACHE mode; the viewer reports which mode actually ran.
import { test, expect } from '@playwright/test';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createLandscapeServer } from '../../../tools/landscape_server/Server.mjs';
import { decodePng } from '../../../tools/reference_image_inspector/png.mjs';
import { copyLandscapePlanningSources } from '../../shared/landscape_fixture_files.js';
import { landscapeViewerUrl } from '../../shared/landscape_viewer_url.js';
import { LANDSCAPE_STREAMING_BUDGETS } from '../../../src/app/landscape/LandscapeResidencyBudget.js';

const root = path.resolve('.'), source = path.join(root, 'assets/public/landscape/coastal-city');
const artifacts = path.resolve(process.env.LANDSCAPE_ACCEPTANCE_EVIDENCE ?? 'tests/artifacts/screens/landscape/ai577/d7/acceptance', `cache-${process.env.LANDSCAPE_TEST_SURFACE_CACHE || 'default'}`);
const viewport = { width: 1920, height: 1080 }, MiB = 1024 * 1024;
// settled-frame noise: identical inputs reproduce frames to within these bytes (measured revisits: mean 0-0.012, no pixel above 16)
const NOISE = { meanBytes: .25, outlierBytes: 16, outlierFraction: .0005 };
// capacity limits are explicit by design (mask and fine-page slots); budget, request or failure reasons are not acceptable in a healthy run
const CAPACITY_REASONS = [null, 'appearance-mask-capacity', 'surface-detail-capacity', 'surface-detail-native-capacity'];
// the shared PBR availability probe of PbrAssetsRuntime asks for raw PBR files that the landscape server deliberately does not serve
const PBR_PROBES = ['/assets/public/pbr/_manifest.json', '/assets/public/pbr/red_brick/basecolor.jpg'];
// AI577 D6 cache-final temporal report (512/448 MiB, cache off / on): popping ratio of the four D4 paths
const D6_POP_RATIO = { dolly: [1.007, 1.010], fov: [1.527, 1.534], ortho: [1.179, 1.218], pan: [1.008, 1.011] };
const LOCAL_POP_LIMIT = 1.35;
const anchor = { x: 1071.2890625, z: 914.0625 };
const beach = { x: 1015, z: 860 };
test.use({ viewport, deviceScaleFactor: 1, trace: 'off', video: 'off' });

let server, origin, directory, failed = false;

test.beforeAll(async () => {
    await mkdir(artifacts, { recursive: true });
    directory = await mkdtemp(path.join(artifacts, 'coastal-run-'));
    for (const entry of ['manifest.json', 'payloads', 'appearance', 'fields']) await cp(path.join(source, entry), path.join(directory, entry), { recursive: true });
    await copyLandscapePlanningSources(JSON.parse(await readFile(path.join(source, 'manifest.json'), 'utf8')), source, directory);
    server = createLandscapeServer({ root, landscapeDirectory: directory });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    origin = `http://127.0.0.1:${server.address().port}`;
});

test.afterEach(async ({}, testInfo) => { if (testInfo.status !== testInfo.expectedStatus) failed = true; });

test.afterAll(async () => {
    if (server) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
    // a passing run keeps the saved manifests it published; the copied stores duplicate the published assets byte for byte
    if (directory && !failed) for (const entry of ['payloads', 'appearance', 'fields', 'source']) await rm(path.join(directory, entry), { recursive: true, force: true });
});

const savedManifest = async () => JSON.parse(await readFile(path.join(directory, 'manifest.json'), 'utf8'));
const snapshot = page => page.evaluate(() => window.__landscapeTestHooks.snapshot());
const frames = (page, count = 2) => page.evaluate(count => new Promise(resolve => { let left = count; const step = () => (--left <= 0 ? resolve() : requestAnimationFrame(step)); requestAnimationFrame(step); }), count);

// page errors, every console error or warning except the two PBR availability probes, failed requests and the viewers' workers
async function observe(context) {
    const log = { errors: [], warnings: [], failedRequests: [], probes: [] };
    await context.addInitScript(() => {
        const workers = window.__landscapeWorkers = { created: 0, terminated: 0, live: 0 };
        const Base = window.Worker;
        window.Worker = class extends Base {
            constructor(...args) { super(...args); workers.created++; workers.live++; this.__live = true; }
            terminate() { if (this.__live) { this.__live = false; workers.terminated++; workers.live--; } return super.terminate(); }
        };
    });
    context.on('page', page => watch(page, log));
    return log;
}

function watch(page, log) {
    page.on('pageerror', error => log.errors.push(`pageerror: ${error.message}`));
    page.on('console', message => {
        if (!['error', 'warning'].includes(message.type())) return;
        const url = message.location()?.url ?? '';
        if (message.type() === 'error' && /status of 404/.test(message.text()) && PBR_PROBES.some(probe => url.endsWith(probe))) { log.probes.push(url); return; }
        (message.type() === 'error' ? log.errors : log.warnings).push(`${message.text()} @ ${url}`);
    });
    page.on('requestfailed', request => { if (!/ERR_ABORTED/.test(request.failure()?.errorText ?? '')) log.failedRequests.push(`${request.url()}: ${request.failure()?.errorText}`); });
}

async function open(page, query = '') {
    await page.goto(landscapeViewerUrl(`${origin}/screens/landscape_fabrication.html${query}`));
    await page.waitForFunction(() => window.__landscapeTestHooks?.snapshot().ready || window.__landscapeTestHooks?.snapshot().lastError, null, { timeout: 120000 });
    expect((await snapshot(page)).lastError).toBeNull();
    await hideInterface(page);
}

// panels and the live performance bar would change every frame, so captures show the canvas alone; the resize settles before the journey (a surface
// cache sizes itself to the drawing buffer once its size has been stable for a moment)
async function hideInterface(page) {
    await page.evaluate(() => { document.body.classList.add('perf-bar-hidden'); document.querySelectorAll('.landscape-ui, .ui-perf-bar').forEach(element => element.classList.add('hidden')); window.dispatchEvent(new Event('resize')); });
    await page.waitForTimeout(800);
    await settle(page, 'opened viewer');
}

async function settle(page, label, timeout = 150000) {
    const started = Date.now();
    let stable = 0, state;
    while (stable < 2) {
        await page.waitForTimeout(150);
        state = await snapshot(page);
        if (state.lastError) throw new Error(`${label}: ${state.lastError}`);
        stable = state.ready && state.streaming?.settled && state.appearance?.settled && state.planning?.settled && !state.terrainProgramVariant?.pending ? stable + 1 : 0;
        if (Date.now() - started > timeout) throw new Error(`${label} did not settle: ${JSON.stringify(unsettled(state))}`);
    }
    return { state, settleMs: Date.now() - started };
}

// what keeps a view from settling: pending geometry and appearance work, their transitions and missing work
function unsettled(state) {
    const stream = state.streaming, appearance = state.appearance;
    return { frameIndex: state.frameIndex, lastError: state.lastError, program: state.terrainProgramVariant?.pending ?? null, planning: state.planning?.settled ?? null,
        streaming: stream && { settled: stream.settled, pending: stream.pending, queued: stream.queueDepth, transition: stream.transition, degradation: stream.degradationReason, errors: stream.errors.length },
        appearance: appearance && { settled: appearance.settled, pending: appearance.pending, queued: appearance.queueDepth, masks: `${appearance.residentMaskIds.length}/${appearance.desiredMaskIds.length}`,
            materialTransition: !!appearance.materialTransition, errors: appearance.errors.length, degradation: appearance.degradationReason,
            fields: { settled: appearance.terrainFields.settled, pending: appearance.terrainFields.pending, missing: appearance.terrainFields.missingWork },
            detail: { pending: appearance.detail.pending, missing: appearance.detail.missingWork, transitioning: appearance.detail.transitioning },
            cache: { status: appearance.surfaceCache.status, settled: appearance.surfaceCache.settled, missing: appearance.surfaceCache.pages?.missing ?? null } } };
}

// the shipped profile: the uncached LANDSCAPE_STREAMING_BUDGETS, or with the surface cache on the viewer's own cache profile (it sizes it to the display),
// which must leave the streams their uncached share
let shippedProfile = null;
function shippedLimits(state) {
    if (state.surfaceCache !== 'on') return { cpuBytes: LANDSCAPE_STREAMING_BUDGETS.cpuBytes, gpuBytes: LANDSCAPE_STREAMING_BUDGETS.gpuBytes };
    shippedProfile ??= { ...state.budget.limits };
    expect(shippedProfile.cpuBytes).toBeGreaterThanOrEqual(LANDSCAPE_STREAMING_BUDGETS.cpuBytes);
    expect(shippedProfile.gpuBytes).toBeGreaterThan(LANDSCAPE_STREAMING_BUDGETS.gpuBytes);
    return shippedProfile;
}

function assertHealthy(state, label, { fields = 'active', presentation = 'active' } = {}) {
    const budget = state.budget;
    expect(budget.limits, `${label}: the shipped profile of the ${state.surfaceCache} cache mode`).toEqual(shippedLimits(state));
    for (const key of ['cpuBytes', 'gpuBytes']) {
        expect(budget[key], `${label} ${key}`).toBeLessThanOrEqual(budget.limits[key]);
        expect(budget[`peak${key[0].toUpperCase()}${key.slice(1)}`], `${label} peak ${key}`).toBeLessThanOrEqual(budget.limits[key]);
    }
    expect(budget.denied, `${label}: no ledger denial at the shipped profile`).toBe(0);
    expect(state.peakUploadedBytesPerFrame, `${label} uploads`).toBeLessThanOrEqual(8 * MiB);
    expect([state.streaming.errors, state.appearance.errors, state.planning.errors], `${label} errors`).toEqual([[], [], []]);
    expect(state.streaming.degradationReason, `${label}: geometry meets its target`).toBeNull();
    expect(CAPACITY_REASONS, `${label}: appearance degradation ${state.appearance.degradationReason}`).toContain(state.appearance.degradationReason);
    expect(state.lighting.status, `${label} lighting`).toBe('ready');
    expect(state.appearance.terrainFields.status, `${label} terrain fields`).toBe(fields);
    expect(state.appearance.terrainFields.appearanceLayerState.status, `${label} terrain appearance layer`).toBe('resident');
    expect([state.appearance.presentation.status, state.appearance.presentation.policy], `${label} natural presentation`).toEqual([presentation, 'natural-terrain-inference-v1']);
    expect(state.appearance.multiscale.status, `${label} multiscale companion`).toBe('active');
    if (state.surfaceCache === 'on') {
        expect(state.appearance.surfaceCache, `${label} surface cache`).toMatchObject({ status: 'active', ready: true, frameReady: true, settled: true });
        expect(state.appearance.surfaceCache.pages.missing, `${label} cache pages`).toBe(0);
    } else expect(state.appearance.surfaceCache.status, `${label} surface cache`).toBe('off');
}

function summary(state, settleMs) {
    const cache = state.appearance.surfaceCache;
    return { revision: state.revision, settleMs, camera: state.camera, frameIndex: state.frameIndex,
        budget: { cpuBytes: state.budget.cpuBytes, gpuBytes: state.budget.gpuBytes, peakCpuBytes: state.budget.peakCpuBytes, peakGpuBytes: state.budget.peakGpuBytes, denied: state.budget.denied, limits: state.budget.limits },
        geometry: { leaves: state.streaming.residentLeafIds.length, lods: [...new Set(state.streaming.lods.map(lod => lod.level))], achievedErrorPixels: state.streaming.achievedErrorPixels, targetMet: state.streaming.targetMet },
        appearance: { masks: state.appearance.residentMaskIds.length, materials: state.appearance.materials.map(material => `${material.soilId}:${material.resolution}${material.micro?.shown ? '+micro' : ''}`),
            detail: state.appearance.detail.residentIds?.length ?? 0, degradation: state.appearance.degradationReason, multiscale: state.appearance.multiscale.status,
            fields: { status: state.appearance.terrainFields.status, resident: state.appearance.terrainFields.residentPages.length, stale: state.appearance.terrainFields.staleChunks },
            presentation: { status: state.appearance.presentation.status, natives: state.appearance.presentation.natives } },
        cache: cache.status === 'off' ? { status: 'off' } : { status: cache.status, resident: cache.pages?.resident, missing: cache.pages?.missing, limited: cache.demand?.limited ?? null },
        renderer: { calls: state.renderer.calls, triangles: state.renderer.triangles }, peakUploadedBytesPerFrame: state.peakUploadedBytesPerFrame };
}

// mean absolute sRGB byte difference of two captures and the share of pixels whose mean channel difference exceeds the outlier level, inside or outside an
// optional pixel rectangle
function difference(a, b, { rect = null, inside = true } = {}) {
    const x = decodePng(a), y = decodePng(b);
    expect([x.width, x.height]).toEqual([y.width, y.height]);
    let sum = 0, count = 0, outliers = 0, max = 0;
    for (let row = 0; row < x.height; row++) for (let column = 0; column < x.width; column++) {
        if (rect && (column >= rect.minX && column <= rect.maxX && row >= rect.minY && row <= rect.maxY) !== inside) continue;
        const i = (row * x.width + column) * 4;
        const d = (Math.abs(x.data[i] - y.data[i]) + Math.abs(x.data[i + 1] - y.data[i + 1]) + Math.abs(x.data[i + 2] - y.data[i + 2])) / 3;
        sum += d; count++; max = Math.max(max, d); if (d > NOISE.outlierBytes) outliers++;
    }
    return { meanBytes: sum / Math.max(1, count), outlierFraction: outliers / Math.max(1, count), maxBytes: max, pixels: count };
}

function expectWithinNoise(result, label) {
    expect(result.meanBytes, `${label}: mean byte difference ${JSON.stringify(result)}`).toBeLessThanOrEqual(NOISE.meanBytes);
    expect(result.outlierFraction, `${label}: pixels beyond ${NOISE.outlierBytes} bytes ${JSON.stringify(result)}`).toBeLessThanOrEqual(NOISE.outlierFraction);
}

async function capture(page, name) {
    const png = await page.screenshot();
    await writeFile(path.join(artifacts, `${name}.png`), png);
    return png;
}

async function groundHeight(request, x, z) {
    const manifest = await savedManifest();
    const response = await request.post(`${origin}/api/landscape/query`, { data: { x, z, selectionId: `d7-height-${x}-${z}`, expectedRevision: manifest.revision } });
    const result = await response.json();
    expect(response.ok(), JSON.stringify(result)).toBe(true);
    return result.sample.height;
}

// the journey: game POV, FOV changes, the shoreline, steep ground, orthographic zoom, a native page corner, the planning infill and the distant overview
async function journeyStops(request) {
    // the authoring store answers one native query at a time
    const heights = [];
    for (const [x, z] of [[anchor.x + 2, anchor.z + 16], [beach.x, beach.z], [1102, 1445], [1070, 1352], [1242, 2900], [1398, 3445], [1261.71875, 2773.4375], [1030, 930],
        [1000, 1000], [2050, 2100], [1100, 1000], [2000, 2000]]) heights.push(await groundHeight(request, x, z));
    const [ha, hb, hs, hn, hl, hc, hr, hq, hp, hu, hm, hz] = heights;
    const perspective = (position, target, fov = 55) => ({ position, target, projection: 'perspective', fov, zoom: 1 });
    const top = (x, y, z, orthoHeight, { zoom = 1, above = 150 } = {}) => ({ position: [x, y + above, z - .001], target: [x, y, z], projection: 'orthographic', orthoHeight, zoom });
    const beachEye = (fov) => perspective([beach.x, hb + 4.5, beach.z], [1018, hb, 920], fov);
    return [
        { id: 'game-pov', approach: perspective([anchor.x - 10, ha + 4.5, anchor.z - 26], [anchor.x + 2, ha, anchor.z + 16]), pov: true },
        { id: 'beach-fov-55', view: beachEye(55) }, { id: 'beach-fov-20', view: beachEye(20) }, { id: 'beach-fov-8', view: beachEye(8) },
        { id: 'shore-oblique', view: perspective([1030, hs + 14, 1390], [1102, hs, 1445]) },
        { id: 'shore-near', view: perspective([1090, hn + 1.7, 1330], [1062, -.3, 1372]) },
        { id: 'coast-bluff', view: perspective([1150, hl + 22, 2850], [1242, hl, 2900]) },
        { id: 'rock-cliff', view: perspective([1365, hc + 14, 3395], [1398, hc, 3445]) },
        { id: 'steep-rock', view: perspective([1243, hr + 6, 2752], [1261.71875, hr, 2773.4375]) },
        { id: 'sand-ortho-200', view: top(1030, hq, 930, 200) }, { id: 'sand-ortho-60', view: top(1030, hq, 930, 60) }, { id: 'sand-ortho-20', view: top(1030, hq, 930, 20) },
        { id: 'sand-ortho-200-zoom-10', view: top(1030, hq, 930, 200, { zoom: 10 }) },
        { id: 'page-corner-top', view: top(1000, hp, 1000, 250), seams: { x: 1000, z: 1000, span: 250 } },
        { id: 'planning-infill-top', view: top(2050, hu, 2100, 700, { above: 400 }), planning: { x: 2050, z: 2100 } },
        { id: 'aerial-oblique', view: perspective([650, hm + 320, 480], [1160, hm, 1080]) },
        { id: 'overview-top', view: top(2000, hz, 2000, 4000, { above: 1500 }) }
    ];
}

// the D4 temporal camera paths (AI577 D4 tools/temporal.mjs, unchanged) and an oblique coastal travel at 4 m per frame
function temporalPaths(steps) {
    const y = 2.48;
    return {
        dolly: i => ({ position: [beach.x + .05 * i * .05, y + 4.5, beach.z + .05 * i], target: [1018 + .05 * i * .05, y, 920 + .05 * i], projection: 'perspective', fov: 55, zoom: 1 }),
        fov: i => ({ position: [beach.x, y + 4.5, beach.z], target: [1018, y, 920], projection: 'perspective', fov: 55 * (8 / 55) ** (i / (steps - 1)), zoom: 1 }),
        ortho: i => ({ position: [1030, 152.36, 929.999], target: [1030, 2.36, 930], projection: 'orthographic', orthoHeight: 200 * (20 / 200) ** (i / (steps - 1)), zoom: 1 }),
        pan: i => ({ position: [1011.29 + .08 * i, 61.45, 834.06], target: [1071.29 + .08 * i, 6.45, 914.06], projection: 'perspective', fov: 55, zoom: 1 }),
        'coast-travel': i => ({ position: [1000, 45, 980 + 4 * i], target: [1080, 2, 1130 + 4 * i], projection: 'perspective', fov: 55, zoom: 1 })
    };
}

async function goTo(page, stop) {
    if (!stop.pov) { await page.evaluate(view => window.__landscapeTestHooks.setCamera(view), stop.view); return; }
    await page.evaluate(view => window.__landscapeTestHooks.setCamera(view), stop.approach);
    await page.evaluate(() => window.__landscapeTestHooks.preset('pov'));
}

// popping: frame-to-frame mean luminance difference (every third pixel) against the median of its six neighbors on a constant-velocity path, plus the
// D4 metrics (global maximum over median, temporal Laplacian of every seventh pixel)
async function temporal(page, id, cameraPath, steps) {
    await page.evaluate(view => window.__landscapeTestHooks.setCamera(view), cameraPath(0));
    await settle(page, `${id} start`);
    const luminance = png => { const image = decodePng(png), out = new Float32Array(image.width * image.height); for (let i = 0; i < out.length; i++) out[i] = .2126 * image.data[i * 4] + .7152 * image.data[i * 4 + 1] + .0722 * image.data[i * 4 + 2]; return out; };
    const differences = [], laplacian = [];
    let previous = null, before = null;
    for (let i = 0; i < steps; i++) {
        await page.evaluate(async view => { window.__landscapeTestHooks.setCamera(view); await new Promise(resolve => requestAnimationFrame(resolve)); }, cameraPath(i));
        const png = await page.screenshot();
        if (i === 0 || i === steps - 1 || i === steps >> 1) await writeFile(path.join(artifacts, `temporal-${id}-${String(i).padStart(2, '0')}.png`), png);
        const current = luminance(png);
        if (previous) { let sum = 0, n = 0; for (let p = 0; p < current.length; p += 3) { sum += Math.abs(current[p] - previous[p]); n++; } differences.push(sum / n); }
        if (before) for (let p = 0; p < current.length; p += 7) laplacian.push(Math.abs(previous[p] - (before[p] + current[p]) / 2));
        before = previous; previous = current;
    }
    const median = values => { const sorted = [...values].sort((a, b) => a - b); return sorted[sorted.length >> 1]; };
    const local = differences.map((value, t) => value / Math.max(1e-6, median(differences.filter((_, k) => k !== t && Math.abs(k - t) <= 3))));
    const state = await snapshot(page);
    return { steps, differences, frameDifferenceMedian: median(differences), popRatio: Math.max(...differences) / Math.max(1e-6, median(differences)), localPopRatio: Math.max(...local),
        localPopFrame: local.indexOf(Math.max(...local)) + 1, laplacianMean: laplacian.reduce((sum, value) => sum + value, 0) / laplacian.length,
        laplacianP99: Float32Array.from(laplacian).sort()[Math.floor(laplacian.length * .99)], denied: state.budget.denied, peakUploadedBytesPerFrame: state.peakUploadedBytesPerFrame };
}

// screen rectangle of a world circle seen by a perspective camera (lookAt with +Y up), from authoritative ground heights on its rim
async function screenRect(request, camera, canvas, center, radius) {
    const [cx, cy, cz] = camera.position, [tx, ty, tz] = camera.target;
    const normalize = v => { const l = Math.hypot(...v); return v.map(value => value / l); };
    const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
    const forward = normalize([tx - cx, ty - cy, tz - cz]), right = normalize(cross(forward, [0, 1, 0])), up = cross(right, forward);
    const tangent = Math.tan(camera.fov * Math.PI / 360) / camera.zoom, aspect = canvas.width / canvas.height;
    const rect = { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity };
    for (let k = 0; k < 24; k++) {
        const x = center.x + radius * Math.cos(k * Math.PI / 12), z = center.z + radius * Math.sin(k * Math.PI / 12);
        const ground = await groundHeight(request, x, z);
        for (const y of [ground - 2, ground + 3]) {
            const d = [x - cx, y - cy, z - cz], depth = d[0] * forward[0] + d[1] * forward[1] + d[2] * forward[2];
            expect(depth, 'the edit lies in front of the camera').toBeGreaterThan(.5);
            const px = ((d[0] * right[0] + d[1] * right[1] + d[2] * right[2]) / (depth * tangent * aspect) + 1) / 2 * canvas.width;
            const py = (1 - (d[0] * up[0] + d[1] * up[1] + d[2] * up[2]) / (depth * tangent)) / 2 * canvas.height;
            rect.minX = Math.min(rect.minX, px); rect.maxX = Math.max(rect.maxX, px); rect.minY = Math.min(rect.minY, py); rect.maxY = Math.max(rect.maxY, py);
        }
    }
    return { minX: Math.floor(rect.minX), maxX: Math.ceil(rect.maxX), minY: Math.floor(rect.minY), maxY: Math.ceil(rect.maxY) };
}

// luminance step across a page border line against the steps inside, along both axes of a top-down capture centered on a page corner
function seamStep(png) {
    const image = decodePng(png), luma = i => .2126 * image.data[i * 4] + .7152 * image.data[i * 4 + 1] + .0722 * image.data[i * 4 + 2];
    const steps = (count, lines, at) => Array.from({ length: count - 1 }, (_, c) => { let sum = 0; for (let l = 0; l < lines; l++) sum += Math.abs(at(c + 1, l) - at(c, l)); return sum / lines; });
    const axis = (count, lines, at) => {
        const values = steps(count, lines, at), center = count / 2, border = Math.max(...values.slice(Math.floor(center) - 2, Math.ceil(center) + 1));
        const interior = values.filter((_, c) => Math.abs(c + 1 - center) >= 6), mean = interior.reduce((sum, value) => sum + value, 0) / interior.length;
        return { border, interiorMean: mean, interiorP99: [...interior].sort((a, b) => a - b)[Math.floor(interior.length * .99)], ratio: border / mean };
    };
    return { x: axis(image.width, image.height, (c, l) => luma(l * image.width + c)), z: axis(image.height, image.width, (c, l) => luma(c * image.width + l)) };
}

async function applyBatch(request, batch) {
    const response = await request.post(`${origin}/api/landscape/apply`, { data: batch, timeout: 120000 }), result = await response.json();
    expect(response.ok(), JSON.stringify(result)).toBe(true);
    return result;
}

async function revertBatch(request, revision) {
    const response = await request.post(`${origin}/api/landscape/revert`, { data: { expectedRevision: revision }, timeout: 120000 }), result = await response.json();
    expect(response.ok(), JSON.stringify(result)).toBe(true);
    return result;
}

async function reloadSource(page, revision, label) {
    await page.evaluate(() => window.__landscapeTestHooks.reload());
    await expect.poll(async () => (await snapshot(page)).revision, { timeout: 90000 }).toBe(revision);
    return settle(page, label);
}

test('Landscape AI577 D7 acceptance: a saved editable coast stays stable from game POV through travel, steep ground, shoreline and overview, FOV/zoom, pause, reload, revisits and edits', async ({ browser }) => {
    test.setTimeout(30 * 60 * 1000);
    const context = await browser.newContext({ viewport, deviceScaleFactor: 1 }), log = await observe(context), page = await context.newPage();
    const report = { createdAt: new Date().toISOString(), browser: browser.version(), noise: NOISE, laps: { 1: {}, 2: {} }, comparisons: {}, temporal: {}, pauses: {}, reloads: {}, edits: {} };
    try {
        await open(page);
        const initial = await snapshot(page);
        report.mode = { surfaceCache: initial.surfaceCache, requested: process.env.LANDSCAPE_TEST_SURFACE_CACHE ?? null, limits: initial.budget.limits };
        const stops = await journeyStops(page.request), captures = { 1: {}, 2: {} };
        const visit = async (stop, lap) => {
            await goTo(page, stop);
            const { state, settleMs } = await settle(page, `lap ${lap} ${stop.id}`);
            assertHealthy(state, `lap ${lap} ${stop.id}`);
            captures[lap][stop.id] = await capture(page, `lap${lap}-${stop.id}`);
            report.laps[lap][stop.id] = summary(state, settleMs);
            return state;
        };

        await test.step('lap 1: game POV, FOV changes, shoreline, steep ground, orthographic zoom, page corner, planning infill and distant overview', async () => {
            for (const stop of stops) {
                const state = await visit(stop, 1);
                if (stop.pov) {
                    expect(state.camera).toMatchObject({ projection: 'perspective', fov: 55, zoom: 1 });
                    expect(state.camera.position[1] - await groundHeight(page.request, state.camera.position[0], state.camera.position[2])).toBeCloseTo(4.5, 3);
                    report.povCamera = state.camera;
                }
                if (stop.planning) {
                    const sample = await page.evaluate(({ x, z }) => window.__landscapeTestHooks.appearanceSample(x, z), stop.planning);
                    expect([sample.soilId, sample.coverId >= 5], 'imported planning cover keeps its semantic soil').toEqual(['unknown', true]);
                    expect(['sand', 'loam', 'forest', 'rock', 'seabed']).toContain(sample.displaySoilId);
                    expect(state.appearance.presentation).toMatchObject({ natives: { total: 64, terrain: 64, overview: 0 }, inferredSpacingMeters: 1.953125 });
                    report.planningSample = sample;
                }
                if (stop.seams) report.seams = seamStep(captures[1][stop.id]);
            }
            // an orthographic zoom of 10 at a 200 m span is the 20 m span at zoom 1: the same projection, coverage and material demand
            report.comparisons['zoom-equivalence'] = difference(captures[1]['sand-ortho-200-zoom-10'], captures[1]['sand-ortho-20']);
            expectWithinNoise(report.comparisons['zoom-equivalence'], 'orthographic zoom 10 at 200 m against a 20 m span');
            for (const axis of ['x', 'z']) expect(report.seams[axis].ratio, `native page corner ${axis} border step ${JSON.stringify(report.seams[axis])}`).toBeLessThanOrEqual(2);
        });

        await test.step('camera paths: D4 dolly, FOV zoom, orthographic zoom and pan, and an oblique coastal travel without popping', async () => {
            const steps = 40, paths = temporalPaths(steps);
            for (const [id, path] of Object.entries(paths)) {
                const result = report.temporal[id] = await temporal(page, id, path, steps);
                expect(result.localPopRatio, `${id}: largest frame change over its neighbors ${JSON.stringify(result.differences.map(value => +value.toFixed(3)))}`).toBeLessThanOrEqual(LOCAL_POP_LIMIT);
                if (D6_POP_RATIO[id]) expect(result.popRatio, `${id}: D4 popping ratio against the D6 measurement ${D6_POP_RATIO[id]}`).toBeLessThanOrEqual(Math.max(...D6_POP_RATIO[id]) * 1.15);
                expect(result.denied, `${id}: no ledger denial in motion`).toBe(0);
                expect(result.peakUploadedBytesPerFrame).toBeLessThanOrEqual(8 * MiB);
            }
            assertHealthy((await settle(page, 'after camera paths')).state, 'after camera paths');
        });

        await test.step('lap 2: repeated visits, pauses and a source reload reproduce the first frames', async () => {
            for (const stop of stops) {
                if (stop.id === 'shore-oblique' || stop.id === 'aerial-oblique') {
                    // pause on the way, with streaming in flight: no frame renders while paused, and the resumed view settles to the first frame
                    await goTo(page, stop);
                    await frames(page, 2);
                    const viaHook = stop.id === 'shore-oblique';
                    const paused = await page.evaluate(viaHook => {
                        if (viaHook) window.__landscapeTestHooks.pause();
                        else { Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); document.dispatchEvent(new Event('visibilitychange')); }
                        const state = window.__landscapeTestHooks.snapshot();
                        return { frameIndex: state.frameIndex, streamingSettled: state.streaming.settled, appearanceSettled: state.appearance.settled };
                    }, viaHook);
                    await page.waitForTimeout(1500);
                    const held = (await snapshot(page)).frameIndex;
                    expect(held, `${stop.id}: no frame while paused`).toBe(paused.frameIndex);
                    await page.evaluate(viaHook => {
                        if (viaHook) window.__landscapeTestHooks.resume();
                        else { delete document.hidden; document.dispatchEvent(new Event('visibilitychange')); }
                    }, viaHook);
                    const { state, settleMs } = await settle(page, `lap 2 ${stop.id} resumed`);
                    expect(state.frameIndex).toBeGreaterThan(held);
                    assertHealthy(state, `lap 2 ${stop.id} resumed`);
                    captures[2][stop.id] = await capture(page, `lap2-${stop.id}`);
                    report.laps[2][stop.id] = summary(state, settleMs);
                    report.pauses[stop.id] = { via: viaHook ? 'hook' : 'visibilitychange', ...paused, heldFrameIndex: held };
                } else await visit(stop, 2);
                if (stop.id === 'coast-bluff') {
                    // a source reload keeps the camera and reproduces the frame
                    const before = await snapshot(page);
                    const { state } = await reloadSource(page, before.revision, 'coast-bluff source reload');
                    assertHealthy(state, 'coast-bluff source reload');
                    for (const field of ['position', 'target']) state.camera[field].forEach((value, index) => expect(value).toBeCloseTo(before.camera[field][index], 9));
                    report.reloads['source-coast-bluff'] = difference(await capture(page, 'reload-source-coast-bluff'), captures[1]['coast-bluff']);
                    expectWithinNoise(report.reloads['source-coast-bluff'], 'coast-bluff after a source reload');
                }
                report.comparisons[stop.id] = difference(captures[2][stop.id], captures[1][stop.id]);
                expectWithinNoise(report.comparisons[stop.id], `repeated visit ${stop.id}`);
            }
        });

        let pre;
        await test.step('page reload: the Game POV frame of a fresh viewer matches the first visit', async () => {
            await page.reload();
            await page.waitForFunction(() => window.__landscapeTestHooks?.snapshot().ready, null, { timeout: 120000 });
            await hideInterface(page);
            await page.evaluate(view => window.__landscapeTestHooks.setCamera(view), report.povCamera);
            const { state } = await settle(page, 'page reload game-pov');
            assertHealthy(state, 'page reload game-pov');
            pre = await capture(page, 'reload-page-game-pov');
            report.reloads['page-game-pov'] = difference(pre, captures[1]['game-pov']);
            expectWithinNoise(report.reloads['page-game-pov'], 'game-pov after a page reload');
        });

        await test.step('edits on the saved copy: a soil edit changes only its area, a height edit stales its native explicitly, and both reverts reproduce the frame', async () => {
            const camera = report.povCamera, heading = [camera.target[0] - camera.position[0], camera.target[2] - camera.position[2]], length = Math.hypot(...heading);
            const center = { x: camera.position[0] + heading[0] / length * 22, z: camera.position[2] + heading[1] / length * 22 };
            const soilRadius = 4, rect = await screenRect(page.request, camera, (await snapshot(page)).canvas, center, soilRadius + 9);
            report.edits.center = center;
            const original = await savedManifest(), nativeId = original.chunks.find(chunk => chunk.level === original.grid.maxLevel && center.x >= chunk.bounds.minX && center.x <= chunk.bounds.maxX
                && center.z >= chunk.bounds.minZ && center.z <= chunk.bounds.maxZ).id;
            const before = await page.evaluate(({ x, z }) => window.__landscapeTestHooks.appearanceSample(x, z), center);
            const soilId = before.soilId === 'rock' ? 'forest' : 'rock';
            const soil = await applyBatch(page.request, { format: 'landscape-edit-batch', schemaVersion: 1, id: `d7-acceptance-soil-${Date.now()}`, landscapeId: original.id, expectedRevision: original.revision,
                operations: [{ id: 'acceptance-soil', type: 'assign-soil', soilId, region: { type: 'circle', center, radius: soilRadius }, falloff: { type: 'none' } }] });
            let { state } = await reloadSource(page, soil.revision, 'soil edit');
            assertHealthy(state, 'soil edit');
            expect((await page.evaluate(({ x, z }) => window.__landscapeTestHooks.appearanceSample(x, z), center)).soilId).toBe(soilId);
            const soilFrame = await capture(page, 'edit-soil');
            report.edits.soil = { revision: soil.revision, soilId, rect, inside: difference(soilFrame, pre, { rect }), outside: difference(soilFrame, pre, { rect, inside: false }), summary: summary(state, 0) };
            expect(report.edits.soil.inside.outlierFraction, 'the soil edit is visible').toBeGreaterThan(.005);
            expectWithinNoise(report.edits.soil.outside, 'outside the soil edit');
            const soilRevert = await revertBatch(page.request, soil.revision);
            ({ state } = await reloadSource(page, soilRevert.revision, 'soil revert'));
            assertHealthy(state, 'soil revert');
            report.edits.soilRevert = difference(await capture(page, 'edit-soil-reverted'), pre);
            expectWithinNoise(report.edits.soilRevert, 'after the soil revert');

            const reverted = await savedManifest(), heightBefore = await groundHeight(page.request, center.x, center.z);
            const raise = await applyBatch(page.request, { format: 'landscape-edit-batch', schemaVersion: 1, id: `d7-acceptance-raise-${Date.now()}`, landscapeId: reverted.id, expectedRevision: reverted.revision,
                operations: [{ id: 'acceptance-raise', type: 'raise', region: { type: 'circle', center, radius: 8 }, falloff: { type: 'linear', distance: 4 }, deltaMeters: 1 }] });
            expect(raise.summary.changedNativeIds).toEqual([nativeId]);
            ({ state } = await reloadSource(page, raise.revision, 'height edit'));
            // the edited native's terrain fields and natural labels go stale explicitly; everything else stays on the published fields
            assertHealthy(state, 'height edit', { fields: 'active-partial', presentation: 'active-partial' });
            expect(state.appearance.terrainFields.staleChunks).toEqual([nativeId]);
            expect(state.appearance.presentation.overviewNatives).toEqual([{ id: nativeId, reason: 'stale' }]);
            expect(await groundHeight(page.request, center.x, center.z)).toBeCloseTo(heightBefore + 1, 4);
            report.edits.height = { revision: raise.revision, nativeId, difference: difference(await capture(page, 'edit-height'), pre), summary: summary(state, 0) };
            expect(report.edits.height.difference.meanBytes, 'the raised and stale native renders differently').toBeGreaterThan(NOISE.meanBytes);
            // meanwhile the immutable snapshot of the revision before the raise still renders the unedited frame, with the companion tiers active and
            // its terrain fields fresh (the fields bind native channel hashes, which the snapshot shares with the published bake)
            const previousUrl = (await savedManifest()).editHistory.previousManifestUrl, pinnedContext = await browser.newContext({ viewport, deviceScaleFactor: 1 });
            const pinnedLog = await observe(pinnedContext), pinnedPage = await pinnedContext.newPage();
            try {
                await open(pinnedPage, `?landscape=${encodeURIComponent(`/assets/public/landscape/coastal-city/${previousUrl}`)}`);
                await pinnedPage.evaluate(view => window.__landscapeTestHooks.setCamera(view), report.povCamera);
                const { state: pinned } = await settle(pinnedPage, 'pinned revision before the raise');
                expect(pinned.revision).toBe(reverted.revision);
                assertHealthy(pinned, 'pinned revision before the raise');
                expect(pinned.appearance.terrainFields.staleChunks).toEqual([]);
                report.edits.pinnedBeforeRaise = { url: previousUrl, revision: pinned.revision, difference: difference(await capture(pinnedPage, 'edit-height-pinned-previous'), pre) };
                expectWithinNoise(report.edits.pinnedBeforeRaise.difference, 'the pinned revision before the raise');
                expect([...pinnedLog.errors, ...pinnedLog.warnings, ...pinnedLog.failedRequests]).toEqual([]);
                await pinnedPage.evaluate(() => window.__landscapeTestHooks.dispose());
            } finally { await pinnedContext.close(); }
            const raiseRevert = await revertBatch(page.request, raise.revision);
            ({ state } = await reloadSource(page, raiseRevert.revision, 'height revert'));
            assertHealthy(state, 'height revert');
            expect(state.appearance.terrainFields.staleChunks).toEqual([]);
            report.edits.heightRevert = difference(await capture(page, 'edit-height-reverted'), pre);
            expectWithinNoise(report.edits.heightRevert, 'after the height revert');
        });

        await test.step('disposal releases the ledger, the workers and the WebGL context, and stops rendering', async () => {
            await page.evaluate(() => window.__landscapeTestHooks.dispose());
            const disposed = await page.evaluate(() => ({ state: window.__landscapeTestHooks.snapshot(), workers: { ...window.__landscapeWorkers },
                contextLost: document.getElementById('game-canvas').getContext('webgl2')?.isContextLost() ?? null, fatals: window.__testFatals ?? [] }));
            await page.waitForTimeout(500);
            const later = await snapshot(page);
            expect(disposed.state).toMatchObject({ disposed: true, ready: false, memory: null, sourceBytes: 0, streaming: null, appearance: null });
            expect([disposed.state.budget.cpuBytes, disposed.state.budget.gpuBytes, disposed.state.budget.entries.length]).toEqual([0, 0, 0]);
            expect(disposed.workers.created).toBeGreaterThan(0);
            expect(disposed.workers.live, `every viewer worker is terminated ${JSON.stringify(disposed.workers)}`).toBe(0);
            expect(disposed.contextLost).toBe(true);
            expect(later.frameIndex).toBe(disposed.state.frameIndex);
            expect(disposed.fatals).toEqual([]);
            await page.evaluate(() => window.__landscapeTestHooks.dispose());
            report.disposal = { workers: disposed.workers, contextLost: disposed.contextLost, renderer: disposed.state.renderer, budget: disposed.state.budget };
        });
        expect(log.errors, 'no page or console errors').toEqual([]);
        expect(log.warnings, 'no console warnings').toEqual([]);
        expect(log.failedRequests, 'no failed requests').toEqual([]);
    } finally {
        report.log = log;
        await writeFile(path.join(artifacts, 'journey.json'), JSON.stringify(report, null, 2));
        await context.close();
    }
});

// two views that need every request class: an aerial over planning cover (masks, natural-soil and field pages, mid material tiers) and a sand close-up
// (1024 tiers with paired micro pages from the multiscale companion)
async function requestViews(request) {
    const planning = await groundHeight(request, 2050, 2150), sand = await groundHeight(request, 1015, 900);
    return [
        { id: 'planning-oblique', view: { position: [1500, planning + 260, 1500], target: [2050, planning, 2150], projection: 'perspective', fov: 55, zoom: 1 } },
        { id: 'sand-near', view: { position: [1013.8, sand + 1.6, 898.6], target: [1015, sand, 900], projection: 'perspective', fov: 55, zoom: 1 } }
    ];
}

const fnv = text => { let hash = 2166136261; for (const character of text) hash = Math.imul(hash ^ character.charCodeAt(0), 16777619) >>> 0; return hash; };
const coverage = state => state.streaming.residentLeafIds.reduce((sum, id) => sum + 4 ** -Number(id.slice(1, id.indexOf('/'))), 0);

// a fresh viewer, its views visited in order: the reference frames of the request tests share this history
async function viewFrames(browser, views, { prefix, route = null, during = null, timeout = 150000 } = {}) {
    const context = await browser.newContext({ viewport, deviceScaleFactor: 1 }), log = await observe(context);
    if (route) await route(context);
    const page = await context.newPage(), result = { frames: {}, states: {}, log, during: {}, page, context };
    try {
        await open(page);
        for (const { id, view } of views) {
            await page.evaluate(value => window.__landscapeTestHooks.setCamera(value), view);
            if (during) result.during[id] = await during(page, id);
            const { state, settleMs } = await settle(page, `${prefix} ${id}`, timeout);
            result.states[id] = { state, settleMs };
            result.frames[id] = await capture(page, `${prefix}-${id}`);
        }
        return result;
    } catch (error) { await context.close(); throw error; }
}

async function closeViewer(result) {
    await result.page.evaluate(() => window.__landscapeTestHooks.dispose());
    const disposed = await result.page.evaluate(() => ({ state: window.__landscapeTestHooks.snapshot(), workers: { ...window.__landscapeWorkers } }));
    expect([disposed.state.budget.cpuBytes, disposed.state.budget.gpuBytes, disposed.state.budget.entries.length]).toEqual([0, 0, 0]);
    expect(disposed.workers.live).toBe(0);
    await result.context.close();
}

test('Landscape AI577 D7 acceptance: delayed terrain, mask, material, companion, field and natural-soil responses arriving out of order converge to the undelayed frames', async ({ browser, request }) => {
    test.setTimeout(12 * 60 * 1000);
    const views = await requestViews(request);
    const multiscale = JSON.parse(await readFile(path.join(directory, 'appearance/multiscale.json'), 'utf8'));
    const companionPages = new Set(multiscale.materials.flatMap(material => [...material.tiers, ...(material.micro?.tiers ?? [])].flatMap(tier => Object.values(tier.channels).map(page => page.url.split('/').pop()))));
    const classify = pathname => {
        const name = pathname.split('/').pop();
        if (pathname.includes('/payloads/')) return name.endsWith('.f32le') ? 'height' : 'cover';
        if (pathname.includes('/appearance/pages/')) return companionPages.has(name) ? 'companion-page' : 'material-page';
        if (pathname.includes('/fields/pages/')) return name.endsWith('.u8') ? 'natural-soil-page' : 'field-page';
        return 'metadata';
    };
    const reference = await viewFrames(browser, views, { prefix: 'requests-reference' });
    for (const { id } of views) assertHealthy(reference.states[id].state, `reference ${id}`);
    await closeViewer(reference);
    const delayed = { counts: {}, maxDelayMs: 0 };
    // every landscape response waits 40-440 ms, chosen by a hash of its path, so the pages of one view complete in a shuffled order (with 0.3-1.8 s the
    // planning view settles too, after about 3.6 minutes: mask jobs read their halo pages one after another in the single appearance worker)
    const result = await viewFrames(browser, views, { prefix: 'requests-delayed', timeout: 300000,
        route: context => context.route(url => new URL(url).pathname.startsWith('/assets/public/landscape/coastal-city/'), async route => {
            const pathname = new URL(route.request().url()).pathname, kind = classify(pathname), delay = 40 + (fnv(pathname) % 6) * 80;
            delayed.counts[kind] = (delayed.counts[kind] ?? 0) + 1;
            delayed.maxDelayMs = Math.max(delayed.maxDelayMs, delay);
            await new Promise(resolve => setTimeout(resolve, delay));
            await route.continue().catch(() => {});
        }),
        // the view keeps rendering while its pages are held back
        during: async page => {
            const first = (await snapshot(page)).frameIndex;
            await page.waitForTimeout(1000);
            const state = await snapshot(page);
            return { framesPerSecond: state.frameIndex - first, lastError: state.lastError, streamingErrors: state.streaming.errors.length, appearanceErrors: state.appearance.errors.length };
        } });
    try {
        const comparisons = {};
        for (const { id } of views) {
            assertHealthy(result.states[id].state, `delayed ${id}`);
            expect(result.during[id].framesPerSecond, `${id}: frames continue while responses are held`).toBeGreaterThan(20);
            expect([result.during[id].lastError, result.during[id].streamingErrors, result.during[id].appearanceErrors]).toEqual([null, 0, 0]);
            comparisons[id] = difference(result.frames[id], reference.frames[id]);
            expectWithinNoise(comparisons[id], `${id} with delayed responses`);
        }
        for (const kind of ['height', 'cover', 'material-page', 'companion-page', 'field-page', 'natural-soil-page']) expect(delayed.counts[kind] ?? 0, `${kind} responses were delayed`).toBeGreaterThan(0);
        expect(result.states['sand-near'].state.appearance.terrainFields.timing.peakLoadMs).toBeGreaterThanOrEqual(40);
        expect(result.log.errors).toEqual([]); expect(result.log.warnings).toEqual([]); expect(result.log.failedRequests).toEqual([]);
        await writeFile(path.join(artifacts, 'requests-delayed.json'), JSON.stringify({ delayed, comparisons, during: result.during,
            settleMs: Object.fromEntries(views.map(({ id }) => [id, { reference: reference.states[id].settleMs, delayed: result.states[id].settleMs }])), log: result.log }, null, 2));
    } finally { await closeViewer(result); }
});

test('Landscape AI577 D7 acceptance: corrupt field, natural-soil and companion pages fail explicitly with coarser fallbacks and recover on reload', async ({ browser, request }) => {
    test.setTimeout(10 * 60 * 1000);
    const views = await requestViews(request);
    const fields = JSON.parse(await readFile(path.join(directory, 'fields/manifest.json'), 'utf8')), multiscale = JSON.parse(await readFile(path.join(directory, 'appearance/multiscale.json'), 'utf8'));
    // a planning native's own natural-soil page (its masks and their neighbors' halos read it) and, far from it, the field page of the native under the
    // sand close-up and the companion 1024 page of sand
    const planningNative = 'l3/c4/r3', sandNative = 'l3/c2/r6', fieldEntry = fields.pages.find(value => value.id === sandNative).fields;
    const sand = multiscale.materials.find(material => material.soilId === 'sand').tiers.find(tier => tier.resolution === 1024).channels.baseColor;
    const targets = { field: fieldEntry.url, natural: fields.pages.find(value => value.id === planningNative).naturalSoil.url, companion: sand.url };
    expect(fields.pages.filter(value => value.naturalSoil?.url === targets.natural).map(value => value.id), 'the corrupted natural-soil page belongs to one native').toEqual([planningNative]);
    const reference = await viewFrames(browser, views, { prefix: 'corrupt-reference' });
    await closeViewer(reference);
    const served = { field: 0, natural: 0, companion: 0 };
    const kindOf = url => Object.keys(targets).find(key => new URL(url).pathname.endsWith(`/${targets[key].split('/').pop()}`));
    // the corrupted responses keep their length, so only the content hash can reject them
    const corrupt = async route => {
        served[kindOf(route.request().url())]++;
        const response = await route.fetch(), bytes = Buffer.from(await response.body());
        for (let index = 0; index < bytes.length; index += 4099) bytes[index] ^= 0xa5;
        await route.fulfill({ status: 200, contentType: 'application/octet-stream', body: bytes });
    };
    const isTarget = url => !!kindOf(url);
    const result = await viewFrames(browser, views, { prefix: 'corrupt-failed', route: context => context.route(isTarget, corrupt) });
    try {
        const planning = result.states['planning-oblique'].state, close = result.states['sand-near'].state, report = { targets };
        // the mask pages that read the corrupt natural-soil page fail explicitly (one retry) and keep their parents' coverage
        expect(planning.appearance.errors.length, 'mask failures are reported').toBeGreaterThan(0);
        expect(planning.appearance.degradationReason).toBe('appearance-request-failed');
        expect(planning.appearance.residentMaskIds).not.toContain(planningNative);
        expect(coverage(planning), 'geometry still covers the landscape').toBe(1);
        report.maskErrors = planning.appearance.errors;
        // the field page fails, is retried once after 2.5 s and stays out; its native shows its resident parent's fields instead
        const failure = close.appearance.terrainFields.failures.find(value => value.id === sandNative);
        expect(failure, JSON.stringify(close.appearance.terrainFields.failures)).toMatchObject({ id: sandNative, attempts: 2 });
        expect(close.appearance.terrainFields.status).toBe('active');
        expect(close.appearance.terrainFields.residentPages.map(value => value.id)).not.toContain(sandNative);
        const fallback = await result.page.evaluate(() => window.__landscapeTestHooks.terrainFieldsSample(1015, 900));
        expect(fallback.availability, 'a coarser resident field page covers the failed native').toBe(1);
        expect(fallback.contributions.every(value => value.level < 3), JSON.stringify(fallback.contributions)).toBe(true);
        report.fieldFailure = { failure, fallback: { availability: fallback.availability, contributions: fallback.contributions } };
        // a failed companion page disables that material's companion tiers, which keeps its schema-1 tiers
        const companionFailures = close.appearance.multiscale.failures;
        expect(companionFailures.length, JSON.stringify(companionFailures)).toBeGreaterThan(0);
        expect(close.appearance.materials.find(material => material.soilId === 'sand').resolution).toBeLessThanOrEqual(512);
        report.companionFailures = companionFailures;
        report.served = { ...served };
        for (const kind of Object.keys(targets)) expect(served[kind], `${kind} page was requested and corrupted`).toBeGreaterThan(0);
        for (const state of [planning, close]) {
            expect(state.budget.denied).toBe(0);
            expect(state.budget.cpuBytes).toBeLessThanOrEqual(state.budget.limits.cpuBytes); expect(state.budget.gpuBytes).toBeLessThanOrEqual(state.budget.limits.gpuBytes);
            expect(state.budget.entries.filter(value => [fieldEntry.sha256, sand.sha256].some(hash => value.key.includes(hash))).map(value => value.key), 'failed pages leave no reservation').toEqual([]);
        }
        expect(result.log.errors).toEqual([]); expect(result.log.failedRequests).toEqual([]);
        report.warnings = result.log.warnings;
        // without the corruption a source reload recovers every page and reproduces the reference frame
        await result.context.unroute(isTarget);
        const { state } = await reloadSource(result.page, (await snapshot(result.page)).revision, 'corrupt recovery');
        assertHealthy(state, 'corrupt recovery');
        expect([state.appearance.terrainFields.failures, state.appearance.multiscale.failures, state.appearance.errors]).toEqual([[], [], []]);
        report.recovered = difference(await capture(result.page, 'corrupt-recovered-sand-near'), reference.frames['sand-near']);
        expectWithinNoise(report.recovered, 'sand-near after recovery');
        await writeFile(path.join(artifacts, 'requests-corrupt.json'), JSON.stringify(report, null, 2));
    } finally { await closeViewer(result); }
});

test('Landscape AI577 D7 acceptance: the historical and constrained budgets keep the coast covered, bounded and explicitly degraded', async ({ browser, request }) => {
    test.setTimeout(10 * 60 * 1000);
    const stops = await journeyStops(request), report = {};
    const selected = ['game-pov', 'shore-oblique', 'coast-bluff', 'overview-top'].map(id => stops.find(stop => stop.id === id));
    // explicit degradation is reported through these warnings by design; every other warning fails
    const expectedWarnings = /^\[Landscape\] (Terrain fields budget-denied: terrain-fields-ceiling|Natural inference falls back to .* \(budget-denied\))/;
    for (const [cpu, gpu] of [[128, 64], [48, 24]]) {
        const context = await browser.newContext({ viewport, deviceScaleFactor: 1 }), log = await observe(context), page = await context.newPage(), profile = report[`${cpu}/${gpu}`] = {};
        try {
            await open(page, `?landscapeCpuMiB=${cpu}&landscapeGpuMiB=${gpu}`);
            for (const stop of selected) {
                await goTo(page, stop);
                const { state, settleMs } = await settle(page, `${cpu}/${gpu} ${stop.id}`);
                expect(state.budget.limits).toEqual({ cpuBytes: cpu * MiB, gpuBytes: gpu * MiB });
                for (const key of ['cpuBytes', 'gpuBytes']) {
                    expect(state.budget[key], `${cpu}/${gpu} ${stop.id} ${key}`).toBeLessThanOrEqual(state.budget.limits[key]);
                    expect(state.budget[`peak${key[0].toUpperCase()}${key.slice(1)}`]).toBeLessThanOrEqual(state.budget.limits[key]);
                }
                expect(state.peakUploadedBytesPerFrame).toBeLessThanOrEqual(8 * MiB);
                expect([state.streaming.errors, state.appearance.errors, state.planning.errors]).toEqual([[], [], []]);
                expect(coverage(state), 'complete coverage').toBe(1);
                if (!state.streaming.targetMet) expect(state.streaming.degradationReason, `${stop.id}: unmet detail names its reason`).toBeTruthy();
                // terrain fields and the surface cache refuse profiles that cannot hold them, with their reasons
                expect([state.appearance.terrainFields.status, state.appearance.terrainFields.reason]).toEqual(['budget-denied', 'terrain-fields-ceiling']);
                expect(['active', 'active-limited', 'budget-denied']).toContain(state.appearance.multiscale.status);
                if (state.surfaceCache === 'on') expect(state.appearance.surfaceCache).toMatchObject({ status: 'unavailable', reason: 'surface-cache-gpu-budget' });
                expect(state.lighting.status).toBe('ready');
                profile[stop.id] = summary(state, settleMs);
                await capture(page, `budget-${cpu}-${gpu}-${stop.id}`);
            }
            await page.evaluate(() => window.__landscapeTestHooks.dispose());
            const disposed = await page.evaluate(() => ({ state: window.__landscapeTestHooks.snapshot(), workers: { ...window.__landscapeWorkers } }));
            expect([disposed.state.budget.cpuBytes, disposed.state.budget.gpuBytes, disposed.state.budget.entries.length]).toEqual([0, 0, 0]);
            expect(disposed.workers.live).toBe(0);
            expect(log.errors).toEqual([]); expect(log.failedRequests).toEqual([]);
            expect(log.warnings.filter(text => !expectedWarnings.test(text)), 'only the explicit budget degradation warnings').toEqual([]);
            profile.warnings = log.warnings;
        } finally { await context.close(); }
    }
    await writeFile(path.join(artifacts, 'low-budgets.json'), JSON.stringify(report, null, 2));
});
