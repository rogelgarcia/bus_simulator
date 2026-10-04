// Verifies per-material texel demand from the pages where each soil occurs and that material streaming converges on the fitted composition.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { registerHooks } from 'node:module';
import { validateLandscapeManifest, createLandscapeAppearancePlanner, createLandscapeSurfaceDetailIndex, landscapeSurfaceDetailRecipeHash, LandscapeResidencyBudget } from '../../../src/app/landscape/index.js';
import { LandscapeAppearanceBudget } from '../../../src/graphics/engine3d/landscape/LandscapeAppearanceBudget.js';
import { landscapeMaterialTierBytes, planLandscapeAppearanceDemand } from '../../../src/graphics/engine3d/landscape/LandscapeAppearanceDemand.js';
import { landscapeCoverageMaskLayout } from '../../../src/graphics/engine3d/landscape/LandscapeSurfaceCoverage.js';
import { LANDSCAPE_SURFACE_DETAIL_RECIPE, landscapeSurfaceDetailSeed } from '../../../src/graphics/engine3d/landscape/LandscapeSurfaceDetailRecipe.js';
import { LandscapeSurfaceDetailPages } from '../../../src/graphics/engine3d/landscape/LandscapeSurfaceDetailPages.js';

// the page classes import three and the PBR pipeline for texture objects only; their demand and streaming decisions run on stubs
const stub = source => `data:text/javascript;charset=utf-8,${encodeURIComponent(source)}`;
const stubs = {
    three: stub(`export const RGBAFormat = 1023, RepeatWrapping = 1000, LinearFilter = 1006, LinearMipmapLinearFilter = 1008, NearestFilter = 1003, NoColorSpace = '';
        class Texture { constructor(data, width, height, depth = 1) { this.image = { data, width, height, depth }; this.layers = []; }
            addLayerUpdate(layer) { this.layers.push(layer); } clearLayerUpdates() { this.layers = []; } dispose() { this.disposed = true; } }
        export class DataTexture extends Texture { constructor(data, width, height) { super(data, width, height); } }
        export class DataArrayTexture extends Texture {}`),
    '../../content3d/materials/PbrTexturePipeline.js': stub('export function applyTextureColorSpace() {} export function resolvePbrMaterialPipeline() { throw new Error("unused"); }'),
    '../../content3d/materials/PbrTextureCalibrationResolver.js': stub('export function getPbrTextureCalibrationResolver() { throw new Error("unused"); }')
};
const mocked = ['LandscapeMaterialPages', 'LandscapeMaskPages'].map(name => new URL(`../../../src/graphics/engine3d/landscape/${name}.js?material-demand-mock`, import.meta.url));
const hooks = registerHooks({ resolve(specifier, context, nextResolve) {
    if (mocked.some(url => (context.parentURL ?? '').startsWith(url.href)) && Object.hasOwn(stubs, specifier)) return { url: stubs[specifier], shortCircuit: true };
    return nextResolve(specifier, context);
} });
const [{ LandscapeMaterialPages }, { LandscapeMaskPages }] = await Promise.all(mocked.map(url => import(url.href)));
hooks.deregister();

const MIB = 1024 * 1024;
const coastalUrl = new URL('../../../assets/public/landscape/coastal-city/manifest.json', import.meta.url);
const coastal = validateLandscapeManifest(JSON.parse(await readFile(coastalUrl, 'utf8')));
const coastalAppearance = JSON.parse(await readFile(new URL('appearance/manifest.json', coastalUrl), 'utf8'));
const periods = { unknown: 4, seabed: 30, sand: 30, loam: 4, forest: 4, rock: 4 };
const planner = createLandscapeAppearancePlanner(coastal, coastalAppearance, { materialTiling: Object.fromEntries(Object.entries(periods).map(([soilId, tileMeters]) => [soilId, { tileMeters }])),
    materialTiers: Object.fromEntries(Object.keys(periods).map(soilId => [soilId, [32, 128, 512, 1024]])), surfaceDetail: { levels: 3 } });

