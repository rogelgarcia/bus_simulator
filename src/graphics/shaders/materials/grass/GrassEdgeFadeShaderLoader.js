// Fade perimeter leaf fragments into the raised texture using a stable local-space mask.
import { createShaderPayload, loadShaderSourceSet } from '../../core/ShaderLoader.js';

export const grassEdgeFadeDeclarations = createShaderPayload({
    shaderId: 'materials.grass.edge_fade_declarations',
    sourceSet: await loadShaderSourceSet({
        vertexPath: 'materials/grass/grass_edge_fade_pars.vert.glsl',
        fragmentPath: 'materials/grass/grass_edge_fade_pars.frag.glsl'
    })
});
export const grassEdgeFadeShader = createShaderPayload({
    shaderId: 'materials.grass.edge_fade',
    sourceSet: await loadShaderSourceSet({
        vertexPath: 'materials/grass/grass_edge_fade.vert.glsl',
        fragmentPath: 'materials/grass/grass_edge_fade.frag.glsl'
    })
});
