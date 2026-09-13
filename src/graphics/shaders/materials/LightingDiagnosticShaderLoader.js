// Loaded only by the offline material comparison harness.
import { createShaderPayload, loadShaderSourceSet } from '../core/ShaderLoader.js';
const load = async suffix => createShaderPayload({ shaderId: 'diagnostics.lighting' + suffix,
    sourceSet: await loadShaderSourceSet({ vertexPath: 'materials/lighting_diagnostic.vert.glsl',
        fragmentPath: 'materials/lighting_diagnostic' + suffix + '.frag.glsl' }) });
const [declarations, apply] = await Promise.all([load(''), load('_apply')]);
export const lightingDiagnosticShaders = { declarations: declarations.fragmentSource, apply: apply.fragmentSource,
    variantKey: declarations.variantKey + '.' + apply.variantKey };
