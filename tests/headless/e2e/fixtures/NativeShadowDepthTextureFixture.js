// Small Chrome/ANGLE fixture for the native depth-texture transform-feedback helper.
// @ts-check

import * as THREE from 'three';
import {
    NATIVE_SHADOW_DEPTH_CAPTURE_METHOD,
    captureNativeShadowDepthTexture
} from '/tools/static_sun_depth/browser/NativeShadowDepthTextureCapture.js';

const WIDTH = 4;
const HEIGHT = 3;
const DEPTH24_MAX = 0xffffff;

export function runNativeShadowDepthTextureCaptureFixture() {
    const canvas = document.querySelector('#fixture');
    if (!(canvas instanceof HTMLCanvasElement)) throw new Error('fixture canvas is missing');
    const gl = canvas.getContext('webgl2', {
        antialias: false,
        depth: true,
        preserveDrawingBuffer: false,
        stencil: false
    });
    if (!(gl instanceof WebGL2RenderingContext)) {
        throw new Error('fixture requires WebGL2');
    }
    const renderer = new THREE.WebGLRenderer({
        canvas,
        context: gl,
        antialias: false
    });
    renderer.autoClear = false;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.75;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.autoUpdate = false;
    renderer.shadowMap.needsUpdate = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    const rendererTarget = new THREE.WebGLRenderTarget(2, 2, {
        depthBuffer: true,
        stencilBuffer: false
    });
    renderer.setRenderTarget(rendererTarget);

    const sourceValues = [
        0,
        0.125,
        0.5,
        1,
        Math.fround(0.1234567),
        Math.fround(0.33333334),
        0.75,
        Math.fround(0.90000004),
        1 / 1024,
        Math.fround(0.49999997),
        Math.fround(0.50000006),
        Math.fround(0.99999994)
    ];
    const depth32Fixture = createDepthFixture(
        gl,
        gl.DEPTH_COMPONENT32F,
        sourceValues
    );
    const depth24Fixture = createDepthFixture(
        gl,
        gl.DEPTH_COMPONENT24,
        sourceValues
    );
    const wrongDepthTexture = createDepthTexture(
        gl,
        gl.DEPTH_COMPONENT32F,
        WIDTH,
        HEIGHT
    );
    const sentinel = createAndBindSentinelState(gl);
    assertNoFixtureErrors(gl, 'sentinel setup');

    try {
        const full32 = captureNativeShadowDepthTexture({
            gl,
            renderer,
            framebuffer: depth32Fixture.framebuffer,
            depthTexture: depth32Fixture.depthTexture,
            textureWidth: WIDTH,
            textureHeight: HEIGHT,
            label: 'depth32f-full'
        });
        const afterFullState = compareSentinelState(gl, sentinel);

        const subregion32 = captureNativeShadowDepthTexture({
            gl,
            renderer,
            framebuffer: depth32Fixture.framebuffer,
            depthTexture: depth32Fixture.depthTexture,
            textureWidth: WIDTH,
            textureHeight: HEIGHT,
            region: {x: 1, y: 1, width: 2, height: 2},
            label: 'depth32f-subregion'
        });
        const afterSubregionState = compareSentinelState(gl, sentinel);

        const full24 = captureNativeShadowDepthTexture({
            gl,
            renderer,
            framebuffer: depth24Fixture.framebuffer,
            depthTexture: depth24Fixture.depthTexture,
            textureWidth: WIDTH,
            textureHeight: HEIGHT,
            label: 'depth24-full'
        });
        const afterDepth24State = compareSentinelState(gl, sentinel);

        let mismatchError = null;
        try {
            captureNativeShadowDepthTexture({
                gl,
                renderer,
                framebuffer: depth32Fixture.framebuffer,
                depthTexture: wrongDepthTexture,
                textureWidth: WIDTH,
                textureHeight: HEIGHT,
                label: 'wrong-depth-object'
            });
        } catch (error) {
            mismatchError = {
                code: error?.code ?? null,
                message: String(error?.message ?? error),
                stateRestoration: error?.diagnostics?.stateRestoration ?? null
            };
        }
        const afterMismatchState = compareSentinelState(gl, sentinel);
        assertNoFixtureErrors(gl, 'capture completion');

        const expected32 = new Float32Array(sourceValues);
        const expected24Integers = sourceValues.map((value) => (
            Math.round(Math.fround(value) * DEPTH24_MAX)
        ));
        const captured24Integers = [...full24.depthValues].map((value) => (
            Math.round(value * DEPTH24_MAX)
        ));
        return {
            schema: 'ai531-native-shadow-depth-texture-gpu-fixture-v1',
            method: NATIVE_SHADOW_DEPTH_CAPTURE_METHOD,
            implementation: full32.implementation,
            sourceTextureCompareMode: {
                depth24: full24.sourceProof.sourceTextureCompareMode,
                depth32f: full32.sourceProof.sourceTextureCompareMode
            },
            attachmentDepthBits: {
                depth24: full24.sourceProof.attachmentDepthBits,
                depth32f: full32.sourceProof.attachmentDepthBits
            },
            depth32f: {
                expectedBits: float32Bits(expected32),
                capturedBits: float32Bits(full32.depthValues),
                capturedValues: [...full32.depthValues]
            },
            depth24: {
                expectedIntegers: expected24Integers,
                capturedIntegers: captured24Integers,
                expectedFloatBits: float32Bits(expected32),
                capturedFloatBits: float32Bits(full24.depthValues),
                capturedValues: [...full24.depthValues]
            },
            subregion32f: {
                region: subregion32.plan.region,
                capturedBits: float32Bits(subregion32.depthValues),
                capturedValues: [...subregion32.depthValues]
            },
            transfer: full32.transfer,
            restoration: {
                helper: full32.stateRestoration,
                afterFullState,
                afterSubregionState,
                afterDepth24State,
                afterMismatchState
            },
            mismatchError
        };
    } finally {
        restoreAndDeleteSentinelState(gl, sentinel);
        deleteDepthFixture(gl, depth32Fixture);
        deleteDepthFixture(gl, depth24Fixture);
        gl.deleteTexture(wrongDepthTexture);
        renderer.setRenderTarget(null);
        rendererTarget.dispose();
        renderer.dispose();
    }
}

