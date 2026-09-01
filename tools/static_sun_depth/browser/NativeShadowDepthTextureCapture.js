// Authenticated WebGL2 readback of a native shadow depth texture without a color proxy.
// @ts-check

export const NATIVE_SHADOW_DEPTH_CAPTURE_SCHEMA =
    'native-shadow-depth-texture-capture-v1';
export const NATIVE_SHADOW_DEPTH_CAPTURE_METHOD =
    'three-r183-native-shadow-depth-texture-transform-feedback-v1';
export const NATIVE_SHADOW_DEPTH_CAPTURE_ORDER =
    'x-fastest-bottom-row-first-v1';

const FLOAT32_BYTES = Float32Array.BYTES_PER_ELEMENT;
const MAX_DRAW_INSTANCE_COUNT = 0x7fffffff;

const VERTEX_SHADER_SOURCE = `#version 300 es
precision highp float;
precision highp int;

layout(location = 0) in float captureVertex;
uniform highp sampler2D captureDepthTexture;
uniform highp ivec2 captureRegionOrigin;
uniform highp int captureRegionWidth;
out highp float capturedDepth;

void main() {
    int captureIndex = gl_InstanceID + int(captureVertex);
    ivec2 localTexel = ivec2(
        captureIndex % captureRegionWidth,
        captureIndex / captureRegionWidth
    );
    capturedDepth = texelFetch(
        captureDepthTexture,
        captureRegionOrigin + localTexel,
        0
    ).r;
    gl_Position = vec4(0.0, 0.0, 0.0, 1.0);
    gl_PointSize = 1.0;
}
`;

const FRAGMENT_SHADER_SOURCE = `#version 300 es
precision highp float;
out vec4 discardedColor;

void main() {
    discardedColor = vec4(0.0);
}
`;

export class NativeShadowDepthCaptureError extends Error {
    /**
     * @param {string} code
     * @param {string} message
     * @param {Record<string, any>} [diagnostics]
     * @param {unknown} [cause]
     */
    constructor(code, message, diagnostics = {}, cause = undefined) {
        super(message, cause === undefined ? undefined : {cause});
        this.name = 'NativeShadowDepthCaptureError';
        this.code = code;
        this.diagnostics = diagnostics;
    }
}

/**
 * Create the immutable row-major capture plan used by both browser code and tests.
 * Coordinates use the WebGL lower-left texture origin.
 *
 * @param {{
 *   textureWidth: number,
 *   textureHeight: number,
 *   region?: {x: number, y: number, width: number, height: number},
 *   maximumTexels?: number
 * }} value
 */
export function createNativeShadowDepthCapturePlan(value) {
    const textureWidth = requirePositiveSafeInteger(
        value?.textureWidth,
        'textureWidth'
    );
    const textureHeight = requirePositiveSafeInteger(
        value?.textureHeight,
        'textureHeight'
    );
    const regionValue = value?.region ?? {
        x: 0,
        y: 0,
        width: textureWidth,
        height: textureHeight
    };
    const region = {
        x: requireNonNegativeSafeInteger(regionValue?.x, 'region.x'),
        y: requireNonNegativeSafeInteger(regionValue?.y, 'region.y'),
        width: requirePositiveSafeInteger(regionValue?.width, 'region.width'),
        height: requirePositiveSafeInteger(regionValue?.height, 'region.height')
    };
    if (region.x + region.width > textureWidth
        || region.y + region.height > textureHeight) {
        throw new RangeError('capture region must remain inside the depth texture');
    }
    const texelCount = region.width * region.height;
    if (!Number.isSafeInteger(texelCount) || texelCount > MAX_DRAW_INSTANCE_COUNT) {
        throw new RangeError('capture region contains too many texels for one WebGL draw');
    }
    if (value?.maximumTexels !== undefined) {
        const maximumTexels = requirePositiveSafeInteger(
            value.maximumTexels,
            'maximumTexels'
        );
        if (texelCount > maximumTexels) {
            throw new RangeError(
                `capture region contains ${texelCount} texels, exceeding maximumTexels ${maximumTexels}`
            );
        }
    }
    const byteLength = texelCount * FLOAT32_BYTES;
    if (!Number.isSafeInteger(byteLength)) {
        throw new RangeError('capture byte length is not a safe integer');
    }
    return freezeDeep({
        byteLength,
        order: NATIVE_SHADOW_DEPTH_CAPTURE_ORDER,
        region,
        texelCount,
        textureSize: [textureWidth, textureHeight]
    });
}

