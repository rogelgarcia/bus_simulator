// Verifies the pure AI 531 static-sun depth contract and CPU sampler.
// @ts-check

import assert from 'node:assert/strict';
import test from 'node:test';
import {
    STATIC_SUN_DEPTH_EMPTY_QUANTIZED,
    STATIC_SUN_DEPTH_MAX_QUANTIZED,
    createStableStaticSunDepthBasis,
    createThreeR183DirectionalShadowFilterAxes,
    createStaticSunDepthActiveSet,
    createStaticSunDepthResidency,
    decodeStaticSunDepthMeters,
    encodeStaticSunDepthMeters,
    lookupStaticSunDepthTile,
    packStaticSunDepthQuantizedRg8,
    sampleStaticSunDepthWorld,
    unpackStaticSunDepthQuantizedRg8,
    validateStaticSunDepthTileSetDescriptor
} from '../../../src/app/illumination/static_sun_depth/index.js';

const HASH_A = 'a'.repeat(64);
const HASH_B = 'b'.repeat(64);
const HASH_C = 'c'.repeat(64);
const HASH_D = 'd'.repeat(64);
const TILE_HASHES = ['1'.repeat(64), '2'.repeat(64), '3'.repeat(64), '4'.repeat(64)];

test('stable basis and strict descriptor validation establish the complete immutable grid', () => {
    const raw = makeDescriptor();
    const descriptor = validateStaticSunDepthTileSetDescriptor(raw);
    const {rightAxisWorld: right, upAxisWorld: up, depthAxisWorld: depth} = descriptor.identity.basis;

    assert.ok(Math.abs(dot(right, up)) < 1e-12);
    assert.ok(Math.abs(dot(right, depth)) < 1e-12);
    assert.ok(Math.abs(dot(up, depth)) < 1e-12);
    assert.ok(cross(right, up).every((value, index) => Math.abs(value - depth[index]) < 1e-12));
    assert.deepEqual(depth, [0, 0, 1]);
    assert.ok(Object.isFrozen(descriptor));
    assert.ok(Object.isFrozen(descriptor.identity.layout));
    assert.equal(
        descriptor.identity.layout.guardPolicy,
        'copy-adjacent-clamp-exterior-v1'
    );
    assert.ok(Object.isFrozen(descriptor.tiles));
    assert.equal(descriptor.tiles.length, 4);

    raw.identity.cityId = 'mutated-after-validation';
    assert.equal(descriptor.identity.cityId, 'fixture-city');

    const wrongBounds = makeDescriptor();
    wrongBounds.tiles[1].interiorBoundsLightMeters.min[0] = 1.5;
    assert.throws(
        () => validateStaticSunDepthTileSetDescriptor(wrongBounds),
        /does not match its grid coordinates/
    );

    const wrongBasis = makeDescriptor();
    wrongBasis.identity.basis.rightAxisWorld = [0, 1, 0];
    assert.throws(() => validateStaticSunDepthTileSetDescriptor(wrongBasis), /basis/);

    const unknownField = makeDescriptor();
    unknownField.identity.layout.extra = true;
    assert.throws(() => validateStaticSunDepthTileSetDescriptor(unknownField), /must contain exactly/);

    const widePcf = makeDescriptor();
    widePcf.identity.sampling.pcf.radiusTexels = 2;
    assert.throws(() => validateStaticSunDepthTileSetDescriptor(widePcf), /0 through 1/);

    const missingGuard = makeDescriptor();
    missingGuard.identity.layout.guardTexels = 0;
    assert.throws(() => validateStaticSunDepthTileSetDescriptor(missingGuard), /complete PCF radius/);

    const rectangular = makeDescriptor();
    rectangular.identity.layout.interiorTexels = [2, 1];
    rectangular.identity.layout.boundsLightMeters.max = [4, 2];
    rectangular.tiles.forEach((tile) => {
        const [x, y] = tile.coordinates;
        tile.interiorBoundsLightMeters = {
            min: [x * 2, y],
            max: [(x + 1) * 2, y + 1]
        };
        tile.storedTexels = [4, 3];
    });
    assert.doesNotThrow(() => validateStaticSunDepthTileSetDescriptor(rectangular));
});

