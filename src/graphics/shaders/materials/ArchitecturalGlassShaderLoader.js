// Loads the thin coated dielectric response for authored architectural panes.
import { createShaderPayload, loadShaderSourceSet } from '../core/ShaderLoader.js';
export const architecturalGlassShader = createShaderPayload({
    shaderId: 'materials.architectural_glass',
    sourceSet: await loadShaderSourceSet({ vertexPath: 'materials/architectural_glass.vert.glsl', fragmentPath: 'materials/architectural_glass.frag.glsl' })
});
export const architecturalGlassDeclarations = createShaderPayload({
    shaderId: 'materials.architectural_glass.declarations',
    sourceSet: await loadShaderSourceSet({ vertexPath: 'materials/architectural_glass.vert.glsl', fragmentPath: 'materials/architectural_glass_declarations.glsl' })
});
