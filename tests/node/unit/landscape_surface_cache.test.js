// Verifies the AI577 D6 runtime surface cache contract: addressing, clipmap windows, slot layout and gutters, budget fitting, encodings,
// identity, residency, indirection and the CPU demand planner (landscape-surface-cache-v1).
import test from 'node:test';
import assert from 'node:assert/strict';
import { LANDSCAPE_SURFACE_CACHE, decodeLandscapeHemiOctahedral, encodeLandscapeHemiOctahedral, fitLandscapeSurfaceCache, landscapeSurfaceCacheFilterReach,
    landscapeSurfaceCacheFootprint, landscapeSurfaceCacheFrameMip, landscapeSurfaceCacheGeometry, landscapeSurfaceCacheGutter, landscapeSurfaceCacheHash,
    landscapeSurfaceCacheIndirectionBytes, landscapeSurfaceCacheMaskLevel, landscapeSurfaceCachePageBounds, landscapeSurfaceCachePageIdentity, landscapeSurfaceCachePageKey,
    landscapeSurfaceCachePageMeters, landscapeSurfaceCachePagesPerAxis, landscapeSurfaceCacheSlotLayout, landscapeSurfaceCacheSlotPosition, landscapeSurfaceCacheSnapCenter,
    landscapeSurfaceCacheTangentFrame, landscapeSurfaceCacheTexelMeters, landscapeSurfaceCacheTierKey, landscapeSurfaceCacheWindowContains, landscapeSurfaceCacheWindowOrigin,
    landscapeSurfaceCacheBlockPageOrigin, packLandscapeSurfaceCacheBlocks, parseLandscapeSurfaceCachePageKey } from '../../../src/graphics/engine3d/landscape/LandscapeSurfaceCacheLayout.js';
import { LandscapeSurfaceCacheIndirection, LandscapeSurfaceCacheResidency } from '../../../src/graphics/engine3d/landscape/LandscapeSurfaceCacheResidency.js';
import { LANDSCAPE_SURFACE_CACHE_DEMAND, chooseLandscapeSurfaceCacheCenter, createLandscapeSurfaceCacheTerrainEnvelope, mergeLandscapeSurfaceCacheFeedback, planLandscapeSurfaceCacheDemand } from '../../../src/graphics/engine3d/landscape/LandscapeSurfaceCacheDemand.js';
import { indexLandscapeSurfaceCacheInputs, landscapeSurfaceCacheGlobalKey, landscapeSurfaceCachePageInputs } from '../../../src/graphics/engine3d/landscape/LandscapeSurfaceCacheInputs.js';

const MIB = 1024 * 1024;
const coastal = landscapeSurfaceCacheGeometry({ minX: 0, maxX: 4000, minZ: 0, maxZ: 4000 });
// coastal mask levels: root 15.625 m, L1 7.8125, L2 3.90625, native 1.953125, generated L4-L6 0.977 / 0.488 / 0.244
const LEVEL_SPACINGS = [15.625, 7.8125, 3.90625, 1.953125, .9765625, .48828125, .244140625];

function random(seed) {
    let state = seed >>> 0;
    return () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 2 ** 32; };
}

// inward frustum planes {x,y,z,w} of a symmetric perspective camera looking from eye to target (Y up)
function perspectiveCamera({ eye, target, fovDegrees = 55, aspect = 16 / 9, near = .1, far = 25000, viewportHeight = 1080 }) {
    const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]], cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
    const normalize = v => { const l = Math.hypot(...v); return v.map(c => c / l); }, dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
    const forward = normalize(sub(target, eye)), right = normalize(cross(forward, [0, 1, 0])), up = cross(right, forward);
    const tanY = Math.tan(fovDegrees * Math.PI / 360), tanX = tanY * aspect;
    const plane = normal => { const n = normalize(normal); return { x: n[0], y: n[1], z: n[2], w: -dot(n, eye) }; };
    const planes = [plane(forward.map((c, i) => c * 1)), plane(forward.map(c => -c))];
    planes[0].w = -dot(forward, eye) - near; planes[1].w = dot(forward, eye) + far;
    planes.push(plane(right.map((c, i) => forward[i] * tanX - c)), plane(right.map((c, i) => forward[i] * tanX + c)));
    planes.push(plane(up.map((c, i) => forward[i] * tanY - c)), plane(up.map((c, i) => forward[i] * tanY + c)));
    return { projection: 'perspective', position: { x: eye[0], y: eye[1], z: eye[2] }, direction: { x: forward[0], y: forward[1], z: forward[2] }, viewportHeight, zoom: 1,
        fovYRadians: fovDegrees * Math.PI / 180, orthoHeight: 1, frustumPlanes: planes };
}

function topDownCamera({ x, z, height = 150, span = 50, aspect = 16 / 9, viewportHeight = 1080 }) {
    const half = span / 2, halfX = half * aspect;
    return { projection: 'orthographic', position: { x, y: height, z }, direction: { x: 0, y: -1, z: 0 }, viewportHeight, zoom: 1, fovYRadians: 1, orthoHeight: span,
        frustumPlanes: [{ x: 1, y: 0, z: 0, w: -(x - halfX) }, { x: -1, y: 0, z: 0, w: x + halfX }, { x: 0, y: 0, z: 1, w: -(z - half) }, { x: 0, y: 0, z: -1, w: z + half },
            { x: 0, y: -1, z: 0, w: height - .1 }, { x: 0, y: 1, z: 0, w: 25000 - height }] };
}

const flatGround = height => () => ({ min: height, max: height, slope: 0 });