test('descriptor rejects WebGL float32 overflow and precision collapse', () => {
    const originOverflow = makeDescriptor();
    originOverflow.identity.basis.originWorld = [1e300, 0, 0];
    assert.throws(
        () => validateStaticSunDepthTileSetDescriptor(originOverflow),
        /originWorld.*float32/
    );

    const translationOverflow = makeDescriptor();
    const diagonal = [1 / Math.sqrt(3), 1 / Math.sqrt(3), 1 / Math.sqrt(3)];
    translationOverflow.identity.sunPointDirectionWorld = diagonal;
    translationOverflow.identity.basis = clone(createStableStaticSunDepthBasis(
        diagonal,
        [3e38, 3e38, 3e38]
    ));
    assert.throws(
        () => validateStaticSunDepthTileSetDescriptor(translationOverflow),
        /world-to-light translation.*float32/
    );

    const boundsOverflow = makeDescriptor();
    boundsOverflow.identity.layout.boundsLightMeters = {
        min: [1e300, 0],
        max: [1e300, 4]
    };
    assert.throws(
        () => validateStaticSunDepthTileSetDescriptor(boundsOverflow),
        /boundsLightMeters.*float32/
    );

    const collapsedBounds = makeDescriptor();
    collapsedBounds.identity.layout.boundsLightMeters = {
        min: [1e20, 0],
        max: [1e20, 4]
    };
    assert.throws(
        () => validateStaticSunDepthTileSetDescriptor(collapsedBounds),
        /horizontal bounds.*float32/
    );

    const texelOverflow = makeDescriptor();
    texelOverflow.identity.layout.texelSizeMeters = 2e38;
    assert.throws(
        () => validateStaticSunDepthTileSetDescriptor(texelOverflow),
        /tile world size.*float32/
    );

    const depthOverflow = makeDescriptor();
    depthOverflow.identity.encoding.maxDepthMeters = 1e300;
    assert.throws(
        () => validateStaticSunDepthTileSetDescriptor(depthOverflow),
        /maxDepthMeters.*float32/
    );

    const rangeOverflow = makeDescriptor();
    rangeOverflow.identity.encoding.minDepthMeters = -3e38;
    rangeOverflow.identity.encoding.maxDepthMeters = 3e38;
    assert.throws(
        () => validateStaticSunDepthTileSetDescriptor(rangeOverflow),
        /depth range.*float32/
    );

    const biasOverflow = makeDescriptor();
    biasOverflow.identity.sampling.bias.constantMeters = 1e300;
    assert.throws(
        () => validateStaticSunDepthTileSetDescriptor(biasOverflow),
        /constantMeters.*float32/
    );
});

test('descriptor rejects float32 underflow of runtime depth, texel and bias values', () => {
    const collapsedDepth = makeDescriptor();
    collapsedDepth.identity.encoding.minDepthMeters = 1;
    collapsedDepth.identity.encoding.maxDepthMeters = 1 + 1e-8;
    assert.throws(
        () => validateStaticSunDepthTileSetDescriptor(collapsedDepth),
        /depth range.*float32/
    );

    const texelUnderflow = makeDescriptor();
    texelUnderflow.identity.layout.texelSizeMeters = 1e-300;
    assert.throws(
        () => validateStaticSunDepthTileSetDescriptor(texelUnderflow),
        /texelSizeMeters.*positive in float32/
    );

    const constantBiasUnderflow = makeDescriptor();
    constantBiasUnderflow.identity.sampling.bias.constantMeters = 1e-300;
    assert.throws(
        () => validateStaticSunDepthTileSetDescriptor(constantBiasUnderflow),
        /constantMeters.*underflow.*float32/
    );

    const normalBiasUnderflow = makeDescriptor();
    normalBiasUnderflow.identity.sampling.bias.normalOffsetScaleMeters = 1e-300;
    assert.throws(
        () => validateStaticSunDepthTileSetDescriptor(normalBiasUnderflow),
        /normalOffsetScaleMeters.*underflow.*float32/
    );
});

test('RG8 depth encoding reserves only 65535 for empty and is host-endian independent', () => {
    const encoding = makeDescriptor().identity.encoding;
    assert.equal(encodeStaticSunDepthMeters(0, encoding), 0);
    assert.equal(encodeStaticSunDepthMeters(10, encoding), STATIC_SUN_DEPTH_MAX_QUANTIZED);
    const quantized = encodeStaticSunDepthMeters(3.25, encoding);
    assert.ok(quantized >= 0 && quantized <= 65534);
    assert.ok(Math.abs(decodeStaticSunDepthMeters(quantized, encoding) - 3.25) <= 10 / 65534 / 2);
    assert.equal(decodeStaticSunDepthMeters(STATIC_SUN_DEPTH_EMPTY_QUANTIZED, encoding), null);

    const bytes = packStaticSunDepthQuantizedRg8(0x1234);
    assert.deepEqual([...bytes], [0x12, 0x34]);
    assert.equal(unpackStaticSunDepthQuantizedRg8(bytes), 0x1234);
    assert.deepEqual([...packStaticSunDepthQuantizedRg8(STATIC_SUN_DEPTH_EMPTY_QUANTIZED)], [255, 255]);
    assert.throws(() => encodeStaticSunDepthMeters(-0.01, encoding), /outside/);
    assert.throws(() => encodeStaticSunDepthMeters(10.01, encoding), /outside/);
    assert.throws(() => packStaticSunDepthQuantizedRg8(65536), /0 through 65535/);
});

