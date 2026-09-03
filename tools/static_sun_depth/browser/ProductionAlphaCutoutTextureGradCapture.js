// Native WebGL2 textureGrad evidence for authenticated AI 531 cutout candidates.
// @ts-check

import {resolveThreeR183ShadowAlphaTest} from '../src/ThreeShadowSide.mjs';

export const PRODUCTION_ALPHA_CUTOUT_TEXTURE_GRAD_CAPTURE_SCHEMA =
    'ai531-production-alpha-cutout-native-texture-grad-capture-v2';
export const PRODUCTION_ALPHA_CUTOUT_TEXTURE_GRAD_CAPTURE_METHOD =
    'live-three-native-texture-explicit-gradient-batched-rgba32f-readback-v2';
export const PRODUCTION_ALPHA_CUTOUT_IMPLICIT_GRADIENT_CAPTURE_SCHEMA =
    'ai531-production-alpha-cutout-native-implicit-gradient-capture-v3';
export const PRODUCTION_ALPHA_CUTOUT_IMPLICIT_GRADIENT_CAPTURE_METHOD =
    'live-three-native-texture-implicit-gradient-instanced-2x2-rgba32f-readback-v3';
const MAXIMUM_SAMPLE_COUNT = 262_144;
const EXPLICIT_GRADIENT_CONTRACT = Object.freeze({
    implicit: false,
    label: 'production-alpha-cutout-texture-grad',
    method: PRODUCTION_ALPHA_CUTOUT_TEXTURE_GRAD_CAPTURE_METHOD,
    schema: PRODUCTION_ALPHA_CUTOUT_TEXTURE_GRAD_CAPTURE_SCHEMA
});
const IMPLICIT_GRADIENT_CONTRACT = Object.freeze({
    implicit: true,
    label: 'production-alpha-cutout-implicit-gradient',
    method: PRODUCTION_ALPHA_CUTOUT_IMPLICIT_GRADIENT_CAPTURE_METHOD,
    schema: PRODUCTION_ALPHA_CUTOUT_IMPLICIT_GRADIENT_CAPTURE_SCHEMA
});

/**
 * Samples the one live foliage alpha texture with explicit derivatives. This is
 * diagnostic evidence only: native mip generation and anisotropy remain tied to
 * the captured adapter/GPU/driver identity.
 *
 * @param {{
 *   city: any,
 *   engine: any,
 *   expectedCutoutCasterCount: number,
 *   samples: Array<{uv: [number, number], dUVdx: [number, number], dUVdy: [number, number]}>,
 *   label?: string
 * }} options
 */
export function captureProductionAlphaCutoutTextureGradSamples(options) {
    return captureNativeTextureSamples(options, EXPLICIT_GRADIENT_CONTRACT);
}

/**
 * Samples with implicit derivatives over isolated 2x2 fragment quads. This
 * follows the same native texture() path as the live Three shadow shader.
 * @param {Parameters<typeof captureProductionAlphaCutoutTextureGradSamples>[0]} options
 */
export function captureProductionAlphaCutoutImplicitGradientSamples(options) {
    return captureNativeTextureSamples(options, IMPLICIT_GRADIENT_CONTRACT);
}

