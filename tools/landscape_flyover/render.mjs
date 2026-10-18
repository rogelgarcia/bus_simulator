// Renders a landscape flyover video from a versioned route: the validated plan, framing stills at the keys, the frames and the mp4.
// @ts-check
// Design: the route is planned and validated first (clearance over the authoritative ground and the surround, turn rate), and the
// plan's per-frame cameras are flown unchanged. The viewer's requestAnimationFrame is taken over so each video frame advances exactly
// 1/fps of viewer time while the wall clock never runs faster than real time (streaming gets at least the time a live flight would);
// each frame is composed with the HUD in the same task as its render because the WebGL drawing buffer is not preserved. frames/ and
// frames.jsonl are the resumable state, bound to the plan's fingerprint so a changed route never mixes into an earlier render.
import path from 'node:path';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { access, appendFile, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from 'playwright-core';
import { createLandscapeServer } from '../landscape_server/Server.mjs';
import { readLandscapeFileManifest } from '../landscape_authoring/LandscapeFileIO.mjs';
import { createNativeGroundSampler } from '../landscape_review/ReviewPoses.mjs';
import { REVIEW_CAPTURE_DEFAULTS, fitCanvas, settleViewer } from '../landscape_review/capture.mjs';
import { loadFlyoverRoute, planFlyover } from './FlyoverRoute.mjs';
import { encodeMapPng, flyoverMapWindow, loadMapSource, renderFlyoverBaseMap, renderFlyoverPlanMap } from './FlyoverMap.mjs';
import { installFlyoverHud } from './FlyoverHud.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const FLYOVER_DEFAULTS = Object.freeze({
    landscape: 'assets/public/landscape/coastal-city-v3', route: 'tools/landscape_flyover/routes/coastal-v3-features-v1.json', outputRoot: 'tests/artifacts/screens/landscape/flyover',
    fps: 30, width: 1920, height: 1080, quality: 0.92, surround: 'auto', minimapPixels: 512, planPixels: 1024, minimapTrackStride: 5, tailMs: 1000, crf: 17, endHoldSeconds: 1.5
});
const OVERLAY_SELECTOR = '.landscape-ui, #ui-perf-bar';
const USAGE = `Usage: node tools/landscape_flyover/render.mjs [--mode plan|stills|render] [--route <route.json>] [--landscape <saved landscape directory>]
       [--output <directory>] [--fps 30] [--width 1920 --height 1080] [--surround auto|off] [--hud on|off] [--quality 0.92]
       [--from <frame>] [--to <frame>] [--fresh] [--encode on|off] [--keys 3,4,12 (stills only)]`;

/** @param {string} message @returns {never} */
function fail(message) { throw new Error(`[LandscapeFlyover] ${message}`); }
const log = (/** @type {string} */ message) => console.log(`[LandscapeFlyover] ${message}`);
const posix = (/** @type {string} */ value) => value.split(path.sep).join('/');
const shown = (/** @type {string} */ file) => posix(file.startsWith(ROOT + path.sep) ? path.relative(ROOT, file) : file);

/** @param {string|undefined} value @param {string} name @param {number} min @param {number} max */
function parseInteger(value, name, min, max) {
    const number = Number(value);
    if (!Number.isInteger(number) || number < min || number > max) fail(`--${name} must be an integer from ${min} to ${max}; received ${value}`);
    return number;
}

/** @param {string} value @param {string} name */
function parseSwitch(value, name) {
    if (value !== 'on' && value !== 'off') fail(`--${name} must be on or off; received ${value}`);
    return value === 'on';
}