test('Surface cache: the coastal virtual texture has mips 0-12 of 1.5625 cm to 64 m texels over 4096 m and one root page', () => {
    assert.equal(LANDSCAPE_SURFACE_CACHE.id, 'landscape-surface-cache-v1');
    assert.equal(LANDSCAPE_SURFACE_CACHE.texel0Meters, .015625);
    assert.deepEqual([LANDSCAPE_SURFACE_CACHE.pageTexels, LANDSCAPE_SURFACE_CACHE.gutterTexels, LANDSCAPE_SURFACE_CACHE.slotTexels], [64, 4, 72]);
    assert.deepEqual({ ...coastal }, { originX: 0, originZ: 0, rootMip: 12, mips: 13, pageMeters0: 1, texel0Meters: .015625, extentMeters: 4096 });
    assert.equal(2 ** 18 * coastal.texel0Meters, 4096);
    assert.equal(landscapeSurfaceCachePagesPerAxis(coastal, 0), 4096);
    assert.equal(landscapeSurfaceCachePagesPerAxis(coastal, 12), 1);
    assert.equal(landscapeSurfaceCachePageMeters(coastal, 12), 4096);
    assert.equal(landscapeSurfaceCacheTexelMeters(coastal, 12), 64);
    assert.equal(landscapeSurfaceCacheGeometry({ minX: 0, maxX: 4096, minZ: 0, maxZ: 10 }).rootMip, 12, 'an exact power of two keeps its mip count');
    assert.equal(landscapeSurfaceCacheGeometry({ minX: -50, maxX: 50, minZ: 0, maxZ: 100 }).rootMip, 7);
    assert.throws(() => landscapeSurfaceCacheGeometry({ minX: 0, maxX: 0, minZ: 0, maxZ: 1 }), /positive extent/);
    assert.throws(() => landscapeSurfaceCacheGeometry({ minX: 0, maxX: 1e6, minZ: 0, maxZ: 1 }), /at most 16 are supported/);
});

test('Surface cache: page keys round-trip and page bounds include the 4-texel gutter of the slot', () => {
    const rand = random(7);
    for (let i = 0; i < 500; i++) {
        const mip = Math.floor(rand() * 13), pages = landscapeSurfaceCachePagesPerAxis(coastal, mip), x = Math.floor(rand() * pages), z = Math.floor(rand() * pages);
        const key = landscapeSurfaceCachePageKey(mip, x, z);
        assert.ok(Number.isSafeInteger(key));
        assert.deepEqual(parseLandscapeSurfaceCachePageKey(key), { mip, x, z });
    }
    assert.notEqual(landscapeSurfaceCachePageKey(0, 1, 0), landscapeSurfaceCachePageKey(0, 0, 1));
    assert.deepEqual(landscapeSurfaceCachePageBounds(coastal, 0, 10, 20), { minX: 10, maxX: 11, minZ: 20, maxZ: 21 });
    assert.deepEqual(landscapeSurfaceCachePageBounds(coastal, 0, 10, 20, { gutter: true }), { minX: 10 - .0625, maxX: 11 + .0625, minZ: 20 - .0625, maxZ: 21 + .0625 });
    assert.deepEqual(landscapeSurfaceCachePageBounds(coastal, 12, 0, 0, { gutter: true }), { minX: -256, maxX: 4352, minZ: -256, maxZ: 4352 });
    assert.throws(() => landscapeSurfaceCachePageBounds(coastal, 1, 2048, 0), /page x/);
    assert.throws(() => landscapeSurfaceCachePageKey(16, 0, 0), /mip/);
});

test('Surface cache: clipmap windows are 64 pages around a snapped center, nest inside their parents and cover every page from mip 6', () => {
    const center = landscapeSurfaceCacheSnapCenter(coastal, 1071.3, 914.06);
    assert.deepEqual({ ...center }, { x: 1071, z: 914 });
    assert.deepEqual(landscapeSurfaceCacheSnapCenter(coastal, -40, 5000), { x: 0, z: 4096 });
    assert.deepEqual(landscapeSurfaceCacheWindowOrigin(coastal, 0, center), { x: 1039, z: 882 });
    assert.deepEqual(landscapeSurfaceCacheWindowOrigin(coastal, 4, center), { x: 34, z: 25 });
    for (let mip = 6; mip <= 12; mip++) assert.deepEqual(landscapeSurfaceCacheWindowOrigin(coastal, mip, center), { x: 0, z: 0 }, `mip ${mip} window covers the landscape`);
    assert.deepEqual(landscapeSurfaceCacheWindowOrigin(coastal, 0, { x: 4096, z: 0 }), { x: 4032, z: 0 }, 'windows clamp to the virtual texture');
    const rand = random(11);
    for (let trial = 0; trial < 200; trial++) {
        const c = landscapeSurfaceCacheSnapCenter(coastal, rand() * 4200 - 100, rand() * 4200 - 100);
        for (let mip = 0; mip < coastal.rootMip; mip++) {
            const origin = landscapeSurfaceCacheWindowOrigin(coastal, mip, c), parent = landscapeSurfaceCacheWindowOrigin(coastal, mip + 1, c);
            assert.ok(origin.x >= 2 * parent.x && origin.z >= 2 * parent.z && origin.x + 64 <= 2 * (parent.x + 64) && origin.z + 64 <= 2 * (parent.z + 64),
                `window ${mip} of center ${c.x},${c.z} lies inside window ${mip + 1}, so every page's parent texel is resident in the coarser layer`);
            const corner = [origin.x + Math.floor(rand() * 64), origin.z + Math.floor(rand() * 64)];
            if (corner[0] < landscapeSurfaceCachePagesPerAxis(coastal, mip) && corner[1] < landscapeSurfaceCachePagesPerAxis(coastal, mip)) {
                assert.equal(landscapeSurfaceCacheWindowContains(coastal, mip, c, corner[0], corner[1]), true);
                assert.equal(landscapeSurfaceCacheWindowContains(coastal, mip + 1, c, corner[0] >> 1, corner[1] >> 1), true);
            }
        }
    }
});

