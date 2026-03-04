// Node unit tests: mesh fabrication parametric grid contract (Section 14).
import test from 'node:test';
import assert from 'node:assert/strict';
import {
    compileSemanticAuthoringDocument,
    MESH_PARAMETRIC_GRID_CONTRACT_VERSION
} from '../../../src/graphics/gui/mesh_fabrication/semanticMeshCompiler.js';

function buildAuthoringComponent(primitive) {
    return Object.freeze({
        path: 'part.parametric.sample',
        material: 'mat_a',
        primitive,
        transform: Object.freeze({
            position: Object.freeze([0, 0, 0]),
            rotation: Object.freeze([0, 0, 0]),
            scale: Object.freeze([1, 1, 1])
        })
    });
}

function buildAuthoringDocument(primitive) {
    return Object.freeze({
        version: 'mesh-semantic-authoring.v1',
        components: Object.freeze([buildAuthoringComponent(primitive)])
    });
}

test('SemanticMeshCompiler: cylinder adapter maps alias fields to u/v grid contract', () => {
    const compiled = compileSemanticAuthoringDocument(
        buildAuthoringDocument(Object.freeze({
            type: 'cylinder',
            radiusTop: 1.2,
            radiusBottom: 1.0,
            height: 2.5,
            radialSegments: 12,
            axialSegments: 3,
            seamAngle: 0.75,
            capRings: 2,
            syncOppositeCap: true
        })),
        {
            materialsById: new Map([
                ['mat_a', {}]
            ])
        }
    );

    assert.equal(compiled.idPolicy.parametricGridContract, MESH_PARAMETRIC_GRID_CONTRACT_VERSION);
    assert.equal(compiled.idPolicy.parametricCanonicalDerivation, 'uv_index_path');
    assert.equal(compiled.idPolicy.parametricIndexSpace, 'u_ccw_from_seam__v_top_to_bottom');
    assert.equal(compiled.idPolicy.retessellationPolicy, 'preserve_unaffected_create_new_never_recycle');

    const object = compiled.objects[0];
    assert.equal(object.parametric.contractVersion, MESH_PARAMETRIC_GRID_CONTRACT_VERSION);
    assert.equal(object.parametric.family, 'cylinder');
    assert.equal(object.parametric.grid.uSegments, 12);
    assert.equal(object.parametric.grid.vSegments, 3);
    assert.equal(object.parametric.grid.uClosed, true);
    assert.equal(object.parametric.grid.vClosed, false);
    assert.equal(object.parametric.extensions.capRings, 2);
    assert.equal(object.parametric.extensions.topCapRings, 2);
    assert.equal(object.parametric.extensions.bottomCapRings, 2);
    assert.equal(object.parametric.extensions.syncOppositeCap, true);
    assert.equal(object.parametric.extensions.capCenterFill, 'ngon');
    assert.equal(object.parametric.extensions.topCapCenterFill, 'ngon');
    assert.equal(object.parametric.extensions.bottomCapCenterFill, 'ngon');

    assert.ok(object.vertexIds.includes('part.parametric.sample.vertex.u000.v000'));
    assert.ok(object.vertexIds.includes('part.parametric.sample.vertex.u011.v003'));
    assert.ok(object.faceIds.includes('part.parametric.sample.face.u000.v000'));
    assert.ok(object.faceCanonicalLabels.includes('side.v000.s000'));
    assert.ok(object.faceCanonicalLabels.includes('top'));
    assert.ok(object.faceCanonicalLabels.includes('bottom'));
});

