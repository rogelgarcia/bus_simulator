// Captures deterministic texture bytes, sampling semantics, and alpha fingerprints.
// @ts-check

import {
    compareCanonicalStrings,
    hashCanonicalJsonSha256,
    sha256Hex
} from '../../../app/illumination/bake_source/index.js';
import { failBakeSource } from './BakeSourceErrors.js';

export const BAKE_TEXTURE_CONTENT_DOMAIN = 'bus-simulator/illumination/bake-source/texture-content/v1';
export const BAKE_TEXTURE_SOURCE_DOMAIN = 'bus-simulator/illumination/bake-source/texture-source/v1';
export const BAKE_TEXTURE_BINDING_DOMAIN = 'bus-simulator/illumination/bake-source/texture-binding/v1';
export const BAKE_TEXTURE_ALPHA_DOMAIN = 'bus-simulator/illumination/bake-source/texture-alpha-sample/v1';
export const BAKE_TEXTURE_COVERAGE_DOMAIN = 'bus-simulator/illumination/bake-source/texture-coverage-channel/v1';

const SAMPLE_SIZE = 64;
const MIPMAP_MIN_FILTERS = new Set([1004, 1005, 1007, 1008]);
const TYPE_INFO = new Map([
    [Int8Array, ['int8', 1, 'setInt8']],
    [Uint8Array, ['uint8', 1, 'setUint8']],
    [Uint8ClampedArray, ['uint8_clamped', 1, 'setUint8']],
    [Int16Array, ['int16', 2, 'setInt16']],
    [Uint16Array, ['uint16', 2, 'setUint16']],
    [Int32Array, ['int32', 4, 'setInt32']],
    [Uint32Array, ['uint32', 4, 'setUint32']],
    [Float32Array, ['float32', 4, 'setFloat32']],
    [Float64Array, ['float64', 8, 'setFloat64']]
]);

function finite(value, label) {
    const number = Number(value);
    if (!Number.isFinite(number)) failBakeSource('non_finite_texture_semantic', `${label} must be finite.`, { label, value });
    return Object.is(number, -0) ? 0 : number;
}

function normalizeSourceUrl(value) {
    if (typeof value !== 'string' || !value) return null;
    const url = new URL(value, globalThis.location?.href ?? 'http://localhost/');
    // Cache-busting queries belong to delivery, not repository source identity.
    if (globalThis.location && url.origin === globalThis.location.origin) return url.pathname;
    return url.toString();
}

function canonicalTypedBytes(array, label) {
    const info = TYPE_INFO.get(array?.constructor);
    if (!info) failBakeSource('unsupported_texture_array_type', `${label} uses an unsupported typed array.`, {
        type: array?.constructor?.name ?? null
    });
    const [componentType, bytesPerElement, setter] = info;
    const output = new Uint8Array(array.length * bytesPerElement);
    const view = new DataView(output.buffer);
    for (let index = 0; index < array.length; index += 1) {
        const value = array[index];
        if ((componentType === 'float32' || componentType === 'float64') && !Number.isFinite(value)) {
            failBakeSource('non_finite_texture_data', `${label} contains a non-finite value.`, { index });
        }
        view[setter](index * bytesPerElement, value, true);
    }
    return { bytes: output, componentType };
}

function byteSample(value, array) {
    const number = Number(value);
    if (!Number.isFinite(number)) return 0;
    if (array instanceof Float32Array || array instanceof Float64Array) {
        return Math.max(0, Math.min(255, Math.round(number * 255)));
    }
    if (array instanceof Uint16Array) return Math.max(0, Math.min(255, Math.round(number / 257)));
    return Math.max(0, Math.min(255, Math.round(number)));
}