function perspective(position, target, fovDegrees, aspect = 16 / 9, near = .1, far = 6000) {
    const length = Math.hypot(target.x - position.x, target.y - position.y, target.z - position.z);
    const f = { x: (target.x - position.x) / length, y: (target.y - position.y) / length, z: (target.z - position.z) / length };
    const side = Math.hypot(f.z, f.x), r = { x: f.z / side, y: 0, z: -f.x / side }, u = { x: r.y * f.z - r.z * f.y, y: r.z * f.x - r.x * f.z, z: r.x * f.y - r.y * f.x };
    const ty = Math.tan(fovDegrees * Math.PI / 360), tx = ty * aspect, dot = n => n.x * position.x + n.y * position.y + n.z * position.z;
    const plane = (a, b, scale) => { const n = { x: a.x + b.x * scale, y: a.y + b.y * scale, z: a.z + b.z * scale }, l = Math.hypot(n.x, n.y, n.z), m = { x: n.x / l, y: n.y / l, z: n.z / l }; return { ...m, w: -dot(m) }; };
    const negate = v => ({ x: -v.x, y: -v.y, z: -v.z });
    return { projection: 'perspective', position, direction: f, viewportHeight: 1080, fovYRadians: fovDegrees * Math.PI / 180, zoom: 1,
        frustumPlanes: [plane(r, f, tx), plane(negate(r), f, tx), plane(u, f, ty), plane(negate(u), f, ty), { ...f, w: -(dot(f) + near) }, { ...negate(f), w: dot(f) + far }] };
}

test('Material demand: each material requests its tier from the densest visible page where it occurs, with its own period and 65% hysteresis', () => {
    const plan = planner.plan(perspective({ x: 1090, y: 30, z: 1110 }, { x: 1105, y: 20, z: 1130 }, 55));
    assert.deepEqual(Object.keys(plan.pixelsPerMeterById), [...plan.visibleMaskIds]);
    for (const id of plan.visibleMaskIds) {
        const node = coastal.chunks.find(chunk => chunk.id === id);
        assert.ok(Math.abs(plan.pixelsPerMeterById[id] - plan.maskPixelsById[id] / (node.sampleStride * Math.max(coastal.grid.spacingX, coastal.grid.spacingZ))) <= 1e-9 * plan.pixelsPerMeterById[id]);
    }
    assert.deepEqual(Object.keys(plan.detail.pixelsPerMeterById), [...plan.detail.visibleIds]);
    assert.ok(plan.detail.visibleIds.length > 0 && plan.detail.visibleIds.every(id => plan.detail.pixelsPerMeterById[id] > 0));
    assert.ok(Object.isFrozen(plan.pixelsPerMeterById) && Object.isFrozen(plan.detail.pixelsPerMeterById) && Object.isFrozen(plan.detail.splitNativeIds));
    assert.ok(plan.detail.visibleIds.every(id => plan.detail.splitNativeIds.includes(planner.surfaceDetail.nativeAncestorId(id))), 'every visible fine leaf refines a split native page');
    assert.ok(plan.detail.splitNativeIds.every(id => plan.visibleMaskIds.includes(id) && coastal.chunks.find(chunk => chunk.id === id).level === coastal.grid.maxLevel));
    const nearest = Math.max(...Object.values(plan.pixelsPerMeterById));
    assert.deepEqual(plan.desiredTiers, planner.desiredMaterialTiers(Object.fromEntries(Object.keys(periods).map(soilId => [soilId, nearest]))), 'the view-wide tiers are every soil at the nearest visible density');
    // texels = period × density / 1.5: a 30 m sand needs 200 texels at 10 px/m, a 4 m loam 27, an absent soil none
    assert.deepEqual(planner.desiredMaterialTiers({ sand: 10, loam: 10, rock: 0 }), { unknown: '32', seabed: '32', sand: '512', loam: '32', forest: '32', rock: '32' });
    assert.deepEqual(planner.desiredMaterialTiers({ loam: 10 }, { targetTexelPixels: .1 }).loam, '512');
    const kept = { loam: '1024' }, at = density => planner.desiredMaterialTiers({ loam: density }, { previousTiers: kept }).loam;
    assert.equal(at(200), '1024', 'above the 512 capacity');
    assert.equal(at(125), '1024', '333 texels stay above 65% of 512');
    assert.equal(at(124), '512', '331 texels coarsen');
    assert.equal(at(0), '32', 'a soil absent from every visible page drops to its fallback');
    assert.equal(planner.desiredMaterialTiers({ loam: 125 }, { previousTiers: { loam: '512' } }).loam, '512', 'hysteresis never raises a tier');
    assert.ok(Object.isFrozen(planner.desiredMaterialTiers({})));
    for (const densities of [{ missing: 1 }, { loam: -1 }, { loam: Number.NaN }, null]) assert.throws(() => planner.desiredMaterialTiers(densities), /material densities/, JSON.stringify(densities));
    assert.throws(() => planner.desiredMaterialTiers({ loam: 1 }, { targetTexelPixels: 0 }), /texel target/);
});

