// Derives supported alpha-coverage transport without modifying authenticated source records.
// @ts-check
export const RECEIVER_ALPHA_TRANSPORT = 'declared-alpha-coverage-v1';

/** @param {any} manifest */
export function resolveReceiverTransport(manifest) {
    const supported = new Set();
    const materials = manifest.materials.map(material => {
        const support = material.channelSupport.indirect_irradiance;
        if (support.supported || !['blended', 'cutout_blended'].includes(material.alpha.mode)
            || material.transmission !== 0 || support.reasons.some(reason => reason !== 'unsupported_alpha_mode:' + material.alpha.mode)) return material;
        supported.add(material.id);
        return { ...material, channelSupport: { ...material.channelSupport, indirect_irradiance: { supported: true, reasons: [] } } };
    });
    const participantMappings = manifest.participantMappings.map(mapping => supported.has(mapping.materialId)
        ? { ...mapping, channelRelevance: { ...mapping.channelRelevance, indirect_irradiance: true } } : mapping);
    // An opaque depth proxy describes the shadow cache, not the surface's diffuse transport.
    // Keep the same geometry present, but let the alpha adapter own its bounce visibility.
    const casterMappings = manifest.casterMappings.map(mapping => supported.has(mapping.materialId) && mapping.coverageMode === 'forced_opaque'
        ? { ...mapping, coverageMode: 'opaque' } : mapping);
    return { ...manifest, materials, participantMappings, casterMappings };
}
