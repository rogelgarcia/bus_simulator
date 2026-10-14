// Load the immutable patch placement, distance coverage and continuous ground shaders.
import { createShaderPayload, loadShaderSourceSet } from '../../core/ShaderLoader.js';
export const grassPatchShader = createShaderPayload({ shaderId: 'materials.grass.patch',
    sourceSet: await loadShaderSourceSet({ vertexPath: 'materials/grass/grass_patch.vert.glsl?v=patch-edges-1', fragmentPath: 'materials/grass/grass_patch.frag.glsl?v=patch-edges-1' }) });