/** @param {readonly string[]} args */
export function parseFlyoverOptions(args) {
    const { values } = parseArgs({ args: [...args], strict: true, options: {
        mode: { type: 'string', default: 'render' }, route: { type: 'string', default: FLYOVER_DEFAULTS.route }, landscape: { type: 'string', default: FLYOVER_DEFAULTS.landscape },
        output: { type: 'string' }, fps: { type: 'string', default: String(FLYOVER_DEFAULTS.fps) }, width: { type: 'string', default: String(FLYOVER_DEFAULTS.width) },
        height: { type: 'string', default: String(FLYOVER_DEFAULTS.height) }, surround: { type: 'string', default: FLYOVER_DEFAULTS.surround }, hud: { type: 'string', default: 'on' },
        quality: { type: 'string', default: String(FLYOVER_DEFAULTS.quality) }, from: { type: 'string' }, to: { type: 'string' }, fresh: { type: 'boolean', default: false },
        encode: { type: 'string', default: 'on' }, keys: { type: 'string' }, help: { type: 'boolean', default: false } } });
    if (values.help) { console.log(USAGE); process.exit(0); }
    const mode = /** @type {string} */ (values.mode);
    if (!['plan', 'stills', 'render'].includes(mode)) fail(`--mode must be plan, stills or render; received ${mode}\n${USAGE}`);
    const surround = /** @type {string} */ (values.surround);
    if (surround !== 'auto' && surround !== 'off') fail(`--surround must be auto or off; received ${surround}`);
    const quality = Number(values.quality);
    if (!(quality > 0.5 && quality <= 1)) fail(`--quality must be in (0.5, 1]; received ${values.quality}`);
    return Object.freeze({ mode, routeFile: path.resolve(ROOT, /** @type {string} */ (values.route)), landscapeDirectory: path.resolve(ROOT, /** @type {string} */ (values.landscape)),
        output: values.output ? path.resolve(values.output) : null, fps: parseInteger(values.fps, 'fps', 1, 120), width: parseInteger(values.width, 'width', 320, 7680),
        height: parseInteger(values.height, 'height', 240, 4320), surround, hud: parseSwitch(/** @type {string} */ (values.hud), 'hud'), quality,
        from: values.from === undefined ? null : parseInteger(values.from, 'from', 0, 1e7), to: values.to === undefined ? null : parseInteger(values.to, 'to', 0, 1e7),
        fresh: /** @type {boolean} */ (values.fresh), encode: parseSwitch(/** @type {string} */ (values.encode), 'encode'),
        keys: values.keys === undefined ? null : values.keys.split(',').map(key => parseInteger(key.trim(), 'keys', 0, 9999)) });
}

/** @param {string} file */
const exists = file => access(file).then(() => true, () => false);

/**
 * Ground for the plan: the authoritative native heights inside the landscape, the surround's natives outside it, null beyond both.
 * @param {string} landscapeDirectory @param {string|null} surroundDirectory
 */
async function createRouteGround(landscapeDirectory, surroundDirectory) {
    const native = await createNativeGroundSampler(landscapeDirectory), far = surroundDirectory ? await createNativeGroundSampler(surroundDirectory) : null;
    const sampler = async (/** @type {number} */ x, /** @type {number} */ z) => (await native(x, z)) ?? (far ? await far(x, z) : null);
    return Object.assign(sampler, { revision: native.revision, bounds: native.bounds });
}

/** @param {any} plan @param {import('./FlyoverRoute.mjs').FlyoverRoute} route */
function printPlan(plan, route) {
    log(`route ${route.id}: ${(plan.lengthMeters / 1000).toFixed(2)} km in ${plan.durationSeconds.toFixed(1)} s (${plan.frameCount} frames at ${plan.fps} fps); min clearance ${plan.summary.minClearance.meters.toFixed(1)} m (frame ${plan.summary.minClearance.frame}), max turn ${plan.summary.maxTurn.degreesPerSecond.toFixed(1)} deg/s (frame ${plan.summary.maxTurn.frame}), max altitude ${plan.summary.maxAltitude.toFixed(0)} m, max speed ${plan.summary.maxSpeed.toFixed(0)} m/s`);
    for (const segment of plan.segments) log(`  K${segment.index}→K${segment.index + 1} ${String(segment.startSeconds.toFixed(1)).padStart(6)}–${segment.endSeconds.toFixed(1).padEnd(6)} s ${String(segment.lengthMeters.toFixed(0)).padStart(5)} m  clearance ≥ ${String(segment.minClearance?.toFixed(1)).padStart(6)} m  turn ≤ ${String(segment.maxTurn?.toFixed(1)).padStart(5)}°/s  ${segment.feature ?? ''}`);
    for (const caption of plan.captions) log(`  F${caption.index + 1} ${caption.startSeconds.toFixed(1)}–${caption.endSeconds.toFixed(1)} s  ${caption.title}`);
    for (const violation of plan.violations) console.error(`[LandscapeFlyover] VIOLATION ${violation}`);
}

