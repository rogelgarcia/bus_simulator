// Match the study's MSAA alpha transition to coverage-preserving mipmaps.
import { createShaderPayload, loadShaderSourceSet } from '../../core/ShaderLoader.js';

export const grassPlantCoverageShader = createShaderPayload({
    shaderId: 'materials.grass.plant_coverage',
    sourceSet: await loadShaderSourceSet({
        vertexPath: 'materials/grass/grass_plant_coverage.vert.glsl',
        fragmentPath: 'materials/grass/grass_plant_coverage.frag.glsl'
    })
});