test('SemanticMeshCompiler: u/v derived IDs remain stable for overlapping index ranges after retessellation', () => {
    const compileWithSegments = (uSegments, vSegments) => compileSemanticAuthoringDocument(
        buildAuthoringDocument(Object.freeze({
            type: 'cylinder',
            radius: 1.0,
            height: 2.0,
            uSegments,
            vSegments
        })),
        {
            materialsById: new Map([
                ['mat_a', {}]
            ])
        }
    ).objects[0];

    const coarse = compileWithSegments(8, 2);
    const dense = compileWithSegments(12, 4);
    const denseVertexIds = new Set(dense.vertexIds);
    const denseFaceIds = new Set(dense.faceIds);

    for (let v = 0; v <= 2; v++) {
        for (let u = 0; u < 8; u++) {
            const vertexId = `part.parametric.sample.vertex.u${String(u).padStart(3, '0')}.v${String(v).padStart(3, '0')}`;
            assert.ok(denseVertexIds.has(vertexId), `missing preserved vertex id ${vertexId}`);
        }
    }
    for (let v = 0; v < 2; v++) {
        for (let u = 0; u < 8; u++) {
            const faceId = `part.parametric.sample.face.u${String(u).padStart(3, '0')}.v${String(v).padStart(3, '0')}`;
            assert.ok(denseFaceIds.has(faceId), `missing preserved face id ${faceId}`);
        }
    }
    assert.ok(coarse.seedFaceIds.sideStart);
    assert.equal(coarse.seedFaceIds.top, 'part.parametric.sample.face.seed.top');
    assert.equal(coarse.seedFaceIds.bottom, 'part.parametric.sample.face.seed.bottom');
});

test('SemanticMeshCompiler: cylinder capCenterFill tri_fan emits deterministic center fan IDs', () => {
    const compiled = compileSemanticAuthoringDocument(
        buildAuthoringDocument(Object.freeze({
            type: 'cylinder',
            radius: 1.0,
            height: 2.0,
            uSegments: 12,
            vSegments: 1,
            capRings: 1,
            capCenterFill: 'tri_fan'
        })),
        {
            materialsById: new Map([
                ['mat_a', {}]
            ])
        }
    );

    const object = compiled.objects[0];
    assert.equal(object.parametric.extensions.capCenterFill, 'tri_fan');
    assert.equal(object.parametric.extensions.topCapCenterFill, 'tri_fan');
    assert.equal(object.parametric.extensions.bottomCapCenterFill, 'tri_fan');

    assert.ok(object.vertexIds.includes('part.parametric.sample.vertex.cap.top.center'));
    assert.ok(object.vertexIds.includes('part.parametric.sample.vertex.cap.bottom.center'));
    assert.ok(object.faceIds.includes('part.parametric.sample.face.cap.top.center.u000'));
    assert.ok(object.faceIds.includes('part.parametric.sample.face.cap.bottom.center.u000'));
    assert.equal(object.faceIds.includes('part.parametric.sample.face.seed.top'), false);
    assert.equal(object.faceIds.includes('part.parametric.sample.face.seed.bottom'), false);
    assert.ok(object.faceCanonicalLabels.includes('top.center.s000'));
    assert.ok(object.faceCanonicalLabels.includes('bottom.center.s000'));
    assert.equal(object.seedFaceIds.top, 'part.parametric.sample.face.cap.top.center.u000');
    assert.equal(object.seedFaceIds.bottom, 'part.parametric.sample.face.cap.bottom.center.u000');
});

test('SemanticMeshCompiler: syncOppositeCap enforces matching cap center fill overrides', () => {
    assert.throws(
        () => compileSemanticAuthoringDocument(
            buildAuthoringDocument(Object.freeze({
                type: 'cylinder',
                radius: 1.0,
                height: 2.0,
                syncOppositeCap: true,
                topCapCenterFill: 'ngon',
                bottomCapCenterFill: 'tri_fan'
            })),
            {
                materialsById: new Map([
                    ['mat_a', {}]
                ])
            }
        ),
        /syncOppositeCap=true requires topCapCenterFill and bottomCapCenterFill to match/i
    );
});

test('SemanticMeshCompiler: declared revolve adapter is recognized but non-executable', () => {
    assert.throws(
        () => compileSemanticAuthoringDocument(
            buildAuthoringDocument(Object.freeze({
                type: 'revolve',
                uSegments: 16,
                vSegments: 8
            })),
            {
                materialsById: new Map([
                    ['mat_a', {}]
                ])
            }
        ),
        /declared parametric adapter but is not executable/i
    );
});

