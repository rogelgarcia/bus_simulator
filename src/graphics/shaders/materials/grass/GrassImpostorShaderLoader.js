// Load the source-oriented, depth-reprojected runtime grass impostor shaders.
import { createShaderPayload, loadShaderSourceSet } from '../../core/ShaderLoader.js';

async function payload(id, vertex, fragment) {
    return createShaderPayload({
        shaderId: 'materials.grass.runtime_impostor.' + id,
        sourceSet: await loadShaderSourceSet({
            vertexPath: 'materials/grass/' + vertex + '?v=lod3-runtime-transitions-1',
            fragmentPath: 'materials/grass/' + fragment + '?v=lod3-runtime-transitions-1'
        })
    });
}

export const grassImpostorParsShader = await payload('pars', 'grass_impostor_pars.vert.glsl', 'grass_impostor_pars.frag.glsl');
export const grassImpostorPositionShader = await payload('position', 'grass_impostor_position.vert.glsl', 'grass_impostor_sample.frag.glsl');
export const grassImpostorNormalShader = await payload('normal', 'grass_impostor_normal.vert.glsl', 'grass_impostor_normal.frag.glsl');
export const grassImpostorSurfaceShader = await payload('surface', 'grass_impostor_normal.vert.glsl', 'grass_impostor_surface.frag.glsl');
export const grassImpostorDepthShader = await payload('depth', 'grass_impostor_normal.vert.glsl', 'grass_impostor_depth.frag.glsl');
export const grassImpostorDirectionalShadowShader = await payload('directional_shadow', 'grass_impostor_normal.vert.glsl', 'grass_impostor_directional_shadow.frag.glsl');
export const grassImpostorSpotShadowShader = await payload('spot_shadow', 'grass_impostor_normal.vert.glsl', 'grass_impostor_spot_shadow.frag.glsl');
export const grassImpostorPointShadowShader = await payload('point_shadow', 'grass_impostor_normal.vert.glsl', 'grass_impostor_point_shadow.frag.glsl');
export const grassImpostorVisibilityShader = await payload('visibility', 'grass_impostor_normal.vert.glsl', 'grass_impostor_visibility.frag.glsl');
export const grassImpostorCoverageShader = await payload('coverage', 'grass_impostor_normal.vert.glsl', 'grass_impostor_coverage.frag.glsl');