/**
 * Capture the exact float values exposed by a native WebGL2 depth texture.
 * The helper is synchronous because getBufferSubData is the required GPU fence.
 * No PIXEL_PACK_BUFFER or color attachment is used.
 *
 * @param {{
 *   gl: WebGL2RenderingContext,
 *   framebuffer: WebGLFramebuffer,
 *   depthTexture: WebGLTexture,
 *   textureWidth: number,
 *   textureHeight: number,
 *   region?: {x: number, y: number, width: number, height: number},
 *   maximumTexels?: number,
 *   renderer?: any,
 *   label?: string
 * }} options
 */
export function captureNativeShadowDepthTexture(options) {
    const gl = requireWebGl2Context(options?.gl);
    const plan = createNativeShadowDepthCapturePlan(options);
    const framebuffer = requireObject(options?.framebuffer, 'framebuffer');
    const depthTexture = requireObject(options?.depthTexture, 'depthTexture');
    const label = options?.label === undefined
        ? null
        : requireNonEmptyString(options.label, 'label');

    const preexistingErrors = takeGlErrors(gl);
    if (preexistingErrors.length > 0) {
        throw new NativeShadowDepthCaptureError(
            'PREEXISTING_GL_ERROR',
            'Native depth capture requires a clean WebGL error state',
            {glErrors: describeGlErrors(gl, preexistingErrors), label}
        );
    }

    const rendererStateBefore = captureRendererState(options?.renderer, gl);
    const glStateBefore = captureMutatedGlState(gl);
    if (glStateBefore.transformFeedbackActive || glStateBefore.transformFeedbackPaused) {
        throw new NativeShadowDepthCaptureError(
            'ACTIVE_TRANSFORM_FEEDBACK',
            'Native depth capture cannot interrupt active or paused transform feedback',
            {label}
        );
    }

    /** @type {WebGLProgram | null} */
    let program = null;
    /** @type {WebGLSampler | null} */
    let sampler = null;
    /** @type {WebGLVertexArrayObject | null} */
    let vertexArray = null;
    /** @type {WebGLTransformFeedback | null} */
    let transformFeedback = null;
    /** @type {WebGLBuffer | null} */
    let captureBuffer = null;
    /** @type {WebGLBuffer | null} */
    let dummyVertexBuffer = null;
    let transformFeedbackBegun = false;
    let stage = 'preflight';
    /** @type {NativeShadowDepthCaptureError | null} */
    let primaryError = null;
    /** @type {Float32Array | null} */
    let depthValues = null;
    /** @type {Record<string, any> | null} */
    let sourceProof = null;
    /** @type {Record<string, any> | null} */
    let stateRestoration = null;

    try {
        stage = 'depth-attachment-proof';
        gl.bindFramebuffer(gl.READ_FRAMEBUFFER, framebuffer);
        const framebufferStatus = gl.checkFramebufferStatus(gl.READ_FRAMEBUFFER);
        if (framebufferStatus !== gl.FRAMEBUFFER_COMPLETE) {
            throw new NativeShadowDepthCaptureError(
                'FRAMEBUFFER_INCOMPLETE',
                'Native shadow framebuffer is not complete',
                {framebufferStatus, label}
            );
        }
        const attachmentObjectType = gl.getFramebufferAttachmentParameter(
            gl.READ_FRAMEBUFFER,
            gl.DEPTH_ATTACHMENT,
            gl.FRAMEBUFFER_ATTACHMENT_OBJECT_TYPE
        );
        const attachmentObject = gl.getFramebufferAttachmentParameter(
            gl.READ_FRAMEBUFFER,
            gl.DEPTH_ATTACHMENT,
            gl.FRAMEBUFFER_ATTACHMENT_OBJECT_NAME
        );
        if (attachmentObjectType !== gl.TEXTURE) {
            throw new NativeShadowDepthCaptureError(
                'DEPTH_ATTACHMENT_NOT_TEXTURE',
                'Native shadow depth attachment is not a texture',
                {attachmentObjectType, label}
            );
        }
        if (attachmentObject !== depthTexture) {
            throw new NativeShadowDepthCaptureError(
                'DEPTH_ATTACHMENT_IDENTITY_MISMATCH',
                'Provided depth texture is not the framebuffer DEPTH_ATTACHMENT object',
                {label}
            );
        }
        const attachmentLevel = gl.getFramebufferAttachmentParameter(
            gl.READ_FRAMEBUFFER,
            gl.DEPTH_ATTACHMENT,
            gl.FRAMEBUFFER_ATTACHMENT_TEXTURE_LEVEL
        );
        if (attachmentLevel !== 0) {
            throw new NativeShadowDepthCaptureError(
                'DEPTH_ATTACHMENT_LEVEL_UNSUPPORTED',
                'Only mip level zero depth attachments can be captured',
                {attachmentLevel, label}
            );
        }
        const attachmentDepthBits = gl.getFramebufferAttachmentParameter(
            gl.READ_FRAMEBUFFER,
            gl.DEPTH_ATTACHMENT,
            gl.FRAMEBUFFER_ATTACHMENT_DEPTH_SIZE
        );
        assertNoGlErrors(gl, stage, label);

        stage = 'capture-resources';
        program = createCaptureProgram(gl, label);
        sampler = requireCreatedResource(gl.createSampler(), 'sampler', label);
        vertexArray = requireCreatedResource(
            gl.createVertexArray(),
            'vertex array',
            label
        );
        transformFeedback = requireCreatedResource(
            gl.createTransformFeedback(),
            'transform feedback',
            label
        );
        captureBuffer = requireCreatedResource(
            gl.createBuffer(),
            'capture buffer',
            label
        );
        dummyVertexBuffer = requireCreatedResource(
            gl.createBuffer(),
            'dummy vertex buffer',
            label
        );

        const textureUnitIndex = glStateBefore.activeTexture - gl.TEXTURE0;
        gl.bindTexture(gl.TEXTURE_2D, depthTexture);
        const sourceTextureCompareMode = gl.getTexParameter(
            gl.TEXTURE_2D,
            gl.TEXTURE_COMPARE_MODE
        );
        gl.samplerParameteri(sampler, gl.TEXTURE_COMPARE_MODE, gl.NONE);
        gl.samplerParameteri(sampler, gl.TEXTURE_COMPARE_FUNC, gl.LEQUAL);
        gl.samplerParameteri(sampler, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.samplerParameteri(sampler, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        gl.samplerParameteri(sampler, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.samplerParameteri(sampler, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.bindSampler(textureUnitIndex, sampler);
        const samplerCompareMode = gl.getSamplerParameter(
            sampler,
            gl.TEXTURE_COMPARE_MODE
        );
        if (samplerCompareMode !== gl.NONE) {
            throw new NativeShadowDepthCaptureError(
                'SAMPLER_COMPARE_MODE_NOT_DISABLED',
                'Temporary depth capture sampler did not disable comparison mode',
                {samplerCompareMode, label}
            );
        }

        gl.useProgram(program);
        setRequiredUniform1i(
            gl,
            program,
            'captureDepthTexture',
            textureUnitIndex,
            label
        );
        setRequiredUniform2i(
            gl,
            program,
            'captureRegionOrigin',
            plan.region.x,
            plan.region.y,
            label
        );
        setRequiredUniform1i(
            gl,
            program,
            'captureRegionWidth',
            plan.region.width,
            label
        );

        gl.bindVertexArray(vertexArray);
        gl.bindBuffer(gl.ARRAY_BUFFER, dummyVertexBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, 1, gl.STATIC_DRAW);
        gl.enableVertexAttribArray(0);
        gl.vertexAttribPointer(0, 1, gl.UNSIGNED_BYTE, false, 1, 0);
        gl.vertexAttribDivisor(0, 0);

        gl.bindTransformFeedback(gl.TRANSFORM_FEEDBACK, transformFeedback);
        gl.bindBuffer(gl.TRANSFORM_FEEDBACK_BUFFER, captureBuffer);
        gl.bufferData(
            gl.TRANSFORM_FEEDBACK_BUFFER,
            plan.byteLength,
            gl.STREAM_READ
        );
        gl.bindBufferBase(gl.TRANSFORM_FEEDBACK_BUFFER, 0, captureBuffer);
        assertNoGlErrors(gl, stage, label);

        stage = 'transform-feedback-draw';
        gl.enable(gl.RASTERIZER_DISCARD);
        gl.beginTransformFeedback(gl.POINTS);
        transformFeedbackBegun = true;
        gl.drawArraysInstanced(gl.POINTS, 0, 1, plan.texelCount);
        gl.endTransformFeedback();
        transformFeedbackBegun = false;
        assertNoGlErrors(gl, stage, label);

        stage = 'transform-feedback-readback';
        depthValues = new Float32Array(plan.texelCount);
        gl.getBufferSubData(gl.TRANSFORM_FEEDBACK_BUFFER, 0, depthValues);
        assertNoGlErrors(gl, stage, label);
        for (let index = 0; index < depthValues.length; index += 1) {
            const depth = depthValues[index];
            if (!Number.isFinite(depth) || depth < 0 || depth > 1) {
                throw new NativeShadowDepthCaptureError(
                    'INVALID_CAPTURED_DEPTH',
                    `Captured depth at index ${index} is outside [0, 1]`,
                    {depth, index, label}
                );
            }
        }
        sourceProof = freezeDeep({
            attachment: 'DEPTH_ATTACHMENT',
            attachmentDepthBits,
            attachmentMipLevel: attachmentLevel,
            attachmentObjectIdentity: 'verified',
            attachmentObjectType: 'TEXTURE',
            framebufferStatus: 'FRAMEBUFFER_COMPLETE',
            sampledTextureObjectIdentity: 'same-object-v1',
            sourceTextureCompareMode,
            temporarySamplerCompareMode: 'NONE'
        });
    } catch (error) {
        primaryError = normalizeCaptureError(error, stage, gl, label);
    } finally {
        if (transformFeedbackBegun) {
            try {
                gl.endTransformFeedback();
            } catch {
                // Restoration verification below remains authoritative.
            }
        }
        const restorationErrors = [];
        try {
            restoreMutatedGlState(gl, glStateBefore);
        } catch (error) {
            restorationErrors.push(String(error?.message ?? error));
        }
        try {
            deleteCaptureResources(gl, {
                captureBuffer,
                dummyVertexBuffer,
                program,
                sampler,
                transformFeedback,
                vertexArray
            });
        } catch (error) {
            restorationErrors.push(String(error?.message ?? error));
        }
        const postRestoreErrors = takeGlErrors(gl);
        if (postRestoreErrors.length > 0) {
            restorationErrors.push(
                `WebGL errors after restoration: ${describeGlErrors(gl, postRestoreErrors).join(', ')}`
            );
        }
        const glStateDifferences = compareMutatedGlState(
            glStateBefore,
            captureMutatedGlState(gl)
        );
        const rendererStateDifferences = compareRendererState(
            rendererStateBefore,
            captureRendererState(options?.renderer, gl)
        );
        if (glStateDifferences.length > 0) {
            restorationErrors.push(
                `WebGL state differs: ${glStateDifferences.join(', ')}`
            );
        }
        if (rendererStateDifferences.length > 0) {
            restorationErrors.push(
                `renderer state differs: ${rendererStateDifferences.join(', ')}`
            );
        }
        stateRestoration = freezeDeep({
            gl: glStateDifferences.length === 0 && postRestoreErrors.length === 0
                ? 'verified'
                : 'failed',
            renderer: rendererStateBefore === null
                ? 'not-provided'
                : rendererStateDifferences.length === 0 ? 'verified' : 'failed'
        });
        if (restorationErrors.length > 0) {
            primaryError = new NativeShadowDepthCaptureError(
                'STATE_RESTORATION_FAILED',
                'Native depth capture did not restore all mutated state',
                {label, restorationErrors, stateRestoration},
                primaryError
            );
        } else if (primaryError) {
            primaryError.diagnostics = freezeDeep({
                ...primaryError.diagnostics,
                stateRestoration
            });
        }
    }

    if (primaryError) throw primaryError;
    const evidence = {
        schema: NATIVE_SHADOW_DEPTH_CAPTURE_SCHEMA,
        method: NATIVE_SHADOW_DEPTH_CAPTURE_METHOD,
        status: 'captured',
        label,
        plan,
        sourceProof,
        transfer: freezeDeep({
            component: 'depth-r-float32-v1',
            pixelPackBuffer: 'not-used',
            synchronization: 'blocking-get-buffer-sub-data-v1',
            transformFeedbackPrimitive: 'POINTS',
            vertexIndex: 'gl-instance-id-v1'
        }),
        stateRestoration,
        implementation: captureImplementationDiagnostics(gl),
        depthValues
    };
    return validateNativeShadowDepthCaptureEvidence(evidence);
}

/**
 * Validate the evidence shape without requiring a browser or WebGL context.
 *
 * @param {any} evidence
 */
export function validateNativeShadowDepthCaptureEvidence(evidence) {
    if (!evidence || typeof evidence !== 'object' || Array.isArray(evidence)) {
        throw new TypeError('native depth capture evidence must be an object');
    }
    if (evidence.schema !== NATIVE_SHADOW_DEPTH_CAPTURE_SCHEMA) {
        throw new Error(`native depth capture schema must be ${NATIVE_SHADOW_DEPTH_CAPTURE_SCHEMA}`);
    }
    if (evidence.method !== NATIVE_SHADOW_DEPTH_CAPTURE_METHOD) {
        throw new Error(`native depth capture method must be ${NATIVE_SHADOW_DEPTH_CAPTURE_METHOD}`);
    }
    if (evidence.status !== 'captured') {
        throw new Error('native depth capture status must be captured');
    }
    const plan = createNativeShadowDepthCapturePlan({
        textureWidth: evidence?.plan?.textureSize?.[0],
        textureHeight: evidence?.plan?.textureSize?.[1],
        region: evidence?.plan?.region
    });
    if (evidence?.plan?.order !== NATIVE_SHADOW_DEPTH_CAPTURE_ORDER
        || evidence?.plan?.texelCount !== plan.texelCount
        || evidence?.plan?.byteLength !== plan.byteLength) {
        throw new Error('native depth capture plan metadata is inconsistent');
    }
    if (evidence?.sourceProof?.attachmentObjectIdentity !== 'verified'
        || evidence?.sourceProof?.sampledTextureObjectIdentity !== 'same-object-v1'
        || evidence?.sourceProof?.temporarySamplerCompareMode !== 'NONE') {
        throw new Error('native depth capture lacks an authenticated depth attachment proof');
    }
    if (evidence?.stateRestoration?.gl !== 'verified') {
        throw new Error('native depth capture did not verify WebGL state restoration');
    }
    if (!['verified', 'not-provided'].includes(evidence?.stateRestoration?.renderer)) {
        throw new Error('native depth capture did not verify renderer state restoration');
    }
    if (!(evidence.depthValues instanceof Float32Array)
        || evidence.depthValues.length !== plan.texelCount) {
        throw new TypeError('native depth capture depthValues must match the capture plan');
    }
    for (let index = 0; index < evidence.depthValues.length; index += 1) {
        const depth = evidence.depthValues[index];
        if (!Number.isFinite(depth) || depth < 0 || depth > 1) {
            throw new RangeError(`native depth capture depthValues[${index}] is outside [0, 1]`);
        }
    }
    return evidence;
}

/** @param {WebGL2RenderingContext} gl @param {string | null} label */
function createCaptureProgram(gl, label) {
    const vertexShader = compileShader(
        gl,
        gl.VERTEX_SHADER,
        VERTEX_SHADER_SOURCE,
        'vertex',
        label
    );
    let fragmentShader = null;
    let program = null;
    try {
        fragmentShader = compileShader(
            gl,
            gl.FRAGMENT_SHADER,
            FRAGMENT_SHADER_SOURCE,
            'fragment',
            label
        );
        program = requireCreatedResource(gl.createProgram(), 'program', label);
        gl.attachShader(program, vertexShader);
        gl.attachShader(program, fragmentShader);
        gl.bindAttribLocation(program, 0, 'captureVertex');
        gl.transformFeedbackVaryings(
            program,
            ['capturedDepth'],
            gl.INTERLEAVED_ATTRIBS
        );
        gl.linkProgram(program);
        if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
            throw new NativeShadowDepthCaptureError(
                'PROGRAM_LINK_FAILED',
                'Native depth capture program failed to link',
                {label, programInfoLog: gl.getProgramInfoLog(program) ?? ''}
            );
        }
        return program;
    } catch (error) {
        if (program) gl.deleteProgram(program);
        throw error;
    } finally {
        gl.deleteShader(vertexShader);
        if (fragmentShader) gl.deleteShader(fragmentShader);
    }
}

/**
 * @param {WebGL2RenderingContext} gl
 * @param {number} type
 * @param {string} source
 * @param {string} stage
 * @param {string | null} label
 */
function compileShader(gl, type, source, stage, label) {
    const shader = requireCreatedResource(gl.createShader(type), `${stage} shader`, label);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        const shaderInfoLog = gl.getShaderInfoLog(shader) ?? '';
        gl.deleteShader(shader);
        throw new NativeShadowDepthCaptureError(
            'SHADER_COMPILE_FAILED',
            `Native depth capture ${stage} shader failed to compile`,
            {label, shaderInfoLog, stage}
        );
    }
    return shader;
}

/**
 * @param {WebGL2RenderingContext} gl
 * @param {WebGLProgram} program
 * @param {string} name
 * @param {number} value
 * @param {string | null} label
 */
function setRequiredUniform1i(gl, program, name, value, label) {
    const location = gl.getUniformLocation(program, name);
    if (location === null) {
        throw new NativeShadowDepthCaptureError(
            'PROGRAM_UNIFORM_MISSING',
            `Native depth capture program omitted required uniform ${name}`,
            {label, name}
        );
    }
    gl.uniform1i(location, value);
}

/**
 * @param {WebGL2RenderingContext} gl
 * @param {WebGLProgram} program
 * @param {string} name
 * @param {number} x
 * @param {number} y
 * @param {string | null} label
 */
function setRequiredUniform2i(gl, program, name, x, y, label) {
    const location = gl.getUniformLocation(program, name);
    if (location === null) {
        throw new NativeShadowDepthCaptureError(
            'PROGRAM_UNIFORM_MISSING',
            `Native depth capture program omitted required uniform ${name}`,
            {label, name}
        );
    }
    gl.uniform2i(location, x, y);
}

/** @param {WebGL2RenderingContext} gl */
function captureMutatedGlState(gl) {
    return {
        activeTexture: gl.getParameter(gl.ACTIVE_TEXTURE),
        arrayBuffer: gl.getParameter(gl.ARRAY_BUFFER_BINDING),
        currentProgram: gl.getParameter(gl.CURRENT_PROGRAM),
        drawFramebuffer: gl.getParameter(gl.DRAW_FRAMEBUFFER_BINDING),
        elementArrayBuffer: gl.getParameter(gl.ELEMENT_ARRAY_BUFFER_BINDING),
        rasterizerDiscard: gl.isEnabled(gl.RASTERIZER_DISCARD),
        readFramebuffer: gl.getParameter(gl.READ_FRAMEBUFFER_BINDING),
        sampler: gl.getParameter(gl.SAMPLER_BINDING),
        texture2d: gl.getParameter(gl.TEXTURE_BINDING_2D),
        transformFeedback: gl.getParameter(gl.TRANSFORM_FEEDBACK_BINDING),
        transformFeedbackActive: gl.getParameter(gl.TRANSFORM_FEEDBACK_ACTIVE),
        transformFeedbackBuffer: gl.getParameter(gl.TRANSFORM_FEEDBACK_BUFFER_BINDING),
        transformFeedbackBuffer0: gl.getIndexedParameter(
            gl.TRANSFORM_FEEDBACK_BUFFER_BINDING,
            0
        ),
        transformFeedbackBuffer0Size: gl.getIndexedParameter(
            gl.TRANSFORM_FEEDBACK_BUFFER_SIZE,
            0
        ),
        transformFeedbackBuffer0Start: gl.getIndexedParameter(
            gl.TRANSFORM_FEEDBACK_BUFFER_START,
            0
        ),
        transformFeedbackPaused: gl.getParameter(gl.TRANSFORM_FEEDBACK_PAUSED),
        vertexArray: gl.getParameter(gl.VERTEX_ARRAY_BINDING)
    };
}

/** @param {WebGL2RenderingContext} gl @param {Record<string, any>} state */
function restoreMutatedGlState(gl, state) {
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, state.readFramebuffer);
    gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, state.drawFramebuffer);
    gl.useProgram(state.currentProgram);
    gl.bindVertexArray(state.vertexArray);
    gl.bindTransformFeedback(gl.TRANSFORM_FEEDBACK, state.transformFeedback);
    gl.bindBuffer(gl.TRANSFORM_FEEDBACK_BUFFER, state.transformFeedbackBuffer);
    gl.bindBuffer(gl.ARRAY_BUFFER, state.arrayBuffer);
    gl.bindTexture(gl.TEXTURE_2D, state.texture2d);
    const textureUnitIndex = state.activeTexture - gl.TEXTURE0;
    gl.bindSampler(textureUnitIndex, state.sampler);
    if (state.rasterizerDiscard) gl.enable(gl.RASTERIZER_DISCARD);
    else gl.disable(gl.RASTERIZER_DISCARD);
}