function sampleTypedImage(source, width, height) {
    const data = source?.data;
    if (!ArrayBuffer.isView(data)) return null;
    const pixelCount = width * height;
    const channelsPerPixel = data.length / pixelCount;
    if (!Number.isInteger(channelsPerPixel) || channelsPerPixel < 1 || channelsPerPixel > 4) return null;
    const output = new Uint8ClampedArray(SAMPLE_SIZE * SAMPLE_SIZE * 4);
    for (let y = 0; y < SAMPLE_SIZE; y += 1) {
        const sourceY = Math.min(height - 1, Math.floor((y + 0.5) * height / SAMPLE_SIZE));
        for (let x = 0; x < SAMPLE_SIZE; x += 1) {
            const sourceX = Math.min(width - 1, Math.floor((x + 0.5) * width / SAMPLE_SIZE));
            const sourceOffset = (sourceY * width + sourceX) * channelsPerPixel;
            const targetOffset = (y * SAMPLE_SIZE + x) * 4;
            const first = byteSample(data[sourceOffset], data);
            output[targetOffset] = first;
            output[targetOffset + 1] = channelsPerPixel > 1 ? byteSample(data[sourceOffset + 1], data) : first;
            output[targetOffset + 2] = channelsPerPixel > 2 ? byteSample(data[sourceOffset + 2], data) : first;
            output[targetOffset + 3] = channelsPerPixel > 3 ? byteSample(data[sourceOffset + 3], data) : 255;
        }
    }
    return { data: output, width: SAMPLE_SIZE, height: SAMPLE_SIZE };
}

function sourceImageData(source) {
    const width = Number(source?.width ?? source?.naturalWidth);
    const height = Number(source?.height ?? source?.naturalHeight);
    if (!(width > 0 && height > 0)) return null;
    const typedSample = sampleTypedImage(source, width, height);
    if (typedSample) return typedSample;
    const canvas = document.createElement('canvas');
    canvas.width = SAMPLE_SIZE;
    canvas.height = SAMPLE_SIZE;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) failBakeSource('texture_canvas_unavailable', 'A 2D canvas is required to fingerprint texture alpha.');
    try {
        context.drawImage(source, 0, 0, SAMPLE_SIZE, SAMPLE_SIZE);
        return context.getImageData(0, 0, SAMPLE_SIZE, SAMPLE_SIZE);
    } catch (error) {
        failBakeSource('texture_pixels_unreadable', 'Texture pixels could not be read for alpha validation.', {
            message: error instanceof Error ? error.message : String(error)
        });
    }
}

async function alphaFingerprints(source) {
    const imageData = sourceImageData(source);
    if (!imageData?.data) return null;
    const channels = { r: new Uint8Array(SAMPLE_SIZE * SAMPLE_SIZE), g: new Uint8Array(SAMPLE_SIZE * SAMPLE_SIZE), b: new Uint8Array(SAMPLE_SIZE * SAMPLE_SIZE), a: new Uint8Array(SAMPLE_SIZE * SAMPLE_SIZE) };
    for (let pixel = 0; pixel < SAMPLE_SIZE * SAMPLE_SIZE; pixel += 1) {
        const offset = pixel * 4;
        channels.r[pixel] = imageData.data[offset];
        channels.g[pixel] = imageData.data[offset + 1];
        channels.b[pixel] = imageData.data[offset + 2];
        channels.a[pixel] = imageData.data[offset + 3];
    }
    const result = {};
    for (const [name, bytes] of Object.entries(channels)) {
        let coveredAtHalf = 0;
        for (const value of bytes) if (value >= 128) coveredAtHalf += 1;
        result[name] = {
            sha256: await sha256Hex(`${BAKE_TEXTURE_ALPHA_DOMAIN}/${name}`, bytes),
            coveredAtHalf,
            sampleCount: bytes.length
        };
    }
    return result;
}

