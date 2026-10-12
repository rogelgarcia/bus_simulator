import { createShaderPayload, loadShaderSourceSet } from '../../core/ShaderLoader.js';
export const grassRuntimeMaskShader = createShaderPayload({ shaderId: 'materials.grass.runtime_mask',
    sourceSet: await loadShaderSourceSet({ vertexPath: 'materials/grass/grass_runtime_mask.vert.glsl', fragmentPath: 'materials/grass/grass_runtime_mask.frag.glsl' }) });