/** @param {Record<string, any>} before @param {Record<string, any>} after */
function compareMutatedGlState(before, after) {
    const differences = [];
    for (const key of Object.keys(before)) {
        if (!Object.is(before[key], after[key])) differences.push(key);
    }
    return differences;
}

/** @param {any} renderer @param {WebGL2RenderingContext} gl */
function captureRendererState(renderer, gl) {
    if (renderer === undefined || renderer === null) return null;
    if (typeof renderer.getContext !== 'function'
        || typeof renderer.getRenderTarget !== 'function') {
        throw new NativeShadowDepthCaptureError(
            'INVALID_RENDERER',
            'renderer must expose getContext() and getRenderTarget()'
        );
    }
    if (renderer.getContext() !== gl) {
        throw new NativeShadowDepthCaptureError(
            'RENDERER_CONTEXT_MISMATCH',
            'renderer does not own the supplied WebGL2 context'
        );
    }
    return {
        activeCubeFace: typeof renderer.getActiveCubeFace === 'function'
            ? renderer.getActiveCubeFace()
            : undefined,
        activeMipmapLevel: typeof renderer.getActiveMipmapLevel === 'function'
            ? renderer.getActiveMipmapLevel()
            : undefined,
        autoClear: renderer.autoClear,
        autoClearColor: renderer.autoClearColor,
        autoClearDepth: renderer.autoClearDepth,
        autoClearStencil: renderer.autoClearStencil,
        localClippingEnabled: renderer.localClippingEnabled,
        outputColorSpace: renderer.outputColorSpace,
        renderTarget: renderer.getRenderTarget(),
        shadowMapAutoUpdate: renderer.shadowMap?.autoUpdate,
        shadowMapEnabled: renderer.shadowMap?.enabled,
        shadowMapNeedsUpdate: renderer.shadowMap?.needsUpdate,
        shadowMapType: renderer.shadowMap?.type,
        sortObjects: renderer.sortObjects,
        toneMapping: renderer.toneMapping,
        toneMappingExposure: renderer.toneMappingExposure,
        xrEnabled: renderer.xr?.enabled
    };
}

