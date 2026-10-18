// Verifies per-material texel demand from the pages where each soil occurs and that material streaming converges on the slot-fitted composition.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { registerHooks } from 'node:module';
import { validateLandscapeManifest, createLandscapeAppearancePlanner, createLandscapeSurfaceDetailIndex, landscapeSurfaceDetailRecipeHash, LandscapeResidencyBudget } from '../../../src/app/landscape/index.js';
import { LandscapeAppearanceBudget } from '../../../src/graphics/engine3d/landscape/LandscapeAppearanceBudget.js';
import { planLandscapeAppearanceDemand } from '../../../src/graphics/engine3d/landscape/LandscapeAppearanceDemand.js';
import { landscapeCoverageMaskLayout } from '../../../src/graphics/engine3d/landscape/LandscapeSurfaceCoverage.js';
import { LANDSCAPE_SURFACE_DETAIL_RECIPE, landscapeSurfaceDetailSeed } from '../../../src/graphics/engine3d/landscape/LandscapeSurfaceDetailRecipe.js';
import { LandscapeSurfaceDetailPages } from '../../../src/graphics/engine3d/landscape/LandscapeSurfaceDetailPages.js';
import { LANDSCAPE_MATERIAL_PARAMETER_ROW, LandscapeMaterialParameterTable } from '../../../src/graphics/engine3d/landscape/LandscapeMaterialParameters.js';
import { landscapeMaterialMipOffsets } from '../../../src/graphics/engine3d/landscape/LandscapeMaterialMips.js';
import { landscapeCacheSkip } from '../../shared/landscapeCacheTest.js';

// the mask pages import three for texture objects only and the material pages the PBR pipeline for their calibration; their demand and streaming decisions run on stubs
const stub = source => `data:text/javascript;charset=utf-8,${encodeURIComponent(source)}`;
const stubs = {
    three: stub(`export const RGBAFormat = 1023, RepeatWrapping = 1000, LinearFilter = 1006, LinearMipmapLinearFilter = 1008, NearestFilter = 1003, NoColorSpace = '';
        class Texture { constructor(data, width, height, depth = 1) { this.image = { data, width, height, depth }; this.layers = []; }
            addLayerUpdate(layer) { this.layers.push(layer); } clearLayerUpdates() { this.layers = []; } dispose() { this.disposed = true; } }
        export class DataTexture extends Texture { constructor(data, width, height) { super(data, width, height); } }
        export class DataArrayTexture extends Texture {}`),
    '../../content3d/materials/PbrTexturePipeline.js': stub(`export function applyTextureColorSpace() {}
        export function resolvePbrMaterialPipeline(materialId) { return { materialId, overrides: { effective: { tileMeters: 4, normalStrength: 1, aoIntensity: 1, metalness: 0, albedoBrightness: 1, albedoHueDegrees: 0,
            albedoSaturation: 1, albedoTintStrength: 0, roughness: 1, roughnessRemap: null } }, meta: { calibration: { uvRotationDegrees: 0 } }, diagnostics: null }; }`),
    '../../content3d/materials/PbrTextureCalibrationResolver.js': stub('export function getPbrTextureCalibrationResolver() { return { preloadOverrides: async () => {}, getCachedOverrides: () => null }; }')
};
const mocked = ['LandscapeMaterialPages', 'LandscapeMaskPages'].map(name => new URL(`../../../src/graphics/engine3d/landscape/${name}.js?material-demand-mock`, import.meta.url));
const hooks = registerHooks({ resolve(specifier, context, nextResolve) {
    if (mocked.some(url => (context.parentURL ?? '').startsWith(url.href)) && Object.hasOwn(stubs, specifier)) return { url: stubs[specifier], shortCircuit: true };
    return nextResolve(specifier, context);
} });
const [{ LandscapeMaterialPages }, { LandscapeMaskPages }] = await Promise.all(mocked.map(url => import(url.href)));
hooks.deregister();

