// Verifies the generic WebGL2 capability probe, exact uploads, state restoration, and disposal.

import assert from 'node:assert/strict';
import test from 'node:test';
import {
    createWebGl2IlluminationResourceFactory,
    probeWebGl2IlluminationCapabilities,
    validateWebGl2IlluminationResourceDescriptor,
    validateWebGl2IlluminationResourcePlan,
    WEBGL2_ILLUMINATION_CAPABILITY_IDS,
    WEBGL2_ILLUMINATION_EXTENSION_NAMES
} from '../../../../src/graphics/illumination/runtime/index.js';

function createMockWebGl2() {
    const calls = [];
    const deletedTextures = [];
    const deletedBuffers = [];
    let nextHandle = 1;
    let unpackAlignment = 4;
    let texture2dBinding = { id: 'previous-2d' };
    let textureArrayBinding = { id: 'previous-array' };
    let arrayBufferBinding = { id: 'previous-buffer' };
    let elementBufferBinding = { id: 'previous-element-buffer' };
    const gl = {
        NO_ERROR: 0,
        MAX_TEXTURE_SIZE: 'MAX_TEXTURE_SIZE',
        MAX_ARRAY_TEXTURE_LAYERS: 'MAX_ARRAY_TEXTURE_LAYERS',
        MAX_COMBINED_TEXTURE_IMAGE_UNITS: 'MAX_COMBINED_TEXTURE_IMAGE_UNITS',
        MAX_TEXTURE_IMAGE_UNITS: 'MAX_TEXTURE_IMAGE_UNITS',
        FRAGMENT_SHADER: 'FRAGMENT_SHADER',
        HIGH_FLOAT: 'HIGH_FLOAT',
        UNPACK_ALIGNMENT: 'UNPACK_ALIGNMENT',
        TEXTURE_2D: 'TEXTURE_2D',
        TEXTURE_2D_ARRAY: 'TEXTURE_2D_ARRAY',
        TEXTURE_BINDING_2D: 'TEXTURE_BINDING_2D',
        TEXTURE_BINDING_2D_ARRAY: 'TEXTURE_BINDING_2D_ARRAY',
        TEXTURE_MIN_FILTER: 'TEXTURE_MIN_FILTER',
        TEXTURE_MAG_FILTER: 'TEXTURE_MAG_FILTER',
        TEXTURE_WRAP_S: 'TEXTURE_WRAP_S',
        TEXTURE_WRAP_T: 'TEXTURE_WRAP_T',
        TEXTURE_BASE_LEVEL: 'TEXTURE_BASE_LEVEL',
        TEXTURE_MAX_LEVEL: 'TEXTURE_MAX_LEVEL',
        NEAREST: 'NEAREST',
        CLAMP_TO_EDGE: 'CLAMP_TO_EDGE',
        RGBA32F: 'RGBA32F',
        RGBA16F: 'RGBA16F',
        R8: 'R8',
        R32UI: 'R32UI',
        RGBA: 'RGBA',
        RED: 'RED',
        RED_INTEGER: 'RED_INTEGER',
        FLOAT: 'FLOAT',
        HALF_FLOAT: 'HALF_FLOAT',
        UNSIGNED_BYTE: 'UNSIGNED_BYTE',
        UNSIGNED_INT: 'UNSIGNED_INT',
        ARRAY_BUFFER: 'ARRAY_BUFFER',
        ELEMENT_ARRAY_BUFFER: 'ELEMENT_ARRAY_BUFFER',
        ARRAY_BUFFER_BINDING: 'ARRAY_BUFFER_BINDING',
        ELEMENT_ARRAY_BUFFER_BINDING: 'ELEMENT_ARRAY_BUFFER_BINDING',
        STATIC_DRAW: 'STATIC_DRAW',
        getParameter(parameter) {
            if (parameter === this.MAX_TEXTURE_SIZE) return 4096;
            if (parameter === this.MAX_ARRAY_TEXTURE_LAYERS) return 256;
            if (parameter === this.MAX_COMBINED_TEXTURE_IMAGE_UNITS) return 32;
            if (parameter === this.MAX_TEXTURE_IMAGE_UNITS) return 16;
            if (parameter === this.UNPACK_ALIGNMENT) return unpackAlignment;
            if (parameter === this.TEXTURE_BINDING_2D) return texture2dBinding;
            if (parameter === this.TEXTURE_BINDING_2D_ARRAY) return textureArrayBinding;
            if (parameter === this.ARRAY_BUFFER_BINDING) return arrayBufferBinding;
            if (parameter === this.ELEMENT_ARRAY_BUFFER_BINDING) return elementBufferBinding;
            throw new Error(`Unexpected parameter ${parameter}`);
        },
        getShaderPrecisionFormat(shader, precision) {
            assert.equal(shader, this.FRAGMENT_SHADER);
            assert.equal(precision, this.HIGH_FLOAT);
            return { precision: 23, rangeMin: 127, rangeMax: 127 };
        },
        getExtension(name) {
            return new Set([
                'OES_texture_float_linear',
                'EXT_color_buffer_float',
                'WEBGL_compressed_texture_etc',
                'WEBGL_compressed_texture_astc',
                'WEBGL_compressed_texture_s3tc_srgb'
            ]).has(name) ? { name } : null;
        },
        createTexture() {
            const handle = { type: 'texture', id: nextHandle };
            nextHandle += 1;
            calls.push(['createTexture', handle]);
            return handle;
        },
        deleteTexture(handle) {
            deletedTextures.push(handle);
            calls.push(['deleteTexture', handle]);
        },
        bindTexture(target, handle) {
            if (target === this.TEXTURE_2D) texture2dBinding = handle;
            else textureArrayBinding = handle;
            calls.push(['bindTexture', target, handle]);
        },
        pixelStorei(parameter, value) {
            if (parameter === this.UNPACK_ALIGNMENT) unpackAlignment = value;
            calls.push(['pixelStorei', parameter, value]);
        },
        texParameteri(...args) {
            calls.push(['texParameteri', ...args]);
        },
        texStorage2D(...args) {
            calls.push(['texStorage2D', ...args]);
        },
        texSubImage2D(...args) {
            calls.push(['texSubImage2D', ...args]);
        },
        texStorage3D(...args) {
            calls.push(['texStorage3D', ...args]);
        },
        texSubImage3D(...args) {
            calls.push(['texSubImage3D', ...args]);
        },
        generateMipmap(...args) {
            calls.push(['generateMipmap', ...args]);
        },
        createBuffer() {
            const handle = { type: 'buffer', id: nextHandle };
            nextHandle += 1;
            calls.push(['createBuffer', handle]);
            return handle;
        },
        deleteBuffer(handle) {
            deletedBuffers.push(handle);
            calls.push(['deleteBuffer', handle]);
        },
        bindBuffer(target, handle) {
            if (target === this.ARRAY_BUFFER) arrayBufferBinding = handle;
            else elementBufferBinding = handle;
            calls.push(['bindBuffer', target, handle]);
        },
        bufferData(...args) {
            calls.push(['bufferData', ...args]);
        },
        getError() {
            return this.NO_ERROR;
        }
    };
    return Object.freeze({
        gl,
        calls,
        deletedTextures,
        deletedBuffers,
        state: () => Object.freeze({ unpackAlignment, texture2dBinding, textureArrayBinding, arrayBufferBinding })
    });
}

