// AI 541: canonical bay-boundary relationships and deterministic transition paths.
// @ts-check

import assert from 'node:assert/strict';
import test from 'node:test';

import {
    bayBoundaryEndpointKey,
    normalizeBayBoundaryConnectionsConfig,
    resolveBayBoundaryConnections,
    validateBayBoundaryConnectionsConfig
} from '../../../src/app/buildings/BayBoundaryConnectionsModel.js';
import { solveBayBoundaryTransitionPath } from '../../../src/app/buildings/BayBoundaryTransitionPath.js';

const ROUNDED = {
    connections: [{
        id: ' front_step ',
        type: 'ROUNDED',
        endpoints: [
            { faceId: 'a', bayId: ' left ', edge: 'END' },
            { faceId: 'a', bayId: 'right', edge: 'start' }
        ],
        depthLink: { enabled: true, valueMeters: 0.75 },
        transition: {
            mode: 'AUTHORED',
            leftRunoutMeters: 1.2,
            rightRunoutMeters: 0.8,
            runoutsLinked: false,
            meeting: 0.35
        }
    }]
};

test('BayBoundaryConnectionsModel: absent relationships preserve legacy sharp output', () => {
    assert.equal(normalizeBayBoundaryConnectionsConfig(null), null);
    assert.equal(normalizeBayBoundaryConnectionsConfig({}), null);
    assert.equal(normalizeBayBoundaryConnectionsConfig({ connections: [] }), null);
});

test('BayBoundaryConnectionsModel: normalization emits the canonical schema and is idempotent', () => {
    const normalized = normalizeBayBoundaryConnectionsConfig(ROUNDED);
    assert.deepEqual(normalized, {
        connections: [{
            id: 'front_step',
            type: 'rounded',
            endpoints: [
                { faceId: 'A', bayId: 'left', edge: 'end' },
                { faceId: 'A', bayId: 'right', edge: 'start' }
            ],
            depthLink: { enabled: true, valueMeters: 0.75 },
            transition: {
                mode: 'authored',
                leftRunoutMeters: 1.2,
                rightRunoutMeters: 0.8,
                runoutsLinked: false,
                meeting: 0.35
            }
        }]
    });
    assert.deepEqual(normalizeBayBoundaryConnectionsConfig(normalized), normalized);
});

test('BayBoundaryConnectionsModel: endpoint identity is stable and collision-safe', () => {
    assert.equal(
        bayBoundaryEndpointKey({ faceId: 'b', bayId: ' bay:1 ', edge: 'START' }),
        '["B","bay:1","start"]'
    );
    assert.equal(bayBoundaryEndpointKey({ faceId: 'AA', bayId: 'bay', edge: 'start' }), null);
});

test('BayBoundaryConnectionsModel: validation rejects competing endpoint owners and malformed transitions', () => {
    const result = validateBayBoundaryConnectionsConfig({
        connections: [
            {
                id: 'one',
                type: 'rounded',
                endpoints: [
                    { faceId: 'A', bayId: 'left', edge: 'end' },
                    { faceId: 'A', bayId: 'right', edge: 'start' }
                ],
                depthLink: { enabled: true, valueMeters: 'not-a-number' },
                transition: { mode: 'authored', leftRunoutMeters: 0, rightRunoutMeters: 'bad', meeting: 2 }
            },
            {
                id: 'two',
                type: 'sharp',
                endpoints: [
                    { faceId: 'A', bayId: 'left', edge: 'end' },
                    { faceId: 'B', bayId: '', edge: 'middle' }
                ]
            }
        ]
    });
    assert.equal(result.valid, false);
    const codes = new Set(result.diagnostics.map((entry) => entry.code));
    assert.ok(codes.has('bay_boundary_runout_invalid'));
    assert.ok(codes.has('bay_boundary_meeting_invalid'));
    assert.ok(codes.has('bay_boundary_depth_link_value_invalid'));
    assert.ok(codes.has('bay_boundary_bay_id_missing'));
    assert.ok(codes.has('bay_boundary_edge_invalid'));
});

