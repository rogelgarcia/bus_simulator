// Captures the review poses from the headless landscape viewer with matched cameras and writes a receipt per pose.
// @ts-check
// The viewer is deterministic once its streaming, appearance and lighting have settled, so each capture sets the camera resolved from
// the pose file against the landscape's own native ground, waits for that settled state on two consecutive polls plus a fixed tail of
// frames, hides the DOM overlays (header, panels, footer and the global performance bar sit over the canvas) and clips the screenshot to
// the WebGL canvas, which the viewport is enlarged to make exactly the requested size. Server, page and browser always close.
import path from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from 'playwright-core';
import { createLandscapeServer } from '../landscape_server/Server.mjs';
import { createNativeGroundSampler, loadReviewPoses, resolveReviewPose } from './ReviewPoses.mjs';

export const REVIEW_CAPTURE_FORMAT = 'landscape-review-capture';
export const REVIEW_CAPTURES_FORMAT = 'landscape-review-captures';
export const REVIEW_CAPTURE_DEFAULTS = Object.freeze({
    poses: 'tools/landscape_review/poses/natural-world-v1.json', width: 1920, height: 1080, water: true, planning: false, allowMissingAppearance: false,
    chromium: 'C:/Users/rogel/AppData/Local/ms-playwright/chromium-1234/chrome-win64/chrome.exe',
    chromiumArgs: Object.freeze(['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist']),
    readyTimeoutMs: 180000, settleTimeoutMs: 120000, settlePollMs: 250, tailMs: 1500, sizeTimeoutMs: 10000
});
/** The one appearance error a landscape saved without an appearance sidecar produces (the viewer then draws its fallback soil colors). */
export const MISSING_APPEARANCE_ERROR = '[Landscape] appearance manifest HTTP 404';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const PLANNING_LAYERS = Object.freeze(['districts', 'roads', 'shoreline', 'points', 'corridors']);
const OVERLAY_SELECTOR = '.landscape-ui, #ui-perf-bar';
const USAGE = `Usage: node tools/landscape_review/capture.mjs --landscape <saved landscape directory> --output <directory>
       [--poses <pose file>] [--select NW-01,NW-04] [--label <text>] [--water on|off] [--planning on|off] [--width 1920 --height 1080]
       [--allow-missing-appearance on|off]`;

/** @typedef {{landscapeDirectory:string,outputDirectory:string,posesFile:string,select:readonly string[]|null,label:string,water:boolean,planning:boolean,width:number,height:number,allowMissingAppearance:boolean}} CaptureOptions */

/** @param {string} message @returns {never} */
function fail(message) { throw new Error(`[LandscapeReview] ${message}`); }

/** @param {string} value */
const posix = value => value.split(path.sep).join('/');

/** @param {string} file */
const shown = file => posix(file.startsWith(ROOT + path.sep) ? path.relative(ROOT, file) : file);

/** @param {string} value @param {string} name */
function parseSwitch(value, name) {
    if (value !== 'on' && value !== 'off') fail(`--${name} must be on or off; received ${value}`);
    return value === 'on';
}

/** @param {string} value @param {string} name */
function parseSize(value, name) {
    const size = Number(value);
    if (!Number.isInteger(size) || size < 320 || size > 7680) fail(`--${name} must be an integer from 320 to 7680; received ${value}`);
    return size;
}

/** @param {readonly string[]} args @returns {CaptureOptions} */
export function parseCaptureOptions(args) {
    const { values } = parseArgs({ args: [...args], strict: true, options: {
        landscape: { type: 'string' }, output: { type: 'string' }, poses: { type: 'string', default: REVIEW_CAPTURE_DEFAULTS.poses }, select: { type: 'string' },
        label: { type: 'string' }, water: { type: 'string', default: 'on' }, planning: { type: 'string', default: 'off' },
        width: { type: 'string', default: String(REVIEW_CAPTURE_DEFAULTS.width) }, height: { type: 'string', default: String(REVIEW_CAPTURE_DEFAULTS.height) },
        'allow-missing-appearance': { type: 'string', default: 'off' } } });
    if (!values.landscape || !values.output) fail(`--landscape and --output are required\n${USAGE}`);
    const select = values.select === undefined ? null : values.select.split(',').map(id => id.trim()).filter(Boolean);
    if (select && !select.length) fail('--select needs at least one pose id');
    const landscapeDirectory = path.resolve(values.landscape);
    return Object.freeze({ landscapeDirectory, outputDirectory: path.resolve(values.output), posesFile: path.resolve(/** @type {string} */ (values.poses)), select: select && Object.freeze(select),
        label: values.label ?? path.basename(landscapeDirectory), water: parseSwitch(/** @type {string} */ (values.water), 'water'), planning: parseSwitch(/** @type {string} */ (values.planning), 'planning'),
        width: parseSize(/** @type {string} */ (values.width), 'width'), height: parseSize(/** @type {string} */ (values.height), 'height'),
        allowMissingAppearance: parseSwitch(/** @type {string} */ (values['allow-missing-appearance']), 'allow-missing-appearance') });
}

