// Node unit tests: mesh fabrication boolean command pipeline.
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildDeterministicCommandPlan, runMeshCommandPipeline } from '../../../src/graphics/gui/mesh_fabrication/meshCommandPipeline.js';

function pad3(value) {
    return String(value).padStart(3, '0');
}

function ensureEdge(edges, edgeMap, vertexIds, aIndex, bIndex, objectId) {
    const aId = vertexIds[aIndex];
    const bId = vertexIds[bIndex];
    const key = aIndex < bIndex ? `${aIndex}|${bIndex}` : `${bIndex}|${aIndex}`;
    const existing = edgeMap.get(key);
    if (existing) return existing;
    const edge = Object.freeze({
        id: `${objectId}.edge.seed.e${pad3(edges.length)}`,
        vertexIds: Object.freeze([aId, bId]),
        vertexIndices: Object.freeze([aIndex, bIndex])
    });
    edges.push(edge);
    edgeMap.set(key, edge.id);
    return edge.id;
}

function buildParsedObjectFromFaces({ objectId, materialId, vertices, faces, position = [0, 0, 0], rotation = [0, 0, 0], scale = [1, 1, 1] }) {
    const vertexIds = vertices.map((_, i) => `${objectId}.vertex.seed.v${pad3(i)}`);
    const edges = [];
    const edgeMap = new Map();

    const parsedFaces = faces.map((face, i) => {
        const ring = Array.isArray(face.vertexIndices) ? face.vertexIndices : [];
        const edgeIds = [];
        for (let j = 0; j < ring.length; j++) {
            const a = ring[j];
            const b = ring[(j + 1) % ring.length];
            edgeIds.push(ensureEdge(edges, edgeMap, vertexIds, a, b, objectId));
        }
        return Object.freeze({
            id: face.id ?? `${objectId}.face.seed.f${pad3(i)}`,
            vertexIds: Object.freeze(ring.map((idx) => vertexIds[idx])),
            vertexIndices: Object.freeze([...ring]),
            edgeIds: Object.freeze(edgeIds),
            label: face.label ?? undefined,
            canonicalLabel: face.canonicalLabel ?? undefined
        });
    });

    const renderTriangles = [];
    for (const face of parsedFaces) {
        const ring = face.vertexIndices;
        for (let i = 1; i < ring.length - 1; i++) {
            renderTriangles.push(Object.freeze({
                id: `${face.id}.triangle.t${pad3(i - 1)}`,
                faceId: face.id,
                localIndex: i - 1,
                indices: Object.freeze([ring[0], ring[i], ring[i + 1]])
            }));
        }
    }

    return Object.freeze({
        id: objectId,
        materialId,
        vertices: Object.freeze(vertices.map((v) => Object.freeze([...v]))),
        vertexIds: Object.freeze(vertexIds),
        edges: Object.freeze(edges),
        faces: Object.freeze(parsedFaces),
        renderTriangles: Object.freeze(renderTriangles),
        triangles: Object.freeze(renderTriangles.map((tri) => tri.indices)),
        position: Object.freeze([...position]),
        rotation: Object.freeze([...rotation]),
        scale: Object.freeze([...scale]),
        topologySource: 'test'
    });
}

function makeCylinderObject(objectId, radius, height, segments, materialId) {
    const top = [];
    const bottom = [];
    const half = height * 0.5;
    const tau = Math.PI * 2;
    for (let i = 0; i < segments; i++) {
        const t = (i / segments) * tau;
        top.push([Math.cos(t) * radius, half, Math.sin(t) * radius]);
        bottom.push([Math.cos(t) * radius, -half, Math.sin(t) * radius]);
    }
    const vertices = [...top, ...bottom];
    const faces = [];
    for (let i = 0; i < segments; i++) {
        const next = (i + 1) % segments;
        faces.push({
            id: `${objectId}.face.seed.side.s${pad3(i)}`,
            label: `side.s${pad3(i)}`,
            canonicalLabel: `side.s${pad3(i)}`,
            vertexIndices: [segments + i, i, next, segments + next]
        });
    }
    faces.push({
        id: `${objectId}.face.seed.top`,
        label: 'top',
        canonicalLabel: 'top',
        vertexIndices: [...Array(segments).keys()].reverse()
    });
    faces.push({
        id: `${objectId}.face.seed.bottom`,
        label: 'bottom',
        canonicalLabel: 'bottom',
        vertexIndices: [...Array(segments).keys()].map((i) => segments + i)
    });
    return buildParsedObjectFromFaces({
        objectId,
        materialId,
        vertices,
        faces
    });
}

