// Measures the ecosystem's cost at the natural-world review poses for the AI 599 D5 scaling table: resident tiles and instances, draws, triangles,
// share bytes, uploads, CPU and GPU frame time at one published density (LANDSCAPE_ECOSYSTEM_SCALE_LABEL names the run, for example off, x1, x2, x4;
// LANDSCAPE_ECOSYSTEM_SCALE_MODE=off measures the viewer without the ecosystem), plus one travel segment between two poses. The suite serves the
// landscape itself on the verification port like the ecosystem suite; every run writes report.json and report.md under
// tests/artifacts/screens/landscape/ai599/d5/scaling/<label>/ and the D5 record composes the runs into the scaling curves.
import { test, expect } from '@playwright/test';
import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createLandscapeServer } from '../../../tools/landscape_server/Server.mjs';
import { createNativeGroundSampler, loadReviewPoses, resolveReviewPose } from '../../../tools/landscape_review/ReviewPoses.mjs';
import { landscapeViewerUrl } from '../../shared/landscape_viewer_url.js';

const root = path.resolve('.');
const MiB = 1024 * 1024;
const landscapeDirectory = path.resolve(root, process.env.LANDSCAPE_ECOSYSTEM_SCALE_LANDSCAPE ?? 'assets/public/landscape/coastal-city-v3');
const label = process.env.LANDSCAPE_ECOSYSTEM_SCALE_LABEL ?? 'x1';
const mode = process.env.LANDSCAPE_ECOSYSTEM_SCALE_MODE ?? 'auto';
const artifacts = path.resolve(root, `tests/artifacts/screens/landscape/ai599/d5/scaling/${label}`);
const posesFile = path.resolve(root, 'tools/landscape_review/poses/natural-world-v1.json');
const POSE_IDS = (process.env.LANDSCAPE_ECOSYSTEM_SCALE_POSES ?? 'NW-03,NW-04,NW-06,NW-07,NW-10').split(',');
const TRAVEL = { from: 'NW-03', to: 'NW-04', frames: 90 };
const viewport = { width: 1920, height: 1080 }, warmupFrames = 30, sampleFrames = 120;
test.use({ viewport, deviceScaleFactor: 1, video: 'off', trace: 'off' });

async function exists(file) { try { await access(file); return true; } catch { return false; } }

async function serve(directory, baseURL) {
    const url = new URL(baseURL);
    const server = createLandscapeServer({ root, landscapeDirectory: directory });
    await new Promise((resolve, reject) => {
        server.once('error', error => reject(new Error(`cannot listen on ${baseURL} (${error.code}); stop the other landscape server before this suite`)));
        server.listen(Number(url.port), url.hostname, () => resolve(undefined));
    });
    return server;
}

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

const settledState = () => {
    const state = window.__landscapeTestHooks.snapshot();
    const surround = !state.surround || (state.surround.settled && (state.surround.pending ?? 0) === 0), ocean = !state.ocean || state.ocean.settled;
    const ecosystem = !state.ecosystem || state.ecosystem.status === 'off' || (state.ecosystem.status !== 'loading' && (state.ecosystem.settled ?? true));
    return { lastError: state.lastError, settled: !!state.ready && state.streaming.settled && state.streaming.pending === 0 && !!state.appearance?.settled && !!state.planning.settled && surround && ocean && ecosystem };
};