/**
 * @param {WebGL2RenderingContext} gl
 * @param {number} depthInternalFormat
 * @param {number[]} values
 */
function createDepthFixture(gl, depthInternalFormat, values) {
    const state = captureFixtureSetupState(gl);
    const framebuffer = requireResource(gl.createFramebuffer(), 'framebuffer');
    const colorTexture = requireResource(gl.createTexture(), 'color texture');
    const depthTexture = createDepthTexture(
        gl,
        depthInternalFormat,
        WIDTH,
        HEIGHT
    );
    try {
        gl.bindTexture(gl.TEXTURE_2D, colorTexture);
        gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA8, WIDTH, HEIGHT);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
        gl.framebufferTexture2D(
            gl.FRAMEBUFFER,
            gl.COLOR_ATTACHMENT0,
            gl.TEXTURE_2D,
            colorTexture,
            0
        );
        gl.framebufferTexture2D(
            gl.FRAMEBUFFER,
            gl.DEPTH_ATTACHMENT,
            gl.TEXTURE_2D,
            depthTexture,
            0
        );
        gl.drawBuffers([gl.COLOR_ATTACHMENT0]);
        gl.readBuffer(gl.COLOR_ATTACHMENT0);
        if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
            throw new Error(`depth fixture framebuffer incomplete: ${depthInternalFormat}`);
        }
        gl.depthMask(true);
        gl.enable(gl.SCISSOR_TEST);
        for (let index = 0; index < values.length; index += 1) {
            const x = index % WIDTH;
            const y = Math.floor(index / WIDTH);
            gl.scissor(x, y, 1, 1);
            gl.clearDepth(values[index]);
            gl.clear(gl.DEPTH_BUFFER_BIT);
        }
        assertNoFixtureErrors(gl, `depth fixture ${depthInternalFormat}`);
        return {colorTexture, depthTexture, framebuffer};
    } catch (error) {
        gl.deleteTexture(colorTexture);
        gl.deleteTexture(depthTexture);
        gl.deleteFramebuffer(framebuffer);
        throw error;
    } finally {
        restoreFixtureSetupState(gl, state);
    }
}

