// Borrow the existing material recipe and appearance uniforms for a band-only rendering variant.
import { createSharedUniformMaterialVariant, registerMaterialShaderHook } from '../../shaders/core/MaterialShaderHookRegistry.js';
import { attachShaderMetadata } from '../../shaders/core/ShaderLoader.js';
import { grassTransitionBlendShader, grassTransitionBlendParsShader } from '../../shaders/materials/grass/GrassTransitionBlendShaderLoader.js?v=opaque-dissolve-1';

export function createGrassTransitionBlendMaterials() {
    const cache = new Map(), uniforms = {
        grassTransitionBlendStarts: { value: new Float32Array(5) },
        grassTransitionBlendEnds: { value: new Float32Array(5) }
    };
    return Object.freeze({
        configure(bands) {
            if (bands.length !== 5 || bands.some(b => !Number.isFinite(b.start) || !Number.isFinite(b.end) || b.start < 0 || b.start > b.end))
                throw new Error('Grass blending requires five finite distance bands.');
            uniforms.grassTransitionBlendStarts.value.set(bands.map(b => b.start));
            uniforms.grassTransitionBlendEnds.value.set(bands.map(b => b.end));
        },
        material(source, level, sampleCoverage = 0, style = 'coverage') {
            if (!Number.isInteger(level) || level < 0 || level > 5) throw new Error('Invalid grass blend level.');
            if (!Number.isInteger(sampleCoverage) || sampleCoverage < 0 || sampleCoverage > 3) throw new Error('Invalid grass sample-coverage mode.');
            if (!['coverage', 'alpha', 'staggered', 'dissolve'].includes(style)) throw new Error('Invalid grass fade style.');
            const key = source.uuid + ':' + level + ':' + sampleCoverage + ':' + style;
            if (cache.has(key)) return cache.get(key);
            const material = createSharedUniformMaterialVariant(source);
            material.userData = { ...source.userData, grassTransitionBlendLevel: level };
            material.defines = { ...material.defines, GRASS_TRANSITION_BLEND_LEVEL: level };
            if (sampleCoverage) { material.alphaToCoverage = true; material.defines.GRASS_TRANSITION_SAMPLE_COVERAGE = sampleCoverage; }
            else delete material.defines.GRASS_TRANSITION_SAMPLE_COVERAGE;
            if (style === 'alpha' && sampleCoverage) {
                material.transparent = true; material.depthWrite = false; material.alphaToCoverage = false; material.alphaTest = 0;
                material.defines.GRASS_TRANSITION_ALPHA = 1;
            }
            if (style === 'staggered' && source.defines?.GRASS_RIBBON_CARD && (level === 3 && sampleCoverage === 3 || level === 4))
                material.defines.GRASS_TRANSITION_STAGGERED = 1;
            if (style === 'dissolve') material.defines.GRASS_TRANSITION_DISSOLVE = 1;
            for (const payload of [grassTransitionBlendShader, grassTransitionBlendParsShader]) attachShaderMetadata(material, payload);
            registerMaterialShaderHook(material, { id: 'grass.transition-blend', priority: 110,
                variantKey: grassTransitionBlendShader.variantKey + grassTransitionBlendParsShader.variantKey + ':' + level + ':' + sampleCoverage + ':' + style, uniforms,
                apply(shader) {
                    if (!shader.vertexShader.includes('#include <project_vertex>') || !shader.fragmentShader.includes('#include <clipping_planes_fragment>'))
                        throw new Error('Grass transition blend shader contract changed.');
                    Object.assign(shader.uniforms, uniforms);
                    shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\n' + grassTransitionBlendParsShader.vertexSource)
                        .replace('#include <project_vertex>', grassTransitionBlendShader.vertexSource + '\n#include <project_vertex>');
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