/** Flies or jumps to a view, waits for two settled rounds, then samples warmupFrames + sampleFrames through the performance capture. */
async function measureStop(page, stop) {
    return page.evaluate(async ({ stop, warmupFrames, sampleFrames }) => {
        const hooks = window.__landscapeTestHooks, wait = () => new Promise(resolve => requestAnimationFrame(resolve));
        const capture = hooks.beginPerformanceCapture({ maxFrames: 4096 });
        const began = performance.now(), initial = hooks.snapshot();
        if (stop.travelFrames) {
            for (let step = 1; step <= stop.travelFrames; step++) {
                const fraction = step / stop.travelFrames, interpolate = key => initial.camera[key].map((value, index) => value + (stop.view[key][index] - value) * fraction);
                hooks.setCamera({ ...stop.view, position: interpolate('position'), target: interpolate('target') });
                await wait();
            }
        } else hooks.setCamera(stop.view);
        const cameraAppliedAtMs = performance.now();
        let stable = 0, state;
        do {
            for (let index = 0; index < 6; index++) await wait();
            state = hooks.snapshot();
            if (state.lastError) throw new Error(state.lastError);
            const surround = !state.surround || (state.surround.settled && (state.surround.pending ?? 0) === 0), ocean = !state.ocean || state.ocean.settled;
            const ecosystem = !state.ecosystem || state.ecosystem.status === 'off' || (state.ecosystem.status !== 'loading' && (state.ecosystem.settled ?? true));
            stable = state.streaming.settled && state.streaming.pending === 0 && state.appearance.settled && state.planning.settled && surround && ocean && ecosystem ? stable + 1 : 0;
            if (performance.now() - began > 120000) throw new Error(`the viewer did not settle at ${stop.id}`);
        } while (stable < 2);
        const settledAtMs = performance.now();
        for (let index = 0; index < warmupFrames; index++) await wait();
        const sampleStartMs = performance.now();
        for (let index = 0; index < sampleFrames; index++) await wait();
        const sampleEndMs = performance.now();
        for (let index = 0; index < 4; index++) await wait();
        const result = hooks.endPerformanceCapture(), final = hooks.snapshot();
        const ecosystem = final.ecosystem ?? null, renderer = ecosystem?.renderer ?? null;
        return { capture: result, travelMs: cameraAppliedAtMs - began, settledAfterCameraMs: settledAtMs - cameraAppliedAtMs, sampleStartElapsedMs: sampleStartMs - capture.startedAtMs, sampleEndElapsedMs: sampleEndMs - capture.startedAtMs,
            state: { camera: final.camera, budget: { cpuBytes: final.budget.cpuBytes, gpuBytes: final.budget.gpuBytes, peakCpuBytes: final.budget.peakCpuBytes, peakGpuBytes: final.budget.peakGpuBytes, limits: final.budget.limits },
                renderer: { calls: final.renderer.calls, triangles: final.renderer.triangles, geometries: final.renderer.memory.geometries, textures: final.renderer.memory.textures },
                streaming: { tiles: final.streaming.residentLeafIds.length, triangles: final.streaming.triangles, targetMet: final.streaming.targetMet, degradationReason: final.streaming.degradationReason },
                ecosystem: ecosystem ? { status: ecosystem.status, reason: ecosystem.reason ?? null, revision: ecosystem.revision ?? null, resident: ecosystem.resident ?? 0, residentInstances: ecosystem.residentInstances ?? 0, drawnInstances: ecosystem.drawnInstances ?? 0,
                    degradationReason: ecosystem.degradationReason ?? null, standing: ecosystem.standing ?? null, share: ecosystem.share ?? null, runtime: ecosystem.runtime ?? null, timing: ecosystem.timing ?? null, uploadedBytesPerFrame: ecosystem.uploadedBytesPerFrame ?? 0, peakUploadedBytesPerFrame: ecosystem.peakUploadedBytesPerFrame ?? 0,
                    layers: (ecosystem.layers ?? []).map(layer => ({ id: layer.id, generation: layer.generation, resident: layer.resident, instances: layer.instances, drawn: layer.drawn, cpuBytes: layer.cpuBytes, gpuBytes: layer.gpuBytes, degraded: layer.degraded })),
                    draws: renderer?.draws ?? 0, triangles: renderer?.triangles ?? 0, trianglesVisible: renderer?.trianglesVisible ?? 0, meshes: renderer ? Object.values(renderer.byLayer ?? {}).reduce((sum, entry) => sum + entry.meshes, 0) : 0,
                    frameCostMs: renderer?.frameCostMs ?? null, programCompile: renderer?.programCompile ?? null, assets: renderer?.share ?? null } : null,
                peakUploadedBytesPerFrame: final.peakUploadedBytesPerFrame } };
    }, { stop, warmupFrames, sampleFrames });
}

function summarize(measured) {
    const frames = unpack(measured.capture.frames, measured.capture.columns), gpu = unpack(measured.capture.gpu, measured.capture.gpuColumns);
    const sampled = frames.filter(frame => frame.elapsedMs >= measured.sampleStartElapsedMs && frame.elapsedMs <= measured.sampleEndElapsedMs), submissions = new Set(sampled.map(frame => frame.gpuSubmission));
    const gpuValues = gpu.filter(sample => submissions.has(sample.submission)).map(sample => sample.ms);
    const transitioning = frames.slice(0, Math.max(0, frames.length - warmupFrames - sampleFrames - 4)), transitionSubmissions = new Set(transitioning.map(frame => frame.gpuSubmission));
    const frameMs = statistics(sampled.map(frame => frame.intervalMs));
    return { sampleCount: sampled.length, frameMs, fps: frameMs ? 1000 / frameMs.mean : null, cpuFrameMs: statistics(sampled.map(frame => frame.cpuFrameMs)),
        gpuMs: gpuValues.length ? { status: 'measured', ...statistics(gpuValues) } : { status: 'not measured', reason: measured.capture.finalGpu.disabledReason ?? 'no completed GPU timer queries matched the window' },
        drawCalls: statistics(sampled.map(frame => frame.drawCalls)), triangles: statistics(sampled.map(frame => frame.triangles)), uploadedBytes: frames.reduce((sum, frame) => sum + frame.uploadedBytes, 0),
        peakUploadedBytesPerFrame: frames.length ? Math.max(...frames.map(frame => frame.uploadedBytes)) : 0, travelMs: measured.travelMs, settledAfterCameraMs: measured.settledAfterCameraMs,
        transition: { frames: transitioning.length, frameMs: statistics(transitioning.map(frame => frame.intervalMs)), cpuFrameMs: statistics(transitioning.map(frame => frame.cpuFrameMs)), gpuMs: statistics(gpu.filter(sample => transitionSubmissions.has(sample.submission)).map(sample => sample.ms)) },
        state: measured.state };
}