test('Surface cache: the frame selects the finer trilinear mip of the anisotropic footprint and coarsens outside a window', () => {
    assert.equal(landscapeSurfaceCacheFootprint([.04, 0], [0, .01], 2), .02, '2x anisotropy halves the major axis');
    assert.equal(landscapeSurfaceCacheFootprint([.04, 0], [0, .01], 4), .01);
    assert.equal(landscapeSurfaceCacheFootprint([.01, 0], [0, .01], 2), .01);
    const center = { x: 1000, z: 1000 };
    assert.equal(landscapeSurfaceCacheFrameMip(coastal, center, 1000.5, 1000.5, .015625), 0);
    assert.equal(landscapeSurfaceCacheFrameMip(coastal, center, 1000.5, 1000.5, .031), 0, 'floor of lod 0.99 stays at mip 0 and the slot level 1 blends in');
    assert.equal(landscapeSurfaceCacheFrameMip(coastal, center, 1000.5, 1000.5, .0313), 1);
    assert.equal(landscapeSurfaceCacheFrameMip(coastal, center, 1000.5, 1000.5, .001), 0, 'magnification clamps to mip 0');
    assert.equal(landscapeSurfaceCacheFrameMip(coastal, center, 1000.5, 1000.5, 1e6), 12);
    // 40 m from the center the mip-0 window (pages 968..1031) no longer contains the position: the next containing mip is used
    assert.equal(landscapeSurfaceCacheFrameMip(coastal, center, 1040.5, 1000.5, .015625), 1);
    assert.equal(landscapeSurfaceCacheFrameMip(coastal, center, 1200.5, 1000.5, .015625), 3);
});

test('Surface cache: 72-texel slots in 16x16 layers with a half-resolution level and response atlas cost 57,024 bytes per slot', () => {
    const layout = landscapeSurfaceCacheSlotLayout({ slots: 2048 });
    assert.deepEqual({ ...layout }, { slots: 2048, perRow: 16, perLayer: 256, layers: 8, layerTexels: 1152, levelOneTexels: 576, responseTexels: 576,
        layerBytes: 14598144, slotBytes: 57024, atlasBytes: 116785152 });
    assert.equal(72 * 72 * 4 * 2 + 36 * 36 * 4 * 3, 57024, 'albedo and material at levels 0 and 1 plus the half-resolution response');
    assert.deepEqual({ ...landscapeSurfaceCacheSlotPosition(layout, 0) }, { layer: 0, column: 0, row: 0, x0: 0, y0: 0, x1: 0, y1: 0 });
    assert.deepEqual({ ...landscapeSurfaceCacheSlotPosition(layout, 273) }, { layer: 1, column: 1, row: 1, x0: 72, y0: 72, x1: 36, y1: 36 });
    assert.deepEqual({ ...landscapeSurfaceCacheSlotPosition(layout, 2047) }, { layer: 7, column: 15, row: 15, x0: 1080, y0: 1080, x1: 540, y1: 540 });
    assert.throws(() => landscapeSurfaceCacheSlotLayout({ slots: 300 }), /multiple of 256/);
    assert.throws(() => landscapeSurfaceCacheSlotPosition(layout, 2048), /slot/);
    assert.equal(landscapeSurfaceCacheIndirectionBytes(coastal), 64 * 64 * 4 * 13);
});

test('Surface cache: generation packs candidates into aligned 4x4 blocks of one mip whose page regions are the slots of their pages', () => {
    const pages = [];
    for (let z = 4; z < 8; z++) for (let x = 8; x < 12; x++) pages.push({ mip: 0, x, z });
    pages.push({ mip: 0, x: 12, z: 4 }, { mip: 1, x: 8, z: 4 }, { mip: 3, x: 0, z: 0 }, { mip: 3, x: 1, z: 0 });
    const { blocks, deferred } = packLandscapeSurfaceCacheBlocks(pages);
    assert.equal(deferred.length, 0);
    assert.equal(blocks.length, 4, 'a full block, a page of the next block, a page of another mip and a 2x1 block');
    const full = blocks.find(block => block.pages.length === 16);
    assert.deepEqual([full.mip, full.x0, full.x1, full.z0, full.z1, full.width, full.height], [0, 8, 11, 4, 7, 264, 264]);
    assert.deepEqual(landscapeSurfaceCacheBlockPageOrigin(full, { x: 10, z: 5 }), { x: full.origin.x + 128, y: full.origin.y + 64 });
    const pair = blocks.find(block => block.mip === 3);
    assert.deepEqual([pair.width, pair.height, pair.pages.length], [136, 72, 2]);
    // rectangles stay inside the scratch, never overlap and start on even texels (level 1 halves them)
    for (const a of blocks) {
        assert.ok(a.origin.x + a.width <= 576 && a.origin.y + a.height <= 576);
        assert.equal(a.origin.x % 2 + a.origin.y % 2, 0);
        for (const b of blocks) if (a !== b) assert.ok(a.origin.x + a.width <= b.origin.x || b.origin.x + b.width <= a.origin.x || a.origin.y + a.height <= b.origin.y || b.origin.y + b.height <= a.origin.y);
    }
    // 64 scattered pages exactly fill the 8x8 grid; four full blocks fill 2x2 rectangles of 264; a fifth full block is deferred in input order
    const scattered = Array.from({ length: 64 }, (_, index) => ({ mip: 2, x: index * 4, z: 0 }));
    assert.equal(packLandscapeSurfaceCacheBlocks(scattered).deferred.length, 0);
    const five = [];
    for (let block = 0; block < 5; block++) for (let z = 0; z < 4; z++) for (let x = 0; x < 4; x++) five.push({ mip: 0, x: block * 4 + x, z });
    const packed = packLandscapeSurfaceCacheBlocks(five);
    assert.equal(packed.blocks.length, 4);
    assert.equal(packed.deferred.length, 16);
    assert.deepEqual(packed.deferred.map(page => five.indexOf(page)), packed.deferred.map(page => five.indexOf(page)).sort((a, b) => a - b));
});

