// Loads the optional bus reflection term separately from diffuse probe sampling.
import { createShaderPayload, loadShaderSourceSet } from '../core/ShaderLoader.js';
const load = async suffix => createShaderPayload({ shaderId: 'illumination.bus_reflections' + suffix,
    sourceSet: await loadShaderSourceSet({ vertexPath: 'materials/bus_reflections.vert.glsl',
        fragmentPath: 'materials/bus_reflections' + suffix + '.frag.glsl' }) });
const [declarations, apply] = await Promise.all([load(''), load('_apply')]);
export const busReflectionShaders = { fragment: declarations.fragmentSource, apply: apply.fragmentSource,
    variantKey: declarations.variantKey + '.' + apply.variantKey };