test('half-open tile lookup assigns shared edges exactly once and rejects global maxima', () => {
    const descriptor = validateStaticSunDepthTileSetDescriptor(makeDescriptor());
    assert.deepEqual(lookupStaticSunDepthTile(descriptor, 0, 0)?.tileCoordinates, [0, 0]);
    assert.deepEqual(lookupStaticSunDepthTile(descriptor, 1.999999, 1)?.tileCoordinates, [0, 0]);
    assert.deepEqual(lookupStaticSunDepthTile(descriptor, 2, 1)?.tileCoordinates, [1, 0]);
    assert.deepEqual(lookupStaticSunDepthTile(descriptor, 1, 2)?.tileCoordinates, [0, 1]);
    assert.equal(lookupStaticSunDepthTile(descriptor, 4, 1), null);
    assert.equal(lookupStaticSunDepthTile(descriptor, 1, 4), null);
    assert.equal(lookupStaticSunDepthTile(descriptor, -Number.EPSILON, 0), null);
});

test('active-set gate requires exact identity, all tiles and consistent guard overlap', () => {
    const descriptor = validateStaticSunDepthTileSetDescriptor(makeDescriptor());
    const grid = constantGrid(encodeStaticSunDepthMeters(3, descriptor.identity.encoding));
    const resources = makeResources(descriptor, grid);

    const incomplete = createStaticSunDepthResidency(
        descriptor,
        resources.slice(0, -1),
        {expectedIdentity: descriptor.identity}
    );
    assert.equal(incomplete.status, 'incomplete');
    assert.equal(incomplete.active, false);
    assert.equal(incomplete.complete, false);
    assert.deepEqual(incomplete.missingTileIds, ['tile-1-1']);
    const incompleteSample = sampleStaticSunDepthWorld(
        incomplete,
        worldFromLight(descriptor, 1.5, 1.5, 2),
        descriptor.identity.sunPointDirectionWorld
    );
    assert.equal(incompleteSample.status, 'unresident');
    assert.equal(incompleteSample.visibility, 0);
    assert.equal(incompleteSample.failClosed, true);

    const unverified = createStaticSunDepthResidency(descriptor, resources);
    assert.equal(unverified.status, 'identity_unverified');
    assert.equal(unverified.active, false);
    assert.throws(
        () => createStaticSunDepthActiveSet(descriptor, resources),
        /identity_unverified/
    );

    const wrongIdentity = clone(descriptor.identity);
    wrongIdentity.cityId = 'another-city';
    const mismatched = createStaticSunDepthResidency(
        descriptor,
        resources,
        {expectedIdentity: wrongIdentity}
    );
    assert.equal(mismatched.status, 'identity_mismatch');
    assert.equal(mismatched.active, false);

    const badGuardResources = makeResources(descriptor, grid);
    const rightTile = /** @type {Uint8Array} */ (badGuardResources[1].bytes);
    packStaticSunDepthQuantizedRg8(STATIC_SUN_DEPTH_EMPTY_QUANTIZED, rightTile, (1 * 4 + 0) * 2);
    assert.throws(
        () => createStaticSunDepthActiveSet(
            descriptor,
            badGuardResources,
            {expectedIdentity: descriptor.identity}
        ),
        /guard does not match owning tile/
    );

    const badExteriorResources = makeResources(descriptor, grid);
    packStaticSunDepthQuantizedRg8(STATIC_SUN_DEPTH_EMPTY_QUANTIZED, /** @type {Uint8Array} */ (badExteriorResources[0].bytes), 0);
    assert.throws(
        () => createStaticSunDepthActiveSet(
            descriptor,
            badExteriorResources,
            {expectedIdentity: descriptor.identity}
        ),
        /guard does not match owning tile/
    );
});