const number = value => value === null || value === undefined ? '—' : Number(value).toFixed(2);

function table(report) {
    const rows = report.stops.map(stop => {
        const e = stop.state.ecosystem;
        return `| ${stop.id} | ${e ? e.status : 'off'} | ${e ? e.resident : 0} | ${e ? e.residentInstances : 0} | ${e ? e.drawnInstances : 0} | ${e ? e.draws : 0} | ${e ? e.triangles.toLocaleString('en-US') : 0} | ${e?.share ? number(e.share.cpuBytes / MiB) + ' / ' + number(e.share.gpuBytes / MiB) : '—'} | ${number(stop.frameMs?.median)} / ${number(stop.frameMs?.p95)} | ${number(stop.cpuFrameMs?.median)} | ${stop.gpuMs.status === 'measured' ? number(stop.gpuMs.median) + ' / ' + number(stop.gpuMs.p95) : 'not measured'} | ${number(stop.drawCalls?.median)} | ${stop.triangles ? Math.round(stop.triangles.median).toLocaleString('en-US') : '—'} | ${number(stop.peakUploadedBytesPerFrame / MiB)} | ${number(stop.state.budget.cpuBytes / MiB)} / ${number(stop.state.budget.gpuBytes / MiB)} |`;
    });
    return `# Ecosystem scaling run ${report.label}\n\nMeasured ${report.createdAt} on ${report.hardware.cpuModel}, ${report.metadata?.renderer?.renderer ?? 'GPU unknown'}; viewer ${report.viewerUrl}; landscape ${report.landscape.id} ${report.landscape.revision}; ecosystem sidecar ${report.ecosystem?.revision ?? 'none'} (${report.ecosystem?.status ?? 'off'}); ${warmupFrames} warm-up and ${sampleFrames} sampled frames per stop after two settled rounds.\n\n| Stop | Ecosystem | Tiles | Instances | Drawn | Eco draws | Eco triangles | Share CPU / GPU MiB | Frame median / p95 ms | CPU frame median ms | GPU median / p95 ms | Draw calls (all) | Triangles (all) | Peak upload MiB/frame | Ledger CPU / GPU MiB |\n| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |\n${rows.join('\n')}\n`;
}

