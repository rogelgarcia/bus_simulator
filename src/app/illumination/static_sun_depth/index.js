// Public AI 531 static-sun depth contract, encoding, residency and sampler API.
// @ts-check

export {
    STATIC_SUN_DEPTH_CHANNEL_ID,
    STATIC_SUN_DEPTH_CHANNEL_VERSION,
    STATIC_SUN_DEPTH_TILE_SET_SCHEMA,
    createStableStaticSunDepthBasis,
    createThreeR183DirectionalShadowFilterAxes,
    lookupStaticSunDepthTile,
    staticSunDepthIdentityEquals,
    validateStaticSunDepthIdentity,
    validateStaticSunDepthTileSetDescriptor
} from './StaticSunDepthContract.js';

export {
    STATIC_SUN_DEPTH_EMPTY_QUANTIZED,
    STATIC_SUN_DEPTH_DIAGNOSTIC_EMPTY_ALPHA,
    STATIC_SUN_DEPTH_DIAGNOSTIC_ENCODING_ID,
    STATIC_SUN_DEPTH_DIAGNOSTIC_MAX_QUANTIZED,
    STATIC_SUN_DEPTH_DIAGNOSTIC_OCCUPIED_ALPHA,
    STATIC_SUN_DEPTH_ENCODING_ID,
    STATIC_SUN_DEPTH_MAX_QUANTIZED,
    decodeStaticSunDepthMeters,
    encodeStaticSunDepthMeters,
    getStaticSunDepthBytesPerTexel,
    packStaticSunDepthQuantizedRg8,
    packStaticSunDepthQuantizedRgba8Diagnostic,
    unpackStaticSunDepthQuantizedRg8,
    unpackStaticSunDepthQuantizedRgba8Diagnostic
} from './StaticSunDepthEncoding.js';

export {
    STATIC_SUN_DEPTH_RESIDENCY_SCHEMA,
    createStaticSunDepthActiveSet,
    createStaticSunDepthResidency
} from './StaticSunDepthResidency.js';

export {sampleStaticSunDepthWorld} from './StaticSunDepthSampler.js';

export {
    STATIC_SUN_DEPTH_TILE_ARRAY_INTEGRITY_SCHEMA,
    validateOwnedStaticSunDepthTileArrayIntegrity,
    validateStaticSunDepthTileArrayIntegrity
} from './StaticSunDepthTileArrayIntegrity.js';

export {
    STATIC_SUN_DEPTH_CANONICAL_CHUNK_ID,
    STATIC_SUN_DEPTH_DIAGNOSTIC_CHUNK_ID,
    STATIC_SUN_DEPTH_DIAGNOSTIC_LAYER_WINDOW_CHUNK_PREFIX,
    STATIC_SUN_DEPTH_LAYER_WINDOW_CHUNK_DIGITS,
    STATIC_SUN_DEPTH_LAYER_WINDOW_CHUNK_PREFIX,
    STATIC_SUN_DEPTH_LAYER_WINDOW_SCHEMA,
    createStaticSunDepthLayerWindowEnvelope,
    partitionStaticSunDepthLayers,
    staticSunDepthLayerWindowChunkId,
    validateStaticSunDepthLayerWindowChunks,
    validateStaticSunDepthLayerWindowEnvelope
} from './StaticSunDepthChunkWindows.js';
