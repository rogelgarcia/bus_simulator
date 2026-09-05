// Loads and fingerprints receiver-irradiance shader declarations and composition fragments.
import { createShaderPayload, loadShaderSourceSet } from '../core/ShaderLoader.js';

const sources = await loadShaderSourceSet({ vertexPath: 'materials/receiver_lightmap.vert.glsl', fragmentPath: 'materials/receiver_lightmap.frag.glsl' });
const composition = await loadShaderSourceSet({ vertexPath: 'materials/receiver_lightmap_indirect.glsl', fragmentPath: 'materials/receiver_lightmap_direct.glsl' });
const apply = await loadShaderSourceSet({ vertexPath: 'materials/receiver_lightmap_apply.vert.glsl', fragmentPath: 'materials/receiver_lightmap_apply.frag.glsl' });
const declarations = createShaderPayload({ shaderId: 'illumination.receiver.declarations.v1', sourceSet: sources });
const terms = createShaderPayload({ shaderId: 'illumination.receiver.terms.v1', sourceSet: composition });
const calls = createShaderPayload({ shaderId: 'illumination.receiver.calls.v1', sourceSet: apply });

export function getReceiverLightmapShaderPayload() {
    return { ...declarations, indirect: terms.vertexSource, direct: terms.fragmentSource,
        vertexApply: calls.vertexSource, fragmentApply: calls.fragmentSource,
        variantKey: [declarations.variantKey, terms.variantKey, calls.variantKey].join('.') };
}
