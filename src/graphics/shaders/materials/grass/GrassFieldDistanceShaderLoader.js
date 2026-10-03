// Distance filtering for live field leaves; baked source materials remain unchanged.
import { createShaderPayload, loadShaderSourceSet } from '../../core/ShaderLoader.js';

export const grassFieldDistanceShader = createShaderPayload({
    shaderId: 'materials.grass.field-distance',
    sourceSet: await loadShaderSourceSet({
        vertexPath: 'materials/grass/grass_field_distance.vert.glsl?v=transition-instances-1',
        fragmentPath: 'materials/grass/grass_field_distance.frag.glsl?v=lod-distance-1'
    })
});
export const grassFieldDistanceParsShader = createShaderPayload({
    shaderId: 'materials.grass.field-distance-pars',
    sourceSet: await loadShaderSourceSet({
        vertexPath: 'materials/grass/grass_field_distance_pars.vert.glsl?v=lod-distance-1',
        fragmentPath: 'materials/grass/grass_field_distance_restore.vert.glsl?v=lod-distance-1'
    })
});
export const grassFieldDistanceShadowShader = createShaderPayload({
    shaderId: 'materials.grass.field-distance-shadow',
    sourceSet: await loadShaderSourceSet({
        vertexPath: 'materials/grass/grass_field_distance_pars.vert.glsl?v=lod-distance-2',
        fragmentPath: 'materials/grass/grass_field_distance_shadow.frag.glsl?v=lod-distance-2'
    })
});
export const grassFieldDistanceCanopyShader = createShaderPayload({
    shaderId: 'materials.grass.field-distance-canopy',
    sourceSet: await loadShaderSourceSet({
        vertexPath: 'materials/grass/grass_field_distance_pars.vert.glsl?v=lod-distance-3',
        fragmentPath: 'materials/grass/grass_field_distance_canopy.frag.glsl?v=lod-distance-3'
    })
});
export const grassFieldDistanceCanopyResponseShader = createShaderPayload({
    shaderId: 'materials.grass.field-distance-canopy-response',
    sourceSet: await loadShaderSourceSet({
        vertexPath: 'materials/grass/grass_field_distance_pars.vert.glsl?v=lod-distance-3',
        fragmentPath: 'materials/grass/grass_field_distance_canopy_response.frag.glsl?v=lod-distance-3'
    })
});