/** @param {Record<string, any> | null} before @param {Record<string, any> | null} after */
function compareRendererState(before, after) {
    if (before === null && after === null) return [];
    if (before === null || after === null) return ['renderer'];
    const differences = [];
    for (const key of Object.keys(before)) {
        if (!Object.is(before[key], after[key])) differences.push(key);
    }
    return differences;
}

/**
 * @param {WebGL2RenderingContext} gl
 * @param {{
 *   captureBuffer: WebGLBuffer | null,
 *   dummyVertexBuffer: WebGLBuffer | null,
 *   program: WebGLProgram | null,
 *   sampler: WebGLSampler | null,
 *   transformFeedback: WebGLTransformFeedback | null,
 *   vertexArray: WebGLVertexArrayObject | null
 * }} resources
 */
function deleteCaptureResources(gl, resources) {
    if (resources.transformFeedback) gl.deleteTransformFeedback(resources.transformFeedback);
    if (resources.vertexArray) gl.deleteVertexArray(resources.vertexArray);
    if (resources.captureBuffer) gl.deleteBuffer(resources.captureBuffer);
    if (resources.dummyVertexBuffer) gl.deleteBuffer(resources.dummyVertexBuffer);
    if (resources.sampler) gl.deleteSampler(resources.sampler);
    if (resources.program) gl.deleteProgram(resources.program);
}

