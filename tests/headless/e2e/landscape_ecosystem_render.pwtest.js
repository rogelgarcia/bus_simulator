// Verifies the AI 599 D4 instanced ecosystem renderer in the viewer on coastal terrain v3: the development recipe's asset sets load and reserve
// inside the ecosystem share, synthetic tiles of every asset set (records at the exact native ground, built in Node from the served native chunks)
// draw with the injected counts, the LOD diagnostic colours agree with the band of the picked instance's distance, a dolly through the band
// boundaries shows no frame-difference spike (the dithered cross-fades), picking the screen centre returns the aimed instance, a close low-angle
// view shows the instance standing on its anchor, a removed tile returns its bytes and disposal leaves zero ecosystem bytes. The suite serves the
// landscape itself on the verification port (like the surround suite) and answers the recipe and catalog requests the landscape server does not
// serve from the repository files. LANDSCAPE_TEST_ECOSYSTEM_LANDSCAPE names the landscape directory (default coastal-city-v3).
import { test, expect } from '@playwright/test';
import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createLandscapeServer } from '../../../tools/landscape_server/Server.mjs';
import { landscapeViewerUrl } from '../../shared/landscape_viewer_url.js';
import { LANDSCAPE_ECOSYSTEM, ecosystemInstanceFade, ecosystemLodBands } from '../../../src/graphics/engine3d/landscape/ecosystem/LandscapeEcosystemModel.js';
import { createEcosystemTileData, ecosystemCellBounds, ecosystemInstanceId, ecosystemTileId, loadLandscapeChunk, loadLandscapeManifest, sampleLandscapeChunk, sortEcosystemTile, validateEcosystemRecipe, writeEcosystemRecord } from '../../../src/app/landscape/index.js';
import { landscapeNoiseHash } from '../../../src/graphics/engine3d/landscape/LandscapeSurfaceNoise.js';

const root = path.resolve('.');
const MiB = 1024 * 1024;
const SERVED_MANIFEST = '/assets/public/landscape/coastal-city/manifest.json';
const landscapeDirectory = path.resolve(root, process.env.LANDSCAPE_TEST_ECOSYSTEM_LANDSCAPE ?? 'assets/public/landscape/coastal-city-v3');
const artifacts = path.resolve(root, 'tests/artifacts/screens/landscape/ai599/d4');
const viewport = { width: 1920, height: 1080 };
// the landscape server serves src/, screens/ and the cache only: the recipe and the vegetation catalog are answered from the repository files
const ROUTED = [['/tools/bake_landscape/ecosystem/recipes/', 'tools/bake_landscape/ecosystem/recipes'], ['/assets/public/vegetation_distant/', 'assets/public/vegetation_distant']];
const MIME = { '.json': 'application/json', '.glb': 'model/gltf-binary', '.ktx2': 'image/ktx2' };
// the natural-world poses NW-04 and NW-06 anchor the synthetic tiles; the layers cover the recipe's three asset sets
const SITES = [{ name: 'NW-04', x: 1322, z: 2400 }, { name: 'NW-06', x: 2074, z: 3316 }];
const LAYERS = [{ id: 'boulders', density: .08 }, { id: 'shrubs', density: .12 }, { id: 'pebbles', density: .15 }];
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

async function routeRepositoryFiles(page) {
    await page.route(url => ROUTED.some(([prefix]) => new URL(url).pathname.startsWith(prefix)), async route => {
        const pathname = decodeURIComponent(new URL(route.request().url()).pathname), [prefix, directory] = ROUTED.find(([entry]) => pathname.startsWith(entry));
        const relative = pathname.slice(prefix.length);
        if (relative.split('/').includes('..')) return route.fulfill({ status: 403, body: 'invalid path' });
        try { await route.fulfill({ status: 200, body: await readFile(path.resolve(root, directory, relative)), contentType: MIME[path.extname(relative)] ?? 'application/octet-stream' }); }
        catch { await route.fulfill({ status: 404, body: 'not found' }); }
    });
}

const snapshot = page => page.evaluate(() => window.__landscapeTestHooks.snapshot());

