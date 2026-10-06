// Prepared directional grass captures and continuously camera-facing placement.
import { createShaderPayload, loadShaderSourceSet } from '../../core/ShaderLoader.js';
export const grassViewCardsShader = createShaderPayload({
    shaderId: 'materials.grass.view_cards',
    sourceSet: await loadShaderSourceSet({ vertexPath: 'materials/grass/grass_view_cards.vert.glsl?v=card-continuity-1',
        fragmentPath: 'materials/grass/grass_view_cards.frag.glsl?v=card-continuity-1' })
});
