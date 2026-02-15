// src/graphics/visuals/postprocessing/GtaoCacheSupport.js
// Resolves whether GTAO cached blending can reuse a pass texture this frame.
// @ts-check

function asTexture(value) {
    return value && typeof value === 'object' && value.isTexture === true ? value : null;
}

export function resolveGtaoCacheTexture(pass) {
    const p = pass && typeof pass === 'object' ? pass : null;
    if (!p) return { supported: false, mode: 'none', texture: null };

    const nativeTexture = asTexture(p.gtaoMap);
    if (nativeTexture) {
        return { supported: true, mode: 'native_map', texture: nativeTexture };
    }

    const pdTexture = asTexture(p.pdRenderTarget?.texture);
    if (pdTexture) {
        return { supported: true, mode: 'pd_target', texture: pdTexture };
    }

    const rawTexture = asTexture(p.gtaoRenderTarget?.texture);
    if (rawTexture) {
        return { supported: true, mode: 'raw_target', texture: rawTexture };
    }

    return { supported: false, mode: 'none', texture: null };
}