async function settled(page, timeoutMs = 240000) {
    try {
        await page.waitForFunction(() => {
            const state = window.__landscapeTestHooks?.snapshot();
            if (state?.lastError) throw new Error(state.lastError);
            if (state?.ecosystem?.status === 'failed') throw new Error(`ecosystem failed: ${state.ecosystem.reason}`);
            const surround = !state?.surround || (state.surround.settled && (state.surround.pending ?? 0) === 0);
            return state?.ready && state.streaming.settled && state.streaming.pending === 0 && state.appearance?.settled && state.planning.settled && surround && state.ocean?.settled && state.ecosystem?.settled;
        }, null, { timeout: timeoutMs });
    } catch (error) {
        const conditions = await page.evaluate(() => { const state = window.__landscapeTestHooks?.snapshot(); return { ready: state?.ready, streaming: state?.streaming?.settled, pending: state?.streaming?.pending, appearance: state?.appearance?.settled, planning: state?.planning?.settled, ocean: state?.ocean?.status, ecosystem: state?.ecosystem && { status: state.ecosystem.status, reason: state.ecosystem.reason, settled: state.ecosystem.settled, programCompile: state.ecosystem.programCompile } }; }).catch(() => null);
        throw new Error(`the viewer did not settle within ${timeoutMs} ms: ${JSON.stringify(conditions)}; ${error.message}`);
    }
    await page.waitForTimeout(300);
    return snapshot(page);
}

async function frames(page, count) {
    const start = await page.evaluate(() => window.__landscapeTestHooks.snapshot().frameIndex);
    await page.waitForFunction(({ start, count }) => window.__landscapeTestHooks.snapshot().frameIndex >= start + count, { start, count }, { timeout: 60000 });
}

const direction = (heading, pitch) => { const h = heading * Math.PI / 180, p = pitch * Math.PI / 180; return [Math.sin(h) * Math.cos(p), Math.sin(p), Math.cos(h) * Math.cos(p)]; };
const pose = (x, y, z, heading, pitch) => { const d = direction(heading, pitch); return { position: [x, y, z], target: [x + d[0] * 100, y + d[1] * 100, z + d[2] * 100], projection: 'perspective', fov: 55, zoom: 1 }; };
const lookAt = (position, target) => ({ position, target, projection: 'perspective', fov: 55, zoom: 1 });
const hash = (a, b, salt) => landscapeNoiseHash(((Math.imul(a, 73856093) ^ Math.imul(b, 19349663) ^ Math.imul(salt, 83492791)) >>> 0));
const hash01 = (a, b, salt) => hash(a, b, salt) / 4294967296;

/** Projects a world point through the viewer's perspective camera (lookAt pose, world up) to drawing-buffer pixels of a canvas. */
function project(camera, point, canvas) {
    const [ex, ey, ez] = camera.position, [tx, ty, tz] = camera.target, f = [tx - ex, ty - ey, tz - ez], fl = Math.hypot(...f), forward = f.map(v => v / fl);
    const r = [-forward[2], 0, forward[0]], rl = Math.hypot(...r), right = r.map(v => v / rl), up = [right[1] * forward[2] - right[2] * forward[1], right[2] * forward[0] - right[0] * forward[2], right[0] * forward[1] - right[1] * forward[0]];
    const d = [point[0] - ex, point[1] - ey, point[2] - ez], x = d[0] * right[0] + d[1] * right[1] + d[2] * right[2], y = d[0] * up[0] + d[1] * up[1] + d[2] * up[2], depth = d[0] * forward[0] + d[1] * forward[1] + d[2] * forward[2];
    const tanHalf = Math.tan(camera.fov * Math.PI / 360), aspect = canvas.width / canvas.height;
    return { x: (x / depth / (tanHalf * aspect) + 1) / 2 * canvas.width, y: (1 - y / depth / tanHalf) / 2 * canvas.height, depth };
}

/** Exact native ground samples (stride 1) from the served native chunks, loaded once per chunk. */
function createGroundSampler(manifest, manifestUrl) {
    const chunks = new Map(), natives = manifest.chunks.filter(chunk => chunk.level === manifest.grid.maxLevel);
    return async (x, z) => {
        const descriptor = natives.find(chunk => x >= chunk.bounds.minX && x <= chunk.bounds.maxX && z >= chunk.bounds.minZ && z <= chunk.bounds.maxZ);
        if (!descriptor) return null;
        if (!chunks.has(descriptor.id)) chunks.set(descriptor.id, loadLandscapeChunk(manifest, descriptor.id, { manifestUrl }));
        const sample = sampleLandscapeChunk(manifest, await chunks.get(descriptor.id), x, z);
        return sample.status === 'ready' && !sample.provisional ? sample : null;
    };
}