/** @param {any} frame @param {number} trackIndex */
const hudState = (frame, trackIndex) => ({ time: frame.time, position: frame.position, headingDegrees: frame.headingDegrees, heightAboveSurface: frame.heightAboveSurface, overWater: frame.overWater,
    altitude: frame.altitude, ground: frame.ground, speed: frame.speed, trackIndex, caption: frame.caption ? { index: frame.caption.index, alpha: frame.caption.alpha } : null });

/** @param {import('playwright-core').Page} page */
async function installClock(page) {
    await page.evaluate(() => {
        const realRaf = window.requestAnimationFrame.bind(window), realCancel = window.cancelAnimationFrame.bind(window);
        const queue = new Map();
        let nextId = 1e9, mode = 'real', now = 0;
        window.requestAnimationFrame = callback => { if (mode === 'real') return realRaf(callback); const id = nextId++; queue.set(id, callback); return id; };
        window.cancelAnimationFrame = id => { if (queue.has(id)) queue.delete(id); else realCancel(id); };
        /** @type {any} */ (window).__flyoverClock = Object.freeze({
            virtual: () => { mode = 'virtual'; now = performance.now(); },
            real: () => { mode = 'real'; const callbacks = [...queue.values()]; queue.clear(); for (const callback of callbacks) realRaf(callback); },
            queued: () => queue.size,
            step: (/** @type {number} */ milliseconds) => { now += milliseconds; const callbacks = [...queue.values()]; queue.clear(); for (const callback of callbacks) callback(now); }
        });
    });
}

/** @param {import('playwright-core').Page} page */
async function enterVirtualClock(page) {
    await page.evaluate(() => /** @type {any} */ (window).__flyoverClock.virtual());
    // the frame callback registered with the real rAF before the switch re-registers through the virtual clock when it fires
    await page.waitForFunction(() => /** @type {any} */ (window).__flyoverClock.queued() > 0, null, { timeout: 10000 });
}

/** @param {{page:import('playwright-core').Page, camera:{position:number[], target:number[]}, fov:number}} options */
async function prewarm({ page, camera, fov }) {
    await page.evaluate(({ camera, fov }) => /** @type {any} */ (window).__landscapeTestHooks.setCamera({ position: camera.position, target: camera.target, projection: 'perspective', fov, zoom: 1 }), { camera, fov });
    const settle = await settleViewer(page, false);
    await page.waitForTimeout(FLYOVER_DEFAULTS.tailMs);
    return settle;
}

