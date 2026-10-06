// Complementary, opaque LOD coverage, enabled only for candidate transition batches.
import { createShaderPayload, loadShaderSourceSet } from '../../core/ShaderLoader.js';

export const grassTransitionBlendParsShader = createShaderPayload({
    shaderId: 'materials.grass.transition-blend.pars',
    sourceSet: await loadShaderSourceSet({
        vertexPath: 'materials/grass/grass_transition_blend_pars.vert.glsl?v=opaque-dissolve-1',
        fragmentPath: 'materials/grass/grass_transition_blend_pars.frag.glsl?v=opaque-dissolve-1'
    })
});
export const grassTransitionBlendShader = createShaderPayload({
    shaderId: 'materials.grass.transition-blend',
    sourceSet: await loadShaderSourceSet({
        vertexPath: 'materials/grass/grass_transition_blend.vert.glsl?v=opaque-dissolve-1',
        fragmentPath: 'materials/grass/grass_transition_blend.frag.glsl?v=opaque-dissolve-1'
    })
});
