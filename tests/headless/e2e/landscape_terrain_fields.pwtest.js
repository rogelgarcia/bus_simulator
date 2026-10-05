// Verifies AI577 D5 terrain-field streaming in the real viewer, the explicit 404 fallback and GLSL chunk parity with the JavaScript mirror.
import { test, expect } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';

const artifacts = path.resolve('tests/artifacts/screens/landscape/ai577/d5/fields/browser');
const snapshot = page => page.evaluate(() => window.__landscapeTestHooks.snapshot());

function observeErrors(page) {
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => {
        if (message.type() === 'error' && /WebGLProgram|VALIDATE_STATUS|shader error|GL_INVALID/i.test(message.text())) errors.push(message.text());
    });
    return errors;
}

async function settle(page) {
    await page.waitForTimeout(180);
    await expect.poll(async () => {
        const state = await snapshot(page);
        return state.streaming?.settled && state.appearance?.settled;
    }, { timeout: 60000 }).toBe(true);
    return snapshot(page);
}

async function open(page) {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto('/screens/landscape_fabrication.html');
    await page.waitForFunction(() => window.__landscapeTestHooks?.snapshot().ready || window.__landscapeTestHooks?.snapshot().lastError, null, { timeout: 90000 });
    expect((await snapshot(page)).lastError).toBeNull();
}

test.beforeAll(async () => { await mkdir(artifacts, { recursive: true }); });

test('Landscape D5 terrain fields: pages stream with the resident native masks, stay inside the budget and sample exactly in JavaScript', async ({ page }) => {
    test.setTimeout(180000);
    const errors = observeErrors(page);
    await open(page);
    await page.evaluate(() => window.__landscapeTestHooks.setCamera({ position: [980, 320, 2650], target: [1250, 8, 2910], projection: 'perspective', fov: 55 }));
    const state = await settle(page), fields = state.appearance.terrainFields;
    expect(fields.status).toBe('active');
    expect(fields.bound).toBe(true);
    expect(fields.staleChunks).toEqual([]);
    const natives = state.appearance.maskLods.filter(mask => mask.level <= 3).map(mask => mask.id).sort();
    expect(fields.residentPages.map(page => page.id).sort()).toEqual(natives);
    expect(fields.residentPages.every(page => page.progress === 1)).toBe(true);
    // the page layers of every native slot plus the AI577 D5 landscape-scale appearance layer derived from the root page
    expect(fields.appearanceLayerState.status).toBe('resident');
    expect(fields.bytes.arrayGpu).toBe(fields.capacity * fields.bytes.pageBytes + fields.appearanceLayer.bytes);
    expect(fields.bytes.gpuBytes).toBeLessThanOrEqual(fields.bytes.ceiling.gpuBytes);
    expect(fields.uploads.peakBytesPerFrame).toBeLessThanOrEqual(8 * 1024 * 1024);
    expect(state.budget.cpuBytes).toBeLessThanOrEqual(state.budget.limits.cpuBytes);
    expect(state.budget.gpuBytes).toBeLessThanOrEqual(state.budget.limits.gpuBytes);
    expect(state.budget.entries.filter(entry => entry.kind === 'terrain-fields-array').length).toBe(1);
    const comparison = await page.evaluate(async () => {
        const landscape = await import('/src/app/landscape/index.js');
        const sidecar = await (await fetch('/assets/public/landscape/coastal-city/fields/manifest.json')).json();
        const manifest = await (await fetch('/assets/public/landscape/coastal-city/manifest.json')).json();
        const layout = landscape.landscapeTerrainFieldsLayout(257), results = [];
        for (const [x, z] of [[1242, 2900], [1250.3, 2915.7], [1180, 2860], [1300.5, 2990.25]]) {
            const sample = window.__landscapeTestHooks.terrainFieldsSample(x, z, { sunDirection: { x: .4056, y: .8192, z: .4056 } });
            const finest = sample.contributions[0], chunk = manifest.chunks.find(entry => entry.level === finest.level && x >= entry.bounds.minX && x <= entry.bounds.maxX && z >= entry.bounds.minZ && z <= entry.bounds.maxZ);
            const entry = sidecar.pages.find(value => value.id === chunk.id).fields, bytes = new Uint8Array(await (await fetch(`/assets/public/landscape/coastal-city/fields/${entry.url}`)).arrayBuffer());
            const expected = landscape.sampleLandscapeTerrainFieldPage(bytes, 0, layout, chunk.bounds, x, z);
            results.push({ x, z, id: chunk.id, availability: sample.availability, contributions: sample.contributions.length, maximumDifference: Math.max(...sample.units.map((value, i) => Math.abs(value - expected[i]))),
                sunVisibility: sample.sunVisibility, fields: sample.fields });
        }
        return results;
    });
    for (const result of comparison) {
        expect(result.availability).toBe(1);
        expect(result.contributions).toBe(1);
        expect(result.maximumDifference).toBe(0);
        expect(result.sunVisibility).toBeGreaterThanOrEqual(0);
        expect(result.fields.skyView).toBeLessThanOrEqual(1);
    }
    await page.screenshot({ path: path.join(artifacts, 'streaming-bluff.png') });
    await writeFile(path.join(artifacts, 'streaming.json'), JSON.stringify({ terrainFields: fields, comparison, budget: { cpuBytes: state.budget.cpuBytes, gpuBytes: state.budget.gpuBytes } }, null, 2));
    await page.evaluate(() => window.__landscapeTestHooks.dispose());
    const disposed = await snapshot(page);
    expect(disposed.budget.cpuBytes).toBe(0);
    expect(errors).toEqual([]);
});