test('Surface cache: gutters keep bilinear, trilinear and 2x anisotropic fetches inside their slot; 4x reaches one texel further at low weights', () => {
    assert.equal(landscapeSurfaceCacheGutter(0), 4);
    assert.equal(landscapeSurfaceCacheGutter(1), 2);
    for (const level of [0, 1]) {
        assert.ok(landscapeSurfaceCacheFilterReach({ anisotropy: 1, level }) <= landscapeSurfaceCacheGutter(level), `bilinear/trilinear level ${level}`);
        assert.ok(landscapeSurfaceCacheFilterReach({ anisotropy: 2, level }) <= landscapeSurfaceCacheGutter(level), `2x anisotropic level ${level}`);
    }
    assert.equal(landscapeSurfaceCacheFilterReach({ anisotropy: 2, level: 0 }), 3);
    assert.equal(landscapeSurfaceCacheFilterReach({ anisotropy: 2, level: 1 }), 2);
    assert.ok(landscapeSurfaceCacheFilterReach({ anisotropy: 4, level: 0 }) > 4, '4x at full level-0 weight needs a wider gutter');
    assert.ok(landscapeSurfaceCacheFilterReach({ anisotropy: 4, level: 0, minimumWeight: .5 }) <= 4, 'level 0 carries at least half the blend within the gutter at 4x');
    assert.ok(landscapeSurfaceCacheFilterReach({ anisotropy: 4, level: 1 }) > 2);
});

test('Surface cache: the atlas fits whole 256-slot layers under 3/8 of the GPU limit with explicit degradation reasons', () => {
    const shipped = fitLandscapeSurfaceCache({ limits: { cpuBytes: 512 * MIB, gpuBytes: 256 * MIB }, geometry: coastal });
    assert.deepEqual({ slots: shipped.slots, layers: shipped.layers, reason: shipped.reason }, { slots: 1536, layers: 6, reason: 'surface-cache-gpu-ceiling' });
    assert.equal(shipped.ceilingBytes, 96 * MIB);
    assert.ok(shipped.gpuBytes <= shipped.ceilingBytes);
    assert.equal(shipped.gpuBytes, 6 * 14598144 + 576 * 576 * 16 + 212992, 'six layers, the packed generation scratch and the indirection');
    assert.equal(shipped.scratchBytes, 5308416);
    assert.equal(shipped.cpuBytes, 212992 + 1536 * 8);
    const large = fitLandscapeSurfaceCache({ limits: { cpuBytes: 768 * MIB, gpuBytes: 384 * MIB }, geometry: coastal });
    assert.deepEqual({ slots: large.slots, reason: large.reason, atlasBytes: large.atlasBytes }, { slots: 2048, reason: null, atlasBytes: 116785152 });
    const wide = fitLandscapeSurfaceCache({ limits: { cpuBytes: 768 * MIB, gpuBytes: 384 * MIB }, geometry: coastal, targetSlots: 3072 });
    assert.deepEqual([wide.slots, wide.reason], [2304, 'surface-cache-gpu-ceiling'], '3,072 slots need 3/8 of a 512 MiB limit');
    assert.equal(fitLandscapeSurfaceCache({ limits: { cpuBytes: 1024 * MIB, gpuBytes: 512 * MIB }, geometry: coastal, targetSlots: 3072 }).slots, 3072);
    assert.deepEqual((({ slots, reason }) => ({ slots, reason }))(fitLandscapeSurfaceCache({ limits: { cpuBytes: 16 * MIB, gpuBytes: 8 * MIB }, geometry: coastal })), { slots: 0, reason: 'surface-cache-gpu-budget' });
    assert.equal(fitLandscapeSurfaceCache({ limits: { cpuBytes: 768 * MIB, gpuBytes: 384 * MIB }, geometry: coastal, maxTextureSize: 1024 }).reason, 'surface-cache-device-capacity');
    assert.equal(fitLandscapeSurfaceCache({ limits: { cpuBytes: 768 * MIB, gpuBytes: 384 * MIB }, geometry: coastal, maxArrayLayers: 4 }).reason, 'surface-cache-device-capacity');
    assert.equal(fitLandscapeSurfaceCache({ limits: { cpuBytes: 100000, gpuBytes: 384 * MIB }, geometry: coastal }).reason, 'surface-cache-cpu-budget');
    assert.throws(() => fitLandscapeSurfaceCache({ limits: { cpuBytes: 1, gpuBytes: 1 }, geometry: coastal, targetSlots: 10 }), /target slots/);
    // switched on beside resident streams: the ledger's free bytes bound the atlas below its ceiling, with their own reason
    const beside = fitLandscapeSurfaceCache({ limits: { cpuBytes: 512 * MIB, gpuBytes: 256 * MIB }, available: { gpuBytes: 68 * MIB }, geometry: coastal });
    assert.deepEqual([beside.slots, beside.reason], [1024, 'surface-cache-gpu-available']);
    assert.ok(beside.gpuBytes <= 68 * MIB);
    assert.deepEqual((({ slots, reason }) => ({ slots, reason }))(fitLandscapeSurfaceCache({ limits: { cpuBytes: 512 * MIB, gpuBytes: 256 * MIB }, available: { gpuBytes: 200 * MIB }, geometry: coastal })),
        { slots: 1536, reason: 'surface-cache-gpu-ceiling' }, 'the ceiling binds first when the ledger has room');
    assert.equal(fitLandscapeSurfaceCache({ limits: { cpuBytes: 512 * MIB, gpuBytes: 256 * MIB }, available: { gpuBytes: 10 * MIB }, geometry: coastal }).reason, 'surface-cache-gpu-budget');
    assert.equal(fitLandscapeSurfaceCache({ limits: { cpuBytes: 768 * MIB, gpuBytes: 384 * MIB }, available: { gpuBytes: 384 * MIB }, geometry: coastal }).reason, null);
});

