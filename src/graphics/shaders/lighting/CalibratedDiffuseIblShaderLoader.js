// Separates calibrated diffuse skylight from authored environment reflection scales.
import { createShaderPayload, loadShaderSourceSet } from '../core/ShaderLoader.js';

export const calibratedDiffuseIblShader = createShaderPayload({
    shaderId: 'lighting.calibrated_diffuse_ibl',
    sourceSet: await loadShaderSourceSet({
        vertexPath: 'lighting/calibrated_diffuse_ibl.vert.glsl',
        fragmentPath: 'lighting/calibrated_diffuse_ibl.frag.glsl'
    })
});
