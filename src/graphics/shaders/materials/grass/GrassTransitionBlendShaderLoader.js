// Complementary, opaque LOD coverage, enabled only for candidate transition batches.
import { createShaderPayload, loadShaderSourceSet } from '../../core/ShaderLoader.js?v=canopy-palette-17';

export const grassTransitionBlendParsShader = createShaderPayload({
    shaderId: 'materials.grass.transition-blend.pars',
    sourceSet: await loadShaderSourceSet({
        vertexPath: 'materials/grass/grass_transition_blend_pars.vert.glsl?v=canopy-palette-17',
        fragmentPath: 'materials/grass/grass_transition_blend_pars.frag.glsl?v=canopy-palette-17'
    })
});
export const grassTransitionBlendShader = createShaderPayload({
    shaderId: 'materials.grass.transition-blend',
    sourceSet: await loadShaderSourceSet({
        vertexPath: 'materials/grass/grass_transition_blend.vert.glsl?v=canopy-palette-17',
        fragmentPath: 'materials/grass/grass_transition_blend.frag.glsl?v=canopy-palette-17'
    })
});
export const grassTransitionCanopyShader = createShaderPayload({
    shaderId: 'materials.grass.transition-canopy',
    sourceSet: await loadShaderSourceSet({ vertexPath: 'materials/grass/grass_transition_blend_pars.vert.glsl?v=canopy-palette-17', fragmentPath: 'materials/grass/grass_transition_canopy.frag.glsl?v=canopy-palette-17' })
});
