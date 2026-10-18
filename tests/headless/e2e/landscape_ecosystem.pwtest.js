// Verifies the AI 599 D3 ecosystem streamer in the viewer on coastal terrain v3: the published sidecar binds the loaded revision and holds its share, the
// offline tiles around NW-04 (boulders) and NW-06 (shrubs) become resident with the exact published bytes (counts and SHA-256 against the tile indexes),
// the runtime pebbles layer generates cells at NW-03 whose hashes equal the ones Node computes through the bake's own sources (the Node/browser
// determinism gate), a dolly along the bluff keeps the uploads under the frame cap with the renderer drawing, a teleport over the sea cancels pending
// work and evicts the far tiles, a profile below the shipped one reports the ecosystem unavailable while the terrain streams, an exclude mask re-derives a
// resident tile without a refetch, and the off switch and disposal release every ecosystem byte. The suite serves the landscape itself on the
// verification port (like the surround suite). LANDSCAPE_TEST_ECOSYSTEM_LANDSCAPE names the landscape directory (default coastal-city-v3).
import { test, expect } from '@playwright/test';
import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { createLandscapeServer } from '../../../tools/landscape_server/Server.mjs';
import { landscapeViewerUrl } from '../../shared/landscape_viewer_url.js';
import { LANDSCAPE_ECOSYSTEM } from '../../../src/graphics/engine3d/landscape/ecosystem/LandscapeEcosystemModel.js';
import { LANDSCAPE_STREAMING_BUDGETS } from '../../../src/app/landscape/LandscapeResidencyBudget.js';
import { createEcosystemCellCache, encodeEcosystemTile, generateEcosystemLayerCells, loadLandscapeChunk, loadLandscapeManifest, parseEcosystemTileId, sampleLandscapeChunk, validateEcosystemRecipe } from '../../../src/app/landscape/index.js';
import { openEcosystemLandscape } from '../../../tools/bake_landscape/ecosystem/EcosystemFileSources.mjs';

const root = path.resolve('.');
const MiB = 1024 * 1024;
const SERVED_MANIFEST = '/assets/public/landscape/coastal-city/manifest.json';
const landscapeDirectory = path.resolve(root, process.env.LANDSCAPE_TEST_ECOSYSTEM_LANDSCAPE ?? 'assets/public/landscape/coastal-city-v3');
const artifacts = path.resolve(root, 'tests/artifacts/screens/landscape/ai599/d3');
const viewport = { width: 1920, height: 1080 };
// the natural-world poses (tools/landscape_review/poses/natural-world-v1.json): the bluff top (boulders), the forest edge (shrubs), the bluff toe on the sand (pebbles), the aerial over the sea
const POSES = { 'NW-04': { x: 1322, z: 2400, eye: 1.7, heading: 250, pitch: -8 }, 'NW-06': { x: 2074, z: 3316, eye: 1.7, heading: 180, pitch: -3 }, 'NW-03': { x: 1228, z: 2600, eye: 1.7, heading: 20, pitch: -4 }, 'NW-11': { x: -400, z: 2000, altitude: 800, heading: 90, pitch: -30 } };
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

const snapshot = page => page.evaluate(() => window.__landscapeTestHooks.snapshot());
const ecosystemEntries = state => state.budget.entries.filter(entry => entry.kind === LANDSCAPE_ECOSYSTEM.kind);
const direction = (heading, pitch) => { const h = heading * Math.PI / 180, p = pitch * Math.PI / 180; return [Math.sin(h) * Math.cos(p), Math.sin(p), Math.cos(h) * Math.cos(p)]; };
const pose = (x, y, z, heading, pitch) => { const d = direction(heading, pitch); return { position: [x, y, z], target: [x + d[0] * 100, y + d[1] * 100, z + d[2] * 100], projection: 'perspective', fov: 55, zoom: 1 }; };
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
// the terrain program's own info log carries this Direct3D warning on some boots (identified by its shader defines, independent of the ecosystem)
const KNOWN_TERRAIN_WARNING = /^THREE\.WebGLProgram: Program Info Log: (\(\d+,\d+-\d+\): warning X4008: floating point division by zero[\s\u0000]*)+$/;

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
        const conditions = await page.evaluate(() => { const state = window.__landscapeTestHooks?.snapshot(); return { ready: state?.ready, streaming: state?.streaming?.settled, pending: state?.streaming?.pending, appearance: state?.appearance?.settled, planning: state?.planning?.settled, ocean: state?.ocean?.status,
            ecosystem: state?.ecosystem && { status: state.ecosystem.status, reason: state.ecosystem.reason, settled: state.ecosystem.settled, pending: state.ecosystem.pending, missing: state.ecosystem.missing, worker: state.ecosystem.worker, errors: state.ecosystem.errors, programCompile: state.ecosystem.programCompile } }; }).catch(() => null);
        throw new Error(`the viewer did not settle within ${timeoutMs} ms: ${JSON.stringify(conditions)}; ${error.message}`);
    }
    await page.waitForTimeout(300);
    return snapshot(page);
}

