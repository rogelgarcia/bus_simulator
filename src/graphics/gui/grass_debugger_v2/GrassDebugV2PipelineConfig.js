// Declarative recipes for the leaf-derived comparison configurations.
// @ts-check
const freeze = value => {
    if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
    return value;
};

export const GRASS_V2_PIPELINE_CONFIG = freeze({
    reference: { count: 4000, seed: 9262026 },
    captures: { lod: 'refined', resolution: 2048 },
    layout: { gapMeters: 0.3, mixedInsetMeters: 0.01, mixedHeightMeters: 0.01 },
    textures: [
        { id: '4k', stride: 1, offset: 0, canopyContrast: 1 },
        { id: '2k', stride: 2, offset: 0, canopyContrast: 0.5 },
        { id: '4k-single', stride: 1, offset: 0, canopyContrast: 1, resolution: 1024 }
    ],
    configurations: [
        { id: 'source', kind: 'reference', x: 0, z: 0, stride: 1, offset: 0 },
        { id: 'texture4k', kind: 'volume', x: -2.6, z: -1.3, texture: '4k' },
        { id: 'hybrid1k', kind: 'hybrid', x: 0, z: -2.6, texture: '4k', stride: 4, offset: 0 },
        { id: 'reference', kind: 'reference', x: 1.3, z: 0, stride: 2, offset: 0 },
        { id: 'texture2k', kind: 'volume', x: 1.3, z: -1.3, texture: '2k' },
        { id: 'hybrid2k', kind: 'hybrid', x: 1.3, z: -2.6, texture: '2k', stride: 2, offset: 1 },
        { id: 'rings4k', kind: 'experiment', x: -1.3, z: -1.3, texture: '4k-single',
            directional: { resolution: 1024, azimuthOffsetsDegrees: [0] } }
    ],
    volume: {}, ring: {}, directional: {}, field: {}
});

/** @param {Partial<typeof GRASS_V2_PIPELINE_CONFIG>} overrides */
export function resolveGrassDebugV2PipelineConfig(overrides = {}) {
    const config = structuredClone({ ...GRASS_V2_PIPELINE_CONFIG, ...overrides,
        reference: { ...GRASS_V2_PIPELINE_CONFIG.reference, ...overrides.reference },
        captures: { ...GRASS_V2_PIPELINE_CONFIG.captures, ...overrides.captures },
        layout: { ...GRASS_V2_PIPELINE_CONFIG.layout, ...overrides.layout } });
    const unique = (entries, type) => {
        const ids = new Set();
        for (const entry of entries) {
            if (!entry.id || ids.has(entry.id)) throw new Error('Invalid or duplicate grass ' + type + ' ID.');
            ids.add(entry.id);
        }
        return ids;
    };
    const textures = unique(config.textures, 'texture');
    const configurations = unique(config.configurations, 'configuration');
    const source = config.configurations.find(item => item.id === 'source');
    if (!source || source.kind !== 'reference' || source.stride !== 1 || source.offset !== 0 || source.x !== 0 || source.z !== 0)
        throw new Error('Grass pipeline requires the complete source reference at the origin.');
    if (!Number.isInteger(config.reference.count) || config.reference.count <= 0 || config.reference.count > 10000 || config.reference.count % 10)
        throw new Error('Grass reference count must be a multiple of ten up to 10,000.');
    if (!Number.isInteger(config.reference.seed) || config.reference.seed < 0 || config.reference.seed > 0xffffffff || !['refined', 'detailed', 'curved', 'split'].includes(config.captures.lod))
        throw new Error('Invalid grass source seed or capture LOD.');
    if (!Number.isInteger(config.captures.resolution) || config.captures.resolution < 256 || config.captures.resolution > 4096)
        throw new Error('Grass capture resolution must be between 256 and 4096.');
    for (const item of [...config.textures, ...config.configurations.filter(item => item.kind === 'reference' || item.kind === 'hybrid')])
        if (!Number.isInteger(item.stride) || item.stride < 1 || !Number.isInteger(item.offset) || item.offset < 0 || item.offset >= item.stride)
            throw new Error('Invalid grass subset recipe: ' + item.id);
    for (const texture of config.textures) {
        if (!Number.isFinite(texture.canopyContrast) || texture.canopyContrast < 0 || texture.canopyContrast > 1)
            throw new Error('Invalid grass texture contrast: ' + texture.id);
        const resolution = texture.resolution ?? config.captures.resolution;
        if (!Number.isInteger(resolution) || resolution < 256 || resolution > 4096)
            throw new Error('Invalid grass texture resolution: ' + texture.id);
    }
    for (const item of config.configurations) {
        if (!['reference', 'volume', 'hybrid', 'edge', 'experiment'].includes(item.kind) || ![item.x, item.z].every(Number.isFinite))
            throw new Error('Invalid grass configuration: ' + item.id);
        if (item.kind !== 'reference' && !textures.has(item.texture)) throw new Error('Missing texture for ' + item.id);
        if (item.kind === 'edge' && !(Number.isFinite(item.edgeDepth) && item.edgeDepth > 0 && item.edgeDepth < 0.5))
            throw new Error('Invalid grass edge depth: ' + item.id);
    }
    const { gapMeters, mixedInsetMeters, mixedHeightMeters } = config.layout;
    if (!(gapMeters >= 0 && mixedInsetMeters >= 0 && mixedInsetMeters < 0.5 && mixedHeightMeters >= 0)
        || ![gapMeters, mixedInsetMeters, mixedHeightMeters].every(Number.isFinite)) throw new Error('Invalid grass layout recipe.');
    return freeze(config);
}