/** @param {readonly any[]} errors appearance errors as the viewer reports them ({message} records, or strings) */
const errorMessages = errors => errors.map(error => typeof error === 'string' ? error : error?.message ?? JSON.stringify(error));

/** @param {import('playwright-core').Page} page */
const snapshot = page => page.evaluate(() => window.__landscapeTestHooks.snapshot());

/** @param {import('playwright-core').Page} page @param {number} frames @param {number} timeoutMs */
async function renderedFrames(page, frames, timeoutMs) {
    const start = await page.evaluate(() => window.__landscapeTestHooks.snapshot().frameIndex);
    await page.waitForFunction(({ start, frames }) => window.__landscapeTestHooks.snapshot().frameIndex >= start + frames, { start, frames }, { timeout: timeoutMs });
}

/** @param {import('playwright-core').Page} page @param {number} width @param {number} height */
async function fitCanvas(page, width, height) {
    const size = () => page.evaluate(() => window.__landscapeTestHooks.snapshot().canvas);
    let canvas = await size();
    for (let attempt = 0; attempt < 3 && (canvas.width !== width || canvas.height !== height); attempt++) {
        const viewport = page.viewportSize() ?? fail('the page has no viewport');
        await page.setViewportSize({ width: viewport.width + (width - canvas.width), height: viewport.height + (height - canvas.height) });
        const deadline = Date.now() + REVIEW_CAPTURE_DEFAULTS.sizeTimeoutMs;
        while (Date.now() < deadline && ((canvas = await size()).width !== width || canvas.height !== height)) await page.waitForTimeout(200);
    }
    if (canvas.width !== width || canvas.height !== height) fail(`the viewer canvas is ${canvas.width}x${canvas.height}, not ${width}x${height}`);
    const clip = await page.evaluate(() => { const rect = document.getElementById('game-canvas')?.getBoundingClientRect(); return rect ? { x: rect.left, y: rect.top, width: rect.width, height: rect.height } : null; });
    if (!clip || [clip.x, clip.y, clip.width, clip.height].some(value => !Number.isInteger(value)) || clip.width !== width || clip.height !== height) fail(`the canvas element is not an integer ${width}x${height} box: ${JSON.stringify(clip)}`);
    return clip;
}

/**
 * Waits for a settled viewer. Appearance errors abort the capture, except, with allowMissingAppearance, the single error of a landscape saved without an
 * appearance sidecar (MISSING_APPEARANCE_ERROR): the viewer is settled on its fallback soil colors and the error is returned for the receipt.
 * @param {import('playwright-core').Page} page @param {boolean} allowMissingAppearance
 */
async function settleViewer(page, allowMissingAppearance) {
    const started = Date.now();
    let consecutive = 0, state = null;
    await renderedFrames(page, 2, REVIEW_CAPTURE_DEFAULTS.settleTimeoutMs);
    while (Date.now() - started < REVIEW_CAPTURE_DEFAULTS.settleTimeoutMs) {
        state = await page.evaluate(() => {
            const view = window.__landscapeTestHooks.snapshot();
            return { pending: view.streaming?.pending ?? null, streamingSettled: view.streaming?.settled ?? false, appearanceSettled: view.appearance?.settled ?? false,
                lighting: view.lighting?.status ?? null, lastError: view.lastError, errors: view.appearance?.errors ?? [] };
        });
        if (state.lastError) fail(`the viewer reported an error while settling: ${state.lastError}`);
        if (state.lighting === 'failed') fail('the viewer lighting failed to load');
        const appearanceErrors = errorMessages(state.errors), unexpected = allowMissingAppearance ? appearanceErrors.filter(message => message !== MISSING_APPEARANCE_ERROR) : appearanceErrors;
        if (unexpected.length) fail(`the viewer appearance reported errors: ${unexpected.join('; ')}${allowMissingAppearance ? '' : ' (a landscape saved without an appearance sidecar needs --allow-missing-appearance on)'}`);
        consecutive = state.pending === 0 && state.streamingSettled && state.appearanceSettled && (state.lighting === null || state.lighting === 'ready') ? consecutive + 1 : 0;
        if (consecutive >= 2) return { settled: true, waitedMs: Date.now() - started, appearanceErrors };
        await page.waitForTimeout(REVIEW_CAPTURE_DEFAULTS.settlePollMs);
    }
    return { settled: false, waitedMs: Date.now() - started, state, appearanceErrors: errorMessages(state?.errors ?? []) };
}

