// Asset-backed directional contact-hardening shadow filter.
import {createShaderPayload, loadShaderSourceSet} from '../core/ShaderLoader.js';

const sources = await loadShaderSourceSet({
    vertexPath: 'lighting/finite_sun_shadow.vert.glsl',
    fragmentPath: 'lighting/finite_sun_shadow.frag.glsl'
});

export function createFiniteSunShadowShader() {
    return createShaderPayload({shaderId: 'lighting/finite_sun_shadow', sourceSet: sources});
}