test('SemanticMeshCompiler: tube adapter compiles deterministic outer/inner/ring topology', () => {
    const compiled = compileSemanticAuthoringDocument(
        buildAuthoringDocument(Object.freeze({
            type: 'tube',
            outerRadiusTop: 1.2,
            outerRadiusBottom: 1.0,
            innerRadiusTop: 0.7,
            innerRadiusBottom: 0.5,
            height: 2.5,
            radialSegments: 10,
            axialSegments: 2,
            seamAngle: 0.35,
            faceAliases: Object.freeze({
                'top_ring.s000': 'rim_anchor'
            })
        })),
        {
            materialsById: new Map([
                ['mat_a', {}]
            ])
        }
    );

    const object = compiled.objects[0];
    assert.equal(object.parametric.family, 'tube');
    assert.equal(object.parametric.grid.uSegments, 10);
    assert.equal(object.parametric.grid.vSegments, 2);
    assert.equal(object.parametric.grid.uClosed, true);
    assert.equal(object.parametric.grid.vClosed, false);
    assert.equal(object.parametric.dimensions.outerRadiusTop, 1.2);
    assert.equal(object.parametric.dimensions.outerRadiusBottom, 1.0);
    assert.equal(object.parametric.dimensions.innerRadiusTop, 0.7);
    assert.equal(object.parametric.dimensions.innerRadiusBottom, 0.5);

    assert.ok(object.vertexIds.includes('part.parametric.sample.vertex.outer.u000.v000'));
    assert.ok(object.vertexIds.includes('part.parametric.sample.vertex.inner.u009.v002'));
    assert.ok(object.faceIds.includes('part.parametric.sample.face.outer.u000.v000'));
    assert.ok(object.faceIds.includes('part.parametric.sample.face.inner.u000.v000'));
    assert.ok(object.faceIds.includes('part.parametric.sample.face.top_ring.u000'));
    assert.ok(object.faceIds.includes('part.parametric.sample.face.bottom_ring.u000'));
    assert.ok(object.faceCanonicalLabels.includes('outer.v000.s000'));
    assert.ok(object.faceCanonicalLabels.includes('inner.v000.s000'));
    assert.ok(object.faceCanonicalLabels.includes('top_ring.s000'));
    assert.ok(object.faceCanonicalLabels.includes('bottom_ring.s000'));
    assert.equal(object.seedFaceIds.outerStart, 'part.parametric.sample.face.outer.u000.v000');
    assert.equal(object.seedFaceIds.innerStart, 'part.parametric.sample.face.inner.u000.v000');
    assert.equal(object.seedFaceIds.topRingStart, 'part.parametric.sample.face.top_ring.u000');
    assert.equal(object.seedFaceIds.bottomRingStart, 'part.parametric.sample.face.bottom_ring.u000');

    const topRingIndex = object.faceCanonicalLabels.indexOf('top_ring.s000');
    assert.ok(topRingIndex >= 0);
    assert.equal(object.faceLabels[topRingIndex], 'rim_anchor');
});

test('SemanticMeshCompiler: tube validates deterministic radius constraints', () => {
    assert.throws(
        () => compileSemanticAuthoringDocument(
            buildAuthoringDocument(Object.freeze({
                type: 'tube',
                outerRadiusTop: 1.0,
                outerRadiusBottom: 1.0,
                innerRadiusTop: 1.0,
                innerRadiusBottom: 0.5,
                height: 2.0
            })),
            {
                materialsById: new Map([
                    ['mat_a', {}]
                ])
            }
        ),
        /innerRadiusTop must be < component\.primitive\.outerRadiusTop/i
    );

    assert.throws(
        () => compileSemanticAuthoringDocument(
            buildAuthoringDocument(Object.freeze({
                type: 'tube',
                outerRadius: 1.0,
                innerRadius: -0.1,
                height: 2.0
            })),
            {
                materialsById: new Map([
                    ['mat_a', {}]
                ])
            }
        ),
        /component\.primitive\.innerRadiusTop must be > 0/i
    );
});

