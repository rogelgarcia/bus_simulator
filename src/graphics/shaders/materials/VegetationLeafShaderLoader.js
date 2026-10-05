// Loads the thin-leaf direct-light transmission shader extension.
// @ts-check
import { createShaderPayload, loadShaderSourceSet } from '../core/ShaderLoader.js';

export const vegetationLeafShader = createShaderPayload({
    shaderId: 'materials.vegetation_leaf',
    sourceSet: await loadShaderSourceSet({
        vertexPath: 'materials/vegetation_leaf.vert.glsl',
        fragmentPath: 'materials/vegetation_leaf.frag.glsl'
    })
});