/** @param {WebGL2RenderingContext} gl */
function captureImplementationDiagnostics(gl) {
    const debugRendererInfo = gl.getExtension('WEBGL_debug_renderer_info');
    return freezeDeep({
        renderer: gl.getParameter(gl.RENDERER),
        shadingLanguageVersion: gl.getParameter(gl.SHADING_LANGUAGE_VERSION),
        unmaskedRenderer: debugRendererInfo
            ? gl.getParameter(debugRendererInfo.UNMASKED_RENDERER_WEBGL)
            : null,
        unmaskedVendor: debugRendererInfo
            ? gl.getParameter(debugRendererInfo.UNMASKED_VENDOR_WEBGL)
            : null,
        vendor: gl.getParameter(gl.VENDOR),
        version: gl.getParameter(gl.VERSION)
    });
}

/**
 * @param {unknown} error
 * @param {string} stage
 * @param {WebGL2RenderingContext} gl
 * @param {string | null} label
 */
function normalizeCaptureError(error, stage, gl, label) {
    if (error instanceof NativeShadowDepthCaptureError) return error;
    return new NativeShadowDepthCaptureError(
        'CAPTURE_FAILED',
        `Native depth capture failed during ${stage}`,
        {
            glErrors: describeGlErrors(gl, takeGlErrors(gl)),
            label,
            stage
        },
        error
    );
}

