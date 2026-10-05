// Captures matching native coastal transition views and settled frame/GPU measurements for AI577.
import { test, expect } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';

const root = path.resolve('.'), source = path.join(root, 'assets/public/landscape/coastal-city');
const phase = process.env.LANDSCAPE_SURFACE_PHASE ?? null;
if (phase !== null && !['before', 'after'].includes(phase)) throw new Error('LANDSCAPE_SURFACE_PHASE must be before or after');
const deliverable = process.env.LANDSCAPE_SURFACE_DELIVERABLE ?? 'd1';
if (!['d1', 'd1a', 'd2', 'd3', 'd4', 'd5'].includes(deliverable)) throw new Error('LANDSCAPE_SURFACE_DELIVERABLE must be d1, d1a, d2, d3, d4 or d5');
const profile = process.env.LANDSCAPE_SURFACE_PROFILE ?? 'default';
const budgetProfiles = { default: { cpuMiB: 128, gpuMiB: 64 }, quality: { cpuMiB: 256, gpuMiB: 128 }, realism: { cpuMiB: 384, gpuMiB: 192 }, shipped: { cpuMiB: 512, gpuMiB: 256 } };
if (!budgetProfiles[profile]) throw new Error('LANDSCAPE_SURFACE_PROFILE must be default, quality, realism or shipped');
const { cpuMiB, gpuMiB } = budgetProfiles[profile];
const artifactPrefix = `/tests/artifacts/screens/landscape/ai577/${deliverable}${profile === 'default' ? '' : `/${profile}`}`;
const artifacts = path.join(root, artifactPrefix.slice(1), phase ?? 'unselected');
const deliveryLabel = { d1: 'D1 · Visual surface transitions', d1a: 'D1a · Homogeneous materials and height transitions', d2: 'D2 · Fine surface coverage pages', d3: 'D3 · Non-repeating material sampling', d4: 'D4 · Distinct macro, local and micro detail', d5: 'D5 · Terrain-driven natural appearance and lighting' }[deliverable];
const manifestText = await readFile(path.join(source, 'manifest.json'), 'utf8'), manifest = JSON.parse(manifestText);
const viewport = { width: 1920, height: 1080 }, warmupFrames = 30, sampleFrames = 120, MiB = 1024 * 1024;
const lightingDescription = 'Terrain shader illuminate(): fixed GGX sun direction [-0.44,0.87,-0.22], RGB [2.7,2.6,2.3], hemisphere ambient factor 0.68. LandscapeView fixed hemisphere 0xdceef4/0x536047 intensity 2.3 and directional 0xfff4dd intensity 2.2 at [-2000,4000,-1000].';
// AI577 D5 replaces the fixed lights with the game's resolved calibrated lighting: its comparison records both lighting descriptions instead of
// requiring equal ones, and the terrain geometry is matched without the HDR background box and the atmosphere backdrop the new lighting draws
// and with the single-pass water surface in place of the two-pass pre-D5 one
const lightingChanges = deliverable === 'd5';
const fixed = (values, digits = 4) => values.map(value => Number(value).toFixed(digits)).join(', ');
// describes the lighting a runtime resolved (snapshot().lighting), so a capture never claims a constant it did not render
function describeLighting(lighting) {
    if (!lighting) return lightingDescription;
    const { sun, sky, haze, water, environment } = lighting;
    return `Game lighting ${lighting.model} tier ${lighting.tier} (${lighting.status}) from ${lighting.sources.lighting} + ${lighting.sources.atmosphere}`
        + ` (saved lighting ${lighting.sources.savedLighting}, saved atmosphere ${lighting.sources.savedAtmosphere}, URL overrides ${JSON.stringify(lighting.sources.urlOverrides)}):`
        + ` ${lighting.toneMapping} tone mapping, exposure ${lighting.exposure}; sun azimuth ${sun.azimuthDeg}° elevation ${sun.elevationDeg}° direction [${fixed(sun.direction)}],`
        + ` normal irradiance [${fixed(sun.irradiance, 3)}]; sky ${environment.iblId} at intensity ${environment.intensity} (${sky.model}, horizontal irradiance [${fixed(sky.irradiance.up, 3)}]),`
        + ` background ${environment.background}; hemisphere ${lighting.hemisphereIntensity}; aerial perspective ${haze.model} ${haze.enabled ? 'on' : 'off'} (calibration [${fixed(haze.calibration)}]);`
        + ` water ${water.model} at level ${water.opticalLevel}; visibility hooks ${lighting.hooks.sunVisibility}/${lighting.hooks.skyVisibility}.`;
}
// the pre-D5 sea-level reference was a transparent double-sided MeshStandardMaterial, which three.js draws as a back and a front pass
const PRE_D5_WATER_PASSES = 2;
function renderOverhead(state) {
    if (!lightingChanges || !state.lighting) return { drawCalls: 0, triangles: 0 };
    const water = state.water?.drawnLastFrame ? state.water.drawPasses - PRE_D5_WATER_PASSES : 0;
    return { drawCalls: (state.lighting.environment.backgroundDrawCalls ?? 0) + (state.lighting.backdrop?.drawCalls ?? 0) + water,
        triangles: (state.lighting.environment.backgroundTriangles ?? 0) + (state.lighting.backdrop?.triangles ?? 0) + water * (state.water?.trianglesPerPass ?? 0) };
}
const anchor = { x: 1071.2890625, z: 914.0625, height: 6.4459381103515625, chunkId: 'l3/c2/r6', row: 44, column: 36 };
const { x, z, height: y } = anchor;
const route = [
    { id: '01-game-pov', label: 'Game POV', view: { position: [x - 10, y + 4.5, z - 26], target: [x + 2, y, z + 16], projection: 'perspective', fov: 55, orthoHeight: 50, zoom: 1 } },
    { id: '02-oblique', label: 'Oblique close view', view: { position: [x - 18, y + 16, z - 24], target: [x, y, z], projection: 'perspective', fov: 55, orthoHeight: 50, zoom: 1 } },
    { id: '03-top-down', label: 'Top-down 50 m span', view: { position: [x, y + 150, z - .001], target: [x, y, z], projection: 'orthographic', fov: 55, orthoHeight: 50, zoom: 1 } },
    { id: '04-medium-distance', label: 'Medium-distance coast', view: { position: [x - 60, y + 55, z - 80], target: [x, y, z], projection: 'perspective', fov: 55, orthoHeight: 50, zoom: 1 } }
];
test.use({ viewport, deviceScaleFactor: 1, video: 'off', trace: 'off' });