test('Surface cache: hemi-octahedral normals round-trip in the geometric tangent frame within 0.6 degrees at 8 bits', () => {
    const rand = random(3), quantize = value => Math.round(value * 255) / 255;
    let worst = 0;
    for (let i = 0; i < 4000; i++) {
        const theta = Math.acos(1 - rand() * .95), phi = rand() * Math.PI * 2, v = [Math.sin(theta) * Math.cos(phi), Math.sin(theta) * Math.sin(phi), Math.cos(theta)];
        const exact = decodeLandscapeHemiOctahedral(encodeLandscapeHemiOctahedral(v));
        exact.forEach((c, axis) => assert.ok(Math.abs(c - v[axis]) < 1e-9));
        const stored = decodeLandscapeHemiOctahedral(encodeLandscapeHemiOctahedral(v).map(quantize));
        worst = Math.max(worst, Math.acos(Math.min(1, stored[0] * v[0] + stored[1] * v[1] + stored[2] * v[2])) * 180 / Math.PI);
    }
    assert.ok(worst < .6, `8-bit angular error ${worst.toFixed(3)} degrees`);
    assert.deepEqual(encodeLandscapeHemiOctahedral([0, 0, 1]), [.5, .5], 'the geometric normal encodes at the neutral center');
    for (const n of [[0, 1, 0], [.3, .9, .2], [-.5, .7, .5]]) {
        const l = Math.hypot(...n), unit = n.map(c => c / l), { tangent, north } = landscapeSurfaceCacheTangentFrame(unit);
        const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
        assert.ok(Math.abs(dot(tangent, unit)) < 1e-12 && Math.abs(dot(north, unit)) < 1e-12 && Math.abs(dot(tangent, north)) < 1e-12);
        assert.ok(Math.abs(Math.hypot(...tangent) - 1) < 1e-12 && Math.abs(Math.hypot(...north) - 1) < 1e-12);
    }
});

test('Surface cache: identities are deterministic, order-independent, sensitive to every input and free of camera, light or time', () => {
    assert.equal(landscapeSurfaceCacheHash('abc'), landscapeSurfaceCacheHash('abc'));
    assert.notEqual(landscapeSurfaceCacheHash('abc'), landscapeSurfaceCacheHash('abd'));
    assert.match(landscapeSurfaceCacheHash(''), /^[0-9a-f]{14}$/);
    const base = { global: 'g1', mip: 3, x: 10, z: 20, masks: ['a', 'b'], soils: ['3:resolved:none'] };
    const id = landscapeSurfaceCachePageIdentity(base);
    assert.equal(landscapeSurfaceCachePageIdentity({ ...base, masks: ['b', 'a'] }), id, 'mask order does not matter');
    for (const changed of [{ global: 'g2' }, { mip: 4 }, { x: 11 }, { z: 21 }, { masks: ['a'] }, { soils: ['3:128:none'] }, { tiles: ['l5/c1/r2'] }]) assert.notEqual(landscapeSurfaceCachePageIdentity({ ...base, ...changed }), id);
    assert.equal(landscapeSurfaceCachePageIdentity({ ...base, tiles: [] }), id, 'no geometry source list is the empty list');
    assert.equal(landscapeSurfaceCacheGlobalKey({ b: 1, a: new Float32Array([1, 2]) }), landscapeSurfaceCacheGlobalKey({ a: [1, 2], b: '1' }), 'global parts are keyed by name');
    assert.notEqual(landscapeSurfaceCacheGlobalKey({ a: new Float32Array([1, 2]) }), landscapeSurfaceCacheGlobalKey({ a: new Float32Array([1, 3]) }));
    assert.deepEqual(Object.keys(base).sort(), ['global', 'masks', 'mip', 'soils', 'x', 'z'], 'the identity has no camera, sun or time input');
});

test('Surface cache: a page depends only on the mask levels its texel can resolve and tiers coarser than half its texel', () => {
    assert.deepEqual(Array.from({ length: 13 }, (_, mip) => landscapeSurfaceCacheMaskLevel(coastal, mip, LEVEL_SPACINGS)), [6, 6, 6, 6, 6, 6, 5, 4, 3, 2, 1, 0, 0],
        'mips 0-5 read the 25 cm pages, mip 6 (1 m texels) stops at L5, mip 11 and coarser only the root, which always contributes');
    assert.equal(landscapeSurfaceCacheTierKey({ tileMeters: 4, resolution: 1024, texelMeters: .015625 }), 'resolved');
    assert.equal(landscapeSurfaceCacheTierKey({ tileMeters: 4, resolution: 512, texelMeters: .015625 }), 'resolved');
    assert.equal(landscapeSurfaceCacheTierKey({ tileMeters: 4, resolution: 128, texelMeters: .015625 }), '128');
    assert.equal(landscapeSurfaceCacheTierKey({ tileMeters: 30, resolution: 1024, texelMeters: .015625 }), '1024', 'sand at 1024 is still coarser than half a mip-0 texel');
    assert.equal(landscapeSurfaceCacheTierKey({ tileMeters: 4, resolution: 32, texelMeters: 1 }), 'resolved', 'coarse pages ignore tier changes');
});

