// Builds a verified production AI 531 static-sun texture-array package.
// @ts-check

import {
    canonicalJsonBytes,
    canonicalJsonStringify,
    cloneCanonicalJson
} from '../../../src/app/illumination/bake_source/CanonicalJson.js';
import {
    ILLUMINATION_MAX_CHUNK_BYTES,
    buildIlluminationBinaryPackage,
    getIlluminationCapabilityProfile,
    rawSha256Hex,
    verifyIlluminationBinaryPackage
} from '../../../src/app/illumination/package/index.js';
import {
    STATIC_SUN_DEPTH_CANONICAL_CHUNK_ID,
    STATIC_SUN_DEPTH_DIAGNOSTIC_CHUNK_ID,
    STATIC_SUN_DEPTH_DIAGNOSTIC_ENCODING_ID,
    STATIC_SUN_DEPTH_ENCODING_ID,
    STATIC_SUN_DEPTH_CHANNEL_ID,
    STATIC_SUN_DEPTH_LAYER_WINDOW_SCHEMA,
    createStaticSunDepthLayerWindowEnvelope,
    partitionStaticSunDepthLayers,
    staticSunDepthLayerWindowChunkId,
    validateStaticSunDepthLayerWindowChunks,
    validateStaticSunDepthTileArrayIntegrity,
    validateStaticSunDepthTileSetDescriptor
} from '../../../src/app/illumination/static_sun_depth/index.js';

export const PRODUCTION_STATIC_SUN_DEPTH_CHUNK_ID = STATIC_SUN_DEPTH_CANONICAL_CHUNK_ID;
export const PRODUCTION_DEPTH_DIAGNOSTIC_CHUNK_ID = STATIC_SUN_DEPTH_DIAGNOSTIC_CHUNK_ID;
export { STATIC_SUN_DEPTH_LAYER_WINDOW_SCHEMA as PRODUCTION_STATIC_SUN_DEPTH_LAYER_WINDOW_SCHEMA };

const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const REQUIRED_RUNTIME_CAPABILITIES = Object.freeze([
    'fragment_highp_float',
    'rg8_unorm',
    'texture_2d_array',
    'webgl2'
]);
const DIAGNOSTIC_REQUIRED_RUNTIME_CAPABILITIES = Object.freeze([
    'fragment_highp_float',
    'rgba8_unorm',
    'texture_2d_array',
    'webgl2'
]);
const PRODUCTION_PACKAGE_CONTRACT = Object.freeze({
    chunkId: PRODUCTION_STATIC_SUN_DEPTH_CHUNK_ID,
    components: 2,
    descriptorEncodingId: STATIC_SUN_DEPTH_ENCODING_ID,
    requiredRuntimeCapabilities: REQUIRED_RUNTIME_CAPABILITIES,
    resourceEncoding: 'rg8_unorm'
});
const DIAGNOSTIC_PACKAGE_CONTRACT = Object.freeze({
    chunkId: PRODUCTION_DEPTH_DIAGNOSTIC_CHUNK_ID,
    components: 4,
    descriptorEncodingId: STATIC_SUN_DEPTH_DIAGNOSTIC_ENCODING_ID,
    requiredRuntimeCapabilities: DIAGNOSTIC_REQUIRED_RUNTIME_CAPABILITIES,
    resourceEncoding: 'rgba8_unorm'
});

/**
 * @typedef {{
 *   descriptor: unknown,
 *   payload: Uint8Array,
 *   cityId: string,
 *   lightingProfileId: string,
 *   selectedCapabilityProfileId: string,
 *   source: Record<string, unknown>,
 *   compilerDescriptor: Record<string, unknown>,
 *   channelProfileSha256: string
 * }} ProductionStaticSunDepthPackageOptions
 */

/**
 * Validates the complete tile set, builds one logical AI 530 texture array,
 * and reparses the finished bytes under the exact production identity.
 *
 * @param {ProductionStaticSunDepthPackageOptions} options
 * @returns {Promise<Readonly<Record<string, any>>>}
 */
export async function buildProductionStaticSunDepthPackage(options) {
    return buildStaticSunDepthPackage(options, PRODUCTION_PACKAGE_CONTRACT);
}

export async function buildProductionDepthDiagnosticPackage(options) {
    return buildStaticSunDepthPackage(options, DIAGNOSTIC_PACKAGE_CONTRACT);
}

