// Verifies the breadth-first material composition: attainable protected credit, level-by-level fitting, priorities and tie stability.
import test from 'node:test';
import assert from 'node:assert/strict';
import { LandscapeResidencyBudget } from '../../../src/app/landscape/LandscapeResidencyBudget.js';
import { LandscapeAppearanceBudget, landscapeTextureBytes } from '../../../src/graphics/engine3d/landscape/LandscapeAppearanceBudget.js';
import { LANDSCAPE_APPEARANCE_DEMAND, landscapeMaterialTierBytes, planLandscapeAppearanceDemand } from '../../../src/graphics/engine3d/landscape/LandscapeAppearanceDemand.js';

const MIB = 1024 * 1024;
const materials = Array.from({ length: 6 }, (_, index) => ({ soilId: `soil-${index}`, index, density: 6 - index, desiredResolution: index ? 512 : 32, resolutions: [32, 128, 512] }));
const coastal = (slots, limits, list = materials) => ({ fixedCpuBytes: slots * 272484 + 396294, fixedGpuBytes: slots * 272484, decodeBytes: 945598, limits, materials: list });
// the published companion: seabed and sand carry a paired micro map, every soil has a 1024 tier (dropped by the 128/64 working set)
const companion = (desired, { density = {}, pages = {}, held = {}, resolutions = [32, 128, 512, 1024] } = {}) => ['unknown', 'seabed', 'sand', 'loam', 'forest', 'rock'].map((soilId, index) => ({
    soilId, index, maps: soilId === 'seabed' || soilId === 'sand' ? 4 : 3, resolutions, desiredResolution: desired[soilId] ?? 32,
    density: density[soilId] ?? 0, pages: pages[soilId] ?? 0, heldResolution: held[soilId] ?? 32 }));
const fittedValues = demand => Object.values(demand.fittedTiers);

test('Appearance demand: a 16/8 profile protects attainable 128 tiers and still admits an authoritative native lease', () => {
    const shared = new LandscapeResidencyBudget({ cpuBytes: 16 * MIB, gpuBytes: 8 * MIB });
    const appearance = new LandscapeAppearanceBudget(shared, 'constrained');
    const demand = planLandscapeAppearanceDemand(coastal(5, appearance.limits));
    assert.deepEqual(fittedValues(demand), ['32', '128', '128', '128', '128', '128']);
    assert.equal(demand.cpuBytes, 3761080, 'a 128 composition replaces only the 32 fallbacks, so it needs no transition allowance');
    assert.equal(demand.gpuBytes, 2771400);
    assert.deepEqual(demand.transitionBytes, { cpuBytes: 0, gpuBytes: 0 });
    assert.equal(demand.reason, 'appearance-cpu-budget', 'both ceilings refuse a 512 here; CPU is checked first, as LandscapeAppearanceBudget does');
    assert.deepEqual(demand.limited.map(value => `${value.soilId}:${value.fitted}/${value.desired}`), ['soil-1:128/512', 'soil-2:128/512', 'soil-3:128/512', 'soil-4:128/512', 'soil-5:128/512']);
    assert.equal(appearance.protectDemand(demand).admitted, true);
    assert.equal(shared.reserve('terrain-root-context', { cpuBytes: Math.ceil(7.3 * MIB), gpuBytes: Math.ceil(3.5 * MIB), kind: 'terrain' }).admitted, true);
    assert.equal(shared.reserve('native-source', { cpuBytes: 257 ** 2 * 5 * 4, gpuBytes: 0, kind: 'source-acquisition' }).admitted, true);
    const lease = shared.acquireLease('native-source', { consumer: 'collision-test', priority: 200, accuracy: 'authoritative' });
    assert.equal(shared.release('native-source'), false);
    lease.release();
    assert.equal(shared.release('native-source'), true);
    appearance.dispose(); shared.release('terrain-root-context');
    assert.equal(shared.snapshot().cpuBytes, 0);
    assert.equal(shared.snapshot().gpuBytes, 0);
});

