// Node unit tests: mesh fabrication render-pass + picking layer contracts (Section 19).
import test from 'node:test';
import assert from 'node:assert/strict';
import {
    createGizmosRenderPass,
    createHighlightsRenderPass,
    createMeshFabricationPassScheduler,
    createRulersRenderPass,
    createSurfaceRenderPass,
    createVerticesRenderPass,
    createWireRenderPass
} from '../../../src/graphics/gui/mesh_fabrication/render_passes/index.js';
import {
    configureRaycasterThresholds,
    pickTileFromFrames,
    rankTopologyHits
} from '../../../src/graphics/gui/mesh_fabrication/picking/index.js';

test('RenderPassScheduler: executes registered passes in stable order', () => {
    const order = [];
    const scheduler = createMeshFabricationPassScheduler([
        { id: 'a', render: () => order.push('a') },
        { id: 'b', render: () => order.push('b') },
        { id: 'c', render: () => order.push('c') }
    ]);
    scheduler.render({});
    assert.deepEqual(order, ['a', 'b', 'c']);
});

test('Render passes: contract modules are callable with minimal context', () => {
    const calls = [];
    const context = {
        view: {
            _renderAxisGizmoInTile() {
                calls.push('gizmo');
            },
            _updateOrthoRulerMetricsForTile() {
                calls.push('ruler');
            }
        },
        renderer: {
            render() {
                calls.push('surface');
            }
        },
        scene: {},
        camera: {},
        tile: { kind: 'orthographic', viewType: 'left' },
        viewport: { x: 0, y: 0, w: 100, h: 80 }
    };

    createSurfaceRenderPass().render(context);
    createWireRenderPass().render(context);
    createVerticesRenderPass().render(context);
    createGizmosRenderPass().render(context);
    createRulersRenderPass().render(context);
    createHighlightsRenderPass().render(context);

    assert.deepEqual(calls, ['surface', 'gizmo', 'ruler']);
});

test('Picking: tile hit test uses frame extents', () => {
    const tile = pickTileFromFrames([
        { id: 'a', screenX: 0, screenY: 0, screenW: 100, screenH: 100 },
        { id: 'b', screenX: 101, screenY: 0, screenW: 100, screenH: 100 }
    ], 150, 50);
    assert.equal(tile?.id, 'b');
});

test('Picking: rankTopologyHits prefers vertex then edge then face by distance', () => {
    const hit = rankTopologyHits([
        { kind: 'face', id: 'f', distance: 0.2 },
        { kind: 'edge', id: 'e', distance: 0.4 },
        { kind: 'vertex', id: 'v', distance: 1.2 }
    ]);
    assert.equal(hit?.id, 'v');
});

test('Picking: raycaster threshold helper sets line and point thresholds', () => {
    const raycaster = { params: {} };
    configureRaycasterThresholds(raycaster, 0.01);
    assert.equal(typeof raycaster.params.Line.threshold, 'number');
    assert.equal(typeof raycaster.params.Points.threshold, 'number');
    assert.ok(raycaster.params.Line.threshold >= 0.0006);
    assert.ok(raycaster.params.Points.threshold >= 0.001);
});