async function buildStaticSunDepthPackage(options, contract) {
    const prepared = prepareOptions(options, contract);
    let verifiedPayload = null;
    const integrityPromise = validateStaticSunDepthTileArrayIntegrity(
        prepared.descriptor,
        prepared.payload,
        (payload) => {
            verifiedPayload = payload;
        }
    );
    const compilerSignaturePromise = rawSha256Hex(
        canonicalJsonBytes(prepared.compilerDescriptor)
    );
    const [tileArrayIntegrity, compilerSignatureSha256] = await Promise.all([
        integrityPromise,
        compilerSignaturePromise
    ]);
    if (compilerSignatureSha256 !== prepared.descriptor.identity.compilerSignatureSha256) {
        throw new Error(
            'compilerDescriptor canonical SHA-256 does not match '
            + 'descriptor.identity.compilerSignatureSha256'
        );
    }
    if (!(verifiedPayload instanceof Uint8Array)) {
        throw new Error('Static-sun tile-array validation did not return verified payload bytes');
    }

    const dimensions = Object.freeze({
        components: contract.components,
        depth: prepared.descriptor.tiles.length,
        height: prepared.descriptor.tiles[0].storedTexels[1],
        width: prepared.descriptor.tiles[0].storedTexels[0]
    });
    const chunks = await buildStaticSunDepthChunkInputs(
        prepared.descriptor,
        verifiedPayload,
        dimensions,
        ILLUMINATION_MAX_CHUNK_BYTES,
        contract
    );
    const built = await buildIlluminationBinaryPackage({
        cityId: prepared.cityId,
        lightingProfileId: prepared.lightingProfileId,
        selectedCapabilityProfileId: prepared.selectedCapabilityProfileId,
        source: prepared.source,
        compilerDescriptor: prepared.compilerDescriptor,
        channels: [{
            id: STATIC_SUN_DEPTH_CHANNEL_ID,
            required: true,
            sourceSha256: prepared.descriptor.identity.channelSourceSha256,
            profileSha256: prepared.channelProfileSha256,
            schemaVersion: prepared.descriptor.identity.channelVersion
        }],
        chunks
    });
    const verified = await verifyIlluminationBinaryPackage(built.bytes, {
        expectations: {
            aggregateSha256: built.aggregateSha256,
            cityId: prepared.cityId,
            compilerSignatureSha256,
            lightingProfileId: prepared.lightingProfileId,
            profileSha256: prepared.channelProfileSha256,
            resolvedSourceSha256: prepared.source.resolvedSourceSha256,
            selectedCapabilityProfileId: prepared.selectedCapabilityProfileId,
            staticSunDepthSourceSha256: prepared.descriptor.identity.channelSourceSha256
        }
    });
    assertVerifiedShape(verified, prepared.descriptor, dimensions, contract);
    return Object.freeze({
        ...verified,
        bytes: built.bytes,
        buildMetrics: built.metrics,
        tileArrayIntegrity
    });
}

/**
 * @param {Readonly<Record<string, any>>} descriptor
 * @param {Uint8Array} payload
 * @param {{components: number, depth: number, height: number, width: number}} dimensions
 * @param {number} [maximumChunkBytes]
 */
export async function buildProductionStaticSunDepthChunkInputs(
    descriptor,
    payload,
    dimensions,
    maximumChunkBytes = ILLUMINATION_MAX_CHUNK_BYTES
) {
    return buildStaticSunDepthChunkInputs(
        descriptor,
        payload,
        dimensions,
        maximumChunkBytes,
        PRODUCTION_PACKAGE_CONTRACT
    );
}

export async function buildProductionDepthDiagnosticChunkInputs(
    descriptor,
    payload,
    dimensions,
    maximumChunkBytes = ILLUMINATION_MAX_CHUNK_BYTES
) {
    return buildStaticSunDepthChunkInputs(
        descriptor,
        payload,
        dimensions,
        maximumChunkBytes,
        DIAGNOSTIC_PACKAGE_CONTRACT
    );
}