test('CPU sampler performs guard-aware 3x3 PCF and returns explicit debug fields', () => {
    const descriptor = validateStaticSunDepthTileSetDescriptor(makeDescriptor());
    const casterDepth = encodeStaticSunDepthMeters(3, descriptor.identity.encoding);
    const grid = constantGrid(casterDepth);
    grid[0][0] = STATIC_SUN_DEPTH_EMPTY_QUANTIZED;
    const resources = makeResources(descriptor, grid);
    const activeSet = createStaticSunDepthActiveSet(
        descriptor,
        resources,
        {expectedIdentity: descriptor.identity}
    );
    const position = worldFromLight(descriptor, 1.5, 1.5, 4);
    const result = sampleStaticSunDepthWorld(
        activeSet,
        position,
        descriptor.identity.sunPointDirectionWorld
    );

    assert.equal(result.status, 'sampled');
    assert.equal(result.failClosed, false);
    assert.equal(result.tileId, 'tile-0-0');
    assert.deepEqual(result.tileCoordinates, [0, 0]);
    assert.deepEqual(result.interiorTexel, [1, 1]);
    assert.deepEqual(result.centerStoredTexel, [2, 2]);
    assert.equal(result.pcfRadiusTexels, 1);
    assert.equal(result.pcfKernelWidthTexels, 3);
    assert.equal(result.tapCount, 9);
    assert.equal(result.residentTapCount, 9);
    assert.equal(result.emptyTapCount, 1);
    assert.equal(result.outOfBoundsTapCount, 0);
    assert.equal(result.visibleTapCount, 1);
    assert.equal(result.occludedTapCount, 8);
    assert.equal(result.visibility, 1 / 9);
    assert.equal(result.centerQuantizedDepth, casterDepth);
    assert.ok(Math.abs(result.centerDecodedDepthMeters - 3) < 0.001);
    assert.ok(Object.isFrozen(result));

    const visible = sampleStaticSunDepthWorld(
        activeSet,
        worldFromLight(descriptor, 2, 1.5, 2),
        descriptor.identity.sunPointDirectionWorld
    );
    assert.equal(visible.status, 'sampled');
    assert.equal(visible.visibility, 1);
    assert.equal(visible.fullyVisible, true);

    const edge = sampleStaticSunDepthWorld(
        activeSet,
        worldFromLight(descriptor, 0.5, 0.5, 2),
        descriptor.identity.sunPointDirectionWorld
    );
    assert.equal(edge.outOfBoundsTapCount, 5);
    assert.equal(edge.residentTapCount, 4);
    assert.equal(edge.occludedTapCount, 5);
    assert.equal(edge.visibility, 4 / 9);
});

test('RG8 comparisons use a bounded conservative caster-depth margin', () => {
    const raw = makeDescriptor();
    raw.identity.sampling.pcf.radiusTexels = 0;
    const descriptor = validateStaticSunDepthTileSetDescriptor(raw);
    const quantized = 32767;
    const decoded = decodeStaticSunDepthMeters(quantized, descriptor.identity.encoding);
    const halfStep = 5 / STATIC_SUN_DEPTH_MAX_QUANTIZED;
    const activeSet = createStaticSunDepthActiveSet(
        descriptor,
        makeResources(descriptor, constantGrid(quantized)),
        {expectedIdentity: descriptor.identity}
    );
    const result = sampleStaticSunDepthWorld(
        activeSet,
        worldFromLight(descriptor, 1.5, 1.5, decoded - halfStep * 0.5),
        descriptor.identity.sunPointDirectionWorld
    );
    assert.equal(result.visibility, 0);
    assert.equal(result.centerDecodedDepthMeters, decoded);
});

test('normal-offset bias matches constant + scale * (1 - dot(normal, sun))', () => {
    const raw = makeDescriptor();
    raw.identity.sampling.bias.constantMeters = 0.1;
    raw.identity.sampling.bias.normalOffsetScaleMeters = 0.2;
    const descriptor = validateStaticSunDepthTileSetDescriptor(raw);
    const grid = constantGrid(encodeStaticSunDepthMeters(3, descriptor.identity.encoding));
    const activeSet = createStaticSunDepthActiveSet(
        descriptor,
        makeResources(descriptor, grid),
        {expectedIdentity: descriptor.identity}
    );
    const position = worldFromLight(descriptor, 1.5, 1.5, 3.3);
    const towardSun = sampleStaticSunDepthWorld(
        activeSet,
        position,
        descriptor.identity.sunPointDirectionWorld
    );
    const awayFromSun = sampleStaticSunDepthWorld(
        activeSet,
        position,
        descriptor.identity.sunPointDirectionWorld.map((value) => -value)
    );

    assert.equal(towardSun.normalSunDot, 1);
    assert.equal(towardSun.appliedBiasMeters, 0.1);
    assert.equal(towardSun.visibility, 0);
    assert.equal(awayFromSun.normalSunDot, -1);
    assert.equal(awayFromSun.appliedBiasMeters, 0.5);
    assert.equal(awayFromSun.visibility, 1);
});