const recipe = LANDSCAPE_SURFACE_DETAIL_RECIPE, pageBytes = landscapeCoverageMaskLayout(coastal.chunks[0]).pageBytes, index = createLandscapeSurfaceDetailIndex(coastal, { levels: 3 });

// a resident native chain over l3/c2/r6 (seabed, sand, loam), a resident unsplit neighbor l3/c1/r6 (forest, rock) and a real fine-page planner
function residentMasks() {
    const shared = new LandscapeResidencyBudget(), budget = new LandscapeAppearanceBudget(shared, 'interests');
    const masks = { manifest: coastal, prefix: 'interests', pageBytes, slotCount: 21, capacity: 17, pixels: new Uint8Array(pageBytes * 21), records: new Map(), wanted: new Set(),
        descriptors: new Map(coastal.chunks.map(chunk => [chunk.id, chunk])), failures: new Map(), nativeEpoch: 0, uniforms: { uMaskMeta: { value: [] } }, detail: null };
    for (const [id, soils] of [[coastal.overviewId, [1, 2, 3, 4, 5]], ['l1/c0/r1', [1, 2, 3, 4, 5]], ['l2/c1/r3', [1, 2, 3, 4, 5]], ['l3/c2/r6', [1, 2, 3]], ['l3/c1/r6', [4, 5]]]) {
        masks.records.set(id, { id, kind: 'native', descriptor: masks.descriptors.get(id), slot: masks.records.size, progress: 1, status: 'resident', soils });
        masks.wanted.add(id);
    }
    masks.detail = new LandscapeSurfaceDetailPages({ masks, budget, pool: { request: () => new Promise(() => {}) }, cache: null, index, recipe, recipeHash: landscapeSurfaceDetailRecipeHash(recipe),
        seed: landscapeSurfaceDetailSeed(coastal.id, recipe), levels: 3, capacity: 4, firstSlot: 17, workerContextBytes: 0 });
    masks.records.set('l4/c4/r12', { id: 'l4/c4/r12', kind: 'detail', descriptor: index.descriptor('l4/c4/r12'), slot: 17, progress: 1, status: 'resident', soils: [2] });
    return masks;
}

