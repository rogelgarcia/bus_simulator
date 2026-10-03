// Load opt-in diagnostic substitutions without changing the production canopy shaders.
import { createShaderPayload, loadShaderSourceSet } from '../../core/ShaderLoader.js';

export const grassCanopyDiagnosticShaders = Object.freeze(Object.fromEntries(await Promise.all(
    ['normal', 'visibility', 'baked_visibility', 'coverage', 'diffuse', 'ibl', 'specular', 'albedo', 'constant'].map(async name => [name,
        createShaderPayload({ shaderId: 'materials.grass.canopy-diagnostic.' + name,
            sourceSet: await loadShaderSourceSet({ vertexPath: 'materials/grass/grass_card_normal_bake.vert.glsl',
                fragmentPath: 'materials/grass/grass_canopy_diagnostic_' + name + '.frag.glsl' }) })]))));