async function buildStaticSunDepthChunkInputs(
    descriptor,
    payload,
    dimensions,
    maximumChunkBytes,
    contract
) {
    if (!(payload instanceof Uint8Array)) throw new TypeError('payload must be a Uint8Array');
    const layerByteLength = dimensions.width * dimensions.height * dimensions.components;
    if (!Number.isSafeInteger(layerByteLength)
        || layerByteLength * dimensions.depth !== payload.byteLength) {
        throw new RangeError('Production static-sun payload does not match its array dimensions');
    }
    const windows = partitionStaticSunDepthLayers(
        layerByteLength,
        dimensions.depth,
        maximumChunkBytes
    );
    const base = Object.freeze({
        channelId: STATIC_SUN_DEPTH_CHANNEL_ID,
        resourceType: 'texture_2d_array',
        encoding: contract.resourceEncoding,
        precision: 'unorm8',
        rowOrigin: 'lower_left',
        mipLevel: 0,
        requiredRuntimeCapabilities: contract.requiredRuntimeCapabilities
    });
    if (payload.byteLength <= maximumChunkBytes) {
        return Object.freeze([Object.freeze({
            ...base,
            id: contract.chunkId,
            data: payload,
            dimensions,
            coordinateTransform: descriptor
        })]);
    }
    const assembledSha256 = await rawSha256Hex(payload);
    return Object.freeze(windows.map((window, index) => {
        const start = window.firstLayer * layerByteLength;
        return Object.freeze({
            ...base,
            id: staticSunDepthLayerWindowChunkId(
                index,
                contract.resourceEncoding
            ),
            data: payload.subarray(start, start + window.byteLength),
            dimensions: Object.freeze({
                ...dimensions,
                depth: window.layerCount
            }),
            coordinateTransform: createStaticSunDepthLayerWindowEnvelope({
                assembledByteLength: payload.byteLength,
                assembledSha256,
                firstLayer: window.firstLayer,
                layerCount: window.layerCount,
                outputDescriptor: descriptor
            })
        });
    }));
}

/** @param {ProductionStaticSunDepthPackageOptions} options */
function prepareOptions(options, contract) {
    if (!options || typeof options !== 'object') {
        throw new TypeError('Production static-sun package options are required');
    }
    const descriptor = validateStaticSunDepthTileSetDescriptor(options.descriptor);
    if (descriptor.identity.encoding.id !== contract.descriptorEncodingId) {
        throw new Error(
            `Static-sun package descriptor encoding must be '${contract.descriptorEncodingId}'`
        );
    }
    const cityId = options.cityId;
    const lightingProfileId = options.lightingProfileId;
    const selectedCapabilityProfileId = options.selectedCapabilityProfileId;
    const channelProfileSha256 = options.channelProfileSha256;
    if (typeof cityId !== 'string' || !cityId
        || typeof lightingProfileId !== 'string' || !lightingProfileId
        || typeof selectedCapabilityProfileId !== 'string' || !selectedCapabilityProfileId) {
        throw new TypeError('cityId, lightingProfileId, and selectedCapabilityProfileId are required');
    }
    if (cityId !== descriptor.identity.cityId) {
        throw new Error('cityId does not match descriptor.identity.cityId');
    }
    if (typeof channelProfileSha256 !== 'string' || !SHA256_PATTERN.test(channelProfileSha256)) {
        throw new TypeError('channelProfileSha256 must be 64 lowercase hexadecimal characters');
    }
    const capabilityProfile = getIlluminationCapabilityProfile(selectedCapabilityProfileId);
    if (!capabilityProfile.requiredChannels.includes(STATIC_SUN_DEPTH_CHANNEL_ID)) {
        throw new Error(
            'selectedCapabilityProfileId must require the static_sun_depth channel'
        );
    }
    return Object.freeze({
        descriptor,
        payload: options.payload,
        cityId,
        lightingProfileId,
        selectedCapabilityProfileId,
        source: cloneCanonicalJson(options.source),
        compilerDescriptor: cloneCanonicalJson(options.compilerDescriptor),
        channelProfileSha256
    });
}

/**
 * @param {Readonly<Record<string, any>>} verified
 * @param {Readonly<import('../../../src/app/illumination/static_sun_depth/StaticSunDepthContract.js').StaticSunDepthTileSetDescriptor>} descriptor
 * @param {{components: number, depth: number, height: number, width: number}} dimensions
 */
function assertVerifiedShape(verified, descriptor, dimensions, contract) {
    const resolved = requireStaticSunDepthChunkWindows(
        verified.chunks,
        contract
    );
    if (verified.compatibility?.compatible !== true
        || canonicalJsonStringify(resolved.dimensions) !== canonicalJsonStringify(dimensions)
        || canonicalJsonStringify(resolved.outputDescriptor)
            !== canonicalJsonStringify(descriptor)) {
        throw new Error('Verified static-sun package does not match the production tile-array contract');
    }
}

