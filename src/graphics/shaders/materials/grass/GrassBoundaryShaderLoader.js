// Load the shared surface-boundary clipping shader.
import { createShaderPayload, loadShaderSourceSet } from '../../core/ShaderLoader.js';
export const grassBoundaryShader = createShaderPayload({ shaderId: 'materials.grass.boundary',
    sourceSet: await loadShaderSourceSet({ vertexPath: 'materials/grass/grass_boundary.vert.glsl', fragmentPath: 'materials/grass/grass_boundary.frag.glsl' }) });