const MIB = 1024 * 1024, ROW = LANDSCAPE_MATERIAL_PARAMETER_ROW;
const cacheSkip = landscapeCacheSkip(['manifest.json', 'appearance/manifest.json']);
const coastalUrl = new URL('../../../assets/public/landscape/coastal-city/manifest.json', import.meta.url);
const coastal = cacheSkip ? null : validateLandscapeManifest(JSON.parse(await readFile(coastalUrl, 'utf8')));
const coastalAppearance = cacheSkip ? null : JSON.parse(await readFile(new URL('appearance/manifest.json', coastalUrl), 'utf8'));
const periods = { unknown: 4, seabed: 30, sand: 30, loam: 4, forest: 4, rock: 4 };
const planner = cacheSkip ? null : createLandscapeAppearancePlanner(coastal, coastalAppearance, { materialTiling: Object.fromEntries(Object.entries(periods).map(([soilId, tileMeters]) => [soilId, { tileMeters }])),
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

test('Material demand: each material requests its tier from the densest visible page where it occurs, with its own period and 65% hysteresis', { skip: cacheSkip }, () => {
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

const recipe = LANDSCAPE_SURFACE_DETAIL_RECIPE, pageBytes = cacheSkip ? null : landscapeCoverageMaskLayout(coastal.chunks[0]).pageBytes, index = cacheSkip ? null : createLandscapeSurfaceDetailIndex(coastal, { levels: 3 });

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

test('Material demand: a native page split into visible fine leaves lends no density of its own; each leaf lends its density to its finest resolved page', { skip: cacheSkip }, () => {
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

const soils = ['loam', 'forest', 'rock'], TIERS = [128, 512, 1024];
const flush = () => new Promise(resolve => setImmediate(resolve));

// the material arrays without a GPU: physical slots per array (one spare beyond the fitted count), the residency rows and the transition the pages owner drives
function fakeSlots({ fineSlots, midSlots, materialCapacity = soils.length }) {
    const tiers = [materialCapacity, midSlots, fineSlots].map((slots, tier) => ({ tier, resolution: TIERS[tier], slots, layout: landscapeMaterialMipOffsets(TIERS[tier]), contents: Array.from({ length: slots }, () => null) }));
    return { tiers, residency: [], transition: null, uploads: 0, onRestore: null, peak: [0, 0, 0],
        demandCapacity() { return { fine: fineSlots - 1, mid: midSlots - 1, gpuBytes: 0 }; },
        used(tier) { return tiers[tier].contents.filter(Boolean).length; },
        acquire(tier, material) {
            const entry = tiers[tier];
            if (tier === 0) { entry.contents[material] = { material }; return material; }
            const slot = entry.contents.findIndex(content => content === null);
            if (slot >= 0) { entry.contents[slot] = { material }; this.peak[tier] = Math.max(this.peak[tier], this.used(tier)); }
            return slot;
        },
        release(tier, slot) { tiers[tier].contents[slot] = null; },
        upload(tier, slot, map, chain) {
            assert.ok(tiers[tier].contents[slot], `slot ${slot} of tier ${tier} holds a material`);
            assert.equal(chain.length, tiers[tier].layout.bytes, 'a complete chain');
            this.uploads++;
            return tiers[tier].layout.bytes;
        },
        setResidency(material, tier, slot, arrivingTier, arrivingSlot) { this.residency[material] = { tier, slot, arrivingTier, arrivingSlot }; },
        setTransition(material, progress, fromTier, fromSlot) { this.transition = material >= 0 ? { material, progress, fromTier, fromSlot } : null; },
        restore() { for (const entry of tiers) entry.contents.fill(null); this.transition = null; this.onRestore?.(); },
        snapshot() { return { tiers: tiers.map(entry => ({ resolution: entry.resolution, slots: entry.slots, used: this.used(entry.tier) })) }; } };
}

async function streamingFixture({ fineSlots = 3, midSlots = 3 } = {}) {
    const page = (resolution, role) => ({ url: `pages/${role}-${resolution}.rgba8`, width: resolution, height: resolution, sha256: `${role}${resolution}`.padEnd(64, '0') });
    const tier = resolution => ({ id: String(resolution), resolution, pages: ['baseColor', 'normal', 'orm'].map(role => ({ role, source: 'appearance', page: page(resolution, role) })) });
    const appearance = { materials: soils.map(soilId => ({ soilId, materialId: `pbr.${soilId}`, tileMeters: 4, roughnessInputRange: { min: 0, max: 1 }, tiers: [] })) };
    const multiscale = { status: 'active', reason: null, active: true, maxResolution: 1024, materials: soils.map(soilId => ({ soilId, materialId: `pbr.${soilId}`, maps: 3, micro: null, tiers: [32, 128, 512, 1024].map(tier) })) };
    const shared = new LandscapeResidencyBudget({ cpuBytes: 256 * MIB, gpuBytes: 128 * MIB }), budget = new LandscapeAppearanceBudget(shared, 'streaming');
    const table = new LandscapeMaterialParameterTable(soils.length);
    const uniforms = { uMaterialParameters: { value: null, table }, uMaterialTransition: { value: { set() {} } }, uSurfaceBlendEnabled: { value: 0 } };
    const requests = [];
    // the worker's answer: one complete mip chain per page
    const pool = { request: async ({ resolution, pages }) => { requests.push(resolution); return { maps: pages.map(() => new Uint8Array(landscapeMaterialMipOffsets(resolution).bytes)) }; } };
    const slots = fakeSlots({ fineSlots, midSlots });
    const pages = new LandscapeMaterialPages({ appearance, multiscale, budget, pool, uniforms, prefix: 'streaming', slots });
    await pages.initialize();
    const log = [];
    // one frame: per-material demand → slot-fitted composition → protected credit → interests → material update
    async function frame(view) {
        const interests = new Map(soils.map((soilId, index) => [index, new Set(view.density[soilId] ? [`page-${soilId}`] : [])]).filter(([, ids]) => ids.size));
        const desiredTiers = Object.fromEntries(soils.map(soilId => [soilId, view.density[soilId] ? '1024' : '32']));
        const composition = planLandscapeAppearanceDemand({ fixedCpuBytes: 0, fixedGpuBytes: 0, decodeBytes: 0, limits: budget.limits, slots: slots.demandCapacity(), materials: pages.materials.map(material => ({
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
    return { pages, budget, shared, requests, slots, table, run };
}

test('Material streaming: a closer material rises to its fitted 1024 after the material it displaces coarsens directly to 512, and ties never alternate', async () => {
    const { pages, budget, shared, requests, slots, table, run } = await streamingFixture();
    const settled = frames => frames.at(-1).settled;
    const first = await run({ density: { loam: 100, forest: 90 } }, 80);
    assert.ok(settled(first));
    assert.deepEqual(first.at(-1).bound, { loam: 1024, forest: 1024, rock: 128 }, 'two visible materials hold 1024; the uninterested one keeps its 128 floor (the former 32 fallback)');
    assert.equal(first.at(-1).degradation, null, 'nothing is denied when the composition meets every demand');
    assert.ok(first.some(frame => frame.bound.loam === 128), 'the floor binds before any streamed tier');
    assert.ok(pages.materials.every(material => material.palette?.baseColor.length === 32 * 32 * 4), 'the 32 px palette pages are decoded for the far-field palette');
    assert.deepEqual([slots.used(2), slots.used(1)], [2, 0]);
    assert.deepEqual(slots.residency[0], { tier: 2, slot: 0, arrivingTier: -1, arrivingSlot: 0 });
    assert.deepEqual(Array.from(table.row(0, ROW.state)).slice(0, 2), [0, 1024], 'the state row carries the bound resolution');
    // rock becomes the closest material: the composition keeps loam (incumbent, closer than forest) and moves forest one array down
    const second = await run({ density: { loam: 100, forest: 90, rock: 200 } }, 120);
    assert.deepEqual(second[0].fitted, { loam: '1024', forest: '512', rock: '1024' });
    assert.equal(second[0].degradation, 'appearance-material-slots', 'forest is held below its demand by the fine slots (v1 named the appearance GPU ceiling)');
    assert.deepEqual(second.at(-1).bound, { loam: 1024, forest: 512, rock: 1024 });
    assert.ok(settled(second));
    const coarsened = second.findIndex(frame => frame.bound.forest === 512), requested = second.findIndex(frame => frame.pending === 'rock:1024');
    assert.ok(coarsened >= 0 && requested > coarsened, `forest coarsens (${coarsened}) before rock requests 1024 (${requested})`);
    assert.ok(second.every(frame => frame.bound.forest >= 512), 'forest mixes directly from 1024 to 512 without the floor');
    assert.ok(second.every(frame => frame.bound.loam === 1024), 'the incumbent keeps its tier throughout');
    assert.deepEqual([slots.used(2), slots.used(1), slots.peak[2], slots.peak[1]], [2, 1, 2, 1], 'the spare slots stayed free');
    assert.ok(budget.peakGpuBytes <= budget.limits.gpuBytes && shared.snapshot().peakGpuBytes <= shared.snapshot().limits.gpuBytes);
    // a held pose and an exact three-way tie: the incumbents keep their tiers and nothing is requested or uploaded again
    const before = { requests: requests.length, uploads: second.at(-1).uploads, evicted: pages.evicted };
    const held = [...await run({ density: { loam: 100, forest: 90, rock: 200 } }, 40), ...await run({ density: { loam: 100, forest: 100, rock: 100 } }, 40)];
    assert.ok(held.every(frame => frame.settled && frame.bound.loam === 1024 && frame.bound.forest === 512 && frame.bound.rock === 1024));
    assert.deepEqual({ requests: requests.length, uploads: held.at(-1).uploads, evicted: pages.evicted }, before);
    // rock leaves the view: it falls to the floor and forest, no longer displaced, rises again from its resident 512
    const third = await run({ density: { loam: 100, forest: 90 } }, 120);
    assert.deepEqual(third.at(-1).bound, { loam: 1024, forest: 1024, rock: 128 });
    assert.ok(third.at(-1).settled && third.at(-1).degradation === null);
    assert.deepEqual(slots.residency[2], { tier: 0, slot: 2, arrivingTier: -1, arrivingSlot: 0 });
    pages.dispose(); budget.dispose();
    assert.deepEqual([shared.snapshot().cpuBytes, shared.snapshot().gpuBytes, shared.snapshot().leaseCount], [0, 0, 0]);
});

test('Material streaming: two materials swap arrays through the spare slots without either falling to the floor, and a late material settles one array down', async () => {
    // one fitted fine slot and one fitted mid slot, each with its spare
    const { pages, budget, shared, slots, run } = await streamingFixture({ fineSlots: 2, midSlots: 2 });
    const first = await run({ density: { loam: 100, forest: 50 } }, 80);
    assert.deepEqual(first.at(-1).bound, { loam: 1024, forest: 512, rock: 128 }, 'the second material settles in the mid array instead of the floor');
    assert.equal(first.at(-1).degradation, 'appearance-material-slots');
    const swap = await run({ density: { loam: 50, forest: 100 } }, 120);
    assert.deepEqual(swap[0].fitted, { loam: '512', forest: '1024', rock: '128' }, 'forest is more than 1/0.65 times closer than the incumbent');
    assert.deepEqual(swap.at(-1).bound, { loam: 512, forest: 1024, rock: 128 });
    assert.ok(swap.at(-1).settled);
    assert.ok(swap.every(frame => frame.bound.loam >= 512 && frame.bound.forest >= 512), 'loam coarsens into the mid spare while forest still holds its mid slot; forest then rises into the freed fine array');
    assert.deepEqual([slots.used(2), slots.used(1), slots.peak[2], slots.peak[1]], [1, 1, 1, 2], 'the swap used the mid spare once and returned it');
    pages.dispose(); budget.dispose();
    assert.deepEqual([shared.snapshot().cpuBytes, shared.snapshot().gpuBytes], [0, 0]);
});

test('Material streaming: a reload returns every material to its floor and frees the streamed slots; a restored context streams the floors again', async () => {
    const { pages, budget, slots, run } = await streamingFixture();
    await run({ density: { loam: 100, forest: 90 } }, 80);
    pages.coarsen();
    const snapshot = pages.snapshot();
    assert.ok(snapshot.materials.every(material => material.resolution === 128 && material.tier === 128 && material.slot === material.index));
    assert.deepEqual([slots.used(2), slots.used(1), slots.transition, snapshot.transition, snapshot.floorResolution, snapshot.paletteResolution], [0, 0, null, null, 128, 32]);
    assert.ok([...pages.records.values()].every(record => record.kind === 'floor'));
    const again = await run({ density: { loam: 100, forest: 90 } }, 80);
    assert.deepEqual(again.at(-1).bound, { loam: 1024, forest: 1024, rock: 128 }, 'streaming resumes toward the composition');
    slots.restore();
    assert.equal(pages.ready, false);
    assert.equal(pages.records.size, 0);
    assert.equal(budget.entries.size, 0, 'every record released its reservation');
    assert.ok(pages.materials.every(material => material.palette), 'palettes are CPU data and survive the context');
    const restored = await run({ density: { loam: 100, forest: 90 } }, 80);
    assert.ok(restored.some(frame => frame.bound.loam === 128), 'the floors stream first');
    assert.deepEqual(restored.at(-1).bound, { loam: 1024, forest: 1024, rock: 128 });
    pages.dispose(); budget.dispose();
});

test('Material streaming: tiers whose bounded retries are exhausted leave the composition and held tiers include arrivals', async () => {
    const { pages, budget } = await streamingFixture(), [a] = pages.materials;
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
