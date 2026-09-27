// Capture grass PBR channels with the same cutouts and transformed atlas normals as live LOD cards.
// @ts-check
import * as THREE from 'three';
import { attachGrassDebugV2InstancedCardNormals } from './GrassDebugV2InstancedCards.js';
import { grassPatchCaptureShader } from '../../shaders/materials/grass/GrassFloorBakeShaderLoader.js';
import { grassPlantCoverageShader } from '../../shaders/materials/grass/GrassPlantCoverageShaderLoader.js';
import { attachShaderMetadata } from '../../shaders/core/ShaderLoader.js';
import { registerMaterialShaderHook } from '../../shaders/core/MaterialShaderHookRegistry.js';

/** @param {THREE.MeshStandardMaterial} original @param {'albedo'|'normal'|'roughness'|'height'|'visibility'} channel @param {boolean} floor @param {number} sourceHeight */
export function createGrassDebugV2PatchBakeMaterial(original, channel, floor, sourceHeight = 1) {
    const material = new THREE.MeshStandardMaterial({
        map: original.map, color: original.color, vertexColors: original.vertexColors,
        normalMap: original.normalMap, normalMapType: original.normalMapType, normalScale: original.normalScale,
        roughnessMap: original.roughnessMap, roughness: original.roughness,
        alphaMap: original.alphaMap, alphaTest: original.alphaTest, alphaToCoverage: original.alphaToCoverage,
        side: THREE.DoubleSide, toneMapped: false
    });
    material.defines = { GRASS_PATCH_BAKE_CHANNEL: ['albedo', 'normal', 'roughness', 'height', 'visibility'].indexOf(channel) };
    if (floor) material.defines.GRASS_PATCH_BAKE_FLOOR = 1;
    material.defines.GRASS_PATCH_HEIGHT = sourceHeight.toFixed(9);
    attachShaderMetadata(material, grassPatchCaptureShader);
    registerMaterialShaderHook(material, {
        id: 'grass.patch.capture', variantKey: grassPatchCaptureShader.variantKey,
        apply: shader => {
            if (!shader.fragmentShader.includes('#include <opaque_fragment>')) throw new Error('Grass patch capture output contract changed.');
            shader.fragmentShader = shader.fragmentShader.replace('#include <opaque_fragment>', grassPatchCaptureShader.fragmentSource);
            if (channel === 'visibility') shader.fragmentShader = shader.fragmentShader.replace('#include <shadowmap_pars_fragment>',
                '#include <shadowmap_pars_fragment>\n#include <shadowmask_pars_fragment>');
        }
    });
    if (original.alphaToCoverage) {
        attachShaderMetadata(material, grassPlantCoverageShader);
        registerMaterialShaderHook(material, { id: 'grass.patch.coverage', variantKey: grassPlantCoverageShader.variantKey,
            apply: shader => { shader.fragmentShader = shader.fragmentShader.replace('#include <alphatest_fragment>', grassPlantCoverageShader.fragmentSource); } });
    }
    if (original.normalMap && original.normalMapType === THREE.ObjectSpaceNormalMap)
        attachGrassDebugV2InstancedCardNormals(material);
    return material;
}
