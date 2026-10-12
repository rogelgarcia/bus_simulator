// Renders a short deterministic motion clip of the landscape viewer: the ocean clock stepped by an exact interval per frame, optionally a camera moving along a straight line, with per-frame stability statistics.
// @ts-check
// The viewer is driven like the capture tool (own server on a free port, settled streaming, overlays hidden, the canvas clipped), then every
// frame steps the ocean clock by exactly 1 / fps seconds (AI 597 deterministic time base) and, with --move, translates the camera by a fixed
// vector, waits for the frame to render and reads the canvas back. Frames go to <output>/frames/NNNNN.png, the receipt records the mean and
// maximum absolute pixel difference between consecutive frames inside the sea region (a popping surface shows a spike well above the median),
// and ffmpeg encodes clip.mp4 when it is on the PATH. Server, page and browser always close.
import path from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { parseArgs } from 'node:util';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from 'playwright-core';
import { createLandscapeServer } from '../landscape_server/Server.mjs';
import { createNativeGroundSampler, loadReviewPoses, resolveReviewPose } from './ReviewPoses.mjs';
import { REVIEW_CAPTURE_DEFAULTS, fitCanvas, settleViewer } from './capture.mjs';
import { landscapeOceanSeaState, landscapeOceanSurface } from '../../src/graphics/engine3d/landscape/ocean/LandscapeOceanModel.js';

export const REVIEW_CLIP_FORMAT = 'landscape-review-clip';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const OVERLAY_SELECTOR = '.landscape-ui, #ui-perf-bar';
const USAGE = `Usage: node tools/landscape_review/clip.mjs --landscape <saved landscape directory> --output <directory> --pose NW-12
       [--poses <pose file>] [--frames 90] [--fps 30] [--ocean animated|flat] [--sea-state calm|moderate|rough] [--ocean-time 30]
       [--move dx,dy,dz (meters per frame)] [--region left,top,right,bottom (pixels, default the lower half)] [--width 1920 --height 1080] [--surround auto|off|<url>]`;

/** @param {string} message @returns {never} */
function fail(message) { throw new Error(`[LandscapeReview] ${message}`); }
const posix = (/** @type {string} */ value) => value.split(path.sep).join('/');

/** @param {readonly string[]} args */
export function parseClipOptions(args) {
    const { values } = parseArgs({ args: [...args], strict: true, options: {
        landscape: { type: 'string' }, output: { type: 'string' }, pose: { type: 'string' }, poses: { type: 'string', default: REVIEW_CAPTURE_DEFAULTS.poses },
        frames: { type: 'string', default: '90' }, fps: { type: 'string', default: '30' }, ocean: { type: 'string', default: 'animated' }, 'sea-state': { type: 'string', default: 'moderate' },
        'ocean-time': { type: 'string', default: '30' }, move: { type: 'string' }, region: { type: 'string' }, width: { type: 'string', default: '1920' }, height: { type: 'string', default: '1080' },
        surround: { type: 'string', default: 'auto' } } });
    if (!values.landscape || !values.output || !values.pose) fail(`--landscape, --output and --pose are required\n${USAGE}`);
    const integer = (/** @type {string} */ value, /** @type {string} */ name, /** @type {number} */ min, /** @type {number} */ max) => { const n = Number(value); if (!Number.isInteger(n) || n < min || n > max) fail(`--${name} must be an integer from ${min} to ${max}; received ${value}`); return n; };
    const frames = integer(/** @type {string} */ (values.frames), 'frames', 2, 3000), fps = integer(/** @type {string} */ (values.fps), 'fps', 1, 120);
    const width = integer(/** @type {string} */ (values.width), 'width', 320, 7680), height = integer(/** @type {string} */ (values.height), 'height', 320, 7680);
    const oceanTime = Number(values['ocean-time']);
    if (!Number.isFinite(oceanTime) || oceanTime < 0) fail(`--ocean-time must be a nonnegative number of seconds; received ${values['ocean-time']}`);
    const vector = (/** @type {string|undefined} */ text, /** @type {string} */ name, /** @type {number} */ count) => {
        if (text === undefined) return null;
        const parts = text.split(',').map(Number);
        if (parts.length !== count || parts.some(value => !Number.isFinite(value))) fail(`--${name} needs ${count} comma-separated numbers; received ${text}`);
        return parts;
    };
    return Object.freeze({ landscapeDirectory: path.resolve(/** @type {string} */ (values.landscape)), outputDirectory: path.resolve(/** @type {string} */ (values.output)), poseId: /** @type {string} */ (values.pose),
        posesFile: path.resolve(/** @type {string} */ (values.poses)), frames, fps, ocean: landscapeOceanSurface(values.ocean), seaState: landscapeOceanSeaState(values['sea-state']), oceanTime,
        move: vector(values.move, 'move', 3), region: vector(values.region, 'region', 4), width, height, surround: /** @type {string} */ (values.surround) });
}