function captureNativeTextureSamples(options, contract) {
    const {city, engine} = options ?? {};
    const renderer = engine?.renderer;
    const gl = renderer?.getContext?.();
    if (!city?.group?.traverse || !renderer?.properties?.get || !gl
        || typeof gl.texImage2D !== 'function' || gl.RGBA32F === undefined) {
        throw new TypeError(
            'native textureGrad capture requires City and a WebGL2 renderer'
        );
    }
    const expectedCutoutCasterCount = requirePositiveSafeInteger(
        options.expectedCutoutCasterCount,
        'expectedCutoutCasterCount'
    );
    const samples = normalizeSamples(options.samples);
    const label = options.label === undefined
        ? contract.label
        : requireNonEmptyString(options.label, 'label');
    const foliage = collectSingleCutoutTexture(city.group);
    if (foliage.cutoutMaterialSlotCount !== expectedCutoutCasterCount) {
        throw new Error(
            `native textureGrad capture found ${foliage.cutoutMaterialSlotCount} `
            + `cutout slots; expected ${expectedCutoutCasterCount}`
        );
    }
    const texture = foliage.texture;
    texture.updateMatrix?.();
    const nativeTexture = renderer.properties.get(texture)?.__webglTexture;
    if (!nativeTexture) {
        throw new Error('live Three cutout texture has no allocated native handle');
    }
    const extension = gl.getExtension('EXT_color_buffer_float');
    if (!extension) {
        throw new Error('native textureGrad capture requires EXT_color_buffer_float');
    }
    const state = captureState(gl);
    let resources = null;
    const values = new Float32Array(samples.length);
    let primaryError = null;
    let restorationError = null;
    try {
        const units = selectTextureUnits(state.maximumTextureUnits);
        const layout = contract.implicit
            ? implicitSampleTextureLayout(gl, samples.length)
            : sampleTextureLayout(gl, samples.length);
        resources = {
            priorTextureUnits: captureTextureUnits(gl, units),
            units
        };
        gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
        gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
        gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);
        Object.assign(
            resources,
            createResources(gl, label, layout, samples, contract)
        );
        bindTextureUnit(gl, units.atlas, nativeTexture);
        bindTextureUnit(gl, units.uv, resources.sampleTextures.uv);
        bindTextureUnit(gl, units.dx, resources.sampleTextures.dx);
        bindTextureUnit(gl, units.dy, resources.sampleTextures.dy);
        gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, resources.framebuffer);
        gl.bindFramebuffer(gl.READ_FRAMEBUFFER, resources.framebuffer);
        gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
        gl.useProgram(resources.program);
        gl.bindVertexArray(resources.vertexArray);
        setCapability(gl, gl.BLEND, false);
        setCapability(gl, gl.CULL_FACE, false);
        setCapability(gl, gl.DEPTH_TEST, false);
        setCapability(gl, gl.DITHER, false);
        setCapability(gl, gl.RASTERIZER_DISCARD, false);
        setCapability(gl, gl.SCISSOR_TEST, false);
        setCapability(gl, gl.STENCIL_TEST, false);
        gl.colorMask(true, true, true, true);
        gl.viewport(0, 0, layout.width, layout.height);
        gl.pixelStorei(gl.PACK_ALIGNMENT, 1);
        gl.uniform1i(resources.uniforms.texture, units.atlas);
        gl.uniform1i(resources.uniforms.uvTexture, units.uv);
        gl.uniform1i(resources.uniforms.dxTexture, units.dx);
        gl.uniform1i(resources.uniforms.dyTexture, units.dy);
        if (resources.uniforms.sampleCount) {
            gl.uniform1i(resources.uniforms.sampleCount, samples.length);
        }
        if (resources.uniforms.targetSize) {
            gl.uniform2i(
                resources.uniforms.targetSize,
                layout.width,
                layout.height
            );
        }
        if (contract.implicit) {
            gl.drawArraysInstanced(
                gl.TRIANGLE_STRIP,
                0,
                4,
                samples.length
            );
        } else {
            gl.drawArrays(gl.TRIANGLES, 0, 3);
        }
        const pixels = new Float32Array(layout.pixelCount * 4);
        gl.readPixels(
            0, 0, layout.width, layout.height, gl.RGBA, gl.FLOAT, pixels
        );
        for (let index = 0; index < samples.length; index += 1) {
            const pixelIndex = contract.implicit
                ? (Math.floor(index / layout.sampleWidth) * 2 * layout.width
                    + (index % layout.sampleWidth) * 2)
                : index;
            const offset = pixelIndex * 4;
            const value = pixels[offset];
            if (!Number.isFinite(value) || value < 0 || value > 1
                || !Object.is(value, pixels[offset + 1])
                || !Object.is(value, pixels[offset + 2])
                || !Object.is(value, pixels[offset + 3])) {
                throw new Error(`native textureGrad sample ${index} is invalid`);
            }
            values[index] = value;
        }
        gl.finish();
        const error = gl.getError();
        if (error !== gl.NO_ERROR) {
            throw new Error(`native textureGrad capture ended with GL error ${error}`);
        }
    } catch (error) {
        primaryError = error;
    } finally {
        try {
            restoreState(gl, state, resources);
            const differences = compareState(state, captureState(gl));
            if (differences.length > 0) {
                throw new Error(
                    `native textureGrad GL state differs after restoration: ${differences.join(', ')}`
                );
            }
        } catch (error) {
            restorationError = error;
        } finally {
            if (resources) destroyResources(gl, resources);
        }
    }
    if (restorationError) {
        throw new Error(
            'native textureGrad capture could not restore caller GL state: '
            + (restorationError?.message ?? String(restorationError)),
            {cause: primaryError ?? restorationError}
        );
    }
    if (primaryError) throw primaryError;
    return {
        schema: contract.schema,
        method: contract.method,
        status: 'captured_and_restored',
        cutoutMaterialSlotCount: foliage.cutoutMaterialSlotCount,
        sampleCount: samples.length,
        values: [...values],
        stateRestoration: 'verified',
        texture: textureIdentity(texture),
        graphics: graphicsIdentity(gl, renderer),
        label
    };
}

