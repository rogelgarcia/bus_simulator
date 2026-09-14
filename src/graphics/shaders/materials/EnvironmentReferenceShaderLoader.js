// Offline-only integration prototype; no production renderer imports this loader.
import {createShaderPayload,loadShaderSourceSet} from '../core/ShaderLoader.js';
export const environmentReferenceShader=createShaderPayload({shaderId:'diagnostics.environment_reference',
    sourceSet:await loadShaderSourceSet({vertexPath:'materials/environment_reference.vert.glsl',fragmentPath:'materials/environment_reference.frag.glsl'})});
export const environmentReferenceApply=createShaderPayload({shaderId:'diagnostics.environment_reference_apply',
    sourceSet:await loadShaderSourceSet({vertexPath:'materials/environment_reference.vert.glsl',fragmentPath:'materials/environment_reference_apply.frag.glsl'})});