test(`Landscape AI 599 D5: ecosystem scaling run ${label} (${mode}) at the natural-world poses`, async ({ browser }, testInfo) => {
    test.setTimeout(20 * 60 * 1000);
    const baseURL = String(testInfo.project.use.baseURL);
    expect(new URL(baseURL).port, 'Landscape verification uses port 8002').toBe('8002');
    test.skip(!(await exists(path.join(landscapeDirectory, 'manifest.json'))), `${landscapeDirectory} is not installed`);
    await mkdir(artifacts, { recursive: true });
    const landscape = JSON.parse(await readFile(path.join(landscapeDirectory, 'manifest.json'), 'utf8'));
    const poses = await loadReviewPoses(posesFile), sampleGround = await createNativeGroundSampler(landscapeDirectory), views = {};
    for (const id of [...POSE_IDS, TRAVEL.from, TRAVEL.to]) {
        const pose = poses.poses.find(entry => entry.id === id);
        expect(pose, `pose ${id}`).toBeTruthy();
        views[id] = await resolveReviewPose(pose, sampleGround);
    }
    const server = await serve(landscapeDirectory, baseURL);
    const context = await browser.newContext({ baseURL, viewport, deviceScaleFactor: 1 });
    const page = await context.newPage(), errors = [], warnings = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error' && /shader|webgl|program|THREE/i.test(message.text())) errors.push(message.text()); if (message.type() === 'warning') warnings.push(message.text().slice(0, 300)); });
    const viewerUrl = landscapeViewerUrl(`/screens/landscape_fabrication.html?landscapeEcosystem=${mode}`);
    const report = { format: 'landscape-ecosystem-scaling', schemaVersion: 1, label, mode, createdAt: new Date().toISOString(), hardware: { cpuModel: os.cpus()[0]?.model ?? 'unknown', logicalCpus: os.cpus().length, ramBytes: os.totalmem() },
        landscape: { id: landscape.id, revision: landscape.revision, directory: landscapeDirectory }, viewerUrl, stops: [], travel: null, errors, warnings, metadata: null, ecosystem: null };
    try {
        await page.goto(viewerUrl);
        await page.waitForFunction(() => { const state = window.__landscapeTestHooks?.snapshot(); if (state?.lastError) throw new Error(state.lastError); return !!state?.ready; }, null, { timeout: 180000 });
        await page.waitForFunction(() => { const state = window.__landscapeTestHooks.snapshot(); return !state.ecosystem || state.ecosystem.status !== 'loading'; }, null, { timeout: 180000 });
        await page.waitForFunction(settledState, null, { timeout: 180000 });
        const boot = await page.evaluate(() => window.__landscapeTestHooks.snapshot());
        report.metadata = await page.evaluate(() => window.__landscapeTestHooks.performanceMetadata());
        report.ecosystem = boot.ecosystem ? { status: boot.ecosystem.status, reason: boot.ecosystem.reason ?? null, revision: boot.ecosystem.revision ?? null, recipeId: boot.ecosystem.recipeId ?? null, binding: boot.ecosystem.binding ?? null, loadMs: boot.ecosystem.loadMs ?? null,
            layers: (boot.ecosystem.layers ?? []).map(layer => ({ id: layer.id, generation: layer.generation, published: layer.published ?? null })), assets: boot.ecosystem.renderer?.share ?? null, programCompile: boot.ecosystem.renderer?.programCompile ?? null } : null;
        if (mode !== 'off') expect(['active', 'active-partial'], `ecosystem ${boot.ecosystem?.status}: ${boot.ecosystem?.reason}`).toContain(boot.ecosystem?.status);
        await page.evaluate(() => { for (const element of document.querySelectorAll('header, aside, footer, .perf-bar, #perf-bar')) element.style.visibility = 'hidden'; });
        for (const id of POSE_IDS) {
            const view = views[id], stop = { id, view: { position: view.position, target: view.target, projection: view.projection, fov: view.fov, zoom: view.zoom } };
            const summary = summarize(await measureStop(page, stop));
            report.stops.push({ id, groundHeight: view.groundHeight, ...summary });
            await page.screenshot({ path: path.join(artifacts, `${id}.png`), animations: 'disabled' });
            console.log(`[ecosystem scaling ${label}] ${id}: ${summary.state.ecosystem ? `${summary.state.ecosystem.resident} tiles, ${summary.state.ecosystem.residentInstances} instances, ${summary.state.ecosystem.draws} draws` : 'ecosystem off'}; frame ${number(summary.frameMs?.median)} ms, GPU ${summary.gpuMs.status === 'measured' ? number(summary.gpuMs.median) : 'n/a'} ms`);
        }
        const from = views[TRAVEL.from], to = views[TRAVEL.to];
        await measureStop(page, { id: 'travel-start', view: { position: from.position, target: from.target, projection: from.projection, fov: from.fov, zoom: from.zoom } });
        const travel = summarize(await measureStop(page, { id: 'travel', view: { position: to.position, target: to.target, projection: to.projection, fov: to.fov, zoom: to.zoom }, travelFrames: TRAVEL.frames }));
        report.travel = { from: TRAVEL.from, to: TRAVEL.to, frames: TRAVEL.frames, ...travel };
        expect(report.travel.peakUploadedBytesPerFrame).toBeLessThanOrEqual(8 * MiB);
        for (const stop of report.stops) { expect(stop.state.budget.cpuBytes).toBeLessThanOrEqual(stop.state.budget.limits.cpuBytes); expect(stop.state.budget.gpuBytes).toBeLessThanOrEqual(stop.state.budget.limits.gpuBytes); }
        expect(errors, errors.join('\n')).toEqual([]);
    } finally {
        await page.evaluate(() => window.__landscapeTestHooks.dispose()).catch(() => {});
        await context.close();
        server.closeAllConnections();
        await new Promise(resolve => server.close(() => resolve(undefined)));
        await writeFile(path.join(artifacts, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
        await writeFile(path.join(artifacts, 'report.md'), table(report));
    }
});