/** Opens the viewer on the landscape directory served by a private server, sized and with the DOM overlays hidden. */
async function openViewer({ landscapeDirectory, surround, width, height, revision }) {
    const server = createLandscapeServer({ root: ROOT, landscapeDirectory });
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', () => resolve(undefined)); });
    const origin = `http://127.0.0.1:${/** @type {import('node:net').AddressInfo} */ (server.address()).port}`;
    const executablePath = process.env.PLAYWRIGHT_EXECUTABLE_PATH ?? REVIEW_CAPTURE_DEFAULTS.chromium;
    const browser = await chromium.launch({ executablePath, headless: true, args: [...REVIEW_CAPTURE_DEFAULTS.chromiumArgs] });
    const close = async () => {
        try { await browser.close(); } catch (error) { console.warn('[LandscapeFlyover] browser close failed:', /** @type {Error} */ (error).message); }
        server.closeAllConnections();
        await new Promise(resolve => server.close(() => resolve(undefined)));
    };
    try {
        const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1 });
        const page = await context.newPage(), pageErrors = /** @type {string[]} */ ([]);
        page.on('pageerror', error => pageErrors.push(error.message));
        page.on('console', message => { if (message.type() === 'error' && !message.text().startsWith('Failed to load resource')) pageErrors.push(message.text().slice(0, 500)); });
        page.on('response', response => { if (response.status() >= 400) pageErrors.push(`${response.status()} ${response.url()}`); });
        await page.goto(`${origin}/screens/landscape_fabrication.html${surround === 'auto' ? '' : `?landscapeSurround=${encodeURIComponent(surround)}`}`);
        await page.waitForFunction(() => { const view = /** @type {any} */ (window).__landscapeTestHooks?.snapshot(); return !!view && (view.ready || !!view.lastError); }, null, { timeout: REVIEW_CAPTURE_DEFAULTS.readyTimeoutMs });
        await page.waitForFunction(() => { const view = /** @type {any} */ (window).__landscapeTestHooks.snapshot(); return !!view.lastError || !view.surround || view.surround.status !== 'loading'; }, null, { timeout: REVIEW_CAPTURE_DEFAULTS.readyTimeoutMs });
        const loaded = await page.evaluate(() => { const view = /** @type {any} */ (window).__landscapeTestHooks.snapshot(); return { lastError: view.lastError, revision: view.revision, surround: view.surround ? { status: view.surround.status, revision: view.surround.revision ?? null, reason: view.surround.reason ?? null } : null, water: view.water?.extent ?? null }; });
        if (loaded.lastError) fail(`the viewer failed to load ${landscapeDirectory}: ${loaded.lastError}`);
        if (loaded.revision !== revision) fail(`the viewer shows revision ${loaded.revision} but the plan was made on ${revision}`);
        if (surround === 'auto' && loaded.surround?.status !== 'active') log(`surround not drawn: ${loaded.surround?.status} ${loaded.surround?.reason ?? ''}`);
        const clip = await fitCanvas(page, width, height);
        await page.evaluate(selector => {
            /** @type {any} */ (window).__landscapeTestHooks.setWater(true);
            for (const element of document.querySelectorAll(selector)) /** @type {HTMLElement} */ (element).style.visibility = 'hidden';
        }, OVERLAY_SELECTOR);
        return { page, pageErrors, loaded, clip, close };
    } catch (error) { await close(); throw error; }
}

/** @param {string} file @param {string} dataUrl */
const writeDataUrl = (file, dataUrl) => writeFile(file, Buffer.from(dataUrl.slice(dataUrl.indexOf(',') + 1), 'base64'));

/** @param {string} command @param {readonly string[]} args */
function run(command, args) {
    return new Promise((resolve, reject) => {
        const child = spawn(command, args, { stdio: ['ignore', 'inherit', 'inherit'] });
        child.once('error', reject);
        child.once('exit', code => code === 0 ? resolve(undefined) : reject(new Error(`[LandscapeFlyover] ${command} exited with ${code}`)));
    });
}

/** Resume point: frames 0..K-1 present both as JPEG and as a log line of this plan; later frames and lines are dropped. */
async function resumePoint({ framesDirectory, logFile, from, fresh }) {
    if (fresh) { await rm(framesDirectory, { recursive: true, force: true }); await rm(logFile, { force: true }); }
    await mkdir(framesDirectory, { recursive: true });
    const present = new Set((await readdir(framesDirectory)).filter(name => /^\d{5}\.jpg$/.test(name)).map(name => Number(name.slice(0, 5))));
    const lines = (await readFile(logFile, 'utf8').catch(() => '')).split('\n').filter(Boolean).map(line => JSON.parse(line));
    const logged = new Set(lines.map(line => line.i));
    let contiguous = 0;
    while (present.has(contiguous) && logged.has(contiguous)) contiguous++;
    if (from !== null && from > contiguous) fail(`--from ${from} but only frames 0..${contiguous - 1} are present`);
    const start = from ?? contiguous;
    const kept = lines.filter(line => line.i < start).sort((a, b) => a.i - b.i);
    await writeFile(logFile, kept.map(line => JSON.stringify(line)).join('\n') + (kept.length ? '\n' : ''));
    for (const frame of present) if (frame >= start) await rm(path.join(framesDirectory, `${String(frame).padStart(5, '0')}.jpg`), { force: true });
    return start;
}

