// Fail-closed package-plan and texture-layout checks for the AI 531 graphics boundary.
// @ts-check

export const STATIC_SUN_DEPTH_CHANNEL_ID = 'static_sun_depth';
export const STATIC_SUN_DEPTH_TILE_SET_SCHEMA = 'static-sun-depth-tile-set-v1';
export const ILLUMINATION_COORDINATE_ENVELOPE_SCHEMA = 'bus-sim-illumination-intermediate-coordinate-v1';

function requireRecord(value, label) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new TypeError(`${label} must be an object.`);
    }
    return value;
}

function requireExactKeys(value, expected, label) {
    const actual = Object.keys(requireRecord(value, label)).sort();
    const wanted = [...expected].sort();
    if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) {
        throw new TypeError(`${label} must contain exactly ${wanted.join(', ')}.`);
    }
}

/**
 * A static-sun pipeline owns one complete texture-array chunk. Packages with
 * unrelated optional resources must use another runtime/factory.
 * @param {any} plan
 */
export function requireStaticSunDepthPlanResource(plan) {
    const resources = requireRecord(plan, 'Static-sun resource plan').resources;
    if (!Array.isArray(resources) || resources.length !== 1) {
        throw new TypeError('Static-sun V1 requires exactly one complete texture-array resource.');
    }
    const descriptor = requireRecord(resources[0], 'Static-sun resource descriptor');
    if (descriptor.channelId !== STATIC_SUN_DEPTH_CHANNEL_ID) {
        throw new TypeError(`Static-sun resource plan rejects channel '${descriptor.channelId ?? 'unknown'}'.`);
    }
    return descriptor;
}

/**
 * Accept the canonical descriptor directly or in the one AI 529/530 coordinate
 * envelope. Alias probing is intentionally forbidden: ambiguous metadata must
 * never activate a cache.
 * @param {any} resourceDescriptor
 */
export function extractStaticSunDepthTileSetDescriptor(resourceDescriptor) {
    const coordinate = requireRecord(
        requireRecord(resourceDescriptor, 'Static-sun resource descriptor').coordinateTransform,
        'Static-sun coordinateTransform'
    );
    if (coordinate.schema === STATIC_SUN_DEPTH_TILE_SET_SCHEMA) return coordinate;
    if (coordinate.schema !== ILLUMINATION_COORDINATE_ENVELOPE_SCHEMA) {
        throw new TypeError(`Static-sun coordinateTransform schema '${coordinate.schema ?? 'unknown'}' is unsupported.`);
    }
    requireExactKeys(
        coordinate,
        ['schema', 'outputDescriptor'],
        'Static-sun coordinateTransform envelope'
    );
    const descriptor = requireRecord(
        coordinate.outputDescriptor,
        'Static-sun coordinateTransform.outputDescriptor'
    );
    if (descriptor.schema !== STATIC_SUN_DEPTH_TILE_SET_SCHEMA) {
        throw new TypeError('Static-sun coordinateTransform.outputDescriptor is not a V1 tile set.');
    }
    return descriptor;
}

/**
 * Bind duplicated activation identity to the already verified AI 530 package
 * identity. A valid nested descriptor is not sufficient when it describes a
 * different city, source, or compiler.
 * @param {any} plan
 * @param {any} descriptor
 */
export function assertStaticSunDepthPlanIdentity(plan, descriptor) {
    const planIdentity = requireRecord(
        requireRecord(plan, 'Static-sun resource plan').identity,
        'Static-sun resource plan identity'
    );
    const descriptorIdentity = requireRecord(
        requireRecord(descriptor, 'Static-sun tile-set descriptor').identity,
        'Static-sun tile-set identity'
    );
    const channelSources = requireRecord(
        requireRecord(planIdentity.sourceHashes, 'Static-sun plan sourceHashes').channels,
        'Static-sun plan channel source hashes'
    );
    const comparisons = [
        ['cityId', planIdentity.cityId, descriptorIdentity.cityId],
        ['compilerSignatureSha256', planIdentity.compilerSignature, descriptorIdentity.compilerSignatureSha256],
        ['channelSourceSha256', channelSources[STATIC_SUN_DEPTH_CHANNEL_ID], descriptorIdentity.channelSourceSha256]
    ];
    for (const [field, expected, actual] of comparisons) {
        if (typeof expected !== 'string' || expected !== actual) {
            throw new Error(`Static-sun tile-set ${field} does not match the verified package identity.`);
        }
    }
    return true;
}