/**
 * Mean and maximum absolute luminance difference between two RGBA rasters inside a region.
 * @param {Uint8Array} a @param {Uint8Array} b @param {number} width @param {number[]} region left, top, right, bottom
 */
export function frameDifference(a, b, width, region) {
    const [left, top, right, bottom] = region;
    let sum = 0, max = 0, count = 0;
    for (let y = top; y < bottom; y++) for (let x = left; x < right; x++) {
        const o = (y * width + x) * 4;
        const la = .2126 * a[o] + .7152 * a[o + 1] + .0722 * a[o + 2], lb = .2126 * b[o] + .7152 * b[o + 1] + .0722 * b[o + 2], d = Math.abs(la - lb);
        sum += d; if (d > max) max = d; count++;
    }
    return { mean: count ? sum / count : 0, max };
}

/** @param {ReturnType<typeof parseClipOptions>} options */
export async function renderReviewClip(options) {
    const { landscapeDirectory, outputDirectory, poseId, posesFile, frames, fps, ocean, seaState, oceanTime, move, width, height, surround } = options;
    const poses = await loadReviewPoses(posesFile), pose = poses.poses.find(entry => entry.id === poseId) ?? fail(`unknown pose ${poseId}`);
    const sampleGround = await createNativeGroundSampler(landscapeDirectory), camera = await resolveReviewPose(pose, sampleGround);
    const region = options.region ?? [0, Math.floor(height / 2), width, height];
    const framesDirectory = path.join(outputDirectory, 'frames');
    await mkdir(framesDirectory, { recursive: true });
    const executablePath = process.env.PLAYWRIGHT_EXECUTABLE_PATH ?? REVIEW_CAPTURE_DEFAULTS.chromium, args = [...REVIEW_CAPTURE_DEFAULTS.chromiumArgs];
    const server = createLandscapeServer({ root: ROOT, landscapeDirectory });
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', () => resolve(undefined)); });
    const origin = `http://127.0.0.1:${/** @type {import('node:net').AddressInfo} */ (server.address()).port}`;
    /** @type {import('playwright-core').Browser|null} */ let browser = null;
    /** @type {import('playwright-core').Page|null} */ let page = null;
    const pageErrors = [], started = Date.now(), differences = [];
    const log = (/** @type {string} */ message) => console.log(`[LandscapeReview] ${message}`);
    try {
        browser = await chromium.launch({ executablePath, headless: true, args });
        const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1 });
        page = await context.newPage();
        page.on('pageerror', error => pageErrors.push(error.message));
        page.on('console', message => { if (message.type() === 'error' && !message.text().startsWith('Failed to load resource')) pageErrors.push(message.text().slice(0, 500)); });
        const query = new URLSearchParams({ landscapeOcean: ocean, landscapeSeaState: seaState, landscapeOceanTime: String(oceanTime), ...(surround === 'auto' ? {} : { landscapeSurround: surround }) });
        await page.goto(`${origin}/screens/landscape_fabrication.html?${query}`);
        await page.waitForFunction(() => { const view = window.__landscapeTestHooks?.snapshot(); return !!view && (view.ready || !!view.lastError); }, null, { timeout: REVIEW_CAPTURE_DEFAULTS.readyTimeoutMs });
        await page.waitForFunction(() => { const view = window.__landscapeTestHooks.snapshot(); return !!view.lastError || ((!view.surround || view.surround.status !== 'loading') && (!view.ocean || view.ocean.status !== 'loading')); }, null, { timeout: REVIEW_CAPTURE_DEFAULTS.readyTimeoutMs });
        const loaded = await page.evaluate(() => window.__landscapeTestHooks.snapshot());
        if (loaded.lastError) fail(`the viewer failed to load ${landscapeDirectory}: ${loaded.lastError}`);
        if (ocean === 'animated' && loaded.ocean?.status !== 'active') fail(`the animated ocean is not drawn (${loaded.ocean?.status}): ${loaded.ocean?.reason}`);
        const canvasClip = await fitCanvas(page, width, height);
        await page.evaluate(selector => { for (const element of document.querySelectorAll(selector)) /** @type {HTMLElement} */ (element).style.visibility = 'hidden'; }, OVERLAY_SELECTOR);
        await page.evaluate(camera => window.__landscapeTestHooks.setCamera({ position: camera.position, target: camera.target, projection: camera.projection, fov: camera.fov, zoom: camera.zoom }), camera);
        const settle = await settleViewer(page, false);
        if (!settle.settled) fail(`the viewer did not settle at ${poseId}`);
        await page.waitForTimeout(REVIEW_CAPTURE_DEFAULTS.tailMs);
        log(`viewer ready in ${Date.now() - started} ms, revision ${loaded.revision}, ocean ${loaded.ocean?.status ?? 'none'}; rendering ${frames} frames at ${fps} fps${move ? ` moving ${move.join(', ')} m per frame` : ''}`);
        const step = 1 / fps;
        // the difference statistic is computed in the page against the previous frame's region (never transferring the raster), the PNG by screenshot
        await page.evaluate(region => { window.__landscapeClip = { region, previous: null }; }, region);
        for (let index = 0; index < frames; index++) {
            const position = move ? camera.position.map((value, axis) => value + move[axis] * index) : camera.position;
            const target = move ? camera.target.map((value, axis) => value + move[axis] * index) : camera.target;
            const difference = await page.evaluate(async ({ position, target, step, first }) => {
                const hooks = window.__landscapeTestHooks, clip = window.__landscapeClip, [left, top, right, bottom] = clip.region;
                hooks.setCamera({ position, target });
                if (!first) hooks.setOcean({ clock: { step } });
                // the frame after the camera and clock change (readFrame resolves inside the rendered frame's own task)
                await hooks.readFrame({ left: 0, top: 0, width: 1, height: 1 });
                const width = right - left, height = bottom - top;
                const { data } = await hooks.readFrame({ left, top, width, height });
                let result = null;
                if (clip.previous) {
                    let sum = 0, max = 0;
                    for (let i = 0; i < data.length; i += 4) {
                        const la = .2126 * clip.previous[i] + .7152 * clip.previous[i + 1] + .0722 * clip.previous[i + 2], lb = .2126 * data[i] + .7152 * data[i + 1] + .0722 * data[i + 2], d = Math.abs(la - lb);
                        sum += d; if (d > max) max = d;
                    }
                    result = { mean: sum / (width * height), max };
                }
                clip.previous = data;
                return result;
            }, { position, target, step, first: index === 0 });
            if (difference) differences.push({ frame: index, ...difference });
            await page.screenshot({ path: path.join(framesDirectory, `${String(index).padStart(5, '0')}.png`), clip: canvasClip, type: 'png', animations: 'disabled', caret: 'hide' });
            if (index % 10 === 0) log(`frame ${index}/${frames - 1}`);
        }
    } finally {
        try { if (page) await page.close(); } catch (error) { console.warn('[LandscapeReview] page close failed:', /** @type {Error} */ (error).message); }
        try { if (browser) await browser.close(); } catch (error) { console.warn('[LandscapeReview] browser close failed:', /** @type {Error} */ (error).message); }
        server.closeAllConnections();
        await new Promise(resolve => server.close(() => resolve(undefined)));
    }
    const means = differences.map(entry => entry.mean).sort((a, b) => a - b), median = means.length ? means[Math.floor(means.length / 2)] : 0;
    const spikes = differences.filter(entry => entry.mean > 4 * median + 1);
    const encode = spawnSync('ffmpeg', ['-y', '-v', 'error', '-framerate', String(fps), '-i', path.join(framesDirectory, '%05d.png'), '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '18', path.join(outputDirectory, 'clip.mp4')], { stdio: 'pipe' });
    const receipt = { format: REVIEW_CLIP_FORMAT, schemaVersion: 1, landscapeDirectory: posix(landscapeDirectory), poseId, camera, frames, fps, stepSeconds: 1 / fps, ocean, seaState, oceanTime, move, region, width, height, surround,
        stability: { medianMeanDifference: median, maxMeanDifference: means.length ? means[means.length - 1] : 0, spikes, perFrame: differences }, video: encode.status === 0 ? 'clip.mp4' : null, ffmpeg: encode.status === 0 ? 'ok' : (encode.error?.message ?? String(encode.stderr ?? '')).slice(0, 200), pageErrors, totalMs: Date.now() - started };
    await writeFile(path.join(outputDirectory, 'clip.json'), `${JSON.stringify(receipt, null, 2)}\n`);
    return receipt;
}

async function main() {
    const options = parseClipOptions(process.argv.slice(2));
    const receipt = await renderReviewClip(options);
    console.log(`[LandscapeReview] ${receipt.frames} frames in ${(receipt.totalMs / 1000).toFixed(1)} s -> ${posix(options.outputDirectory)}/clip.json; median frame difference ${receipt.stability.medianMeanDifference.toFixed(3)}, max ${receipt.stability.maxMeanDifference.toFixed(3)}, spikes ${receipt.stability.spikes.length}; video ${receipt.video ?? `not encoded (${receipt.ffmpeg})`}${receipt.pageErrors.length ? ` (${receipt.pageErrors.length} page errors recorded)` : ''}`);
    if (receipt.stability.spikes.length) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
    main().catch(error => { console.error(error instanceof Error && error.message.startsWith('[LandscapeReview]') ? error.message : error); process.exitCode = 1; });
}
