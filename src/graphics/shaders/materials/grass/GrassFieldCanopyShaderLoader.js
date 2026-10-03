// Load relightable canopy PBR channels and separately baked self-shadow visibility.
import { createShaderPayload, loadShaderSourceSet } from '../../core/ShaderLoader.js';
async function payload(id, fragment, vertex = 'grass_card_normal_bake', revision = 'lod4-paired-2m-1') {
    return createShaderPayload({ shaderId: 'materials.grass.field-canopy.' + id,
        sourceSet: await loadShaderSourceSet({
            vertexPath: 'materials/grass/' + vertex + '.vert.glsl?v=' + revision,
            fragmentPath: 'materials/grass/grass_field_canopy_' + fragment + '.frag.glsl?v=' + revision
        }) });
}
export const grassFieldCanopyCaptureShader = await payload('capture', 'capture');
export const grassFieldCanopyNormalShader = await payload('normal', 'normal');
export const grassFieldCanopyWallShader = await payload('wall', 'wall', 'grass_field_canopy_wall', 'lod4-wall-detail-1');
export const grassFieldCanopyWallBlendShader = await payload('wall-blend', 'wall_blend', 'grass_card_normal_bake', 'lod4-wall-detail-1');
export const grassFieldCanopyWallSurfaceShader = await payload('wall-surface', 'wall_surface', 'grass_field_canopy_wall_surface', 'lod4-wall-detail-1');

async function shadowPayload(name, revision = 'lod4-paired-2m-1') {
    return createShaderPayload({ shaderId: 'materials.grass.field-canopy.' + name,
        sourceSet: await loadShaderSourceSet({
            vertexPath: 'materials/grass/grass_field_canopy_' + name + '.vert.glsl?v=' + revision,
            fragmentPath: 'materials/grass/grass_field_canopy_' + name + '.frag.glsl?v=' + revision
        }) });
}
export const grassFieldCanopyShadowParsShader = await shadowPayload('shadow_pars', 'lod4-shadow-fast-1');
export const grassFieldCanopyShadowShader = await shadowPayload('shadow');

export const grassFieldCanopyCoverageShader = await payload('coverage', 'coverage');

export const grassFieldCanopyLightingShader = await payload('lighting', 'lighting', 'grass_card_normal_bake', 'lod4-wall-litter-1');

export const grassFieldCanopySamplingShader = await payload('sampling', 'sampling');
export const grassFieldCanopyDistanceShader = await payload('distance', 'distance', 'grass_card_normal_bake', 'lod3-subtle-relief-1');

export const grassFieldCanopyColorShader = await payload('color', 'color');
export const grassFieldCanopySpecularShader = await payload('specular', 'specular');
export const grassFieldCanopyShadowCaptureShader = await payload('shadow-capture', 'shadow_capture');
export const grassFieldCanopyFacingShader = await payload('facing', 'facing');
export const grassFieldCanopyReliefParsShader = await shadowPayload('relief_pars', 'lod3-subtle-relief-1');
export const grassFieldCanopyReliefShader = await shadowPayload('relief', 'lod3-subtle-relief-1');
