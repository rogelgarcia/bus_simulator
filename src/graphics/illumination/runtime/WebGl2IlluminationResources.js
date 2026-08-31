// Probes WebGL2 upload capabilities and creates generic illumination textures or buffers.
// @ts-check

const ENCODINGS = Object.freeze({
    rgba32f_le: Object.freeze({ components: 4, bytesPerComponent: 4, arrayType: 'f32', internalFormat: 'RGBA32F', format: 'RGBA', type: 'FLOAT' }),
    rgba16f_le: Object.freeze({ components: 4, bytesPerComponent: 2, arrayType: 'u16', internalFormat: 'RGBA16F', format: 'RGBA', type: 'HALF_FLOAT' }),
    r8_unorm: Object.freeze({ components: 1, bytesPerComponent: 1, arrayType: 'u8', internalFormat: 'R8', format: 'RED', type: 'UNSIGNED_BYTE' }),
    uint32_le: Object.freeze({ components: 1, bytesPerComponent: 4, arrayType: 'u32', internalFormat: 'R32UI', format: 'RED_INTEGER', type: 'UNSIGNED_INT' }),
    raw_u8: Object.freeze({ components: 1, bytesPerComponent: 1, arrayType: 'u8', internalFormat: null, format: null, type: null })
});

const KINDS = Object.freeze(['texture_2d', 'texture_2d_array', 'buffer']);
const HOST_IS_LITTLE_ENDIAN = new Uint8Array(new Uint16Array([1]).buffer)[0] === 1;

// Stable, renderer-independent IDs used by package capability requirements.
export const WEBGL2_ILLUMINATION_CAPABILITY_IDS = Object.freeze({
    webgl2: 'webgl2',
    texture2d: 'texture_2d',
    texture2dArray: 'texture_2d_array',
    buffer: 'buffer',
    fragmentHighpFloat: 'fragment_highp_float',
    textureFloatLinear: 'texture_float_linear',
    colorBufferFloat: 'color_buffer_float',
    compressedTextureEtc: 'compressed_texture_etc',
    compressedTextureBptc: 'compressed_texture_bptc',
    compressedTextureAstc: 'compressed_texture_astc',
    compressedTextureS3tc: 'compressed_texture_s3tc'
});

// Exact extension names are retained as probe evidence while packages depend on
// the generic capability IDs above. S3TC-style support can be split across the
// base, sRGB, and RGTC extensions, so all three are recorded independently.
export const WEBGL2_ILLUMINATION_EXTENSION_NAMES = Object.freeze({
    textureFloatLinear: 'OES_texture_float_linear',
    colorBufferFloat: 'EXT_color_buffer_float',
    compressedTextureEtc: 'WEBGL_compressed_texture_etc',
    compressedTextureBptc: 'EXT_texture_compression_bptc',
    compressedTextureAstc: 'WEBGL_compressed_texture_astc',
    compressedTextureS3tc: 'WEBGL_compressed_texture_s3tc',
    compressedTextureS3tcSrgb: 'WEBGL_compressed_texture_s3tc_srgb',
    compressedTextureRgtc: 'EXT_texture_compression_rgtc'
});

function requireGlFunction(gl, name) {
    return typeof gl?.[name] === 'function';
}

function safeNumericParameter(gl, name) {
    if (!requireGlFunction(gl, 'getParameter') || gl?.[name] === undefined) return 0;
    try {
        const value = Number(gl.getParameter(gl[name]));
        return Number.isFinite(value) && value >= 0 ? Math.floor(value) : 0;
    } catch {
        return 0;
    }
}

function probeExtensions(gl) {
    const support = {};
    for (const extensionName of Object.values(WEBGL2_ILLUMINATION_EXTENSION_NAMES)) {
        let available = false;
        if (requireGlFunction(gl, 'getExtension')) {
            try {
                const extension = gl.getExtension(extensionName);
                available = extension !== null && extension !== undefined;
            } catch {
                available = false;
            }
        }
        support[extensionName] = available;
    }
    return Object.freeze(support);
}