function encodeLittleEndian(values, kind) {
    const bytesPerValue = kind === 'u16' ? 2 : 4;
    const bytes = new Uint8Array(values.length * bytesPerValue);
    const view = new DataView(bytes.buffer);
    values.forEach((value, index) => {
        if (kind === 'f32') view.setFloat32(index * 4, value, true);
        else if (kind === 'u32') view.setUint32(index * 4, value, true);
        else view.setUint16(index * 2, value, true);
    });
    return bytes;
}

test('graphics WebGL2 illumination probe exposes generic texture, buffer, and encoding capabilities', () => {
    const mock = createMockWebGl2();

    const probe = probeWebGl2IlluminationCapabilities(mock.gl);

    assert.equal(probe.supported, true);
    assert.deepEqual(probe.capabilities, {
        webgl2: true,
        texture_2d: true,
        texture_2d_array: true,
        buffer: true,
        fragment_highp_float: true,
        texture_float_linear: true,
        color_buffer_float: true,
        compressed_texture_etc: true,
        compressed_texture_bptc: false,
        compressed_texture_astc: true,
        compressed_texture_s3tc: true,
        rgba32f_le: true,
        rgba16f_le: true,
        r8_unorm: true,
        uint32_le: true,
        raw_u8: true
    });
    assert.deepEqual(probe.limits, {
        maxTextureSize: 4096,
        maxArrayTextureLayers: 256,
        maxCombinedTextureImageUnits: 32,
        maxFragmentTextureImageUnits: 16
    });
    assert.deepEqual(probe.precision.fragmentHighpFloat, {
        supported: true,
        precision: 23,
        rangeMin: 127,
        rangeMax: 127
    });
    assert.deepEqual(probe.availableExtensions, [
        'OES_texture_float_linear',
        'EXT_color_buffer_float',
        'WEBGL_compressed_texture_etc',
        'WEBGL_compressed_texture_astc',
        'WEBGL_compressed_texture_s3tc_srgb'
    ]);
    assert.equal(
        probe.extensions[WEBGL2_ILLUMINATION_EXTENSION_NAMES.compressedTextureBptc],
        false
    );
    assert.equal(WEBGL2_ILLUMINATION_CAPABILITY_IDS.fragmentHighpFloat, 'fragment_highp_float');
});

