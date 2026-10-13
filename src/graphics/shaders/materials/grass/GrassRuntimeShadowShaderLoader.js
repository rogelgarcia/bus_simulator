import { createShaderPayload, loadShaderSourceSet } from '../../core/ShaderLoader.js';
export const grassRuntimeShadowShader = createShaderPayload({ shaderId: 'materials.grass.runtime_shadow',
    sourceSet: await loadShaderSourceSet({ vertexPath: 'materials/grass/grass_runtime_shadow.vert.glsl', fragmentPath: 'materials/grass/grass_runtime_shadow.frag.glsl' }) });
