// Samples visible scene depth into a one-pixel millimetre distance value.
import { createShaderPayload, loadShaderSourceSet } from '../core/ShaderLoader.js';

export const cursorDistanceShader = createShaderPayload({
    shaderId: 'postprocessing.cursor_distance',
    sourceSet: await loadShaderSourceSet({
        vertexPath: 'postprocessing/cursor_distance.vert.glsl',
        fragmentPath: 'postprocessing/cursor_distance.frag.glsl'
    })
});