function probeFragmentHighpFloat(gl) {
    let format = null;
    if (requireGlFunction(gl, 'getShaderPrecisionFormat')
        && gl?.FRAGMENT_SHADER !== undefined && gl?.HIGH_FLOAT !== undefined) {
        try {
            format = gl.getShaderPrecisionFormat(gl.FRAGMENT_SHADER, gl.HIGH_FLOAT);
        } catch {
            format = null;
        }
    }
    const precision = Number(format?.precision) || 0;
    const rangeMin = Number(format?.rangeMin) || 0;
    const rangeMax = Number(format?.rangeMax) || 0;
    return Object.freeze({ supported: precision > 0, precision, rangeMin, rangeMax });
}

function requirePositiveInteger(value, path) {
    if (!Number.isSafeInteger(value) || value < 1) throw new TypeError(`WebGL upload '${path}' must be a positive safe integer.`);
    return value;
}

function requireUploadDescriptor(descriptor) {
    const upload = descriptor?.upload;
    if (!upload || typeof upload !== 'object' || Array.isArray(upload)) {
        throw new TypeError(`Resource '${descriptor?.id ?? 'unknown'}' requires an upload descriptor.`);
    }
    if (!KINDS.includes(upload.kind)) throw new TypeError(`Unsupported WebGL resource kind '${upload.kind}'.`);
    const encoding = ENCODINGS[upload.encoding];
    if (!encoding) throw new TypeError(`Unsupported WebGL resource encoding '${upload.encoding}'.`);
    if (upload.kind !== 'buffer' && upload.encoding === 'raw_u8') {
        throw new TypeError(`Encoding 'raw_u8' is supported only for buffer resources.`);
    }
    if (upload.kind === 'texture_2d' || upload.kind === 'texture_2d_array') {
        requirePositiveInteger(upload.width, 'width');
        requirePositiveInteger(upload.height, 'height');
    }
    if (upload.kind === 'texture_2d_array') requirePositiveInteger(upload.layers, 'layers');
    if (upload.kind === 'buffer' && upload.target !== undefined
        && upload.target !== 'array_buffer' && upload.target !== 'element_array_buffer') {
        throw new TypeError(`Unsupported WebGL buffer target '${upload.target}'.`);
    }
    return Object.freeze({ ...upload, encodingInfo: encoding });
}

function binaryBytes(value, resourceId) {
    if (value instanceof ArrayBuffer) return new Uint8Array(value);
    if (ArrayBuffer.isView(value)) return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
    throw new TypeError(`Decoded resource '${resourceId}' must be an ArrayBuffer or typed-array view.`);
}

function decodeLittleEndian(bytes, arrayType) {
    if (arrayType === 'u8') return new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const elementBytes = arrayType === 'u16' ? 2 : 4;
    if (bytes.byteLength % elementBytes !== 0) throw new TypeError('Decoded byte length is not aligned to its WebGL encoding.');
    const count = bytes.byteLength / elementBytes;
    if (HOST_IS_LITTLE_ENDIAN && bytes.byteOffset % elementBytes === 0) {
        if (arrayType === 'u16') return new Uint16Array(bytes.buffer, bytes.byteOffset, count);
        if (arrayType === 'u32') return new Uint32Array(bytes.buffer, bytes.byteOffset, count);
        return new Float32Array(bytes.buffer, bytes.byteOffset, count);
    }
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    if (arrayType === 'u16') {
        const output = new Uint16Array(count);
        for (let index = 0; index < count; index += 1) output[index] = view.getUint16(index * 2, true);
        return output;
    }
    if (arrayType === 'u32') {
        const output = new Uint32Array(count);
        for (let index = 0; index < count; index += 1) output[index] = view.getUint32(index * 4, true);
        return output;
    }
    const output = new Float32Array(count);
    for (let index = 0; index < count; index += 1) output[index] = view.getFloat32(index * 4, true);
    return output;
}

function glConstant(gl, name) {
    const value = gl[name];
    if (value === undefined) throw new TypeError(`WebGL2 context is missing constant '${name}'.`);
    return value;
}

function assertNoGlError(gl, resourceId) {
    if (typeof gl.getError !== 'function') return;
    const error = gl.getError();
    if (error !== gl.NO_ERROR) throw new Error(`WebGL upload for '${resourceId}' failed with error ${error}.`);
}