function exactTypedCoverageChannels(source, width, height) {
    const data = source?.data;
    if (!ArrayBuffer.isView(data)) return null;
    const pixelCount = width * height;
    const channelsPerPixel = data.length / pixelCount;
    if (!Number.isInteger(channelsPerPixel) || channelsPerPixel < 1 || channelsPerPixel > 4) return null;
    const result = {};
    for (let channelIndex = 0; channelIndex < 4; channelIndex += 1) {
        const name = 'rgba'[channelIndex];
        if (channelIndex >= channelsPerPixel) {
            const constant = new Uint8Array(pixelCount);
            if (channelIndex === 3) constant.fill(255);
            result[name] = constant;
            continue;
        }
        const selected = new data.constructor(pixelCount);
        for (let pixel = 0; pixel < pixelCount; pixel += 1) {
            selected[pixel] = data[pixel * channelsPerPixel + channelIndex];
        }
        result[name] = canonicalTypedBytes(selected, `texture coverage channel ${name}`).bytes;
    }
    return result;
}

function exactRgba8CoverageChannels(source, width, height) {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) failBakeSource('texture_canvas_unavailable', 'A 2D canvas is required to fingerprint full-resolution texture coverage.');
    let pixels;
    try {
        context.drawImage(source, 0, 0, width, height);
        pixels = context.getImageData(0, 0, width, height).data;
    } catch (error) {
        failBakeSource('texture_pixels_unreadable', 'Full-resolution texture coverage pixels could not be read.', {
            message: error instanceof Error ? error.message : String(error)
        });
    }
    const pixelCount = width * height;
    const result = {
        r: new Uint8Array(pixelCount),
        g: new Uint8Array(pixelCount),
        b: new Uint8Array(pixelCount),
        a: new Uint8Array(pixelCount)
    };
    for (let pixel = 0; pixel < pixelCount; pixel += 1) {
        const offset = pixel * 4;
        result.r[pixel] = pixels[offset];
        result.g[pixel] = pixels[offset + 1];
        result.b[pixel] = pixels[offset + 2];
        result.a[pixel] = pixels[offset + 3];
    }
    return result;
}

async function coverageChannelFingerprints(source, width, height) {
    const channels = exactTypedCoverageChannels(source, width, height)
        ?? exactRgba8CoverageChannels(source, width, height);
    const records = {};
    const buffers = [];
    for (const [name, bytes] of Object.entries(channels)) {
        const sha256 = await sha256Hex(`${BAKE_TEXTURE_COVERAGE_DOMAIN}/${name}`, bytes);
        records[name] = {
            sha256,
            byteLength: bytes.byteLength,
            pixelCount: width * height
        };
        buffers.push({ channel: name, sha256, data: bytes });
    }
    return { records, buffers };
}

