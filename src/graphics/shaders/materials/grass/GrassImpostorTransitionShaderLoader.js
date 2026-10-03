// Load the shared complementary dissolve used by geometric leaves and cached images.
import { createShaderPayload, loadShaderSourceSet } from '../../core/ShaderLoader.js';
async function payload(id, stem) {
    return createShaderPayload({ shaderId: 'materials.grass.impostor_transition.' + id,
        sourceSet: await loadShaderSourceSet({ vertexPath: 'materials/grass/' + stem + '.vert.glsl',
            fragmentPath: 'materials/grass/' + stem + '.frag.glsl' }) });
}
export const grassImpostorTransitionPars = await payload('pars', 'grass_impostor_transition_pars');
export const grassImpostorTransitionBody = await payload('body', 'grass_impostor_transition');