test('geometric bias shifts receiver light XY and depth before constant relief', () => {
    const raw = makeDescriptor();
    raw.identity.sampling.pcf.radiusTexels = 0;
    raw.identity.sampling.bias = {
        model: 'geometric-normal-offset-plus-constant-depth-relief-v1',
        constantDepthReliefMeters: 0.0697915,
        geometricNormalOffsetMeters: 0.25
    };
    const descriptor = validateStaticSunDepthTileSetDescriptor(raw);
    const grid = constantGrid(encodeStaticSunDepthMeters(3, descriptor.identity.encoding));
    const activeSet = createStaticSunDepthActiveSet(
        descriptor,
        makeResources(descriptor, grid),
        {expectedIdentity: descriptor.identity}
    );
    const right = descriptor.identity.basis.rightAxisWorld;
    const sun = descriptor.identity.sunPointDirectionWorld;
    const inverseRootTwo = 1 / Math.sqrt(2);
    const normal = right.map((value, index) => (
        (value + sun[index]) * inverseRootTwo
    ));
    const position = worldFromLight(descriptor, 1.9, 1.5, 3.1);
    const result = sampleStaticSunDepthWorld(activeSet, position, normal);

    assert.equal(result.status, 'sampled');
    assert.equal(result.biasModel, raw.identity.sampling.bias.model);
    assert.equal(result.constantBiasMeters, null);
    assert.equal(result.normalOffsetScaleMeters, null);
    assert.equal(result.constantDepthReliefMeters, 0.0697915);
    assert.equal(result.geometricNormalOffsetMeters, 0.25);
    assert.ok(Math.abs(result.lightPosition[0] - (1.9 + 0.25 * inverseRootTwo)) < 1e-12);
    assert.ok(Math.abs(result.lightPosition[1] - 1.5) < 1e-12);
    assert.ok(Math.abs(result.lightPosition[2] - (3.1 - 0.25 * inverseRootTwo)) < 1e-12);
    assert.deepEqual(result.tileCoordinates, [1, 0]);
    assert.equal(result.appliedBiasMeters, 0.0697915);
    assert.ok(Math.abs(
        result.effectiveDepthReliefMeters
            - (0.0697915 + 0.25 * inverseRootTwo)
    ) < 1e-12);
    for (let index = 0; index < 3; index++) {
        assert.ok(Math.abs(
            result.biasedWorldPosition[index] - position[index] - normal[index] * 0.25
        ) < 1e-12);
    }

    const mixedFields = makeDescriptor();
    mixedFields.identity.sampling.bias = {
        ...raw.identity.sampling.bias,
        constantMeters: 0.1
    };
    assert.throws(
        () => validateStaticSunDepthTileSetDescriptor(mixedFields),
        /must contain exactly/
    );
});

test('geometric bias range uses one world-normal offset, not the legacy two-sided scale', () => {
    const geometric = makeDescriptor();
    geometric.identity.sampling.bias = {
        model: 'geometric-normal-offset-plus-constant-depth-relief-v1',
        constantDepthReliefMeters: 1,
        geometricNormalOffsetMeters: 5
    };
    assert.doesNotThrow(() => validateStaticSunDepthTileSetDescriptor(geometric));

    const legacy = makeDescriptor();
    legacy.identity.sampling.bias = {
        model: 'constant-plus-normal-offset-v1',
        constantMeters: 1,
        normalOffsetScaleMeters: 5
    };
    assert.throws(
        () => validateStaticSunDepthTileSetDescriptor(legacy),
        /maximum exceeds the encoding range/
    );
});