function createOnceDisposer(dispose) {
    let disposed = false;
    return () => {
        if (disposed) return;
        disposed = true;
        dispose();
    };
}

function expectedTextureByteLength(descriptor, upload) {
    const texelCount = upload.width * upload.height * (upload.layers ?? 1);
    const expectedBytes = texelCount * upload.encodingInfo.components * upload.encodingInfo.bytesPerComponent;
    if (!Number.isSafeInteger(texelCount) || !Number.isSafeInteger(expectedBytes)) {
        throw new RangeError(`Texture '${descriptor.id}' dimensions exceed safe byte-addressing limits.`);
    }
    return expectedBytes;
}

function assertTextureLimits(descriptor, upload, limits) {
    if (upload.kind === 'buffer') return;
    if (upload.width > limits.maxTextureSize || upload.height > limits.maxTextureSize) {
        throw new RangeError(`Texture '${descriptor.id}' exceeds MAX_TEXTURE_SIZE ${limits.maxTextureSize}.`);
    }
    if (upload.kind === 'texture_2d_array' && upload.layers > limits.maxArrayTextureLayers) {
        throw new RangeError(`Texture '${descriptor.id}' exceeds MAX_ARRAY_TEXTURE_LAYERS ${limits.maxArrayTextureLayers}.`);
    }
}