test('Landscape D5 terrain fields: a missing sidecar is an explicit absent fallback and the viewer renders normally', async ({ page }) => {
    test.setTimeout(150000);
    const errors = observeErrors(page), requests = [];
    await page.route('**/coastal-city/fields/**', route => { requests.push(route.request().url()); return route.fulfill({ status: 404, body: '' }); });
    await open(page);
    const state = await settle(page);
    expect(state.appearance.terrainFields.status).toBe('absent');
    expect(state.appearance.terrainFields.reason).toBe('terrain-fields-404');
    expect(state.appearance.terrainFields.residentPages).toEqual([]);
    expect(state.appearance.degradationReason).toBeNull();
    // the natural soil of planning-only cover shares the one sidecar request and falls back to the overview infill everywhere
    expect(requests.length).toBe(1);
    expect([state.appearance.presentation.status, state.appearance.presentation.policy, state.appearance.presentation.fallbackScope]).toEqual(['absent', 'natural-overview-infill-v1', 'all-natives']);
    expect(state.appearance.presentation.natives).toEqual({ total: 64, terrain: 0, overview: 64 });
    expect(state.budget.entries.some(entry => entry.kind.startsWith('terrain-fields'))).toBe(false);
    expect(await page.evaluate(() => window.__landscapeTestHooks.terrainFieldsSample(2000, 2000).availability)).toBe(0);
    await page.evaluate(() => window.__landscapeTestHooks.dispose());
    expect(errors).toEqual([]);
});