test('SemanticMeshCompiler: tube u/v IDs remain stable for overlapping index ranges after retessellation', () => {
    const compileWithSegments = (uSegments, vSegments) => compileSemanticAuthoringDocument(
        buildAuthoringDocument(Object.freeze({
            type: 'tube',
            outerRadius: 1.2,
            innerRadius: 0.7,
            height: 2.0,
            uSegments,
            vSegments
        })),
        {
            materialsById: new Map([
                ['mat_a', {}]
            ])
        }
    ).objects[0];

    const coarse = compileWithSegments(8, 2);
    const dense = compileWithSegments(12, 4);
    const denseVertexIds = new Set(dense.vertexIds);
    const denseFaceIds = new Set(dense.faceIds);

    for (let v = 0; v <= 2; v++) {
        for (let u = 0; u < 8; u++) {
            const uLabel = String(u).padStart(3, '0');
            const vLabel = String(v).padStart(3, '0');
            assert.ok(
                denseVertexIds.has(`part.parametric.sample.vertex.outer.u${uLabel}.v${vLabel}`),
                `missing preserved outer vertex id u${uLabel}.v${vLabel}`
            );
            assert.ok(
                denseVertexIds.has(`part.parametric.sample.vertex.inner.u${uLabel}.v${vLabel}`),
                `missing preserved inner vertex id u${uLabel}.v${vLabel}`
            );
        }
    }

    for (let v = 0; v < 2; v++) {
        for (let u = 0; u < 8; u++) {
            const uLabel = String(u).padStart(3, '0');
            const vLabel = String(v).padStart(3, '0');
            assert.ok(
                denseFaceIds.has(`part.parametric.sample.face.outer.u${uLabel}.v${vLabel}`),
                `missing preserved outer face id u${uLabel}.v${vLabel}`
            );
            assert.ok(
                denseFaceIds.has(`part.parametric.sample.face.inner.u${uLabel}.v${vLabel}`),
                `missing preserved inner face id u${uLabel}.v${vLabel}`
            );
        }
    }

    for (let u = 0; u < 8; u++) {
        const uLabel = String(u).padStart(3, '0');
        assert.ok(
            denseFaceIds.has(`part.parametric.sample.face.top_ring.u${uLabel}`),
            `missing preserved top ring face id u${uLabel}`
        );
        assert.ok(
            denseFaceIds.has(`part.parametric.sample.face.bottom_ring.u${uLabel}`),
            `missing preserved bottom ring face id u${uLabel}`
        );
    }

    assert.equal(coarse.seedFaceIds.outerStart, 'part.parametric.sample.face.outer.u000.v000');
    assert.equal(coarse.seedFaceIds.innerStart, 'part.parametric.sample.face.inner.u000.v000');
    assert.equal(coarse.seedFaceIds.topRingStart, 'part.parametric.sample.face.top_ring.u000');
    assert.equal(coarse.seedFaceIds.bottomRingStart, 'part.parametric.sample.face.bottom_ring.u000');
});

test('SemanticMeshCompiler: tube operations resolve canonical and authored alias face targets', () => {
    const compiled = compileSemanticAuthoringDocument(
        Object.freeze({
            version: 'mesh-semantic-authoring.v1',
            components: Object.freeze([
                Object.freeze({
                    path: 'part.parametric.sample',
                    material: 'mat_a',
                    primitive: Object.freeze({
                        type: 'tube',
                        outerRadius: 1.1,
                        innerRadius: 0.6,
                        height: 2.0,
                        radialSegments: 12,
                        axialSegments: 1,
                        faceAliases: Object.freeze({
                            'top_ring.s000': 'rim_anchor'
                        })
                    }),
                    operations: Object.freeze([
                        Object.freeze({
                            opId: 'ext_outer',
                            type: 'extrude_face',
                            targetFace: 'outer.s000',
                            distance: 0.1
                        }),
                        Object.freeze({
                            opId: 'ext_rim',
                            type: 'extrude_face',
                            targetFace: 'rim_anchor',
                            distance: 0.08
                        })
                    ]),
                    transform: Object.freeze({
                        position: Object.freeze([0, 0, 0]),
                        rotation: Object.freeze([0, 0, 0]),
                        scale: Object.freeze([1, 1, 1])
                    })
                })
            ])
        }),
        {
            materialsById: new Map([
                ['mat_a', {}]
            ])
        }
    );

    const object = compiled.objects[0];
    assert.equal(object.operationLineage.length, 2);
    assert.equal(object.operationLineage[0].targetFaceId, 'part.parametric.sample.face.outer.u000.v000');
    assert.equal(object.operationLineage[1].targetFaceId, 'part.parametric.sample.face.top_ring.u000');
    assert.ok(object.faceIds.some((faceId) => faceId.startsWith('part.parametric.sample.face.op.ext_outer.cap.r0')));
    assert.ok(object.faceIds.some((faceId) => faceId.startsWith('part.parametric.sample.face.op.ext_rim.cap.r0')));
});
