// Node unit tests: mesh fabrication boolean command pipeline.
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildDeterministicCommandPlan, runMeshCommandPipeline } from '../../../src/graphics/gui/mesh_fabrication/meshCommandPipeline.js';
import { compileSemanticAuthoringDocument } from '../../../src/graphics/gui/mesh_fabrication/semanticMeshCompiler.js';

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

function buildParsedObjectFromCompiledObject(compiledObject) {
    const objectId = compiledObject.objectId;
    const materialId = compiledObject.material;
    const vertexIds = [...compiledObject.vertexIds];
    const vertices = compiledObject.vertices.map((row) => Object.freeze([...row]));
    const edges = compiledObject.edges.map((edgePair, i) => Object.freeze({
        id: compiledObject.edgeIds[i],
        vertexIds: Object.freeze([
            vertexIds[edgePair[0]],
            vertexIds[edgePair[1]]
        ]),
        vertexIndices: Object.freeze([edgePair[0], edgePair[1]])
    }));
    const faces = compiledObject.faces.map((ring, i) => {
        const vertexIndices = [...ring];
        const vertexIdRing = vertexIndices.map((vertexIndex) => vertexIds[vertexIndex]);
        const edgeIds = Array.isArray(compiledObject.faceEdgeIndices?.[i])
            ? compiledObject.faceEdgeIndices[i].map((edgeIndex) => compiledObject.edgeIds[edgeIndex])
            : [];
        return Object.freeze({
            id: compiledObject.faceIds[i],
            vertexIds: Object.freeze(vertexIdRing),
            vertexIndices: Object.freeze(vertexIndices),
            edgeIds: Object.freeze(edgeIds),
            label: compiledObject.faceLabels?.[i] ?? undefined,
            canonicalLabel: compiledObject.faceCanonicalLabels?.[i] ?? undefined
        });
    });

    const renderTriangles = [];
    for (const face of faces) {
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
        vertices: Object.freeze(vertices),
        vertexIds: Object.freeze(vertexIds),
        edges: Object.freeze(edges),
        faces: Object.freeze(faces),
        renderTriangles: Object.freeze(renderTriangles),
        triangles: Object.freeze(renderTriangles.map((tri) => tri.indices)),
        position: Object.freeze([...(compiledObject.transform?.position ?? [0, 0, 0])]),
        rotation: Object.freeze([...(compiledObject.transform?.rotation ?? [0, 0, 0])]),
        scale: Object.freeze([...(compiledObject.transform?.scale ?? [1, 1, 1])]),
        topologySource: 'test-compiled'
    });
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
    assert.equal(
        runtime.objects[0].faces.some((face) => face.id.includes('.face.bool.sub001.inner.s') && /\.f\d+$/.test(face.id)),
        false
    );
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

    const edgeIdSet = new Set();
    for (const edge of objectDef.edges) {
        assert.equal(edgeIdSet.has(edge.id), false);
        edgeIdSet.add(edge.id);
    }
});

test('MeshBooleanPipeline: command plan pins booleanKernel to manifold-3d by default', () => {
    const plan = buildDeterministicCommandPlan({
        commands: [
            {
                type: 'boolean_union',
                args: {
                    targetObjectId: 'part.a',
                    toolObjectId: 'part.b'
                }
            }
        ]
    });
    assert.equal(plan.booleanKernel, 'manifold-3d');
});

test('MeshBooleanPipeline: unsupported booleanKernel is rejected at plan-build time', () => {
    assert.throws(() => buildDeterministicCommandPlan({
        booleanKernel: 'legacy-local-kernel',
        commands: [
            {
                type: 'boolean_union',
                args: {
                    targetObjectId: 'part.a',
                    toolObjectId: 'part.b'
                }
            }
        ]
    }), /booleanKernel/i);
});

test('MeshBooleanPipeline: boolean operation log records manifold kernel metadata + markers', () => {
    const outer = makeBoxObject('part.meta.outer', 1.0, 'mat_outer');
    const inner = makeBoxObject('part.meta.inner', 0.35, 'mat_inner');
    const runtime = runMeshCommandPipeline(
        {
            commands: [
                {
                    type: 'boolean_subtract',
                    args: {
                        targetObjectId: outer.id,
                        toolObjectId: inner.id,
                        outputPolicy: 'replace_target'
                    }
                }
            ]
        },
        {
            objects: [outer, inner],
            materials: new Map([
                ['mat_outer', {}],
                ['mat_inner', {}]
            ])
        }
    );

    const operation = runtime.operationLog.operations[0];
    assert.equal(operation.status, 'applied');
    assert.ok(Array.isArray(operation.markers));
    assert.ok(operation.markers.includes('boolean_kernel_applied'));
    assert.equal(operation.metadata?.booleanKernel, 'manifold-3d');
    assert.equal(runtime.operationLog.booleanKernel, 'manifold-3d');
    assert.equal(runtime.operationLog.fallbackPolicy, 'none');
});

