// Focused tests for Building v2 silhouette target collection and decision materialization.
// @ts-check

import assert from 'node:assert/strict';
import test from 'node:test';

import {
    applySilhouetteRemapDecisions,
    createSilhouetteRemapReport,
    SILHOUETTE_REMAP_DECISION
} from '../../../src/app/buildings/silhouette_authoring/BuildingLayerSilhouetteModel.js';
import {
    collectBuildingSilhouetteRemapTargets,
    materializeBuildingSilhouetteTargetRemap
} from '../../../src/app/buildings/silhouette_authoring/BuildingSilhouetteTargetRemap.js';

function loop(runIds, reversed = []) {
    const points = [
        { x: -5, z: 3 },
        { x: 5, z: 3 },
        { x: 5, z: -3 },
        { x: -5, z: -3 }
    ];
    return points.map((point, index) => ({
        ...point,
        cornerId: `corner_${index + 1}`,
        runId: runIds[index],
        runForward: !reversed.includes(runIds[index])
    }));
}

function fixture() {
    return {
        layers: [
            {
                id: 'floor_1',
                type: 'floor',
                faceMaterials: {
                    B: { material: { kind: 'color', id: 'old_material' } },
                    C: { material: { kind: 'color', id: 'kept_material' } }
                },
                faceLinking: { links: { B: 'A' } }
            },
            { id: 'floor_2', type: 'floor' }
        ],
        facades: {
            floor_1: {
                B: { layout: { bays: { items: [{ id: 'left' }, { id: 'right' }] } } },
                C: { layout: { bays: { items: [{ id: 'destination_kept' }] } } }
            },
            floor_2: {
                B: { layout: { bays: { items: [{ id: 'other_floor' }] } } }
            }
        },
        wallDecorations: {
            sets: [
                {
                    id: 'set_floor_1',
                    target: { layerId: 'floor_1', bayRefs: ['B:left'], allBays: false },
                    decorations: [{ id: 'trim', span: { start: 0.1, end: 0.4 }, autoCorner: { resolvedBayRefs: ['B:left'] } }]
                },
                {
                    id: 'set_floor_2',
                    target: { layerId: 'floor_2', bayRefs: ['B:other_floor'], allBays: false },
                    decorations: []
                }
            ],
            lettering: [
                { id: 'sign_1', text: 'BANK', target: { layerId: 'floor_1', bayRef: 'B:left' } },
                { id: 'sign_2', text: 'KEEP', target: { layerId: 'floor_2', bayRef: 'B:other_floor' } }
            ]
        },
        attachments: {
            items: [
                { id: 'escape_1', type: 'fire_escape', target: { layerId: 'floor_1', faceId: 'B', bayId: 'left' } },
                { id: 'escape_2', type: 'fire_escape', target: { layerId: 'floor_2', faceId: 'B', bayId: 'other_floor' } },
                { id: 'ac_1', type: 'ac_unit', eligibility: { layerIds: ['floor_1'] } }
            ]
        },
        footprintStretch: {
            quantumMeters: 0.25,
            faces: { B: 'prefer_expand', C: 'never' },
            bands: { 'B:start': { preference: 'allow', weight: 2 }, 'C:end': 'never' }
        }
    };
}

