// Relight a grass floor bake with the captured normals and smooth visible-side shading.
// @ts-check
import * as THREE from 'three';
import { createGrassDebugV2Material } from './GrassDebugV2Material.js';
import { grassFloorFacingShader, grassFloorLightingShader } from '../../shaders/materials/grass/GrassFloorFacingShaderLoader.js';
import { grassPlantFacingDeclarationsShader } from '../../shaders/materials/grass/GrassPlantFacingShaderLoader.js';
import { attachShaderMetadata } from '../../shaders/core/ShaderLoader.js';
import { registerMaterialShaderHook } from '../../shaders/core/MaterialShaderHookRegistry.js';

/** @param {{albedo:THREE.Texture,normal:THREE.Texture,roughness:THREE.Texture}} textures @param {{canopyContrast?:number,canopyOcclusionStrength?:number,leafColorScale?:THREE.Vector3,captureToCard?:THREE.Matrix3|null}} options @returns {THREE.MeshStandardMaterial} */
export function createGrassDebugV2FloorMaterial(textures, { canopyContrast = 1, canopyOcclusionStrength = 1, leafColorScale = new THREE.Vector3(1, 1, 1), captureToCard = null } = {}) {
    if (!Number.isFinite(canopyContrast) || canopyContrast < 0 || canopyContrast > 1) throw new Error('Canopy contrast must be between zero and one.');
    if (!Number.isFinite(canopyOcclusionStrength) || canopyOcclusionStrength < 0 || canopyOcclusionStrength > 1) throw new Error('Canopy occlusion strength must be between zero and one.');
    if (!leafColorScale.toArray().every(value => Number.isFinite(value) && value > 0)) throw new Error('Leaf color scale must be positive.');
    if (captureToCard && !captureToCard.elements.every(Number.isFinite)) throw new Error('Capture frame must be finite.');
    const uniforms = { grassFloorLeafColorScale: { value: leafColorScale } };
    if (captureToCard) uniforms.grassFloorCaptureToCard = { value: captureToCard };
    const material = createGrassDebugV2Material({ map: textures.albedo, normalMap: textures.normal,
        normalMapType: THREE.TangentSpaceNormalMap, roughnessMap: textures.roughness, roughness: 1 });
    material.userData.grassFloorLeafColorScale = uniforms.grassFloorLeafColorScale;
    material.defines = { ...material.defines, GRASS_FLOOR_OCCLUSION_STRENGTH: canopyOcclusionStrength.toFixed(3) };
    if (captureToCard) material.defines = { ...material.defines, GRASS_FLOOR_CAPTURE_FRAME: 1 };
    if (textures.albedo.userData.grassCanopyHeight) material.defines = { ...material.defines, GRASS_FLOOR_HEIGHT: 1, GRASS_FLOOR_CONTRAST: canopyContrast.toFixed(3) };
    if (textures.roughness.userData.grassSoilContributions) material.defines = { ...material.defines, GRASS_FLOOR_CONTRIBUTIONS: 1 };
    attachShaderMetadata(material, grassFloorFacingShader); attachShaderMetadata(material, grassPlantFacingDeclarationsShader);
    attachShaderMetadata(material, grassFloorLightingShader);
    registerMaterialShaderHook(material, {
        id: 'grass.floor.facing', variantKey: grassFloorFacingShader.variantKey + '|' + grassPlantFacingDeclarationsShader.variantKey + '|' + grassFloorLightingShader.variantKey,
        uniforms,
        apply: shader => {
            Object.assign(shader.uniforms, uniforms);
            if (!THREE.ShaderChunk.normal_fragment_maps.includes('texture2D( normalMap, vNormalMapUv ).xyz')
                || !shader.fragmentShader.includes('#include <normal_fragment_maps>')
                || !shader.fragmentShader.includes('#define RE_Direct RE_Direct_Grass')) throw new Error('Floor grass lighting shader contract changed.');
            shader.fragmentShader = shader.fragmentShader
                .replace('#include <common>', '#include <common>\n' + grassPlantFacingDeclarationsShader.fragmentSource)
                .replace('#include <normal_fragment_maps>', grassFloorFacingShader.fragmentSource.replace('#include <normal_fragment_maps>',
                    THREE.ShaderChunk.normal_fragment_maps.replace('texture2D( normalMap, vNormalMapUv ).xyz', 'grassFloorNormalTexel.xyz')))
                .replace('#define RE_Direct RE_Direct_Grass', '#define RE_Direct RE_Direct_Grass\n' + grassFloorLightingShader.fragmentSource);
        }
    });
    return material;
}