test('BayBoundaryConnectionsModel: repeated source bays resolve by physical adjacency, not array position', () => {
    const strip = (sourceBayId, id, u0, u1) => ({ faceId: 'A', sourceBayId, id, u0, u1, frontU0: u0, frontU1: u1 });
    const result = resolveBayBoundaryConnections({
        connections: ROUNDED,
        stripsByFaceId: {
            A: [
                strip('left', 'left_1', 0, 2), strip('right', 'right_1', 2, 4),
                strip('left', 'left_2', 4, 6), strip('right', 'right_2', 6, 8)
            ]
        },
        faceOrder: ['A']
    });
    assert.equal(result.valid, true);
    assert.deepEqual(
        result.connections[0].instances.map((instance) => instance.endpoints.map((endpoint) => endpoint.strip.id)),
        [['left_1', 'right_1'], ['left_2', 'right_2']]
    );
});

test('BayBoundaryTransitionPath: endpoints, tangents, normals and samples are deterministic', () => {
    const input = {
        id: 'curve',
        p0: { x: -1, z: 0 },
        p1: { x: 0, z: 1 },
        tangent0: { x: 1, z: 0 },
        tangent1: { x: 0, z: 1 },
        outward0: { x: 0, z: -1 },
        outward1: { x: 1, z: 0 },
        leftRunoutMeters: 1,
        rightRunoutMeters: 1,
        meeting: 0.5,
        maxChordErrorMeters: 0.01
    };
    const a = solveBayBoundaryTransitionPath(input);
    const b = solveBayBoundaryTransitionPath(input);
    assert.equal(a.valid, true);
    assert.deepEqual(a, b);
    assert.deepEqual(a.samples[0].position, { x: -1, z: 0 });
    assert.deepEqual(a.samples.at(-1).position, { x: 0, z: 1 });
    assert.ok(a.samples.length > 3);
    assert.ok(a.lengthMeters > Math.SQRT2);
    assert.ok(a.samples.every((sample, index) => index === 0 || sample.sMeters > a.samples[index - 1].sMeters));
    assert.ok(a.samples.every((sample) => Math.abs(Math.hypot(sample.tangent.x, sample.tangent.z) - 1) < 1e-8));
    assert.ok(a.samples.every((sample) => Math.abs(Math.hypot(sample.normal.x, sample.normal.z) - 1) < 1e-8));
});

test('BayBoundaryTransitionPath: meeting bias changes shape without losing endpoint tangency', () => {
    const base = {
        id: 'biased',
        p0: { x: -2, z: 0 },
        p1: { x: 0, z: 2 },
        tangent0: { x: 1, z: 0 },
        tangent1: { x: 0, z: 1 },
        leftRunoutMeters: 2,
        rightRunoutMeters: 2
    };
    const left = solveBayBoundaryTransitionPath({ ...base, meeting: 0.25 });
    const right = solveBayBoundaryTransitionPath({ ...base, meeting: 0.75 });
    assert.equal(left.valid, true);
    assert.equal(right.valid, true);
    assert.notDeepEqual(left.controls, right.controls);
    assert.ok(left.samples[0].tangent.x > 0.999999);
    assert.ok(right.samples.at(-1).tangent.z > 0.999999);
});

test('BayBoundaryTransitionPath: invalid frames, collapsed spans, and reversed endpoint tangents are blocked', () => {
    const base = {
        id: 'invalid',
        p0: { x: 0, z: 0 },
        p1: { x: 2, z: 0 },
        tangent0: { x: 1, z: 0 },
        tangent1: { x: 1, z: 0 },
        leftRunoutMeters: 1,
        rightRunoutMeters: 1
    };
    assert.equal(
        solveBayBoundaryTransitionPath({ ...base, tangent0: { x: 0, z: 0 } }).diagnostics[0].code,
        'bay_boundary_frame_invalid'
    );
    assert.equal(
        solveBayBoundaryTransitionPath({ ...base, p1: { x: 0, z: 0 } }).diagnostics[0].code,
        'bay_boundary_span_collapsed'
    );
    assert.equal(
        solveBayBoundaryTransitionPath({ ...base, tangent0: { x: -1, z: 0 } }).diagnostics[0].code,
        'bay_boundary_tangent_reversed'
    );
});
