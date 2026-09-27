// Load per-instance transforms for grass object-space normal atlases.
import { createShaderPayload, loadShaderSourceSet } from '../../core/ShaderLoader.js';

export const grassInstancedAtlasDeclarations = createShaderPayload({
    shaderId: 'materials.grass.instanced_atlas_declarations',
    sourceSet: await loadShaderSourceSet({
        vertexPath: 'materials/grass/grass_instanced_atlas_pars.vert.glsl',
        fragmentPath: 'materials/grass/grass_instanced_atlas_pars.frag.glsl'
    })
});
export const grassInstancedAtlasTransform = createShaderPayload({
    shaderId: 'materials.grass.instanced_atlas_transform',
    sourceSet: await loadShaderSourceSet({
        vertexPath: 'materials/grass/grass_instanced_atlas.vert.glsl',
        fragmentPath: 'materials/grass/grass_instanced_atlas_pars.frag.glsl'
    })
});
