// Verifies the slot-fitted material composition: the resident floor, finest-first fitting to the streamed slots, priorities, incumbents and the formula's profiles.
import test from 'node:test';
import assert from 'node:assert/strict';
import { LandscapeResidencyBudget } from '../../../src/app/landscape/LandscapeResidencyBudget.js';
import { LandscapeAppearanceBudget } from '../../../src/graphics/engine3d/landscape/LandscapeAppearanceBudget.js';
import { LANDSCAPE_APPEARANCE_DEMAND, landscapeMaterialDecodeBytes, landscapeMaterialTierBytes, planLandscapeAppearanceDemand } from '../../../src/graphics/engine3d/landscape/LandscapeAppearanceDemand.js';
import { landscapeMaterialSlotCapacity } from '../../../src/graphics/engine3d/landscape/LandscapeMaterialSlotCapacity.js';

const MIB = 1024 * 1024, PAGE = 272484;
const materials = Array.from({ length: 6 }, (_, index) => ({ soilId: `soil-${index}`, index, density: 6 - index, desiredResolution: index ? 512 : 32, resolutions: [32, 128, 512] }));
// the arrays a profile holds: the coarse arrays of six materials and the parameter texture are the standing charge, the streamed slots follow the capacity formula
const arrays = (limits, slots) => { const capacity = landscapeMaterialSlotCapacity({ limits, fixedGpuBytes: slots * PAGE, materialCapacity: 6 }); return { fine: capacity.fine, mid: capacity.mid, gpuBytes: capacity.bytes.charged }; };
const coastal = (slots, limits, list = materials) => ({ fixedCpuBytes: slots * PAGE + 396294, fixedGpuBytes: slots * PAGE, decodeBytes: 945598, limits, slots: arrays(limits, slots), materials: list });
// the published companion: seabed and sand carry a paired micro map, every soil has a 1024 tier (dropped by the 128/64 working set)
const companion = (desired, { density = {}, pages = {}, held = {}, resolutions = [32, 128, 512, 1024] } = {}) => ['unknown', 'seabed', 'sand', 'loam', 'forest', 'rock'].map((soilId, index) => ({
    soilId, index, maps: soilId === 'seabed' || soilId === 'sand' ? 4 : 3, resolutions, desiredResolution: desired[soilId] ?? 32,
    density: density[soilId] ?? 0, pages: pages[soilId] ?? 0, heldResolution: held[soilId] ?? 128 }));
const fittedValues = demand => Object.values(demand.fittedTiers);
const tier = (resolution, maps) => landscapeMaterialTierBytes(resolution, maps), charged = 6 * tier(128, 4).gpuBytes + 14 * 32 * 16;

test('Appearance demand: the v2 contract names the slot fitting, its v1 history, the 128 floor and the two streamed levels', () => {
    assert.equal(LANDSCAPE_APPEARANCE_DEMAND.id, 'landscape-material-slot-fitting-v2');
    assert.deepEqual([...LANDSCAPE_APPEARANCE_DEMAND.history], ['landscape-material-water-filling-v1']);
    assert.equal(LANDSCAPE_APPEARANCE_DEMAND.floorResolution, 128);
    assert.deepEqual(LANDSCAPE_APPEARANCE_DEMAND.levels.map(level => `${level.resolution}:${level.slots}`), ['1024:fine', '512:mid']);
    assert.equal(LANDSCAPE_APPEARANCE_DEMAND.incumbentPreference, 1 / .65);
    assert.equal(landscapeMaterialDecodeBytes(512, 4), tier(512, 4).rawBytes + tier(512, 4).gpuBytes, 'a decode holds the source bytes and the complete chains');
    assert.throws(() => planLandscapeAppearanceDemand({ fixedCpuBytes: 0, fixedGpuBytes: 0, decodeBytes: 0, limits: { cpuBytes: 1, gpuBytes: 1 }, materials }), /fitted slot capacities/);
});