function statistics(values) {
    if (!values.length) return null;
    const sorted = values.slice().sort((a, b) => a - b), at = fraction => sorted[Math.max(0, Math.ceil(sorted.length * fraction) - 1)];
    return { count: values.length, mean: values.reduce((sum, value) => sum + value, 0) / values.length,
        median: sorted.length % 2 ? sorted[(sorted.length - 1) / 2] : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2,
        p95: at(.95), min: sorted[0], max: sorted.at(-1) };
}

function unpack(values, columns) {
    const records = [];
    for (let offset = 0; offset < values.length; offset += columns.length) records.push(Object.fromEntries(columns.map((name, index) => [name, values[offset + index]])));
    return records;
}

function materialQuality(state) {
    return state.appearance.materials.map(({ materialId, soilId, resolution, desiredResolution, tileMeters, calibration }) =>
        ({ materialId, soilId, resolution, desiredResolution, tileMeters, calibration }));
}

async function implementationFingerprint() {
    const directories = ['src/app/landscape', 'src/graphics/engine3d/landscape', 'src/graphics/shaders/materials/landscape', 'src/graphics/gui/landscape_fabrication'];
    const files = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '--', ...directories], { encoding: 'utf8' }).trim().split(/\r?\n/).filter(Boolean).sort();
    const hashes = await Promise.all(files.map(async file => ({ path: file, sha256: createHash('sha256').update(await readFile(path.join(root, file))).digest('hex') })));
    return { workingTreeDirty: execFileSync('git', ['status', '--porcelain', '--untracked-files=normal'], { encoding: 'utf8' }).trim().length > 0,
        sourceImplementationSha256: createHash('sha256').update(JSON.stringify(hashes)).digest('hex'), sourceImplementationFiles: hashes };
}

async function assertImmutableBaseline(before) {
    if (deliverable === 'd1') return;
    const directory = path.join(artifacts, '../before');
    const seal = JSON.parse(await readFile(path.join(directory, 'immutable-baseline.json'), 'utf8'));
    expect(seal.gitRevision).toBe(before.gitRevision);
    for (const entry of seal.files) {
        const content = await readFile(path.join(directory, entry.file));
        expect(content.length, `Immutable baseline byte count: ${entry.file}`).toBe(entry.bytes);
        expect(createHash('sha256').update(content).digest('hex'), `Immutable baseline hash: ${entry.file}`).toBe(entry.sha256);
    }
}