/**
 * Shared strict release boundary for direct single-chunk and authenticated
 * multi-window production arrays.
 * @param {readonly Readonly<Record<string, any>>[]} chunks
 */
export function requireProductionStaticSunDepthChunkWindows(chunks) {
    return requireStaticSunDepthChunkWindows(
        chunks,
        PRODUCTION_PACKAGE_CONTRACT
    );
}

export function requireProductionDepthDiagnosticChunkWindows(chunks) {
    return requireStaticSunDepthChunkWindows(
        chunks,
        DIAGNOSTIC_PACKAGE_CONTRACT
    );
}

function requireStaticSunDepthChunkWindows(chunks, contract) {
    if (!Array.isArray(chunks) || chunks.length < 1) {
        throw new TypeError('Production static-sun chunks must be a non-empty array');
    }
    const descriptors = chunks.map((entry, index) => {
        if (!entry || typeof entry !== 'object') {
            throw new TypeError(`Production static-sun chunks[${index}] must be an object`);
        }
        return entry.descriptor ?? entry;
    });
    if (descriptors.length !== 1
        || descriptors[0].id !== contract.chunkId) {
        const resolved = validateStaticSunDepthLayerWindowChunks(descriptors);
        if (canonicalJsonStringify(resolved.requiredRuntimeCapabilities)
                !== canonicalJsonStringify(contract.requiredRuntimeCapabilities)
            || resolved.resourceEncoding !== contract.resourceEncoding
            || resolved.canonicalChunkId !== contract.chunkId
            || resolved.outputDescriptor.identity.encoding.id
                !== contract.descriptorEncodingId) {
            throw new Error('Production static-sun layer windows require the exact runtime capability set');
        }
        return Object.freeze({
            ...resolved,
            firstLayer: 0,
            id: contract.chunkId,
            layerCount: resolved.dimensions.depth,
            mode: 'layer-windows'
        });
    }
    const descriptor = descriptors[0];
    const outputDescriptor = validateStaticSunDepthTileSetDescriptor(
        descriptor.coordinateTransform
    );
    const stored = outputDescriptor.tiles[0].storedTexels;
    const dimensions = Object.freeze({
        components: contract.components,
        depth: outputDescriptor.tiles.length,
        height: stored[1],
        width: stored[0]
    });
    const assembledByteLength = dimensions.width
        * dimensions.height
        * dimensions.depth
        * dimensions.components;
    if (descriptor.channelId !== STATIC_SUN_DEPTH_CHANNEL_ID
        || descriptor.resourceType !== 'texture_2d_array'
        || descriptor.encoding !== contract.resourceEncoding
        || descriptor.precision !== 'unorm8'
        || descriptor.rowOrigin !== 'lower_left'
        || descriptor.compression !== 'none'
        || descriptor.mipLevel !== 0
        || descriptor.byteLength !== assembledByteLength
        || descriptor.decodedByteLength !== assembledByteLength
        || descriptor.sha256 !== descriptor.decodedSha256
        || typeof descriptor.sha256 !== 'string'
        || !SHA256_PATTERN.test(descriptor.sha256)
        || !Number.isSafeInteger(descriptor.offset)
        || descriptor.offset < 0
        || assembledByteLength > ILLUMINATION_MAX_CHUNK_BYTES
        || outputDescriptor.identity.encoding.id !== contract.descriptorEncodingId
        || canonicalJsonStringify(descriptor.requiredRuntimeCapabilities)
            !== canonicalJsonStringify(contract.requiredRuntimeCapabilities)
        || canonicalJsonStringify(descriptor.dimensions) !== canonicalJsonStringify(dimensions)) {
        throw new Error('Direct production static-sun chunk does not match its complete texture array');
    }
    return Object.freeze({
        assembledByteLength,
        assembledSha256: descriptor.sha256,
        dimensions,
        firstLayer: 0,
        id: contract.chunkId,
        layerCount: dimensions.depth,
        mode: 'single',
        outputDescriptor,
        requiredRuntimeCapabilities: descriptor.requiredRuntimeCapabilities,
        sourceChunks: Object.freeze([Object.freeze({
            byteLength: descriptor.byteLength,
            firstLayer: 0,
            id: descriptor.id,
            layerCount: dimensions.depth,
            offset: descriptor.offset,
            sha256: descriptor.sha256
        })])
    });
}