function textureUpload(gl, descriptor, upload, pixels, limits) {
    const arrayTexture = upload.kind === 'texture_2d_array';
    assertTextureLimits(descriptor, upload, limits);
    const target = glConstant(gl, arrayTexture ? 'TEXTURE_2D_ARRAY' : 'TEXTURE_2D');
    const bindingName = arrayTexture ? 'TEXTURE_BINDING_2D_ARRAY' : 'TEXTURE_BINDING_2D';
    const previousBinding = gl.getParameter(glConstant(gl, bindingName));
    const previousAlignment = gl.getParameter(glConstant(gl, 'UNPACK_ALIGNMENT'));
    const texture = gl.createTexture();
    if (!texture) throw new Error(`WebGL texture allocation failed for '${descriptor.id}'.`);
    const dispose = createOnceDisposer(() => gl.deleteTexture(texture));
    try {
        gl.bindTexture(target, texture);
        gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
        gl.texParameteri(target, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.texParameteri(target, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        gl.texParameteri(target, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(target, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texParameteri(target, gl.TEXTURE_BASE_LEVEL, 0);
        gl.texParameteri(target, gl.TEXTURE_MAX_LEVEL, 0);
        const internalFormat = glConstant(gl, upload.encodingInfo.internalFormat);
        const format = glConstant(gl, upload.encodingInfo.format);
        const type = glConstant(gl, upload.encodingInfo.type);
        if (arrayTexture) {
            gl.texStorage3D(target, 1, internalFormat, upload.width, upload.height, upload.layers);
            gl.texSubImage3D(target, 0, 0, 0, 0, upload.width, upload.height, upload.layers, format, type, pixels);
        } else {
            gl.texStorage2D(target, 1, internalFormat, upload.width, upload.height);
            gl.texSubImage2D(target, 0, 0, 0, upload.width, upload.height, format, type, pixels);
        }
        assertNoGlError(gl, descriptor.id);
        return Object.freeze({
            resource: Object.freeze({ kind: upload.kind, handle: texture, target, encoding: upload.encoding }),
            cpuBytes: 0,
            gpuBytes: pixels.byteLength,
            dispose
        });
    } catch (error) {
        dispose();
        throw error;
    } finally {
        gl.pixelStorei(gl.UNPACK_ALIGNMENT, previousAlignment);
        gl.bindTexture(target, previousBinding);
    }
}

function bufferUpload(gl, descriptor, upload, pixels) {
    const targetName = upload.target === 'element_array_buffer' ? 'ELEMENT_ARRAY_BUFFER' : 'ARRAY_BUFFER';
    const bindingName = upload.target === 'element_array_buffer' ? 'ELEMENT_ARRAY_BUFFER_BINDING' : 'ARRAY_BUFFER_BINDING';
    const target = glConstant(gl, targetName);
    const previousBinding = gl.getParameter(glConstant(gl, bindingName));
    const buffer = gl.createBuffer();
    if (!buffer) throw new Error(`WebGL buffer allocation failed for '${descriptor.id}'.`);
    const dispose = createOnceDisposer(() => gl.deleteBuffer(buffer));
    try {
        gl.bindBuffer(target, buffer);
        gl.bufferData(target, pixels, glConstant(gl, 'STATIC_DRAW'));
        assertNoGlError(gl, descriptor.id);
        return Object.freeze({
            resource: Object.freeze({ kind: 'buffer', handle: buffer, target, encoding: upload.encoding }),
            cpuBytes: 0,
            gpuBytes: pixels.byteLength,
            dispose
        });
    } catch (error) {
        dispose();
        throw error;
    } finally {
        gl.bindBuffer(target, previousBinding);
    }
}

/** @param {any} gl */
export function probeWebGl2IlluminationCapabilities(gl) {
    const common = requireGlFunction(gl, 'getParameter');
    const texture2d = common
        && requireGlFunction(gl, 'createTexture')
        && requireGlFunction(gl, 'deleteTexture')
        && requireGlFunction(gl, 'bindTexture')
        && requireGlFunction(gl, 'pixelStorei')
        && requireGlFunction(gl, 'texParameteri')
        && requireGlFunction(gl, 'texStorage2D')
        && requireGlFunction(gl, 'texSubImage2D');
    const textureArray = texture2d
        && requireGlFunction(gl, 'texStorage3D')
        && requireGlFunction(gl, 'texSubImage3D');
    const buffer = common
        && requireGlFunction(gl, 'createBuffer')
        && requireGlFunction(gl, 'deleteBuffer')
        && requireGlFunction(gl, 'bindBuffer')
        && requireGlFunction(gl, 'bufferData');
    const maxTextureSize = texture2d ? safeNumericParameter(gl, 'MAX_TEXTURE_SIZE') : 0;
    const maxArrayTextureLayers = textureArray ? safeNumericParameter(gl, 'MAX_ARRAY_TEXTURE_LAYERS') : 0;
    const maxCombinedTextureImageUnits = common ? safeNumericParameter(gl, 'MAX_COMBINED_TEXTURE_IMAGE_UNITS') : 0;
    const maxFragmentTextureImageUnits = common ? safeNumericParameter(gl, 'MAX_TEXTURE_IMAGE_UNITS') : 0;
    const extensions = probeExtensions(gl);
    const fragmentHighpFloat = probeFragmentHighpFloat(gl);
    const s3tcStyle = extensions[WEBGL2_ILLUMINATION_EXTENSION_NAMES.compressedTextureS3tc]
        || extensions[WEBGL2_ILLUMINATION_EXTENSION_NAMES.compressedTextureS3tcSrgb]
        || extensions[WEBGL2_ILLUMINATION_EXTENSION_NAMES.compressedTextureRgtc];
    const capabilities = Object.freeze({
        webgl2: texture2d && buffer,
        texture_2d: texture2d,
        texture_2d_array: textureArray,
        buffer,
        fragment_highp_float: fragmentHighpFloat.supported,
        texture_float_linear: extensions[WEBGL2_ILLUMINATION_EXTENSION_NAMES.textureFloatLinear],
        color_buffer_float: extensions[WEBGL2_ILLUMINATION_EXTENSION_NAMES.colorBufferFloat],
        compressed_texture_etc: extensions[WEBGL2_ILLUMINATION_EXTENSION_NAMES.compressedTextureEtc],
        compressed_texture_bptc: extensions[WEBGL2_ILLUMINATION_EXTENSION_NAMES.compressedTextureBptc],
        compressed_texture_astc: extensions[WEBGL2_ILLUMINATION_EXTENSION_NAMES.compressedTextureAstc],
        compressed_texture_s3tc: s3tcStyle,
        rgba32f_le: texture2d && gl.RGBA32F !== undefined && gl.FLOAT !== undefined,
        rgba16f_le: texture2d && gl.RGBA16F !== undefined && gl.HALF_FLOAT !== undefined,
        r8_unorm: texture2d && gl.R8 !== undefined && gl.UNSIGNED_BYTE !== undefined,
        uint32_le: buffer && gl.UNSIGNED_INT !== undefined,
        raw_u8: buffer && gl.UNSIGNED_BYTE !== undefined
    });
    return Object.freeze({
        supported: capabilities.webgl2,
        capabilities,
        limits: Object.freeze({
            maxTextureSize,
            maxArrayTextureLayers,
            maxCombinedTextureImageUnits,
            maxFragmentTextureImageUnits
        }),
        precision: Object.freeze({ fragmentHighpFloat }),
        extensions,
        availableExtensions: Object.freeze(Object.entries(extensions)
            .filter(([, available]) => available)
            .map(([name]) => name))
    });
}

/**
 * Validates one generic upload descriptor before chunk bytes are decoded.
 * @param {Record<string, any>} descriptor
 * @param {ReturnType<typeof probeWebGl2IlluminationCapabilities>} probe
 */
export function validateWebGl2IlluminationResourceDescriptor(descriptor, probe) {
    if (!probe || typeof probe !== 'object' || !probe.capabilities || !probe.limits) {
        throw new TypeError('A WebGL2 illumination capability probe is required.');
    }
    const upload = requireUploadDescriptor(descriptor);
    if (!probe.capabilities[upload.kind] || !probe.capabilities[upload.encoding]) {
        throw new TypeError(`WebGL2 does not support '${upload.kind}' with '${upload.encoding}'.`);
    }
    assertTextureLimits(descriptor, upload, probe.limits);
    return Object.freeze({
        upload,
        expectedByteLength: upload.kind === 'buffer' ? null : expectedTextureByteLength(descriptor, upload)
    });
}

/**
 * Validates every descriptor in a resource plan without reading package bytes.
 * @param {{resources: readonly Record<string, any>[]}} plan
 * @param {ReturnType<typeof probeWebGl2IlluminationCapabilities>} probe
 */
export function validateWebGl2IlluminationResourcePlan(plan, probe) {
    if (!plan || typeof plan !== 'object' || !Array.isArray(plan.resources)) {
        throw new TypeError('A WebGL2 illumination resource plan requires a resources array.');
    }
    return Object.freeze(plan.resources.map((descriptor) => (
        validateWebGl2IlluminationResourceDescriptor(descriptor, probe)
    )));
}

/**
 * @param {any} gl
 * @param {ReturnType<typeof probeWebGl2IlluminationCapabilities>} [probe]
 */
export function createWebGl2IlluminationResourceFactory(gl, probe = probeWebGl2IlluminationCapabilities(gl)) {
    if (!probe.supported) throw new TypeError('A WebGL2-capable context is required.');
    const createResource = function createResource(decoded, descriptor) {
        const { upload, expectedByteLength } = validateWebGl2IlluminationResourceDescriptor(descriptor, probe);
        if (upload.kind !== 'buffer' && upload.encoding === 'uint32_le'
            && (gl.R32UI === undefined || gl.RED_INTEGER === undefined)) {
            throw new TypeError("WebGL2 integer textures require R32UI and RED_INTEGER support.");
        }
        const bytes = binaryBytes(decoded, descriptor.id);
        const expectedBytes = expectedByteLength ?? bytes.byteLength;
        if (bytes.byteLength !== expectedBytes) {
            throw new RangeError(`Decoded byte length for '${descriptor.id}' is ${bytes.byteLength}; expected ${expectedBytes}.`);
        }
        const pixels = decodeLittleEndian(bytes, upload.encodingInfo.arrayType);
        return upload.kind === 'buffer'
            ? bufferUpload(gl, descriptor, upload, pixels)
            : textureUpload(gl, descriptor, upload, pixels, probe.limits);
    };
    Object.defineProperty(createResource, 'validatePlan', {
        value: (plan) => validateWebGl2IlluminationResourcePlan(plan, probe),
        enumerable: false
    });
    return Object.freeze(createResource);
}
