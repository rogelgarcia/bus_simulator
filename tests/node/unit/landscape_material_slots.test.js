// Verifies the AI 598 D3a material slot contract: slot bytes, the capacity formula at the shipped, former, historical and test profiles and its explicit degradation.
import test from 'node:test';
import assert from 'node:assert/strict';
import { LANDSCAPE_MATERIAL_SLOTS, LANDSCAPE_MATERIAL_TIER, landscapeMaterialParameterBytes, landscapeMaterialSlotBytes, landscapeMaterialSlotCapacity } from '../../../src/graphics/engine3d/landscape/LandscapeMaterialSlotCapacity.js';
import { landscapeTextureBytes } from '../../../src/graphics/engine3d/landscape/LandscapeAppearanceBudget.js';

const MiB = 1024 * 1024, page = 272484;
const capacity = (gpuMiB, maskSlots, materials = 6) => landscapeMaterialSlotCapacity({ limits: { gpuBytes: gpuMiB * MiB }, fixedGpuBytes: maskSlots * page, materialCapacity: materials });

test('Material slots: the contract names three tiers, four maps per slot, the caps and the mapped bytes of a slot and the parameter texture', () => {
    assert.equal(LANDSCAPE_MATERIAL_SLOTS.id, 'landscape-material-slots-v1');
    assert.deepEqual([...LANDSCAPE_MATERIAL_SLOTS.tiers], [128, 512, 1024]);
    assert.deepEqual([...LANDSCAPE_MATERIAL_SLOTS.tierNames], ['coarse', 'mid', 'fine']);
    assert.deepEqual(LANDSCAPE_MATERIAL_TIER, { coarse: 0, mid: 1, fine: 2 });
    assert.deepEqual([LANDSCAPE_MATERIAL_SLOTS.maps, LANDSCAPE_MATERIAL_SLOTS.surfaceLayers, LANDSCAPE_MATERIAL_SLOTS.maxFine, LANDSCAPE_MATERIAL_SLOTS.maxMid, LANDSCAPE_MATERIAL_SLOTS.reservedMid, LANDSCAPE_MATERIAL_SLOTS.transitionSlots], [4, 3, 8, 16, 4, 1]);
    assert.equal(LANDSCAPE_MATERIAL_SLOTS.maxArrayBytes, 256 * MiB);
    assert.equal(landscapeMaterialSlotBytes(1024), landscapeTextureBytes(1024) * 4);
    assert.equal(landscapeMaterialSlotBytes(512), 5592400);
    assert.equal(landscapeMaterialSlotBytes(128), 349520);
    assert.equal(landscapeMaterialParameterBytes(), 14 * 32 * 16);
});

test('Material slots: the shipped profiles hold eight fitted fine slots with a spare each and eight (cache off) or ten (cache on, capped) fitted mid slots', () => {
    // the appearance GPU ceiling is half the ledger: 264 MiB with the cache off (752/528), 360 MiB on (752/720); the mask array holds 17 native + 64 fine coverage slots
    const off = capacity(264, 81), on = capacity(360, 81);
    assert.deepEqual([off.fine, off.fineSlots, off.mid, off.midSlots], [8, 9, 8, 9]);
    assert.deepEqual([on.fine, on.fineSlots, on.mid, on.midSlots], [8, 9, 10, 11]);
    assert.equal(off.bytes.allocated, 6 * 349520 + 9 * 22369616 + 9 * 5592400 + 14 * 32 * 16);
    assert.equal(off.bytes.charged, 6 * 349520 + 14 * 32 * 16, 'the standing charge is the coarse arrays and the parameter texture; streamed slots are charged while held');
    assert.ok(off.bytes.allocated <= off.ceilingBytes && on.bytes.allocated <= 256 * MiB);
    assert.equal(on.ceilingBytes, 256 * MiB, 'the array ceiling caps the cache-on profile');
    assert.equal(off.reason, null); assert.equal(on.reason, null);
    assert.ok(Object.isFrozen(off) && Object.isFrozen(off.bytes));
});

test('Material slots: smaller profiles take the reserved mid slots first, then fine, then mid, and report the explicit degradation below one fine slot', () => {
    // former full profiles (half the ledger of each): 320/176, 256/128, 192/96
    assert.deepEqual([capacity(176, 81).fine, capacity(176, 81).mid], [4, 7]);
    assert.deepEqual([capacity(128, 81).fine, capacity(128, 81).mid], [2, 6]);
    assert.deepEqual([capacity(96, 81).fine, capacity(96, 81).mid], [1, 4]);
    assert.equal(capacity(96, 81).reason, null, 'one fine slot and the reserved mid slots still stream every view');
    // the historical 128/64 profile (appearance 64/32 MiB, 29 mask slots): no fine slot, three mid slots
    const historical = capacity(32, 29);
    assert.deepEqual([historical.fine, historical.fineSlots, historical.mid, historical.midSlots, historical.reason], [0, 0, 3, 4, 'appearance-material-slots']);
    // the 16/8 test profile (appearance 8/4 MiB, 5 mask slots): the coarse floor alone
    const constrained = capacity(4, 5);
    assert.deepEqual([constrained.fine, constrained.mid, constrained.fineSlots, constrained.midSlots, constrained.reason], [0, 0, 0, 0, 'appearance-material-slots']);
    assert.equal(constrained.bytes.allocated, constrained.bytes.charged);
    // a spare slot accompanies the first fitted slot of an array: room for one fine slot alone is not taken by the fine array, and flows to the mid array
    const fixed = 6 * 349520 + 14 * 32 * 16;
    const lone = landscapeMaterialSlotCapacity({ limits: { gpuBytes: fixed + 22369616 }, fixedGpuBytes: 0, materialCapacity: 6, reservedMid: 0 });
    assert.deepEqual([lone.fine, lone.fineSlots, lone.mid, lone.midSlots], [0, 0, 3, 4], 'one fine slot without its spare is not taken; the mid array fits three slots and the spare in that room');
    const pair = landscapeMaterialSlotCapacity({ limits: { gpuBytes: fixed + 2 * 22369616 }, fixedGpuBytes: 0, materialCapacity: 6, reservedMid: 0 });
    assert.deepEqual([pair.fine, pair.fineSlots, pair.mid, pair.midSlots, pair.freeBytes], [1, 2, 0, 0, 0], 'room for two fine slots holds one fitted slot and its spare');
    // 32 materials fit the coarse arrays of the shipped profile
    assert.equal(capacity(264, 81, 32).materialCapacity, 32);
    assert.throws(() => landscapeMaterialSlotCapacity({ limits: { gpuBytes: 1024 }, fixedGpuBytes: 0, materialCapacity: 6 }), /do not fit the appearance GPU ceiling/);
    assert.throws(() => capacity(264, 81, 33), /1\.\.32 materials/);
    assert.throws(() => landscapeMaterialSlotCapacity({ limits: { gpuBytes: 264 * MiB }, fixedGpuBytes: 0, materialCapacity: 6, reservedMid: 20 }), /reservedMid <= maxMid/);
});