function collectSingleCutoutTexture(root) {
    let cutoutMaterialSlotCount = 0;
    const textures = new Set();
    root.updateMatrixWorld?.(true);
    root.traverse((object) => {
        if (!object?.isMesh || object.castShadow !== true || !isWorldVisible(object)) return;
        const materials = Array.isArray(object.material)
            ? object.material : [object.material];
        for (const material of materials) {
            if (!material || material.visible === false
                || resolveThreeR183ShadowAlphaTest(
                    material.alphaTest,
                    material.alphaToCoverage
                ) <= 0) continue;
            if (!material.map?.isTexture) {
                throw new Error('a live cutout material has no ordinary map texture');
            }
            cutoutMaterialSlotCount += 1;
            textures.add(material.map);
        }
    });
    if (cutoutMaterialSlotCount < 1 || textures.size !== 1) {
        throw new Error(
            'native textureGrad capture requires one shared cutout texture profile'
        );
    }
    return {cutoutMaterialSlotCount, texture: [...textures][0]};
}

function normalizeSamples(value) {
    if (!Array.isArray(value) || value.length < 1
        || value.length > MAXIMUM_SAMPLE_COUNT) {
        throw new TypeError(
            `textureGrad samples must contain 1 through ${MAXIMUM_SAMPLE_COUNT} entries`
        );
    }
    return value.map((sample, index) => ({
        uv: finitePair(sample?.uv, `samples[${index}].uv`),
        dUVdx: finitePair(sample?.dUVdx, `samples[${index}].dUVdx`),
        dUVdy: finitePair(sample?.dUVdy, `samples[${index}].dUVdy`)
    }));
}

