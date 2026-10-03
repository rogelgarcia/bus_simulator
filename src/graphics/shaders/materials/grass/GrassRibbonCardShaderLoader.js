// Relightable ribbon alpha-card palette, UV and source-normal shader chunks.
import { createShaderPayload, loadShaderSourceSet } from '../../core/ShaderLoader.js';

export const grassRibbonCardShader = createShaderPayload({
    shaderId: 'materials.grass.ribbon_card',
    sourceSet: await loadShaderSourceSet({
        vertexPath: 'materials/grass/grass_ribbon_card.vert.glsl?v=lod3-w-1',
        fragmentPath: 'materials/grass/grass_ribbon_card_pars.frag.glsl?v=lod3-w-1'
    })
});
export const grassRibbonCardMapShader = createShaderPayload({
    shaderId: 'materials.grass.ribbon_card_map',
    sourceSet: await loadShaderSourceSet({
        vertexPath: 'materials/grass/grass_ribbon_card_uv.vert.glsl?v=lod3-w-1',
        fragmentPath: 'materials/grass/grass_ribbon_card_map.frag.glsl?v=lod3-w-1'
    })
});
export const grassRibbonCardNormalShader = createShaderPayload({
    shaderId: 'materials.grass.ribbon_card_normal',
    sourceSet: await loadShaderSourceSet({
        vertexPath: 'materials/grass/grass_plant_facing.vert.glsl?v=lod3-w-1',
        fragmentPath: 'materials/grass/grass_ribbon_card_normal.frag.glsl?v=lod3-w-1'
    })
});

export const grassRibbonCardSurfaceBakeShader = createShaderPayload({
    shaderId: 'materials.grass.ribbon_card_surface_bake',
    sourceSet: await loadShaderSourceSet({
        vertexPath: 'materials/grass/grass_ribbon_card_surface_bake.vert.glsl?v=lod3-w-1',
        fragmentPath: 'materials/grass/grass_ribbon_card_surface_bake.frag.glsl?v=lod3-w-1'
    })
});
export const grassRibbonCardRoughnessShader = createShaderPayload({
    shaderId: 'materials.grass.ribbon_card_roughness',
    sourceSet: await loadShaderSourceSet({
        vertexPath: 'materials/grass/grass_ribbon_card.vert.glsl?v=lod3-w-1',
        fragmentPath: 'materials/grass/grass_ribbon_card_roughness.frag.glsl?v=lod3-w-1'
    })
});
