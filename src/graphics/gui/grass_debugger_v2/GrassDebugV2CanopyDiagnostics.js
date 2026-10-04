// Compile isolated canopy ablations on owned material clones for repeatable GPU experiments.
// @ts-check
import * as THREE from 'three';
import { cloneMaterialShaderContract, registerMaterialShaderHook } from '../../shaders/core/MaterialShaderHookRegistry.js';
import { attachShaderMetadata } from '../../shaders/core/ShaderLoader.js';
import { grassCanopyDiagnosticShaders as snippets } from '../../shaders/materials/grass/GrassCanopyDiagnosticShaderLoader.js';
import { grassFieldCanopySamplingShader, grassFieldCanopyCoverageShader, grassFieldCanopyColorShader } from '../../shaders/materials/grass/GrassFieldCanopyShaderLoader.js?v=lod3-subtle-relief-1';

export const GRASS_CANOPY_DIAGNOSTICS = Object.freeze({
    full: 'Complete LOD4 shader',
    aniso1: '1× anisotropic filtering on canopy channels',
    aniso4: '4× anisotropic filtering on canopy channels',
    aniso8: 'Retained 8× anisotropic filtering on canopy channels',
    single_scale: 'One fixed texture scale; paired tiles retained',
    no_visibility: 'No baked/external shadow-visibility sampling',
    baked_only: 'Baked self-shadows only; no white external lookup or live-shadow branch',
    flat_normals: 'Flat normal RGB; coverage alpha still sampled',
    no_color_fit: 'No angular grass/litter color correction',
    no_coverage: 'No view-dependent coverage reconstruction',
    standard_diffuse: 'Standard direct lighting instead of grass/litter split and transmission',
    no_ibl: 'No HDR environment diffuse/specular sampling',
    no_specular: 'No direct or environment specular',
    unlit_albedo: 'Unlit paired albedo, distance blend and output conversion',
    unlit_constant: 'Constant opaque color; no texture sampling'
});

/** @param {THREE.MeshStandardMaterial} source @param {string} id */
export function createGrassDebugV2CanopyDiagnostic(source, id, { renderer = null, textureCache = null } = {}) {
    if (!source?.isMeshStandardMaterial || !Object.hasOwn(GRASS_CANOPY_DIAGNOSTICS, id)) throw new Error('Invalid canopy diagnostic: ' + id);
    const material = cloneMaterialShaderContract(source), textures = textureCache ?? new Map(), uniforms = {}, targets = [];
    material.name = 'CanopyDiagnostic-' + id;
    material.userData = { ...source.userData };
    const requestedAnisotropy = { aniso1: 1, aniso4: 4, aniso8: 8 }[id];
    const anisotropy = requestedAnisotropy === undefined ? null
        : Math.min(requestedAnisotropy, renderer?.capabilities.getMaxAnisotropy() ?? requestedAnisotropy);
    const texture = original => {
        if (!textures.has(original)) {
            let copy;
            if (original.isRenderTargetTexture) {
                if (!renderer) throw new Error('Canopy filtering comparisons require the renderer to copy GPU render-target pixels.');
                const target = new THREE.WebGLRenderTarget(original.image.width, original.image.height, {
                    format: original.format, type: original.type, colorSpace: original.colorSpace, depthBuffer: false,
                    minFilter: original.minFilter, magFilter: original.magFilter, generateMipmaps: original.generateMipmaps,
                    wrapS: original.wrapS, wrapT: original.wrapT, anisotropy });
                copy = target.texture; copy.userData = { ...original.userData }; targets.push(target);
                renderer.initRenderTarget(target); renderer.copyTextureToTexture(original, copy);
            } else { copy = original.clone(); copy.anisotropy = anisotropy; copy.needsUpdate = true; }
            textures.set(original, copy);
        }
        return textures.get(original);
    };
    if (anisotropy !== null) for (const key of ['map', 'normalMap', 'roughnessMap']) material[key] = texture(source[key]);
    Object.values(snippets).forEach(payload => attachShaderMetadata(material, payload));
    registerMaterialShaderHook(material, { id: anisotropy !== null ? 'grass.canopy-filtering' : 'grass.canopy-diagnostic', priority: 200,
        uniforms,
        variantKey: id + '|' + Object.values(snippets).map(payload => payload.variantKey).join('|'),
        apply(shader) {
            const replace = (anchor, value) => {
                if (!shader.fragmentShader.includes(anchor)) throw new Error('Canopy diagnostic anchor missing: ' + id);
                shader.fragmentShader = shader.fragmentShader.replace(anchor, value);
            };
            if (anisotropy !== null) for (const key of ['grassCanopyAlbedoB', 'grassCanopyNormalB', 'grassCanopyRoughnessB',
                'grassCanopyVisibilityB', 'grassCanopyTileVisibility', 'grassCanopyShadowVisibility']) {
                uniforms[key] = { value: texture(shader.uniforms[key].value) }; shader.uniforms[key] = uniforms[key];
            }
            if (id === 'single_scale') { uniforms.grassCanopyDistance = { value: new THREE.Vector3(1000, 2000, 2) }; shader.uniforms.grassCanopyDistance = uniforms.grassCanopyDistance; }
            if (id === 'flat_normals') {
                const sampling = grassFieldCanopySamplingShader.fragmentSource;
                replace(sampling, sampling + '\n' + snippets.normal.fragmentSource);
                replace('grassFieldCanopySample(normalMap, grassCanopyNormalB, vNormalMapUv)', 'grassDiagnosticNormal(normalMap, grassCanopyNormalB, vNormalMapUv)');
            }
            if (id === 'no_visibility' || id === 'baked_only') {
                const signature = shader.fragmentShader.match(/float grassCanopyShadow\([^{}]+\) \{/);
                if (!signature) throw new Error('Canopy diagnostic shadow signature missing.');
                replace(signature[0], signature[0] + '\n' + snippets[id === 'baked_only' ? 'baked_visibility' : 'visibility'].fragmentSource);
            }
            if (id === 'no_color_fit') replace(grassFieldCanopyColorShader.fragmentSource, '');
            if (id === 'no_coverage') replace(grassFieldCanopyCoverageShader.fragmentSource, snippets.coverage.fragmentSource);
            if (id === 'standard_diffuse') replace('#define RE_Direct RE_Direct_GrassFloor', snippets.diffuse.fragmentSource);
            if (id === 'no_ibl') replace('#include <envmap_physical_pars_fragment>', snippets.ibl.fragmentSource);
            if (id === 'no_specular') {
                const outgoing = 'vec3 outgoingLight = totalDiffuse + totalSpecular + totalEmissiveRadiance;';
                replace(outgoing, snippets.specular.fragmentSource + '\n' + outgoing);
            }
            if (id === 'unlit_albedo' || id === 'unlit_constant') {
                replace('void main() {', 'void main() {\n' + snippets[id === 'unlit_albedo' ? 'albedo' : 'constant'].fragmentSource);
            }
        }
    });
    return Object.freeze({ material, dispose() { material.dispose(); targets.forEach(target => target.dispose());
        if (!textureCache) for (const value of textures.values()) value.dispose(); } });
}
