// Load the one-time HDR probe and the distant canopy ambient-cube approximation.
import { createShaderPayload, loadShaderSourceSet } from '../../core/ShaderLoader.js';
export const grassEnvironmentProbeShader = createShaderPayload({ shaderId: 'materials.grass.environment-probe',
    sourceSet: await loadShaderSourceSet({ vertexPath: 'materials/grass/grass_environment_probe.vert.glsl', fragmentPath: 'materials/grass/grass_environment_probe.frag.glsl' }) });
export const grassEnvironmentApproximationShader = createShaderPayload({ shaderId: 'materials.grass.environment-approximation',
    sourceSet: await loadShaderSourceSet({ vertexPath: 'materials/grass/grass_environment_probe.vert.glsl', fragmentPath: 'materials/grass/grass_environment_approximation.frag.glsl' }) });