function makeBoxObject(objectId, halfExtent, materialId) {
    const h = halfExtent;
    const vertices = [
        [-h, h, h],
        [h, h, h],
        [h, -h, h],
        [-h, -h, h],
        [-h, h, -h],
        [h, h, -h],
        [h, -h, -h],
        [-h, -h, -h]
    ];
    const faces = [
        { id: `${objectId}.face.seed.front`, label: 'front', canonicalLabel: 'front', vertexIndices: [0, 3, 2, 1] },
        { id: `${objectId}.face.seed.back`, label: 'back', canonicalLabel: 'back', vertexIndices: [4, 5, 6, 7] },
        { id: `${objectId}.face.seed.left`, label: 'left', canonicalLabel: 'left', vertexIndices: [4, 7, 3, 0] },
        { id: `${objectId}.face.seed.right`, label: 'right', canonicalLabel: 'right', vertexIndices: [1, 2, 6, 5] },
        { id: `${objectId}.face.seed.top`, label: 'top', canonicalLabel: 'top', vertexIndices: [4, 0, 1, 5] },
        { id: `${objectId}.face.seed.bottom`, label: 'bottom', canonicalLabel: 'bottom', vertexIndices: [3, 7, 6, 2] }
    ];
    return buildParsedObjectFromFaces({
        objectId,
        materialId,
        vertices,
        faces
    });
}

function snapshotObjectTopology(objectDef) {
    return {
        id: objectDef.id,
        materialId: objectDef.materialId,
        vertexIds: [...objectDef.vertexIds],
        vertices: objectDef.vertices.map((v) => [...v]),
        edges: objectDef.edges.map((edge) => ({
            id: edge.id,
            vertexIds: [...edge.vertexIds],
            vertexIndices: [...edge.vertexIndices]
        })),
        faces: objectDef.faces.map((face) => ({
            id: face.id,
            label: face.label ?? null,
            canonicalLabel: face.canonicalLabel ?? null,
            vertexIds: [...face.vertexIds],
            vertexIndices: [...face.vertexIndices],
            edgeIds: [...face.edgeIds]
        })),
        renderTriangles: objectDef.renderTriangles.map((tri) => ({
            id: tri.id,
            faceId: tri.faceId,
            localIndex: tri.localIndex,
            indices: [...tri.indices]
        }))
    };
}

test('MeshBooleanPipeline: normalizes boolean raw command args', () => {
    const plan = buildDeterministicCommandPlan({
        commands: [
            {
                type: 'boolean_subtract',
                args: {
                    targetObjectId: 'part.target.main',
                    toolObjectId: 'part.tool.main',
                    subtractMode: 'subtract_clamped',
                    outputPolicy: 'new_object',
                    resultObjectId: 'part.target.out',
                    keepTool: true
                }
            }
        ]
    });
    assert.equal(plan.commands.length, 1);
    assert.equal(plan.commands[0].type, 'boolean_subtract');
    assert.equal(plan.commands[0].args.targetObjectId, 'part.target.main');
    assert.equal(plan.commands[0].args.toolObjectId, 'part.tool.main');
    assert.equal(plan.commands[0].args.subtractMode, 'subtract_clamped');
    assert.equal(plan.commands[0].args.outputPolicy, 'new_object');
    assert.equal(plan.commands[0].args.resultObjectId, 'part.target.out');
    assert.equal(plan.commands[0].args.keepTool, true);
});

