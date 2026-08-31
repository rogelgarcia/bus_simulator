// Public AI 531 static-sun depth contract, encoding, residency and sampler API.
// @ts-check

export {
    STATIC_SUN_DEPTH_CHANNEL_ID,
    STATIC_SUN_DEPTH_CHANNEL_VERSION,
    STATIC_SUN_DEPTH_TILE_SET_SCHEMA,
    createStableStaticSunDepthBasis,
    lookupStaticSunDepthTile,
    staticSunDepthIdentityEquals,
    validateStaticSunDepthIdentity,
    validateStaticSunDepthTileSetDescriptor
} from './StaticSunDepthContract.js';

export {
    STATIC_SUN_DEPTH_EMPTY_QUANTIZED,
    STATIC_SUN_DEPTH_ENCODING_ID,
    STATIC_SUN_DEPTH_MAX_QUANTIZED,
    decodeStaticSunDepthMeters,
    encodeStaticSunDepthMeters,
    packStaticSunDepthQuantizedRg8,
    unpackStaticSunDepthQuantizedRg8
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