test('Material demand: a native page split into visible fine leaves lends no density of its own; each leaf lends its density to its finest resolved page', () => {
    const masks = residentMasks(), interests = plan => LandscapeMaskPages.prototype.interests.call(masks, plan);
    // the camera stands over l3/c2/r6: l5/c8/r24 resolves to the resident sand-only l4/c4/r12, l4/c5/r12 has no fine page yet and resolves to its native page
    const split = { visibleMaskIds: ['l3/c2/r6', 'l3/c1/r6'], pixelsPerMeterById: { 'l3/c2/r6': 4e9, 'l3/c1/r6': 20 },
        detail: { visibleIds: ['l5/c8/r24', 'l4/c5/r12'], pixelsPerMeterById: { 'l5/c8/r24': 5000, 'l4/c5/r12': 30 }, splitNativeIds: ['l3/c2/r6'] } };
    const result = interests(split);
    assert.deepEqual(result.densityBySoil, { seabed: 30, sand: 5000, loam: 30, forest: 20, rock: 20 });
    assert.deepEqual(Object.fromEntries([...result.interests].map(([soil, ids]) => [soil, [...ids]])), { 1: ['l3/c2/r6'], 2: ['l3/c2/r6'], 3: ['l3/c2/r6'], 4: ['l3/c1/r6'], 5: ['l3/c1/r6'] });
    assert.deepEqual(planner.desiredMaterialTiers(result.densityBySoil), { unknown: '32', seabed: '1024', sand: '1024', loam: '128', forest: '128', rock: '128' });
    // without fine leaves the native page lends its own density to all of its soils
    assert.deepEqual(interests({ ...split, detail: { visibleIds: [], pixelsPerMeterById: {}, splitNativeIds: [] } }).densityBySoil, { seabed: 4e9, sand: 4e9, loam: 4e9, forest: 20, rock: 20 });
    // a split native page without any visible fine leaf was only conservatively visible: it keeps its interests but lends nothing
    const conservative = interests({ ...split, detail: { ...split.detail, splitNativeIds: ['l3/c2/r6', 'l3/c1/r6'] } });
    assert.deepEqual([conservative.densityBySoil.forest, conservative.densityBySoil.rock, conservative.densityBySoil.sand], [0, 0, 5000]);
    assert.deepEqual([...conservative.interests.get(5)], ['l3/c1/r6']);
    // a native page still fading in keeps its interests but lends no density, and neither do its fine leaves
    masks.records.get('l3/c2/r6').progress = .5;
    const fading = interests(split);
    assert.deepEqual(fading.densityBySoil, { seabed: 0, sand: 0, loam: 0, forest: 20, rock: 20 });
    assert.equal(fading.interests.get(2).has('l3/c2/r6'), true);
    // an unresolved visible page leases its nearest resident ancestor's soils without lending density
    masks.records.get('l3/c2/r6').progress = 1;
    masks.records.delete('l3/c1/r6');
    const ancestor = interests(split);
    assert.deepEqual([ancestor.densityBySoil.forest, ancestor.densityBySoil.rock], [0, 0]);
    assert.deepEqual([...ancestor.interests.get(4)], ['l3/c1/r6']);
});