/**
 * @param {WebGL2RenderingContext} gl
 * @param {number} internalFormat
 * @param {number} width
 * @param {number} height
 */
function createDepthTexture(gl, internalFormat, width, height) {
    const previousTexture = gl.getParameter(gl.TEXTURE_BINDING_2D);
    const texture = requireResource(gl.createTexture(), 'depth texture');
    try {
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.texStorage2D(gl.TEXTURE_2D, 1, internalFormat, width, height);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texParameteri(
            gl.TEXTURE_2D,
            gl.TEXTURE_COMPARE_MODE,
            gl.COMPARE_REF_TO_TEXTURE
        );
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_FUNC, gl.LEQUAL);
        return texture;
    } finally {
        gl.bindTexture(gl.TEXTURE_2D, previousTexture);
    }
}

/** @param {WebGL2RenderingContext} gl */
function captureFixtureSetupState(gl) {
    return {
        clearDepth: gl.getParameter(gl.DEPTH_CLEAR_VALUE),
        depthMask: gl.getParameter(gl.DEPTH_WRITEMASK),
        drawFramebuffer: gl.getParameter(gl.DRAW_FRAMEBUFFER_BINDING),
        readFramebuffer: gl.getParameter(gl.READ_FRAMEBUFFER_BINDING),
        scissorBox: [...gl.getParameter(gl.SCISSOR_BOX)],
        scissorTest: gl.isEnabled(gl.SCISSOR_TEST),
        texture2d: gl.getParameter(gl.TEXTURE_BINDING_2D)
    };
}

/** @param {WebGL2RenderingContext} gl @param {ReturnType<typeof captureFixtureSetupState>} state */
function restoreFixtureSetupState(gl, state) {
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, state.readFramebuffer);
    gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, state.drawFramebuffer);
    gl.bindTexture(gl.TEXTURE_2D, state.texture2d);
    gl.clearDepth(state.clearDepth);
    gl.depthMask(state.depthMask);
    gl.scissor(...state.scissorBox);
    if (state.scissorTest) gl.enable(gl.SCISSOR_TEST);
    else gl.disable(gl.SCISSOR_TEST);
}

