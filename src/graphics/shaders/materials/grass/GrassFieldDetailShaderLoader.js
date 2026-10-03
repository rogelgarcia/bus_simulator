// Decode compact field vertices before the standard lighting and shadow transforms.
import { createShaderPayload, loadShaderSourceSet } from '../../core/ShaderLoader.js';

export const grassFieldDetailShader = createShaderPayload({
    shaderId: 'materials.grass.field-detail',
    sourceSet: await loadShaderSourceSet({
        vertexPath: 'materials/grass/grass_field_detail_position.vert.glsl',
        fragmentPath: 'materials/grass/grass_field_detail_pars.glsl'
    })
});
