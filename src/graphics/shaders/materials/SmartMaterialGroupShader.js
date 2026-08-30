// Shader patch used by the generic material-group merger.
import * as THREE from 'three';
import {
    attachShaderMetadata,
    createShaderPayload,
    loadShaderSourceSet
} from '../core/ShaderLoader.js';

const SHADER_VERSION = 1;
const SHADER_SOURCES = await loadShaderSourceSet({
    vertexPath: 'materials/smart_material_groups.vert.glsl',
    fragmentPath: 'materials/smart_material_groups.frag.glsl'
});
const SHADER_PAYLOAD = createShaderPayload({
    shaderId: 'material.smart_material_groups',
    sourceSet: SHADER_SOURCES
});

function replaceRequired(source, search, replacement, label) {
    if (!source.includes(search)) {
        throw new Error(`[SmartMaterialGroupShader] Missing ${label} shader anchor.`);
    }
    return source.replace(search, replacement);
}

function patchedPhysicalLightingChunk() {
    const source = String(THREE.ShaderChunk?.lights_physical_fragment ?? '');
    if (!source) throw new Error('[SmartMaterialGroupShader] Missing lights_physical_fragment.');

    let patched = replaceRequired(
        source,
        'material.clearcoat = clearcoat;',
        'material.clearcoat = smartMaterialGroupsClearcoat();',
        'clearcoat assignment'
    );
    patched = replaceRequired(
        patched,
        'material.clearcoatRoughness = clearcoatRoughness;',
        'material.clearcoatRoughness = smartMaterialGroupsClearcoatRoughness();',
        'clearcoat roughness assignment'
    );
    return patched;
}

export function applySmartMaterialGroupShader(material) {
    if (!material?.isMeshPhysicalMaterial) return material;
    if (material.userData?.smartMaterialGroupShader === SHADER_VERSION) return material;

    const previousCompile = typeof material.onBeforeCompile === 'function'
        ? material.onBeforeCompile.bind(material)
        : null;
    material.onBeforeCompile = (shader, renderer) => {
        previousCompile?.(shader, renderer);

        shader.vertexShader = replaceRequired(
            shader.vertexShader,
            '#include <common>',
            `#include <common>\n${SHADER_PAYLOAD.vertexSource}`,
            'vertex common'
        );
        shader.vertexShader = replaceRequired(
            shader.vertexShader,
            '#include <begin_vertex>',
            '#include <begin_vertex>\nsmartMaterialGroupsTransfer();',
            'vertex begin'
        );

        shader.fragmentShader = replaceRequired(
            shader.fragmentShader,
            '#include <map_pars_fragment>',
            `#include <map_pars_fragment>\n${SHADER_PAYLOAD.fragmentSource}`,
            'fragment map pars'
        );
        shader.fragmentShader = replaceRequired(
            shader.fragmentShader,
            '#include <map_fragment>',
            'smartMaterialGroupsApplyMap(diffuseColor);',
            'fragment map'
        );
        shader.fragmentShader = replaceRequired(
            shader.fragmentShader,
            '#include <roughnessmap_fragment>',
            '#include <roughnessmap_fragment>\nroughnessFactor = clamp(vSmartMaterialSurface.x, 0.0, 1.0);',
            'roughness map'
        );
        shader.fragmentShader = replaceRequired(
            shader.fragmentShader,
            '#include <metalnessmap_fragment>',
            '#include <metalnessmap_fragment>\nmetalnessFactor = clamp(vSmartMaterialSurface.y, 0.0, 1.0);',
            'metalness map'
        );
        shader.fragmentShader = replaceRequired(
            shader.fragmentShader,
            '#include <emissivemap_fragment>',
            '#include <emissivemap_fragment>\ntotalEmissiveRadiance = vSmartMaterialEmissive * max(vSmartMaterialSurface.z, 0.0);',
            'emissive map'
        );
        shader.fragmentShader = replaceRequired(
            shader.fragmentShader,
            '#include <lights_physical_fragment>',
            patchedPhysicalLightingChunk(),
            'physical lighting'
        );
    };

    material.userData = material.userData ?? {};
    material.userData.smartMaterialGroupShader = SHADER_VERSION;
    attachShaderMetadata(material, SHADER_PAYLOAD, 'Smart material groups');
    material.needsUpdate = true;
    return material;
}

export default applySmartMaterialGroupShader;