const soils = ['a', 'b', 'c'];
const flush = () => new Promise(resolve => setImmediate(resolve));
function streamingFixture({ gpuCeiling = 42 * MIB } = {}) {
    const page = (resolution, role) => ({ url: `pages/${role}-${resolution}.rgba8`, width: resolution, height: resolution, sha256: `${role}${resolution}`.padEnd(64, '0') });
    const tier = resolution => ({ id: String(resolution), resolution, pages: ['baseColor', 'normal', 'orm'].map(role => ({ role, source: 'appearance', page: page(resolution, role) })) });
    const appearance = { materials: soils.map(soilId => ({ soilId, materialId: `pbr.${soilId}`, tileMeters: 4, roughnessInputRange: { min: 0, max: 1 }, tiers: [] })) };
    const multiscale = { status: 'active', reason: null, active: true, maxResolution: 1024, materials: soils.map(soilId => ({ soilId, materialId: `pbr.${soilId}`, maps: 3, micro: null, tiers: [32, 128, 512, 1024].map(tier) })) };
    // by default two 1024 tiers, one 512 tier and one 512 transition source fit the appearance GPU ceiling, three 1024 tiers do not
    const shared = new LandscapeResidencyBudget({ cpuBytes: 256 * MIB, gpuBytes: 2 * gpuCeiling }), budget = new LandscapeAppearanceBudget(shared, 'streaming');
    const vector = () => ({ x: 0, y: 0, z: 0, w: 0, set(x, y, z, w) { Object.assign(this, { x, y, z, w }); return this; } });
    const uniforms = { uSoilState: { value: soils.map(vector) }, uSoilTiling: { value: soils.map(vector) }, uSurfaceBlendEnabled: { value: 0 }, uMaterialBlendIndex: { value: -1 }, uMaterialBlend: { value: 0 },
        uBlendBase: { value: null }, uBlendSurface: { value: null }, uBlendResolution: { value: 32 } };
    soils.forEach((_, index) => { uniforms[`uSoilBase${index}`] = { value: null }; uniforms[`uSoilSurface${index}`] = { value: null }; });
    const requests = [];
    const pool = { request: async ({ resolution, pages }) => { requests.push(resolution); return { baseColor: new Uint8Array(resolution * resolution * 4), surface: new Uint8Array(resolution * resolution * 4 * (pages.length - 1)) }; } };
    const pages = new LandscapeMaterialPages({ appearance, multiscale, budget, pool, renderer: { initTexture() {}, capabilities: { getMaxAnisotropy: () => 4 } }, uniforms, prefix: 'streaming' });
    pages.initialized = true;
    const log = [];
    // one frame: per-material demand → water-filled composition → protected credit → interests → material update
    async function frame(view) {
        const interests = new Map(soils.map((soilId, index) => [index, new Set(view.density[soilId] ? [`page-${soilId}`] : [])]).filter(([, ids]) => ids.size));
        const desiredTiers = Object.fromEntries(soils.map(soilId => [soilId, view.density[soilId] ? '1024' : '32']));
        const composition = planLandscapeAppearanceDemand({ fixedCpuBytes: 0, fixedGpuBytes: 0, decodeBytes: 0, limits: budget.limits, materials: pages.materials.map(material => ({
            soilId: material.definition.soilId, index: material.index, density: view.density[material.definition.soilId] ?? 0, pages: interests.get(material.index)?.size ?? 0,
            desiredResolution: Number(desiredTiers[material.definition.soilId]), heldResolution: pages.heldResolution(material), resolutions: pages.streamableResolutions(material), maps: material.maps })) });
        assert.equal(budget.protectDemand(composition).admitted, true);
        pages.interest(interests, desiredTiers, { fittedTiers: composition.fittedTiers, priorities: view.density, limitation: composition.reason });
        await flush();
        pages.update(.05, 8 * MIB);
        const snapshot = pages.snapshot();
        log.push({ bound: Object.fromEntries(snapshot.materials.map(material => [material.soilId, material.resolution])), fitted: { ...composition.fittedTiers },
            pending: snapshot.pendingTier ? `${snapshot.pendingTier.soilId}:${snapshot.pendingTier.resolution}` : null, settled: snapshot.settled, uploads: snapshot.uploads.tiers, degradation: snapshot.degradationReason });
        return snapshot;
    }
    async function run(view, frames) { const start = log.length; for (let i = 0; i < frames; i++) await frame(view); return log.slice(start); }
    return { pages, budget, shared, requests, gpuCeiling, run };
}

test('Material streaming: a closer material rises to its fitted 1024 after the material it displaces coarsens directly to 512, and ties never alternate', async () => {
    const { pages, budget, shared, requests, gpuCeiling, run } = streamingFixture();
    assert.equal(budget.limits.gpuBytes, gpuCeiling);
    const settled = frames => frames.at(-1).settled;
    const first = await run({ density: { a: 100, b: 90 } }, 80);
    assert.ok(settled(first));
    assert.deepEqual(first.at(-1).bound, { a: 1024, b: 1024, c: 32 }, 'two visible materials hold 1024; the uninterested one keeps its fallback');
    assert.equal(first.at(-1).degradation, null, 'nothing is denied when the composition meets every demand');
    // c becomes the closest material: the composition keeps a (incumbent, closer than b) and moves b's level to c
    const second = await run({ density: { a: 100, b: 90, c: 200 } }, 120);
    assert.deepEqual(second[0].fitted, { a: '1024', b: '512', c: '1024' });
    assert.equal(second[0].degradation, 'appearance-gpu-budget', 'b is held below its demand by the appearance GPU ceiling');
    assert.deepEqual(second.at(-1).bound, { a: 1024, b: 512, c: 1024 });
    assert.ok(settled(second));
    const coarsened = second.findIndex(frame => frame.bound.b === 512), requested = second.findIndex(frame => frame.pending === 'c:1024');
    assert.ok(coarsened >= 0 && requested > coarsened, `b coarsens (${coarsened}) before c requests 1024 (${requested})`);
    assert.ok(second.every(frame => frame.bound.b >= 512), 'b blends directly from 1024 to 512 without the 32 fallback');
    assert.ok(second.every(frame => frame.bound.a === 1024), 'the incumbent keeps its tier throughout');
    assert.ok(budget.peakGpuBytes <= gpuCeiling && shared.snapshot().peakGpuBytes <= shared.snapshot().limits.gpuBytes);
    // a held pose and an exact three-way tie: the incumbents keep their tiers and nothing is requested or uploaded again
    const before = { requests: requests.length, uploads: second.at(-1).uploads, evicted: pages.evicted };
    const held = [...await run({ density: { a: 100, b: 90, c: 200 } }, 40), ...await run({ density: { a: 100, b: 100, c: 100 } }, 40)];
    assert.ok(held.every(frame => frame.settled && frame.bound.a === 1024 && frame.bound.b === 512 && frame.bound.c === 1024));
    assert.deepEqual({ requests: requests.length, uploads: held.at(-1).uploads, evicted: pages.evicted }, before);
    // c leaves the view: it falls back to 32 and b, no longer starved, rises again from its resident 512
    const third = await run({ density: { a: 100, b: 90 } }, 120);
    assert.deepEqual(third.at(-1).bound, { a: 1024, b: 1024, c: 32 });
    assert.ok(third.at(-1).settled && third.at(-1).degradation === null);
    pages.dispose(); budget.dispose();
    assert.deepEqual([shared.snapshot().cpuBytes, shared.snapshot().gpuBytes, shared.snapshot().leaseCount], [0, 0, 0]);
});