test('Appearance demand: the shipped and former full profiles keep all five requested 512 tiers plus one 128 transition allowance', () => {
    const shared = new LandscapeResidencyBudget(), appearance = new LandscapeAppearanceBudget(shared, 'shipped');
    assert.deepEqual(appearance.limits, { cpuBytes: 256 * MIB, gpuBytes: 128 * MIB });
    for (const limits of [appearance.limits, { cpuBytes: 192 * MIB, gpuBytes: 96 * MIB }, { cpuBytes: 40 * MIB, gpuBytes: 28 * MIB }]) {
        const demand = planLandscapeAppearanceDemand(coastal(17, limits));
        assert.deepEqual(fittedValues(demand), ['32', '512', '512', '512', '512', '512']);
        // the pre-composition credit (23,976,618 CPU / 25,702,008 GPU) now also protects the 128 tier a material may still hold while its fitted 512 arrives
        assert.deepEqual(demand.transitionBytes, { cpuBytes: 128 ** 2 * 12, gpuBytes: landscapeTextureBytes(128) * 3 });
        assert.equal(demand.cpuBytes, 23976618 + 128 ** 2 * 12);
        assert.equal(demand.gpuBytes, 25702008 + landscapeTextureBytes(128) * 3);
        assert.equal(demand.reason, null); assert.deepEqual(demand.limited, []);
    }
    appearance.dispose();
    assert.equal(shared.snapshot().entries.length, 0);
});

test('Appearance demand: competing levels follow the closest material and count fallbacks, peak decode and transition once', () => {
    const selected = materials.slice(1, 4).map(material => ({ ...material, density: material.index === 3 ? 100 : 1 }));
    const coarseGpu = selected.length * landscapeTextureBytes(32) * 3, transitionGpu = landscapeTextureBytes(128) * 3;
    const gpuBytes = coarseGpu + landscapeTextureBytes(512) * 3 + 2 * landscapeTextureBytes(128) * 3 + transitionGpu;
    const demand = planLandscapeAppearanceDemand({ fixedCpuBytes: 0, fixedGpuBytes: 0, decodeBytes: 0, limits: { cpuBytes: 16 * MIB, gpuBytes }, materials: selected });
    assert.deepEqual(demand.fittedTiers, { 'soil-1': '128', 'soil-2': '128', 'soil-3': '512' }, 'every material reaches 128 before the closest one rises to 512');
    assert.equal(demand.gpuBytes, gpuBytes);
    assert.equal(demand.cpuBytes, 3 * 32 ** 2 * 12 + 2 * 128 ** 2 * 12 + 2 * 512 ** 2 * 12 + 128 ** 2 * 12);
    assert.equal(demand.reason, 'appearance-gpu-budget');
    const constrained = planLandscapeAppearanceDemand({ fixedCpuBytes: 0, fixedGpuBytes: 0, decodeBytes: 0, limits: { cpuBytes: 3 * MIB, gpuBytes }, materials: selected });
    assert.deepEqual(Object.values(constrained.fittedTiers), ['128', '128', '128']);
    assert.equal(constrained.reason, 'appearance-cpu-budget', 'a 512 decode does not fit the CPU ceiling');
});