test('Surface cache: page inputs track contributing masks, fading inputs, soil tiers, transitions and geometry transitions', () => {
    const bounds = (minX, minZ, size) => ({ minX, maxX: minX + size, minZ, maxZ: minZ + size });
    const slots = [
        { key: 'root', level: 0, bounds: bounds(0, 0, 4000), progress: 1, soils: [3] },
        { key: 'native', level: 3, bounds: bounds(1000, 500, 500), progress: 1, soils: [2, 3] },
        { key: 'fine-l6', level: 6, bounds: bounds(1062.5, 875, 62.5), progress: 1, soils: [2] }
    ];
    const soils = Array.from({ length: 6 }, (_, index) => ({ index, tileMeters: index === 2 ? 30 : 4, resolution: 1024, microTileMeters: index === 2 ? 3.5 : 0, microResolution: 1024, transitionResolution: null }));
    const tiles = [{ id: 'l4/c8/r7', bounds: bounds(1000, 875, 125) }, { id: 'l4/c9/r7', bounds: bounds(1125, 875, 125) }];
    const query = (overrides = {}, page = { mip: 0, x: 1070, z: 900 }) => {
        const inputs = { slots: overrides.slots ?? slots, levelSpacings: LEVEL_SPACINGS };
        return landscapeSurfaceCachePageInputs({ geometry: coastal, global: overrides.global ?? 'g', byLevel: indexLandscapeSurfaceCacheInputs(inputs), levelSpacings: LEVEL_SPACINGS,
            soils: overrides.soils ?? soils, alwaysSoils: [5], unstableBoxes: overrides.unstableBoxes ?? [], tiles: overrides.tiles ?? tiles, ...page });
    };
    const fine = query();
    assert.equal(fine.stable, true);
    assert.equal(fine.masks, 3);
    assert.deepEqual(fine.soils.sort(), [2, 3, 5]);
    const coarse = query({}, { mip: 7, x: 8, z: 7 });
    assert.equal(coarse.masks, 2, 'a 2 m texel page ignores the 25 cm page');
    // a contributing L6 page changing (new identity) changes the mip-0 identity, not the mip-7 one
    const swapped = slots.map(slot => slot.key === 'fine-l6' ? { ...slot, key: 'fine-l6-b' } : slot);
    assert.notEqual(query({ slots: swapped }).identity, fine.identity);
    assert.equal(query({ slots: swapped }, { mip: 7, x: 8, z: 7 }).identity, coarse.identity);
    // fading inputs make the page unstable without changing what it would depend on
    assert.equal(query({ slots: slots.map(slot => slot.key === 'fine-l6' ? { ...slot, progress: .4 } : slot) }).stable, false);
    assert.equal(query({ slots: slots.map(slot => slot.key === 'fine-l6' ? { ...slot, progress: .4 } : slot) }, { mip: 7, x: 8, z: 7 }).stable, true);
    // tiers: sand at 1024 is part of a mip-0 identity; grass tiers finer than half the texel are 'resolved'
    const coarserSand = soils.map(soil => soil.index === 2 ? { ...soil, resolution: 512, microResolution: 512 } : soil);
    assert.notEqual(query({ soils: coarserSand }).identity, fine.identity);
    const finerGrass = soils.map(soil => soil.index === 3 ? { ...soil, resolution: 512 } : soil);
    assert.equal(query({ soils: finerGrass }).identity, fine.identity);
    assert.equal(query({ soils: soils.map(soil => soil.index === 2 ? { ...soil, transitionResolution: 512 } : soil) }).stable, false, 'a tier transition changing the key defers the page');
    assert.equal(query({ soils: soils.map(soil => soil.index === 3 ? { ...soil, transitionResolution: 512 } : soil) }).stable, true, 'a transition between resolved tiers does not');
    assert.equal(query({ unstableBoxes: [bounds(1069, 899, 3)] }).stable, false, 'a geometry transition over the page defers it');
    // geometry sources: the tiles under the page (with its gutter) enter the identity; a level change there makes it stale, elsewhere not
    assert.equal(fine.tiles, 1);
    const refined = [{ id: 'l5/c17/r14', bounds: bounds(1062.5, 875, 62.5) }, { id: 'l5/c16/r14', bounds: bounds(1000, 875, 62.5) }, tiles[1]];
    assert.notEqual(query({ tiles: refined }).identity, fine.identity);
    assert.equal(query({ tiles: [tiles[0], { id: 'l5/c18/r14', bounds: bounds(1125, 875, 62.5) }] }).identity, fine.identity, 'a tile beyond the page does not count');
    assert.equal(query({ global: 'other' }).identity === fine.identity, false);
    assert.throws(() => query({ soils: soils.slice(0, 3) }), /without a material state/);
});

test('Surface cache: residency evicts the page desired longest ago, never the pinned root or protected pages, and moves regenerated pages', () => {
    const residency = new LandscapeSurfaceCacheResidency({ slots: 4 });
    const root = landscapeSurfaceCachePageKey(12, 0, 0), keys = [1, 2, 3, 4].map(x => landscapeSurfaceCachePageKey(0, x, 0));
    let allocation = residency.allocate(0);
    assert.deepEqual(allocation, { slot: 0, evicted: null });
    residency.publish({ key: root, slot: allocation.slot, identity: 'r', frame: 0, pinned: true });
    for (const [index, key] of keys.slice(0, 3).entries()) { allocation = residency.allocate(0); residency.publish({ key, slot: allocation.slot, identity: `p${index}`, frame: index + 1 }); }
    assert.equal(residency.freeSlots, 0);
    residency.touch(keys[0], 10);
    allocation = residency.allocate(10);
    assert.equal(allocation.evicted.key, keys[1], 'the page desired longest ago is evicted (frame 2), not the touched one or the pinned root');
    residency.publish({ key: keys[3], slot: allocation.slot, identity: 'p3', frame: 10 });
    assert.equal(residency.get(keys[1]), null);
    assert.equal(residency.allocate(10).evicted.key, keys[2]);
    assert.deepEqual(residency.allocate(10), { slot: -1, evicted: null }, 'protected and pinned pages are never evicted');
    // regeneration publishes into a new slot and frees the old one only then
    const fresh = new LandscapeSurfaceCacheResidency({ slots: 3 }), key = keys[0];
    fresh.publish({ key, slot: fresh.allocate(0).slot, identity: 'old', frame: 0 });
    const next = fresh.allocate(0).slot;
    assert.equal(fresh.get(key).slot, 0, 'the stale version still owns its slot while the replacement renders');
    assert.deepEqual(fresh.publish({ key, slot: next, identity: 'new', frame: 1 }), { previousSlot: 0 });
    assert.equal(fresh.get(key).slot, next);
    assert.equal(fresh.get(key).identity, 'new');
    assert.equal(fresh.freeSlots, 2);
    assert.throws(() => fresh.publish({ key: keys[1], slot: next, identity: 'x', frame: 2 }), /occupied/);
    assert.throws(() => fresh.release(next), /still holds/);
});

