// Keeps source-leaf normals independent of the side-view bake camera and the card's lean.
import { createShaderPayload, loadShaderSourceSet } from '../../core/ShaderLoader.js';

export const grassCardNormalBakeShader = createShaderPayload({
    shaderId: 'materials.grass.card_normal_bake',
    sourceSet: await loadShaderSourceSet({
        vertexPath: 'materials/grass/grass_card_normal_bake.vert.glsl',
        fragmentPath: 'materials/grass/grass_card_normal_bake.frag.glsl'
    })
});