/** @param {any} view */
function summarize(view) {
    const levels = (view.streaming?.lods ?? []).map((/** @type {any} */ lod) => lod.level);
    return { streaming: { lodRange: levels.length ? [Math.min(...levels), Math.max(...levels)] : null, tiles: view.streaming?.residentLeafIds?.length ?? 0, pending: view.streaming?.pending ?? null, settled: view.streaming?.settled ?? null },
        appearance: { pending: view.appearance?.pending ?? null, settled: view.appearance?.settled ?? null, ready: view.appearance?.ready ?? null },
        lighting: { status: view.lighting?.status ?? null, tier: view.lighting?.tier ?? null }, terrainFields: { status: view.appearance?.terrainFields?.status ?? null },
        terrainProgramVariant: view.terrainProgramVariant ?? null, frameIndex: view.frameIndex, water: view.water ?? null };
}

/** @param {import('./ReviewPoses.mjs').ReviewPoseFile} poses @param {readonly string[]|null} select */
function selectPoses(poses, select) {
    if (!select) return poses.poses;
    const known = new Set(poses.poses.map(pose => pose.id)), unknown = select.filter(id => !known.has(id));
    if (unknown.length) fail(`unknown pose ids ${unknown.join(', ')}; ${poses.id} has ${[...known].join(', ')}`);
    const wanted = new Set(select);
    return poses.poses.filter(pose => wanted.has(pose.id));
}