test('Appearance demand: at 384/192 the measured close-ups fill level by level and never leave a visible material at its fallback', () => {
    const limits = { cpuBytes: 192 * MIB, gpuBytes: 96 * MIB }, profile = list => planLandscapeAppearanceDemand(coastal(81, limits, list));
    const everyone = { seabed: 1024, sand: 1024, loam: 1024, forest: 1024, rock: 1024 }, camera = 4.1e9;
    // the former view-wide request: five materials want 1024 at one density; rock occurs in the fewest pages
    const tied = profile(companion(everyone, { density: { seabed: camera, sand: camera, loam: camera, forest: camera, rock: camera }, pages: { loam: 9, sand: 8, seabed: 7, forest: 6, rock: 1 } }));
    assert.deepEqual(tied.fittedTiers, { unknown: '32', seabed: '1024', sand: '1024', loam: '1024', forest: '512', rock: '512' });
    assert.equal(tied.reason, 'appearance-gpu-budget');
    assert.ok(tied.gpuBytes <= limits.gpuBytes && tied.cpuBytes <= limits.cpuBytes);
    const micro512 = landscapeMaterialTierBytes(512, 4);
    assert.deepEqual(tied.transitionBytes, { cpuBytes: micro512.rawBytes, gpuBytes: micro512.gpuBytes }, 'the largest tier a material may hold below its fitted 1024 is a micro-paired 512');
    // the same request with rock closest: rock rises to 1024 first
    const closest = profile(companion(everyone, { density: { seabed: 50, sand: 60, loam: 80, forest: 70, rock: 400 }, pages: { loam: 9, sand: 8, seabed: 7, forest: 6, rock: 1 } }));
    assert.equal(closest.fittedTiers.rock, '1024');
    assert.ok(['seabed', 'sand', 'loam', 'forest'].every(soilId => Number(closest.fittedTiers[soilId]) >= 512));
    // per-material demand at the rock close-up: seabed is not visible, the four visible soils share the camera page and fit at 1024
    const local = profile(companion({ sand: 1024, loam: 1024, forest: 1024, rock: 1024 }, { density: { sand: camera, loam: camera, forest: camera, rock: camera }, pages: { sand: 1, loam: 1, forest: 1, rock: 1 } }));
    assert.deepEqual(local.fittedTiers, { unknown: '32', seabed: '32', sand: '1024', loam: '1024', forest: '1024', rock: '1024' });
    assert.equal(local.reason, null);
    const fixed = 81 * 272484 + 2 * landscapeMaterialTierBytes(32, 4).gpuBytes + 4 * landscapeMaterialTierBytes(32, 3).gpuBytes;
    assert.equal(local.gpuBytes, fixed + landscapeMaterialTierBytes(1024, 4).gpuBytes + 3 * landscapeMaterialTierBytes(1024, 3).gpuBytes + landscapeMaterialTierBytes(512, 4).gpuBytes);
    assert.ok(local.gpuBytes <= limits.gpuBytes);
});

test('Appearance demand: the historical 128/64 profile keeps every requested material at 512 with its micro maps', () => {
    const limits = { cpuBytes: 64 * MIB, gpuBytes: 32 * MIB };
    const demand = planLandscapeAppearanceDemand(coastal(29, limits, companion({ seabed: 512, sand: 512, loam: 512, forest: 512, rock: 512 }, { resolutions: [32, 128, 512], density: { sand: 9, seabed: 8, loam: 7, forest: 6, rock: 5 } })));
    assert.deepEqual(fittedValues(demand), ['32', '512', '512', '512', '512', '512']);
    const tier = (resolution, maps) => landscapeMaterialTierBytes(resolution, maps);
    assert.equal(demand.gpuBytes, 29 * 272484 + 2 * tier(32, 4).gpuBytes + 4 * tier(32, 3).gpuBytes + 2 * tier(512, 4).gpuBytes + 3 * tier(512, 3).gpuBytes + tier(128, 4).gpuBytes);
    assert.equal(demand.cpuBytes, 29 * 272484 + 396294 + 2 * tier(32, 4).rawBytes + 4 * tier(32, 3).rawBytes + 2 * tier(512, 4).rawBytes + 3 * tier(512, 3).rawBytes + tier(512, 4).rawBytes + tier(128, 4).rawBytes);
    assert.ok(demand.gpuBytes <= limits.gpuBytes);
    assert.equal(demand.reason, null);
});

