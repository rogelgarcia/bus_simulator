// AI 537: balcony continuity links participate atomically in silhouette remaps.
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

function balconyBay(id) {
    return {
        id,
        size: { mode: 'fixed', widthMeters: 2 },
        balcony: { enabled: true }
    };
}

function facadeForBayIds(bayIds) {
    return {
        layout: {
            bays: {
                items: bayIds.map(balconyBay)
            }
        }
    };
}

function configWithLinks(links, { extraFacades = {} } = {}) {
    const bayIdsByFace = new Map();
    for (const link of links) {
        for (const endpoint of link.endpoints) {
            if (!bayIdsByFace.has(endpoint.faceId)) bayIdsByFace.set(endpoint.faceId, new Set());
            bayIdsByFace.get(endpoint.faceId).add(endpoint.bayId);
        }
    }
    for (const [faceId, bayIds] of Object.entries(extraFacades)) {
        if (!bayIdsByFace.has(faceId)) bayIdsByFace.set(faceId, new Set());
        for (const bayId of bayIds) bayIdsByFace.get(faceId).add(bayId);
    }
    return {
        layers: [
            {
                id: 'floor_1',
                type: 'floor',
                balconyContinuity: { links }
            }
        ],
        facades: {
            floor_1: Object.fromEntries(
                [...bayIdsByFace].map(([faceId, bayIds]) => [faceId, facadeForBayIds([...bayIds])])
            )
        }
    };
}

function configWithLink(endpoints, options = {}) {
    return configWithLinks([{ id: 'corner_wrap', endpoints }], options);
}

function affectedRunIds(target) {
    return [...new Set([
        ...(Array.isArray(target?.missingRunIds) ? target.missingRunIds : []),
        ...(Array.isArray(target?.incompatibleRunIds) ? target.incompatibleRunIds : [])
    ])];
}

function remap(config, {
    afterLoop,
    runId,
    runIdsBySource = null,
    facadeRunIdsBySource = null,
    action = SILHOUETTE_REMAP_DECISION.REMAP,
    linkId = 'corner_wrap'
}) {
    const targets = collectBuildingSilhouetteRemapTargets(config, 'floor_1');
    const targetId = `balcony_continuity:floor_1:${linkId}`;
    const continuityTarget = targets.find((target) => target.targetId === targetId);
    assert.ok(continuityTarget);
    const report = createSilhouetteRemapReport({
        beforeLoop: loop(['A', 'B', 'C', 'D']),
        afterLoop,
        targets
    });
    const fallbackRunId = runId ?? report.addedRunIds[0] ?? report.retainedRunIds[0];
    const decisions = {};
    for (const target of report.targets) {
        if (target.status !== 'needs_decision') continue;
        if (target.targetId === targetId) {
            if (action !== SILHOUETTE_REMAP_DECISION.REMAP) {
                decisions[target.targetId] = { action };
                continue;
            }
            const affected = affectedRunIds(target);
            if (runIdsBySource) {
                decisions[target.targetId] = {
                    action,
                    runIdsBySource: Object.fromEntries(
                        affected.map((sourceRunId) => [
                            sourceRunId,
                            runIdsBySource[sourceRunId] ?? fallbackRunId
                        ])
                    )
                };
            } else {
                decisions[target.targetId] = { action, runId: fallbackRunId };
            }
            continue;
        }

        const affected = affectedRunIds(target);
        const sourceTargets = facadeRunIdsBySource ?? runIdsBySource;
        const mapped = Object.fromEntries(
            affected.map((sourceRunId) => [
                sourceRunId,
                sourceTargets?.[sourceRunId] ?? fallbackRunId
            ])
        );
        decisions[target.targetId] = affected.length > 1
            ? { action: SILHOUETTE_REMAP_DECISION.REMAP, runIdsBySource: mapped }
            : { action: SILHOUETTE_REMAP_DECISION.REMAP, runId: mapped[affected[0]] };
    }
    const resolution = applySilhouetteRemapDecisions(report, decisions);
    return materializeBuildingSilhouetteTargetRemap(config, { layerId: 'floor_1', resolution });
}

