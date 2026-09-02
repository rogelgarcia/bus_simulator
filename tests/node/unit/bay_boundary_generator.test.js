// AI 541: BF2 silhouette integration for rounded bay-boundary paths.
import assert from 'node:assert/strict';
import test from 'node:test';

let __testOnly = null;
try {
    ({ __testOnly } = await import('../../../src/graphics/assets3d/generators/building_fabrication/BuildingFabricationGenerator.js'));
} catch (error) {
    if (error?.code !== 'ERR_MODULE_NOT_FOUND' || !String(error?.message).includes("package 'three'")) throw error;
}

const generatorTest = __testOnly ? test : test.skip;

const RECT = [[
    { x: -6, y: 0, z: 4 },
    { x: 6, y: 0, z: 4 },
    { x: 6, y: 0, z: -4 },
    { x: -6, y: 0, z: -4 }
]];

const bay = (id, widthFrac, left, right) => ({
    id,
    sourceBayId: id,
    type: 'bay',
    widthFrac,
    depth: { left, right, linked: left === right }
});

const rounded = (endpoints, transition = {}) => ({
    connections: [{
        id: 'round_1',
        type: 'rounded',
        endpoints,
        transition: {
            mode: 'authored',
            leftRunoutMeters: 1.1,
            rightRunoutMeters: 0.8,
            runoutsLinked: false,
            meeting: 0.4,
            ...transition
        }
    }]
});

generatorTest('BuildingFabricationGenerator AI 541: absence remains byte-identical to explicit null', () => {
    const facades = { A: { layout: { items: [bay('left', 0.5, 0.7, 0.7), bay('right', 0.5, -0.35, -0.35)] } } };
    const implicit = __testOnly.computeQuadFacadeSilhouette({ wallOuter: RECT, facades, layerMaterial: null, warnings: [] });
    const explicit = __testOnly.computeQuadFacadeSilhouette({
        wallOuter: RECT,
        facades,
        layerMaterial: null,
        bayBoundaryConnections: null,
        warnings: []
    });
    assert.deepEqual(explicit, implicit);
    assert.equal(explicit.boundaryTransitions.length, 0);
});

generatorTest('BuildingFabricationGenerator AI 541: same-face depth step becomes one sampled tangent path', () => {
    const warnings = [];
    const result = __testOnly.computeQuadFacadeSilhouette({
        wallOuter: RECT,
        facades: { A: { layout: { items: [bay('left', 0.5, 0.7, 0.7), bay('right', 0.5, -0.35, -0.35)] } } },
        layerMaterial: null,
        bayBoundaryConnections: rounded([
            { faceId: 'A', bayId: 'left', edge: 'end' },
            { faceId: 'A', bayId: 'right', edge: 'start' }
        ]),
        warnings
    });
    assert.ok(result);
    assert.deepEqual(warnings, []);
    assert.equal(result.boundaryTransitions.length, 1);
    const transition = result.boundaryTransitions[0];
    assert.ok(transition.samples.length > 3);
    assert.equal(transition.startEndpoint.strip.frontU1, transition.startStation.u);
    assert.equal(transition.endEndpoint.strip.frontU0, transition.endStation.u);
    assert.ok(transition.segments.some((segment) => segment.ownerBayId === 'left'));
    assert.ok(transition.segments.some((segment) => segment.ownerBayId === 'right'));
    assert.ok(result.loopDetail.some((point) => point.boundaryTransitionId === transition.id));
    const geometry = __testOnly.buildWallSidesGeometryFromLoopDetailXZ(result.loopDetail, { height: 3 });
    assert.ok(geometry?.getAttribute('normal')?.count > 0);
    geometry.dispose();
});

generatorTest('BuildingFabricationGenerator AI 541: opening pose follows a depth-sloped bay front', () => {
    const frames = __testOnly.computeFacadeFramesFromLoop(RECT[0], { warnings: [] });
    const result = __testOnly.computeQuadFacadeSilhouette({
        wallOuter: RECT,
        facades: { A: { layout: { items: [bay('wedge', 1, -0.6, 0.55)] } } },
        layerMaterial: null,
        warnings: []
    });
    const strip = result.strips.find((entry) => entry.id === 'wedge');
    const u = (strip.frontU0 + strip.frontU1) * 0.5;
    const pose = __testOnly.resolveFacadeStripOpeningPose(frames.A, strip, u);
    const base = __testOnly.sampleFacadeFrameAtU(frames.A, u);
    assert.ok(pose);
    assert.ok(Math.abs(pose.tx * pose.nx + pose.tz * pose.nz) < 1e-8);
    assert.ok(Math.hypot(pose.nx - base.n.x, pose.nz - base.n.z) > 0.05);
    const expected = __testOnly.pointOnFacadeFrame({ frame: frames.A, u, depth: pose.depth });
    assert.ok(Math.hypot(pose.x - expected.x, pose.z - expected.z) < 1e-8);
});

generatorTest('BuildingFabricationGenerator AI 541: boundary depth link owns both authored endpoints independently of bay linking', () => {
    const result = __testOnly.computeQuadFacadeSilhouette({
        wallOuter: RECT,
        facades: { A: { layout: { items: [bay('left', 0.5, 0.8, 1.1), bay('right', 0.5, -0.4, -0.2)] } } },
        layerMaterial: null,
        bayBoundaryConnections: {
            connections: [{
                id: 'linked_depth',
                type: 'sharp',
                endpoints: [
                    { faceId: 'A', bayId: 'left', edge: 'end' },
                    { faceId: 'A', bayId: 'right', edge: 'start' }
                ],
                depthLink: { enabled: true, valueMeters: 0.25 }
            }]
        },
        warnings: []
    });
    const [left, right] = result.strips.filter((strip) => strip.faceId === 'A');
    assert.equal(left.depth1, 0.25);
    assert.equal(right.depth0, 0.25);
    assert.equal(result.boundaryTransitions.length, 0);
});

generatorTest('BuildingFabricationGenerator AI 541: rounded physical corner replaces the sharp corner without a semantic face', () => {
    const frames = __testOnly.computeFacadeFramesFromLoop(RECT[0], { warnings: [] });
    const aEdge = frames.A.runForward === false ? 'start' : 'end';
    const bEdge = frames.B.runForward === false ? 'end' : 'start';
    const warnings = [];
    const result = __testOnly.computeQuadFacadeSilhouette({
        wallOuter: RECT,
        facades: {
            A: { layout: { items: [bay('front', 1, 0, 0)] } },
            B: { layout: { items: [bay('side', 1, 0, 0)] } }
        },
        layerMaterial: null,
        bayBoundaryConnections: rounded([
            { faceId: 'A', bayId: 'front', edge: aEdge },
            { faceId: 'B', bayId: 'side', edge: bEdge }
        ], { leftRunoutMeters: 1, rightRunoutMeters: 1, meeting: 0.5 }),
        warnings
    });
    assert.ok(result);
    assert.deepEqual(warnings, []);
    assert.equal(result.boundaryTransitions.length, 1);
    assert.equal(result.boundaryTransitions[0].cornerId, 'AB');
    assert.ok(result.loopDetail.filter((point) => point.kind === 'boundary_transition').length >= 2);
    assert.ok(result.loop.every((point) => point.faceId !== 'AB'));
});
