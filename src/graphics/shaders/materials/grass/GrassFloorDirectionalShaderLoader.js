// Camera-dependent coverage from top, sun-facing and opposite oblique reference views.
import { createShaderPayload, loadShaderSourceSet } from '../../core/ShaderLoader.js';

export const grassFloorDirectionalShader = createShaderPayload({
    shaderId: 'materials.grass.floor_directional',
    sourceSet: await loadShaderSourceSet({
        vertexPath: 'materials/grass/grass_plant_facing.vert.glsl',
        fragmentPath: 'materials/grass/grass_floor_directional.frag.glsl'
    })
});
