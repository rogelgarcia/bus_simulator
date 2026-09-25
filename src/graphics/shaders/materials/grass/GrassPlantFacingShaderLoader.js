// Source-normal facing uses a structural reference packed beside roughness.
import { createShaderPayload, loadShaderSourceSet } from '../../core/ShaderLoader.js';

export const grassPlantFacingDeclarationsShader = createShaderPayload({
    shaderId: 'materials.grass.plant_facing_declarations',
    sourceSet: await loadShaderSourceSet({
        vertexPath: 'materials/grass/grass_plant_facing.vert.glsl',
        fragmentPath: 'materials/grass/grass_plant_facing_pars.frag.glsl'
    })
});

export const grassPlantFacingShader = createShaderPayload({
    shaderId: 'materials.grass.plant_facing',
    sourceSet: await loadShaderSourceSet({
        vertexPath: 'materials/grass/grass_plant_facing.vert.glsl',
        fragmentPath: 'materials/grass/grass_plant_facing.frag.glsl'
    })
});

export const grassPlantFacingSurfaceShader = createShaderPayload({
    shaderId: 'materials.grass.plant_facing_surface',
    sourceSet: await loadShaderSourceSet({
        vertexPath: 'materials/grass/grass_plant_facing.vert.glsl',
        fragmentPath: 'materials/grass/grass_plant_facing_surface.frag.glsl'
    })
});
