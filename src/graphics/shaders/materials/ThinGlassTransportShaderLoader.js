// Loads the direct-sun receiver multiplier without changing indirect illumination.
import { createShaderPayload, loadShaderSourceSet } from '../core/ShaderLoader.js';
const load = async suffix => createShaderPayload({ shaderId: 'illumination.thin_glass' + suffix,
    sourceSet: await loadShaderSourceSet({ vertexPath: `materials/thin_glass${suffix}.vert.glsl`, fragmentPath: `materials/thin_glass${suffix}.frag.glsl` }) });
export const thinGlassTransportShaders = { declarations: await load(''), apply: await load('_apply') };
