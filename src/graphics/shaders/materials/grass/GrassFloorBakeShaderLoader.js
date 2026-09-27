// Capture cutout grass PBR channels and project them into floor UVs.
import { createShaderPayload, loadShaderSourceSet } from '../../core/ShaderLoader.js';

export const grassPatchCaptureShader = createShaderPayload({
    shaderId: 'materials.grass.patch_capture',
    sourceSet: await loadShaderSourceSet({
        vertexPath: 'materials/grass/grass_card_normal_bake.vert.glsl',
        fragmentPath: 'materials/grass/grass_patch_capture.frag.glsl'
    })
});

export const grassFloorNormalBakeShader = createShaderPayload({
    shaderId: 'materials.grass.floor_normal_bake',
    sourceSet: await loadShaderSourceSet({
        vertexPath: 'materials/grass/grass_card_normal_bake.vert.glsl',
        fragmentPath: 'materials/grass/grass_floor_normal_bake.frag.glsl'
    })
});
export const grassFloorProjectionShader = createShaderPayload({
    shaderId: 'materials.grass.floor_projection',
    sourceSet: await loadShaderSourceSet({
        vertexPath: 'materials/grass/grass_floor_projection.vert.glsl',
        fragmentPath: 'materials/grass/grass_floor_projection.frag.glsl'
    })
});