/** @param {WebGL2RenderingContext} gl */
function createAndBindSentinelState(gl) {
    const original = {
        activeTexture: gl.getParameter(gl.ACTIVE_TEXTURE),
        arrayBuffer: gl.getParameter(gl.ARRAY_BUFFER_BINDING),
        currentProgram: gl.getParameter(gl.CURRENT_PROGRAM),
        drawFramebuffer: gl.getParameter(gl.DRAW_FRAMEBUFFER_BINDING),
        rasterizerDiscard: gl.isEnabled(gl.RASTERIZER_DISCARD),
        readFramebuffer: gl.getParameter(gl.READ_FRAMEBUFFER_BINDING),
        sampler: gl.getParameter(gl.SAMPLER_BINDING),
        texture2d: gl.getParameter(gl.TEXTURE_BINDING_2D),
        transformFeedback: gl.getParameter(gl.TRANSFORM_FEEDBACK_BINDING),
        transformFeedbackBuffer: gl.getParameter(gl.TRANSFORM_FEEDBACK_BUFFER_BINDING),
        vertexArray: gl.getParameter(gl.VERTEX_ARRAY_BINDING)
    };
    const program = createSentinelProgram(gl);
    const vertexArray = requireResource(gl.createVertexArray(), 'sentinel vertex array');
    const transformFeedback = requireResource(
        gl.createTransformFeedback(),
        'sentinel transform feedback'
    );
    const transformFeedbackBuffer = requireResource(
        gl.createBuffer(),
        'sentinel transform feedback buffer'
    );
    const arrayBuffer = requireResource(gl.createBuffer(), 'sentinel array buffer');
    const texture = requireResource(gl.createTexture(), 'sentinel texture');
    const sampler = requireResource(gl.createSampler(), 'sentinel sampler');
    const readFramebuffer = requireResource(
        gl.createFramebuffer(),
        'sentinel read framebuffer'
    );
    const drawFramebuffer = requireResource(
        gl.createFramebuffer(),
        'sentinel draw framebuffer'
    );

    gl.useProgram(program);
    gl.bindVertexArray(vertexArray);
    gl.bindTransformFeedback(gl.TRANSFORM_FEEDBACK, transformFeedback);
    gl.bindBuffer(gl.TRANSFORM_FEEDBACK_BUFFER, transformFeedbackBuffer);
    gl.bufferData(gl.TRANSFORM_FEEDBACK_BUFFER, 16, gl.STATIC_DRAW);
    gl.bindBufferBase(gl.TRANSFORM_FEEDBACK_BUFFER, 0, transformFeedbackBuffer);
    gl.bindBuffer(gl.ARRAY_BUFFER, arrayBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, 4, gl.STATIC_DRAW);
    gl.activeTexture(gl.TEXTURE0 + 3);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA8, 1, 1);
    gl.bindSampler(3, sampler);
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, readFramebuffer);
    gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, drawFramebuffer);
    gl.enable(gl.RASTERIZER_DISCARD);
    return {
        original,
        expected: {
            activeTexture: gl.TEXTURE0 + 3,
            arrayBuffer,
            currentProgram: program,
            drawFramebuffer,
            rasterizerDiscard: true,
            readFramebuffer,
            sampler,
            texture2d: texture,
            transformFeedback,
            transformFeedbackBuffer,
            transformFeedbackBuffer0: transformFeedbackBuffer,
            vertexArray
        },
        resources: {
            arrayBuffer,
            drawFramebuffer,
            program,
            readFramebuffer,
            sampler,
            texture,
            transformFeedback,
            transformFeedbackBuffer,
            vertexArray
        }
    };
}

/** @param {WebGL2RenderingContext} gl @param {ReturnType<typeof createAndBindSentinelState>} sentinel */
function compareSentinelState(gl, sentinel) {
    const actual = {
        activeTexture: gl.getParameter(gl.ACTIVE_TEXTURE),
        arrayBuffer: gl.getParameter(gl.ARRAY_BUFFER_BINDING),
        currentProgram: gl.getParameter(gl.CURRENT_PROGRAM),
        drawFramebuffer: gl.getParameter(gl.DRAW_FRAMEBUFFER_BINDING),
        rasterizerDiscard: gl.isEnabled(gl.RASTERIZER_DISCARD),
        readFramebuffer: gl.getParameter(gl.READ_FRAMEBUFFER_BINDING),
        sampler: gl.getParameter(gl.SAMPLER_BINDING),
        texture2d: gl.getParameter(gl.TEXTURE_BINDING_2D),
        transformFeedback: gl.getParameter(gl.TRANSFORM_FEEDBACK_BINDING),
        transformFeedbackBuffer: gl.getParameter(gl.TRANSFORM_FEEDBACK_BUFFER_BINDING),
        transformFeedbackBuffer0: gl.getIndexedParameter(
            gl.TRANSFORM_FEEDBACK_BUFFER_BINDING,
            0
        ),
        vertexArray: gl.getParameter(gl.VERTEX_ARRAY_BINDING)
    };
    const differences = [];
    for (const [key, expected] of Object.entries(sentinel.expected)) {
        if (!Object.is(actual[key], expected)) differences.push(key);
    }
    return differences;
}

