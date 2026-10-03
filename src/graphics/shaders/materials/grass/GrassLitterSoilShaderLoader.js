// Opaque litter and world-aligned soil material blending before standard lighting.
import { createShaderPayload, loadShaderSourceSet } from '../../core/ShaderLoader.js';
async function payload(id, vertex, fragment) {
    return createShaderPayload({ shaderId: 'materials.grass.litter-soil.' + id,
        sourceSet: await loadShaderSourceSet({
            vertexPath: 'materials/grass/grass_litter_soil_' + vertex + '.vert.glsl?v=transition-instances-1',
            fragmentPath: 'materials/grass/grass_litter_soil_' + fragment + '.frag.glsl?v=litter-merged-1'
        }) });
}
export const litterSoilParsShader = await payload('pars', 'pars', 'pars');
export const litterSoilMapShader = await payload('map', 'position', 'map');
export const litterSoilSurfaceShader = await payload('surface', 'position', 'surface');
export const litterSoilNormalShader = await payload('normal', 'position', 'normal');
export const litterSoilAoShader = await payload('ao', 'position', 'ao');