test('Three r183 Vogel filter requires screen context and emulates linear compare taps', () => {
    const raw = makeDescriptor();
    raw.identity.sampling.bias = {
        model: 'geometric-normal-offset-plus-constant-depth-relief-v1',
        constantDepthReliefMeters: 0.0697915,
        geometricNormalOffsetMeters: 0.0232
    };
    const sourceAxes = createThreeR183DirectionalShadowFilterAxes(
        raw.identity.sunPointDirectionWorld
    );
    raw.identity.sampling.pcf = {
        model: 'three-r183-vogel-5-linear-compare-v1',
        radiusTexels: 1.5,
        sampleCount: 5,
        screenRotation: 'interleaved-gradient-noise-gl-fragcoord-v1',
        hardwareComparison: 'linear-four-compare-taps-v1',
        shadowMapSizeTexels: [16, 16],
        shadowMapWorldExtentMeters: [16, 16],
        sourceMapRightAxisWorld: sourceAxes.rightAxisWorld,
        sourceMapUpAxisWorld: sourceAxes.upAxisWorld
    };
    const descriptor = validateStaticSunDepthTileSetDescriptor(raw);
    const occupied = encodeStaticSunDepthMeters(3, descriptor.identity.encoding);
    const grid = constantGrid(occupied);
    for (let y = 0; y < grid.length; y++) {
        for (let x = 2; x < grid[y].length; x++) {
            grid[y][x] = STATIC_SUN_DEPTH_EMPTY_QUANTIZED;
        }
    }
    const activeSet = createStaticSunDepthActiveSet(
        descriptor,
        makeResources(descriptor, grid),
        {expectedIdentity: descriptor.identity}
    );
    const position = worldFromLight(descriptor, 2, 1.75, 4);
    const missingContext = sampleStaticSunDepthWorld(
        activeSet,
        position,
        descriptor.identity.sunPointDirectionWorld
    );
    assert.equal(missingContext.status, 'invalid_sampling_context');
    assert.equal(missingContext.failClosed, true);
    assert.equal(missingContext.visibility, 0);

    const first = sampleStaticSunDepthWorld(
        activeSet,
        position,
        descriptor.identity.sunPointDirectionWorld,
        {fragmentCoordinatePixels: [10.5, 20.5]}
    );
    const rotated = sampleStaticSunDepthWorld(
        activeSet,
        position,
        descriptor.identity.sunPointDirectionWorld,
        {fragmentCoordinatePixels: [11.5, 20.5]}
    );
    assert.equal(first.status, 'sampled');
    assert.equal(first.pcfModel, raw.identity.sampling.pcf.model);
    assert.equal(first.filterSampleCount, 5);
    assert.equal(first.comparisonTapCount, 20);
    assert.equal(first.tapCount, 20);
    assert.equal(first.hardwareComparison, 'linear-four-compare-taps-v1');
    assert.equal(first.filterWorldRadiusMeters, 1.5);
    assert.deepEqual(first.fragmentCoordinatePixels, [10.5, 20.5]);
    assert.ok(first.visibility > 0 && first.visibility < 1);
    assert.notEqual(first.visibility, rotated.visibility);
    assert.ok(Math.abs(first.visibility - first.weightedVisibleSampleSum / 5) < 1e-12);

    const wrongAxes = makeDescriptor();
    wrongAxes.identity.sampling.pcf = {
        ...raw.identity.sampling.pcf,
        sourceMapRightAxisWorld: raw.identity.sampling.pcf.sourceMapUpAxisWorld
    };
    assert.throws(
        () => validateStaticSunDepthTileSetDescriptor(wrongAxes),
        /source-map axes do not match Three r183/
    );
});

test('3x2 row-major exact filter fetches adjacent layers across X and Y boundaries', () => {
    const descriptor = validateStaticSunDepthTileSetDescriptor(makeThreeByTwoDescriptor());
    assert.deepEqual(descriptor.tiles.map((tile) => tile.coordinates), [
        [0, 0], [1, 0], [2, 0],
        [0, 1], [1, 1], [2, 1]
    ]);
    assert.deepEqual(lookupStaticSunDepthTile(descriptor, 11.999, 7.999)?.tileCoordinates, [2, 1]);
    assert.equal(lookupStaticSunDepthTile(descriptor, 12, 7.999), null);
    const occupied = encodeStaticSunDepthMeters(3, descriptor.identity.encoding);
    const sampleGrid = (grid, lightX, lightY) => {
        const activeSet = createStaticSunDepthActiveSet(
            descriptor,
            makeResources(descriptor, grid),
            {expectedIdentity: descriptor.identity}
        );
        return sampleStaticSunDepthWorld(
            activeSet,
            worldFromLight(descriptor, lightX, lightY, 4),
            descriptor.identity.sunPointDirectionWorld,
            {fragmentCoordinatePixels: [10.5, 20.5]}
        );
    };
    const xBoundaryGrid = Array.from({length: 8}, () => (
        Array.from({length: 12}, (_, x) => (
            x >= 8 ? STATIC_SUN_DEPTH_EMPTY_QUANTIZED : occupied
        ))
    ));
    const xBoundary = sampleGrid(xBoundaryGrid, 7.9, 2);
    assert.deepEqual(xBoundary.tileCoordinates, [1, 0]);
    assert.equal(xBoundary.comparisonTapCount, 20);
    assert.equal(xBoundary.outOfBoundsTapCount, 0);
    assert.ok(xBoundary.visibility > 0 && xBoundary.visibility < 1);

    const yBoundaryGrid = Array.from({length: 8}, (_, y) => (
        Array(12).fill(y >= 4 ? STATIC_SUN_DEPTH_EMPTY_QUANTIZED : occupied)
    ));
    const yBoundary = sampleGrid(yBoundaryGrid, 6, 3.9);
    assert.deepEqual(yBoundary.tileCoordinates, [1, 0]);
    assert.equal(yBoundary.comparisonTapCount, 20);
    assert.equal(yBoundary.outOfBoundsTapCount, 0);
    assert.ok(yBoundary.visibility > 0 && yBoundary.visibility < 1);
});