test('Balcony continuity remap flips only the affected endpoint in physical local-u', () => {
    const config = configWithLink([
        { faceId: 'A', bayId: 'front_outer', edge: 'end' },
        { faceId: 'B', bayId: 'side_outer', edge: 'start' }
    ]);
    config.layers[0].balconyContinuity.links[0].cornerTransition = {
        type: 'rounded',
        leftRunoutMeters: 0.42,
        rightRunoutMeters: 0.42,
        runoutsLinked: true,
        meeting: 0.5
    };
    const frozen = JSON.stringify(config);
    const result = remap(config, {
        afterLoop: loop(['A', 'E', 'C', 'D'], ['E']),
        runId: 'E'
    });

    assert.equal(result.valid, true);
    assert.equal(JSON.stringify(config), frozen);
    assert.deepEqual(result.config.layers[0].balconyContinuity.links[0], {
        id: 'corner_wrap',
        endpoints: [
            { faceId: 'A', bayId: 'front_outer', edge: 'end' },
            { faceId: 'E', bayId: 'side_outer', edge: 'end' }
        ],
        cornerTransition: {
            type: 'rounded',
            leftRunoutMeters: 0.42,
            rightRunoutMeters: 0.42,
            runoutsLinked: true,
            meeting: 0.5
        }
    });
    const applied = result.applied.find((entry) => entry.effect === 'remap_balcony_continuity_link');
    assert.ok(applied);
    assert.equal(applied.reverseLocalU, true);
});

test('Bay boundary remap flips endpoint local-u while preserving transition and depth-link settings', () => {
    const connection = {
        id: 'rounded_corner',
        type: 'rounded',
        endpoints: [
            { faceId: 'A', bayId: 'front_outer', edge: 'end' },
            { faceId: 'B', bayId: 'side_outer', edge: 'start' }
        ],
        depthLink: { enabled: true, valueMeters: 0.35 },
        transition: {
            mode: 'authored',
            leftRunoutMeters: 1.2,
            rightRunoutMeters: 0.8,
            runoutsLinked: false,
            meeting: 0.4
        }
    };
    const config = {
        layers: [{
            id: 'floor_1',
            type: 'floor',
            bayBoundaryConnections: { connections: [connection] }
        }],
        facades: {
            floor_1: {
                A: facadeForBayIds(['front_outer']),
                B: facadeForBayIds(['side_outer'])
            }
        }
    };
    const targets = collectBuildingSilhouetteRemapTargets(config, 'floor_1');
    assert.ok(targets.some((target) => target.targetId === 'bay_boundary:floor_1:rounded_corner'));
    const report = createSilhouetteRemapReport({
        beforeLoop: loop(['A', 'B', 'C', 'D']),
        afterLoop: loop(['A', 'E', 'C', 'D'], ['E']),
        targets
    });
    const decisions = {};
    for (const target of report.targets) {
        if (target.status !== 'needs_decision') continue;
        decisions[target.targetId] = { action: SILHOUETTE_REMAP_DECISION.REMAP, runId: 'E' };
    }
    const resolution = applySilhouetteRemapDecisions(report, decisions);
    const result = materializeBuildingSilhouetteTargetRemap(config, { layerId: 'floor_1', resolution });
    assert.equal(result.valid, true);
    assert.deepEqual(result.config.layers[0].bayBoundaryConnections.connections[0], {
        ...connection,
        endpoints: [
            { faceId: 'A', bayId: 'front_outer', edge: 'end' },
            { faceId: 'E', bayId: 'side_outer', edge: 'end' }
        ]
    });
    assert.ok(result.applied.some((entry) => (
        entry.effect === 'remap_bay_boundary_connection' && entry.reverseLocalU === true
    )));
});

test('Balcony continuity remap independently maps and reverses two affected endpoint faces', () => {
    const config = configWithLink([
        { faceId: 'A', bayId: 'front_outer', edge: 'end' },
        { faceId: 'B', bayId: 'side_outer', edge: 'start' }
    ]);
    const result = remap(config, {
        afterLoop: loop(['E', 'F', 'C', 'D'], ['F']),
        runIdsBySource: { A: 'E', B: 'F' }
    });

    assert.equal(result.valid, true);
    assert.deepEqual(result.config.layers[0].balconyContinuity.links[0].endpoints, [
        { faceId: 'E', bayId: 'front_outer', edge: 'end' },
        { faceId: 'F', bayId: 'side_outer', edge: 'end' }
    ]);
    const resolved = result.targetRemap.resolved.find((entry) => (
        entry.targetId === 'balcony_continuity:floor_1:corner_wrap'
    ));
    assert.deepEqual(
        resolved.orientationMappings.map(({ sourceRunId, targetRunId, reverseLocalU }) => ({
            sourceRunId,
            targetRunId,
            reverseLocalU
        })),
        [
            { sourceRunId: 'A', targetRunId: 'E', reverseLocalU: false },
            { sourceRunId: 'B', targetRunId: 'F', reverseLocalU: true }
        ]
    );
});

