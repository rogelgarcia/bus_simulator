// Keep real two-card leaves in the outer five centimetres, fading into the raised canopy.
// @ts-check
import * as THREE from 'three';
import { createGrassDebugV2PlantCardMaterial } from './GrassDebugV2PlantCardMaterial.js';
import { attachGrassDebugV2InstancedCardNormals } from './GrassDebugV2InstancedCards.js';
import { registerMaterialShaderHook } from '../../shaders/core/MaterialShaderHookRegistry.js';
import { attachShaderMetadata } from '../../shaders/core/ShaderLoader.js';
import { grassEdgeFadeDeclarations, grassEdgeFadeShader } from '../../shaders/materials/grass/GrassEdgeFadeShaderLoader.js';

function attachFade(material, surfaceHeight) {
    const uniforms = { grassEdgeSurfaceHeight: { value: surfaceHeight } };
    attachShaderMetadata(material, grassEdgeFadeDeclarations); attachShaderMetadata(material, grassEdgeFadeShader);
    registerMaterialShaderHook(material, {
        id: 'grass.edge.fade', priority: 200, variantKey: grassEdgeFadeDeclarations.variantKey + '|' + grassEdgeFadeShader.variantKey, uniforms,
        apply: shader => {
            Object.assign(shader.uniforms, uniforms);
            shader.vertexShader = shader.vertexShader
                .replace('#include <common>', '#include <common>\n' + grassEdgeFadeDeclarations.vertexSource)
                .replace('#include <project_vertex>', grassEdgeFadeShader.vertexSource + '\n#include <project_vertex>');
            shader.fragmentShader = shader.fragmentShader
                .replace('#include <common>', '#include <common>\n' + grassEdgeFadeDeclarations.fragmentSource)
                .replace('#include <alphamap_fragment>', '#include <alphamap_fragment>\n' + grassEdgeFadeShader.fragmentSource);
        }
    });
}

/** @param {{source:THREE.Group,surfaceHeight:number,x:number,z:number,edgeDepth?:number}} options */
export function createGrassDebugV2EdgeLeaves({ source, surfaceHeight, x, z, edgeDepth = 0.05 }) {
    if (!(surfaceHeight > 0) || !Number.isFinite(x) || !Number.isFinite(z)) throw new Error('Edge leaves require a valid raised patch.');
    const group = new THREE.Group(), matrix = new THREE.Matrix4(), root = new THREE.Vector3(), entries = [];
    if (!(edgeDepth > 0 && edgeDepth < 0.5)) throw new Error('Invalid grass edge depth.');
    let leaves = 0;
    group.name = 'GrassV2EdgeLeaves'; group.position.set(x, 0, z);
    for (const original of source.children.filter(mesh => mesh.isInstancedMesh)) {
        if (original.geometry.index.count !== 12) throw new Error('Edge leaves require LOD3 · 2 geometry.');
        const indices = [];
        for (let i = 0; i < original.count; i++) {
            original.getMatrixAt(i, matrix); root.setFromMatrixPosition(matrix);
            if (Math.max(Math.abs(root.x), Math.abs(root.z)) >= 0.5 - edgeDepth) indices.push(i);
        }
        const originalMaterial = original.material;
        const shading = createGrassDebugV2PlantCardMaterial({ coverage: originalMaterial.map, albedo: originalMaterial.map,
            normal: originalMaterial.normalMap, roughness: originalMaterial.roughnessMap });
        attachGrassDebugV2InstancedCardNormals(shading.material); attachFade(shading.material, surfaceHeight);
        const depth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: originalMaterial.map,
            alphaTest: originalMaterial.alphaTest, side: THREE.DoubleSide });
        attachFade(depth, surfaceHeight);
        const mesh = new THREE.InstancedMesh(original.geometry, shading.material, indices.length);
        indices.forEach((index, i) => { original.getMatrixAt(index, matrix); mesh.setMatrixAt(i, matrix); });
        mesh.name = 'GrassV2EdgeLeaves-LOD3-2'; mesh.instanceMatrix.needsUpdate = true;
        mesh.castShadow = mesh.receiveShadow = true; mesh.customDepthMaterial = depth;
        mesh.computeBoundingBox(); mesh.computeBoundingSphere(); group.add(mesh); leaves += indices.length;
        entries.push({ mesh, shading, depth, originalMaterial, indices: Object.freeze(indices) });
    }
    return Object.freeze({ group, entries: Object.freeze(entries), leaves,
        setNormalFacing: enabled => entries.forEach(({ shading }) => shading.setNormalFacing(enabled)),
        setAlphaCoverage: enabled => entries.forEach(({ shading, originalMaterial, depth }) => {
            shading.setAlphaCoverage(enabled); shading.material.map = depth.map = originalMaterial.map;
        }),
        getSnapshot: () => ({ leaves, cards: leaves * 2, triangles: leaves * 4, lod: 'LOD3 · 2', edgeDepth, surfaceHeight,
            fade: { inwardStart: 0.035, inwardEnd: 0.065, belowSurface: 0.002, aboveSurface: 0.016, space: 'patch-local', cellMeters: 1 / 1600 } }),
        dispose: () => entries.forEach(({ mesh, shading, depth }) => { mesh.dispose(); shading.material.dispose(); depth.dispose(); })
    });
}