test('Surface cache: one indirection fetch returns the best resident ancestor inside every window, including after window moves', () => {
    const geometry = landscapeSurfaceCacheGeometry({ minX: 0, maxX: 512, minZ: 0, maxZ: 512 });
    const residency = new LandscapeSurfaceCacheResidency({ slots: 256 }), indirection = new LandscapeSurfaceCacheIndirection({ geometry }), rand = random(5);
    const publish = (mip, x, z) => { const key = landscapeSurfaceCachePageKey(mip, x, z); if (residency.get(key)) return; residency.publish({ key, slot: residency.allocate(0).slot, identity: 'i', frame: 0 }); indirection.markPage(mip, x, z); };
    indirection.setCenter({ x: 200, z: 300 });
    assert.deepEqual(indirection.rebuild((mip, x, z) => residency.slotOf(mip, x, z)).sort((a, b) => a - b), Array.from({ length: geometry.mips }, (_, mip) => mip));
    assert.equal(indirection.entry(0, 200, 300).valid, false, 'nothing resolves before the root is resident');
    publish(geometry.rootMip, 0, 0);
    for (let i = 0; i < 120; i++) { const mip = Math.floor(rand() * geometry.rootMip), size = 2 ** (geometry.rootMip - mip); publish(mip, Math.floor(rand() * size), Math.floor(rand() * size)); }
    const check = center => {
        indirection.rebuild((mip, x, z) => residency.slotOf(mip, x, z));
        for (let probe = 0; probe < 400; probe++) {
            const mip = Math.floor(rand() * geometry.mips), pages = 2 ** (geometry.rootMip - mip);
            const origin = landscapeSurfaceCacheWindowOrigin(geometry, mip, center), x = origin.x + Math.floor(rand() * Math.min(64, pages)), z = origin.z + Math.floor(rand() * Math.min(64, pages));
            let expected = null;
            for (let level = mip; level <= geometry.rootMip && !expected; level++) { const slot = residency.slotOf(level, x >> (level - mip), z >> (level - mip)); if (slot >= 0) expected = { slot, mip: level }; }
            assert.deepEqual(indirection.entry(mip, x, z), { ...expected, valid: true }, `mip ${mip} page ${x},${z}`);
        }
    };
    check({ x: 200, z: 300 });
    const moved = { x: 37, z: 480 };
    indirection.setCenter(moved);
    check(moved);
    // eviction falls back to the parent again
    const victim = [...residency.pages.values()].find(record => record.mip === 0) ?? [...residency.pages.values()].find(record => record.mip < geometry.rootMip);
    residency.evict(victim.key); indirection.markPage(victim.mip, victim.x, victim.z);
    check(moved);
    assert.ok(indirection.rebuilds >= 3);
});

test('Surface cache demand: a 50 m top-down view wants mip-1 pages over the view plus their ancestors only', () => {
    const camera = topDownCamera({ x: 1071.3, z: 914.1 }), center = chooseLandscapeSurfaceCacheCenter({ geometry: coastal, camera, groundHeight: 6 });
    assert.deepEqual({ ...center }, { x: 1071, z: 914 });
    const plan = planLandscapeSurfaceCacheDemand({ geometry: coastal, camera, center, heightRange: flatGround(6), capacity: 4096 });
    assert.equal(plan.limited, false);
    // 4.63 cm pixels at 2x anisotropy: lod 1.57, so mip 1 (2 m pages) over the 88.9 x 50 m view
    assert.equal(plan.byMip[0], 0);
    assert.ok(plan.byMip[1] >= 45 * 25 && plan.byMip[1] <= 47 * 27, `mip 1 pages ${plan.byMip[1]}`);
    const keys = new Set(plan.pages.map(page => page.key));
    for (const page of plan.pages) if (page.mip < coastal.rootMip) assert.ok(keys.has(landscapeSurfaceCachePageKey(page.mip + 1, page.x >> 1, page.z >> 1)), 'every page keeps its parent');
    assert.equal(plan.byMip[12], 1);
    const wide = planLandscapeSurfaceCacheDemand({ geometry: coastal, camera: topDownCamera({ x: 2000, z: 2000, span: 4000 }), center: { x: 2000, z: 2000 }, heightRange: flatGround(6), capacity: 4096 });
    assert.equal(wide.byMip.findIndex(count => count > 0), 7, 'a 4 km view needs 2 m texels (3.7 m pixels)');
});

test('Surface cache demand: a game-POV camera refines to mip 0 near the camera and coarsens with distance; capacity keeps ancestors and near pages', () => {
    const a = { x: 1071.2890625, z: 914.0625, y: 6.45 };
    const camera = perspectiveCamera({ eye: [a.x - 10, a.y + 4.5, a.z - 26], target: [a.x + 2, a.y, a.z + 16] });
    const center = chooseLandscapeSurfaceCacheCenter({ geometry: coastal, camera, groundHeight: a.y });
    const plan = planLandscapeSurfaceCacheDemand({ geometry: coastal, camera, center, heightRange: flatGround(a.y), capacity: 100000 });
    assert.ok(plan.byMip[0] > 50, `mip-0 pages near the camera: ${plan.byMip[0]}`);
    assert.ok(plan.desired < 6000, `desired ${plan.desired}`);
    const nearest = plan.pages.filter(page => page.mip === 0).sort((x, y) => x.distance - y.distance)[0];
    assert.ok(nearest.distance < 10, 'the finest pages sit at the visible ground closest to the camera');
    for (const page of plan.pages.filter(page => page.mip === 0)) assert.ok(page.distance < 40, `mip-0 page at ${page.distance.toFixed(1)} m`);
    assert.ok(plan.pages.every(page => {
        const b = landscapeSurfaceCachePageBounds(coastal, page.mip, page.x, page.z);
        return camera.frustumPlanes.every(p => p.x * (p.x >= 0 ? b.maxX : b.minX) + p.y * a.y + p.z * (p.z >= 0 ? b.maxZ : b.minZ) + p.w >= -1e-9);
    }), 'only pages intersecting the frustum are desired');
    const limited = planLandscapeSurfaceCacheDemand({ geometry: coastal, camera, center, heightRange: flatGround(a.y), capacity: 500 });
    assert.equal(limited.pages.length, 500);
    assert.equal(limited.limited, true);
    const kept = new Set(limited.pages.map(page => page.key));
    for (const page of limited.pages) if (page.mip < coastal.rootMip) assert.ok(kept.has(landscapeSurfaceCachePageKey(page.mip + 1, page.x >> 1, page.z >> 1)), 'capacity never keeps a page without its parent');
    assert.ok(limited.byMip[0] > 0, 'the near ring keeps its finest pages when the demand exceeds the atlas');
});