test('BuildingSilhouetteTargetRemap: collects layer-scoped consumers and materializes distinct decisions', () => {
    const config = fixture();
    const frozen = JSON.stringify(config);
    const targets = collectBuildingSilhouetteRemapTargets(config, 'floor_1');

    assert.ok(targets.some((target) => target.targetId === 'facade:floor_1:B'));
    assert.ok(targets.some((target) => target.targetId === 'face_material:floor_1:B'));
    assert.ok(targets.some((target) => target.targetId === 'face_link:floor_1:B'));
    assert.ok(targets.some((target) => target.locator?.type === 'stretch_face' && target.runId === 'B'));
    assert.ok(targets.some((target) => target.locator?.type === 'stretch_band' && target.bandId === 'B:start'));
    assert.ok(targets.some((target) => target.kind === 'decoration' && target.faceIds?.includes('B')));
    assert.ok(targets.some((target) => target.kind === 'attachment' && target.faceIds?.includes('B')));
    assert.equal(targets.some((target) => JSON.stringify(target).includes('set_floor_2')), false);
    assert.equal(targets.some((target) => JSON.stringify(target).includes('escape_2')), false);

    const report = createSilhouetteRemapReport({
        beforeLoop: loop(['A', 'B', 'C', 'D']),
        afterLoop: loop(['A', 'E', 'C', 'D'], ['E']),
        targets
    });
    const decisions = {};
    for (const target of report.targets.filter((entry) => entry.status === 'needs_decision')) {
        if (target.target?.locator?.type === 'face_material') {
            decisions[target.targetId] = { action: SILHOUETTE_REMAP_DECISION.ORPHAN };
        } else if (target.target?.kind === 'attachment') {
            decisions[target.targetId] = { action: SILHOUETTE_REMAP_DECISION.REMOVE };
        } else {
            decisions[target.targetId] = { action: SILHOUETTE_REMAP_DECISION.REMAP, runId: 'E' };
        }
    }
    const resolution = applySilhouetteRemapDecisions(report, decisions);
    assert.equal(resolution.valid, true);

    const result = materializeBuildingSilhouetteTargetRemap(config, { layerId: 'floor_1', resolution });
    assert.equal(result.valid, true);
    assert.equal(JSON.stringify(config), frozen, 'materialization does not mutate its input');
    assert.deepEqual(result.config.facades.floor_1.E.layout.bays.items.map((bay) => bay.id), ['right', 'left']);
    assert.equal(Object.hasOwn(result.config.facades.floor_1, 'B'), false);
    assert.equal(result.config.facades.floor_2.B.layout.bays.items[0].id, 'other_floor');
    assert.equal(Object.hasOwn(result.config.layers[0].faceMaterials, 'B'), false);
    assert.equal(result.config.layers[0].faceLinking.links.E, 'A');
    assert.equal(result.config.layers[0].faceLinking.reverseByFace.E, true);
    assert.deepEqual(result.config.wallDecorations.sets[0].target.bayRefs, ['E:left']);
    assert.deepEqual(result.config.wallDecorations.sets[0].decorations[0].span, { start: 0.6, end: 0.9 });
    assert.equal(Object.hasOwn(result.config.wallDecorations.sets[0].decorations[0], 'autoCorner'), false);
    assert.equal(result.config.wallDecorations.sets[1].target.layerId, 'floor_2');
    assert.equal(result.config.wallDecorations.lettering[0].target.bayRef, 'E:left');
    assert.deepEqual(result.config.attachments.items.map((item) => item.id), ['escape_2', 'ac_1']);
    assert.equal(result.config.footprintStretch.faces.E, 'prefer_expand');
    assert.equal(Object.hasOwn(result.config.footprintStretch.faces, 'B'), false);
    assert.deepEqual(result.config.footprintStretch.bands['E:end'], { preference: 'allow', weight: 2 });
    assert.equal(Object.hasOwn(result.config.footprintStretch.bands, 'B:start'), false);
    assert.ok(result.targetRemap.orphaned.some((entry) => entry.kind === 'face_material' && entry.disposition === 'orphaned'));
    assert.ok(result.targetRemap.orphaned.some((entry) => entry.kind === 'attachment' && entry.disposition === 'removed'));
    assert.deepEqual(result.targetRemap.unresolved, []);
});

test('BuildingSilhouetteTargetRemap: promotes a legacy global facade before changing one layer', () => {
    const config = {
        layers: [
            { id: 'floor_1', type: 'floor' },
            { id: 'floor_2', type: 'floor' }
        ],
        facades: {
            A: {
                layout: {
                    bays: {
                        items: [
                            { id: 'left', depth: { left: 1, right: 2, linked: false } },
                            { id: 'right', depth: { left: 3, right: 4, linked: false } }
                        ]
                    }
                }
            }
        }
    };
    const targets = collectBuildingSilhouetteRemapTargets(config, 'floor_1');
    const report = createSilhouetteRemapReport({
        beforeLoop: loop(['A', 'B', 'C', 'D']),
        afterLoop: loop(['A', 'B', 'C', 'D'], ['A']),
        targets
    });
    const resolution = applySilhouetteRemapDecisions(report, {
        'facade:floor_1:A': { action: SILHOUETTE_REMAP_DECISION.REMAP, runId: 'A' }
    });
    const result = materializeBuildingSilhouetteTargetRemap(config, { layerId: 'floor_1', resolution });

    assert.equal(result.valid, true);
    assert.deepEqual(Object.keys(result.config.facades).sort(), ['floor_1', 'floor_2']);
    assert.deepEqual(result.config.facades.floor_1.A.layout.bays.items.map((bay) => bay.id), ['right', 'left']);
    assert.deepEqual(result.config.facades.floor_1.A.layout.bays.items[0].depth, { left: 4, right: 3, linked: false });
    assert.deepEqual(result.config.facades.floor_2.A, config.facades.A);
    assert.equal(result.applied[0].promotedGlobalFacades, true);
});
