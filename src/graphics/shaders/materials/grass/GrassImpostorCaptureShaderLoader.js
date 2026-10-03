// Capture linear source material channels for camera-dependent grass impostors.
import { createShaderPayload, loadShaderSourceSet } from '../../core/ShaderLoader.js';

export const grassImpostorCaptureShader = createShaderPayload({
    shaderId: 'materials.grass.impostor_capture',
    sourceSet: await loadShaderSourceSet({
        vertexPath: 'materials/grass/grass_impostor_capture.vert.glsl',
        fragmentPath: 'materials/grass/grass_impostor_capture.frag.glsl'
    })
});

export const grassImpostorCaptureDeclarationsShader = createShaderPayload({
    shaderId: 'materials.grass.impostor_capture_declarations',
    sourceSet: await loadShaderSourceSet({
        vertexPath: 'materials/grass/grass_impostor_capture_pars.vert.glsl',
        fragmentPath: 'materials/grass/grass_impostor_capture_pars.frag.glsl'
    })
});