test('MeshBooleanPipeline: subtract through replaces target and removes tool with cutter lineage ids', () => {
    const outer = makeCylinderObject('part.tire.outer', 1.2, 0.6, 12, 'mat_tire');
    const inner = makeCylinderObject('part.tire.inner', 0.6, 0.8, 12, 'mat_void');
    const runtime = runMeshCommandPipeline(
        {
            commands: [
                {
                    type: 'boolean_subtract',
                    args: {
                        opId: 'sub001',
                        targetObjectId: 'part.tire.outer',
                        toolObjectId: 'part.tire.inner',
                        subtractMode: 'subtract_through',
                        outputPolicy: 'replace_target'
                    }
                }
            ]
        },
        {
            objects: [outer, inner],
            materials: new Map([
                ['mat_tire', {}],
                ['mat_void', {}]
            ])
        }
    );

    assert.equal(runtime.operationLog.operations[0].status, 'applied');
    assert.equal(runtime.objects.length, 1);
    assert.equal(runtime.objects[0].id, 'part.tire.outer');
    assert.ok(runtime.objects[0].faces.some((face) => face.id.includes('.face.bool.sub001.inner.s')));
    assert.ok(runtime.objects[0].faces.some((face) => face.id === 'part.tire.outer.face.seed.side.s000'));
});

test('MeshBooleanPipeline: subtract clamped rejects non-contained tool', () => {
    const outer = makeBoxObject('part.box.outer', 1.0, 'mat_a');
    const tool = makeBoxObject('part.box.tool', 1.3, 'mat_b');
    const runtime = runMeshCommandPipeline(
        {
            commands: [
                {
                    type: 'boolean_subtract',
                    args: {
                        targetObjectId: 'part.box.outer',
                        toolObjectId: 'part.box.tool',
                        subtractMode: 'subtract_clamped',
                        outputPolicy: 'replace_target'
                    }
                }
            ]
        },
        {
            objects: [outer, tool],
            materials: new Map([
                ['mat_a', {}],
                ['mat_b', {}]
            ])
        }
    );
    assert.equal(runtime.operationLog.operations[0].status, 'error');
    assert.match(runtime.operationLog.operations[0].message, /subtract_clamped/i);
});

test('MeshBooleanPipeline: new_object output policy keeps source operands', () => {
    const a = makeBoxObject('part.bool.a', 1.0, 'mat_a');
    const b = makeBoxObject('part.bool.b', 1.0, 'mat_b');
    const runtime = runMeshCommandPipeline(
        {
            commands: [
                {
                    type: 'boolean_union',
                    args: {
                        opId: 'uni001',
                        targetObjectId: 'part.bool.a',
                        toolObjectId: 'part.bool.b',
                        outputPolicy: 'new_object',
                        resultObjectId: 'part.bool.out',
                        keepTool: true
                    }
                }
            ]
        },
        {
            objects: [a, b],
            materials: new Map([
                ['mat_a', {}],
                ['mat_b', {}]
            ])
        }
    );

    assert.equal(runtime.operationLog.operations[0].status, 'applied');
    assert.equal(runtime.objects.length, 3);
    const ids = runtime.objects.map((obj) => obj.id).sort();
    assert.deepEqual(ids, ['part.bool.a', 'part.bool.b', 'part.bool.out']);
});

test('MeshBooleanPipeline: subtract clamped applies for contained cutter and keeps closed output', () => {
    const outer = makeBoxObject('part.clamped.outer', 2.0, 'mat_outer');
    const tool = makeBoxObject('part.clamped.tool', 0.4, 'mat_tool');
    const runtime = runMeshCommandPipeline(
        {
            commands: [
                {
                    type: 'boolean_subtract',
                    args: {
                        opId: 'subClamp001',
                        targetObjectId: 'part.clamped.outer',
                        toolObjectId: 'part.clamped.tool',
                        subtractMode: 'subtract_clamped',
                        outputPolicy: 'replace_target'
                    }
                }
            ]
        },
        {
            objects: [outer, tool],
            materials: new Map([
                ['mat_outer', {}],
                ['mat_tool', {}]
            ])
        }
    );

    assert.equal(runtime.operationLog.operations[0].status, 'applied');
    assert.equal(runtime.objects.length, 1);
    assert.equal(runtime.objects[0].id, 'part.clamped.outer');
    assert.ok(runtime.objects[0].faces.some((face) => face.id.includes('.face.bool.subClamp001.')));
});

