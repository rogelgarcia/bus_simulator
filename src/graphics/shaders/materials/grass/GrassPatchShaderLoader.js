// Load the immutable patch placement, distance coverage and continuous ground shaders.
import { createShaderPayload, loadShaderSourceSet } from '../../core/ShaderLoader.js';
export const grassPatchShader = createShaderPayload({ shaderId: 'materials.grass.patch',
    sourceSet: await loadShaderSourceSet({ vertexPath: 'materials/grass/grass_patch.vert.glsl?v=canopy-handoff-2', fragmentPath: 'materials/grass/grass_patch.frag.glsl?v=offline-leaf-fill-1' }) });