/** One synthetic tile of a layer: the cell containing (x, z), a hashed subset of its jittered lattice sites at the exact native ground, rank sorted. */
async function buildTile({ recipe, layerId, x, z, density, groundAt }) {
    const layer = recipe.layers[layerId], asset = recipe.assets[layer.assetSet], cell = layer.cell, spacing = cell.meters / cell.sitesPerAxis, variants = asset.kind === 'placeholder-rocks' ? asset.variants : asset.variants.length;
    const cellX = Math.floor(x / cell.meters), cellZ = Math.floor(z / cell.meters), bounds = ecosystemCellBounds(cell.meters, cellX, cellZ), tile = createEcosystemTileData(cell.sitesPerAxis ** 2), salt = layer.rules.competition.priority;
    let count = 0, minY = Infinity, maxY = -Infinity;
    for (let sz = cellZ * cell.sitesPerAxis; sz < (cellZ + 1) * cell.sitesPerAxis; sz++) for (let sx = cellX * cell.sitesPerAxis; sx < (cellX + 1) * cell.sitesPerAxis; sx++) {
        const rank = hash01(sx, sz, salt);
        if (rank >= density) continue;
        const px = (sx + .5 + (hash01(sx, sz, salt + 1) - .5) * 2 * layer.jitter) * spacing, pz = (sz + .5 + (hash01(sx, sz, salt + 2) - .5) * 2 * layer.jitter) * spacing;
        const ground = await groundAt(px, pz);
        if (!ground) continue;
        const { min, max, distribution } = layer.variation.scale, u = hash01(sx, sz, salt + 3), scale = distribution === 'log-uniform' ? Math.exp(Math.log(min) + (Math.log(max) - Math.log(min)) * u) : min + (max - min) * u;
        writeEcosystemRecord(tile, count++, { x: px, y: ground.height, z: pz, scale, normalX: ground.normal.x, normalZ: ground.normal.z, yaw: hash01(sx, sz, salt + 4) * 2 * Math.PI, variant: Math.floor(hash01(sx, sz, salt + 5) * variants) % variants, rank, tint: [1, 1, 1], siteX: sx, siteZ: sz, child: -1 });
        minY = Math.min(minY, ground.height); maxY = Math.max(maxY, ground.height);
    }
    tile.count = count;
    const sorted = sortEcosystemTile(tile);
    return { id: ecosystemTileId(layerId, cellX, cellZ), layerId, cellX, cellZ, bounds, heightRange: [minY, maxY], records: Array.from(sorted.records), ids: Array.from(sorted.ids), count, spacing, footprint: asset.footprintRadiusMeters, height: asset.heightMeters };
}

const recordAt = (tile, index) => { const o = index * 12; const r = tile.records; return { x: r[o], y: r[o + 1], z: r[o + 2], scale: r[o + 3], normalX: r[o + 4], normalZ: r[o + 5], yaw: r[o + 6], variant: r[o + 7], rank: r[o + 8], siteX: tile.ids[index * 3], siteZ: tile.ids[index * 3 + 1] }; };
const isolated = (tile, index, metres) => { const a = recordAt(tile, index); for (let i = 0; i < tile.count; i++) { if (i === index) continue; const b = recordAt(tile, i); if (Math.hypot(a.x - b.x, a.z - b.z) < metres) return false; } return true; };
const palette = LANDSCAPE_ECOSYSTEM.lodColors.map(colour => colour.map(value => Math.round(value * 255)));
const ecosystemEntries = state => state.budget.entries.filter(entry => entry.kind === LANDSCAPE_ECOSYSTEM.kind);
// the terrain program's own info log carries this Direct3D warning on some boots and not others (identified by its shader defines, independent of
// the ecosystem); the ecosystem programs are checked through their own info logs in the snapshot instead
const KNOWN_TERRAIN_WARNING = /^THREE\.WebGLProgram: Program Info Log: (\(\d+,\d+-\d+\): warning X4008: floating point division by zero[\s\u0000]*)+$/;

