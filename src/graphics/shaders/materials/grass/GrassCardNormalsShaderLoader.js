// Cards carry source-leaf normals, independent of the proxy plane's visible side.
import { createShaderPayload, loadShaderSourceSet } from '../../core/ShaderLoader.js';

export const grassCardNormalsShader = createShaderPayload({
    shaderId: 'materials.grass.card_normals',
    sourceSet: await loadShaderSourceSet({
        vertexPath: 'materials/grass/grass_card_normals.vert.glsl',
        fragmentPath: 'materials/grass/grass_card_normals.frag.glsl'
    })
});
