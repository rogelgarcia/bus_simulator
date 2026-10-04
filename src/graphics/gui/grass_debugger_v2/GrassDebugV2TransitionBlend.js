// Borrow the existing material recipe and appearance uniforms for a band-only rendering variant.
import * as THREE from 'three';
import { createSharedUniformMaterialVariant, registerMaterialShaderHook } from '../../shaders/core/MaterialShaderHookRegistry.js';
import { attachShaderMetadata } from '../../shaders/core/ShaderLoader.js';
import { grassTransitionBlendShader, grassTransitionBlendParsShader } from '../../shaders/materials/grass/GrassTransitionBlendShaderLoader.js';

export function createGrassTransitionBlendMaterials() {
    const cache = new Map(), uniforms = {
        grassTransitionBlendStarts: { value: new THREE.Vector4() },
        grassTransitionBlendEnds: { value: new THREE.Vector4() }
    };
    return Object.freeze({
        configure(bands) {
            if (bands.length !== 4 || bands.some(b => !Number.isFinite(b.start) || !Number.isFinite(b.end) || b.start < 0 || b.start > b.end))
                throw new Error('Grass blending requires four finite distance bands.');
            uniforms.grassTransitionBlendStarts.value.fromArray(bands.map(b => b.start));
            uniforms.grassTransitionBlendEnds.value.fromArray(bands.map(b => b.end));
        },
        material(source, level) {
            if (!Number.isInteger(level) || level < 0 || level > 4) throw new Error('Invalid grass blend level.');
            const key = source.uuid + ':' + level;
            if (cache.has(key)) return cache.get(key);
            const material = createSharedUniformMaterialVariant(source);
            material.userData = { ...source.userData, grassTransitionBlendLevel: level };
            material.defines = { ...material.defines, GRASS_TRANSITION_BLEND_LEVEL: level };
            for (const payload of [grassTransitionBlendShader, grassTransitionBlendParsShader]) attachShaderMetadata(material, payload);
            registerMaterialShaderHook(material, { id: 'grass.transition-blend', priority: 110,
                variantKey: grassTransitionBlendShader.variantKey + grassTransitionBlendParsShader.variantKey + ':' + level, uniforms,
                apply(shader) {
                    if (!shader.vertexShader.includes('void main() {') || !shader.fragmentShader.includes('#include <clipping_planes_fragment>'))
                        throw new Error('Grass transition blend shader contract changed.');
                    Object.assign(shader.uniforms, uniforms);
                    shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\n' + grassTransitionBlendParsShader.vertexSource)
                        .replace('void main() {', 'void main() {\n' + grassTransitionBlendShader.vertexSource);
                    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\n' + grassTransitionBlendParsShader.fragmentSource)
                        .replace('#include <clipping_planes_fragment>', '#include <clipping_planes_fragment>\n' + grassTransitionBlendShader.fragmentSource);
                }
            });
            cache.set(key, material);
            return material;
        },
        dispose() { for (const material of cache.values()) material.dispose(); cache.clear(); }
    });
}