/** @param {WebGL2RenderingContext} gl @param {string} stage @param {string | null} label */
function assertNoGlErrors(gl, stage, label) {
    const errors = takeGlErrors(gl);
    if (errors.length > 0) {
        throw new NativeShadowDepthCaptureError(
            'GL_OPERATION_FAILED',
            `WebGL reported an error during ${stage}`,
            {glErrors: describeGlErrors(gl, errors), label, stage}
        );
    }
}

/** @param {WebGL2RenderingContext} gl */
function takeGlErrors(gl) {
    const errors = [];
    for (let index = 0; index < 32; index += 1) {
        const error = gl.getError();
        if (error === gl.NO_ERROR) break;
        errors.push(error);
    }
    return errors;
}

/** @param {WebGL2RenderingContext} gl @param {number[]} errors */
function describeGlErrors(gl, errors) {
    const names = new Map([
        [gl.INVALID_ENUM, 'INVALID_ENUM'],
        [gl.INVALID_VALUE, 'INVALID_VALUE'],
        [gl.INVALID_OPERATION, 'INVALID_OPERATION'],
        [gl.INVALID_FRAMEBUFFER_OPERATION, 'INVALID_FRAMEBUFFER_OPERATION'],
        [gl.OUT_OF_MEMORY, 'OUT_OF_MEMORY'],
        [gl.CONTEXT_LOST_WEBGL, 'CONTEXT_LOST_WEBGL']
    ]);
    return errors.map((error) => `${names.get(error) ?? 'UNKNOWN'}(${error})`);
}