function createResources(gl, label, layout, samples, contract) {
    const vertexSource = contract.implicit ? `#version 300 es
precision highp float;
uniform sampler2D uUvTexture;
uniform sampler2D uDxTexture;
uniform sampler2D uDyTexture;
uniform ivec2 uTargetSize;
out vec2 vUv;
void main() {
    ivec2 sampleSize = textureSize(uUvTexture, 0);
    ivec2 sampleTexel = ivec2(
        gl_InstanceID % sampleSize.x,
        gl_InstanceID / sampleSize.x
    );
    vec2 corner = vec2(gl_VertexID & 1, gl_VertexID >> 1);
    vec2 centerUv = texelFetch(uUvTexture, sampleTexel, 0).rg;
    vec2 dx = texelFetch(uDxTexture, sampleTexel, 0).rg;
    vec2 dy = texelFetch(uDyTexture, sampleTexel, 0).rg;
    vUv = centerUv
        + dx * (corner.x * 2.0 - 0.5)
        + dy * (corner.y * 2.0 - 0.5);
    vec2 pixel = (vec2(sampleTexel) + corner) * 2.0;
    gl_Position = vec4(
        pixel / vec2(uTargetSize) * 2.0 - 1.0,
        0.0,
        1.0
    );
}` : `#version 300 es
void main() {
    vec2 position = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
    gl_Position = vec4(position * 2.0 - 1.0, 0.0, 1.0);
}`;
    const fragmentSource = contract.implicit ? `#version 300 es
precision highp float;
uniform sampler2D uTexture;
in vec2 vUv;
out vec4 outputValue;
void main() {
    float coverage = texture(uTexture, vUv).a;
    outputValue = vec4(coverage);
}` : `#version 300 es
precision highp float;
uniform sampler2D uTexture;
uniform sampler2D uUvTexture;
uniform sampler2D uDxTexture;
uniform sampler2D uDyTexture;
uniform int uSampleCount;
out vec4 outputValue;
void main() {
    ivec2 texel = ivec2(gl_FragCoord.xy);
    int index = texel.y * textureSize(uUvTexture, 0).x + texel.x;
    if (index >= uSampleCount) {
        outputValue = vec4(0.0);
        return;
    }
    vec2 uv = texelFetch(uUvTexture, texel, 0).rg;
    vec2 dx = texelFetch(uDxTexture, texel, 0).rg;
    vec2 dy = texelFetch(uDyTexture, texel, 0).rg;
    float coverage = textureGrad(uTexture, uv, dx, dy).a;
    outputValue = vec4(coverage);
}`;
    const vertex = compileShader(
        gl,
        gl.VERTEX_SHADER,
        vertexSource,
        label
    );
    const fragment = compileShader(
        gl,
        gl.FRAGMENT_SHADER,
        fragmentSource,
        label
    );
    const program = gl.createProgram();
    if (!program) throw new Error('native textureGrad program allocation failed');
    gl.attachShader(program, vertex);
    gl.attachShader(program, fragment);
    gl.linkProgram(program);
    gl.deleteShader(vertex);
    gl.deleteShader(fragment);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        const log = gl.getProgramInfoLog(program) || 'unknown link failure';
        gl.deleteProgram(program);
        throw new Error(`native textureGrad program link failed: ${log}`);
    }
    const target = gl.createTexture();
    const framebuffer = gl.createFramebuffer();
    const vertexArray = gl.createVertexArray();
    if (!target || !framebuffer || !vertexArray) {
        throw new Error('native textureGrad resource allocation failed');
    }
    gl.bindTexture(gl.TEXTURE_2D, target);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(
        gl.TEXTURE_2D, 0, gl.RGBA32F, layout.width, layout.height,
        0, gl.RGBA, gl.FLOAT, null
    );
    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
    gl.framebufferTexture2D(
        gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, target, 0
    );
    gl.drawBuffers([gl.COLOR_ATTACHMENT0]);
    gl.readBuffer(gl.COLOR_ATTACHMENT0);
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
        throw new Error('native textureGrad float framebuffer is incomplete');
    }
    const sampleTextures = {
        dx: createSampleTexture(gl, layout, samples, 'dUVdx'),
        dy: createSampleTexture(gl, layout, samples, 'dUVdy'),
        uv: createSampleTexture(gl, layout, samples, 'uv')
    };
    return {
        framebuffer,
        program,
        sampleTextures,
        target,
        uniforms: {
            dxTexture: requiredUniform(gl, program, 'uDxTexture'),
            dyTexture: requiredUniform(gl, program, 'uDyTexture'),
            sampleCount: contract.implicit
                ? null : requiredUniform(gl, program, 'uSampleCount'),
            targetSize: contract.implicit
                ? requiredUniform(gl, program, 'uTargetSize') : null,
            texture: requiredUniform(gl, program, 'uTexture'),
            uvTexture: requiredUniform(gl, program, 'uUvTexture')
        },
        vertexArray
    };
}

function createSampleTexture(gl, layout, samples, field) {
    const pixelCount = layout.samplePixelCount ?? layout.pixelCount;
    const width = layout.sampleWidth ?? layout.width;
    const height = layout.sampleHeight ?? layout.height;
    const values = new Float32Array(pixelCount * 2);
    for (let index = 0; index < samples.length; index += 1) {
        values[index * 2] = samples[index][field][0];
        values[index * 2 + 1] = samples[index][field][1];
    }
    const texture = gl.createTexture();
    if (!texture) throw new Error('native textureGrad sample texture allocation failed');
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(
        gl.TEXTURE_2D, 0, gl.RG32F, width, height,
        0, gl.RG, gl.FLOAT, values
    );
    return texture;
}

function sampleTextureLayout(gl, sampleCount) {
    const maximumSize = gl.getParameter(gl.MAX_TEXTURE_SIZE);
    if (!Number.isSafeInteger(maximumSize) || maximumSize < 1) {
        throw new Error('native textureGrad maximum texture size is invalid');
    }
    const width = Math.min(maximumSize, Math.ceil(Math.sqrt(sampleCount)));
    const height = Math.ceil(sampleCount / width);
    if (height > maximumSize) {
        throw new Error('native textureGrad samples exceed the GPU texture bound');
    }
    return {height, pixelCount: width * height, width};
}

function implicitSampleTextureLayout(gl, sampleCount) {
    const maximumSize = gl.getParameter(gl.MAX_TEXTURE_SIZE);
    if (!Number.isSafeInteger(maximumSize) || maximumSize < 2) {
        throw new Error('native implicit-gradient maximum texture size is invalid');
    }
    const maximumSampleAxis = Math.floor(maximumSize / 2);
    const sampleWidth = Math.min(
        maximumSampleAxis,
        Math.ceil(Math.sqrt(sampleCount))
    );
    const sampleHeight = Math.ceil(sampleCount / sampleWidth);
    if (sampleHeight > maximumSampleAxis) {
        throw new Error('native implicit-gradient samples exceed the GPU texture bound');
    }
    return {
        height: sampleHeight * 2,
        pixelCount: sampleWidth * sampleHeight * 4,
        sampleHeight,
        samplePixelCount: sampleWidth * sampleHeight,
        sampleWidth,
        width: sampleWidth * 2
    };
}

