// Shares thin-leaf transmission and optional direct-light canopy shading between blades and cards.
import { createShaderPayload, loadShaderSourceSet } from '../../core/ShaderLoader.js';

export const grassBladeLightingShader = createShaderPayload({
    shaderId: 'materials.grass.blade_lighting',
    sourceSet: await loadShaderSourceSet({
        vertexPath: 'materials/grass/grass_blade_lighting.vert.glsl',
        fragmentPath: 'materials/grass/grass_blade_lighting.frag.glsl?v=lod3-w-1'
    })
});
