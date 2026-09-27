// Share the atlas material and correction controls across full patches and perimeter leaves.
// @ts-check
import * as THREE from 'three';
import { GRASS_V2_PLANT_ALPHA_TEST } from './GrassDebugV2PlantCardAtlas.js';
import { createGrassDebugV2Material } from './GrassDebugV2Material.js';
import { grassPlantFacingShader, grassPlantFacingSurfaceShader, grassPlantFacingDeclarationsShader } from '../../shaders/materials/grass/GrassPlantFacingShaderLoader.js';
import { grassPlantCoverageShader } from '../../shaders/materials/grass/GrassPlantCoverageShaderLoader.js';
import { attachShaderMetadata } from '../../shaders/core/ShaderLoader.js';
import { registerMaterialShaderHook, updateMaterialShaderHook } from '../../shaders/core/MaterialShaderHookRegistry.js';


/** @param {{coverage:THREE.Texture,albedo:THREE.Texture,normal:THREE.Texture,roughness:THREE.Texture}} atlas */
export function createGrassDebugV2PlantCardMaterial(atlas) {
    const material = createGrassDebugV2Material({ map: atlas.coverage, normalMap: atlas.normal, normalMapType: THREE.ObjectSpaceNormalMap,
        roughnessMap: atlas.roughness, roughness: 1, alphaTest: GRASS_V2_PLANT_ALPHA_TEST, alphaToCoverage: true });
    let normalFacing = true, alphaCoverage = true;
    attachShaderMetadata(material, grassPlantFacingShader);
    registerMaterialShaderHook(material, { id: 'grass.plant.facing', variantKey: `${grassPlantFacingShader.variantKey}|${grassPlantFacingSurfaceShader.variantKey}|${grassPlantFacingDeclarationsShader.variantKey}`,
        apply: shader => {
            const anchor = '#include <normal_fragment_maps>';
            if (!shader.fragmentShader.includes(anchor)) throw new Error('Plant normal-facing shader contract changed.');
            const surfaceAnchor = '#include <roughnessmap_fragment>';
            if (!shader.fragmentShader.includes(surfaceAnchor)) throw new Error('Plant surface-facing shader contract changed.');
            const commonAnchor = '#include <common>';
            if (!shader.fragmentShader.includes(commonAnchor)) throw new Error('Plant facing declarations contract changed.');
            shader.fragmentShader = shader.fragmentShader.replace(commonAnchor, commonAnchor + '\n' + grassPlantFacingDeclarationsShader.fragmentSource)
                .replace(surfaceAnchor, grassPlantFacingSurfaceShader.fragmentSource)
                .replace(anchor, grassPlantFacingShader.fragmentSource);
        } });
    const setNormalFacing = enabled => { normalFacing = !!enabled; updateMaterialShaderHook(material, 'grass.plant.facing', { enabled: normalFacing }); };
    attachShaderMetadata(material, grassPlantCoverageShader);
    registerMaterialShaderHook(material, { id: 'grass.plant.coverage', variantKey: grassPlantCoverageShader.variantKey,
        apply: shader => {
            const anchor = '#include <alphatest_fragment>';
            if (!shader.fragmentShader.includes(anchor)) throw new Error('Plant alpha-coverage shader contract changed.');
            shader.fragmentShader = shader.fragmentShader.replace(anchor, grassPlantCoverageShader.fragmentSource);
        } });
    const setAlphaCoverage = enabled => {
        alphaCoverage = !!enabled; material.map = alphaCoverage ? atlas.coverage : atlas.albedo;
        updateMaterialShaderHook(material, 'grass.plant.coverage', { enabled: alphaCoverage });
    };
    return Object.freeze({ material, setNormalFacing, setAlphaCoverage,
        getCorrections: () => ({ normalFacing, alphaCoverage }) });
}
