// Verifies protected demand is attainable without starving independent native-source leases.
import test from 'node:test';
import assert from 'node:assert/strict';
import { LandscapeResidencyBudget } from '../../../src/app/landscape/LandscapeResidencyBudget.js';
import { LandscapeAppearanceBudget, landscapeTextureBytes } from '../../../src/graphics/engine3d/landscape/LandscapeAppearanceBudget.js';
import { planLandscapeAppearanceDemand } from '../../../src/graphics/engine3d/landscape/LandscapeAppearanceDemand.js';

const MIB = 1024 * 1024;
const materials = Array.from({ length: 6 }, (_, index) => ({ soilId: `soil-${index}`, index, priority: 6 - index, desiredResolution: index ? 512 : 32, resolutions: [32, 128, 512] }));
const coastal = (slots, limits) => ({ fixedCpuBytes: slots * 272484 + 396294, fixedGpuBytes: slots * 272484, decodeBytes: 945598, limits, materials });

test('Appearance demand: a 16/8 profile protects attainable 128 tiers and still admits an authoritative native lease', () => {
    const shared = new LandscapeResidencyBudget({ cpuBytes: 16 * MIB, gpuBytes: 8 * MIB });
    const appearance = new LandscapeAppearanceBudget(shared, 'constrained');
    const demand = planLandscapeAppearanceDemand(coastal(5, appearance.limits));
    assert.deepEqual(Object.values(demand.desiredTiers), ['32', '128', '128', '128', '128', '128']);
    assert.equal(demand.cpuBytes, 3761080);
    assert.equal(demand.gpuBytes, 2771400);
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

test('Appearance demand: the full profile keeps all five requested 512 tiers and exact previous credit costs', () => {
    const demand = planLandscapeAppearanceDemand(coastal(17, { cpuBytes: 40 * MIB, gpuBytes: 28 * MIB }));
    assert.deepEqual(Object.values(demand.desiredTiers), ['32', '512', '512', '512', '512', '512']);
    assert.equal(demand.cpuBytes, 23976618);
    assert.equal(demand.gpuBytes, 25702008);
});

test('Appearance demand: competing attainable tiers follow material interest priority and count fallback/peak decode once', () => {
    const selected = materials.slice(1, 4).map(material => ({ ...material, priority: material.index === 3 ? 100 : 1 }));
    const coarseGpu = selected.length * landscapeTextureBytes(32) * 3;
    const gpuBytes = coarseGpu + landscapeTextureBytes(512) * 3 + 2 * landscapeTextureBytes(128) * 3;
    const demand = planLandscapeAppearanceDemand({ fixedCpuBytes: 0, fixedGpuBytes: 0, decodeBytes: 0, limits: { cpuBytes: 16 * MIB, gpuBytes }, materials: selected });
    assert.deepEqual(demand.desiredTiers, { 'soil-1': '128', 'soil-2': '128', 'soil-3': '512' });
    assert.equal(demand.gpuBytes, gpuBytes);
    assert.equal(demand.cpuBytes, 3 * 32 ** 2 * 12 + 2 * 128 ** 2 * 12 + 2 * 512 ** 2 * 12);
    const constrained = planLandscapeAppearanceDemand({ fixedCpuBytes: 0, fixedGpuBytes: 0, decodeBytes: 0, limits: { cpuBytes: 3 * MIB, gpuBytes }, materials: selected });
    assert.deepEqual(Object.values(constrained.desiredTiers), ['128', '128', '128']);
});