test('graphics WebGL2 illumination probe tolerates missing optional query APIs', () => {
    const mock = createMockWebGl2();
    delete mock.gl.getExtension;
    delete mock.gl.getShaderPrecisionFormat;
    delete mock.gl.MAX_COMBINED_TEXTURE_IMAGE_UNITS;
    delete mock.gl.MAX_TEXTURE_IMAGE_UNITS;

    const probe = probeWebGl2IlluminationCapabilities(mock.gl);

    assert.equal(probe.supported, true);
    assert.equal(probe.capabilities.fragment_highp_float, false);
    assert.equal(probe.capabilities.texture_float_linear, false);
    assert.equal(probe.capabilities.compressed_texture_s3tc, false);
    assert.equal(probe.limits.maxCombinedTextureImageUnits, 0);
    assert.equal(probe.limits.maxFragmentTextureImageUnits, 0);
    assert.deepEqual(probe.availableExtensions, []);
});

test('graphics WebGL2 illumination preflight validates descriptor dimensions before decode or allocation', () => {
    const mock = createMockWebGl2();
    const probe = probeWebGl2IlluminationCapabilities(mock.gl);
    const validDescriptor = {
        id: 'valid-preflight',
        upload: { kind: 'texture_2d', encoding: 'rgba32f_le', width: 2, height: 2 }
    };

    const validated = validateWebGl2IlluminationResourceDescriptor(validDescriptor, probe);
    assert.equal(validated.expectedByteLength, 64);
    assert.equal(validateWebGl2IlluminationResourcePlan({ resources: [validDescriptor] }, probe).length, 1);

    const createResource = createWebGl2IlluminationResourceFactory(mock.gl, probe);
    assert.equal(typeof createResource.validatePlan, 'function');
    assert.equal(createResource.validatePlan({ resources: [validDescriptor] }).length, 1);
    assert.throws(
        () => createResource(null, {
            id: 'too-wide',
            upload: { kind: 'texture_2d', encoding: 'rgba32f_le', width: 4097, height: 1 }
        }),
        /exceeds MAX_TEXTURE_SIZE 4096/
    );
    assert.throws(
        () => validateWebGl2IlluminationResourceDescriptor({
            id: 'too-many-layers',
            upload: { kind: 'texture_2d_array', encoding: 'r8_unorm', width: 1, height: 1, layers: 257 }
        }, probe),
        /exceeds MAX_ARRAY_TEXTURE_LAYERS 256/
    );
    assert.equal(mock.calls.some(([name]) => name === 'createTexture'), false);
});

