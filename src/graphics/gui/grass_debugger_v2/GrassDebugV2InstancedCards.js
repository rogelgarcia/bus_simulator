// Orient both atlas normals with each randomized card instance.
// @ts-check
import * as THREE from 'three';
import { registerMaterialShaderHook } from '../../shaders/core/MaterialShaderHookRegistry.js';
import { attachShaderMetadata } from '../../shaders/core/ShaderLoader.js';
import { grassInstancedAtlasDeclarations as declarations, grassInstancedAtlasTransform as transform } from '../../shaders/materials/grass/GrassInstancedAtlasShaderLoader.js';

/** @param {THREE.MeshStandardMaterial} material Material used only by instanced cards. */
export function attachGrassDebugV2InstancedCardNormals(material) {
    attachShaderMetadata(material, declarations); attachShaderMetadata(material, transform);
    registerMaterialShaderHook(material, {
        id: 'grass.instanced_atlas_normals', priority: 100, variantKey: declarations.variantKey + '|' + transform.variantKey,
        apply: shader => {
            shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\n' + declarations.vertexSource)
                .replace('#include <beginnormal_vertex>', '#include <beginnormal_vertex>\n' + transform.vertexSource);
            shader.fragmentShader = shader.fragmentShader.replace('#include <normal_fragment_maps>', THREE.ShaderChunk.normal_fragment_maps)
                .replace(/\bnormalMatrix\b/g, 'vGrassInstanceAtlasNormal')
                .replace('#include <common>', '#include <common>\n' + declarations.fragmentSource);
        }
    });
}
