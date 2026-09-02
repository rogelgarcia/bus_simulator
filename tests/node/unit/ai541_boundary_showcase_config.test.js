import assert from 'node:assert/strict';
import test from 'node:test';
import {
    AI541_BOUNDARY_SHOWCASE_ROUNDED_CONFIG,
    AI541_BOUNDARY_SHOWCASE_SHARP_CONFIG
} from '../../../src/graphics/content3d/buildings/configs/Ai541BoundaryShowcase.js';

function comparable(config) {
    const clone = structuredClone(config);
    clone.id = 'matched';
    clone.name = 'Matched';
    for (const connection of clone.layers[0].bayBoundaryConnections.connections) {
        connection.type = 'matched';
    }
    return clone;
}

test('AI 541 showcase changes only boundary connection types between matched variants', () => {
    assert.deepEqual(
        comparable(AI541_BOUNDARY_SHOWCASE_SHARP_CONFIG),
        comparable(AI541_BOUNDARY_SHOWCASE_ROUNDED_CONFIG)
    );
    const sharp = AI541_BOUNDARY_SHOWCASE_SHARP_CONFIG.layers[0].bayBoundaryConnections.connections;
    const rounded = AI541_BOUNDARY_SHOWCASE_ROUNDED_CONFIG.layers[0].bayBoundaryConnections.connections;
    assert.ok(sharp.every((connection) => connection.type === 'sharp'));
    assert.ok(rounded.every((connection) => connection.type === 'rounded'));
});

test('AI 541 showcase covers the required local boundary cases', () => {
    const connections = AI541_BOUNDARY_SHOWCASE_ROUNDED_CONFIG
        .layers[0].bayBoundaryConnections.connections;
    assert.deepEqual(connections.map((entry) => entry.id), [
        'same_face_depth_step',
        'equal_depth_tangent_kink',
        'asymmetric_depth_step',
        'rounded_cross_face_corner'
    ]);
    assert.equal(connections[2].transition.mode, 'authored');
    assert.notEqual(
        connections[2].transition.leftRunoutMeters,
        connections[2].transition.rightRunoutMeters
    );
    assert.equal(connections[3].endpoints[0].faceId, 'A');
    assert.equal(connections[3].endpoints[1].faceId, 'B');
    assert.equal(connections[3].depthLink.enabled, true);
});
