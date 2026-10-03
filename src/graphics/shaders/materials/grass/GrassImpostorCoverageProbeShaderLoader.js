// Load the test-only white silhouette output while preserving production alpha and depth.
import { createShaderPayload, loadShaderSourceSet } from '../../core/ShaderLoader.js';

export const grassImpostorCoverageProbeShader = createShaderPayload({
    shaderId: 'materials.grass.runtime_impostor.coverage_probe',
    sourceSet: await loadShaderSourceSet({
        vertexPath: 'materials/grass/grass_impostor_coverage_probe.vert.glsl',
        fragmentPath: 'materials/grass/grass_impostor_coverage_probe.frag.glsl'
    })
});