async function frames(page, count) {
    const start = await page.evaluate(() => window.__landscapeTestHooks.snapshot().frameIndex);
    await page.waitForFunction(({ start, count }) => window.__landscapeTestHooks.snapshot().frameIndex >= start + count, { start, count }, { timeout: 60000 });
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

const layerOf = (state, id) => state.ecosystem.layers.find(layer => layer.id === id);
const residentOf = (state, layerId) => state.ecosystem.residentIds.filter(id => parseEcosystemTileId(id).layerId === layerId);

test('Landscape AI 599 D3: the ecosystem streamer binds the published sidecar, streams published and generated tiles byte for byte, degrades inside its share and releases to zero', async ({ browser }, testInfo) => {
    test.setTimeout(30 * 60 * 1000);
    const baseURL = String(testInfo.project.use.baseURL);
    expect(new URL(baseURL).port, 'Landscape verification uses port 8002').toBe('8002');
    test.skip(!(await exists(path.join(landscapeDirectory, 'manifest.json'))), `${landscapeDirectory} is not installed`);
    test.skip(!(await exists(path.join(landscapeDirectory, 'ecosystem/manifest.json'))), `${landscapeDirectory} publishes no ecosystem sidecar`);
    await mkdir(artifacts, { recursive: true });
    const sidecar = JSON.parse(await readFile(path.join(landscapeDirectory, 'ecosystem/manifest.json'), 'utf8')), recipe = validateEcosystemRecipe(sidecar.recipe);
    const indexes = new Map();
    for (const entry of sidecar.layers) if (entry.tiles) indexes.set(entry.id, new Map(JSON.parse(await readFile(path.join(landscapeDirectory, 'ecosystem', entry.tiles.url), 'utf8')).tiles.map(tile => [tile.id, tile])));
    const server = await serve(landscapeDirectory, baseURL);
    const context = await browser.newContext({ baseURL, viewport, deviceScaleFactor: 1 });
    const page = await context.newPage(), errors = [], warnings = [], evidence = { landscape: landscapeDirectory, sidecar: sidecar.revision, recipe: recipe.id };
    let phase = 'boot';
    page.on('pageerror', error => errors.push({ phase, text: error.message }));
    page.on('console', message => { if (message.type() === 'error' && /shader|webgl|program|THREE|Landscape/i.test(message.text())) errors.push({ phase, text: message.text() }); if (message.type() === 'warning' && /shader|webgl|program|THREE|Landscape/i.test(message.text())) warnings.push({ phase, text: message.text() }); });
    try {
        const manifestUrl = `${baseURL}${SERVED_MANIFEST}`, manifest = await loadLandscapeManifest(manifestUrl), groundAt = createGroundSampler(manifest, manifestUrl);
        const eyePose = async name => { const entry = POSES[name]; const ground = entry.altitude === undefined ? await groundAt(entry.x, entry.z) : null; return pose(entry.x, entry.altitude ?? ground.height + entry.eye, entry.z, entry.heading, entry.pitch); };
        // the streams plan at their next frame: two frames keep the settle poll from reading the previous pose's settled state
        const moveTo = async name => { await page.evaluate(view => window.__landscapeTestHooks.setCamera(view), await eyePose(name)); await frames(page, 2); return settled(page); };
        // boot: the default option (auto) binds the published sidecar to the loaded revision and holds exactly the share
        await page.goto(landscapeViewerUrl('/screens/landscape_fabrication.html?landscapeOcean=flat'));
        const boot = await settled(page), ecosystem = boot.ecosystem;
        expect(boot.revision).toBe(manifest.revision);
        expect(ecosystem.mode).toBe('auto');
        expect(ecosystem.status, `ecosystem: ${ecosystem.reason}`).toBe('active');
        expect(ecosystem.revision).toBe(sidecar.revision); expect(ecosystem.recipeId).toBe(recipe.id); expect(ecosystem.recipeIdentity).toBe(sidecar.dependencies.recipeIdentity);
        expect(ecosystem.binding).toMatchObject({ landscapeId: manifest.id, terrainRevision: manifest.revision, currentTerrainRevision: manifest.revision, bound: true, staleChunks: 0, fieldsRevision: sidecar.dependencies.fieldsRevision, geologyRevision: sidecar.dependencies.geologyRevision, planningBound: true });
        expect(ecosystem.programCompile.pending).toBe(false); expect(ecosystem.programCompile.infoLogs, 'the ecosystem programs link without compiler warnings').toEqual([]);
        expect(ecosystemEntries(boot).map(entry => [entry.cpuBytes, entry.gpuBytes])).toEqual([[LANDSCAPE_ECOSYSTEM.budgets.cpuBytes, LANDSCAPE_ECOSYSTEM.budgets.gpuBytes]]);
        expect(ecosystem.layers.map(layer => [layer.id, layer.generation, layer.published])).toEqual(sidecar.layers.map(entry => [entry.id, entry.generation, entry.tiles ? entry.tiles.count : null]));
        expect(ecosystem.layers.every(layer => layer.stale === 0 && layer.failure === null)).toBe(true);
        expect(ecosystem.standing.cpuBytes).toBeGreaterThan(0); expect(ecosystem.runtime.available).toBe(true);
        expect(ecosystem.share.cpuBytes).toBe(ecosystem.assets.cpuBytes + ecosystem.standing.cpuBytes + ecosystem.layers.reduce((sum, layer) => sum + layer.cpuBytes, 0));
        expect(boot.budget.limits).toMatchObject({ cpuBytes: expect.any(Number), gpuBytes: expect.any(Number) });
        expect(boot.budget.limits.cpuBytes).toBeGreaterThanOrEqual(LANDSCAPE_STREAMING_BUDGETS.cpuBytes);
        evidence.boot = { status: ecosystem.status, binding: ecosystem.binding, layers: ecosystem.layers, standing: ecosystem.standing, assets: { cpuBytes: ecosystem.assets.cpuBytes, gpuBytes: ecosystem.assets.gpuBytes, loadMs: ecosystem.assets.loadMs }, loadMs: ecosystem.loadMs, programCompile: ecosystem.programCompile, budget: { limits: boot.budget.limits, cpuBytes: boot.budget.cpuBytes, gpuBytes: boot.budget.gpuBytes } };
        // the offline tiles around the poses: every resident tile holds exactly its published records (count and SHA-256 of the index entry)
        const verifyResident = async (state, layerId) => {
            const ids = residentOf(state, layerId), index = indexes.get(layerId), checks = [];
            expect(ids.length, `${layerId} tiles resident`).toBeGreaterThan(0);
            for (const id of ids) {
                const entry = index.get(id), summary = await page.evaluate(id => window.__landscapeTestHooks.ecosystemTile(id), id);
                expect(entry, `${id} is a published tile`).toBeTruthy();
                expect(summary).toMatchObject({ id, layerId, status: 'resident', count: entry.count, held: entry.count, drawn: entry.count, fraction: 1, reason: null, sha256: entry.payload.sha256 });
                expect(summary.published.sha256).toBe(entry.payload.sha256);
                checks.push({ id, count: entry.count, sha256: summary.sha256 });
            }
            return checks;
        };
        phase = 'NW-04';
        const nw04 = await moveTo('NW-04');
        expect(nw04.ecosystem.settled).toBe(true); expect(nw04.ecosystem.pending).toBe(0);
        const bouldersAt04 = await verifyResident(nw04, 'boulders');
        expect(layerOf(nw04, 'boulders').resident).toBe(bouldersAt04.length); expect(layerOf(nw04, 'boulders').instances).toBe(bouldersAt04.reduce((sum, check) => sum + check.count, 0));
        expect(nw04.ecosystem.draws).toBeGreaterThan(0); expect(nw04.ecosystem.drawnLastFrame).toBe(true); expect(nw04.ecosystem.degradationReason).toBeNull();
        expect(nw04.ecosystem.share.cpuBytes).toBeLessThanOrEqual(LANDSCAPE_ECOSYSTEM.budgets.cpuBytes); expect(nw04.ecosystem.share.gpuBytes).toBeLessThanOrEqual(LANDSCAPE_ECOSYSTEM.budgets.gpuBytes);
        await page.screenshot({ path: path.join(artifacts, 'nw04-boulders.png') });
        expect(nw04.ecosystem.tiles, 'the renderer holds exactly the resident tiles').toBe(nw04.ecosystem.resident); expect(nw04.ecosystem.instances).toBe(nw04.ecosystem.drawnInstances);
        // the inspection trace: the worker re-evaluates the rule at the lattice site under the pose with every input named; a child layer needs a picked instance
        const trace = await page.evaluate(() => window.__landscapeTestHooks.ecosystemTrace('boulders', 1322, 2400));
        expect(trace).toMatchObject({ layerId: 'boulders', requested: { x: 1322, z: 2400 }, site: { child: -1 } });
        expect(['kept', 'below', 'excluded', 'competed', 'outside']).toContain(trace.trace.outcome);
        expect(Object.keys(trace.trace.inputs)).toEqual(expect.arrayContaining(['slopeDegrees', 'geology.coastalZone.bluff-crown', 'distance.layer.boulders', 'dressing.shrubSuitability'])); expect(trace.trace.rule.factors.length).toBeGreaterThan(0);
        expect(trace.trace.terrain.height).toBeGreaterThan(0); expect(Math.abs(trace.trace.position.x - 1322)).toBeLessThan(4); expect(Math.abs(trace.trace.position.z - 2400)).toBeLessThan(4);
        await expect(page.evaluate(() => window.__landscapeTestHooks.ecosystemTrace('boulder-scree', 1322, 2400))).rejects.toThrow(/needs a picked instance/);
        evidence.trace = { site: trace.site, cell: trace.cell, outcome: trace.trace.outcome, density: trace.trace.density, excluded: trace.trace.excluded, competitor: trace.trace.competitor, factors: trace.trace.rule.factors.length, terrain: trace.trace.terrain };
        evidence['NW-04'] = { resident: nw04.ecosystem.resident, instances: nw04.ecosystem.residentInstances, drawn: nw04.ecosystem.drawnInstances, layers: nw04.ecosystem.layers, share: nw04.ecosystem.share, timing: nw04.ecosystem.timing, worker: nw04.ecosystem.worker, draws: nw04.ecosystem.draws, triangles: nw04.ecosystem.triangles, verified: bouldersAt04.length };
        phase = 'NW-06';
        const nw06 = await moveTo('NW-06');
        const shrubsAt06 = await verifyResident(nw06, 'shrubs');
        expect(nw06.ecosystem.draws).toBeGreaterThan(0); expect(nw06.ecosystem.degradationReason).toBeNull();
        await page.screenshot({ path: path.join(artifacts, 'nw06-shrubs.png') });
        evidence['NW-06'] = { resident: nw06.ecosystem.resident, instances: nw06.ecosystem.residentInstances, layers: nw06.ecosystem.layers, share: nw06.ecosystem.share, timing: nw06.ecosystem.timing, worker: nw06.ecosystem.worker, verified: shrubsAt06.length };
        // the runtime pebbles layer at the bluff toe: generated cells, and the Node/browser determinism gate on two of them through the bake's own sources
        phase = 'NW-03';
        const nw03 = await moveTo('NW-03');
        const pebbles = layerOf(nw03, 'pebbles');
        expect(pebbles.resident, 'pebbles cells generated around NW-03').toBeGreaterThan(0); expect(pebbles.generated).toBeGreaterThan(0); expect(pebbles.failure).toBeNull();
        const heatmap = await page.evaluate(() => window.__landscapeTestHooks.ecosystemHeatmap('pebbles'));
        const populated = [...heatmap.cells].sort((a, b) => b.count - a.count);
        expect(populated[0]?.count ?? 0, 'at least one pebbles cell holds instances').toBeGreaterThan(0);
        const gateCells = populated.slice(0, 2);
        const browserHashes = [];
        for (const cell of gateCells) browserHashes.push(await page.evaluate(([x, z]) => window.__landscapeTestHooks.ecosystemHash('pebbles', x, z), [cell.cellX, cell.cellZ]));
        const landscape = await openEcosystemLandscape({ directory: landscapeDirectory, recipe });
        const nodeResults = await generateEcosystemLayerCells({ recipe, layer: recipe.layers.pebbles, cells: gateCells.map(cell => ({ cellX: cell.cellX, cellZ: cell.cellZ })), cellSources: landscape.cellSources, overrides: null, densityScale: 1, cache: createEcosystemCellCache(), bounds: landscape.manifest.bounds });
        const gate = [];
        for (const [i, cell] of gateCells.entries()) {
            const node = nodeResults[i], encoded = encodeEcosystemTile(node.tile), nodeHash = sha256(encoded), summary = await page.evaluate(id => window.__landscapeTestHooks.ecosystemTile(id), cell.id);
            expect(browserHashes[i].count).toBe(node.tile.count); expect(browserHashes[i].generation).toBe('runtime');
            expect(browserHashes[i].hash, `${cell.id}: the browser worker and Node generate the same bytes`).toBe(nodeHash);
            expect(summary.sha256, `${cell.id}: the resident records are those bytes`).toBe(nodeHash); expect(summary.count).toBe(node.tile.count); expect(summary.reason).toBeNull();
            gate.push({ id: cell.id, count: node.tile.count, byteLength: encoded.byteLength, nodeHash, browserHash: browserHashes[i].hash, residentHash: summary.sha256, browserMs: browserHashes[i].milliseconds, identical: nodeHash === browserHashes[i].hash && nodeHash === summary.sha256 });
        }
        await page.screenshot({ path: path.join(artifacts, 'nw03-pebbles.png') });
        evidence['NW-03'] = { resident: nw03.ecosystem.resident, instances: nw03.ecosystem.residentInstances, layers: nw03.ecosystem.layers, share: nw03.ecosystem.share, runtime: nw03.ecosystem.runtime, worker: nw03.ecosystem.worker, timing: nw03.ecosystem.timing, heatmapCells: heatmap.cells.length, determinism: gate, nodeReads: landscape.reads };
        // travel: a 60-step dolly north along the bluff (NW-04 to the NW-03 latitude and beyond) within the frame's upload cap, the share within its limits, the renderer drawing
        phase = 'dolly';
        const steps = 60, from = { x: 1322, z: 2400 }, to = { x: 1300, z: 2700 }, travel = [];
        for (let step = 0; step <= steps; step++) {
            const t = step / steps, x = from.x + (to.x - from.x) * t, z = from.z + (to.z - from.z) * t, ground = await groundAt(x, z);
            await page.evaluate(view => window.__landscapeTestHooks.setCamera(view), pose(x, ground.height + 1.7, z, 350, -6));
            await frames(page, 2);
            const state = await snapshot(page);
            expect(state.uploadedBytesPerFrame, `step ${step} uploads`).toBeLessThanOrEqual(8 * MiB);
            expect(state.ecosystem.share.cpuBytes).toBeLessThanOrEqual(LANDSCAPE_ECOSYSTEM.budgets.cpuBytes); expect(state.ecosystem.share.gpuBytes).toBeLessThanOrEqual(LANDSCAPE_ECOSYSTEM.budgets.gpuBytes);
            expect(state.budget.cpuBytes).toBeLessThanOrEqual(state.budget.limits.cpuBytes); expect(state.budget.gpuBytes).toBeLessThanOrEqual(state.budget.limits.gpuBytes);
            travel.push({ step, x, z, resident: state.ecosystem.resident, pending: state.ecosystem.pending, draws: state.ecosystem.draws, drawn: state.ecosystem.drawnLastFrame, uploaded: state.uploadedBytesPerFrame, ecosystemUploaded: state.ecosystem.uploadedBytesPerFrame, planMs: state.ecosystem.timing.lastPlanMs, cpuBytes: state.ecosystem.share.cpuBytes });
        }
        await frames(page, 2);
        const afterDolly = await settled(page);
        expect(afterDolly.peakUploadedBytesPerFrame).toBeLessThanOrEqual(8 * MiB);
        expect(travel.filter(entry => entry.drawn).length, 'the renderer drew along the way').toBeGreaterThan(steps / 2);
        expect(afterDolly.ecosystem.resident).toBeGreaterThan(0); expect(afterDolly.ecosystem.draws).toBeGreaterThan(0);
        await page.screenshot({ path: path.join(artifacts, 'dolly-end.png') });
        evidence.dolly = { steps, travel, peakUploadedBytesPerFrame: afterDolly.peakUploadedBytesPerFrame, peakEcosystemUpload: afterDolly.ecosystem.peakUploadedBytesPerFrame, timing: afterDolly.ecosystem.timing, worker: afterDolly.ecosystem.worker, layers: afterDolly.ecosystem.layers };
        // teleport over the sea: the desired work of the bluff is cancelled (or drains) and the far tiles leave the keep disc
        phase = 'NW-11';
        await page.evaluate(view => window.__landscapeTestHooks.setCamera(view), await eyePose('NW-04'));
        await frames(page, 1);
        const before = await snapshot(page);
        await page.evaluate(view => window.__landscapeTestHooks.setCamera(view), await eyePose('NW-11'));
        await frames(page, 2);
        const during = await snapshot(page);
        await frames(page, 2);
        const nw11 = await settled(page);
        const bluffTiles = new Set([...bouldersAt04.map(check => check.id), ...residentOf(afterDolly, 'boulders'), ...residentOf(afterDolly, 'shrubs')]);
        expect(nw11.ecosystem.residentIds.some(id => bluffTiles.has(id)), 'the bluff tiles left the keep disc').toBe(false);
        expect(nw11.ecosystem.resident).toBeLessThan(before.ecosystem.resident);
        expect(layerOf(nw11, 'boulders').evictions + layerOf(nw11, 'shrubs').evictions).toBeGreaterThan(0);
        expect(nw11.ecosystem.worker.canceled > 0 || layerOf(nw11, 'boulders').canceled + layerOf(nw11, 'shrubs').canceled + layerOf(nw11, 'pebbles').canceled > 0 || (before.ecosystem.pending === 0 && during.ecosystem.pending === 0), 'pending work was cancelled or had drained').toBe(true);
        await page.screenshot({ path: path.join(artifacts, 'nw11-aerial.png') });
        evidence['NW-11'] = { before: { resident: before.ecosystem.resident, pending: before.ecosystem.pending }, during: { pending: during.ecosystem.pending, worker: during.ecosystem.worker }, after: { resident: nw11.ecosystem.resident, layers: nw11.ecosystem.layers, worker: nw11.ecosystem.worker, share: nw11.ecosystem.share } };
        // an exclude mask over a resident boulders tile re-derives it in place: fewer drawn instances, the held bytes unchanged, no refetch
        phase = 'overrides';
        const back = await moveTo('NW-04');
        const target = residentOf(back, 'boulders').map(id => ({ id, entry: indexes.get('boulders').get(id) })).sort((a, b) => b.entry.count - a.entry.count)[0];
        expect(target).toBeTruthy();
        const document = { format: 'landscape-ecosystem-overrides', schemaVersion: 1, id: 'd3-exclude-mask', recipe: recipe.id, regions: [], masks: [{ id: 'exclude-one-cell', mode: 'exclude', region: { type: 'rectangle', ...target.entry.bounds }, layers: ['boulders'] }], instances: { removed: [], pinned: [] } };
        const loadedBefore = layerOf(back, 'boulders').loaded, completedBefore = back.ecosystem.worker.completed;
        const masked = await page.evaluate(overrides => window.__landscapeTestHooks.setEcosystem({ overrides }), document);
        expect(masked.invalidations).toBeGreaterThan(0); expect(masked.overrides).toMatchObject({ id: 'd3-exclude-mask' });
        await frames(page, 2);
        const afterMask = await settled(page), maskedTile = await page.evaluate(id => window.__landscapeTestHooks.ecosystemTile(id), target.id);
        expect(maskedTile).toMatchObject({ id: target.id, count: target.entry.count, held: target.entry.count, drawn: 0, sha256: target.entry.payload.sha256 });
        expect(maskedTile.overrideResult).toMatchObject({ masked: target.entry.count, removed: 0, pinned: 0, unplaced: 0 });
        // the offline tiles are re-derived in place (no refetch); overrides are generation inputs of the runtime layers, which regenerate their desired cells
        const runtimeResident = state => layerOf(state, 'pebbles').resident + layerOf(state, 'boulder-scree').resident;
        expect(layerOf(afterMask, 'boulders').loaded, 'no refetch').toBe(loadedBefore); expect(layerOf(afterMask, 'shrubs').loaded).toBe(layerOf(back, 'shrubs').loaded);
        expect(afterMask.ecosystem.worker.completed - completedBefore, 'only the runtime cells regenerated').toBe(runtimeResident(afterMask));
        expect(layerOf(afterMask, 'boulders').drawn).toBe(layerOf(back, 'boulders').drawn - target.entry.count);
        const cleared = await page.evaluate(() => window.__landscapeTestHooks.setEcosystem({ overrides: null }));
        expect(cleared.overrides).toBeNull();
        await frames(page, 2);
        const afterClear = await settled(page), restoredTile = await page.evaluate(id => window.__landscapeTestHooks.ecosystemTile(id), target.id);
        expect(restoredTile).toMatchObject({ drawn: target.entry.count, held: target.entry.count }); expect(layerOf(afterClear, 'boulders').loaded).toBe(loadedBefore);
        evidence.overrides = { tile: target.id, count: target.entry.count, masked: maskedTile.overrideResult, invalidations: masked.invalidations, loadedBefore, loadedAfter: layerOf(afterClear, 'boulders').loaded, runtimeRegenerated: afterMask.ecosystem.worker.completed - completedBefore, runtimeResident: runtimeResident(afterMask) };
        // a profile below the shipped one: the ecosystem is unavailable with its reason while the terrain streams
        phase = 'low-budget';
        const small = await context.newPage(), smallErrors = [];
        small.on('pageerror', error => smallErrors.push(error.message));
        await small.goto(landscapeViewerUrl('/screens/landscape_fabrication.html?landscapeCpuMiB=688&landscapeGpuMiB=432&landscapeOcean=flat'));
        await small.waitForFunction(() => { const state = window.__landscapeTestHooks?.snapshot(); return state?.ready && state.streaming.settled && state.streaming.pending === 0 && state.ecosystem?.settled; }, null, { timeout: 240000 });
        const low = await small.evaluate(() => window.__landscapeTestHooks.snapshot());
        expect(low.budget.limits).toEqual({ cpuBytes: 688 * MiB, gpuBytes: 432 * MiB });
        expect(low.ecosystem.status).toBe('unavailable'); expect(low.ecosystem.reason).toMatch(/below the shipped profile/); expect(low.ecosystem.present).toBe(false);
        expect(ecosystemEntries(low)).toEqual([]); expect(low.streaming.residentLeafIds.length).toBeGreaterThan(0);
        expect(smallErrors).toEqual([]);
        evidence.lowBudget = { limits: low.budget.limits, status: low.ecosystem.status, reason: low.ecosystem.reason, terrainTiles: low.streaming.residentLeafIds.length };
        await small.evaluate(() => window.__landscapeTestHooks.dispose());
        await small.close();
        // off releases every ecosystem byte; auto binds again; disposal leaves nothing
        phase = 'teardown';
        const off = await page.evaluate(() => window.__landscapeTestHooks.setEcosystem({ mode: 'off' }));
        expect(off.status).toBe('off'); expect(off.present).toBe(false);
        const without = await settled(page);
        expect(ecosystemEntries(without)).toHaveLength(0); expect(without.ecosystem.status).toBe('off');
        const again = await page.evaluate(() => window.__landscapeTestHooks.setEcosystem({ mode: 'auto' }));
        expect(again.status, `auto again: ${again.reason}`).toBe('active');
        await frames(page, 2);
        const rebound = await settled(page);
        expect(rebound.ecosystem.resident).toBeGreaterThan(0); expect(ecosystemEntries(rebound)).toHaveLength(1);
        await page.evaluate(() => window.__landscapeTestHooks.dispose());
        const disposed = await snapshot(page);
        expect(disposed.budget.cpuBytes).toBe(0); expect(disposed.budget.gpuBytes).toBe(0);
        expect(ecosystemEntries(disposed)).toHaveLength(0); expect(disposed.ecosystem.present).toBe(false);
        evidence.disposed = { cpuBytes: disposed.budget.cpuBytes, gpuBytes: disposed.budget.gpuBytes, peakCpuBytes: disposed.budget.peakCpuBytes, peakGpuBytes: disposed.budget.peakGpuBytes };
        expect(errors).toEqual([]);
        evidence.knownTerrainWarnings = warnings.filter(warning => KNOWN_TERRAIN_WARNING.test(warning.text.trim())).length;
        expect(warnings.filter(warning => !KNOWN_TERRAIN_WARNING.test(warning.text.trim()))).toEqual([]);
    } finally {
        await writeFile(path.join(artifacts, 'ecosystem-streaming-suite.json'), JSON.stringify({ evidence, errors, warnings }, null, 2));
        await context.close();
        server.closeAllConnections();
        await new Promise(resolve => server.close(() => resolve(undefined)));
    }
});
