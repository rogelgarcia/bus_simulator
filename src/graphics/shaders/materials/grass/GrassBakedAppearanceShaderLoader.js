// Isolated unlit grass experiment: paired color maps and cached external visibility.
import { createShaderPayload, loadShaderSourceSet } from '../../core/ShaderLoader.js?v=canopy-palette-17';
export const grassBakedAppearanceShader = createShaderPayload({
    shaderId: 'materials.grass.baked_appearance',
    sourceSet: await loadShaderSourceSet({ vertexPath: 'materials/grass/grass_baked_appearance.vert.glsl?v=canopy-palette-17',
        fragmentPath: 'materials/grass/grass_baked_appearance.frag.glsl?v=canopy-palette-17' })
});