/** @param {unknown} value */
function requireWebGl2Context(value) {
    const requiredMethods = [
        'bindSampler',
        'createSampler',
        'createTransformFeedback',
        'drawArraysInstanced',
        'getBufferSubData',
        'getIndexedParameter',
        'texStorage2D',
        'transformFeedbackVaryings'
    ];
    if (!value || typeof value !== 'object'
        || requiredMethods.some((name) => typeof value[name] !== 'function')) {
        throw new NativeShadowDepthCaptureError(
            'UNSUPPORTED_WEBGL2',
            'Native depth capture requires a WebGL2RenderingContext'
        );
    }
    return /** @type {WebGL2RenderingContext} */ (value);
}

/** @template T @param {T | null} value @param {string} label @param {string | null} captureLabel */
function requireCreatedResource(value, label, captureLabel) {
    if (value === null) {
        throw new NativeShadowDepthCaptureError(
            'RESOURCE_CREATION_FAILED',
            `WebGL failed to create native depth capture ${label}`,
            {label: captureLabel, resource: label}
        );
    }
    return value;
}

/** @param {unknown} value @param {string} label */
function requireObject(value, label) {
    if (!value || typeof value !== 'object') {
        throw new TypeError(`${label} must be a WebGL object`);
    }
    return value;
}

/** @param {unknown} value @param {string} label */
function requirePositiveSafeInteger(value, label) {
    if (!Number.isSafeInteger(value) || Number(value) <= 0) {
        throw new TypeError(`${label} must be a positive safe integer`);
    }
    return Number(value);
}

/** @param {unknown} value @param {string} label */
function requireNonNegativeSafeInteger(value, label) {
    if (!Number.isSafeInteger(value) || Number(value) < 0) {
        throw new TypeError(`${label} must be a non-negative safe integer`);
    }
    return Number(value);
}

/** @param {unknown} value @param {string} label */
function requireNonEmptyString(value, label) {
    if (typeof value !== 'string' || value.trim() === '') {
        throw new TypeError(`${label} must be a non-empty string`);
    }
    return value;
}

/** @template T @param {T} value @returns {T} */
function freezeDeep(value) {
    if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
    for (const child of Object.values(value)) freezeDeep(child);
    return Object.freeze(value);
}