test('Appearance demand: a 16/8 profile keeps every material at the floor of the coarse arrays, names the slot shortage and still admits an authoritative native lease', () => {
    const shared = new LandscapeResidencyBudget({ cpuBytes: 16 * MIB, gpuBytes: 8 * MIB });
    const appearance = new LandscapeAppearanceBudget(shared, 'constrained');
    const demand = planLandscapeAppearanceDemand(coastal(5, appearance.limits));
    // v1 fitted 128 tiers here and reported appearance-cpu-budget; the floor is resident in the coarse arrays and the 4 MiB ceiling holds no streamed slot
    assert.deepEqual(fittedValues(demand), ['128', '128', '128', '128', '128', '128']);
    assert.equal(demand.cpuBytes, 5 * PAGE + 396294 + 945598, 'no streamed tier, no decode allowance');
    assert.equal(demand.gpuBytes, 5 * PAGE + charged, 'the fixed consumers and the arrays\' standing charge');
    assert.deepEqual(demand.transitionBytes, { cpuBytes: 0, gpuBytes: 0 });
    assert.equal(demand.reason, 'appearance-material-slots');
    assert.deepEqual(demand.limited.map(value => `${value.soilId}:${value.fitted}/${value.desired}`), ['soil-1:128/512', 'soil-2:128/512', 'soil-3:128/512', 'soil-4:128/512', 'soil-5:128/512']);
    assert.deepEqual(demand.slots, { fine: 0, mid: 0, fineCapacity: 0, midCapacity: 0 });
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

test('Appearance demand: the shipped and former full profiles fit all five requested 512 tiers into mid slots and carry the 512 decode allowance', () => {
    const shared = new LandscapeResidencyBudget(), appearance = new LandscapeAppearanceBudget(shared, 'shipped');
    // half of the shipped 752/528 MiB profile (AI 599 D3; 320/176 at the AI 596 D5 640/352, 256/128 MiB at the former 512/256, 192/96 at the former 384/192, kept below as former full profiles)
    assert.deepEqual(appearance.limits, { cpuBytes: 376 * MIB, gpuBytes: 264 * MIB });
    const decode = landscapeMaterialDecodeBytes(512, 3);
    for (const [limits, slots] of [[appearance.limits, [8, 10]], [{ cpuBytes: 320 * MIB, gpuBytes: 176 * MIB }, [5, 6]], [{ cpuBytes: 256 * MIB, gpuBytes: 128 * MIB }, [3, 5]], [{ cpuBytes: 192 * MIB, gpuBytes: 96 * MIB }, [1, 7]]]) {
        const demand = planLandscapeAppearanceDemand(coastal(17, limits));
        assert.deepEqual([demand.slots.fineCapacity, demand.slots.midCapacity], slots, `the formula at ${limits.gpuBytes / MIB} MiB beside 17 mask slots`);
        assert.deepEqual(fittedValues(demand), ['128', '512', '512', '512', '512', '512']);
        // v1 protected the 128 tier a material might still hold while its 512 arrived; the floor is always resident now, so the allowance is the decode of the largest fitted tier
        assert.deepEqual(demand.transitionBytes, { cpuBytes: decode, gpuBytes: 0 });
        assert.equal(demand.cpuBytes, 17 * PAGE + 396294 + 945598 + decode);
        assert.equal(demand.gpuBytes, 17 * PAGE + charged + 5 * tier(512, 3).gpuBytes, 'the fitted tiers are charged maps exact, as the per-tier textures were');
        assert.deepEqual(demand.slots, { fine: 0, mid: 5, fineCapacity: slots[0], midCapacity: slots[1] });
        assert.equal(demand.reason, null); assert.deepEqual(demand.limited, []);
    }
    // the 40/28 MiB profile v1 admitted with five 512 tiers holds three mid slots: the two farthest materials stay at the floor with the explicit shortage
    const small = planLandscapeAppearanceDemand(coastal(17, { cpuBytes: 40 * MIB, gpuBytes: 28 * MIB }));
    assert.deepEqual(fittedValues(small), ['128', '512', '512', '512', '128', '128']);
    assert.equal(small.reason, 'appearance-material-slots');
    appearance.dispose();
    assert.equal(shared.snapshot().entries.length, 0);
});

test('Appearance demand: with one mid slot the closest material takes it and the others keep the floor; a decode over the CPU ceiling refuses the level', () => {
    const selected = materials.slice(1, 4).map(material => ({ ...material, density: material.index === 3 ? 100 : 1 }));
    const plan = (limits, slots) => planLandscapeAppearanceDemand({ fixedCpuBytes: 0, fixedGpuBytes: 0, decodeBytes: 0, limits, slots, materials: selected });
    const demand = plan({ cpuBytes: 16 * MIB, gpuBytes: 64 * MIB }, { fine: 0, mid: 1, gpuBytes: 1000 });
    assert.deepEqual(demand.fittedTiers, { 'soil-1': '128', 'soil-2': '128', 'soil-3': '512' }, 'v1 raised every material to 128 before the closest rose to 512; the floor is resident, so the one slot goes to the closest');
    assert.equal(demand.gpuBytes, 1000 + tier(512, 3).gpuBytes);
    assert.equal(demand.cpuBytes, landscapeMaterialDecodeBytes(512, 3));
    assert.equal(demand.reason, 'appearance-material-slots');
    assert.deepEqual(demand.limited.map(value => value.soilId), ['soil-1', 'soil-2']);
    const constrained = plan({ cpuBytes: 3 * MIB, gpuBytes: 64 * MIB }, { fine: 0, mid: 3, gpuBytes: 0 });
    assert.deepEqual(Object.values(constrained.fittedTiers), ['128', '128', '128']);
    assert.equal(constrained.reason, 'appearance-cpu-budget', 'a 512 decode (3 MiB of source and 4 MiB of chains) does not fit the CPU ceiling');
    assert.deepEqual(constrained.transitionBytes, { cpuBytes: 0, gpuBytes: 0 });
});

test('Appearance demand: at 192/96 the measured close-ups fit finest first, the one fine slot to the closest or most spread material and the mid slots to the rest', () => {
    const limits = { cpuBytes: 192 * MIB, gpuBytes: 96 * MIB }, profile = list => planLandscapeAppearanceDemand(coastal(81, limits, list));
    const everyone = { seabed: 1024, sand: 1024, loam: 1024, forest: 1024, rock: 1024 }, camera = 4.1e9, fixed = 81 * PAGE + charged;
    // the former view-wide request: five materials want 1024 at one density; loam occurs in the most pages, rock in the fewest
    const tied = profile(companion(everyone, { density: { seabed: camera, sand: camera, loam: camera, forest: camera, rock: camera }, pages: { loam: 9, sand: 8, seabed: 7, forest: 6, rock: 1 } }));
    assert.deepEqual(tied.slots, { fine: 1, mid: 4, fineCapacity: 1, midCapacity: 4 }, 'the formula at 96 MiB beside 81 mask slots: one fine slot and the reserved mid slots');
    // v1 raised loam, sand and seabed to 1024 by bytes and left forest and rock at 512; the slot fit gives the most spread material the fine slot and every other visible material a mid slot
    assert.deepEqual(tied.fittedTiers, { unknown: '128', seabed: '512', sand: '512', loam: '1024', forest: '512', rock: '512' });
    assert.equal(tied.reason, 'appearance-material-slots');
    assert.ok(tied.gpuBytes <= limits.gpuBytes && tied.cpuBytes <= limits.cpuBytes);
    assert.deepEqual(tied.transitionBytes, { cpuBytes: landscapeMaterialDecodeBytes(1024, 3), gpuBytes: tier(512, 3).gpuBytes },
        'the decode of the largest fitted tier (loam at 1024) and the largest tier a fitted material may still hold below its fitted tier (loam\'s 512)');
    assert.equal(tied.gpuBytes, fixed + tier(1024, 3).gpuBytes + 2 * tier(512, 4).gpuBytes + 2 * tier(512, 3).gpuBytes + tier(512, 3).gpuBytes);
    // the same request with rock closest: rock takes the fine slot
    const closest = profile(companion(everyone, { density: { seabed: 50, sand: 60, loam: 80, forest: 70, rock: 400 }, pages: { loam: 9, sand: 8, seabed: 7, forest: 6, rock: 1 } }));
    assert.equal(closest.fittedTiers.rock, '1024');
    assert.ok(['seabed', 'sand', 'loam', 'forest'].every(soilId => closest.fittedTiers[soilId] === '512'));
    // per-material demand at the rock close-up: seabed is not visible, the four visible soils share the camera page; the fine slot resolves the exact tie by index (sand)
    const local = profile(companion({ sand: 1024, loam: 1024, forest: 1024, rock: 1024 }, { density: { sand: camera, loam: camera, forest: camera, rock: camera }, pages: { sand: 1, loam: 1, forest: 1, rock: 1 } }));
    assert.deepEqual(local.fittedTiers, { unknown: '128', seabed: '128', sand: '1024', loam: '512', forest: '512', rock: '512' }, 'v1 fitted all four at 1024 by bytes; one fine slot holds one of them');
    assert.equal(local.reason, 'appearance-material-slots');
    assert.deepEqual(local.limited.map(value => `${value.soilId}:${value.fitted}/${value.desired}`), ['loam:512/1024', 'forest:512/1024', 'rock:512/1024']);
    assert.equal(local.gpuBytes, fixed + tier(1024, 4).gpuBytes + 3 * tier(512, 3).gpuBytes + tier(512, 4).gpuBytes);
    assert.ok(local.gpuBytes <= limits.gpuBytes);
});

test('Appearance demand: the historical 128/64 profile holds three mid slots for the three closest of the five requested 512 materials', () => {
    const limits = { cpuBytes: 64 * MIB, gpuBytes: 32 * MIB };
    const demand = planLandscapeAppearanceDemand(coastal(29, limits, companion({ seabed: 512, sand: 512, loam: 512, forest: 512, rock: 512 }, { resolutions: [32, 128, 512], density: { sand: 9, seabed: 8, loam: 7, forest: 6, rock: 5 } })));
    // v1 fitted all five 512 tiers with their micro maps at 128/64; the formula holds three mid slots and no fine slot at 32 MiB beside 29 mask slots
    assert.deepEqual(demand.slots, { fine: 0, mid: 3, fineCapacity: 0, midCapacity: 3 });
    assert.deepEqual(demand.fittedTiers, { unknown: '128', seabed: '512', sand: '512', loam: '512', forest: '128', rock: '128' });
    assert.equal(demand.gpuBytes, 29 * PAGE + charged + 2 * tier(512, 4).gpuBytes + tier(512, 3).gpuBytes);
    assert.equal(demand.cpuBytes, 29 * PAGE + 396294 + 945598 + landscapeMaterialDecodeBytes(512, 4));
    assert.ok(demand.gpuBytes <= limits.gpuBytes);
    assert.equal(demand.reason, 'appearance-material-slots');
});

test('Appearance demand: a material holding a level keeps it on near-ties and yields only to a competitor more than 1/0.65 times closer', () => {
    const two = (density, held = {}) => ['a', 'b'].map((soilId, index) => ({ soilId, index, density: density[soilId], pages: 1, desiredResolution: 1024, heldResolution: held[soilId] ?? 128, resolutions: [32, 128, 512, 1024] }));
    const plan = (density, held) => planLandscapeAppearanceDemand({ fixedCpuBytes: 0, fixedGpuBytes: 0, decodeBytes: 0, limits: { cpuBytes: 256 * MIB, gpuBytes: 0 }, slots: { fine: 1, mid: 1, gpuBytes: 0 }, materials: two(density, held) }).fittedTiers;
    assert.deepEqual(plan({ a: 10, b: 10 }), { a: '1024', b: '512' }, 'an exact tie without incumbents resolves by index; the loser settles one array down');
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

test('Appearance demand: compositions never exceed the slot capacities, leave no wanted level unfitted while its slots are free and its decode fits, and order by closeness', () => {
    let state = 0x2545f491;
    const random = () => { state ^= state << 13; state ^= state >>> 17; state ^= state << 5; return (state >>> 0) / 2 ** 32; };
    const levels = [32, 128, 512, 1024], capacity = { 1024: 'fine', 512: 'mid' };
    for (let trial = 0; trial < 400; trial++) {
        const list = Array.from({ length: 6 }, (_, index) => ({ soilId: `s${index}`, index, maps: random() < .3 ? 4 : 3, density: Math.floor(random() * 50), pages: Math.floor(random() * 5),
            desiredResolution: levels[Math.floor(random() * 4)], heldResolution: levels[Math.floor(random() * 4)], resolutions: random() < .2 ? [32, 128, 512] : levels }));
        const slots = { fine: Math.floor(random() * 4), mid: Math.floor(random() * 6), gpuBytes: Math.floor(random() * MIB) }, limits = { cpuBytes: Math.floor((4 + random() * 60) * MIB), gpuBytes: 0 };
        const demand = planLandscapeAppearanceDemand({ fixedCpuBytes: 0, fixedGpuBytes: 0, decodeBytes: 0, limits, slots, materials: list });
        const fitted = Object.fromEntries(Object.entries(demand.fittedTiers).map(([soilId, value]) => [soilId, Number(value)]));
        const wanted = material => material.resolutions.filter(resolution => resolution > 128 && resolution <= material.desiredResolution);
        const used = { fine: list.filter(material => fitted[material.soilId] === 1024).length, mid: list.filter(material => fitted[material.soilId] === 512).length };
        assert.ok(used.fine <= slots.fine && used.mid <= slots.mid, `trial ${trial}: ${JSON.stringify(used)} exceed ${JSON.stringify(slots)}`);
        assert.deepEqual(demand.slots, { fine: used.fine, mid: used.mid, fineCapacity: slots.fine, midCapacity: slots.mid });
        const score = material => material.density * (material.heldResolution >= 1024 ? LANDSCAPE_APPEARANCE_DEMAND.incumbentPreference : 1);
        const fits = (material, level) => landscapeMaterialDecodeBytes(level, material.maps) <= limits.cpuBytes;
        let gpuBytes = slots.gpuBytes, transition = 0, decode = 0;
        for (const material of list) {
            const value = fitted[material.soilId];
            assert.ok(value === 128 || material.resolutions.includes(value), `trial ${trial}: ${material.soilId} holds a tier it has not`);
            assert.ok(value <= Math.max(128, ...wanted(material)), `trial ${trial}: ${material.soilId} exceeds its demand`);
            for (const level of wanted(material)) {
                if (value >= level) continue;
                assert.ok(used[capacity[level]] >= slots[capacity[level]] || !fits(material, level), `trial ${trial}: ${material.soilId} is left below ${level} with a free slot and a fitting decode`);
            }
            if (value > 128) {
                gpuBytes += tier(value, material.maps).gpuBytes;
                decode = Math.max(decode, landscapeMaterialDecodeBytes(value, material.maps));
                const below = Math.max(128, ...material.resolutions.filter(resolution => resolution < value && resolution > 128));
                if (below > 128) transition = Math.max(transition, tier(below, material.maps).gpuBytes);
            }
        }
        for (const winner of list.filter(material => fitted[material.soilId] === 1024)) {
            for (const other of list) if (fitted[other.soilId] < 1024 && wanted(other).includes(1024) && fits(other, 1024)) assert.ok(score(other) <= score(winner), `trial ${trial}: ${other.soilId} outranks ${winner.soilId}`);
        }
        assert.equal(demand.gpuBytes, gpuBytes + transition);
        assert.deepEqual(demand.transitionBytes, { cpuBytes: decode, gpuBytes: transition });
        assert.equal(demand.cpuBytes, decode);
        assert.equal(demand.reason === null, demand.limited.length === 0);
    }
});
