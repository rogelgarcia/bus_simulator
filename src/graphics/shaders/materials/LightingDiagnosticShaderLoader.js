// Loaded only by the offline material comparison harness.
import { createShaderPayload, loadShaderSourceSet } from '../core/ShaderLoader.js';
const load = async suffix => createShaderPayload({ shaderId: 'diagnostics.lighting' + suffix,
    sourceSet: await loadShaderSourceSet({ vertexPath: 'materials/lighting_diagnostic.vert.glsl',
        fragmentPath: 'materials/lighting_diagnostic' + suffix + '.frag.glsl' }) });
const [declarations, apply, position] = await Promise.all([load(''), load('_apply'),
    loadShaderSourceSet({vertexPath:'materials/lighting_diagnostic_position.vert.glsl',fragmentPath:'materials/lighting_diagnostic.frag.glsl'})
        .then(sourceSet=>createShaderPayload({shaderId:'diagnostics.position',sourceSet}))]);
export const lightingDiagnosticShaders = { vertexDeclarations: declarations.vertexSource, position:position.vertexSource, declarations: declarations.fragmentSource, apply: apply.fragmentSource,
    variantKey: declarations.variantKey + '.' + apply.variantKey + '.' + position.variantKey };