function selectTextureUnits(maximumTextureUnits) {
    if (!Number.isSafeInteger(maximumTextureUnits) || maximumTextureUnits < 4) {
        throw new Error('native textureGrad capture requires four texture units');
    }
    return {
        atlas: maximumTextureUnits - 1,
        uv: maximumTextureUnits - 2,
        dx: maximumTextureUnits - 3,
        dy: maximumTextureUnits - 4
    };
}

function captureTextureUnits(gl, units) {
    const records = [];
    for (const unit of Object.values(units)) {
        gl.activeTexture(gl.TEXTURE0 + unit);
        records.push({
            sampler: gl.getParameter(gl.SAMPLER_BINDING),
            texture: gl.getParameter(gl.TEXTURE_BINDING_2D),
            unit
        });
    }
    return records;
}

function bindTextureUnit(gl, unit, texture) {
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.bindSampler(unit, null);
}

function captureState(gl) {
    return {
        activeTexture: gl.getParameter(gl.ACTIVE_TEXTURE),
        blend: gl.isEnabled(gl.BLEND),
        colorMask: gl.getParameter(gl.COLOR_WRITEMASK),
        cullFace: gl.isEnabled(gl.CULL_FACE),
        currentProgram: gl.getParameter(gl.CURRENT_PROGRAM),
        depthTest: gl.isEnabled(gl.DEPTH_TEST),
        dither: gl.isEnabled(gl.DITHER),
        drawFramebuffer: gl.getParameter(gl.DRAW_FRAMEBUFFER_BINDING),
        maximumTextureUnits: gl.getParameter(gl.MAX_COMBINED_TEXTURE_IMAGE_UNITS),
        packAlignment: gl.getParameter(gl.PACK_ALIGNMENT),
        pixelPackBuffer: gl.getParameter(gl.PIXEL_PACK_BUFFER_BINDING),
        rasterizerDiscard: gl.isEnabled(gl.RASTERIZER_DISCARD),
        readFramebuffer: gl.getParameter(gl.READ_FRAMEBUFFER_BINDING),
        sampler: gl.getParameter(gl.SAMPLER_BINDING),
        scissorTest: gl.isEnabled(gl.SCISSOR_TEST),
        stencilTest: gl.isEnabled(gl.STENCIL_TEST),
        texture2d: gl.getParameter(gl.TEXTURE_BINDING_2D),
        unpackAlignment: gl.getParameter(gl.UNPACK_ALIGNMENT),
        unpackColorspaceConversion:
            gl.getParameter(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL),
        unpackFlipY: gl.getParameter(gl.UNPACK_FLIP_Y_WEBGL),
        unpackPremultiplyAlpha: gl.getParameter(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL),
        vertexArray: gl.getParameter(gl.VERTEX_ARRAY_BINDING),
        viewport: gl.getParameter(gl.VIEWPORT)
    };
}

function restoreState(gl, state, resources) {
    for (const record of resources?.priorTextureUnits ?? []) {
        gl.activeTexture(gl.TEXTURE0 + record.unit);
        gl.bindTexture(gl.TEXTURE_2D, record.texture);
        gl.bindSampler(record.unit, record.sampler);
    }
    gl.activeTexture(state.activeTexture);
    gl.bindTexture(gl.TEXTURE_2D, state.texture2d);
    gl.bindSampler(state.activeTexture - gl.TEXTURE0, state.sampler);
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, state.readFramebuffer);
    gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, state.drawFramebuffer);
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, state.pixelPackBuffer);
    gl.useProgram(state.currentProgram);
    gl.bindVertexArray(state.vertexArray);
    gl.pixelStorei(gl.PACK_ALIGNMENT, state.packAlignment);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, state.unpackAlignment);
    gl.pixelStorei(
        gl.UNPACK_COLORSPACE_CONVERSION_WEBGL,
        state.unpackColorspaceConversion
    );
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, state.unpackFlipY);
    gl.pixelStorei(
        gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,
        state.unpackPremultiplyAlpha
    );
    gl.colorMask(...state.colorMask);
    gl.viewport(...state.viewport);
    setCapability(gl, gl.BLEND, state.blend);
    setCapability(gl, gl.CULL_FACE, state.cullFace);
    setCapability(gl, gl.DEPTH_TEST, state.depthTest);
    setCapability(gl, gl.DITHER, state.dither);
    setCapability(gl, gl.RASTERIZER_DISCARD, state.rasterizerDiscard);
    setCapability(gl, gl.SCISSOR_TEST, state.scissorTest);
    setCapability(gl, gl.STENCIL_TEST, state.stencilTest);
}

