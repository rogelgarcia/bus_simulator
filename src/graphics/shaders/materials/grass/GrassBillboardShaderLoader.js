// Shader chunks for fixed triads with limited rotation and source-oriented lighting.
import { createShaderPayload, loadShaderSourceSet } from '../../core/ShaderLoader.js';
async function payload(id, vertex, fragment = 'grass_billboard_normal.frag.glsl') {
    return createShaderPayload({ shaderId: 'materials.grass.triad.' + id,
        sourceSet: await loadShaderSourceSet({ vertexPath: 'materials/grass/' + vertex + '?v=lod3-triads-1',
            fragmentPath: 'materials/grass/' + fragment + '?v=lod3-triads-1' }) });
}
export const grassBillboardParsShader = await payload('pars', 'grass_billboard_pars.vert.glsl', 'grass_billboard_pars.frag.glsl');
export const grassBillboardPositionShader = await payload('position', 'grass_billboard_position.vert.glsl');
export const grassBillboardUvShader = await payload('uv', 'grass_billboard_uv.vert.glsl');
export const grassBillboardNormalShader = await payload('normal', 'grass_billboard_normal.vert.glsl');