test('Balcony continuity remap orphans a link whose destination bay does not exist', () => {
    const config = configWithLink([
        { faceId: 'A', bayId: 'front_outer', edge: 'end' },
        { faceId: 'B', bayId: 'side_outer', edge: 'start' }
    ], {
        extraFacades: { E: ['unrelated'] }
    });
    const result = remap(config, {
        afterLoop: loop(['A', 'E', 'C', 'D']),
        runId: 'E',
        facadeRunIdsBySource: { B: 'C' }
    });

    assert.equal(result.valid, false);
    assert.equal(Object.hasOwn(result.config.layers[0], 'balconyContinuity'), false);
    assert.ok(result.unresolved.some((entry) => (
        entry.targetId === 'balcony_continuity:floor_1:corner_wrap'
        && entry.reason === 'balcony_continuity_destination_bay_missing'
    )));
    const archived = result.orphaned.find((entry) => (
        entry.targetId === 'balcony_continuity:floor_1:corner_wrap'
    ));
    assert.equal(archived?.payload?.id, 'corner_wrap');
});

test('Balcony continuity remap rejects cross-link endpoint ownership conflicts atomically', () => {
    const config = configWithLinks([
        {
            id: 'corner_wrap',
            endpoints: [
                { faceId: 'A', bayId: 'front', edge: 'end' },
                { faceId: 'B', bayId: 'shared', edge: 'start' }
            ]
        },
        {
            id: 'existing',
            endpoints: [
                { faceId: 'C', bayId: 'shared', edge: 'start' },
                { faceId: 'D', bayId: 'side', edge: 'end' }
            ]
        }
    ]);
    const result = remap(config, {
        afterLoop: loop(['A', 'C', 'D', 'E']),
        runId: 'C'
    });

    assert.equal(result.valid, false);
    assert.deepEqual(
        result.config.layers[0].balconyContinuity.links.map((link) => link.id),
        ['existing']
    );
    assert.ok(result.unresolved.some((entry) => (
        entry.targetId === 'balcony_continuity:floor_1:corner_wrap'
        && entry.reason === 'balcony_continuity_endpoint_already_linked'
    )));
    assert.ok(result.orphaned.some((entry) => (
        entry.targetId === 'balcony_continuity:floor_1:corner_wrap'
        && entry.payload?.id === 'corner_wrap'
    )));
});


test('Balcony continuity orphan removes and archives the whole two-endpoint link', () => {
    const config = configWithLink([
        { faceId: 'A', bayId: 'front_outer', edge: 'end' },
        { faceId: 'B', bayId: 'side_outer', edge: 'start' }
    ]);
    const result = remap(config, {
        afterLoop: loop(['A', 'E', 'C', 'D']),
        action: SILHOUETTE_REMAP_DECISION.ORPHAN
    });

    assert.equal(result.valid, true);
    assert.equal(Object.hasOwn(result.config.layers[0], 'balconyContinuity'), false);
    assert.deepEqual(result.orphaned[0].payload.endpoints, config.layers[0].balconyContinuity.links[0].endpoints);
    assert.equal(result.orphaned[0].disposition, 'orphaned');
});

test('Balcony continuity remap collision fails and orphans the link atomically', () => {
    const config = configWithLink([
        { faceId: 'A', bayId: 'shared', edge: 'start' },
        { faceId: 'B', bayId: 'shared', edge: 'start' }
    ]);
    const result = remap(config, {
        afterLoop: loop(['A', 'E', 'C', 'D']),
        runId: 'A'
    });

    assert.equal(result.valid, false);
    assert.equal(Object.hasOwn(result.config.layers[0], 'balconyContinuity'), false);
    assert.ok(result.unresolved.some((entry) => entry.reason === 'balcony_continuity_endpoint_collision_after_remap'));
    assert.deepEqual(result.orphaned[0].payload, config.layers[0].balconyContinuity.links[0]);
});