test('sampler snapshots caller bytes and fails closed for XY and depth out of bounds', () => {
    const descriptor = validateStaticSunDepthTileSetDescriptor(makeDescriptor());
    const grid = constantGrid(encodeStaticSunDepthMeters(3, descriptor.identity.encoding));
    const resources = makeResources(descriptor, grid);
    const activeSet = createStaticSunDepthActiveSet(
        descriptor,
        resources,
        {expectedIdentity: descriptor.identity}
    );
    for (const resource of resources) /** @type {Uint8Array} */ (resource.bytes).fill(255);

    const sampledSnapshot = sampleStaticSunDepthWorld(
        activeSet,
        worldFromLight(descriptor, 1.5, 1.5, 4),
        descriptor.identity.sunPointDirectionWorld
    );
    assert.equal(sampledSnapshot.visibility, 0);
    assert.equal(sampledSnapshot.centerQuantizedDepth, grid[1][1]);

    const xyOob = sampleStaticSunDepthWorld(
        activeSet,
        worldFromLight(descriptor, 4, 1, 2),
        descriptor.identity.sunPointDirectionWorld
    );
    assert.equal(xyOob.status, 'out_of_bounds');
    assert.equal(xyOob.visibility, 0);
    assert.equal(xyOob.failClosed, true);

    const depthOob = sampleStaticSunDepthWorld(
        activeSet,
        worldFromLight(descriptor, 1, 1, 10.001),
        descriptor.identity.sunPointDirectionWorld
    );
    assert.equal(depthOob.status, 'depth_out_of_bounds');
    assert.equal(depthOob.visibility, 0);
    assert.equal(depthOob.failClosed, true);
});

/** @returns {Record<string, any>} */
function makeDescriptor() {
    const sunPointDirectionWorld = /** @type {[number, number, number]} */ ([0, 0, -1]);
    const basis = createStableStaticSunDepthBasis(sunPointDirectionWorld);
    const tileCount = [2, 2];
    const interiorTexels = [2, 2];
    const guardTexels = 1;
    return {
        schema: 'static-sun-depth-tile-set-v1',
        identity: {
            channelId: 'static_sun_depth',
            channelVersion: 1,
            cityId: 'fixture-city',
            casterInventorySha256: HASH_A,
            channelSourceSha256: HASH_B,
            compilerSignatureSha256: HASH_C,
            sunPointDirectionWorld,
            basis: clone(basis),
            layout: {
                order: 'row-major-y-then-x-v1',
                lookup: 'half-open-min-inclusive-max-exclusive-v1',
                rowOrigin: 'min-light-y-v1',
                guardPolicy: 'copy-adjacent-clamp-exterior-v1',
                tileCount,
                interiorTexels,
                guardTexels,
                texelSizeMeters: 1,
                boundsLightMeters: {min: [0, 0], max: [4, 4]}
            },
            alpha: {
                model: 'evaluated-runtime-coverage-v1',
                coverage: 'opacity-times-vertex-alpha-times-map-a-times-alpha-map-g-v1',
                threshold: 'discard-when-coverage-lt-alpha-test-v1',
                sidedness: 'material-side-and-shadow-side-v1',
                forcedOpaque: 'shadow-as-opaque-v1',
                semanticsSha256: HASH_D
            },
            encoding: {
                id: 'rg8-packed-linear-depth-v1',
                quantization: 'linear-endpoints-inclusive-v1',
                redChannel: 'quantized-high-byte-v1',
                greenChannel: 'quantized-low-byte-v1',
                minDepthMeters: 0,
                maxDepthMeters: 10,
                maxQuantized: 65534,
                emptyQuantized: 65535
            },
            sampling: {
                comparison: 'receiver-depth-minus-bias-lte-caster-depth-v1',
                emptyPolicy: 'visible-v1',
                outOfBoundsPolicy: 'fail-closed-zero-visibility-v1',
                bias: {
                    model: 'constant-plus-normal-offset-v1',
                    constantMeters: 0,
                    normalOffsetScaleMeters: 0
                },
                pcf: {model: 'square-nearest-box-v1', radiusTexels: 1}
            }
        },
        tiles: Array.from({length: 4}, (_, index) => {
            const x = index % 2;
            const y = Math.floor(index / 2);
            return {
                id: 'tile-' + x + '-' + y,
                coordinates: [x, y],
                interiorBoundsLightMeters: {
                    min: [x * 2, y * 2],
                    max: [(x + 1) * 2, (y + 1) * 2]
                },
                storedTexels: [4, 4],
                contentSha256: TILE_HASHES[index]
            };
        })
    };
}