/** @param {CaptureOptions} options */
export async function captureReviewPoses(options) {
    const { landscapeDirectory, outputDirectory, posesFile, select, label, water, planning, width, height, allowMissingAppearance } = options;
    const poses = await loadReviewPoses(posesFile), selected = selectPoses(poses, select);
    const sampleGround = await createNativeGroundSampler(landscapeDirectory);
    const cameras = [];
    for (const pose of selected) cameras.push({ pose, camera: await resolveReviewPose(pose, sampleGround) });
    await mkdir(outputDirectory, { recursive: true });
    const executablePath = process.env.PLAYWRIGHT_EXECUTABLE_PATH ?? REVIEW_CAPTURE_DEFAULTS.chromium, args = [...REVIEW_CAPTURE_DEFAULTS.chromiumArgs];
    const server = createLandscapeServer({ root: ROOT, landscapeDirectory });
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', () => resolve(undefined)); });
    const address = /** @type {import('node:net').AddressInfo} */ (server.address());
    const origin = `http://127.0.0.1:${address.port}`;
    /** @type {import('playwright-core').Browser|null} */ let browser = null;
    /** @type {import('playwright-core').Page|null} */ let page = null;
    const pageErrors = [], captures = [], started = Date.now();
    const log = (/** @type {string} */ message) => console.log(`[LandscapeReview] ${message}`);
    try {
        browser = await chromium.launch({ executablePath, headless: true, args });
        const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1 });
        page = await context.newPage();
        page.on('pageerror', error => pageErrors.push(error.message));
        page.on('console', message => { if (message.type() === 'error' && !message.text().startsWith('Failed to load resource')) pageErrors.push(message.text().slice(0, 500)); });
        page.on('response', response => { if (response.status() >= 400) pageErrors.push(`${response.status()} ${response.url()}`); });
        await page.goto(`${origin}/screens/landscape_fabrication.html`);
        await page.waitForFunction(() => { const view = window.__landscapeTestHooks?.snapshot(); return !!view && (view.ready || !!view.lastError); }, null, { timeout: REVIEW_CAPTURE_DEFAULTS.readyTimeoutMs });
        const loaded = await snapshot(page);
        if (loaded.lastError) fail(`the viewer failed to load ${landscapeDirectory}: ${loaded.lastError}`);
        if (loaded.revision !== sampleGround.revision) fail(`the viewer shows revision ${loaded.revision} but ${landscapeDirectory} is at ${sampleGround.revision}`);
        log(`viewer ready in ${Date.now() - started} ms, revision ${loaded.revision}`);
        const clip = await fitCanvas(page, width, height);
        await page.evaluate(({ water, planning, layers, selector }) => {
            const hooks = window.__landscapeTestHooks;
            hooks.setWater(water);
            if (planning) hooks.setPlanning(Object.fromEntries(layers.map(layer => [layer, true])));
            for (const element of document.querySelectorAll(selector)) /** @type {HTMLElement} */ (element).style.visibility = 'hidden';
        }, { water, planning, layers: PLANNING_LAYERS, selector: OVERLAY_SELECTOR });
        for (const { pose, camera } of cameras) {
            const poseStarted = Date.now();
            await page.evaluate(camera => window.__landscapeTestHooks.setCamera({ position: camera.position, target: camera.target, projection: camera.projection, fov: camera.fov, zoom: camera.zoom }), camera);
            const settle = await settleViewer(page, allowMissingAppearance);
            await page.waitForTimeout(REVIEW_CAPTURE_DEFAULTS.tailMs);
            const view = await snapshot(page), fileName = `${pose.id}.png`, file = path.join(outputDirectory, fileName);
            const screenshotStarted = Date.now();
            await page.screenshot({ path: file, clip, type: 'png', animations: 'disabled', caret: 'hide' });
            const screenshotMs = Date.now() - screenshotStarted, totalMs = Date.now() - poseStarted;
            const receipt = { format: REVIEW_CAPTURE_FORMAT, schemaVersion: 1, poseId: pose.id, label, landscapeDirectory: posix(landscapeDirectory), revision: loaded.revision,
                poseFile: { id: poses.id, path: posix(path.relative(ROOT, posesFile)) }, pose, camera, groundHeight: camera.groundHeight, file: fileName, settled: settle.settled, waitedMs: settle.waitedMs,
                canvas: { width, height }, clip, snapshotSummary: summarize(view), timing: { settleMs: settle.waitedMs, tailMs: REVIEW_CAPTURE_DEFAULTS.tailMs, screenshotMs, totalMs },
                viewer: { water, planning, width, height, allowMissingAppearance }, appearanceErrors: settle.appearanceErrors, ...(settle.settled ? {} : { unsettledState: settle.state }) };
            await writeFile(path.join(outputDirectory, `${pose.id}.json`), `${JSON.stringify(receipt, null, 2)}\n`);
            captures.push({ poseId: pose.id, file: fileName, receipt: `${pose.id}.json`, settled: settle.settled, groundHeight: camera.groundHeight, totalMs, appearanceErrors: settle.appearanceErrors });
            log(`${pose.id} ${settle.settled ? 'settled' : 'NOT settled'} in ${(settle.waitedMs / 1000).toFixed(1)} s, total ${(totalMs / 1000).toFixed(1)} s, ground ${camera.groundHeight === null ? 'outside' : `${camera.groundHeight.toFixed(2)} m`} -> ${shown(file)}`);
        }
    } finally {
        // teardown: close in order, never masking the capture's own error
        try { if (page) await page.close(); } catch (error) { console.warn('[LandscapeReview] page close failed:', /** @type {Error} */ (error).message); }
        try { if (browser) await browser.close(); } catch (error) { console.warn('[LandscapeReview] browser close failed:', /** @type {Error} */ (error).message); }
        server.closeAllConnections();
        await new Promise(resolve => server.close(() => resolve(undefined)));
    }
    const index = { format: REVIEW_CAPTURES_FORMAT, schemaVersion: 1, label, landscapeDirectory: posix(landscapeDirectory), revision: sampleGround.revision, poseFile: { id: poses.id, path: posix(path.relative(ROOT, posesFile)) },
        viewer: { width, height, water, planning, allowMissingAppearance, chromium: executablePath, args, url: '/screens/landscape_fabrication.html' }, captures, pageErrors, totalMs: Date.now() - started };
    await writeFile(path.join(outputDirectory, 'captures.json'), `${JSON.stringify(index, null, 2)}\n`);
    return index;
}

async function main() {
    const options = parseCaptureOptions(process.argv.slice(2));
    const index = await captureReviewPoses(options);
    const unsettled = index.captures.filter(capture => !capture.settled).map(capture => capture.poseId);
    const fallback = index.captures.filter(capture => capture.appearanceErrors.length).length;
    console.log(`[LandscapeReview] ${index.captures.length} captures in ${(index.totalMs / 1000).toFixed(1)} s -> ${posix(options.outputDirectory)}/captures.json${index.pageErrors.length ? ` (${index.pageErrors.length} page errors recorded)` : ''}${fallback ? ` (${fallback} captured on fallback soil colors: no appearance sidecar)` : ''}`);
    if (unsettled.length) { console.error(`[LandscapeReview] poses that did not settle: ${unsettled.join(', ')}`); process.exitCode = 1; }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
    main().catch(error => { console.error(error instanceof Error && error.message.startsWith('[LandscapeReview]') ? error.message : error); process.exitCode = 1; });
}