test('Material streaming: uncapped streaming locks a late material out of every tier, while the fitted composition shares the levels', async () => {
    // two 1024 tiers and the fallbacks leave less than one 128 tier of room, as the D4 rock close-up did at 384/192
    const gpuCeiling = 2 * landscapeMaterialTierBytes(1024).gpuBytes + 3 * landscapeMaterialTierBytes(32).gpuBytes + 200000;
    const interests = new Map([[0, new Set(['p'])], [1, new Set(['p'])], [2, new Set(['p'])]]), tiers = { a: '1024', b: '1024', c: '1024' };
    const greedy = streamingFixture({ gpuCeiling });
    for (let i = 0; i < 160; i++) { greedy.pages.interest(interests, tiers); await flush(); greedy.pages.update(.05, 8 * MIB); }
    const locked = Object.fromEntries(greedy.pages.snapshot().materials.map(material => [material.soilId, material.resolution]));
    assert.deepEqual(locked, { a: 1024, b: 1024, c: 32 }, 'without a composition the late material keeps its 32 fallback');
    greedy.pages.dispose(); greedy.budget.dispose();
    const fitted = streamingFixture({ gpuCeiling }), frames = await fitted.run({ density: { a: 100, b: 100, c: 100 } }, 160);
    assert.deepEqual(frames.at(-1).bound, { a: 1024, b: 512, c: 512 }, 'water filling raises every visible material to 512 before any rises to 1024');
    assert.ok(frames.at(-1).settled);
    assert.equal(frames.at(-1).degradation, 'appearance-gpu-budget');
    fitted.pages.dispose(); fitted.budget.dispose();
    assert.deepEqual([fitted.shared.snapshot().cpuBytes, fitted.shared.snapshot().gpuBytes, greedy.shared.snapshot().gpuBytes], [0, 0, 0]);
});

test('Material streaming: tiers whose bounded retries are exhausted leave the composition and held tiers include arrivals', () => {
    const { pages, budget } = streamingFixture(), [a] = pages.materials;
    assert.deepEqual(pages.streamableResolutions(a), [32, 128, 512, 1024]);
    pages.failures.set('0/1024', { attempts: 2, retryAt: 0 });
    pages.failures.set('0/512', { attempts: 1, retryAt: Infinity });
    assert.deepEqual(pages.streamableResolutions(a), [32, 128, 512], 'a tier still awaiting its retry stays plannable');
    assert.equal(pages.heldResolution(a), 0);
    a.current = { resolution: 128 };
    pages.pending = { material: a, resolution: 512 };
    assert.equal(pages.heldResolution(a), 512);
    pages.pending = null;
    pages.transition = { material: a, target: { resolution: 1024 } };
    assert.equal(pages.heldResolution(a), 1024);
    pages.transition = null; a.current = null;
    pages.dispose(); budget.dispose();
});