test('Landscape D5 terrain fields: the GLSL chunk matches the JavaScript slot walk, decode and visibility within GPU filtering precision', async ({ browser }, testInfo) => {
    test.setTimeout(150000);
    const baseURL = String(testInfo.project.use.baseURL), context = await browser.newContext({ baseURL, viewport: { width: 256, height: 64 } }), page = await context.newPage();
    const errors = observeErrors(page), chunk = await readFile('src/graphics/shaders/chunks/landscape/terrain_fields.glsl', 'utf8');
    try {
        await page.route('**/tests/headless/e2e/fixtures/landscape_surface_probe.html', async route => route.fulfill({ contentType: 'text/html', body: await readFile('tests/headless/e2e/fixtures/landscape_surface_probe.html', 'utf8') }));
        await page.goto('/tests/headless/e2e/fixtures/landscape_surface_probe.html');
        const result = await page.evaluate(async ({ chunkSource }) => {
            const T = await import('three'), landscape = await import('/src/app/landscape/index.js');
            const { landscapeTerrainFieldMeta } = await import('/src/graphics/engine3d/landscape/LandscapeTerrainFieldPages.js');
            const { createLandscapeTerrainFieldTexture } = await import('/src/graphics/engine3d/landscape/LandscapeTerrainFieldTexture.js');
            const base = '/assets/public/landscape/coastal-city/', manifest = await (await fetch(`${base}manifest.json`)).json(), sidecar = await (await fetch(`${base}fields/manifest.json`)).json();
            const layout = landscape.landscapeTerrainFieldsLayout(257), slots = 17;
            const chosen = [['l0/c0/r0', 1], ['l1/c0/r1', 1], ['l2/c1/r2', 1], ['l3/c2/r5', 1], ['l3/c3/r5', .4], ['l3/c2/r4', 1]];
            const pixels = new Uint8Array(slots * layout.pageBytes), bounds = Array.from({ length: slots }, () => new T.Vector4()), meta = Array.from({ length: slots }, () => new T.Vector4(-1, 0, 0, 0));
            for (const [slot, [id, progress]] of chosen.entries()) {
                const entry = sidecar.pages.find(page => page.id === id).fields, chunk = manifest.chunks.find(value => value.id === id);
                pixels.set(new Uint8Array(await (await fetch(`${base}fields/${entry.url}`)).arrayBuffer()), slot * layout.pageBytes);
                const parentSlot = chosen.findIndex(([other]) => other === chunk.parentId);
                bounds[slot].set(chunk.bounds.minX, chunk.bounds.maxX, chunk.bounds.minZ, chunk.bounds.maxZ);
                meta[slot].set(chunk.level, 1, parentSlot < 0 ? slot : parentSlot, landscapeTerrainFieldMeta(progress));
            }
            const staleBit = 4 * 8 + 2, state = new Uint32Array([0, 0, 1, 4]);
            state[staleBit >> 5] = (1 << (staleBit & 31)) >>> 0;
            const points = [], cells = [[1050, 1350], [1100.25, 1420.6], [1240.75, 1490.1], [1300, 1260], [1499.9, 1300.3], [1612.5, 1371.875], [1800.4, 1400.2], [1180, 1880.5],
                [1270.3, 1720.8], [1110, 1980], [600, 300], [3100, 3600]];
            for (const [x, z] of cells) for (const footprint of [0, 1.5, 2.9, 4.4, 9, 31]) points.push([x, z, footprint]);
            const pointData = new Float32Array(points.length * 4);
            points.forEach(([x, z, footprint], i) => pointData.set([x, z, footprint, 0], i * 4));
            const pointTexture = new T.DataTexture(pointData, points.length, 1, T.RGBAFormat, T.FloatType);
            pointTexture.needsUpdate = true;
            const fieldTexture = createLandscapeTerrainFieldTexture({ pixels, width: layout.width, height: layout.height, depth: slots * 4 });
            fieldTexture.needsUpdate = true;
            const renderer = new T.WebGLRenderer({ canvas: document.getElementById('surface-probe'), antialias: false });
            const width = points.length * 5, target = new T.WebGLRenderTarget(width, 1, { type: T.FloatType, format: T.RGBAFormat, minFilter: T.NearestFilter, magFilter: T.NearestFilter, depthBuffer: false });
            const fragmentShader = `#define LANDSCAPE_COVERAGE_SLOTS ${slots}
precision highp sampler2DArray;
uniform vec4 uMaskBounds[LANDSCAPE_COVERAGE_SLOTS];
uniform vec4 uMaskMeta[LANDSCAPE_COVERAGE_SLOTS];
uniform vec3 uMaskSlotRanges;
uniform vec2 uMaskDimensions;
uniform vec4 uCoverageSettings;
uniform sampler2D uPoints;
uniform vec3 uSunDirection;
${chunkSource}
void main() {
    int pixel = int(gl_FragCoord.x), point = pixel / 5, part = pixel - point * 5;
    vec4 p = texelFetch(uPoints, ivec2(point, 0), 0);
    LandscapeTerrainFields f = landscapeTerrainFieldsAt(p.xy, vec2(p.z, 0.0), vec2(0.0));
    vec4 encodedShore = vec4(sqrt(abs(f.shoreDistance) / LANDSCAPE_TERRAIN_FIELD_SHORE_METERS) * sign(f.shoreDistance) * 0.5 + 0.5);
    if (part == 0) gl_FragColor = vec4(f.availability, f.wetness, f.flow, f.deposition);
    else if (part == 1) gl_FragColor = vec4(f.rockExposure, f.skyView, encodedShore.x, f.convexity * 0.5 + 0.5);
    else if (part == 2) gl_FragColor = vec4(f.slopeDegrees / LANDSCAPE_TERRAIN_FIELD_SLOPE_DEGREES, sqrt(f.horizonSineA.xyz));
    else if (part == 3) gl_FragColor = vec4(sqrt(f.horizonSineA.w), sqrt(f.horizonSineB.xyz));
    else gl_FragColor = vec4(landscapeTerrainFieldsSunVisibility(f, uSunDirection), landscapeTerrainFieldsSkyVisibility(f, normalize(vec3(0.3, 1.0, -0.2))), sqrt(f.horizonSineB.w), 1.0);
}`;
            const material = new T.ShaderMaterial({ vertexShader: 'void main() { gl_Position = vec4(position.xy, 0.0, 1.0); }', fragmentShader,
                uniforms: { uMaskBounds: { value: bounds }, uMaskMeta: { value: meta }, uMaskSlotRanges: { value: new T.Vector3(chosen.length, 0, 0) }, uMaskDimensions: { value: new T.Vector2(257, 257) },
                    uCoverageSettings: { value: new T.Vector4(.75, .5, 1, 2) }, uPoints: { value: pointTexture }, uSunDirection: { value: new T.Vector3(.4056, .8192, .4056) },
                    uTerrainFields: { value: fieldTexture }, uTerrainFieldsState: { value: state } } });
            const scene = new T.Scene(), camera = new T.OrthographicCamera(-1, 1, 1, -1, 0, 1);
            scene.add(new T.Mesh(new T.PlaneGeometry(2, 2), material));
            renderer.setRenderTarget(target); renderer.render(scene, camera);
            const gpu = new Float32Array(width * 4);
            renderer.readRenderTargetPixels(target, 0, 0, width, 1, gpu);
            renderer.setRenderTarget(null);
            const source = { slots: chosen.map((_, slot) => ({ bounds: { minX: bounds[slot].x, maxX: bounds[slot].y, minZ: bounds[slot].z, maxZ: bounds[slot].w }, level: meta[slot].x, parent: meta[slot].z,
                    fieldProgress: Math.max(0, Math.min(1, (meta[slot].w - 1) / .25)), native: true, active: true })), rootBounds: manifest.bounds, staleCells: [state[0], state[1]], active: true, samples: 257,
                fetch: (slot, x, z, out) => landscape.sampleLandscapeTerrainFieldPage(pixels, slot * layout.pageBytes, layout, source.slots[slot].bounds, x, z, out) };
            const sun = { x: .4056, y: .8192, z: .4056 }, normal = { x: .3, y: 1, z: -.2 };
            const rows = points.map(([x, z, footprint], i) => {
                const js = landscape.sampleLandscapeTerrainFieldSlots(source, x, z, { dx: [footprint, 0], dy: [0, 0] }), u = js.units;
                const expected = js.availability > 0 ? [js.availability, u[0], u[1], u[2], u[3], u[4], u[5], u[6], u[7], u[8], u[9], u[10], u[11], u[12], u[13], u[14],
                    1 - js.availability + js.availability * landscape.landscapeTerrainSunVisibility(js.fields.horizonSine, sun), landscape.landscapeTerrainSkyVisibility(js.fields.skyView, normal, js.availability), u[15]]
                    : [0, 0, 0, 0, 0, 1, 1, .5, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 0];
                const g = gpu.subarray(i * 20, i * 20 + 20), actual = [...g.subarray(0, 16), g[16], g[17], g[18]];
                return { x, z, footprint, availability: js.availability, contributions: js.contributions.map(entry => [entry.slot, Number(entry.weight.toFixed(4))]), difference: Math.max(...actual.map((value, k) => Math.abs(value - expected[k]))) };
            });
            const vendor = renderer.getContext().getExtension('WEBGL_debug_renderer_info');
            const info = vendor ? renderer.getContext().getParameter(vendor.UNMASKED_RENDERER_WEBGL) : 'unknown';
            renderer.dispose(); target.dispose(); fieldTexture.dispose(); pointTexture.dispose(); material.dispose();
            return { rows, renderer: info };
        }, { chunkSource: chunk });
        const worst = Math.max(...result.rows.map(row => row.difference));
        await writeFile(path.join(artifacts, 'glsl-parity.json'), JSON.stringify({ chunkSha256: createHash('sha256').update(chunk).digest('hex'), worst, ...result }, null, 2));
        expect(result.rows.some(row => row.availability === 0)).toBe(true);
        expect(result.rows.some(row => row.availability > 0 && row.contributions.length > 1)).toBe(true);
        expect(worst).toBeLessThan(.006);
        expect(errors).toEqual([]);
    } finally { await context.close(); }
});
