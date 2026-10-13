// Load the offline missing-blade projection shaders.
import { createShaderPayload, loadShaderSourceSet } from '../../core/ShaderLoader.js';
export const grassLeafFillBakeShader = createShaderPayload({ shaderId: 'materials.grass.leaf-fill-bake',
    sourceSet: await loadShaderSourceSet({ vertexPath: 'materials/grass/grass_leaf_fill_bake.vert.glsl', fragmentPath: 'materials/grass/grass_leaf_fill_bake.frag.glsl' }) });