async function captureTextureSource(texture) {
    const unsupportedKind = [
        'isCompressedTexture',
        'isCompressedArrayTexture',
        'isCubeTexture',
        'isData3DTexture',
        'isDataArrayTexture',
        'isDepthTexture',
        'isFramebufferTexture',
        'isVideoTexture'
    ].find((key) => texture?.[key] === true);
    if (unsupportedKind || (Array.isArray(texture?.mipmaps) && texture.mipmaps.length > 0)) {
        failBakeSource('unsupported_texture_source', 'A used texture requires an unsupported V1 source adapter.', {
            textureName: texture?.name ?? null,
            textureKind: unsupportedKind ?? 'explicit_mip_chain'
        });
    }
    const source = texture?.source?.data ?? texture?.image ?? null;
    if (!source) failBakeSource('missing_texture_source', 'A used texture has no evaluated image/source data.', {
        textureName: texture?.name ?? null
    });
    const width = Number(source.width ?? source.naturalWidth ?? texture.image?.width);
    const height = Number(source.height ?? source.naturalHeight ?? texture.image?.height);
    if (!(width > 0 && height > 0)) {
        failBakeSource('invalid_texture_dimensions', 'A used texture has invalid dimensions.', {
            textureName: texture?.name ?? null,
            width,
            height
        });
    }

    let bytes;
    let storage;
    let componentType = 'uint8';
    let provenanceUrl = null;
    let mimeType = null;
    const sourceUrl = source.currentSrc ?? source.src ?? null;
    if (typeof sourceUrl === 'string' && sourceUrl && !sourceUrl.startsWith('blob:') && !sourceUrl.startsWith('data:')) {
        const response = await fetch(sourceUrl);
        if (!response.ok) {
            failBakeSource('texture_fetch_failed', 'A used texture source could not be fetched.', {
                url: normalizeSourceUrl(sourceUrl),
                status: response.status
            });
        }
        bytes = new Uint8Array(await response.arrayBuffer());
        storage = 'encoded_source';
        provenanceUrl = normalizeSourceUrl(sourceUrl);
        mimeType = response.headers.get('content-type')?.split(';')[0] ?? null;
    } else if (source.data && ArrayBuffer.isView(source.data)) {
        const encoded = canonicalTypedBytes(source.data, texture?.name || 'data texture');
        bytes = encoded.bytes;
        componentType = encoded.componentType;
        storage = 'raw_typed_pixels';
    } else if (ArrayBuffer.isView(source)) {
        const encoded = canonicalTypedBytes(source, texture?.name || 'typed texture');
        bytes = encoded.bytes;
        componentType = encoded.componentType;
        storage = 'raw_typed_pixels';
    } else {
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext('2d', { willReadFrequently: true });
        if (!context) failBakeSource('texture_canvas_unavailable', 'A 2D canvas is required to capture generated texture bytes.');
        try {
            context.drawImage(source, 0, 0, width, height);
            bytes = new Uint8Array(context.getImageData(0, 0, width, height).data);
        } catch (error) {
            failBakeSource('texture_pixels_unreadable', 'Generated texture pixels could not be captured.', {
                textureName: texture?.name ?? null,
                message: error instanceof Error ? error.message : String(error)
            });
        }
        storage = 'raw_rgba8';
    }
    if (!bytes.byteLength) failBakeSource('empty_texture_source', 'A used texture source contains zero bytes.');
    const contentSha256 = await sha256Hex(BAKE_TEXTURE_CONTENT_DOMAIN, bytes);
    const semanticSource = {
        width,
        height,
        depth: finite(source.depth ?? 1, 'texture.depth'),
        format: finite(texture.format ?? 0, 'texture.format'),
        type: finite(texture.type ?? 0, 'texture.type'),
        internalFormat: texture.internalFormat === null || texture.internalFormat === undefined
            ? null
            : String(texture.internalFormat),
        storage,
        componentType,
        byteLength: bytes.byteLength,
        contentSha256,
        provenanceUrl,
        mimeType,
        mipLevels: Array.isArray(texture.mipmaps) ? texture.mipmaps.length : 0,
        rowOrigin: 'native_source_with_flipY_declared_by_binding'
    };
    const sourceSha256 = await hashCanonicalJsonSha256(BAKE_TEXTURE_SOURCE_DOMAIN, semanticSource);
    const id = `texture-source:${sourceSha256}`;
    const coverage = await coverageChannelFingerprints(source, width, height);
    return {
        record: {
            id,
            ...semanticSource,
            sourceSha256,
            alphaSamples: await alphaFingerprints(source),
            coverageChannels: coverage.records
        },
        buffer: { id: `${id}:bytes`, data: bytes },
        coverageBuffers: coverage.buffers.map((entry) => ({
            id: `${id}:coverage:${entry.channel}`,
            textureSourceId: id,
            coverageChannel: entry.channel,
            contentSha256: entry.sha256,
            data: entry.data
        }))
    };
}