/**
 * @param {any} descriptor
 * @param {{maxTextureSize?: number, maxArrayTextureLayers?: number}} [limits]
 */
export function validateStaticSunDepthUploadDescriptor(descriptor, limits = {}) {
    const resource = requireRecord(descriptor, 'Static-sun resource descriptor');
    if (resource.channelId !== STATIC_SUN_DEPTH_CHANNEL_ID) {
        throw new TypeError(`Static-sun resource factory rejects channel '${resource.channelId ?? 'unknown'}'.`);
    }
    const upload = requireRecord(resource.upload, 'Static-sun upload descriptor');
    if (upload.kind !== 'texture_2d_array' || upload.encoding !== 'rg8_unorm') {
        throw new TypeError('Static-sun V1 requires one RG8 texture_2d_array resource.');
    }
    for (const key of ['width', 'height', 'layers']) {
        if (!Number.isSafeInteger(upload[key]) || upload[key] < 1) {
            throw new TypeError(`Static-sun upload.${key} must be a positive safe integer.`);
        }
    }
    const expectedBytes = upload.width * upload.height * upload.layers * 2;
    if (!Number.isSafeInteger(expectedBytes)) {
        throw new RangeError('Static-sun texture byte length exceeds safe integer range.');
    }
    const maxTextureSize = Number(limits.maxTextureSize ?? 0);
    if (maxTextureSize > 0 && (upload.width > maxTextureSize || upload.height > maxTextureSize)) {
        throw new RangeError(`Static-sun tile dimensions exceed MAX_TEXTURE_SIZE ${maxTextureSize}.`);
    }
    const maxLayers = Number(limits.maxArrayTextureLayers ?? 0);
    if (maxLayers > 0 && upload.layers > maxLayers) {
        throw new RangeError(`Static-sun tile count exceeds MAX_ARRAY_TEXTURE_LAYERS ${maxLayers}.`);
    }
    return Object.freeze({
        kind: upload.kind,
        encoding: upload.encoding,
        width: upload.width,
        height: upload.height,
        layers: upload.layers,
        expectedBytes
    });
}

/**
 * @param {any} resourceDescriptor
 * @param {any} descriptor
 */
export function assertStaticSunDepthTextureLayout(resourceDescriptor, descriptor) {
    const upload = validateStaticSunDepthUploadDescriptor(resourceDescriptor);
    const tileSet = requireRecord(descriptor, 'Static-sun tile-set descriptor');
    const identity = requireRecord(tileSet.identity, 'Static-sun tile-set identity');
    const layout = requireRecord(identity.layout, 'Static-sun tile-set layout');
    if (!Array.isArray(tileSet.tiles) || tileSet.tiles.length < 1) {
        throw new Error('Static-sun tile-set descriptor has no tiles.');
    }
    const stored = tileSet.tiles[0]?.storedTexels;
    const interior = layout.interiorTexels;
    const tileCount = layout.tileCount;
    if (!Array.isArray(stored) || !Array.isArray(interior) || !Array.isArray(tileCount)) {
        throw new TypeError('Static-sun tile-set dimensions are absent.');
    }
    if (interior[0] !== interior[1] || stored[0] !== stored[1]) {
        throw new Error('Static-sun V1 shader requires square interior and stored tile dimensions.');
    }
    const layers = tileCount[0] * tileCount[1];
    if (!Number.isSafeInteger(layers)
        || upload.width !== stored[0]
        || upload.height !== stored[1]
        || upload.layers !== layers) {
        throw new Error('Static-sun texture-array dimensions do not match the validated tile set.');
    }
    return true;
}
