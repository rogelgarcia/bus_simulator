// Loads the optional vehicle irradiance shader only when probes are requested.
import { createShaderPayload, loadShaderSourceSet } from '../core/ShaderLoader.js';
const load = async suffix => createShaderPayload({ shaderId: 'illumination.bus_probes' + suffix,
    sourceSet: await loadShaderSourceSet({ vertexPath: 'materials/bus_diffuse_probes' + suffix + '.vert.glsl',
        fragmentPath: 'materials/bus_diffuse_probes' + suffix + '.frag.glsl' }) });
const [declarations, apply] = await Promise.all([load(''), load('_apply')]);
export const busProbeShaders = { vertex: declarations.vertexSource, fragment: declarations.fragmentSource,
    vertexApply: apply.vertexSource, fragmentApply: apply.fragmentSource,
    variantKey: declarations.variantKey + '.' + apply.variantKey };