test('Surface cache demand: narrow fields of view shift the window center forward; motion prefetches pages ahead; the center has hysteresis', () => {
    const eye = [1000, 10, 1000], target = [1000, 0, 1200];
    const wideCamera = perspectiveCamera({ eye, target, fovDegrees: 55 }), narrow = perspectiveCamera({ eye, target, fovDegrees: 8 });
    const wide = chooseLandscapeSurfaceCacheCenter({ geometry: coastal, camera: wideCamera, groundHeight: 0 });
    const shifted = chooseLandscapeSurfaceCacheCenter({ geometry: coastal, camera: narrow, groundHeight: 0 });
    assert.ok(Math.abs(wide.z - 1000) <= 1, 'a 55 degree view stays centered on the camera');
    assert.equal(shifted.z - 1000, LANDSCAPE_SURFACE_CACHE_DEMAND.centerShiftLimitMeters);
    assert.equal(chooseLandscapeSurfaceCacheCenter({ geometry: coastal, camera: perspectiveCamera({ eye: [1001.4, 10, 1000.6], target: [1001.4, 0, 1200] }), groundHeight: 0, previous: wide }), wide, 'small moves keep the window');
    const center = wide, still = planLandscapeSurfaceCacheDemand({ geometry: coastal, camera: wideCamera, center, heightRange: flatGround(0), capacity: 100000 });
    const moving = planLandscapeSurfaceCacheDemand({ geometry: coastal, camera: wideCamera, center, heightRange: flatGround(0), capacity: 100000, velocity: { x: 0, y: 0, z: 20 } });
    const prefetched = moving.pages.filter(page => page.prefetch);
    assert.ok(prefetched.length > 0 && moving.desired > still.desired);
    assert.ok(prefetched.every(page => page.priority >= LANDSCAPE_SURFACE_CACHE_DEMAND.prefetchPriorityOffset), 'prefetch ranks after the current view');
    assert.ok(prefetched.some(page => landscapeSurfaceCachePageBounds(coastal, page.mip, page.x, page.z).minZ > 1000), 'pages ahead of the motion');
});

test('Surface cache demand: the overview envelope bounds heights by the geometric error and reports the steepest slope', () => {
    const columns = 17, rows = 17, heights = new Float32Array(columns * rows);
    for (let r = 0; r < rows; r++) for (let c = 0; c < columns; c++) heights[r * columns + c] = c < 8 ? 0 : (c - 8) * 10;
    const envelope = createLandscapeSurfaceCacheTerrainEnvelope({ descriptor: { columns, rows, bounds: { minX: 0, maxX: 160, minZ: 0, maxZ: 160 }, geometricError: 2 }, heights });
    const flat = envelope(10, 10, 40, 40), steep = envelope(100, 10, 120, 40), all = envelope(0, 0, 160, 160);
    assert.deepEqual([flat.min, flat.max, flat.slope], [-2, 2, 0]);
    assert.ok(Math.abs(steep.slope - 1 / Math.SQRT2) < 1e-6, 'a 45 degree overview cell');
    assert.ok(steep.min <= 20 - 2 && steep.max >= 40 + 2);
    assert.deepEqual([all.min, all.max], [-2, 82]);
    assert.ok(Math.abs(all.slope - 1 / Math.SQRT2) < 1e-6);
    assert.deepEqual(envelope(500, 500, 600, 600), envelope(150, 150, 160, 160), 'outside the landscape the border cells apply');
    assert.throws(() => createLandscapeSurfaceCacheTerrainEnvelope({ descriptor: { columns, rows, bounds: { minX: 0, maxX: 1, minZ: 0, maxZ: 1 }, geometricError: 0 }, heights: new Float32Array(3) }), /overview heights/);
});

test('Surface cache demand: feedback pages and their missing ancestors join a plan after its own pages, within capacity', () => {
    const page = (mip, x, z, priority) => ({ key: landscapeSurfaceCachePageKey(mip, x, z), mip, x, z, priority, distance: 0, prefetch: false });
    const plan = { pages: [page(12, 0, 0, 0), page(11, 0, 0, .5), page(10, 1, 1, 1)], desired: 3, visited: 9, limited: false, byMip: [] };
    const merged = mergeLandscapeSurfaceCacheFeedback({ geometry: coastal, plan, feedback: [{ mip: 9, x: 2, z: 3 }, { mip: 10, x: 1, z: 1 }], capacity: 10 });
    assert.deepEqual(merged.pages.slice(0, 3), plan.pages, 'planned pages keep their order');
    assert.deepEqual(merged.pages.slice(3).map(p => [p.mip, p.x, p.z, p.feedback]), [[9, 2, 3, true]], 'the requested page (its parent mip-10 page 1,1 is planned); a planned request adds nothing');
    assert.equal(merged.feedback, 1);
    const deep = mergeLandscapeSurfaceCacheFeedback({ geometry: coastal, plan, feedback: [{ mip: 0, x: 1100, z: 900 }], capacity: 10 });
    assert.deepEqual(deep.pages.slice(3).map(p => p.mip), [10, 9, 8, 7, 6, 5, 4], 'the missing ancestors coarse first (mip-10 page 1,0 is not planned), cut at capacity');
    assert.ok(deep.limited);
    assert.ok(deep.pages.slice(3).every((p, i, list) => i === 0 || p.priority > list[i - 1].priority));
    assert.throws(() => mergeLandscapeSurfaceCacheFeedback({ geometry: coastal, plan, feedback: [{ mip: 0, x: 4096, z: 0 }], capacity: 10 }), /page x/);
});
