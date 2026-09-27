// Smooth top/underside lighting for grass surfaces represented by a floor normal map.
import { createShaderPayload, loadShaderSourceSet } from '../../core/ShaderLoader.js';

export const grassFloorFacingShader = createShaderPayload({
    shaderId: 'materials.grass.floor_facing',
    sourceSet: await loadShaderSourceSet({
        vertexPath: 'materials/grass/grass_plant_facing.vert.glsl',
        fragmentPath: 'materials/grass/grass_floor_facing.frag.glsl'
    })
});

export const grassFloorLightingShader = createShaderPayload({
    shaderId: 'materials.grass.floor_canopy_lighting',
    sourceSet: await loadShaderSourceSet({
        vertexPath: 'materials/grass/grass_plant_facing.vert.glsl',
        fragmentPath: 'materials/grass/grass_floor_lighting.frag.glsl'
    })
});