/** @param {WebGL2RenderingContext} gl @param {ReturnType<typeof createAndBindSentinelState>} sentinel */
function restoreAndDeleteSentinelState(gl, sentinel) {
    const {original, resources} = sentinel;
    gl.disable(gl.RASTERIZER_DISCARD);
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, original.readFramebuffer);
    gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, original.drawFramebuffer);
    gl.useProgram(original.currentProgram);
    gl.bindVertexArray(original.vertexArray);
    gl.bindTransformFeedback(gl.TRANSFORM_FEEDBACK, original.transformFeedback);
    gl.bindBuffer(gl.TRANSFORM_FEEDBACK_BUFFER, original.transformFeedbackBuffer);
    gl.bindBuffer(gl.ARRAY_BUFFER, original.arrayBuffer);
    gl.activeTexture(gl.TEXTURE0 + 3);
    gl.bindTexture(gl.TEXTURE_2D, null);
    gl.bindSampler(3, null);
    gl.activeTexture(original.activeTexture);
    gl.bindTexture(gl.TEXTURE_2D, original.texture2d);
    gl.bindSampler(original.activeTexture - gl.TEXTURE0, original.sampler);
    if (original.rasterizerDiscard) gl.enable(gl.RASTERIZER_DISCARD);
    else gl.disable(gl.RASTERIZER_DISCARD);

    gl.deleteBuffer(resources.arrayBuffer);
    gl.deleteFramebuffer(resources.drawFramebuffer);
    gl.deleteProgram(resources.program);
    gl.deleteFramebuffer(resources.readFramebuffer);
    gl.deleteSampler(resources.sampler);
    gl.deleteTexture(resources.texture);
    gl.deleteTransformFeedback(resources.transformFeedback);
    gl.deleteBuffer(resources.transformFeedbackBuffer);
    gl.deleteVertexArray(resources.vertexArray);
}

/** @param {WebGL2RenderingContext} gl */
function createSentinelProgram(gl) {
    const vertexShader = compileFixtureShader(
        gl,
        gl.VERTEX_SHADER,
        `#version 300 es\nvoid main(){gl_Position=vec4(0.0);}`
    );
    const fragmentShader = compileFixtureShader(
        gl,
        gl.FRAGMENT_SHADER,
        `#version 300 es\nprecision highp float;out vec4 c;void main(){c=vec4(0.0);}`
    );
    const program = requireResource(gl.createProgram(), 'sentinel program');
    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);
    gl.deleteShader(vertexShader);
    gl.deleteShader(fragmentShader);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        const log = gl.getProgramInfoLog(program);
        gl.deleteProgram(program);
        throw new Error(`sentinel program link failed: ${log}`);
    }
    return program;
}

/** @param {WebGL2RenderingContext} gl @param {number} type @param {string} source */
function compileFixtureShader(gl, type, source) {
    const shader = requireResource(gl.createShader(type), 'sentinel shader');
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        const log = gl.getShaderInfoLog(shader);
        gl.deleteShader(shader);
        throw new Error(`sentinel shader compile failed: ${log}`);
    }
    return shader;
}

/** @param {Float32Array} values */
function float32Bits(values) {
    const copy = new Float32Array(values);
    return [...new Uint32Array(copy.buffer)];
}

/** @param {WebGL2RenderingContext} gl @param {string} stage */
function assertNoFixtureErrors(gl, stage) {
    const errors = [];
    for (let index = 0; index < 32; index += 1) {
        const error = gl.getError();
        if (error === gl.NO_ERROR) break;
        errors.push(error);
    }
    if (errors.length > 0) throw new Error(`${stage} WebGL errors: ${errors.join(', ')}`);
}

/** @template T @param {T | null} value @param {string} label */
function requireResource(value, label) {
    if (value === null) throw new Error(`could not create ${label}`);
    return value;
}

/** @param {WebGL2RenderingContext} gl @param {{framebuffer: WebGLFramebuffer, colorTexture: WebGLTexture, depthTexture: WebGLTexture}} fixture */
function deleteDepthFixture(gl, fixture) {
    gl.deleteFramebuffer(fixture.framebuffer);
    gl.deleteTexture(fixture.colorTexture);
    gl.deleteTexture(fixture.depthTexture);
}
