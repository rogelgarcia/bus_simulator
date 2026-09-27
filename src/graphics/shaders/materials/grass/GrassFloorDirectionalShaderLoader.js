// Camera-dependent coverage from the top and two adjacent oblique reference views.
import { createShaderPayload, loadShaderSourceSet } from '../../core/ShaderLoader.js';

export const grassFloorDirectionalShader = createShaderPayload({
    shaderId: 'materials.grass.floor_directional',
    sourceSet: await loadShaderSourceSet({
        vertexPath: 'materials/grass/grass_plant_facing.vert.glsl',
        fragmentPath: 'materials/grass/grass_floor_directional.frag.glsl'
    })
});