test('MeshBooleanPipeline: boolean subtract is deterministic for identical inputs', () => {
    const outer = makeCylinderObject('part.det.outer', 1.2, 0.6, 16, 'mat_outer');
    const inner = makeCylinderObject('part.det.inner', 0.7, 0.8, 16, 'mat_tool');

    const payload = {
        commands: [
            {
                type: 'boolean_subtract',
                args: {
                    opId: 'subDet001',
                    targetObjectId: 'part.det.outer',
                    toolObjectId: 'part.det.inner',
                    subtractMode: 'subtract_through',
                    outputPolicy: 'replace_target'
                }
            }
        ]
    };
    const resources = {
        objects: [outer, inner],
        materials: new Map([
            ['mat_outer', {}],
            ['mat_tool', {}]
        ])
    };

    const first = runMeshCommandPipeline(payload, resources);
    const second = runMeshCommandPipeline(payload, resources);

    assert.equal(first.operationLog.operations[0].status, 'applied');
    assert.equal(second.operationLog.operations[0].status, 'applied');
    assert.deepEqual(snapshotObjectTopology(first.objects[0]), snapshotObjectTopology(second.objects[0]));
});

test('MeshBooleanPipeline: topology cut commands remain hook-only (non-executable)', () => {
    const target = makeBoxObject('part.cut.target', 1.0, 'mat_target');
    const tool = makeBoxObject('part.cut.tool', 0.25, 'mat_tool');
    const runtime = runMeshCommandPipeline(
        {
            commands: [
                {
                    type: 'imprint_topology',
                    args: {
                        targetObjectId: 'part.cut.target',
                        toolObjectId: 'part.cut.tool'
                    }
                },
                {
                    type: 'slice_topology',
                    args: {
                        targetObjectId: 'part.cut.target',
                        toolObjectId: 'part.cut.tool'
                    }
                }
            ]
        },
        {
            objects: [target, tool],
            materials: new Map([
                ['mat_target', {}],
                ['mat_tool', {}]
            ])
        }
    );

    assert.equal(runtime.operationLog.operations.length, 2);
    assert.equal(runtime.operationLog.operations[0].status, 'needs_clarification');
    assert.equal(runtime.operationLog.operations[1].status, 'needs_clarification');
    assert.match(runtime.operationLog.operations[0].message, /topology_cut_operation_defined_but_not_executable/);
    assert.match(runtime.operationLog.operations[1].message, /topology_cut_operation_defined_but_not_executable/);
});

test('MeshBooleanPipeline: boolean result preserves face->triangle traceability for hover/wire systems', () => {
    const outer = makeCylinderObject('part.section13.outer', 1.2, 0.8, 20, 'mat_outer');
    const tool = makeCylinderObject('part.section13.inner', 0.55, 1.0, 20, 'mat_tool');
    const runtime = runMeshCommandPipeline(
        {
            commands: [
                {
                    type: 'boolean_subtract',
                    args: {
                        opId: 'sub001',
                        targetObjectId: 'part.section13.outer',
                        toolObjectId: 'part.section13.inner',
                        subtractMode: 'subtract_through',
                        outputPolicy: 'replace_target'
                    }
                }
            ]
        },
        {
            objects: [outer, tool],
            materials: new Map([
                ['mat_outer', {}],
                ['mat_tool', {}]
            ])
        }
    );

    assert.equal(runtime.operationLog.operations.length, 1);
    assert.equal(runtime.operationLog.operations[0].status, 'applied');
    assert.equal(runtime.objects.length, 1);
    const objectDef = runtime.objects[0];
    assert.ok(objectDef.faces.some((face) => face.id.includes('.face.bool.sub001.inner.s')));

    const triangleIdsByFace = new Map();
    for (const tri of objectDef.renderTriangles) {
        if (!triangleIdsByFace.has(tri.faceId)) triangleIdsByFace.set(tri.faceId, []);
        triangleIdsByFace.get(tri.faceId).push(tri.id);
        assert.equal(tri.indices.length, 3);
    }
    assert.equal(triangleIdsByFace.size, objectDef.faces.length);
    for (const face of objectDef.faces) {
        const triIds = triangleIdsByFace.get(face.id);
        assert.ok(Array.isArray(triIds) && triIds.length >= 1);
    }
});