test('MeshBooleanPipeline: boolean kernel failures emit explicit no-fallback markers', () => {
    const target = makeBoxObject('part.error.target', 1.0, 'mat_target');
    const tool = makeBoxObject('part.error.tool', 0.25, 'mat_tool');
    const runtime = runMeshCommandPipeline(
        {
            commands: [
                {
                    type: 'boolean_subtract',
                    args: {
                        targetObjectId: target.id,
                        toolObjectId: tool.id,
                        outputPolicy: 'replace_target'
                    }
                }
            ]
        },
        {
            objects: [
                target,
                Object.freeze({
                    ...tool,
                    position: Object.freeze([0.2, 0.1, 0.3]) // Transform mismatch forces boolean hard-failure.
                })
            ],
            materials: new Map([
                ['mat_target', {}],
                ['mat_tool', {}]
            ])
        }
    );
    const op = runtime.operationLog.operations[0];
    assert.equal(op.status, 'error');
    assert.ok(op.markers.includes('boolean_kernel_error'));
    assert.ok(op.markers.includes('no_fallback'));
    assert.equal(op.metadata?.fallbackPolicy, 'none');
    assert.equal(op.metadata?.errorKind, 'boolean_kernel_failure');
});

test('MeshBooleanPipeline: boolean subtract provenance metadata includes target + tool lineage', () => {
    const outer = makeCylinderObject('part.prov.outer', 1.2, 0.8, 20, 'mat_outer');
    const inner = makeCylinderObject('part.prov.inner', 0.55, 1.0, 20, 'mat_inner');
    const runtime = runMeshCommandPipeline(
        {
            commands: [
                {
                    type: 'boolean_subtract',
                    args: {
                        targetObjectId: outer.id,
                        toolObjectId: inner.id,
                        outputPolicy: 'replace_target',
                        opId: 'prov001'
                    }
                }
            ]
        },
        {
            objects: [outer, inner],
            materials: new Map([
                ['mat_outer', {}],
                ['mat_inner', {}]
            ])
        }
    );
    const op = runtime.operationLog.operations[0];
    assert.equal(op.status, 'applied');
    const histogram = op.metadata?.provenance?.sourceFaceTriangleHistogram ?? {};
    const keys = Object.keys(histogram);
    assert.ok(keys.some((key) => key.includes('target|part.prov.outer')));
    assert.ok(keys.some((key) => key.includes('tool|part.prov.inner')));
});

test('MeshBooleanPipeline: coplanar and near-tangent operations remain deterministic', () => {
    const baseA = makeBoxObject('part.edge.a', 1.0, 'mat_a');
    const baseB = makeBoxObject('part.edge.b', 1.0, 'mat_b');
    const nearTangent = Object.freeze({
        ...baseB,
        vertices: Object.freeze(baseB.vertices.map((point) => Object.freeze([
            point[0] + 1.9999,
            point[1],
            point[2]
        ])))
    });

    const payload = {
        commands: [
            {
                type: 'boolean_union',
                args: {
                    targetObjectId: baseA.id,
                    toolObjectId: nearTangent.id,
                    outputPolicy: 'new_object',
                    resultObjectId: 'part.edge.out'
                }
            }
        ]
    };
    const resources = {
        objects: [baseA, nearTangent],
        materials: new Map([
            ['mat_a', {}],
            ['mat_b', {}]
        ])
    };

    const first = runMeshCommandPipeline(payload, resources);
    const second = runMeshCommandPipeline(payload, resources);
    assert.equal(first.operationLog.operations[0].status, 'applied');
    assert.equal(second.operationLog.operations[0].status, 'applied');
    const outA = first.objects.find((obj) => obj.id === 'part.edge.out');
    const outB = second.objects.find((obj) => obj.id === 'part.edge.out');
    assert.ok(outA);
    assert.ok(outB);
    assert.deepEqual(snapshotObjectTopology(outA), snapshotObjectTopology(outB));
});

test('MeshBooleanPipeline: small-feature subtraction keeps stable hover/wire topology artifacts', () => {
    const outer = makeBoxObject('part.small.outer', 1.5, 'mat_outer');
    const tinyTool = makeBoxObject('part.small.tool', 0.05, 'mat_tool');
    const runtime = runMeshCommandPipeline(
        {
            commands: [
                {
                    type: 'boolean_subtract',
                    args: {
                        targetObjectId: outer.id,
                        toolObjectId: tinyTool.id,
                        outputPolicy: 'replace_target'
                    }
                }
            ]
        },
        {
            objects: [outer, tinyTool],
            materials: new Map([
                ['mat_outer', {}],
                ['mat_tool', {}]
            ])
        }
    );
    const op = runtime.operationLog.operations[0];
    assert.equal(op.status, 'applied');
    const result = runtime.objects[0];
    const validFaceIds = new Set(result.faces.map((face) => face.id));
    assert.ok(result.renderTriangles.length >= result.faces.length);
    for (const tri of result.renderTriangles) {
        assert.ok(validFaceIds.has(tri.faceId));
    }
});

