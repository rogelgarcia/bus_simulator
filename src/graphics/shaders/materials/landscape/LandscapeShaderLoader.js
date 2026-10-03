// Loads terrain and inspection shaders with one shared morph contract.
// @ts-check
import { createShaderPayload, loadShaderSourceSet } from '../../core/ShaderLoader.js';

const [terrain, lines] = await Promise.all([
    loadShaderSourceSet({ vertexPath: 'materials/landscape/terrain.vert.glsl', fragmentPath: 'materials/landscape/terrain.frag.glsl' }),
    loadShaderSourceSet({ vertexPath: 'materials/landscape/lines.vert.glsl', fragmentPath: 'materials/landscape/lines.frag.glsl' })
]);

/** @param {'terrain'|'lines'} kind @returns {any} */
export function createLandscapeShaderPayload(kind) {
    if (kind !== 'terrain' && kind !== 'lines') throw new Error(`Unknown landscape shader ${kind}`);
    return createShaderPayload({ shaderId: `landscape/${kind}`, sourceSet: kind === 'terrain' ? terrain : lines });
}