function textureSamplingRecord(texture, sourceId) {
    const automaticMatrix = (() => {
        const tx = finite(texture.offset?.x ?? 0, 'texture.offset.x');
        const ty = finite(texture.offset?.y ?? 0, 'texture.offset.y');
        const sx = finite(texture.repeat?.x ?? 1, 'texture.repeat.x');
        const sy = finite(texture.repeat?.y ?? 1, 'texture.repeat.y');
        const rotation = finite(texture.rotation ?? 0, 'texture.rotation');
        const cx = finite(texture.center?.x ?? 0, 'texture.center.x');
        const cy = finite(texture.center?.y ?? 0, 'texture.center.y');
        const cosine = Math.cos(rotation);
        const sine = Math.sin(rotation);
        return [
            sx * cosine,
            -sy * sine,
            0,
            sx * sine,
            sy * cosine,
            0,
            -sx * (cosine * cx + sine * cy) + cx + tx,
            -sy * (-sine * cx + cosine * cy) + cy + ty,
            1
        ].map((value) => Object.is(value, -0) ? 0 : value);
    })();
    const matrix = texture.matrixAutoUpdate === false
        ? Array.from(texture.matrix?.elements ?? [])
        : automaticMatrix;
    const minFilter = finite(texture.minFilter ?? 0, 'texture.minFilter');
    const generateMipmaps = texture.generateMipmaps !== false;
    if (!generateMipmaps && MIPMAP_MIN_FILTERS.has(minFilter)) {
        failBakeSource('incompatible_texture_sampling', 'A texture disables mip generation but selects a mipmap minification filter.', {
            textureName: texture.name || null,
            minFilter,
            generateMipmaps
        });
    }
    return {
        sourceId,
        mapping: finite(texture.mapping ?? 0, 'texture.mapping'),
        channel: finite(texture.channel ?? 0, 'texture.channel'),
        wrapS: finite(texture.wrapS ?? 0, 'texture.wrapS'),
        wrapT: finite(texture.wrapT ?? 0, 'texture.wrapT'),
        magFilter: finite(texture.magFilter ?? 0, 'texture.magFilter'),
        minFilter,
        generateMipmaps,
        anisotropy: finite(texture.anisotropy ?? 1, 'texture.anisotropy'),
        flipY: texture.flipY === true,
        premultiplyAlpha: texture.premultiplyAlpha === true,
        unpackAlignment: finite(texture.unpackAlignment ?? 4, 'texture.unpackAlignment'),
        colorSpace: String(texture.colorSpace ?? ''),
        offset: [finite(texture.offset?.x ?? 0, 'texture.offset.x'), finite(texture.offset?.y ?? 0, 'texture.offset.y')],
        repeat: [finite(texture.repeat?.x ?? 1, 'texture.repeat.x'), finite(texture.repeat?.y ?? 1, 'texture.repeat.y')],
        center: [finite(texture.center?.x ?? 0, 'texture.center.x'), finite(texture.center?.y ?? 0, 'texture.center.y')],
        rotation: finite(texture.rotation ?? 0, 'texture.rotation'),
        matrixAutoUpdate: texture.matrixAutoUpdate !== false,
        matrix: matrix.map((value, index) => finite(value, `texture.matrix[${index}]`))
    };
}

export async function createBakeTextureCatalog(textures) {
    const list = Array.from(textures ?? []);
    const sourceByContent = new Map();
    const bindingById = new Map();
    const bindingByTexture = new Map();
    const buffersById = new Map();
    const coverageBuffersById = new Map();
    for (const texture of list) {
        if (!texture?.isTexture) failBakeSource('invalid_texture_reference', 'Material texture input is not a Three.js texture.');
        const captured = await captureTextureSource(texture);
        sourceByContent.set(captured.record.id, captured.record);
        buffersById.set(captured.buffer.id, captured.buffer);
        for (const buffer of captured.coverageBuffers) coverageBuffersById.set(buffer.id, buffer);
        const sampling = textureSamplingRecord(texture, captured.record.id);
        const hash = await hashCanonicalJsonSha256(BAKE_TEXTURE_BINDING_DOMAIN, sampling);
        const binding = { id: `texture-binding:${hash}`, ...sampling };
        bindingById.set(binding.id, binding);
        bindingByTexture.set(texture, binding);
    }
    return {
        sources: Array.from(sourceByContent.values()).sort((a, b) => compareCanonicalStrings(a.id, b.id)),
        bindings: Array.from(bindingById.values()).sort((a, b) => compareCanonicalStrings(a.id, b.id)),
        buffers: Array.from(buffersById.values()).sort((a, b) => compareCanonicalStrings(a.id, b.id)),
        coverageBuffers: Array.from(coverageBuffersById.values()).sort((a, b) => compareCanonicalStrings(a.id, b.id)),
        bindingByTexture
    };
}
