// Node unit tests: mesh fabrication primitive registry and compiler routing (Section 19).
import test from 'node:test';
import assert from 'node:assert/strict';
import {
    compileBoxPrimitiveSeedState,
    compileCylinderPrimitiveSeedState,
    compileTubePrimitiveSeedState,
    createPrimitiveCompilerRegistry
} from '../../../src/graphics/gui/mesh_fabrication/primitives/index.js';
import { compileSemanticAuthoringDocument } from '../../../src/graphics/gui/mesh_fabrication/semanticMeshCompiler.js';

test('PrimitiveRegistry: data-driven dispatcher maps primitive type to compiler module', () => {
    const calls = [];
    const registry = createPrimitiveCompilerRegistry({
        box: (args) => {
            calls.push(['box', args.componentPath]);
            return 'box_result';
        },
        cylinder: (args) => {
            calls.push(['cylinder', args.componentPath]);
            return 'cylinder_result';
        },
        tube: (args) => {
            calls.push(['tube', args.componentPath]);
            return 'tube_result';
        }
    });

    assert.equal(registry.has('box'), true);
    assert.equal(registry.has('cone'), false);
    assert.deepEqual(registry.listTypes(), ['box', 'cylinder', 'tube']);
    assert.equal(registry.get('box')({ componentPath: 'part.box' }), 'box_result');
    assert.equal(registry.get('cylinder')({ componentPath: 'part.cyl' }), 'cylinder_result');
    assert.equal(registry.get('tube')({ componentPath: 'part.tube' }), 'tube_result');
    assert.deepEqual(calls, [
        ['box', 'part.box'],
        ['cylinder', 'part.cyl'],
        ['tube', 'part.tube']
    ]);
});

test('Primitive compiler module wrappers call provided compile callback', () => {
    const seen = [];
    const compileSeedState = (componentPath, primitive) => {
        seen.push([componentPath, primitive.type]);
        return { id: componentPath, type: primitive.type };
    };

    const box = compileBoxPrimitiveSeedState({
        componentPath: 'part.box',
        primitive: { type: 'box' },
        faceAliasesByCanonical: new Map(),
        compileSeedState
    });
    const cylinder = compileCylinderPrimitiveSeedState({
        componentPath: 'part.cylinder',
        primitive: { type: 'cylinder' },
        faceAliasesByCanonical: new Map(),
        compileSeedState
    });
    const tube = compileTubePrimitiveSeedState({
        componentPath: 'part.tube',
        primitive: { type: 'tube' },
        faceAliasesByCanonical: new Map(),
        compileSeedState
    });

    assert.deepEqual(seen, [
        ['part.box', 'box'],
        ['part.cylinder', 'cylinder'],
        ['part.tube', 'tube']
    ]);
    assert.deepEqual(box, { id: 'part.box', type: 'box' });
    assert.deepEqual(cylinder, { id: 'part.cylinder', type: 'cylinder' });
    assert.deepEqual(tube, { id: 'part.tube', type: 'tube' });
});

test('SemanticMeshCompiler: primitive routing remains functional through registry path', () => {
    const authoring = Object.freeze({
        version: 'mesh-semantic-authoring.v1',
        components: Object.freeze([
            Object.freeze({
                path: 'part.box',
                material: 'mat_default',
                primitive: Object.freeze({
                    type: 'box',
                    size: Object.freeze([2, 1, 3])
                }),
                transform: Object.freeze({
                    position: Object.freeze([0, 0, 0]),
                    rotation: Object.freeze([0, 0, 0]),
                    scale: Object.freeze([1, 1, 1])
                })
            }),
            Object.freeze({
                path: 'part.cyl',
                material: 'mat_default',
                primitive: Object.freeze({
                    type: 'cylinder',
                    radius: 1,
                    height: 2,
                    uSegments: 8,
                    vSegments: 1
                }),
                transform: Object.freeze({
                    position: Object.freeze([0, 0, 0]),
                    rotation: Object.freeze([0, 0, 0]),
                    scale: Object.freeze([1, 1, 1])
                })
            }),
            Object.freeze({
                path: 'part.tube',
                material: 'mat_default',
                primitive: Object.freeze({
                    type: 'tube',
                    outerRadius: 1,
                    innerRadius: 0.5,
                    height: 2,
                    uSegments: 8,
                    vSegments: 1
                }),
                transform: Object.freeze({
                    position: Object.freeze([0, 0, 0]),
                    rotation: Object.freeze([0, 0, 0]),
                    scale: Object.freeze([1, 1, 1])
                })
            })
        ])
    });

    const compiled = compileSemanticAuthoringDocument(authoring, {
        materialsById: new Map([['mat_default', {}]])
    });

    assert.equal(compiled.objects.length, 3);
    assert.equal(compiled.objects[0].primitiveType, 'box');
    assert.equal(compiled.objects[1].primitiveType, 'cylinder');
    assert.equal(compiled.objects[2].primitiveType, 'tube');
});