test('Appearance demand: a material holding a level keeps it on near-ties and yields only to a competitor more than 1/0.65 times closer', () => {
    assert.equal(LANDSCAPE_APPEARANCE_DEMAND.incumbentPreference, 1 / .65);
    const two = (density, held = {}) => ['a', 'b'].map((soilId, index) => ({ soilId, index, density: density[soilId], pages: 1, desiredResolution: 1024, heldResolution: held[soilId] ?? 32, resolutions: [32, 128, 512, 1024] }));
    const limits = { cpuBytes: 256 * MIB, gpuBytes: 2 * landscapeMaterialTierBytes(32).gpuBytes + landscapeMaterialTierBytes(1024).gpuBytes + 2 * landscapeMaterialTierBytes(512).gpuBytes };
    const plan = (density, held) => planLandscapeAppearanceDemand({ fixedCpuBytes: 0, fixedGpuBytes: 0, decodeBytes: 0, limits, materials: two(density, held) }).fittedTiers;
    assert.deepEqual(plan({ a: 10, b: 10 }), { a: '1024', b: '512' }, 'an exact tie without incumbents resolves by index');
    assert.deepEqual(plan({ a: 10, b: 10 }, { b: 1024 }), { a: '512', b: '1024' }, 'the incumbent keeps its tier on a tie');
    assert.deepEqual(plan({ a: 15, b: 10 }, { b: 1024 }), { a: '512', b: '1024' }, 'a competitor 1.5 times closer does not displace it');
    assert.deepEqual(plan({ a: 16, b: 10 }, { b: 1024 }), { a: '1024', b: '512' }, 'a competitor more than 1/0.65 times closer does');
    assert.deepEqual(plan({ a: 10, b: 10 }, { a: 1024, b: 512 }), { a: '1024', b: '512' }, 'an arriving or pending tier counts as held');
    // feeding each composition back as the held state is a fixed point for every density ratio around the threshold
    for (const ratio of [.5, .64, .65, .66, 1, 1.5, 1.53, 1.54, 1.6, 2]) {
        let held = {}, previous = null;
        for (let frame = 0; frame < 6; frame++) {
            const fitted = plan({ a: 10 * ratio, b: 10 }, held);
            if (frame > 1) assert.deepEqual(fitted, previous, `ratio ${ratio} frame ${frame}`);
            held = Object.fromEntries(Object.entries(fitted).map(([soilId, value]) => [soilId, Number(value)]));
            previous = fitted;
        }
    }
});

test('Appearance demand: no material stays below a level that fits for all while another holds a finer tier, and compositions fit their ceilings', () => {
    let state = 0x2545f491;
    const random = () => { state ^= state << 13; state ^= state >>> 17; state ^= state << 5; return (state >>> 0) / 2 ** 32; };
    const levels = [32, 128, 512, 1024];
    for (let trial = 0; trial < 400; trial++) {
        const list = Array.from({ length: 6 }, (_, index) => ({ soilId: `s${index}`, index, maps: random() < .3 ? 4 : 3, density: Math.floor(random() * 50), pages: Math.floor(random() * 5),
            desiredResolution: levels[Math.floor(random() * 4)], heldResolution: levels[Math.floor(random() * 4)], resolutions: random() < .2 ? [32, 128, 512] : levels }));
        const limits = { cpuBytes: Math.floor((8 + random() * 200) * MIB), gpuBytes: Math.floor((1 + random() * 110) * MIB) };
        const demand = planLandscapeAppearanceDemand({ fixedCpuBytes: 0, fixedGpuBytes: 0, decodeBytes: 0, limits, materials: list });
        const fitted = Object.fromEntries(Object.entries(demand.fittedTiers).map(([soilId, value]) => [soilId, Number(value)]));
        const wanted = material => Math.max(32, ...material.resolutions.filter(resolution => resolution <= material.desiredResolution));
        const highest = Math.max(...list.map(material => fitted[material.soilId]));
        for (const material of list) {
            assert.ok(fitted[material.soilId] <= wanted(material) && material.resolutions.includes(fitted[material.soilId]), `trial ${trial}: ${material.soilId} exceeds its demand`);
            const next = material.resolutions.find(resolution => resolution > fitted[material.soilId] && resolution <= wanted(material));
            if (next !== undefined) assert.ok(highest <= next, `trial ${trial}: ${material.soilId} is left at ${fitted[material.soilId]} while another holds ${highest}`);
        }
        if (Object.values(fitted).some(value => value > 32)) assert.ok(demand.gpuBytes <= limits.gpuBytes && demand.cpuBytes <= limits.cpuBytes, `trial ${trial}: composition exceeds its ceilings`);
        assert.equal(demand.reason === null, demand.limited.length === 0);
    }
});
