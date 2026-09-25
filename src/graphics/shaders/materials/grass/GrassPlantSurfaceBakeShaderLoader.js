// Pack structural facing into the existing plant roughness bake.
import { createShaderPayload, loadShaderSourceSet } from '../../core/ShaderLoader.js';

export const grassPlantSurfaceBakeShader = createShaderPayload({
    shaderId: 'materials.grass.plant_surface_bake',
    sourceSet: await loadShaderSourceSet({
        vertexPath: 'materials/grass/grass_plant_surface_bake.vert.glsl',
        fragmentPath: 'materials/grass/grass_plant_surface_bake.frag.glsl'
    })
});