test('graphics WebGL2 illumination factory uploads every supported canonical encoding without mip generation', () => {
    const mock = createMockWebGl2();
    const createResource = createWebGl2IlluminationResourceFactory(mock.gl);
    const fixtures = [
        {
            id: 'float-texture',
            bytes: encodeLittleEndian([1, 2, 3, 4], 'f32'),
            upload: { kind: 'texture_2d', encoding: 'rgba32f_le', width: 1, height: 1 },
            arrayType: Float32Array
        },
        {
            id: 'half-array',
            bytes: encodeLittleEndian([0x3c00, 0x4000, 0x4200, 0x4400], 'u16'),
            upload: { kind: 'texture_2d_array', encoding: 'rgba16f_le', width: 1, height: 1, layers: 1 },
            arrayType: Uint16Array
        },
        {
            id: 'mask-texture',
            bytes: new Uint8Array([127]),
            upload: { kind: 'texture_2d', encoding: 'r8_unorm', width: 1, height: 1 },
            arrayType: Uint8Array
        },
        {
            id: 'mapping-buffer',
            bytes: encodeLittleEndian([0x01020304, 0xa0b0c0d0], 'u32'),
            upload: { kind: 'buffer', encoding: 'uint32_le' },
            arrayType: Uint32Array
        },
        {
            id: 'raw-buffer',
            bytes: new Uint8Array([3, 2, 1]),
            upload: { kind: 'buffer', encoding: 'raw_u8', target: 'element_array_buffer' },
            arrayType: Uint8Array
        }
    ];

    const created = fixtures.map((fixture) => createResource(fixture.bytes, {
        id: fixture.id,
        upload: fixture.upload
    }));

    const uploadedArrays = mock.calls
        .filter(([name]) => name === 'texSubImage2D' || name === 'texSubImage3D' || name === 'bufferData')
        .map((call) => call.find((value) => ArrayBuffer.isView(value)));
    assert.deepEqual(uploadedArrays.map((value) => value.constructor), fixtures.map((fixture) => fixture.arrayType));
    assert.deepEqual(created.map((entry) => entry.gpuBytes), fixtures.map((fixture) => fixture.bytes.byteLength));
    assert.equal(mock.calls.some(([name]) => name === 'generateMipmap'), false);
    assert.equal(mock.calls.some(([name, parameter, value]) => name === 'pixelStorei'
        && parameter === mock.gl.UNPACK_ALIGNMENT && value === 1), true);
    assert.equal(mock.state().unpackAlignment, 4);
    assert.deepEqual(mock.state().texture2dBinding, { id: 'previous-2d' });
    assert.deepEqual(mock.state().textureArrayBinding, { id: 'previous-array' });
    assert.deepEqual(mock.state().arrayBufferBinding, { id: 'previous-buffer' });

    for (const entry of created) {
        entry.dispose();
        entry.dispose();
    }
    assert.equal(mock.deletedTextures.length, 3);
    assert.equal(mock.deletedBuffers.length, 2);
});

test('graphics WebGL2 illumination factory deletes a partially uploaded texture on GL failure', () => {
    const mock = createMockWebGl2();
    let firstError = true;
    mock.gl.getError = () => {
        if (!firstError) return mock.gl.NO_ERROR;
        firstError = false;
        return 1280;
    };
    const createResource = createWebGl2IlluminationResourceFactory(mock.gl);

    assert.throws(
        () => createResource(new Uint8Array([1]), {
            id: 'failed-mask',
            upload: { kind: 'texture_2d', encoding: 'r8_unorm', width: 1, height: 1 }
        }),
        /failed with error 1280/
    );
    assert.equal(mock.deletedTextures.length, 1);
    assert.equal(mock.state().unpackAlignment, 4);
});