/** @returns {Record<string, any>} */
function makeThreeByTwoDescriptor() {
    const raw = makeDescriptor();
    const tileCount = [3, 2];
    const interiorTexels = [4, 4];
    raw.identity.layout.tileCount = tileCount;
    raw.identity.layout.interiorTexels = interiorTexels;
    raw.identity.layout.boundsLightMeters = {min: [0, 0], max: [12, 8]};
    raw.tiles = Array.from({length: 6}, (_, index) => {
        const x = index % tileCount[0];
        const y = Math.floor(index / tileCount[0]);
        return {
            id: 'tile-' + x + '-' + y,
            coordinates: [x, y],
            interiorBoundsLightMeters: {
                min: [x * interiorTexels[0], y * interiorTexels[1]],
                max: [(x + 1) * interiorTexels[0], (y + 1) * interiorTexels[1]]
            },
            storedTexels: [6, 6],
            contentSha256: String(index + 1).repeat(64)
        };
    });
    raw.identity.sampling.bias = {
        model: 'geometric-normal-offset-plus-constant-depth-relief-v1',
        constantDepthReliefMeters: 0.0697915,
        geometricNormalOffsetMeters: 0.0232
    };
    const sourceAxes = createThreeR183DirectionalShadowFilterAxes(
        raw.identity.sunPointDirectionWorld
    );
    raw.identity.sampling.pcf = {
        model: 'three-r183-vogel-5-linear-compare-v1',
        radiusTexels: 1.5,
        sampleCount: 5,
        screenRotation: 'interleaved-gradient-noise-gl-fragcoord-v1',
        hardwareComparison: 'linear-four-compare-taps-v1',
        shadowMapSizeTexels: [16, 16],
        shadowMapWorldExtentMeters: [16, 16],
        sourceMapRightAxisWorld: sourceAxes.rightAxisWorld,
        sourceMapUpAxisWorld: sourceAxes.upAxisWorld
    };
    return raw;
}

/**
 * @param {Readonly<import('../../../src/app/illumination/static_sun_depth/StaticSunDepthContract.js').StaticSunDepthTileSetDescriptor>} descriptor
 * @param {number[][]} grid
 */
function makeResources(descriptor, grid) {
    const layout = descriptor.identity.layout;
    const guard = layout.guardTexels;
    const interiorWidth = layout.interiorTexels[0];
    const interiorHeight = layout.interiorTexels[1];
    return descriptor.tiles.map((tile) => {
        const storedWidth = tile.storedTexels[0];
        const storedHeight = tile.storedTexels[1];
        const bytes = new Uint8Array(storedWidth * storedHeight * 2);
        for (let storedY = 0; storedY < storedHeight; storedY += 1) {
            for (let storedX = 0; storedX < storedWidth; storedX += 1) {
                const globalX = tile.coordinates[0] * interiorWidth + storedX - guard;
                const globalY = tile.coordinates[1] * interiorHeight + storedY - guard;
                const sourceX = Math.min(grid[0].length - 1, Math.max(0, globalX));
                const sourceY = Math.min(grid.length - 1, Math.max(0, globalY));
                const quantized = grid[sourceY][sourceX];
                packStaticSunDepthQuantizedRg8(
                    quantized,
                    bytes,
                    (storedY * storedWidth + storedX) * 2
                );
            }
        }
        return {
            tileId: tile.id,
            bytes,
            verifiedContentSha256: tile.contentSha256
        };
    });
}

/** @param {number} value */
function constantGrid(value) {
    return Array.from({length: 4}, () => Array(4).fill(value));
}

/**
 * @param {Readonly<import('../../../src/app/illumination/static_sun_depth/StaticSunDepthContract.js').StaticSunDepthTileSetDescriptor>} descriptor
 * @param {number} lightX
 * @param {number} lightY
 * @param {number} lightDepth
 * @returns {[number, number, number]}
 */
function worldFromLight(descriptor, lightX, lightY, lightDepth) {
    const basis = descriptor.identity.basis;
    return [
        basis.originWorld[0]
            + basis.rightAxisWorld[0] * lightX
            + basis.upAxisWorld[0] * lightY
            + basis.depthAxisWorld[0] * lightDepth,
        basis.originWorld[1]
            + basis.rightAxisWorld[1] * lightX
            + basis.upAxisWorld[1] * lightY
            + basis.depthAxisWorld[1] * lightDepth,
        basis.originWorld[2]
            + basis.rightAxisWorld[2] * lightX
            + basis.upAxisWorld[2] * lightY
            + basis.depthAxisWorld[2] * lightDepth
    ];
}

/** @param {readonly number[]} left @param {readonly number[]} right */
function dot(left, right) {
    return left[0] * right[0] + left[1] * right[1] + left[2] * right[2];
}

/** @param {readonly number[]} left @param {readonly number[]} right */
function cross(left, right) {
    return [
        left[1] * right[2] - left[2] * right[1],
        left[2] * right[0] - left[0] * right[2],
        left[0] * right[1] - left[1] * right[0]
    ];
}

/** @template T @param {T} value @returns {T} */
function clone(value) {
    return JSON.parse(JSON.stringify(value));
}