test('MeshBooleanPipeline: repeated manifold runs remain stable across live-edit style sessions', () => {
    const outer = makeCylinderObject('part.loop.outer', 1.2, 0.6, 16, 'mat_outer');
    const inner = makeCylinderObject('part.loop.inner', 0.65, 0.8, 16, 'mat_inner');
    const payload = {
        commands: [
            {
                type: 'boolean_subtract',
                args: {
                    targetObjectId: outer.id,
                    toolObjectId: inner.id,
                    outputPolicy: 'replace_target'
                }
            }
        ]
    };
    const resources = {
        objects: [outer, inner],
        materials: new Map([
            ['mat_outer', {}],
            ['mat_inner', {}]
        ])
    };

    let previous = null;
    for (let i = 0; i < 6; i++) {
        const runtime = runMeshCommandPipeline(payload, resources);
        assert.equal(runtime.operationLog.operations[0].status, 'applied');
        if (previous) {
            assert.deepEqual(snapshotObjectTopology(runtime.objects[0]), previous);
        }
        previous = snapshotObjectTopology(runtime.objects[0]);
    }
});

test('MeshBooleanPipeline: tool-side same-source triangle pairs are merged into inner quads', () => {
    const materials = new Map([
        ['mat_tire', {}],
        ['mat_void', {}]
    ]);
    const compiled = compileSemanticAuthoringDocument({
        version: 'mesh-semantic-authoring.v1',
        components: [
            {
                path: 'part.tire.outer',
                material: 'mat_tire',
                primitive: {
                    type: 'cylinder',
                    radiusTop: 1.18,
                    radiusBottom: 1.18,
                    height: 0.46,
                    uSegments: 48,
                    vSegments: 2,
                    uClosed: true,
                    vClosed: false,
                    uSeam: 0,
                    capRings: 2,
                    syncOppositeCap: true
                },
                transform: {
                    position: [0, 1.18, 0],
                    rotation: [0, 0, 1.57079632679],
                    scale: [1, 1, 1]
                }
            },
            {
                path: 'part.tire.inner',
                material: 'mat_void',
                primitive: {
                    type: 'cylinder',
                    radiusTop: 0.58,
                    radiusBottom: 0.58,
                    height: 0.62,
                    uSegments: 48,
                    vSegments: 2,
                    uClosed: true,
                    vClosed: false,
                    uSeam: 0,
                    capRings: 1,
                    syncOppositeCap: true
                },
                transform: {
                    position: [0, 1.18, 0],
                    rotation: [0, 0, 1.57079632679],
                    scale: [1, 1, 1]
                }
            }
        ],
        operations: []
    }, {
        materialsById: materials
    });
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
            objects: compiled.objects.map((obj) => buildParsedObjectFromCompiledObject(obj)),
            materials
        }
    );

    const result = runtime.objects.find((obj) => obj.id === 'part.tire.outer');
    assert.ok(result);
    const innerFaces = result.faces.filter((face) => face.id.includes('.face.bool.sub001.inner.'));
    assert.ok(innerFaces.length > 0);
    assert.equal(innerFaces.some((face) => face.vertexIndices.length === 3), false);
    assert.equal(innerFaces.some((face) => /\.f\d+$/.test(face.id)), false);
});

test('MeshBooleanPipeline: high radial-segment subtract (u=150) remains all inner quads', () => {
    const materials = new Map([
        ['mat_tire', {}],
        ['mat_void', {}]
    ]);
    const compiled = compileSemanticAuthoringDocument({
        version: 'mesh-semantic-authoring.v1',
        components: [
            {
                path: 'part.tire.outer',
                material: 'mat_tire',
                primitive: {
                    type: 'cylinder',
                    radiusTop: 1.18,
                    radiusBottom: 1.18,
                    height: 0.46,
                    uSegments: 150,
                    vSegments: 2,
                    uClosed: true,
                    vClosed: false,
                    uSeam: 11,
                    capRings: 2,
                    syncOppositeCap: true
                },
                transform: {
                    position: [0, 1.18, 0],
                    rotation: [0, 0, 1.57079632679],
                    scale: [1, 1, 1]
                }
            },
            {
                path: 'part.tire.inner',
                material: 'mat_void',
                primitive: {
                    type: 'cylinder',
                    radiusTop: 0.58,
                    radiusBottom: 0.58,
                    height: 0.62,
                    uSegments: 150,
                    vSegments: 2,
                    uClosed: true,
                    vClosed: false,
                    uSeam: 11,
                    capRings: 1,
                    syncOppositeCap: true
                },
                transform: {
                    position: [0, 1.18, 0],
                    rotation: [0, 0, 1.57079632679],
                    scale: [1, 1, 1]
                }
            }
        ],
        operations: []
    }, {
        materialsById: materials
    });
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
            objects: compiled.objects.map((obj) => buildParsedObjectFromCompiledObject(obj)),
            materials
        }
    );

    const result = runtime.objects.find((obj) => obj.id === 'part.tire.outer');
    assert.ok(result);
    const innerFaces = result.faces.filter((face) => face.id.includes('.face.bool.sub001.inner.'));
    assert.ok(innerFaces.length > 0);
    assert.equal(innerFaces.some((face) => face.vertexIndices.length === 3), false);
    assert.equal(innerFaces.some((face) => /\.f\d+$/.test(face.id)), false);
});
