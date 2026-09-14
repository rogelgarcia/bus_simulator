// Loaded only by the offline primary-surface diagnostic capture.
import {createShaderPayload,loadShaderSourceSet} from '../core/ShaderLoader.js';
async function load(suffix) {
    return createShaderPayload({shaderId:'diagnostics.primary_surface'+suffix,
        sourceSet:await loadShaderSourceSet({vertexPath:'materials/primary_surface.vert.glsl',
            fragmentPath:'materials/primary_surface'+suffix+'.frag.glsl'})});
}
const [declarations,normal,roughness]=await Promise.all([load(''),load('_normal'),load('_roughness')]);
export const primarySurfaceShaders={declarations:declarations.fragmentSource,normal:normal.fragmentSource,
    roughness:roughness.fragmentSource,variantKey:[declarations,normal,roughness].map(x=>x.variantKey).join('.')};
