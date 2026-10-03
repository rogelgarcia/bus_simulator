// World-continuous coordinates, field bevels and exposed canopy-edge joins for selection cells.
import { createShaderPayload, loadShaderSourceSet } from '../../core/ShaderLoader.js';

export const grassTransitionFieldUvShader = createShaderPayload({
    shaderId: 'materials.grass.transition-field.uv',
    sourceSet: await loadShaderSourceSet({
        vertexPath: 'materials/grass/grass_transition_field_uv.vert.glsl',
        fragmentPath: 'materials/grass/grass_transition_field_pars.vert.glsl?revision=edge-joins-1'
    })
});

export const grassTransitionFieldCanopyShader = createShaderPayload({
    shaderId: 'materials.grass.transition-field.canopy',
    sourceSet: await loadShaderSourceSet({
        vertexPath: 'materials/grass/grass_transition_field_canopy.vert.glsl?revision=edge-joins-1',
        fragmentPath: 'materials/grass/grass_transition_field_pars.vert.glsl?revision=edge-joins-1'
    })
});