async function main() {
    const options = parseFlyoverOptions(process.argv.slice(2));
    const route = await loadFlyoverRoute(options.routeFile);
    const { manifest } = await readLandscapeFileManifest(options.landscapeDirectory);
    if (manifest.id !== route.landscapeId) fail(`route ${route.id} is authored for ${route.landscapeId}, not ${manifest.id}`);
    const surroundDirectory = options.surround === 'auto' && await exists(path.join(options.landscapeDirectory, 'surround', 'manifest.json')) ? path.join(options.landscapeDirectory, 'surround') : null;
    const output = options.output ?? path.join(ROOT, FLYOVER_DEFAULTS.outputRoot, route.id);
    await mkdir(output, { recursive: true });

    // plan: validate the flown path against the ground before anything is rendered
    const ground = await createRouteGround(options.landscapeDirectory, surroundDirectory);
    const plan = await planFlyover(route, { fps: options.fps, seaLevel: manifest.coordinates.seaLevel, sampleGround: ground });
    const fingerprint = createHash('sha256').update(JSON.stringify({ route, fps: options.fps, width: options.width, height: options.height, hud: options.hud, quality: options.quality, surround: options.surround, revision: manifest.revision })).digest('hex').slice(0, 24);
    const mapWindow = flyoverMapWindow(plan.frames);
    const sources = [await loadMapSource(options.landscapeDirectory, mapWindow, (mapWindow.maxX - mapWindow.minX) / FLYOVER_DEFAULTS.planPixels)];
    if (surroundDirectory) sources.push(await loadMapSource(surroundDirectory, mapWindow, (mapWindow.maxX - mapWindow.minX) / FLYOVER_DEFAULTS.planPixels));
    const extent = manifest.bounds, seaLevel = manifest.coordinates.seaLevel;
    const planMap = renderFlyoverPlanMap(renderFlyoverBaseMap({ window: mapWindow, size: FLYOVER_DEFAULTS.planPixels, sources, seaLevel, extent }), mapWindow, plan, `${route.id.toUpperCase()}  ${plan.durationSeconds.toFixed(0)} S  ${(plan.lengthMeters / 1000).toFixed(1)} KM`);
    await writeFile(path.join(output, 'plan.png'), encodeMapPng(planMap));
    await writeFile(path.join(output, 'plan.json'), `${JSON.stringify({ ...plan, fingerprint, landscape: { id: manifest.id, revision: manifest.revision, directory: shown(options.landscapeDirectory) }, surround: surroundDirectory ? shown(surroundDirectory) : null, window: mapWindow }, null, 1)}\n`);
    printPlan(plan, route);
    log(`plan -> ${shown(path.join(output, 'plan.json'))}, ${shown(path.join(output, 'plan.png'))}`);
    if (plan.violations.length) fail(`the route violates its limits (${plan.violations.length}); fix the keys before rendering`);
    if (options.mode === 'plan') return;

    const minimapBase = renderFlyoverBaseMap({ window: mapWindow, size: FLYOVER_DEFAULTS.minimapPixels, sources, seaLevel, extent });
    const track = plan.frames.filter((_, index) => index % FLYOVER_DEFAULTS.minimapTrackStride === 0).map(frame => /** @type {[number, number]} */ ([+frame.position[0].toFixed(1), +frame.position[2].toFixed(1)]));
    const trackIndex = (/** @type {number} */ frame) => Math.floor(frame / FLYOVER_DEFAULTS.minimapTrackStride);
    const hudConfig = { quality: options.quality, fovDegrees: route.camera.fovDegrees, durationSeconds: plan.durationSeconds, features: route.features.map(feature => ({ title: feature.title, caption: feature.caption })),
        minimap: { dataUrl: `data:image/png;base64,${encodeMapPng(minimapBase).toString('base64')}`, window: mapWindow, track } };
    const viewer = await openViewer({ landscapeDirectory: options.landscapeDirectory, surround: options.surround, width: options.width, height: options.height, revision: manifest.revision });
    const { page } = viewer;
    try {
        await page.evaluate(installFlyoverHud, hudConfig);
        await installClock(page);
        const capture = async (/** @type {any} */ frame) => page.evaluate(({ state, hud }) => {
            const clock = /** @type {any} */ (window).__flyoverClock;
            clock.step(0);
            return hud ? /** @type {any} */ (window).__flyoverHud.compose(state) : /** @type {any} */ (window).__flyoverHud.raw();
        }, { state: hudState(frame, trackIndex(frame.frame)), hud: options.hud });

        if (options.mode === 'stills') {
            const stillsDirectory = path.join(output, 'stills');
            await mkdir(stillsDirectory, { recursive: true });
            const receipts = [];
            for (const [key, seconds] of plan.keyTimes.entries()) {
                if (options.keys && !options.keys.includes(key)) continue;
                const frame = plan.frames[Math.min(plan.frames.length - 1, Math.round(seconds * options.fps))];
                await page.evaluate(() => /** @type {any} */ (window).__flyoverClock.real());
                const settle = await prewarm({ page, camera: frame, fov: route.camera.fovDegrees });
                await enterVirtualClock(page);
                const file = path.join(stillsDirectory, `key-${String(key).padStart(2, '0')}.jpg`);
                await writeDataUrl(file, await capture(frame));
                receipts.push({ key, frame: frame.frame, time: frame.time, file: path.basename(file), settled: settle.settled, waitedMs: settle.waitedMs, position: frame.position, target: frame.target });
                log(`key ${key} (t ${frame.time.toFixed(1)} s, frame ${frame.frame}) ${settle.settled ? 'settled' : 'NOT settled'} in ${(settle.waitedMs / 1000).toFixed(1)} s -> ${shown(file)}`);
            }
            await writeFile(path.join(stillsDirectory, `stills${options.keys ? `-${options.keys.join('-')}` : ''}.json`), `${JSON.stringify({ route: route.id, fingerprint, viewer: viewer.loaded, stills: receipts, pageErrors: viewer.pageErrors }, null, 1)}\n`);
            return;
        }

        const framesDirectory = path.join(output, 'frames'), logFile = path.join(output, 'frames.jsonl'), stateFile = path.join(output, 'render.json');
        const previous = await readFile(stateFile, 'utf8').then(text => JSON.parse(text), () => null);
        if (!options.fresh && previous && previous.fingerprint !== fingerprint) fail(`frames in ${shown(output)} belong to another plan (${previous.fingerprint}); re-run with --fresh`);
        const start = await resumePoint({ framesDirectory, logFile, from: options.from, fresh: options.fresh });
        const end = Math.min(plan.frameCount - 1, options.to ?? plan.frameCount - 1);
        const status = { fingerprint, route: route.id, frameCount: plan.frameCount, start, end, state: 'prewarm', frame: start, startedAt: new Date().toISOString(), updatedAt: '', viewer: viewer.loaded };
        const writeStatus = async (/** @type {object} */ patch) => { Object.assign(status, patch, { updatedAt: new Date().toISOString() }); await writeFile(stateFile, `${JSON.stringify(status, null, 1)}\n`); };
        await writeStatus({});
        if (start > end) log(`nothing to render: frames 0..${start - 1} already present`);
        else {
            const settle = await prewarm({ page, camera: plan.frames[start], fov: route.camera.fovDegrees });
            log(`prewarm at frame ${start}: ${settle.settled ? 'settled' : 'NOT settled'} in ${(settle.waitedMs / 1000).toFixed(1)} s; rendering frames ${start}..${end}`);
            await enterVirtualClock(page);
            await writeStatus({ state: 'rendering' });
            const started = Date.now(), dtMs = 1000 / options.fps;
            let stepMs = 0, writeMs = 0;
            for (let index = start; index <= end; index++) {
                const due = started + (index - start) * dtMs;
                if (Date.now() < due) await new Promise(resolve => setTimeout(resolve, due - Date.now()));
                const frame = plan.frames[index], wall = Date.now();
                const result = await page.evaluate(({ camera, state, hud, dtMs }) => {
                    const hooks = /** @type {any} */ (window).__landscapeTestHooks, began = performance.now();
                    hooks.setCamera({ position: camera.position, target: camera.target });
                    /** @type {any} */ (window).__flyoverClock.step(dtMs);
                    const rendered = performance.now();
                    const image = hud ? /** @type {any} */ (window).__flyoverHud.compose(state) : /** @type {any} */ (window).__flyoverHud.raw();
                    const view = hooks.snapshot(), levels = (view.streaming?.lods ?? []).map((/** @type {any} */ lod) => lod.level);
                    return { image, stream: { pending: view.streaming?.pending ?? null, tiles: view.streaming?.residentLeafIds?.length ?? null, lod: levels.length ? [Math.min(...levels), Math.max(...levels)] : null,
                        appearancePending: view.appearance?.pending ?? null, surroundTiles: view.surround?.tiles ?? null, surroundPending: view.surround?.pending ?? null }, ms: { render: rendered - began, compose: performance.now() - rendered } };
                }, { camera: { position: frame.position, target: frame.target }, state: hudState(frame, trackIndex(index)), hud: options.hud, dtMs });
                const written = Date.now();
                await writeDataUrl(path.join(framesDirectory, `${String(index).padStart(5, '0')}.jpg`), result.image);
                await appendFile(logFile, `${JSON.stringify({ i: index, t: frame.time, position: frame.position, target: frame.target, heightAboveSurface: frame.heightAboveSurface, overWater: frame.overWater, altitude: frame.altitude, ground: frame.ground, speed: frame.speed, caption: frame.caption, stream: result.stream, ms: { ...result.ms, wall: written - wall } })}\n`);
                stepMs += written - wall; writeMs += Date.now() - written;
                if (index % 150 === 0 || index === end) {
                    const done = index - start + 1, elapsed = (Date.now() - started) / 1000;
                    log(`frame ${index}/${plan.frameCount - 1} t ${frame.time.toFixed(1)} s · ${frame.heightAboveSurface.toFixed(0)} m above ${frame.overWater ? 'water' : 'ground'} · pending ${result.stream.pending} · ${(done / elapsed).toFixed(1)} fps wall (frame ${(stepMs / done).toFixed(0)} ms, write ${(writeMs / done).toFixed(0)} ms)`);
                    await writeStatus({ frame: index, elapsedSeconds: +elapsed.toFixed(1), wallFps: +(done / elapsed).toFixed(2) });
                }
            }
        }
        await writeStatus({ state: 'rendered', pageErrors: viewer.pageErrors });
    } finally {
        await viewer.close();
    }
    if (options.mode !== 'render' || !options.encode) return;
    const framesDirectory = path.join(output, 'frames'), present = new Set((await readdir(framesDirectory)).filter(name => /^\d{5}\.jpg$/.test(name)));
    const missing = plan.frames.filter(frame => !present.has(`${String(frame.frame).padStart(5, '0')}.jpg`)).length;
    if (missing) { log(`not encoding: ${missing} of ${plan.frameCount} frames are missing`); return; }
    const video = path.join(output, `${route.id}.mp4`);
    await run('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-framerate', String(options.fps), '-i', path.join(framesDirectory, '%05d.jpg'), '-vf', `tpad=stop_mode=clone:stop_duration=${FLYOVER_DEFAULTS.endHoldSeconds}`, '-c:v', 'libx264', '-preset', 'slow', '-crf', String(FLYOVER_DEFAULTS.crf), '-pix_fmt', 'yuv420p', '-movflags', '+faststart', video]);
    log(`video -> ${shown(video)}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
    main().catch(error => { console.error(error instanceof Error && error.message.startsWith('[LandscapeFlyover]') ? error.message : error); process.exitCode = 1; });
}
