// Dedicated capture and shading chunks for dynamically assigned grass plates.
import { createShaderPayload, loadShaderSourceSet } from '../../core/ShaderLoader.js';
const vertexPath = 'materials/grass/grass_plate_surface.vert.glsl?v=lod3-plates-2';
export const grassPlateSurfaceBakeShader = createShaderPayload({
    shaderId: 'materials.grass.plate_surface',
    sourceSet: await loadShaderSourceSet({ vertexPath, fragmentPath: 'materials/grass/grass_plate_surface.frag.glsl?v=lod3-plates-2' })
});
export const grassPlateRoughnessShader = createShaderPayload({
    shaderId: 'materials.grass.plate_roughness',
    sourceSet: await loadShaderSourceSet({ vertexPath, fragmentPath: 'materials/grass/grass_plate_roughness.frag.glsl?v=lod3-plates-2' })
});
export const grassPlateParsShader = createShaderPayload({
    shaderId: 'materials.grass.plate_pars',
    sourceSet: await loadShaderSourceSet({ vertexPath, fragmentPath: 'materials/grass/grass_plate_pars.frag.glsl?v=lod3-plates-2' })
});

export const grassPlateNormalShader = createShaderPayload({
    shaderId: 'materials.grass.plate_normal',
    sourceSet: await loadShaderSourceSet({
        vertexPath: 'materials/grass/grass_plate_normal_capture.vert.glsl?v=lod3-plates-2',
        fragmentPath: 'materials/grass/grass_ribbon_card_normal.frag.glsl?v=lod3-w-1'
    })
});

export const grassPlateCoverageShader = createShaderPayload({
    shaderId: 'materials.grass.plate_coverage',
    sourceSet: await loadShaderSourceSet({ vertexPath, fragmentPath: 'materials/grass/grass_plate_coverage.frag.glsl?v=lod3-plates-2' })
});