function terrainContent(value) {
    const { revision, provenance, soil, ...terrain } = value;
    return { ...terrain, soil: { ...soil, catalog: soil.catalog.map(({ materialId, ...entry }) => entry) } };
}

async function materialInputs() {
    const content = await readFile(path.join(source, 'appearance/manifest.json'));
    const appearance = JSON.parse(content);
    return { appearanceRevision: appearance.revision, manifestSha256: createHash('sha256').update(content).digest('hex'),
        materials: appearance.materials.map(({ soilId, materialId, tileMeters, calibration, height, tiers }) => ({ soilId, materialId, tileMeters, calibration, height, tiers })) };
}

async function writeComparisons(browser, baseURL, before, after) {
    const directory = path.join(artifacts, '../comparisons');
    await mkdir(directory, { recursive: true });
    const stylesheet = await readFile(path.join(root, 'tests/headless/e2e/fixtures/landscape_surface_comparison.css'));
    await writeFile(path.join(directory, 'comparison.css'), stylesheet);
    const context = await browser.newContext({ baseURL, viewport: { width: 3840, height: 1176 }, deviceScaleFactor: 1 });
    const page = await context.newPage(), comparisons = [];
    const prefix = artifactPrefix, resources = new Map([[`${prefix}/comparisons/comparison.css`, { contentType: 'text/css', body: stylesheet }]]);
    await page.route('**/*', request => {
        const resource = resources.get(new URL(request.request().url()).pathname);
        return resource ? request.fulfill(resource) : request.fallback();
    });
    try {
        for (const stop of route) {
            const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>AI577 ${deliverable.toUpperCase()} ${stop.label}</title>
<link rel="stylesheet" href="comparison.css"></head>
<body><main><section><header><div>BEFORE · ${before.gitRevision.slice(0, 8)}</div><h1>${stop.label}</h1><p>Native coastal source · 1920 × 1080 · DPR 1 · ${cpuMiB}/${gpuMiB} MiB · ${lightingChanges ? 'Fixed camera; pre-D5 fixed lights' : 'Fixed camera and lighting'}</p></header><img src="../before/${stop.id}.png" width="1920" height="1080" alt="Before: ${stop.label}"></section>
<section><header><div>AFTER · AI577 ${deliverable.toUpperCase()} (working tree)</div><h1>${stop.label}</h1><p>AI577 ${deliveryLabel} · ${lightingChanges ? 'Game calibrated lighting · ' : ''}Original renders shown at native pixel dimensions</p></header><img src="../after/${stop.id}.png" width="1920" height="1080" alt="After: ${stop.label}"></section></main></body></html>`;
            await writeFile(path.join(directory, `${stop.id}.html`), html);
            resources.set(`${prefix}/comparisons/${stop.id}.html`, { contentType: 'text/html', body: html });
            for (const phaseName of ['before', 'after']) resources.set(`${prefix}/${phaseName}/${stop.id}.png`, {
                contentType: 'image/png', body: await readFile(path.join(directory, `../${phaseName}/${stop.id}.png`)) });
            await page.goto(`${prefix}/comparisons/${stop.id}.html`);
            await expect(page.locator('img')).toHaveCount(2);
            await page.locator('img').evaluateAll(images => Promise.all(images.map(image => image.decode())));
            expect(await page.locator('img').evaluateAll(images => images.map(image => [image.naturalWidth, image.naturalHeight]))).toEqual([[1920, 1080], [1920, 1080]]);
            await page.screenshot({ path: path.join(directory, `${stop.id}-comparison.png`) });
            const inputs = await Promise.all(['before', 'after'].map(async phaseName => ({ phase: phaseName,
                path: `../${phaseName}/${stop.id}.png`, sha256: createHash('sha256').update(await readFile(path.join(directory, `../${phaseName}/${stop.id}.png`))).digest('hex') })));
            comparisons.push({ id: stop.id, label: stop.label, html: `${stop.id}.html`, png: `${stop.id}-comparison.png`, inputs });
        }
    } finally { await context.close(); }
    await writeFile(path.join(directory, 'manifest.json'), JSON.stringify({ format: 'landscape-surface-comparisons', schemaVersion: 1,
        createdAt: new Date().toISOString(), method: 'Chromium captures of HTML displaying two unchanged 1920×1080 originals at native pixel dimensions with labels',
        dimensions: { width: 3840, height: 1176 }, comparisons }, null, 2));
}

function summarize(measured) {
    const frames = unpack(measured.capture.frames, measured.capture.columns), gpu = unpack(measured.capture.gpu, measured.capture.gpuColumns);
    const sampled = frames.filter(frame => frame.elapsedMs >= measured.sampleStartElapsedMs && frame.elapsedMs <= measured.sampleEndElapsedMs);
    const submissions = new Set(sampled.map(frame => frame.gpuSubmission)), gpuValues = gpu.filter(sample => submissions.has(sample.submission)).map(sample => sample.ms);
    const frameMs = statistics(sampled.map(frame => frame.intervalMs));
    return { sampleCount: sampled.length, frameMs, fps: 1000 / frameMs.mean, cpuFrameMs: statistics(sampled.map(frame => frame.cpuFrameMs)),
        gpuMs: gpuValues.length ? { status: 'measured', ...statistics(gpuValues) } : { status: 'not measured', reason: measured.capture.finalGpu.disabledReason ?? 'No completed GPU timer queries matched the settled sample window' },
        gpuPendingAtEnd: measured.capture.finalGpu.pendingQueryCount, gpuDisjointCount: measured.capture.finalGpu.disjointCount,
        drawCalls: statistics(sampled.map(frame => frame.drawCalls)), triangles: statistics(sampled.map(frame => frame.triangles)),
        geometryStreamingMs: statistics(sampled.map(frame => frame.geometryStreamingMs)), appearanceStreamingMs: statistics(sampled.map(frame => frame.appearanceStreamingMs)),
        settledAfterCameraMs: measured.settledAfterCameraMs, captureCpuBytes: measured.capture.captureCpuBytes,
        uploadedBytes: frames.reduce((sum, frame) => sum + frame.uploadedBytes, 0), peakUploadedBytesPerFrame: Math.max(...frames.map(frame => frame.uploadedBytes)) };
}

function assertState(state) {
    expect(state.lastError).toBeNull(); expect(state.revision).toBe(manifest.revision);
    expect(state.mode).toBe('shaded'); expect(state.helpers).toEqual({ grid: false, axes: false }); expect(state.water.visible).toBe(true);
    expect(state.canvas).toEqual(viewport);
    expect(state.streaming.errors).toEqual([]); expect(state.appearance.errors).toEqual([]); expect(state.planning.errors).toEqual([]);
    expect(state.budget.cpuBytes).toBeLessThanOrEqual(state.budget.limits.cpuBytes);
    expect(state.budget.gpuBytes).toBeLessThanOrEqual(state.budget.limits.gpuBytes);
    expect(state.budget.peakCpuBytes).toBeLessThanOrEqual(state.budget.limits.cpuBytes);
    expect(state.budget.peakGpuBytes).toBeLessThanOrEqual(state.budget.limits.gpuBytes);
    expect(state.peakUploadedBytesPerFrame).toBeLessThanOrEqual(8 * MiB);
}

async function measure(page, stop) {
    return page.evaluate(async ({ stop, warmupFrames, sampleFrames }) => {
        const hooks = window.__landscapeTestHooks, wait = async () => {
            await new Promise(resolve => requestAnimationFrame(resolve));
            if (window.__landscapeCaptureError) throw new Error(window.__landscapeCaptureError);
        };
        const capture = hooks.beginPerformanceCapture({ maxFrames: 4096 }), began = performance.now();
        hooks.setCamera(stop.view);
        let state, stable = 0;
        do {
            for (let index = 0; index < 6; index++) await wait();
            state = hooks.snapshot();
            if (state.lastError) throw new Error(state.lastError);
            stable = state.streaming.settled && state.appearance.settled && state.planning.settled ? stable + 1 : 0;
            if (performance.now() - began > 60000) throw new Error(`Transition capture did not settle at ${stop.id}`);
        } while (stable < 2);
        const settledAtMs = performance.now();
        for (let index = 0; index < warmupFrames; index++) await wait();
        const sampleStartMs = performance.now();
        for (let index = 0; index < sampleFrames; index++) await wait();
        const sampleEndMs = performance.now();
        for (let index = 0; index < 4; index++) await wait();
        return { state: hooks.snapshot(), capture: hooks.endPerformanceCapture(), settledAfterCameraMs: settledAtMs - began,
            sampleStartElapsedMs: sampleStartMs - capture.startedAtMs, sampleEndElapsedMs: sampleEndMs - capture.startedAtMs };
    }, { stop, warmupFrames, sampleFrames });
}

test('Landscape surface: four native coastal transitions retain identical capture conditions and bounded residency', async ({ browser }, testInfo) => {
    test.skip(phase === null || process.env.LANDSCAPE_SURFACE_COMPARISONS_ONLY === '1', 'Set LANDSCAPE_SURFACE_PHASE=before or after to opt in to local capture evidence');
    test.setTimeout(5 * 60 * 1000);
    const baseURL = String(testInfo.project.use.baseURL);
    expect(new URL(baseURL).port, 'Landscape verification uses port 8002').toBe('8002');
    if (phase === 'before' && deliverable !== 'd1') {
        const previous = await readFile(path.join(artifacts, 'report.json'), 'utf8').catch(error => { if (error.code !== 'ENOENT') throw error; return null; });
        expect(previous && JSON.parse(previous).complete, `The completed ${deliverable.toUpperCase()} baseline must never be overwritten`).not.toBe(true);
    }
    await mkdir(artifacts, { recursive: true });
    const descriptor = manifest.chunks.find(chunk => chunk.id === anchor.chunkId), cover = await readFile(path.join(source, descriptor.channels.landCover.url));
    expect(cover[anchor.row * descriptor.columns + anchor.column]).toBe(1);
    expect(cover[anchor.row * descriptor.columns + anchor.column + 1]).toBe(2);
    const report = { format: 'landscape-surface-transition-evidence', schemaVersion: 1, phase, complete: false, createdAt: new Date().toISOString(),
        gitRevision: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), browserVersion: browser.version(),
        hardware: { platform: os.platform(), release: os.release(), arch: os.arch(), cpuModel: os.cpus()[0]?.model, logicalCpus: os.cpus().length, ramBytes: os.totalmem() },
        dataset: { id: manifest.id, revision: manifest.revision, manifestSha256: createHash('sha256').update(manifestText).digest('hex'), sourceSha256: manifest.provenance.sourceSha256,
            nativeSpacingMeters: manifest.grid.spacingX, anchor, sourceBoundaryCoverIds: [1, 2], anchorCoverSha256: descriptor.channels.landCover.sha256 },
        viewport: { ...viewport, dpr: 1 }, route, warmupFrames, sampleFrames,
        captureConditions: { water: true, mode: 'shaded', helpers: false, overlays: false, ui: false, cpuMiB, gpuMiB,
            lighting: lightingDescription,
            timing: 'Fresh browser context; each pose settles, discards 30 frames, samples 120 frames, and drains four query-tail frames. GPU uses completed unique timer queries matched to sampled submissions.' },
        stops: [], errors: [], warnings: [], materialQualityFailures: [], materialInputs: await materialInputs() };
    Object.assign(report, await implementationFingerprint());
    const before = phase === 'after' ? JSON.parse(await readFile(path.join(artifacts, '../before/report.json'), 'utf8')) : null;
    if (before) {
        expect(before.complete).toBe(true);
        await assertImmutableBaseline(before);
        if (deliverable === 'd1a') {
            const previousText = await readFile(path.join(source, `manifest.${before.dataset.manifestSha256}.json`));
            expect(createHash('sha256').update(previousText).digest('hex')).toBe(before.dataset.manifestSha256);
            expect(terrainContent(manifest), 'Material rebinding must preserve all terrain content and semantic cover').toEqual(terrainContent(JSON.parse(previousText)));
            const unchangedDataset = ({ revision, manifestSha256, ...value }) => value;
            expect(unchangedDataset(report.dataset)).toEqual(unchangedDataset(before.dataset));
            report.materialComparison = { before: JSON.parse(await readFile(path.join(artifacts, '../before/material-inputs.json'), 'utf8')), after: report.materialInputs };
        } else expect(report.dataset).toEqual(before.dataset);
        expect(report.route).toEqual(before.route); expect(report.viewport).toEqual(before.viewport);
        if (lightingChanges) {
            const { lighting: beforeLighting, ...beforeConditions } = before.captureConditions, { lighting: afterLighting, ...afterConditions } = report.captureConditions;
            expect(afterConditions).toEqual(beforeConditions);
        } else expect(report.captureConditions).toEqual(before.captureConditions);
    }
    const context = await browser.newContext({ baseURL, viewport, deviceScaleFactor: 1 }), page = await context.newPage();
    await writeFile(path.join(artifacts, 'browser-errors.json'), '[]');
    await writeFile(path.join(artifacts, 'browser-warnings.json'), '[]');
    let errorWrite = Promise.resolve();
    const recordError = value => {
        if (!report.errors.includes(value)) {
            report.errors.push(value);
            if (report.errors.length <= 3) console.error(`[Landscape surface renderer error] ${value.slice(0, 2500)}`);
            errorWrite = errorWrite.then(() => writeFile(path.join(artifacts, 'browser-errors.json'), JSON.stringify(report.errors, null, 2)));
        }
        page.evaluate(message => { window.__landscapeCaptureError = message; }, value).catch(() => {});
    };
    page.on('pageerror', error => recordError(error.message));
    page.on('console', message => {
        if (!['error', 'warning'].includes(message.type()) || !/shader|webgl|program|THREE|GL_INVALID/i.test(message.text())) return;
        const value = message.text();
        if (message.type() === 'error' || /\berrors?(?:\s+X\d+|\s*:)|compil(?:ation|e).*fail|GL_INVALID|VALIDATE_STATUS\s*[:=]?\s*false|validation.*false/i.test(value)) recordError(value);
        else if (!report.warnings.includes(value)) {
            report.warnings.push(value);
            if (report.warnings.length <= 3) console.warn(`[Landscape surface renderer warning] ${value.slice(0, 2500)}`);
            errorWrite = errorWrite.then(() => writeFile(path.join(artifacts, 'browser-warnings.json'), JSON.stringify(report.warnings, null, 2)));
        }
    });
    try {
        await page.goto(`/screens/landscape_fabrication.html?landscapeCpuMiB=${cpuMiB}&landscapeGpuMiB=${gpuMiB}`);
        await page.waitForFunction(() => {
            const state = window.__landscapeTestHooks?.snapshot();
            if (window.__landscapeCaptureError) throw new Error(window.__landscapeCaptureError);
            if (state?.lastError) throw new Error(state.lastError);
            return state?.ready && state.streaming.settled && state.appearance?.settled && state.planning.ready && state.planning.settled;
        }, null, { timeout: 60000 });
        expect(report.errors, 'Terrain must compile before any performance sampling').toEqual([]);
        await page.evaluate(() => {
            document.body.classList.add('perf-bar-hidden');
            document.querySelectorAll('.landscape-ui, .ui-perf-bar').forEach(element => element.classList.add('hidden'));
            window.dispatchEvent(new Event('resize'));
        });
        report.metadata = await page.evaluate(() => window.__landscapeTestHooks.performanceMetadata());
        const resolvedLighting = await page.evaluate(() => window.__landscapeTestHooks.snapshot().lighting ?? null);
        report.captureConditions.lighting = describeLighting(resolvedLighting);
        if (resolvedLighting) report.resolvedLighting = resolvedLighting;
        expect(report.metadata.viewport).toEqual(report.viewport);
        expect(report.metadata.renderer.width).toBe(viewport.width); expect(report.metadata.renderer.height).toBe(viewport.height);
        if (before) {
            expect(report.metadata.renderer).toEqual(before.metadata.renderer);
            if (lightingChanges) report.lightingComparison = { before: { description: before.captureConditions.lighting, rendererSettings: before.metadata.rendererSettings },
                after: { description: report.captureConditions.lighting, rendererSettings: report.metadata.rendererSettings } };
            else expect(report.metadata.rendererSettings).toEqual(before.metadata.rendererSettings);
            expect(report.metadata.budgets).toEqual(before.metadata.budgets);
        }
        for (const stop of route) {
            const measured = await measure(page, stop), summary = summarize(measured);
            let materialQualityChanges = [];
            const entry = { id: stop.id, label: stop.label, ...summary, materialQuality: materialQuality(measured.state), materialQualityChanges, state: measured.state };
            report.stops.push(entry);
            await writeFile(path.join(artifacts, `${stop.id}-frames.json`), JSON.stringify(measured));
            await page.screenshot({ path: path.join(artifacts, `${stop.id}.png`) });
            assertState(measured.state);
            expect(measured.capture.droppedFrames).toBe(0); expect(measured.capture.droppedGpuSamples).toBe(0);
            expect(summary.sampleCount).toBeGreaterThanOrEqual(sampleFrames - 1); expect(summary.sampleCount).toBeLessThanOrEqual(sampleFrames + 1);
            expect(summary.peakUploadedBytesPerFrame).toBeLessThanOrEqual(8 * MiB);
            if (before) {
                const previous = before.stops.find(value => value.id === stop.id);
                expect(measured.state.camera).toEqual(previous.state.camera);
                const overhead = renderOverhead(measured.state);
                entry.lightingRenderOverhead = overhead;
                expect(summary.triangles.median - overhead.triangles, 'Matched material evidence requires identical geometry').toBe(previous.triangles.median);
                expect(summary.drawCalls.median - overhead.drawCalls, 'Matched material evidence requires identical draw calls').toBe(previous.drawCalls.median);
                const identity = state => materialQuality(state).map(({ resolution, desiredResolution, ...material }) => material);
                if (!['d1a', 'd4', 'd5'].includes(deliverable)) {
                    expect(measured.state.appearance.materialTiling).toEqual(previous.state.appearance.materialTiling);
                    expect(identity(measured.state)).toEqual(identity(previous.state));
                } else entry.materialIdentityChanges = { before: identity(previous.state), after: identity(measured.state),
                    tiling: { before: previous.state.appearance.materialTiling, after: measured.state.appearance.materialTiling } };
                for (const material of measured.state.appearance.materials) {
                    const original = previous.state.appearance.materials.find(value => value.soilId === material.soilId);
                    expect(original, `Missing baseline soil binding ${material.soilId}`).toBeTruthy();
                    if (!['d4', 'd5'].includes(deliverable) && (deliverable === 'd1a' || ['sand', 'loam', 'forest'].includes(material.soilId)) && (material.refCount > 0 || original.refCount > 0) && material.resolution !== original.resolution) {
                        const failure = { stop: stop.id, soilId: material.soilId, materialId: material.materialId, before: original.resolution, after: material.resolution };
                        report.materialQualityFailures.push(failure);
                        console.warn(`[Landscape surface unmatched material tier] ${JSON.stringify(failure)}`);
                    }
                    if (material.resolution !== original.resolution || material.desiredResolution !== original.desiredResolution) materialQualityChanges.push({
                        materialId: material.materialId, soilId: material.soilId, before: { resolution: original.resolution, desiredResolution: original.desiredResolution },
                        after: { resolution: material.resolution, desiredResolution: material.desiredResolution } });
                }
            }
            console.log(`Landscape surface ${phase} ${stop.id}: ${summary.sampleCount} frames, median ${summary.frameMs.median.toFixed(2)} ms, p95 ${summary.frameMs.p95.toFixed(2)} ms, GPU ${summary.gpuMs.status}${summary.gpuMs.median === undefined ? '' : ` ${summary.gpuMs.median.toFixed(2)} ms`}`);
        }
        expect(report.errors).toEqual([]);
        expect(report.materialQualityFailures, 'Contributing material tiers must match the baseline for a valid before/after comparison').toEqual([]);
        report.complete = true;
    } finally {
        try {
            await page.evaluate(() => window.__landscapeTestHooks?.dispose());
            report.disposed = await page.evaluate(() => window.__landscapeTestHooks?.snapshot());
            expect(report.disposed?.budget.cpuBytes).toBe(0); expect(report.disposed?.budget.gpuBytes).toBe(0);
        } finally {
            await context.close();
            await errorWrite;
            await writeFile(path.join(artifacts, 'report.json'), JSON.stringify(report, null, 2));
        }
    }
    if (before) await writeComparisons(browser, baseURL, before, report);
});

test('Landscape surface: assemble saved matching captures without rerunning the terrain benchmark', async ({ browser }, testInfo) => {
    test.skip(process.env.LANDSCAPE_SURFACE_COMPARISONS_ONLY !== '1' || phase !== 'after', 'Set LANDSCAPE_SURFACE_PHASE=after and LANDSCAPE_SURFACE_COMPARISONS_ONLY=1 to rebuild saved comparisons');
    const before = JSON.parse(await readFile(path.join(artifacts, '../before/report.json'), 'utf8'));
    const after = JSON.parse(await readFile(path.join(artifacts, 'report.json'), 'utf8'));
    expect(before.complete).toBe(true); expect(after.complete).toBe(true);
    await assertImmutableBaseline(before);
    expect(after.materialQualityFailures).toEqual([]);
    await writeComparisons(browser, String(testInfo.project.use.baseURL), before, after);
});