function compareState(before, after) {
    const differences = [];
    for (const key of Object.keys(before)) {
        const left = before[key];
        const right = after[key];
        const leftSequence = Array.isArray(left) || ArrayBuffer.isView(left);
        const rightSequence = Array.isArray(right) || ArrayBuffer.isView(right);
        const equal = leftSequence && rightSequence
            ? left.length === right.length
                && [...left].every((value, index) => Object.is(value, right[index]))
            : Object.is(left, right);
        if (!equal) differences.push(key);
    }
    return differences;
}

function destroyResources(gl, resources) {
    if (resources.framebuffer) gl.deleteFramebuffer(resources.framebuffer);
    if (resources.program) gl.deleteProgram(resources.program);
    for (const texture of Object.values(resources.sampleTextures ?? {})) {
        gl.deleteTexture(texture);
    }
    if (resources.target) gl.deleteTexture(resources.target);
    if (resources.vertexArray) gl.deleteVertexArray(resources.vertexArray);
}

function compileShader(gl, type, source, label) {
    const shader = gl.createShader(type);
    if (!shader) throw new Error('native textureGrad shader allocation failed');
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        const log = gl.getShaderInfoLog(shader) || 'unknown compile failure';
        gl.deleteShader(shader);
        throw new Error(`native textureGrad shader failed (${label}): ${log}`);
    }
    return shader;
}

function requiredUniform(gl, program, name) {
    const location = gl.getUniformLocation(program, name);
    if (location === null) {
        throw new Error(`native textureGrad program omitted uniform ${name}`);
    }
    return location;
}

function graphicsIdentity(gl, renderer) {
    const debug = gl.getExtension('WEBGL_debug_renderer_info');
    return {
        renderer: String(gl.getParameter(gl.RENDERER)),
        unmaskedRenderer: debug
            ? String(gl.getParameter(debug.UNMASKED_RENDERER_WEBGL)) : null,
        unmaskedVendor: debug
            ? String(gl.getParameter(debug.UNMASKED_VENDOR_WEBGL)) : null,
        vendor: String(gl.getParameter(gl.VENDOR)),
        version: String(gl.getParameter(gl.VERSION)),
        shadingLanguageVersion: String(gl.getParameter(gl.SHADING_LANGUAGE_VERSION)),
        threeRevision: String(renderer?.constructor?.REVISION ?? 'runtime-import-r183')
    };
}

function textureIdentity(texture) {
    const image = texture.image;
    return {
        anisotropy: texture.anisotropy,
        flipY: texture.flipY,
        generateMipmaps: texture.generateMipmaps,
        height: Number(image?.height),
        magFilter: texture.magFilter,
        matrix: texture.matrix?.toArray?.() ?? null,
        minFilter: texture.minFilter,
        premultiplyAlpha: texture.premultiplyAlpha,
        type: texture.type,
        width: Number(image?.width),
        wrapS: texture.wrapS,
        wrapT: texture.wrapT
    };
}

function setCapability(gl, capability, enabled) {
    if (enabled) gl.enable(capability);
    else gl.disable(capability);
}

function finitePair(value, label) {
    if (!Array.isArray(value) || value.length !== 2
        || value.some((entry) => !Number.isFinite(entry))) {
        throw new TypeError(`${label} must contain two finite numbers`);
    }
    return [Number(value[0]), Number(value[1])];
}

function requirePositiveSafeInteger(value, label) {
    if (!Number.isSafeInteger(value) || Number(value) <= 0) {
        throw new TypeError(`${label} must be a positive safe integer`);
    }
    return Number(value);
}

function requireNonEmptyString(value, label) {
    if (typeof value !== 'string' || value.trim() === '') {
        throw new TypeError(`${label} must be a non-empty string`);
    }
    return value;
}

function isWorldVisible(object) {
    for (let current = object; current; current = current.parent) {
        if (current.visible === false) return false;
    }
    return true;
}