test('Landscape AI 599 D4: the ecosystem renderer draws injected tiles with LOD cross-fades, impostors, picking and contact on v3, and releases to zero', async ({ browser }, testInfo) => {
    test.setTimeout(20 * 60 * 1000);
    const baseURL = String(testInfo.project.use.baseURL);
    expect(new URL(baseURL).port, 'Landscape verification uses port 8002').toBe('8002');
    test.skip(!(await exists(path.join(landscapeDirectory, 'manifest.json'))), `${landscapeDirectory} is not installed`);
    await mkdir(artifacts, { recursive: true });
    const recipe = validateEcosystemRecipe(JSON.parse(await readFile(path.resolve(root, 'tools/bake_landscape/ecosystem/recipes/coastal-v3-ecosystem-v1.json'), 'utf8')));
    const server = await serve(landscapeDirectory, baseURL);
    const context = await browser.newContext({ baseURL, viewport, deviceScaleFactor: 1 });
    const page = await context.newPage(), errors = [], warnings = [], evidence = {};
    let phase = 'boot';
    page.on('pageerror', error => errors.push({ phase, text: error.message }));
    // shader compiler warnings (Direct3D X4008/X4122) are failures like the lighting suite treats them; the phase names the step that compiled the program
    page.on('console', message => { if (message.type() === 'error' && /shader|webgl|program|THREE|Landscape/i.test(message.text())) errors.push({ phase, text: message.text() }); if (message.type() === 'warning' && /shader|webgl|program|THREE/i.test(message.text())) warnings.push({ phase, text: message.text() }); });
    try {
        await routeRepositoryFiles(page);
        const manifestUrl = `${baseURL}${SERVED_MANIFEST}`, manifest = await loadLandscapeManifest(manifestUrl), groundAt = createGroundSampler(manifest, manifestUrl);
        await page.goto(landscapeViewerUrl('/screens/landscape_fabrication.html?landscapeEcosystem=auto&landscapeOcean=flat'));
        const boot = await settled(page), ecosystem = boot.ecosystem;
        expect(boot.revision).toBe(manifest.revision);
        expect(ecosystem.mode).toBe('auto');
        expect(ecosystem.status, `ecosystem: ${ecosystem.reason}`).toBe('active');
        expect(ecosystem.recipeId).toBe(recipe.id);
        expect(ecosystem.programCompile.pending).toBe(false); expect(ecosystem.programCompile.timedOut).toBe(false);
        expect(ecosystem.programCompile.infoLogs, 'the ecosystem programs link without compiler warnings').toEqual([]);
        evidence.surfaceCache = { status: boot.appearance?.surfaceCache?.status ?? null, reason: boot.appearance?.surfaceCache?.reason ?? null, terrainProgramVariant: boot.terrainProgramVariant };
        expect(ecosystem.materials).toBe(Object.values(recipe.layers).reduce((sum, layer) => sum + layer.lods.length, 0));
        // the asset sets: every recipe set, the rock LODs within their triangle budgets, the catalog LODs textured with the impostor at level 5, all reserved in the share
        expect(ecosystem.assets.sets.map(set => set.id).sort()).toEqual(Object.keys(recipe.assets).sort());
        for (const set of ecosystem.assets.sets) {
            const asset = recipe.assets[set.id];
            for (const lod of set.lods) {
                const declared = asset.lods.find(entry => entry.level === lod.level);
                if (asset.kind === 'placeholder-rocks') { expect(lod.triangles).toBeLessThanOrEqual(declared.triangles); expect(lod.triangles).toBeGreaterThanOrEqual(declared.triangles / 4); expect(lod.textured).toBe(false); }
                else { expect(lod.textured).toBe(true); expect(lod.impostor).toBe(lod.level === 5); if (lod.level === 5) expect(lod.triangles).toBe(2); }
            }
            expect(set.cpuBytes).toBeGreaterThan(0); expect(set.gpuBytes).toBeGreaterThan(0);
        }
        expect(ecosystem.share.cpuBytes).toBe(ecosystem.assets.cpuBytes); expect(ecosystem.share.gpuBytes).toBe(ecosystem.assets.gpuBytes);
        expect(ecosystem.share.cpuBytes).toBeLessThanOrEqual(LANDSCAPE_ECOSYSTEM.budgets.cpuBytes); expect(ecosystem.share.gpuBytes).toBeLessThanOrEqual(LANDSCAPE_ECOSYSTEM.budgets.gpuBytes);
        expect(ecosystemEntries(boot).map(entry => [entry.cpuBytes, entry.gpuBytes])).toEqual([[LANDSCAPE_ECOSYSTEM.budgets.cpuBytes, LANDSCAPE_ECOSYSTEM.budgets.gpuBytes]]);
        expect(ecosystem.tiles).toBe(0);
        evidence.boot = { ecosystem: { ...ecosystem, tileRecords: undefined }, budget: { cpuBytes: boot.budget.cpuBytes, gpuBytes: boot.budget.gpuBytes, limits: boot.budget.limits } };
        // synthetic tiles of every asset set around NW-04 and NW-06, their records at the exact native ground of the served chunks
        phase = 'inject';
        const tiles = [];
        for (const site of SITES) for (const { id, density } of LAYERS) tiles.push({ site: site.name, ...(await buildTile({ recipe, layerId: id, x: site.x, z: site.z, density, groundAt })) });
        for (const tile of tiles) {
            expect(tile.count).toBeGreaterThan(20);
            for (let i = 0; i < tile.count; i++) { const record = recordAt(tile, i); const ground = await groundAt(record.x, record.z); expect(Math.abs(record.y - ground.height), `${tile.id} record ${i} sits on the native ground`).toBeLessThan(1e-3); }
            const injected = await page.evaluate(tile => window.__landscapeTestHooks.ecosystemInjectTile(tile), { id: tile.id, layerId: tile.layerId, cellX: tile.cellX, cellZ: tile.cellZ, bounds: tile.bounds, heightRange: tile.heightRange, records: tile.records, ids: tile.ids, count: tile.count });
            expect(injected.instances).toBe(tile.count); expect(injected.draws).toBe(recipe.layers[tile.layerId].lods.length);
        }
        await expect(page.evaluate(tile => window.__landscapeTestHooks.ecosystemInjectTile(tile), { id: tiles[0].id, layerId: tiles[0].layerId, cellX: 0, cellZ: 0, bounds: tiles[0].bounds, heightRange: [0, 1], records: [], ids: [], count: 0 })).rejects.toThrow(/already injected/);
        const totalInstances = tiles.reduce((sum, tile) => sum + tile.count, 0), tileBytes = tiles.reduce((sum, tile) => sum + tile.count * 60, 0);
        const withTiles = (await settled(page)).ecosystem;
        expect(withTiles.tiles).toBe(tiles.length); expect(withTiles.instances).toBe(totalInstances); expect(withTiles.drawn).toBe(totalInstances);
        for (const { id } of LAYERS) { const layerTiles = tiles.filter(tile => tile.layerId === id); expect(withTiles.byLayer[id].tiles).toBe(layerTiles.length); expect(withTiles.byLayer[id].instances).toBe(layerTiles.reduce((sum, tile) => sum + tile.count, 0)); expect(withTiles.byLayer[id].meshes).toBe(layerTiles.length * recipe.layers[id].lods.length); }
        expect(withTiles.share.cpuBytes).toBe(ecosystem.assets.cpuBytes + tileBytes); expect(withTiles.share.gpuBytes).toBe(ecosystem.assets.gpuBytes + tileBytes * 48 / 60);
        evidence.tiles = tiles.map(tile => ({ id: tile.id, site: tile.site, count: tile.count, bounds: tile.bounds, heightRange: tile.heightRange }));
        // an overview of NW-04: the boulders cell seen from the north-west, every band of the three layers in view
        phase = 'overview';
        const nw04 = tiles.find(tile => tile.site === 'NW-04' && tile.layerId === 'boulders'), centre = { x: (nw04.bounds.minX + nw04.bounds.maxX) / 2, z: (nw04.bounds.minZ + nw04.bounds.maxZ) / 2 };
        const centreGround = await groundAt(centre.x, centre.z);
        await page.evaluate(view => window.__landscapeTestHooks.setCamera(view), lookAt([centre.x - 150, centreGround.height + 45, centre.z - 150], [centre.x, centreGround.height, centre.z]));
        const overview = await settled(page);
        expect(overview.ecosystem.draws).toBeGreaterThan(0); expect(overview.ecosystem.drawnLastFrame).toBe(true);
        await page.screenshot({ path: path.join(artifacts, 'nw04-overview-shaded.png') });
        evidence.overview = { draws: overview.ecosystem.draws, triangles: overview.ecosystem.triangles, trianglesVisible: overview.ecosystem.trianglesVisible, byLevel: overview.ecosystem.byLevel, frameCostMs: overview.ecosystem.frameCostMs, programCompile: overview.ecosystem.programCompile };
        // the LOD diagnostic: every LOD-coloured pixel whose picked instance lies well inside one band carries that band's colour
        phase = 'lod';
        const lodView = await page.evaluate(options => window.__landscapeTestHooks.setEcosystem(options), { diagnostic: 'lod' });
        expect(lodView.diagnostic).toBe('lod'); expect(lodView.diagnosticsCompiled).toBe(true);
        expect(lodView.programCompile.rebuilds).toBe(1); expect(lodView.programCompile.infoLogs, 'the diagnostics programs link without compiler warnings').toEqual([]);
        await settled(page);
        await page.screenshot({ path: path.join(artifacts, 'nw04-overview-lod.png') });
        const samples = await page.evaluate(async ({ palette, step }) => {
            const hooks = window.__landscapeTestHooks, frame = await hooks.readFrame(), rect = document.getElementById('game-canvas').getBoundingClientRect(), result = [];
            for (let y = step; y < frame.height; y += step) for (let x = step; x < frame.width; x += step) {
                const o = (y * frame.width + x) * 4, pixel = [frame.data[o], frame.data[o + 1], frame.data[o + 2]];
                const colour = palette.findIndex(entry => entry.every((value, channel) => Math.abs(value - pixel[channel]) <= 2));
                if (colour < 0) continue;
                const pick = hooks.ecosystemPick(rect.left + x * rect.width / frame.width, rect.top + y * rect.height / frame.height);
                result.push({ x, y, colour, pick: pick ? { layerId: pick.layerId, distance: pick.distance, id: pick.id } : null });
            }
            return { frameIndex: frame.frameIndex, result };
        }, { palette, step: 6 });
        const bands = Object.fromEntries(Object.values(recipe.layers).map(layer => [layer.id, ecosystemLodBands(layer)]));
        let judged = 0, agreed = 0;
        for (const sample of samples.result) {
            if (!sample.pick) continue;
            const inside = bands[sample.pick.layerId].filter(band => ecosystemInstanceFade(sample.pick.distance, band) === 1 && sample.pick.distance > band.fadeIn[1] + 3 && sample.pick.distance < band.fadeOut[0] - 3);
            if (inside.length !== 1) continue;
            judged++;
            if (inside[0].index === sample.colour) agreed++;
        }
        expect(samples.result.length, 'LOD-coloured pixels in the overview').toBeGreaterThan(50);
        expect(judged).toBeGreaterThan(30);
        expect(agreed / judged, `${agreed} of ${judged} picked instances show their band colour`).toBeGreaterThan(.9);
        evidence.lod = { colouredPixels: samples.result.length, judged, agreed, byColour: palette.map((_, index) => samples.result.filter(sample => sample.colour === index).length) };
        // the layer view compiles no new program (the diagnostics variant is shared); the rank and fade views exist
        for (const diagnostic of ['layer', 'rank', 'fade']) { const view = await page.evaluate(options => window.__landscapeTestHooks.setEcosystem(options), { diagnostic }); expect(view.diagnostic).toBe(diagnostic); }
        await settled(page);
        await page.screenshot({ path: path.join(artifacts, 'nw04-overview-fade.png') });
        const shaded = await page.evaluate(options => window.__landscapeTestHooks.setEcosystem(options), { diagnostic: 'none' });
        expect(shaded.diagnosticsCompiled).toBe(false);
        // a dolly from 130 m to 50 m from the boulders tile centre, through the boulders' 120 m and the shrubs' 90 m boundaries: per-step frame differences without a spike
        phase = 'dolly';
        const region = { left: 480, top: 270, width: 960, height: 540 }, steps = 40, differences = [];
        const from = [centre.x - 130 * Math.SQRT1_2, centre.z - 130 * Math.SQRT1_2], to = [centre.x - 50 * Math.SQRT1_2, centre.z - 50 * Math.SQRT1_2];
        for (let step = 0; step <= steps; step++) {
            // the eye follows the ground under it (a hillside between the poses would otherwise bury a straight path)
            const t = step / steps, x = from[0] + (to[0] - from[0]) * t, z = from[1] + (to[1] - from[1]) * t, eyeGround = await groundAt(x, z);
            const position = [x, Math.max(eyeGround?.height ?? centreGround.height, centreGround.height) + 5 + 7 * (1 - t), z];
            await page.evaluate(view => window.__landscapeTestHooks.setCamera(view), lookAt(position, [centre.x, centreGround.height + 1, centre.z]));
            await settled(page, 120000);
            await frames(page, 2);
            const difference = await page.evaluate(async region => {
                const frame = await window.__landscapeTestHooks.readFrame(region), previous = window.__ecosystemDollyFrame;
                window.__ecosystemDollyFrame = frame;
                if (!previous) return null;
                let sum = 0;
                for (let i = 0; i < frame.data.length; i += 4) sum += Math.abs(frame.data[i] - previous.data[i]) + Math.abs(frame.data[i + 1] - previous.data[i + 1]) + Math.abs(frame.data[i + 2] - previous.data[i + 2]);
                return sum / (frame.data.length / 4 * 3);
            }, region);
            if (difference !== null) differences.push(difference);
        }
        const sortedDifferences = [...differences].sort((a, b) => a - b), median = sortedDifferences[Math.floor(sortedDifferences.length / 2)], peak = Math.max(...differences);
        expect(differences.length).toBe(steps);
        expect(median).toBeGreaterThan(0);
        expect(peak, `dolly peak ${peak.toFixed(3)} vs median ${median.toFixed(3)}: ${differences.map(value => value.toFixed(2)).join(' ')}`).toBeLessThanOrEqual(3 * median);
        await page.screenshot({ path: path.join(artifacts, 'nw04-dolly-end.png') });
        evidence.dolly = { steps, median, peak, differences };
        // picking: aim at an isolated boulder of medium scale from 6 m; the screen centre returns its id and record
        phase = 'pick';
        const candidates = Array.from({ length: nw04.count }, (_, index) => index).filter(index => isolated(nw04, index, 3.5) && recordAt(nw04, index).scale > .8 && recordAt(nw04, index).scale < 1.6);
        expect(candidates.length).toBeGreaterThan(0);
        let target = null;
        for (const index of candidates) { const record = recordAt(nw04, index), ground = await groundAt(record.x, record.z); if (ground.slopeDegrees < 8) { target = { index, record, ground }; break; } }
        expect(target, 'an isolated boulder on gentle ground').not.toBeNull();
        const aim = [target.record.x, target.record.y + nw04.height * target.record.scale / 2, target.record.z], eye = [target.record.x - 6 * Math.SQRT1_2, target.record.y + 2.2, target.record.z - 6 * Math.SQRT1_2];
        await page.evaluate(view => window.__landscapeTestHooks.setCamera(view), lookAt(eye, aim));
        await settled(page, 120000);
        const picked = await page.evaluate(() => { const rect = document.getElementById('game-canvas').getBoundingClientRect(); return window.__landscapeTestHooks.ecosystemPick(rect.left + rect.width / 2, rect.top + rect.height / 2); });
        expect(picked).not.toBeNull();
        expect(picked.id).toBe(ecosystemInstanceId('boulders', target.record.siteX, target.record.siteZ));
        expect(picked.tileId).toBe(nw04.id); expect(picked.index).toBe(target.index);
        for (const key of ['x', 'y', 'z', 'scale', 'yaw', 'rank']) expect(Math.abs(picked.record[key] - target.record[key])).toBeLessThan(1e-5);
        expect(picked.distance).toBeGreaterThan(4); expect(picked.distance).toBeLessThan(7);
        // terrain contact: in the LOD view from this low angle the boulder covers its own anchor pixel (not floating) and its colour ends within the rim's
        // projection below the anchor (not sunk out of sight); the record's y equals the exact native height by construction (checked above)
        await page.evaluate(options => window.__landscapeTestHooks.setEcosystem(options), { diagnostic: 'lod' });
        await settled(page, 120000);
        await frames(page, 2);
        const canvas = boot.canvas, camera = lookAt(eye, aim), anchor = project(camera, [target.record.x, target.record.y, target.record.z], canvas);
        const rim = project(camera, [target.record.x - nw04.footprint * target.record.scale * Math.SQRT1_2, target.record.y, target.record.z - nw04.footprint * target.record.scale * Math.SQRT1_2], canvas);
        const column = await page.evaluate(async ({ x, y, height, palette }) => {
            const frame = await window.__landscapeTestHooks.readFrame({ left: Math.round(x), top: 0, width: 1, height }), rows = [];
            for (let row = 0; row < frame.height; row++) { const o = row * 4; rows.push(palette.some(entry => entry.every((value, channel) => Math.abs(value - frame.data[o + channel]) <= 2))); }
            return { anchorRow: Math.round(y), rows };
        }, { x: anchor.x, y: anchor.y, height: canvas.height, palette });
        const anchorRow = column.anchorRow;
        let bottom = anchorRow;
        while (bottom + 1 < column.rows.length && column.rows[bottom + 1]) bottom++;
        expect(column.rows[anchorRow], 'the boulder covers its anchor pixel').toBe(true);
        const rimRows = rim.y - anchor.y;
        expect(bottom - anchorRow, `the boulder's colour ends ${bottom - anchorRow} rows below the anchor; the near rim projects ${rimRows.toFixed(1)} rows below`).toBeLessThanOrEqual(rimRows + 12);
        await page.screenshot({ path: path.join(artifacts, 'nw04-boulder-contact-lod.png') });
        await page.evaluate(options => window.__landscapeTestHooks.setEcosystem(options), { diagnostic: 'none' });
        await settled(page, 120000);
        await page.screenshot({ path: path.join(artifacts, 'nw04-boulder-contact-shaded.png') });
        evidence.contact = { target: { id: picked.id, record: target.record, slopeDegrees: target.ground.slopeDegrees }, anchorRow, bottomRow: bottom, rimRows, picked: { distance: picked.distance } };
        // the shrubs at NW-06 from the impostor range: the far band draws the camera-facing cards
        phase = 'shrubs';
        const nw06 = tiles.find(tile => tile.site === 'NW-06' && tile.layerId === 'shrubs'), shrubCentre = { x: (nw06.bounds.minX + nw06.bounds.maxX) / 2, z: (nw06.bounds.minZ + nw06.bounds.maxZ) / 2 }, shrubGround = await groundAt(shrubCentre.x, shrubCentre.z);
        await page.evaluate(view => window.__landscapeTestHooks.setCamera(view), lookAt([shrubCentre.x - 320, shrubGround.height + 40, shrubCentre.z - 60], [shrubCentre.x, shrubGround.height, shrubCentre.z]));
        const impostors = await settled(page);
        expect(impostors.ecosystem.byLevel['5']?.draws ?? 0, 'the impostor band draws from 320 m').toBeGreaterThan(0);
        await page.screenshot({ path: path.join(artifacts, 'nw06-shrubs-impostors.png') });
        await page.evaluate(view => window.__landscapeTestHooks.setCamera(view), lookAt([shrubCentre.x - 40, shrubGround.height + 6, shrubCentre.z - 10], [shrubCentre.x, shrubGround.height + 1, shrubCentre.z]));
        const cards = await settled(page);
        expect(cards.ecosystem.byLevel['3']?.draws ?? 0, 'the card band draws from 40 m').toBeGreaterThan(0);
        await page.screenshot({ path: path.join(artifacts, 'nw06-shrubs-cards.png') });
        evidence.shrubs = { impostorDraws: impostors.ecosystem.byLevel['5']?.draws ?? 0, cardDraws: cards.ecosystem.byLevel['3']?.draws ?? 0, byLevel: cards.ecosystem.byLevel };
        // the wind and contact hooks and the shadow flags take effect; a draw fraction keeps a rank prefix
        const hooks = await page.evaluate(options => window.__landscapeTestHooks.setEcosystem(options), { wind: { directionX: 1, directionZ: .5, strength: .15 }, contact: { strength: .5, heightMeters: .3 }, shadows: { enabled: true } });
        expect(hooks.wind.strength).toBe(.15); expect(hooks.contact).toEqual({ strength: .5, heightMeters: .3 }); expect(hooks.shadows.enabled).toBe(true); expect(hooks.shadows.casters).toBeGreaterThan(0);
        await frames(page, 3);
        expect((await snapshot(page)).ecosystem.wind.time).toBeGreaterThan(0);
        // a removed tile returns exactly its bytes; disposal leaves no ecosystem byte in the ledger
        phase = 'teardown';
        const removed = await page.evaluate(id => window.__landscapeTestHooks.ecosystemRemoveTile(id), nw06.id);
        expect(removed.tiles).toBe(tiles.length - 1); expect(removed.instances).toBe(totalInstances - nw06.count);
        expect(removed.share.cpuBytes).toBe(withTiles.share.cpuBytes - nw06.count * 60); expect(removed.share.gpuBytes).toBe(withTiles.share.gpuBytes - nw06.count * 48);
        await page.evaluate(() => window.__landscapeTestHooks.dispose());
        const disposed = await snapshot(page);
        expect(disposed.budget.cpuBytes).toBe(0); expect(disposed.budget.gpuBytes).toBe(0);
        expect(ecosystemEntries(disposed)).toHaveLength(0);
        expect(disposed.ecosystem.present).toBe(false);
        evidence.disposed = { cpuBytes: disposed.budget.cpuBytes, gpuBytes: disposed.budget.gpuBytes, peakCpuBytes: disposed.budget.peakCpuBytes, peakGpuBytes: disposed.budget.peakGpuBytes };
        expect(errors).toEqual([]);
        evidence.knownTerrainWarnings = warnings.filter(warning => KNOWN_TERRAIN_WARNING.test(warning.text.trim()));
        expect(warnings.filter(warning => !KNOWN_TERRAIN_WARNING.test(warning.text.trim()))).toEqual([]);
    } finally {
        await writeFile(path.join(artifacts, 'ecosystem-render-suite.json'), JSON.stringify({ landscape: landscapeDirectory, recipe: recipe.id, evidence, errors, warnings }, null, 2));
        await context.close();
        server.closeAllConnections();
        await new Promise(resolve => server.close(() => resolve(undefined)));
    }
});
