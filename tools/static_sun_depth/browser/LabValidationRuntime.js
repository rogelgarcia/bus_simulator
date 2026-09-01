// Installs the AI 531 Lab Scene browser validation runtime.
// @ts-check

import * as THREE from 'three';
import * as packageApi from '../../../src/app/illumination/package/index.js';
import * as staticSun from '../../../src/app/illumination/static_sun_depth/index.js';
import {StaticSunDepthPipeline} from '../../../src/graphics/illumination/static_sun_depth/index.js';
import {isLitMaterial} from '../../../src/graphics/lighting/SceneShadowMaterials.js';
import {createSunPointDirectionWorld} from '../src/SunPointDirection.mjs';
import {
    buildProductionStaticSunDepthChunkInputs
} from '../src/ProductionPackage.mjs';
import {unpackThreeRgbaDepthBytes} from '../src/ThreeRgbaDepthPacking.mjs';
import {
    LAB_DENSITY_PRODUCTION_PROJECTION,
    createExactRationalLatticePhaseEvidence,
    createEmptyLightDomain,
    createLiveToCacheVogelRadiusEvidence,
    findLabDensityDiagnosticCandidate,
    includeLightDomainPoint,
    unionLightDomains
} from '../src/LabFixtureDomain.mjs';
import {
    LAB_EVIDENCE_CANVAS_CLASS,
    LAB_EVIDENCE_CANVAS_ID,
    LAB_EVIDENCE_CAPTURE_ALPHA_POLICY,
    LAB_EVIDENCE_CAPTURE_DIMENSIONS_PIXELS,
    LAB_EVIDENCE_CAPTURE_ROW_TRANSFORM,
    LAB_EVIDENCE_CAPTURE_SCHEMA,
    createLabEvidenceOpaqueRgba,
    createLabEvidenceOpaqueSamples,
    extractLabEvidenceRgb,
    flipLabEvidenceRgba
} from '../src/LabEvidenceCapture.mjs';
import {
    LAB_RESIDUAL_TAP_TRACE_ID,
    traceLabResidualVogelComparisons
} from '../src/LabResidualTapTrace.mjs';
import {
    STATIC_SUN_DEPTH_CASTER_SIDEDNESS,
    describeStaticSunDepthEffectiveShadowSide,
    resolveThreeR183ShadowAlphaTest,
    THREE_BACK_SIDE,
    THREE_DOUBLE_SIDE,
    THREE_FRONT_SIDE
} from '../src/ThreeShadowSide.mjs';

export async function installLabValidationRuntime(settings) {
    const thresholds = settings?.thresholds;
    const capabilityProfileId = settings?.capabilityProfileId;
    const fixtureSchema = settings?.fixtureSchema;
    const samplingPcf = settings?.samplingPcf;
    const samplingBias = settings?.samplingBias;
    const residualTapTraceId = settings?.residualTapTrace ?? null;
    if (!thresholds || capabilityProfileId !== 'development.static_sun_v1'
        || fixtureSchema !== 'bus-sim-static-sun-depth-webgl2-lab-fixture-v1'
        || samplingPcf?.model !== 'three-r183-vogel-5-linear-compare-v1'
        || samplingPcf?.radiusTexels !== 1.5
        || samplingPcf?.sampleCount !== 5
        || samplingPcf?.screenRotation
            !== 'interleaved-gradient-noise-gl-fragcoord-v1'
        || samplingPcf?.hardwareComparison !== 'linear-four-compare-taps-v1'
        || samplingPcf?.shadowMapSizePolicy !== 'derive-exact-live-single-high-v1'
        || JSON.stringify(samplingPcf?.shadowMapWorldExtentMeters) !== '[680,680]'
        || samplingBias?.model
            !== 'geometric-normal-offset-plus-constant-depth-relief-v1'
        || samplingBias?.constantDepthReliefMeters !== 0.0697915
        || samplingBias?.geometricNormalOffsetMeters !== 0.0232
        || !(residualTapTraceId === null
            || residualTapTraceId === LAB_RESIDUAL_TAP_TRACE_ID)) {
        throw new Error('Lab validation runtime settings are invalid');
    }
    const hooks = window.__labSceneValidation;
    await hooks?.readiness;
    hooks.view.pauseForValidation();
    const engine = hooks.engine;
    const city = hooks.city;
    const renderer = engine.renderer;
    const gl = renderer.getContext();
    const dynamicBusRoot = engine.scene.getObjectByName('LabBus');
    if (!renderer.capabilities.isWebGL2) throw new Error('Lab validation requires WebGL2');
    if (THREE.FrontSide !== THREE_FRONT_SIDE
        || THREE.BackSide !== THREE_BACK_SIDE
        || THREE.DoubleSide !== THREE_DOUBLE_SIDE) {
        throw new Error('Lab validation Three side constants drifted');
    }
    if (!dynamicBusRoot || isDescendantOf(dynamicBusRoot, city.group)) {
        throw new Error('Lab validation requires the dynamic bus outside static City ownership');
    }
    engine.setViewportSize(1280, 720);
    renderer.setPixelRatio(1);
    renderer.setSize(1280, 720, false);
    engine.camera.aspect = 1280 / 720;
    engine.camera.updateProjectionMatrix();

    const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
    const hardware = {
        gpu: debugInfo
            ? gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL)
            : gl.getParameter(gl.RENDERER),
        rendererMaxTextureSize: Number(renderer.capabilities.maxTextureSize),
        rendererSize: [gl.drawingBufferWidth, gl.drawingBufferHeight],
        rendererPixelRatio: renderer.getPixelRatio(),
        webglVersion: gl.getParameter(gl.VERSION)
    };
    let pipeline = null;
    let prepared = null;
    let labPrewarmFailure = null;
    let evidenceCanvas = null;
    let evidenceContext = null;
    let evidenceCaptureState = null;
    let evidenceRevision = 0;
    const originalCasterStates = new Map();
    let activeWorkload = null;
    let currentPass = 'visible_scene';
    const originalRenderBufferDirect = renderer.renderBufferDirect;
    const originalShadowRender = renderer.shadowMap.render;
    const shaderFailures = [];
    const rendererDebug = renderer.debug;
    const ownsShaderErrorHandler = !!rendererDebug
        && Object.prototype.hasOwnProperty.call(rendererDebug, 'onShaderError');
    const originalShaderErrorHandler = rendererDebug?.onShaderError;
    if (rendererDebug) {
        rendererDebug.onShaderError = (
            context,
            program,
            vertexShader,
            fragmentShader,
            ...rest
        ) => {
            shaderFailures.push(Object.freeze({
                program: String(context.getProgramInfoLog(program) || ''),
                vertex: String(context.getShaderInfoLog(vertexShader) || ''),
                fragment: String(context.getShaderInfoLog(fragmentShader) || '')
            }));
            originalShaderErrorHandler?.(
                context,
                program,
                vertexShader,
                fragmentShader,
                ...rest
            );
        };
    }

    function counters() {
        const value = renderer.info.render;
        return {
            calls: Number(value.calls || 0),
            triangles: Number(value.triangles || 0),
            lines: Number(value.lines || 0),
            points: Number(value.points || 0)
        };
    }

    function add(target, delta) {
        for (const key of ['calls', 'triangles', 'lines', 'points']) target[key] += delta[key];
    }

    function isDescendantOf(object, ancestor) {
        for (let cursor = object; cursor; cursor = cursor.parent) {
            if (cursor === ancestor) return true;
        }
        return false;
    }

    renderer.renderBufferDirect = function ai531LabProfiledRenderBufferDirect(
        camera,
        scene,
        geometry,
        material,
        object,
        group
    ) {
        const before = counters();
        const result = originalRenderBufferDirect.call(
            this,
            camera,
            scene,
            geometry,
            material,
            object,
            group
        );
        if (activeWorkload) {
            const after = counters();
            const delta = {
                calls: after.calls - before.calls,
                triangles: after.triangles - before.triangles,
                lines: after.lines - before.lines,
                points: after.points - before.points
            };
            add(activeWorkload.total, delta);
            if (currentPass === 'shadow_maps') {
                add(activeWorkload.shadow, delta);
                if (isDescendantOf(object, city.group)) {
                    add(activeWorkload.staticCityShadow, delta);
                }
                if (isDescendantOf(object, dynamicBusRoot)) {
                    add(activeWorkload.dynamicBusShadow, delta);
                }
            }
        }
        return result;
    };
    renderer.shadowMap.render = function ai531LabProfiledShadowRender(...args) {
        const previous = currentPass;
        currentPass = 'shadow_maps';
        try {
            return originalShadowRender.apply(this, args);
        } finally {
            currentPass = previous;
        }
    };

    function freshWorkload() {
        return {
            total: {calls: 0, triangles: 0, lines: 0, points: 0},
            shadow: {calls: 0, triangles: 0, lines: 0, points: 0},
            staticCityShadow: {calls: 0, triangles: 0, lines: 0, points: 0},
            dynamicBusShadow: {calls: 0, triangles: 0, lines: 0, points: 0},
            frameMs: 0,
            promotionUse: 'not_measured_timing_contaminated'
        };
    }

    function sunDirection(profile) {
        return createSunPointDirectionWorld(profile.azimuthDeg, profile.elevationDeg);
    }

    function applyProfile(profile) {
        engine.setAtmosphereSettings({
            ...engine.atmosphereSettings,
            sun: {
                ...engine.atmosphereSettings?.sun,
                azimuthDeg: profile.azimuthDeg,
                elevationDeg: profile.elevationDeg
            }
        });
        city.update(engine);
        const expected = new THREE.Vector3(...sunDirection(profile));
        if (city.sunRef.direction.distanceTo(expected) > 1e-8) {
            throw new Error(`Lab sun direction drift for '${profile.id}'`);
        }
    }

    function applyCase(validationCase) {
        if (validationCase.cityId !== 'lab_scene' || validationCase.kind !== 'lab') {
            throw new Error(`Non-lab validation case '${validationCase.id}' reached the lab runner`);
        }
        applyProfile(validationCase.sunProfile);
        hooks.applyCameraPreset(validationCase.camera.presetId);
        hooks.view.controls?.update?.(1);
        engine.camera.updateProjectionMatrix();
        engine.camera.updateMatrixWorld(true);
    }

    function renderFrames(count) {
        for (let index = 0; index < count; index++) {
            city.update(engine);
            engine.renderFrame();
            gl.finish();
        }
    }

    function renderMeasuredFrame() {
        const workload = freshWorkload();
        const started = performance.now();
        activeWorkload = workload;
        try {
            city.update(engine);
            engine.renderFrame();
            gl.finish();
        } finally {
            activeWorkload = null;
        }
        workload.frameMs = performance.now() - started;
        return workload;
    }

    function captureRgba() {
        const width = gl.drawingBufferWidth;
        const height = gl.drawingBufferHeight;
        const pixels = new Uint8Array(width * height * 4);
        gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
        return {width, height, pixels};
    }

    function mountEvidenceCanvas() {
        if (document.getElementById(LAB_EVIDENCE_CANVAS_ID)) {
            throw new Error('Lab evidence canvas already exists');
        }
        const canvas = document.createElement('canvas');
        canvas.id = LAB_EVIDENCE_CANVAS_ID;
        canvas.className = LAB_EVIDENCE_CANVAS_CLASS;
        canvas.width = LAB_EVIDENCE_CAPTURE_DIMENSIONS_PIXELS[0];
        canvas.height = LAB_EVIDENCE_CAPTURE_DIMENSIONS_PIXELS[1];
        canvas.setAttribute('aria-hidden', 'true');
        const context = canvas.getContext('2d', {
            alpha: true,
            colorSpace: 'srgb',
            willReadFrequently: true
        });
        if (!context) throw new Error('Lab evidence canvas requires a 2D context');
        document.body.appendChild(canvas);
        evidenceCanvas = canvas;
        evidenceContext = context;
    }

    function resetEvidenceCanvas() {
        if (!evidenceCanvas?.isConnected || !evidenceContext) {
            throw new Error('Lab evidence canvas is unavailable');
        }
        evidenceContext.clearRect(0, 0, evidenceCanvas.width, evidenceCanvas.height);
        evidenceCaptureState = null;
    }

    async function publishEvidenceCapture(slot, capture) {
        if (!evidenceCanvas?.isConnected || !evidenceContext
            || capture.width !== LAB_EVIDENCE_CAPTURE_DIMENSIONS_PIXELS[0]
            || capture.height !== LAB_EVIDENCE_CAPTURE_DIMENSIONS_PIXELS[1]) {
            throw new Error(`Lab '${slot}' evidence capture dimensions or lifecycle are invalid`);
        }
        const flipped = flipLabEvidenceRgba(capture.pixels, capture.width, capture.height);
        const authoritativeRgbaSha256 = await packageApi.rawSha256Hex(flipped);
        const authoritativeRgb = extractLabEvidenceRgb(
            flipped,
            capture.width,
            capture.height
        );
        const authoritativeRgbSha256 = await packageApi.rawSha256Hex(authoritativeRgb);
        const opaque = createLabEvidenceOpaqueRgba(
            flipped,
            capture.width,
            capture.height
        );
        const opaqueRgbSha256 = await packageApi.rawSha256Hex(
            extractLabEvidenceRgb(opaque, capture.width, capture.height)
        );
        if (opaqueRgbSha256 !== authoritativeRgbSha256) {
            throw new Error(`Lab '${slot}' evidence alpha policy changed authoritative RGB`);
        }
        evidenceContext.putImageData(
            new ImageData(opaque, capture.width, capture.height),
            0,
            0
        );
        const canvasPixels = evidenceContext.getImageData(
            0,
            0,
            capture.width,
            capture.height
        ).data;
        const expectedSha256 = await packageApi.rawSha256Hex(opaque);
        const evidenceRgbaSha256 = await packageApi.rawSha256Hex(canvasPixels);
        const evidenceRgbSha256 = await packageApi.rawSha256Hex(
            extractLabEvidenceRgb(canvasPixels, capture.width, capture.height)
        );
        if (evidenceRgbaSha256 !== expectedSha256
            || evidenceRgbSha256 !== authoritativeRgbSha256) {
            throw new Error(`Lab '${slot}' evidence canvas changed canonical RGB bytes`);
        }
        evidenceRevision += 1;
        evidenceCaptureState = Object.freeze({
            alphaPolicy: LAB_EVIDENCE_CAPTURE_ALPHA_POLICY,
            authoritativeRgbSha256,
            authoritativeRgbaSha256,
            canvasId: LAB_EVIDENCE_CANVAS_ID,
            dimensionsPixels: LAB_EVIDENCE_CAPTURE_DIMENSIONS_PIXELS,
            evidenceRgbaSha256,
            evidenceSamples: createLabEvidenceOpaqueSamples(
                capture.pixels,
                capture.width,
                capture.height
            ),
            revision: evidenceRevision,
            rowTransform: LAB_EVIDENCE_CAPTURE_ROW_TRANSFORM,
            schema: LAB_EVIDENCE_CAPTURE_SCHEMA,
            slot
        });
        return evidenceCaptureState;
    }

    function getEvidenceCanvasState() {
        if (!evidenceCanvas?.isConnected) throw new Error('Lab evidence canvas was released');
        return evidenceCaptureState;
    }

    function releaseEvidenceCanvas() {
        evidenceCanvas?.remove();
        evidenceCanvas = null;
        evidenceContext = null;
        evidenceCaptureState = null;
    }

    function openCaptureDatabase() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open('ai531-lab-validation-v1', 1);
            request.onupgradeneeded = () => {
                if (!request.result.objectStoreNames.contains('currentRgba')) {
                    request.result.createObjectStore('currentRgba');
                }
            };
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    async function withStore(mode, operation) {
        const db = await openCaptureDatabase();
        try {
            return await new Promise((resolve, reject) => {
                const transaction = db.transaction('currentRgba', mode);
                const request = operation(transaction.objectStore('currentRgba'));
                transaction.oncomplete = () => resolve(request?.result);
                transaction.onerror = () => reject(transaction.error);
                transaction.onabort = () => reject(transaction.error);
            });
        } finally {
            db.close();
        }
    }

    const putCurrent = (caseId, capture, receiverMask) => withStore('readwrite', (store) => store.put({
        width: capture.width,
        height: capture.height,
        pixels: capture.pixels.buffer,
        receiverMaskPixels: receiverMask.pixels.buffer,
        receiverMaskPixelCount: receiverMask.receiverPixelCount,
        receiverMaskMethod: receiverMask.method
    }, caseId));
    const getCurrent = (caseId) => withStore('readonly', (store) => store.get(caseId));
    const putCache = async (caseId, capture) => {
        const current = await getCurrent(caseId);
        if (!current?.pixels) {
            throw new Error(`Missing same-session Lab current RGBA for '${caseId}'`);
        }
        return withStore('readwrite', (store) => store.put({
            ...current,
            cacheWidth: capture.width,
            cacheHeight: capture.height,
            cachePixels: capture.pixels.buffer
        }, caseId));
    };
    const deleteCurrent = (caseId) => withStore('readwrite', (store) => store.delete(caseId));
    const clearCurrents = () => withStore('readwrite', (store) => store.clear());

    function compareRgba(current, cache, seam, receiverMask, missingOccluderSamples) {
        if (current.width !== cache.width || current.height !== cache.height
            || current.width !== seam.width || current.height !== seam.height
            || current.width !== receiverMask.width || current.height !== receiverMask.height) {
            throw new Error('Lab current, cache, seam, and receiver-mask captures have different dimensions');
        }
        const width = current.width;
        const height = current.height;
        const pixelCount = width * height;
        const currentLuma = new Float32Array(pixelCount);
        const horizontalMax = new Float32Array(pixelCount);
        const neighborhoodMax = new Float32Array(pixelCount);
        let absoluteRgbError = 0;
        let maxRgbErrorByte = 0;
        let pixelsOverFourByte = 0;
        let dynamicReceiverPixelCount = 0;
        for (let pixel = 0; pixel < pixelCount; pixel++) {
            const offset = pixel * 4;
            currentLuma[pixel] = current.pixels[offset] * 0.2126
                + current.pixels[offset + 1] * 0.7152
                + current.pixels[offset + 2] * 0.0722;
            if (receiverMask.pixels[pixel] !== 0) {
                dynamicReceiverPixelCount++;
                continue;
            }
            let maximum = 0;
            for (let channel = 0; channel < 3; channel++) {
                const difference = Math.abs(
                    current.pixels[offset + channel] - cache.pixels[offset + channel]
                );
                absoluteRgbError += difference;
                maximum = Math.max(maximum, difference);
                maxRgbErrorByte = Math.max(maxRgbErrorByte, difference);
            }
            if (maximum > 4) pixelsOverFourByte++;
        }
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const index = y * width + x;
                horizontalMax[index] = Math.max(
                    receiverMask.pixels[y * width + Math.max(0, x - 1)] === 0
                        ? currentLuma[y * width + Math.max(0, x - 1)] : -1,
                    receiverMask.pixels[index] === 0 ? currentLuma[index] : -1,
                    receiverMask.pixels[y * width + Math.min(width - 1, x + 1)] === 0
                        ? currentLuma[y * width + Math.min(width - 1, x + 1)] : -1
                );
            }
        }
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const index = y * width + x;
                neighborhoodMax[index] = Math.max(
                    horizontalMax[Math.max(0, y - 1) * width + x],
                    horizontalMax[index],
                    horizontalMax[Math.min(height - 1, y + 1) * width + x]
                );
                if (neighborhoodMax[index] < 0) neighborhoodMax[index] = currentLuma[index];
            }
        }
        const seamError = new Uint8Array(pixelCount);
        let missingOccluderPixelCount = 0;
        let seamPixelCount = 0;
        let seamErrorPixelCount = 0;
        let seamFalseLitPixelCount = 0;
        for (let pixel = 0; pixel < pixelCount; pixel++) {
            if (receiverMask.pixels[pixel] !== 0) continue;
            const offset = pixel * 4;
            const cacheLuma = cache.pixels[offset] * 0.2126
                + cache.pixels[offset + 1] * 0.7152
                + cache.pixels[offset + 2] * 0.0722;
            const falseLit = cacheLuma
                > neighborhoodMax[pixel] + thresholds.falseLitToleranceByte;
            if (falseLit) {
                missingOccluderPixelCount++;
                if (missingOccluderSamples.length < 16) {
                    const x = pixel % width;
                    const y = Math.floor(pixel / width);
                    let dynamicReceiverNeighborhoodPixelCount = 0;
                    for (let offsetY = -1; offsetY <= 1; offsetY++) {
                        for (let offsetX = -1; offsetX <= 1; offsetX++) {
                            const neighborX = Math.max(0, Math.min(width - 1, x + offsetX));
                            const neighborY = Math.max(0, Math.min(height - 1, y + offsetY));
                            dynamicReceiverNeighborhoodPixelCount +=
                                receiverMask.pixels[neighborY * width + neighborX] !== 0 ? 1 : 0;
                        }
                    }
                    missingOccluderSamples.push({
                        pixel: [x, y],
                        cacheLuma,
                        cacheRgba: Array.from(cache.pixels.slice(offset, offset + 4)),
                        currentRgba: Array.from(current.pixels.slice(offset, offset + 4)),
                        currentNeighborhoodMaximumLuma: neighborhoodMax[pixel],
                        currentNeighborhoodRgba: Array.from({length: 9}, (_, neighborhoodIndex) => {
                            const neighborX = Math.max(
                                0,
                                Math.min(width - 1, x + neighborhoodIndex % 3 - 1)
                            );
                            const neighborY = Math.max(
                                0,
                                Math.min(height - 1, y + Math.floor(neighborhoodIndex / 3) - 1)
                            );
                            const neighborOffset = (neighborY * width + neighborX) * 4;
                            return Array.from(current.pixels.slice(
                                neighborOffset,
                                neighborOffset + 4
                            ));
                        }),
                        dynamicReceiverNeighborhoodPixelCount
                    });
                }
            }
            const onSeam = seam.pixels[offset] > seam.pixels[offset + 2] + 32;
            if (!onSeam) continue;
            seamPixelCount++;
            const maximum = Math.max(
                Math.abs(current.pixels[offset] - cache.pixels[offset]),
                Math.abs(current.pixels[offset + 1] - cache.pixels[offset + 1]),
                Math.abs(current.pixels[offset + 2] - cache.pixels[offset + 2])
            );
            if (maximum > thresholds.seamErrorToleranceByte) {
                seamError[pixel] = 1;
                seamErrorPixelCount++;
            }
            if (falseLit) seamFalseLitPixelCount++;
        }
        let maxContinuousSeamRunPixels = 0;
        for (let y = 0; y < height; y++) {
            let run = 0;
            for (let x = 0; x < width; x++) {
                run = seamError[y * width + x] ? run + 1 : 0;
                maxContinuousSeamRunPixels = Math.max(maxContinuousSeamRunPixels, run);
            }
        }
        for (let x = 0; x < width; x++) {
            let run = 0;
            for (let y = 0; y < height; y++) {
                run = seamError[y * width + x] ? run + 1 : 0;
                maxContinuousSeamRunPixels = Math.max(maxContinuousSeamRunPixels, run);
            }
        }
        const evaluatedPixelCount = pixelCount - dynamicReceiverPixelCount;
        return {
            width,
            height,
            pixelCount,
            evaluatedPixelCount,
            dynamicReceiverPixelCount,
            dynamicReceiverMaskMethod: receiverMask.method,
            meanRgbErrorByte: absoluteRgbError / (evaluatedPixelCount * 3),
            maxRgbErrorByte,
            pixelsOverFourByte,
            pixelsOverFourBytePercent: pixelsOverFourByte / evaluatedPixelCount * 100,
            missingOccluderPixelCount,
            seamPixelCount,
            seamErrorPixelCount,
            seamFalseLitPixelCount,
            maxContinuousSeamRunPixels,
            falseLitMethod: 'cache_luma_gt_current_unmasked_3x3_max_plus_4_bytes_v2',
            seamMaskMethod: 'static_sun_depth_seam_debug_red_gt_blue_plus_32_v1'
        };
    }

    function createBusIdMaterial(sourceMaterial, color) {
        const source = sourceMaterial || {};
        return new THREE.MeshBasicMaterial({
            alphaTest: Number(source.alphaTest || 0),
            color,
            depthTest: source.depthTest !== false,
            depthWrite: source.depthWrite !== false,
            opacity: 1,
            side: source.side ?? THREE.FrontSide,
            transparent: false
        });
    }

    function captureDynamicBusReceiverMask() {
        const meshes = [];
        dynamicBusRoot.traverse((node) => {
            if (node?.isMesh && node.visible !== false) meshes.push(node);
        });
        if (meshes.length === 0) throw new Error('Lab dynamic bus has no visible receiver meshes');
        const replacements = [];
        const renderId = (color) => {
            for (const mesh of meshes) {
                const originalMaterial = mesh.material;
                const sources = Array.isArray(originalMaterial)
                    ? originalMaterial : [originalMaterial];
                const materials = sources.map((source) => createBusIdMaterial(source, color));
                replacements.push([mesh, originalMaterial, materials]);
                mesh.material = Array.isArray(originalMaterial) ? materials : materials[0];
            }
            renderFrames(1);
            const capture = captureRgba();
            for (const [mesh, originalMaterial, materials] of replacements.splice(0)) {
                mesh.material = originalMaterial;
                for (const material of materials) material.dispose();
            }
            return capture;
        };
        let black;
        let white;
        try {
            black = renderId(0x000000);
            white = renderId(0xffffff);
        } finally {
            for (const [mesh, originalMaterial, materials] of replacements.splice(0)) {
                mesh.material = originalMaterial;
                for (const material of materials) material.dispose();
            }
            renderFrames(1);
        }
        const pixelCount = black.width * black.height;
        const pixels = new Uint8Array(pixelCount);
        let receiverPixelCount = 0;
        for (let pixel = 0; pixel < pixelCount; pixel++) {
            const offset = pixel * 4;
            const difference = Math.max(
                Math.abs(white.pixels[offset] - black.pixels[offset]),
                Math.abs(white.pixels[offset + 1] - black.pixels[offset + 1]),
                Math.abs(white.pixels[offset + 2] - black.pixels[offset + 2])
            );
            if (difference === 0) continue;
            pixels[pixel] = 1;
            receiverPixelCount++;
        }
        return {
            width: black.width,
            height: black.height,
            pixels,
            receiverPixelCount,
            method: 'dynamic_bus_black_white_material_id_difference_v1'
        };
    }

    function proveDynamicBusLiveShadow(receiverMask) {
        const busBounds = new THREE.Box3().setFromObject(dynamicBusRoot);
        const busCenter = busBounds.getCenter(new THREE.Vector3());
        const sun = city.sunRef.direction.clone().normalize();
        const busHeight = busBounds.max.y - busBounds.min.y;
        const shadowDistance = busHeight * 0.5 / Math.max(sun.y, 0.01);
        const proofGeometry = new THREE.PlaneGeometry(24, 24);
        const proofMaterial = new THREE.MeshStandardMaterial({
            color: 0xb8b8b8,
            metalness: 0,
            roughness: 1,
            side: THREE.DoubleSide
        });
        const proofReceiver = new THREE.Mesh(proofGeometry, proofMaterial);
        proofReceiver.name = 'AI531DynamicBusStaticGroundProofReceiver';
        proofReceiver.rotation.x = -Math.PI * 0.5;
        proofReceiver.position.set(
            busCenter.x - sun.x * shadowDistance,
            busBounds.min.y + 0.03,
            busCenter.z - sun.z * shadowDistance
        );
        proofReceiver.castShadow = false;
        proofReceiver.receiveShadow = true;
        city.group.add(proofReceiver);
        const casterStates = [];
        let withBusCaster;
        let withoutBusCaster;
        let proofMask;
        try {
            const originalMaterial = proofReceiver.material;
            proofReceiver.material = createBusIdMaterial(originalMaterial, 0x000000);
            renderFrames(1);
            const black = captureRgba();
            proofReceiver.material.dispose();
            proofReceiver.material = createBusIdMaterial(originalMaterial, 0xffffff);
            renderFrames(1);
            const white = captureRgba();
            proofReceiver.material.dispose();
            proofReceiver.material = originalMaterial;
            proofMask = new Uint8Array(black.width * black.height);
            for (let pixel = 0; pixel < proofMask.length; pixel++) {
                const offset = pixel * 4;
                if (Math.max(
                    Math.abs(white.pixels[offset] - black.pixels[offset]),
                    Math.abs(white.pixels[offset + 1] - black.pixels[offset + 1]),
                    Math.abs(white.pixels[offset + 2] - black.pixels[offset + 2])
                ) > 0) proofMask[pixel] = 1;
            }
            renderFrames(2);
            withBusCaster = captureRgba();
            dynamicBusRoot.traverse((node) => {
                if (!node?.isMesh) return;
                casterStates.push([node, node.castShadow]);
                node.castShadow = false;
            });
            renderFrames(2);
            withoutBusCaster = captureRgba();
        } finally {
            for (const [mesh, castShadow] of casterStates) mesh.castShadow = castShadow;
            proofReceiver.removeFromParent();
            proofGeometry.dispose();
            proofMaterial.dispose();
            renderFrames(2);
        }
        let darkerStaticPixelCount = 0;
        let maximumLumaDeltaByte = 0;
        let strongestPixel = null;
        for (let pixel = 0; pixel < withBusCaster.width * withBusCaster.height; pixel++) {
            if (proofMask[pixel] === 0 || receiverMask.pixels[pixel] !== 0) continue;
            const offset = pixel * 4;
            const withLuma = withBusCaster.pixels[offset] * 0.2126
                + withBusCaster.pixels[offset + 1] * 0.7152
                + withBusCaster.pixels[offset + 2] * 0.0722;
            const withoutLuma = withoutBusCaster.pixels[offset] * 0.2126
                + withoutBusCaster.pixels[offset + 1] * 0.7152
                + withoutBusCaster.pixels[offset + 2] * 0.0722;
            const delta = withoutLuma - withLuma;
            if (delta > maximumLumaDeltaByte) {
                maximumLumaDeltaByte = delta;
                strongestPixel = [pixel % withBusCaster.width, Math.floor(pixel / withBusCaster.width)];
            }
            if (delta > thresholds.falseLitToleranceByte) darkerStaticPixelCount++;
        }
        const staticGroundSample = strongestPixel ? {
            objectName: proofReceiver.name,
            pixel: strongestPixel,
            world: proofReceiver.position.toArray(),
            worldNormal: [0, 1, 0],
            lumaDeltaByte: maximumLumaDeltaByte
        } : null;
        return {
            passed: darkerStaticPixelCount > 0
                && maximumLumaDeltaByte > thresholds.falseLitToleranceByte,
            method: 'bus_cast_shadow_on_minus_off_exact_temporary_static_horizontal_city_receiver_v1',
            receiverMaskMethod: receiverMask.method,
            toleranceByte: thresholds.falseLitToleranceByte,
            darkerStaticPixelCount,
            maximumLumaDeltaByte,
            staticGroundSample
        };
    }

    async function hashJson(value) {
        return packageApi.rawSha256Hex(new TextEncoder().encode(JSON.stringify(value)));
    }

    function isDescendantOf(object, ancestor) {
        for (let cursor = object; cursor; cursor = cursor.parent) {
            if (cursor === ancestor) return true;
        }
        return false;
    }

    function createLabDepthMaterial(sourceMaterial, mode) {
        const source = sourceMaterial || {};
        if (mode !== 'receiver' && mode !== 'shadowCaster') {
            throw new Error(`Unsupported Lab depth material mode '${String(mode)}'`);
        }
        const depthMaterial = new THREE.MeshDepthMaterial({
            alphaMap: source.alphaMap || null,
            alphaTest: resolveThreeR183ShadowAlphaTest(
                source.alphaTest,
                source.alphaToCoverage
            ),
            depthPacking: THREE.RGBADepthPacking,
            displacementBias: Number(source.displacementBias || 0),
            displacementMap: source.displacementMap || null,
            displacementScale: Number(source.displacementScale ?? 1),
            map: source.map || null,
            side: mode === 'receiver'
                ? (source.side ?? THREE.FrontSide)
                : describeStaticSunDepthEffectiveShadowSide({
                    side: source.side ?? THREE.FrontSide,
                    shadowSide: city.getStaticSunDepthAuthoredMaterialShadowSide?.(source)
                        ?? source.shadowSide ?? null,
                    preserveShadowSide: source.userData?.preserveShadowSide === true,
                    isFoliage: source.userData?.isFoliage === true
                }, STATIC_SUN_DEPTH_CASTER_SIDEDNESS).effectiveShadowSide
        });
        depthMaterial.name = `AI531LabDepth:${mode}:${String(source.name || source.type || 'material')}`;
        depthMaterial.blending = THREE.NoBlending;
        depthMaterial.visible = source.visible !== false;
        depthMaterial.clipShadows = source.clipShadows === true;
        depthMaterial.clippingPlanes = source.clippingPlanes || null;
        depthMaterial.clipIntersection = source.clipIntersection === true;
        depthMaterial.wireframe = source.wireframe === true;
        depthMaterial.wireframeLinewidth = Number(source.wireframeLinewidth ?? 1);
        depthMaterial.linewidth = Number(source.linewidth ?? 1);
        return depthMaterial;
    }

    function supportedReceiverMaterialSlots(node) {
        const sources = Array.isArray(node?.material) ? node.material : [node?.material];
        return sources.map((material) => (
            node?.receiveShadow === true
            && material?.visible !== false
            && isLitMaterial(material)
            && material?.isMeshToonMaterial !== true
        ));
    }

    function objectWorldBounds(node) {
        let localBounds = null;
        if (node?.isInstancedMesh) {
            node.computeBoundingBox?.();
            localBounds = node.boundingBox ?? null;
        } else {
            node?.geometry?.computeBoundingBox?.();
            localBounds = node?.geometry?.boundingBox ?? null;
        }
        if (!localBounds) return null;
        const worldBounds = localBounds.clone().applyMatrix4(node.matrixWorld);
        return worldBounds.isEmpty() ? null : worldBounds;
    }

    function includeWorldBoundsInLightDomain(domain, worldBounds, basis) {
        for (const x of [worldBounds.min.x, worldBounds.max.x]) {
            for (const y of [worldBounds.min.y, worldBounds.max.y]) {
                for (const z of [worldBounds.min.z, worldBounds.max.z]) {
                    includeLightDomainPoint(domain, [
                        x * basis.rightAxisWorld[0]
                            + y * basis.rightAxisWorld[1]
                            + z * basis.rightAxisWorld[2],
                        x * basis.upAxisWorld[0]
                            + y * basis.upAxisWorld[1]
                            + z * basis.upAxisWorld[2],
                        x * basis.depthAxisWorld[0]
                            + y * basis.depthAxisWorld[1]
                            + z * basis.depthAxisWorld[2]
                    ]);
                }
            }
        }
        return domain;
    }

    function collectAllStaticReceiverDomainLight(basis) {
        const domain = createEmptyLightDomain();
        let eligibleMeshCount = 0;
        let eligibleMaterialSlotCount = 0;
        city.group.traverse((node) => {
            if (!node?.isMesh || node.visible === false) return;
            const slots = supportedReceiverMaterialSlots(node);
            if (!slots.some(Boolean)) return;
            const worldBounds = objectWorldBounds(node);
            if (!worldBounds) return;
            includeWorldBoundsInLightDomain(domain, worldBounds, basis);
            eligibleMeshCount++;
            eligibleMaterialSlotCount += slots.filter(Boolean).length;
        });
        if (eligibleMeshCount < 1) {
            throw new Error('Lab fixture has no eligible static city receivers');
        }
        return {domain, eligibleMeshCount, eligibleMaterialSlotCount};
    }

    function clearPreexistingWebGlErrors() {
        for (let attempt = 0; attempt < 32; attempt++) {
            if (gl.getError() === gl.NO_ERROR) return;
        }
        throw new Error('WebGL2 Lab context retained errors after 32 reads');
    }

    function captureVisibleStaticReceiverBoundsLight(basis) {
        const width = gl.drawingBufferWidth;
        const height = gl.drawingBufferHeight;
        const target = new THREE.WebGLRenderTarget(width, height, {
            depthBuffer: true,
            format: THREE.RGBAFormat,
            magFilter: THREE.NearestFilter,
            minFilter: THREE.NearestFilter,
            stencilBuffer: false,
            type: THREE.UnsignedByteType
        });
        target.texture.colorSpace = THREE.NoColorSpace;
        target.texture.generateMipmaps = false;
        const nodeStates = [];
        const materialStates = [];
        const previousTarget = renderer.getRenderTarget();
        const previousShadowEnabled = renderer.shadowMap.enabled;
        const previousClearColor = renderer.getClearColor(new THREE.Color()).clone();
        const previousClearAlpha = renderer.getClearAlpha();
        const readback = new Uint8Array(width * height * 4);
        const eligibleReceiverBoundsLightMeters = createEmptyLightDomain();
        let eligibleMeshCount = 0;
        let eligibleMaterialSlotCount = 0;
        try {
            engine.scene.traverse((node) => {
                if (!node?.isMesh) return;
                nodeStates.push([node, node.visible]);
                const inStaticCity = isDescendantOf(node, city.group);
                const originalMaterial = node.material;
                const sources = Array.isArray(originalMaterial)
                    ? originalMaterial : [originalMaterial];
                const eligibleSlots = supportedReceiverMaterialSlots(node);
                node.visible = node.visible !== false
                    && inStaticCity
                    && eligibleSlots.some(Boolean);
                if (!node.visible) return;
                eligibleMeshCount++;
                eligibleMaterialSlotCount += eligibleSlots.filter(Boolean).length;
                const worldBounds = objectWorldBounds(node);
                if (worldBounds) {
                    includeWorldBoundsInLightDomain(
                        eligibleReceiverBoundsLightMeters,
                        worldBounds,
                        basis
                    );
                }
                const replacements = sources.map((source, index) => {
                    if (eligibleSlots[index]) return createLabDepthMaterial(source, 'receiver');
                    const hidden = new THREE.MeshBasicMaterial();
                    hidden.name = 'AI531LabDepthUnsupportedReceiverSlot';
                    hidden.visible = false;
                    return hidden;
                });
                materialStates.push([node, originalMaterial, replacements]);
                node.material = Array.isArray(originalMaterial)
                    ? replacements : replacements[0];
            });
            renderer.shadowMap.enabled = false;
            renderer.setClearColor(0xffffff, 1);
            clearPreexistingWebGlErrors();
            renderer.setRenderTarget(target);
            renderer.clear(true, true, true);
            renderer.render(engine.scene, engine.camera);
            gl.finish();
            renderer.readRenderTargetPixels(target, 0, 0, width, height, readback);
            const errorCode = gl.getError();
            if (errorCode !== gl.NO_ERROR) {
                throw new Error(
                    `WebGL2 visible-receiver depth readback failed with error ${errorCode}`
                );
            }
        } finally {
            renderer.setRenderTarget(previousTarget);
            renderer.shadowMap.enabled = previousShadowEnabled;
            renderer.setClearColor(previousClearColor, previousClearAlpha);
            for (const [node, originalMaterial, replacements] of materialStates) {
                node.material = originalMaterial;
                for (const material of replacements) material.dispose();
            }
            for (const [node, visible] of nodeStates) node.visible = visible;
            target.dispose();
        }
        const minimum = [Infinity, Infinity, Infinity];
        const maximum = [-Infinity, -Infinity, -Infinity];
        const world = new THREE.Vector3();
        let receiverPixelCount = 0;
        let minimumDecodedDepth = Infinity;
        let maximumDecodedDepth = -Infinity;
        const decodedDepthSamples = [];
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const offset = (y * width + x) * 4;
                const depth = unpackThreeRgbaDepthBytes(readback, offset);
                if (depth >= 1 - 1e-7) continue;
                minimumDecodedDepth = Math.min(minimumDecodedDepth, depth);
                maximumDecodedDepth = Math.max(maximumDecodedDepth, depth);
                if (decodedDepthSamples.length < 8) {
                    decodedDepthSamples.push({
                        pixel: [x, y],
                        rgba: Array.from(readback.subarray(offset, offset + 4)),
                        decodedDepth: depth
                    });
                }
                world.set(
                    (x + 0.5) / width * 2 - 1,
                    (y + 0.5) / height * 2 - 1,
                    depth * 2 - 1
                ).unproject(engine.camera);
                const lightX = world.x * basis.rightAxisWorld[0]
                    + world.y * basis.rightAxisWorld[1]
                    + world.z * basis.rightAxisWorld[2];
                const lightY = world.x * basis.upAxisWorld[0]
                    + world.y * basis.upAxisWorld[1]
                    + world.z * basis.upAxisWorld[2];
                const lightDepth = world.x * basis.depthAxisWorld[0]
                    + world.y * basis.depthAxisWorld[1]
                    + world.z * basis.depthAxisWorld[2];
                minimum[0] = Math.min(minimum[0], lightX);
                minimum[1] = Math.min(minimum[1], lightY);
                minimum[2] = Math.min(minimum[2], lightDepth);
                maximum[0] = Math.max(maximum[0], lightX);
                maximum[1] = Math.max(maximum[1], lightY);
                maximum[2] = Math.max(maximum[2], lightDepth);
                receiverPixelCount++;
            }
        }
        if (receiverPixelCount < 1 || !minimum.every(Number.isFinite)
            || !maximum.every(Number.isFinite)
            || !eligibleReceiverBoundsLightMeters.min.every(Number.isFinite)
            || !eligibleReceiverBoundsLightMeters.max.every(Number.isFinite)) {
            throw new Error('Lab density diagnostic found no visible static receivers');
        }
        return {
            method:
                'static_city_receive_shadow_supported_visible_material_packed_camera_depth_unproject_xyz_v2',
            eligibleMeshCount,
            eligibleMaterialSlotCount,
            receiverPixelCount,
            minimumDecodedDepth,
            maximumDecodedDepth,
            decodedDepthSamples,
            eligibleReceiverBoundsLightMeters,
            boundsLightMeters: {min: minimum, max: maximum}
        };
    }

    function withLabShaderFailures(diagnostics) {
        return Object.freeze({
            ...diagnostics,
            labShaderFailures: Object.freeze(shaderFailures.slice()),
            labPrewarmFailure
        });
    }

    function requireDensityDiagnostic(value, profile) {
        if (value === null || value === undefined) return null;
        if (!value || typeof value !== 'object' || Array.isArray(value)
            || Object.keys(value).sort().join(',') !== 'texelSizeMeters,validationCase') {
            throw new TypeError('Lab density diagnostic must contain exact validationCase and texelSizeMeters fields');
        }
        const validationCase = value.validationCase;
        const texelSizeMeters = Number(value.texelSizeMeters);
        const candidate = findLabDensityDiagnosticCandidate(texelSizeMeters);
        if (!validationCase || typeof validationCase !== 'object'
            || validationCase.kind !== 'lab'
            || validationCase.cityId !== 'lab_scene'
            || validationCase.camera?.kind !== 'lab_preset'
            || validationCase.sunProfile?.id !== profile?.id) {
            throw new Error('Lab density diagnostic case/profile identity is invalid');
        }
        if (!candidate) {
            throw new Error('Lab density diagnostic texel size is outside the bounded AI 531 sweep');
        }
        return {validationCase, texelSizeMeters, candidate};
    }

    async function buildLabFixture(profile, requestedDensityDiagnostic = null) {
        const densityRequest = requireDensityDiagnostic(
            requestedDensityDiagnostic,
            profile
        );
        if (residualTapTraceId !== null
            && densityRequest?.validationCase?.id
                !== 'illum.lab.overhang_receiver_fixture.az135_el08') {
            throw new Error('Lab residual tap trace requires its canonical az135/el08 case');
        }
        applyProfile(profile);
        if (densityRequest) {
            applyCase(densityRequest.validationCase);
            // Camera-relative shadow focus is updated by City.update. Apply it
            // after the diagnostic camera preset so the recorded phase is the
            // same phase used by the first current-reference render.
            city.update(engine);
            city.sun?.updateMatrixWorld?.(true);
            city.sun?.target?.updateMatrixWorld?.(true);
        }
        city.group.updateMatrixWorld(true);
        originalCasterStates.clear();
        city.group.traverse((node) => {
            if (node?.isMesh && node.castShadow === true) {
                originalCasterStates.set(node, true);
            }
        });
        const intendedCasterSnapshot = city.getStaticSunDepthCasterMeshes?.();
        if (!Array.isArray(intendedCasterSnapshot)
            || !Object.isFrozen(intendedCasterSnapshot)) {
            throw new Error('Lab fixture requires an immutable City static-caster snapshot');
        }
        const fixtureCasterMeshes = new Set();
        const casterWorldBounds = [];
        const casters = [];
        for (const node of intendedCasterSnapshot) {
            if (!node?.isMesh || node.visible === false
                || !isDescendantOf(node, city.group)) continue;
            const worldBox = objectWorldBounds(node);
            if (!worldBox) continue;
            const materials = (Array.isArray(node.material) ? node.material : [node.material])
                .filter((material) => material && material.visible !== false)
                .map((material) => {
                    const sideAudit = describeStaticSunDepthEffectiveShadowSide({
                        side: material.side ?? THREE.FrontSide,
                        shadowSide: city.getStaticSunDepthAuthoredMaterialShadowSide?.(material)
                            ?? material.shadowSide ?? null,
                        preserveShadowSide: material.userData?.preserveShadowSide === true,
                        isFoliage: material.userData?.isFoliage === true
                    }, STATIC_SUN_DEPTH_CASTER_SIDEDNESS);
                    return {
                    alphaTest: resolveThreeR183ShadowAlphaTest(
                        material.alphaTest,
                        material.alphaToCoverage
                    ),
                    alphaToCoverage: material.alphaToCoverage === true,
                    authoredAlphaTest: Number(material.alphaTest || 0),
                    map: material.map ? {
                        height: Number(material.map.image?.height || 0),
                        name: String(material.map.name || ''),
                        width: Number(material.map.image?.width || 0)
                    } : null,
                    opacity: Number(material.opacity ?? 1),
                    authoredShadowSide: sideAudit.authoredShadowSide,
                    authoredSide: sideAudit.authoredSide,
                    preserveShadowSide: sideAudit.preserveShadowSide,
                    isFoliage: sideAudit.isFoliage,
                    preservesAuthoredShadowSide: sideAudit.preservesAuthoredShadowSide,
                    casterSidedness: sideAudit.casterSidedness,
                    effectiveShadowSide: sideAudit.effectiveShadowSide,
                    type: String(material.type || '')
                    };
                });
            if (materials.length === 0) continue;
            fixtureCasterMeshes.add(node);
            casterWorldBounds.push(worldBox);
            casters.push({
                index: casters.length,
                matrixWorld: node.matrixWorld.elements.map((value) => Math.fround(value)),
                name: String(node.name || ''),
                positionCount: Number(node.geometry?.attributes?.position?.count || 0),
                materials
            });
        }
        if (casterWorldBounds.length === 0 || casters.length === 0) {
            throw new Error('Lab fixture has no static city casters');
        }
        const pointDirection = sunDirection(profile);
        const basis = staticSun.createStableStaticSunDepthBasis(pointDirection, [0, 0, 0]);
        const project = (point, axis) => (
            point[0] * axis[0] + point[1] * axis[1] + point[2] * axis[2]
        );
        const canonicalSourceAxes = staticSun
            .createThreeR183DirectionalShadowFilterAxes(pointDirection);
        const liveShadow = city.sun?.shadow;
        if (!liveShadow?.camera || typeof liveShadow.updateMatrices !== 'function') {
            throw new Error('Lab requires the live Three r183 directional shadow camera');
        }
        liveShadow.updateMatrices(city.sun);
        const liveCamera = liveShadow.camera;
        const liveMapSize = [
            Number(liveShadow.mapSize?.x),
            Number(liveShadow.mapSize?.y)
        ];
        const liveWorldExtent = [
            Number(liveCamera.right - liveCamera.left),
            Number(liveCamera.top - liveCamera.bottom)
        ];
        if (!liveMapSize.every((value) => Number.isSafeInteger(value) && value > 0)
            || liveMapSize[0] !== liveMapSize[1]
            || liveMapSize[0] > Number(renderer.capabilities.maxTextureSize)
            || JSON.stringify(liveWorldExtent)
                !== JSON.stringify(samplingPcf.shadowMapWorldExtentMeters)
            || Number(liveShadow.radius) !== samplingPcf.radiusTexels) {
            throw new Error(
                `Lab live single_high filter drift: ${JSON.stringify({
                    liveMapSize,
                    liveWorldExtent,
                    radiusTexels: Number(liveShadow.radius)
                })}`
            );
        }
        const cameraElements = liveCamera.matrixWorld.elements;
        const liveSourceRight = new THREE.Vector3(
            cameraElements[0], cameraElements[1], cameraElements[2]
        ).normalize().toArray();
        const liveSourceUp = new THREE.Vector3(
            cameraElements[4], cameraElements[5], cameraElements[6]
        ).normalize().toArray();
        const maximumAxisError = Math.max(
            ...liveSourceRight.map((value, index) => Math.abs(
                value - canonicalSourceAxes.rightAxisWorld[index]
            )),
            ...liveSourceUp.map((value, index) => Math.abs(
                value - canonicalSourceAxes.upAxisWorld[index]
            ))
        );
        if (maximumAxisError > 1e-6) {
            throw new Error(
                `Lab canonical Three r183 shadow-map axes drift by ${maximumAxisError}`
            );
        }
        const samplingPcfWithAxes = {
            model: samplingPcf.model,
            radiusTexels: samplingPcf.radiusTexels,
            sampleCount: samplingPcf.sampleCount,
            screenRotation: samplingPcf.screenRotation,
            hardwareComparison: samplingPcf.hardwareComparison,
            shadowMapSizeTexels: liveMapSize,
            shadowMapWorldExtentMeters: [...samplingPcf.shadowMapWorldExtentMeters],
            sourceMapRightAxisWorld: [...canonicalSourceAxes.rightAxisWorld],
            sourceMapUpAxisWorld: [...canonicalSourceAxes.upAxisWorld]
        };
        const liveDirectionalShadowFilter = {
            model: samplingPcf.model,
            requestedPresetMapSizeTexels: [16384, 16384],
            rendererMaxTextureSize: Number(renderer.capabilities.maxTextureSize),
            effectiveMapSizeTexels: liveMapSize,
            worldExtentMeters: liveWorldExtent,
            radiusTexels: Number(liveShadow.radius),
            worldRadiusMeters: Number(liveShadow.radius)
                * liveWorldExtent[0] / liveMapSize[0],
            sizePolicy: samplingPcf.shadowMapSizePolicy
        };
        const casterDomainLightMeters = createEmptyLightDomain();
        for (const worldBounds of casterWorldBounds) {
            includeWorldBoundsInLightDomain(
                casterDomainLightMeters,
                worldBounds,
                basis
            );
        }
        const staticReceiverInventory = collectAllStaticReceiverDomainLight(basis);
        const visibleStaticReceiverEvidence = densityRequest
            ? captureVisibleStaticReceiverBoundsLight(basis)
            : null;
        // Normal layout covers every eligible static receiver, not just caster
        // geometry. Density crops narrow XY to the visible receivers below, but
        // still union their reconstructed Z into the shared encoding domain.
        const fixtureDomainLightMeters = unionLightDomains(
            casterDomainLightMeters,
            staticReceiverInventory.domain,
            ...(visibleStaticReceiverEvidence
                ? [visibleStaticReceiverEvidence.boundsLightMeters]
                : [])
        );
        const lightX = [fixtureDomainLightMeters.min[0], fixtureDomainLightMeters.max[0]];
        const lightY = [fixtureDomainLightMeters.min[1], fixtureDomainLightMeters.max[1]];
        const lightDepth = [
            fixtureDomainLightMeters.min[2],
            fixtureDomainLightMeters.max[2]
        ];
        const margin = 4;
        const guard = 1;
        const spanX = Math.max(...lightX) - Math.min(...lightX) + margin * 2;
        const spanY = Math.max(...lightY) - Math.min(...lightY) + margin * 2;
        const maximumStoredTexelsFromChunk = Math.floor(Math.sqrt(
            packageApi.ILLUMINATION_MAX_CHUNK_BYTES / (4 * 2)
        ));
        const maximumCombinedTexelsFromChunk = (
            maximumStoredTexelsFromChunk - guard * 2
        ) * 2;
        const maximumCombinedTexels = Math.min(
            8192,
            maximumCombinedTexelsFromChunk,
            Math.max(64, (renderer.capabilities.maxTextureSize - 4) * 2)
        );
        const texelQuantizationMeters = 1 / 64;
        let texelSizeMeters = Math.max(
            1 / 16,
            Math.ceil(
                Math.max(spanX, spanY)
                / maximumCombinedTexels
                / texelQuantizationMeters
            ) * texelQuantizationMeters
        );
        const constantDepthReliefMeters = samplingBias.constantDepthReliefMeters;
        const geometricNormalOffsetMeters = samplingBias.geometricNormalOffsetMeters;
        let interiorSize = Math.ceil(
            Math.max(spanX, spanY) / (texelSizeMeters * 2)
        );
        let tileCountX = 2;
        let tileCountY = 2;
        let interiorWidth = interiorSize;
        let interiorHeight = interiorSize;
        let combinedWidth = interiorWidth * tileCountX;
        let combinedHeight = interiorHeight * tileCountY;
        let centerX = (Math.min(...lightX) + Math.max(...lightX)) * 0.5;
        let centerY = (Math.min(...lightY) + Math.max(...lightY)) * 0.5;
        let boundsLightMeters = {
            min: [
                centerX - combinedWidth * texelSizeMeters * 0.5,
                centerY - combinedHeight * texelSizeMeters * 0.5
            ],
            max: [
                centerX + combinedWidth * texelSizeMeters * 0.5,
                centerY + combinedHeight * texelSizeMeters * 0.5
            ]
        };
        const normalLayoutBoundsLightMeters = {
            min: [...boundsLightMeters.min],
            max: [...boundsLightMeters.max]
        };
        for (let axis = 0; axis < 2; axis++) {
            if (normalLayoutBoundsLightMeters.min[axis]
                    > fixtureDomainLightMeters.min[axis] - margin + 1e-9
                || normalLayoutBoundsLightMeters.max[axis]
                    < fixtureDomainLightMeters.max[axis] + margin - 1e-9) {
                throw new Error('Lab normal layout does not cover caster/receiver XY domain');
            }
        }
        let densityDiagnostic = null;
        if (densityRequest) {
            const sourceTexelPitchMeters = [
                liveWorldExtent[0] / liveMapSize[0],
                liveWorldExtent[1] / liveMapSize[1]
            ];
            const sourceCameraCenterWorld = new THREE.Vector3()
                .setFromMatrixPosition(liveCamera.matrixWorld)
                .toArray();
            const sourceCameraCenterLightMeters = [
                project(sourceCameraCenterWorld, basis.rightAxisWorld),
                project(sourceCameraCenterWorld, basis.upAxisWorld)
            ];
            const sourceToCacheLightAxisTransform = [
                [
                    project(canonicalSourceAxes.rightAxisWorld, basis.rightAxisWorld),
                    project(canonicalSourceAxes.upAxisWorld, basis.rightAxisWorld)
                ],
                [
                    project(canonicalSourceAxes.rightAxisWorld, basis.upAxisWorld),
                    project(canonicalSourceAxes.upAxisWorld, basis.upAxisWorld)
                ]
            ];
            const expectedAxisTransform = [[-1, 0], [0, 1]];
            const maximumTransformError = Math.max(
                ...sourceToCacheLightAxisTransform.flatMap((row, rowIndex) => (
                    row.map((value, columnIndex) => Math.abs(
                        value - expectedAxisTransform[rowIndex][columnIndex]
                    ))
                ))
            );
            if (maximumTransformError > 1e-6 || liveMapSize[0] % 2 !== 0
                || liveMapSize[1] % 2 !== 0) {
                throw new Error(
                    `Lab density live texel-center phase is not representable: ${JSON.stringify({
                        liveMapSize,
                        sourceToCacheLightAxisTransform,
                        maximumTransformError
                    })}`
                );
            }
            // An even-sized orthographic map places UV .5 on a texel boundary.
            // Select the adjacent (+source-right, +source-up) live texel center,
            // then project that exact center into the cache-light lattice.
            const sourceTexelCenterOffsetLightMeters = [
                0.5 * sourceTexelPitchMeters[0]
                    * sourceToCacheLightAxisTransform[0][0]
                    + 0.5 * sourceTexelPitchMeters[1]
                    * sourceToCacheLightAxisTransform[0][1],
                0.5 * sourceTexelPitchMeters[0]
                    * sourceToCacheLightAxisTransform[1][0]
                    + 0.5 * sourceTexelPitchMeters[1]
                    * sourceToCacheLightAxisTransform[1][1]
            ];
            const texelCenterPhaseAnchorLightMeters = [
                sourceCameraCenterLightMeters[0]
                    + sourceTexelCenterOffsetLightMeters[0],
                sourceCameraCenterLightMeters[1]
                    + sourceTexelCenterOffsetLightMeters[1]
            ];
            const conservativeVogelLinearSupportMeters = (
                samplingPcf.radiusTexels + 1
            ) * Math.max(...sourceTexelPitchMeters);
            const requiredSamplingSupportMeters =
                conservativeVogelLinearSupportMeters + geometricNormalOffsetMeters;
            if (margin < requiredSamplingSupportMeters) {
                throw new Error('Lab density crop margin does not cover sampling support');
            }
            const requiredBoundsLightMeters = {
                min: visibleStaticReceiverEvidence.boundsLightMeters.min.slice(0, 2).map(
                    (value) => value - margin
                ),
                max: visibleStaticReceiverEvidence.boundsLightMeters.max.slice(0, 2).map(
                    (value) => value + margin
                )
            };
            texelSizeMeters = densityRequest.texelSizeMeters;
            const filterRadiusIdentity = createLiveToCacheVogelRadiusEvidence({
                oracleRadiusTexels: samplingPcf.radiusTexels,
                sourceWorldExtentMeters: liveWorldExtent,
                sourceMapSizeTexels: liveMapSize,
                cacheTexelSizeMeters: texelSizeMeters
            });
            const sourceAxisValues = [
                sourceToCacheLightAxisTransform[0][0],
                sourceToCacheLightAxisTransform[1][1]
            ];
            const exactRationalLatticePhaseEvidence =
                densityRequest.candidate.exactLatticeRatio
                    ? createExactRationalLatticePhaseEvidence({
                        cacheTexelSizeMeters: texelSizeMeters,
                        sourceTexelPitchMeters,
                        sourceAxisValues,
                        texelCenterPhaseAnchorLightMeters,
                        receiverDomainLightMeters: staticReceiverInventory.domain,
                        ratio: densityRequest.candidate.exactLatticeRatio
                    })
                    : null;
            const exactThreeToTwoLatticePhaseEvidence =
                densityRequest.candidate.exactLatticeRatio?.sourceTexels === 3
                    && densityRequest.candidate.exactLatticeRatio?.cacheTexels === 2
                    ? exactRationalLatticePhaseEvidence
                    : null;
            const phaseLockedMinimum = (requiredMinimum, phaseAnchor) => {
                const centerIndex = Math.floor(
                    (requiredMinimum - phaseAnchor) / texelSizeMeters + 0.5
                );
                return phaseAnchor + (centerIndex - 0.5) * texelSizeMeters;
            };
            const cropMinimum = [
                phaseLockedMinimum(
                    requiredBoundsLightMeters.min[0],
                    texelCenterPhaseAnchorLightMeters[0]
                ),
                phaseLockedMinimum(
                    requiredBoundsLightMeters.min[1],
                    texelCenterPhaseAnchorLightMeters[1]
                )
            ];
            const requiredTexels = [
                Math.ceil(
                    (requiredBoundsLightMeters.max[0] - cropMinimum[0])
                    / texelSizeMeters
                ),
                Math.ceil(
                    (requiredBoundsLightMeters.max[1] - cropMinimum[1])
                    / texelSizeMeters
                )
            ];
            const gridCandidates = [
                [2, 2], [3, 2], [2, 3], [3, 3],
                [4, 2], [2, 4], [4, 3], [3, 4], [4, 4]
            ];
            const boundedGrids = [];
            for (const [candidateCountX, candidateCountY] of gridCandidates) {
                const candidateInteriorSize = Math.max(
                    Math.ceil(requiredTexels[0] / candidateCountX),
                    Math.ceil(requiredTexels[1] / candidateCountY)
                );
                const candidateStoredSize = candidateInteriorSize + guard * 2;
                const candidateLayerCount = candidateCountX * candidateCountY;
                const candidatePayloadBytes = candidateStoredSize
                    * candidateStoredSize * 2 * candidateLayerCount;
                const candidateLayerByteLength =
                    candidateStoredSize * candidateStoredSize * 2;
                const candidateCombinedWidth = candidateInteriorSize * candidateCountX;
                const candidateCombinedHeight = candidateInteriorSize * candidateCountY;
                if (candidateStoredSize <= renderer.capabilities.maxTextureSize
                    && candidateCombinedWidth <= renderer.capabilities.maxTextureSize
                    && candidateCombinedHeight <= renderer.capabilities.maxTextureSize
                    && candidateLayerByteLength
                        <= packageApi.ILLUMINATION_MAX_CHUNK_BYTES
                    && candidatePayloadBytes
                        <= packageApi.ILLUMINATION_MAX_PACKAGE_BYTES) {
                    boundedGrids.push({
                        tileCountX: candidateCountX,
                        tileCountY: candidateCountY,
                        interiorSize: candidateInteriorSize,
                        storedSize: candidateStoredSize,
                        layerByteLength: candidateLayerByteLength,
                        layerCount: candidateLayerCount,
                        payloadBytes: candidatePayloadBytes
                    });
                }
            }
            // Preserve every prior single-chunk fixture choice. Only when none
            // can represent the requested density do we select the smallest
            // honest payload and use the canonical production layer windows.
            const selectedGrid = boundedGrids.find((entry) => (
                entry.payloadBytes <= packageApi.ILLUMINATION_MAX_CHUNK_BYTES
            )) ?? [...boundedGrids].sort((left, right) => (
                left.payloadBytes - right.payloadBytes
                || left.tileCountY - right.tileCountY
                || left.tileCountX - right.tileCountX
            ))[0] ?? null;
            if (!selectedGrid) {
                throw new Error(`Lab density crop exceeds every bounded tile grid: ${JSON.stringify({
                    requiredTexels,
                    maximumChunkBytes: packageApi.ILLUMINATION_MAX_CHUNK_BYTES,
                    maximumPackageBytes: packageApi.ILLUMINATION_MAX_PACKAGE_BYTES,
                    maximumTextureSize: renderer.capabilities.maxTextureSize
                })}`);
            }
            const cropChunkWindows = staticSun.partitionStaticSunDepthLayers(
                selectedGrid.layerByteLength,
                selectedGrid.layerCount
            );
            tileCountX = selectedGrid.tileCountX;
            tileCountY = selectedGrid.tileCountY;
            interiorSize = selectedGrid.interiorSize;
            interiorWidth = interiorSize;
            interiorHeight = interiorSize;
            combinedWidth = interiorSize * tileCountX;
            combinedHeight = interiorSize * tileCountY;
            boundsLightMeters = {
                min: cropMinimum,
                max: [
                    cropMinimum[0] + combinedWidth * texelSizeMeters,
                    cropMinimum[1] + combinedHeight * texelSizeMeters
                ]
            };
            centerX = (boundsLightMeters.min[0] + boundsLightMeters.max[0]) * 0.5;
            centerY = (boundsLightMeters.min[1] + boundsLightMeters.max[1]) * 0.5;
            const storedSize = selectedGrid.storedSize;
            const cropPayloadBytes = selectedGrid.payloadBytes;
            if (requiredBoundsLightMeters.min.some((value, index) => (
                    value < boundsLightMeters.min[index] - 1e-9
                ))
                || requiredBoundsLightMeters.max.some((value, index) => (
                    value > boundsLightMeters.max[index] + 1e-9
                ))) {
                throw new Error('Lab density phase-locked crop does not cover required bounds');
            }
            const fullDomainInteriorSize = Math.ceil(
                Math.max(spanX, spanY) / (texelSizeMeters * 2)
            );
            const fullDomainStoredSize = fullDomainInteriorSize + guard * 2;
            const fullDomainProjectedPayloadBytes =
                fullDomainStoredSize * fullDomainStoredSize * 2 * 4;
            const productionProjection = LAB_DENSITY_PRODUCTION_PROJECTION;
            const productionLayerByteLength =
                productionProjection.storedTexelsPerLayer[0]
                * productionProjection.storedTexelsPerLayer[1] * 2;
            const productionProjectedPayloadBytes = productionLayerByteLength
                * productionProjection.layerCount;
            if (productionProjection.texelSizeMeters !== sourceTexelPitchMeters[0]
                || productionProjection.texelSizeMeters !== sourceTexelPitchMeters[1]
                || productionProjection.tileSizeMeters.some((value, axis) => (
                    Math.abs(
                        value
                        - productionProjection.interiorTexelsPerLayer[axis]
                            * productionProjection.texelSizeMeters
                    ) > 1e-12
                ))
                || productionProjectedPayloadBytes
                    !== productionProjection.payloadBytes
                || productionProjection.maximumPayloadBytes
                    !== packageApi.ILLUMINATION_MAX_PACKAGE_BYTES
                || productionProjection.within512MiB !== true) {
                throw new Error('Lab final production projection is inconsistent');
            }
            const productionChunkWindows = staticSun.partitionStaticSunDepthLayers(
                productionLayerByteLength,
                productionProjection.layerCount
            );
            densityDiagnostic = {
                schema: 'ai531-phase-locked-density-diagnostic-v1',
                validationCaseId: densityRequest.validationCase.id,
                requestedCandidateId: densityRequest.candidate.id,
                requestedTexelSizeMeters: texelSizeMeters,
                sourceTexelPitchMeters,
                sourceCameraCenterWorld,
                sourceCameraCenterLightMeters,
                sourceShadowCameraMatrixWorld: Array.from(liveCamera.matrixWorld.elements),
                sourceShadowCameraProjectionMatrix:
                    Array.from(liveCamera.projectionMatrix.elements),
                sourceToCacheLightAxisTransform,
                sourceTexelCenterOffsetLightMeters,
                texelCenterPhaseAnchorLightMeters,
                phaseAnchorDerivation:
                    'even-map-adjacent-positive-source-axis-texel-center-projected-to-cache-light-v1',
                filterRadiusIdentity,
                exactRationalLatticePhaseEvidence,
                exactThreeToTwoLatticePhaseEvidence,
                visibleStaticReceiverEvidence,
                casterDomainLightMeters,
                allStaticReceiverDomainLightMeters: staticReceiverInventory.domain,
                encodingDomainLightMeters: fixtureDomainLightMeters,
                normalLayoutBoundsLightMeters,
                cropPaddingMeters: margin,
                conservativeVogelLinearSupportMeters,
                geometricNormalXySupportMeters: geometricNormalOffsetMeters,
                requiredSamplingSupportMeters,
                requiredBoundsLightMeters,
                cropBoundsLightMeters: boundsLightMeters,
                cropTileGridPolicy:
                    'first-single-chunk-else-minimum-payload-canonical-layer-windows-2x2-through-4x4-v2',
                cropTileCount: [tileCountX, tileCountY],
                cropCombinedTexels: [combinedWidth, combinedHeight],
                cropStoredTexelsPerLayer: [storedSize, storedSize],
                cropLayerByteLength: selectedGrid.layerByteLength,
                cropPayloadBytes,
                cropChunkCount: cropChunkWindows.length,
                cropChunkWindows,
                fullDomainProjection: {
                    tileCount: [2, 2],
                    combinedTexels: [
                        fullDomainInteriorSize * 2,
                        fullDomainInteriorSize * 2
                    ],
                    storedTexelsPerLayer: [fullDomainStoredSize, fullDomainStoredSize],
                    payloadBytes: fullDomainProjectedPayloadBytes,
                    exceedsSingleChunk:
                        fullDomainProjectedPayloadBytes
                        > packageApi.ILLUMINATION_MAX_CHUNK_BYTES
                },
                finalProductionProjection: {
                    ...productionProjection,
                    tileSizeMeters: [...productionProjection.tileSizeMeters],
                    interiorTexelsPerLayer: [
                        ...productionProjection.interiorTexelsPerLayer
                    ],
                    storedTexelsPerLayer: [
                        ...productionProjection.storedTexelsPerLayer
                    ],
                    layerByteLength: productionLayerByteLength,
                    payloadBytes: productionProjectedPayloadBytes,
                    canonical64MiBLayerWindowCount: productionChunkWindows.length,
                    chunkWindows: productionChunkWindows,
                    exceedsSingleChunk:
                        productionProjectedPayloadBytes
                        > packageApi.ILLUMINATION_MAX_CHUNK_BYTES,
                    within256MiB: productionProjectedPayloadBytes <= 256 * 1024 * 1024,
                    within512MiB: productionProjectedPayloadBytes
                        <= packageApi.ILLUMINATION_MAX_PACKAGE_BYTES
                },
                candidatePromotion: {
                    strictParityStatus:
                        densityRequest.candidate.strictParityStatus,
                    promotionClass: densityRequest.candidate.promotionClass,
                    promotionBudgetEligible:
                        densityRequest.candidate.productionEligible === true
                        && productionProjection.within512MiB === true
                },
                limits: {
                    maximumChunkBytes: packageApi.ILLUMINATION_MAX_CHUNK_BYTES,
                    maximumPackageBytes: packageApi.ILLUMINATION_MAX_PACKAGE_BYTES,
                    rendererMaxTextureSize: renderer.capabilities.maxTextureSize
                },
                guard: {
                    diagnosticGuardTexels: guard,
                    diagnosticRationale:
                        'exact-global-cross-layer-filter-fetch-does-not-consume-guard-v1',
                    productionGuardTexels: productionProjection.guardTexels
                }
            };
        }
        const encodingMin = Math.floor(Math.min(...lightDepth) - margin);
        const encodingMax = Math.ceil(Math.max(...lightDepth) + margin);
        if (encodingMin > fixtureDomainLightMeters.min[2]
            || encodingMax < fixtureDomainLightMeters.max[2]) {
            throw new Error('Lab depth encoding does not cover caster/receiver depth domain');
        }
        const renderTarget = new THREE.WebGLRenderTarget(combinedWidth, combinedHeight, {
            depthBuffer: true,
            format: THREE.RGBAFormat,
            magFilter: THREE.NearestFilter,
            minFilter: THREE.NearestFilter,
            stencilBuffer: false,
            type: THREE.UnsignedByteType
        });
        renderTarget.texture.colorSpace = THREE.NoColorSpace;
        renderTarget.texture.generateMipmaps = false;
        const camera = new THREE.OrthographicCamera(
            -combinedWidth * texelSizeMeters * 0.5,
            combinedWidth * texelSizeMeters * 0.5,
            combinedHeight * texelSizeMeters * 0.5,
            -combinedHeight * texelSizeMeters * 0.5,
            1,
            1 + encodingMax - encodingMin
        );
        const cameraDepth = encodingMin - 1;
        camera.position.set(
            basis.rightAxisWorld[0] * centerX
                + basis.upAxisWorld[0] * centerY
                + basis.depthAxisWorld[0] * cameraDepth,
            basis.rightAxisWorld[1] * centerX
                + basis.upAxisWorld[1] * centerY
                + basis.depthAxisWorld[1] * cameraDepth,
            basis.rightAxisWorld[2] * centerX
                + basis.upAxisWorld[2] * centerY
                + basis.depthAxisWorld[2] * cameraDepth
        );
        camera.up.set(...basis.upAxisWorld);
        camera.lookAt(
            camera.position.x + basis.depthAxisWorld[0],
            camera.position.y + basis.depthAxisWorld[1],
            camera.position.z + basis.depthAxisWorld[2]
        );
        camera.updateProjectionMatrix();
        camera.updateMatrixWorld(true);
        const decodeNormalizedDepthMeters = (normalizedDepth) => (
            encodingMin + normalizedDepth * (encodingMax - encodingMin)
        );

        const visibility = [];
        engine.scene.traverse((node) => {
            if (!node?.isMesh) return;
            visibility.push([node, node.visible]);
            node.visible = node.visible !== false
                && fixtureCasterMeshes.has(node);
        });
        const previousTarget = renderer.getRenderTarget();
        const previousShadowEnabled = renderer.shadowMap.enabled;
        const previousClearColor = renderer.getClearColor(new THREE.Color()).clone();
        const previousClearAlpha = renderer.getClearAlpha();
        const depthValues = new Float32Array(combinedWidth * combinedHeight);
        const depthReadback = new Uint8Array(combinedWidth * combinedHeight * 4);
        const materialReplacements = [];
        try {
            for (const node of fixtureCasterMeshes) {
                const originalMaterial = node.material;
                const sources = Array.isArray(originalMaterial)
                    ? originalMaterial
                    : [originalMaterial];
                const replacements = sources.map((source) => {
                    if (source?.visible !== false) {
                        return createLabDepthMaterial(source, 'shadowCaster');
                    }
                    const hidden = new THREE.MeshBasicMaterial();
                    hidden.name = 'AI531LabDepthInvisibleCasterSlot';
                    hidden.visible = false;
                    return hidden;
                });
                materialReplacements.push([node, originalMaterial, replacements]);
                node.material = Array.isArray(originalMaterial) ? replacements : replacements[0];
            }
            renderer.shadowMap.enabled = false;
            renderer.setClearColor(0xffffff, 1);
            clearPreexistingWebGlErrors();
            renderer.setRenderTarget(renderTarget);
            renderer.clear(true, true, true);
            renderer.render(engine.scene, camera);
            gl.finish();
            const renderErrorCode = gl.getError();
            if (renderErrorCode !== gl.NO_ERROR) {
                throw new Error(`WebGL2 lab packed-depth render failed with error ${renderErrorCode}`);
            }
            renderer.readRenderTargetPixels(
                renderTarget,
                0,
                0,
                combinedWidth,
                combinedHeight,
                depthReadback
            );
            const errorCode = gl.getError();
            if (errorCode !== gl.NO_ERROR) {
                throw new Error(`WebGL2 lab packed-depth readback failed with error ${errorCode}`);
            }
            for (let index = 0; index < depthValues.length; index++) {
                depthValues[index] = unpackThreeRgbaDepthBytes(depthReadback, index * 4);
            }
        } finally {
            renderer.setRenderTarget(previousTarget);
            renderer.shadowMap.enabled = previousShadowEnabled;
            renderer.setClearColor(previousClearColor, previousClearAlpha);
            for (const [node, originalMaterial, replacements] of materialReplacements) {
                node.material = originalMaterial;
                for (const material of replacements) material.dispose();
            }
            for (const [node, visible] of visibility) node.visible = visible;
            renderTarget.dispose();
        }

        const encoding = {
            id: 'rg8-packed-linear-depth-v1',
            quantization: 'linear-endpoints-inclusive-v1',
            redChannel: 'quantized-high-byte-v1',
            greenChannel: 'quantized-low-byte-v1',
            minDepthMeters: encodingMin,
            maxDepthMeters: encodingMax,
            maxQuantized: 65534,
            emptyQuantized: 65535
        };
        const combined = new Uint8Array(combinedWidth * combinedHeight * 2);
        for (let y = 0; y < combinedHeight; y++) {
            for (let x = 0; x < combinedWidth; x++) {
                const sourceX = combinedWidth - 1 - x;
                const normalizedDepth = depthValues[y * combinedWidth + sourceX];
                const quantized = normalizedDepth >= 1 - 1e-7
                    ? 65535
                    : staticSun.encodeStaticSunDepthMeters(
                        decodeNormalizedDepthMeters(normalizedDepth),
                        encoding
                    );
                staticSun.packStaticSunDepthQuantizedRg8(
                    quantized,
                    combined,
                    (y * combinedWidth + x) * 2
                );
            }
        }

        const depthProbeFor = (name) => {
            const object = city.group.getObjectByName(name);
            if (!object) return {name, missing: true};
            const box = new THREE.Box3().setFromObject(object);
            const center = box.getCenter(new THREE.Vector3());
            const world = [center.x, box.max.y, center.z];
            const light = {
                x: project(world, basis.rightAxisWorld),
                y: project(world, basis.upAxisWorld),
                depth: project(world, basis.depthAxisWorld)
            };
            const pixelX = Math.floor((light.x - boundsLightMeters.min[0]) / texelSizeMeters);
            const pixelY = Math.floor((light.y - boundsLightMeters.min[1]) / texelSizeMeters);
            const samples = [];
            for (let offsetY = -1; offsetY <= 1; offsetY++) {
                for (let offsetX = -1; offsetX <= 1; offsetX++) {
                    const x = Math.max(0, Math.min(combinedWidth - 1, pixelX + offsetX));
                    const y = Math.max(0, Math.min(combinedHeight - 1, pixelY + offsetY));
                    const offset = (y * combinedWidth + x) * 2;
                    const quantized = combined[offset] * 256 + combined[offset + 1];
                    samples.push(quantized === 65535
                        ? null
                        : encodingMin
                            + quantized / 65534 * (encodingMax - encodingMin));
                }
            }
            return {name, world, light, pixel: [pixelX, pixelY], samples};
        };
        const receiverDepthProbes = [
            depthProbeFor('OverhangRoadReceiver'),
            depthProbeFor('OverhangRoofAndUndersideReceiver')
        ];

        const storedWidth = interiorWidth + guard * 2;
        const storedHeight = interiorHeight + guard * 2;
        const layerBytes = storedWidth * storedHeight * 2;
        const tileLayerCount = tileCountX * tileCountY;
        const payload = new Uint8Array(layerBytes * tileLayerCount);
        const tiles = [];
        for (let tileY = 0; tileY < tileCountY; tileY++) {
            for (let tileX = 0; tileX < tileCountX; tileX++) {
                const layerIndex = tileY * tileCountX + tileX;
                const layer = payload.subarray(
                    layerIndex * layerBytes,
                    (layerIndex + 1) * layerBytes
                );
                for (let storedY = 0; storedY < storedHeight; storedY++) {
                    for (let storedX = 0; storedX < storedWidth; storedX++) {
                        const globalX = Math.min(
                            combinedWidth - 1,
                            Math.max(0, tileX * interiorWidth + storedX - guard)
                        );
                        const globalY = Math.min(
                            combinedHeight - 1,
                            Math.max(0, tileY * interiorHeight + storedY - guard)
                        );
                        const sourceOffset = (globalY * combinedWidth + globalX) * 2;
                        const targetOffset = (storedY * storedWidth + storedX) * 2;
                        layer[targetOffset] = combined[sourceOffset];
                        layer[targetOffset + 1] = combined[sourceOffset + 1];
                    }
                }
                tiles.push({
                    id: `tile.${tileX}.${tileY}`,
                    coordinates: [tileX, tileY],
                    interiorBoundsLightMeters: {
                        min: [
                            boundsLightMeters.min[0]
                                + tileX * interiorWidth * texelSizeMeters,
                            boundsLightMeters.min[1]
                                + tileY * interiorHeight * texelSizeMeters
                        ],
                        max: [
                            boundsLightMeters.min[0]
                                + (tileX + 1) * interiorWidth * texelSizeMeters,
                            boundsLightMeters.min[1]
                                + (tileY + 1) * interiorHeight * texelSizeMeters
                        ]
                    },
                    storedTexels: [storedWidth, storedHeight],
                    contentSha256: await packageApi.rawSha256Hex(layer)
                });
            }
        }

        const casterInventorySha256 = await hashJson({
            schema: 'ai531-lab-caster-inventory-v2',
            fixtureId: 'illumination_overhang_receiver_v1',
            casterSidedness: STATIC_SUN_DEPTH_CASTER_SIDEDNESS,
            casters
        });
        const casterSidednessReceipt = Object.freeze({
            schema: 'ai531-lab-caster-sidedness-receipt-v1',
            casterSidedness: STATIC_SUN_DEPTH_CASTER_SIDEDNESS,
            casterInventorySha256,
            materialSlotCount: casters.reduce((sum, entry) => sum + entry.materials.length, 0),
            preservedMaterialSlotCount: casters.reduce((sum, entry) => sum
                + entry.materials.filter((material) => material.preservesAuthoredShadowSide).length, 0),
            effectiveShadowSideCounts: Object.freeze([0, 1, 2].map((side) => Object.freeze({
                side,
                count: casters.reduce((sum, entry) => sum
                    + entry.materials.filter((material) => material.effectiveShadowSide === side).length, 0)
            })))
        });
        const alphaSemanticsSha256 = await hashJson({
            schema: 'ai531-lab-alpha-semantics-v1',
            coverage: 'opacity-times-vertex-alpha-times-map-a-times-alpha-map-g-v1',
            threshold: 'discard-when-coverage-lt-alpha-test-v1',
            casterMaterials: casters.map((entry) => entry.materials)
        });
        const resolvedSourceSha256 = await hashJson({
            schema: 'ai531-lab-resolved-source-v1',
            cityId: 'lab_scene',
            casterInventorySha256
        });
        const channelSourceSha256 = await hashJson({
            schema: fixtureSchema,
            casterInventorySha256,
            alphaSemanticsSha256
        });
        const channelProfileSha256 = await hashJson({
            schema: 'ai531-lab-channel-profile-v1',
            lightingProfileId: profile.id,
            pointDirection,
            layout: {
                boundsLightMeters,
                interiorWidth,
                interiorHeight,
                texelSizeMeters,
                tileCount: [tileCountX, tileCountY]
            },
            samplingBias: {
                model: samplingBias.model,
                constantDepthReliefMeters,
                geometricNormalOffsetMeters
            },
            samplingPcf: samplingPcfWithAxes
        });
        const compilerDescriptor = {
            backend: 'webgl2_live_static_city_depth_test_fixture',
            buildHash: 'ai531-lab-fixture-v1',
            scriptSha256: await hashJson({schema: fixtureSchema}),
            version: String(gl.getParameter(gl.VERSION))
        };
        const createDescriptor = (compilerSignatureSha256) => ({
            schema: staticSun.STATIC_SUN_DEPTH_TILE_SET_SCHEMA,
            identity: {
                channelId: 'static_sun_depth',
                channelVersion: 1,
                cityId: 'lab_scene',
                casterInventorySha256,
                channelSourceSha256,
                compilerSignatureSha256,
                sunPointDirectionWorld: pointDirection,
                basis,
                layout: {
                    order: 'row-major-y-then-x-v1',
                    lookup: 'half-open-min-inclusive-max-exclusive-v1',
                    rowOrigin: 'min-light-y-v1',
                    guardPolicy: 'copy-adjacent-clamp-exterior-v1',
                    tileCount: [tileCountX, tileCountY],
                    interiorTexels: [interiorWidth, interiorHeight],
                    guardTexels: guard,
                    texelSizeMeters,
                    boundsLightMeters
                },
                alpha: {
                    model: 'evaluated-runtime-coverage-v1',
                    coverage: 'opacity-times-vertex-alpha-times-map-a-times-alpha-map-g-v1',
                    threshold: 'discard-when-coverage-lt-alpha-test-v1',
                    sidedness: 'material-side-and-shadow-side-v1',
                    forcedOpaque: 'shadow-as-opaque-v1',
                    semanticsSha256: alphaSemanticsSha256
                },
                encoding,
                sampling: {
                    comparison: 'receiver-depth-minus-bias-lte-caster-depth-v1',
                    emptyPolicy: 'visible-v1',
                    outOfBoundsPolicy: 'fail-closed-zero-visibility-v1',
                    bias: {
                        model: samplingBias.model,
                        constantDepthReliefMeters,
                        geometricNormalOffsetMeters
                    },
                    pcf: samplingPcfWithAxes
                }
            },
            tiles
        });
        const packageDimensions = {
            width: storedWidth,
            height: storedHeight,
            depth: tileLayerCount,
            components: 2
        };
        const build = async (descriptor) => {
            const chunks = await buildProductionStaticSunDepthChunkInputs(
                descriptor,
                payload,
                packageDimensions
            );
            return packageApi.buildIlluminationBinaryPackage({
                cityId: 'lab_scene',
                lightingProfileId: profile.id,
                selectedCapabilityProfileId: capabilityProfileId,
                source: {
                    resolvedSourceSha256,
                    schema: 'ai531-lab-resolved-source-v1'
                },
                compilerDescriptor,
                channels: [{
                    id: 'static_sun_depth',
                    required: true,
                    sourceSha256: channelSourceSha256,
                    profileSha256: channelProfileSha256
                }],
                chunks
            });
        };
        const preliminary = await build(createDescriptor('0'.repeat(64)));
        const descriptor = createDescriptor(preliminary.manifest.compiler.signatureSha256);
        const packageResult = await build(descriptor);
        return {
            bytes: packageResult.bytes,
            sourceDepthDiagnostic: residualTapTraceId === LAB_RESIDUAL_TAP_TRACE_ID
                ? {
                    height: combinedHeight,
                    normalizedDepthValues: depthValues,
                    normalizedEmptyThreshold: 1 - 1e-7,
                    sourceRasterToCacheGlobal: 'mirror-x-v1',
                    width: combinedWidth
                } : null,
            liveIdentity: {
                alphaSemanticsSha256,
                casterInventorySha256,
                cityId: 'lab_scene',
                developmentCacheAllowed: true,
                lightingProfileId: profile.id,
                resolvedSourceSha256,
                staticSunDepthSourceSha256: channelSourceSha256
            },
            fixture: {
                schema: fixtureSchema,
                artifactClass: 'test_fixture',
                productionEligible: false,
                provenance: 'webgl2_live_static_city_depth_test_fixture_v1',
                blenderCyclesProvenanceClaimed: false,
                casterCount: casters.length,
                casterSidednessReceipt,
                intendedCasterSnapshotCount: intendedCasterSnapshot.length,
                casterDomainLightMeters,
                staticReceiverDomainLightMeters: staticReceiverInventory.domain,
                staticReceiverMeshCount: staticReceiverInventory.eligibleMeshCount,
                staticReceiverMaterialSlotCount:
                    staticReceiverInventory.eligibleMaterialSlotCount,
                fixtureDomainLightMeters,
                layoutBoundsLightMeters: boundsLightMeters,
                encoding,
                tileCount: tileLayerCount,
                storedTexels: [storedWidth, storedHeight],
                payloadBytes: payload.byteLength,
                packageChunkCount: packageResult.chunkTable.chunks.length,
                packageChunkIds: packageResult.chunkTable.chunks.map((entry) => entry.id),
                pcf: samplingPcfWithAxes,
                liveDirectionalShadowFilter,
                texelSizeMeters,
                biasModel: samplingBias.model,
                constantDepthReliefMeters,
                geometricNormalOffsetMeters,
                densityDiagnostic,
                receiverDepthProbes
            }
        };
    }

    async function transitionPipelineToCurrentPrograms(owned) {
        await owned.setMode('current');
        renderFrames(1);
        const diagnostics = owned.getDiagnostics();
        if (diagnostics.active
            || diagnostics.runtime?.controller?.effectiveMode !== 'current') {
            throw new Error('Lab pipeline did not commit current mode before profile replacement');
        }
        // A current frame only recompiles visible materials. Compile the complete
        // Lab Scene once with the cache hook removed so off-camera receivers do
        // not retain the previous profile's program and uniform objects.
        renderer.compile(engine.scene, engine.camera);
        gl.finish();
    }

    async function disposePipeline() {
        if (!pipeline) return;
        const owned = pipeline;
        let transitionError = null;
        try {
            await transitionPipelineToCurrentPrograms(owned);
        } catch (error) {
            transitionError = error;
        }
        pipeline = null;
        engine.installIlluminationPipeline(null);
        await owned.dispose();
        if (transitionError) throw transitionError;
    }

    function verifyPreparedDensityPhase(validationCase) {
        const oracle = prepared?.fixture?.densityDiagnostic;
        if (!oracle) return null;
        if (oracle.validationCaseId !== validationCase?.id) {
            throw new Error('Lab density phase oracle case identity drifted');
        }
        city.sun?.updateMatrixWorld?.(true);
        city.sun?.target?.updateMatrixWorld?.(true);
        city.sun?.shadow?.updateMatrices?.(city.sun);
        const actualWorld = Array.from(city.sun.shadow.camera.matrixWorld.elements);
        const actualProjection = Array.from(city.sun.shadow.camera.projectionMatrix.elements);
        const maximumWorldMatrixError = Math.max(...actualWorld.map((value, index) => (
            Math.abs(value - oracle.sourceShadowCameraMatrixWorld[index])
        )));
        const maximumProjectionMatrixError = Math.max(
            ...actualProjection.map((value, index) => (
                Math.abs(value - oracle.sourceShadowCameraProjectionMatrix[index])
            ))
        );
        if (maximumWorldMatrixError > 1e-8 || maximumProjectionMatrixError > 1e-12) {
            throw new Error(`Lab density first-current phase drift: ${JSON.stringify({
                maximumWorldMatrixError,
                maximumProjectionMatrixError
            })}`);
        }
        return {
            method: 'prepared-shadow-camera-equals-first-current-render-v1',
            maximumWorldMatrixError,
            maximumProjectionMatrixError,
            passed: true
        };
    }

    function traceResidualTap(validationCase, missingOccluderSample) {
        if (residualTapTraceId !== LAB_RESIDUAL_TAP_TRACE_ID
            || validationCase?.id !== 'illum.lab.overhang_receiver_fixture.az135_el08'
            || prepared?.fixture?.densityDiagnostic?.validationCaseId !== validationCase.id
            || !prepared?.sourceDepthDiagnostic
            || !pipeline?._active?.binding) {
            throw new Error('Lab residual tap trace is not active for the canonical case');
        }
        const pixel = missingOccluderSample?.pixel;
        if (!Array.isArray(pixel) || pixel.length !== 2
            || pixel.some((entry) => !Number.isSafeInteger(entry))
            || pixel[0] < 0 || pixel[0] >= gl.drawingBufferWidth
            || pixel[1] < 0 || pixel[1] >= gl.drawingBufferHeight) {
            throw new Error('Lab residual tap trace pixel is invalid');
        }
        engine.camera.updateMatrixWorld(true);
        const fragmentCoordinatePixels = [pixel[0] + 0.5, pixel[1] + 0.5];
        const raycaster = new THREE.Raycaster();
        raycaster.setFromCamera(new THREE.Vector2(
            fragmentCoordinatePixels[0] / gl.drawingBufferWidth * 2 - 1,
            fragmentCoordinatePixels[1] / gl.drawingBufferHeight * 2 - 1
        ), engine.camera);
        const hits = raycaster.intersectObject(city.group, true);
        const hit = hits.find((candidate) => {
            if (candidate.object?.receiveShadow !== true || !candidate.face) return false;
            const materials = Array.isArray(candidate.object.material)
                ? candidate.object.material : [candidate.object.material];
            const material = materials[candidate.face.materialIndex] ?? materials[0];
            return isLitMaterial(material);
        });
        if (!hit?.face || !hit.object?.geometry?.attributes?.position) {
            throw new Error('Lab residual tap trace found no supported static receiver hit');
        }
        const object = hit.object;
        const geometry = object.geometry;
        const positionAttribute = geometry.attributes.position;
        const normalAttribute = geometry.attributes.normal;
        if (!normalAttribute) {
            throw new Error('Lab residual tap trace receiver has no vertex normals');
        }
        const localPoint = object.worldToLocal(hit.point.clone());
        const readAttributeVector = (attribute, index) => new THREE.Vector3(
            attribute.getX(index),
            attribute.getY(index),
            attribute.getZ(index)
        );
        const localA = readAttributeVector(positionAttribute, hit.face.a);
        const localB = readAttributeVector(positionAttribute, hit.face.b);
        const localC = readAttributeVector(positionAttribute, hit.face.c);
        const barycentric = new THREE.Vector3();
        THREE.Triangle.getBarycoord(localPoint, localA, localB, localC, barycentric);
        if (![barycentric.x, barycentric.y, barycentric.z].every(Number.isFinite)) {
            throw new Error('Lab residual tap trace barycentric reconstruction failed');
        }
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        const material = materials[hit.face.materialIndex] ?? materials[0];
        const sideSign = material?.side === THREE.BackSide ? -1 : 1;
        const worldNormalMatrix = new THREE.Matrix3().getNormalMatrix(object.matrixWorld);
        const vertexWorldNormals = [hit.face.a, hit.face.b, hit.face.c].map((index) => (
            readAttributeVector(normalAttribute, index)
                .applyNormalMatrix(worldNormalMatrix)
                .normalize()
                .multiplyScalar(sideSign)
        ));
        const geometricOffsetWorldNormal = new THREE.Vector3()
            .addScaledVector(vertexWorldNormals[0], barycentric.x)
            .addScaledVector(vertexWorldNormals[1], barycentric.y)
            .addScaledVector(vertexWorldNormals[2], barycentric.z);
        const receiverNormalWorld = geometricOffsetWorldNormal.clone().normalize();
        const faceWorldNormal = hit.face.normal.clone()
            .applyNormalMatrix(worldNormalMatrix)
            .normalize();
        const frontFacing = raycaster.ray.direction.dot(faceWorldNormal) < 0;
        if (material?.side === THREE.DoubleSide && !frontFacing) {
            receiverNormalWorld.multiplyScalar(-1);
        }

        const binding = pipeline._active.binding;
        const descriptor = binding.descriptor;
        const identity = descriptor.identity;
        const layout = identity.layout;
        const encoding = identity.encoding;
        const bias = identity.sampling.bias;
        const pcf = identity.sampling.pcf;
        if (pcf.model !== 'three-r183-vogel-5-linear-compare-v1'
            || bias.model !== 'geometric-normal-offset-plus-constant-depth-relief-v1') {
            throw new Error('Lab residual tap trace requires canonical geometric/Vogel sampling');
        }
        const biasedWorldPosition = hit.point.clone().addScaledVector(
            geometricOffsetWorldNormal,
            bias.geometricNormalOffsetMeters
        );
        const projectLight = (axis) => (
            biasedWorldPosition.x * axis[0]
            + biasedWorldPosition.y * axis[1]
            + biasedWorldPosition.z * axis[2]
        );
        const lightPosition = [
            projectLight(identity.basis.rightAxisWorld),
            projectLight(identity.basis.upAxisWorld),
            projectLight(identity.basis.depthAxisWorld)
        ];
        const comparisonDepthMeters = lightPosition[2] - bias.constantDepthReliefMeters;
        const globalCoordinate = [
            (lightPosition[0] - layout.boundsLightMeters.min[0])
                / layout.texelSizeMeters,
            (lightPosition[1] - layout.boundsLightMeters.min[1])
                / layout.texelSizeMeters
        ];
        const filterWorldRadiusMeters = pcf.radiusTexels
            * pcf.shadowMapWorldExtentMeters[0]
            / pcf.shadowMapSizeTexels[0];
        const dotAxes = (left, right) => (
            left[0] * right[0] + left[1] * right[1] + left[2] * right[2]
        );
        const sourceXLightTexels = [
            dotAxes(pcf.sourceMapRightAxisWorld, identity.basis.rightAxisWorld)
                * filterWorldRadiusMeters / layout.texelSizeMeters,
            dotAxes(pcf.sourceMapRightAxisWorld, identity.basis.upAxisWorld)
                * filterWorldRadiusMeters / layout.texelSizeMeters
        ];
        const sourceYLightTexels = [
            dotAxes(pcf.sourceMapUpAxisWorld, identity.basis.rightAxisWorld)
                * filterWorldRadiusMeters / layout.texelSizeMeters,
            dotAxes(pcf.sourceMapUpAxisWorld, identity.basis.upAxisWorld)
                * filterWorldRadiusMeters / layout.texelSizeMeters
        ];
        const textureImage = binding.texture?.image;
        const residentBytes = textureImage?.data;
        const source = prepared.sourceDepthDiagnostic;
        if (!(residentBytes instanceof Uint8Array)
            || !(source.normalizedDepthValues instanceof Float32Array)
            || source.width !== layout.tileCount[0] * layout.interiorTexels[0]
            || source.height !== layout.tileCount[1] * layout.interiorTexels[1]) {
            throw new Error('Lab residual tap trace source/resident payload is unavailable');
        }
        const globalWidth = source.width;
        const globalHeight = source.height;
        const currentShadowTarget = city.sun?.shadow?.map;
        const currentShadowCamera = city.sun?.shadow?.camera;
        const currentShadowMapSize = [
            Number(city.sun?.shadow?.mapSize?.x),
            Number(city.sun?.shadow?.mapSize?.y)
        ];
        const currentShadowDepthTexture = currentShadowTarget?.depthTexture;
        if (!currentShadowTarget || !currentShadowCamera || !currentShadowDepthTexture
            || JSON.stringify(currentShadowMapSize)
                !== JSON.stringify(pcf.shadowMapSizeTexels)) {
            throw new Error('Lab residual current source shadow map is unavailable');
        }
        currentShadowCamera.updateMatrixWorld(true);
        const sourceMapCenterWorld = currentShadowCamera.position.clone();
        const sourceRightWorld = new THREE.Vector3(...pcf.sourceMapRightAxisWorld);
        const sourceUpWorld = new THREE.Vector3(...pcf.sourceMapUpAxisWorld);
        const cacheRightWorld = new THREE.Vector3(...identity.basis.rightAxisWorld);
        const cacheUpWorld = new THREE.Vector3(...identity.basis.upAxisWorld);
        const cacheDepthWorld = new THREE.Vector3(...identity.basis.depthAxisWorld);
        const currentSourceReadbackCache = new Map();
        const currentDepthSampleTarget = new THREE.WebGLRenderTarget(1, 1, {
            format: THREE.RGBAFormat,
            type: THREE.UnsignedByteType,
            minFilter: THREE.NearestFilter,
            magFilter: THREE.NearestFilter,
            depthBuffer: false,
            stencilBuffer: false
        });
        const currentDepthSampleMaterial = new THREE.ShaderMaterial({
            uniforms: {
                sourceDepth: {value: currentShadowDepthTexture},
                sourceUv: {value: new THREE.Vector2()},
                compareDepth: {value: 0.5}
            },
            vertexShader: `
                void main() {
                    gl_Position = vec4(position.xy, 0.0, 1.0);
                }
            `,
            fragmentShader: `
                precision highp float;
                uniform highp sampler2DShadow sourceDepth;
                uniform vec2 sourceUv;
                uniform float compareDepth;
                void main() {
                    float comparison = texture(
                        sourceDepth,
                        vec3(sourceUv, compareDepth)
                    );
                    gl_FragColor = vec4(comparison, comparison, comparison, 1.0);
                }
            `,
            glslVersion: THREE.GLSL3,
            depthTest: false,
            depthWrite: false,
            blending: THREE.NoBlending
        });
        const currentDepthSampleGeometry = new THREE.PlaneGeometry(2, 2);
        const currentDepthSampleMesh = new THREE.Mesh(
            currentDepthSampleGeometry,
            currentDepthSampleMaterial
        );
        currentDepthSampleMesh.frustumCulled = false;
        const currentDepthSampleScene = new THREE.Scene();
        currentDepthSampleScene.add(currentDepthSampleMesh);
        const currentDepthSampleCamera = new THREE.Camera();
        const previousRenderTarget = renderer.getRenderTarget();
        const previousActiveCubeFace = renderer.getActiveCubeFace();
        const previousActiveMipmapLevel = renderer.getActiveMipmapLevel();
        if (currentShadowDepthTexture.compareFunction === null) {
            throw new Error('Lab residual current source is not a native PCF depth texture');
        }
        const sampleCurrentSourceDepth = (sourceShadowTexel) => {
            const rgba = new Uint8Array(4);
            currentDepthSampleMaterial.uniforms.sourceUv.value.set(
                (sourceShadowTexel[0] + 0.5) / currentShadowMapSize[0],
                (sourceShadowTexel[1] + 0.5) / currentShadowMapSize[1]
            );
            let lower = 0;
            let upper = 1;
            const iterations = 24;
            clearPreexistingWebGlErrors();
            for (let iteration = 0; iteration < iterations; iteration++) {
                const midpoint = (lower + upper) * 0.5;
                currentDepthSampleMaterial.uniforms.compareDepth.value = midpoint;
                renderer.setRenderTarget(currentDepthSampleTarget);
                renderer.render(currentDepthSampleScene, currentDepthSampleCamera);
                renderer.readRenderTargetPixels(currentDepthSampleTarget, 0, 0, 1, 1, rgba);
                const errorCode = gl.getError();
                if (errorCode !== gl.NO_ERROR) {
                    throw new Error(
                        `Lab residual targeted native-depth comparison failed with error ${errorCode}`
                    );
                }
                if (rgba[0] >= 128) lower = midpoint;
                else upper = midpoint;
            }
            return {
                iterations,
                normalizedDepth: (lower + upper) * 0.5,
                normalizedDepthBracket: [lower, upper]
            };
        };
        const readTap = (globalX, globalY) => {
            if (globalX < 0 || globalX >= globalWidth
                || globalY < 0 || globalY >= globalHeight) {
                return {
                    outOfBounds: true,
                    quantized: null,
                    preRg8DepthMeters: null,
                    decodedDepthMeters: null,
                    currentSourceDepthMeters: null
                };
            }
            const sourceX = globalWidth - 1 - globalX;
            const normalizedDepth = source.normalizedDepthValues[
                globalY * globalWidth + sourceX
            ];
            const preRg8DepthMeters = normalizedDepth >= source.normalizedEmptyThreshold
                ? null
                : encoding.minDepthMeters
                    + normalizedDepth * (encoding.maxDepthMeters - encoding.minDepthMeters);
            const tileX = Math.floor(globalX / layout.interiorTexels[0]);
            const tileY = Math.floor(globalY / layout.interiorTexels[1]);
            const storedX = globalX - tileX * layout.interiorTexels[0]
                + layout.guardTexels;
            const storedY = globalY - tileY * layout.interiorTexels[1]
                + layout.guardTexels;
            const layer = tileY * layout.tileCount[0] + tileX;
            const offset = (
                (layer * textureImage.height + storedY) * textureImage.width + storedX
            ) * 2;
            const quantized = residentBytes[offset] * 256 + residentBytes[offset + 1];
            const decodedDepthMeters = staticSun.decodeStaticSunDepthMeters(
                quantized,
                encoding
            );
            const reencodedQuantized = preRg8DepthMeters === null
                ? encoding.emptyQuantized
                : staticSun.encodeStaticSunDepthMeters(preRg8DepthMeters, encoding);
            const cacheLightTexelCenter = [
                layout.boundsLightMeters.min[0]
                    + (globalX + 0.5) * layout.texelSizeMeters,
                layout.boundsLightMeters.min[1]
                    + (globalY + 0.5) * layout.texelSizeMeters
            ];
            const cachePlaneWorld = cacheRightWorld.clone()
                .multiplyScalar(cacheLightTexelCenter[0])
                .addScaledVector(cacheUpWorld, cacheLightTexelCenter[1]);
            const sourceRelative = cachePlaneWorld.sub(sourceMapCenterWorld);
            const sourceTexelCenterCoordinate = [
                (sourceRelative.dot(sourceRightWorld)
                    / pcf.shadowMapWorldExtentMeters[0] + 0.5)
                        * currentShadowMapSize[0],
                (sourceRelative.dot(sourceUpWorld)
                    / pcf.shadowMapWorldExtentMeters[1] + 0.5)
                        * currentShadowMapSize[1]
            ];
            const sourceShadowTexel = sourceTexelCenterCoordinate.map(Math.floor);
            if (sourceShadowTexel[0] < 0
                || sourceShadowTexel[0] >= currentShadowMapSize[0]
                || sourceShadowTexel[1] < 0
                || sourceShadowTexel[1] >= currentShadowMapSize[1]) {
                throw new Error('Lab residual source shadow tap escaped the live map');
            }
            const sourceKey = sourceShadowTexel.join(',');
            let currentSource = currentSourceReadbackCache.get(sourceKey);
            if (!currentSource) {
                const sample = sampleCurrentSourceDepth(sourceShadowTexel);
                const normalizedCurrentDepth = sample.normalizedDepth;
                const currentSourceDepthMeters = normalizedCurrentDepth >= 1 - 1e-7
                    ? null
                    : new THREE.Vector3(
                        (sourceShadowTexel[0] + 0.5) / currentShadowMapSize[0] * 2 - 1,
                        (sourceShadowTexel[1] + 0.5) / currentShadowMapSize[1] * 2 - 1,
                        normalizedCurrentDepth * 2 - 1
                    ).unproject(currentShadowCamera).dot(cacheDepthWorld);
                currentSource = {
                    comparisonIterations: sample.iterations,
                    normalizedDepthBracket: sample.normalizedDepthBracket,
                    normalizedDepth: normalizedCurrentDepth,
                    depthMeters: currentSourceDepthMeters
                };
                currentSourceReadbackCache.set(sourceKey, currentSource);
            }
            return {
                outOfBounds: false,
                quantized,
                preRg8DepthMeters,
                decodedDepthMeters,
                currentSourceDepthMeters: currentSource.depthMeters,
                currentSourceDepthBufferNormalized: currentSource.normalizedDepth,
                currentSourceDepthComparisonIterations:
                    currentSource.comparisonIterations,
                currentSourceDepthBracketNormalized:
                    currentSource.normalizedDepthBracket,
                sourceShadowTexel,
                sourceRasterTexel: [sourceX, globalY],
                rg8Bytes: [residentBytes[offset], residentBytes[offset + 1]],
                reencodedQuantized,
                quantizedMatchesPreRg8Encoding: quantized === reencodedQuantized
            };
        };
        let filterTrace;
        try {
            filterTrace = traceLabResidualVogelComparisons({
                comparisonDepthMeters,
                fragmentCoordinatePixels,
                globalCoordinate,
                readTap,
                sourceXLightTexels,
                sourceYLightTexels
            });
        } finally {
            renderer.setRenderTarget(
                previousRenderTarget,
                previousActiveCubeFace,
                previousActiveMipmapLevel
            );
            currentDepthSampleGeometry.dispose();
            currentDepthSampleMaterial.dispose();
            currentDepthSampleTarget.dispose();
        }
        const normalSunDot = receiverNormalWorld.dot(
            new THREE.Vector3(...identity.sunPointDirectionWorld).normalize()
        );
        return {
            schema: 'ai531-lab-one-pixel-depth-trace-v1',
            traceId: LAB_RESIDUAL_TAP_TRACE_ID,
            validationCaseId: validationCase.id,
            screenPixel: [...pixel],
            screenPixelCoordinateSystem: 'webgl-framebuffer-lower-left-origin-v1',
            evidencePngPixel: [pixel[0], gl.drawingBufferHeight - 1 - pixel[1]],
            residualClassification: {
                cacheLuma: missingOccluderSample.cacheLuma,
                cacheRgba: missingOccluderSample.cacheRgba,
                currentNeighborhoodMaximumLuma:
                    missingOccluderSample.currentNeighborhoodMaximumLuma,
                currentRgba: missingOccluderSample.currentRgba,
                dynamicReceiverNeighborhoodPixelCount:
                    missingOccluderSample.dynamicReceiverNeighborhoodPixelCount
            },
            receiverHit: {
                objectName: String(object.name || ''),
                distance: hit.distance,
                surfaceWorldPosition: hit.point.toArray(),
                barycentric: barycentric.toArray(),
                faceVertexIndices: [hit.face.a, hit.face.b, hit.face.c],
                materialIndex: hit.face.materialIndex,
                materialName: String(material?.name || ''),
                materialSide: Number(material?.side),
                materialAlphaTest: Number(material?.alphaTest || 0),
                materialAlphaToCoverage: material?.alphaToCoverage === true,
                hasAlphaMap: !!material?.alphaMap,
                hasColorMap: !!material?.map,
                uv: hit.uv?.toArray?.() ?? null,
                frontFacing,
                vertexWorldNormals: vertexWorldNormals.map((entry) => entry.toArray()),
                geometricOffsetWorldNormal: geometricOffsetWorldNormal.toArray(),
                receiverNormalWorld: receiverNormalWorld.toArray(),
                biasedWorldPosition: biasedWorldPosition.toArray()
            },
            receiverDepth: {
                lightPosition,
                receiverDepthMeters: lightPosition[2],
                geometricNormalOffsetMeters: bias.geometricNormalOffsetMeters,
                constantDepthReliefMeters: bias.constantDepthReliefMeters,
                comparisonDepthMeters,
                normalSunDot
            },
            sourceDepth: {
                method: 'same-bake-packed-rgba-depth-before-rg8-quantization-v1',
                sourceRasterDimensionsPixels: [source.width, source.height],
                sourceRasterToCacheGlobal: source.sourceRasterToCacheGlobal,
                currentSourceShadowMap:
                    'targeted-three-r183-native-depth-comparison-binary-search-v5',
                currentSourceShadowMapSizePixels: currentShadowMapSize,
                encoding
            },
            filterTrace
        };
    }

    const api = {
        async prepareProfile(profile, densityDiagnostic = null) {
            await disposePipeline();
            await clearCurrents();
            resetEvidenceCanvas();
            labPrewarmFailure = null;
            prepared = await buildLabFixture(profile, densityDiagnostic);
            pipeline = new StaticSunDepthPipeline(engine, {
                initialMode: 'current',
                fetchPackage: async (request) => {
                    const bytes = prepared.bytes.slice();
                    if (String(request.url).endsWith('/corrupt')) {
                        bytes[bytes.length - 1] ^= 0xff;
                    }
                    return bytes;
                },
                getLiveStaticSunDepthIdentity: () => ({...prepared.liveIdentity})
            });
            const originalPrewarm = pipeline._prewarm.bind(pipeline);
            pipeline._prewarm = async (...args) => {
                try {
                    return await originalPrewarm(...args);
                } catch (error) {
                    labPrewarmFailure = Object.freeze({
                        name: String(error?.name || 'Error'),
                        message: String(error?.message || error),
                        stack: String(error?.stack || '')
                    });
                    throw error;
                }
            };
            engine.installIlluminationPipeline(pipeline);
            return {
                fixture: prepared.fixture,
                diagnostics: withLabShaderFailures(pipeline.getDiagnostics())
            };
        },
        async activatePreparedProfile() {
            if (!pipeline || !prepared) throw new Error('No prepared Lab Scene fixture');
            const live = prepared.liveIdentity;
            await pipeline.setMode('auto', {
                url: 'memory://ai531-lab-fixture/valid',
                expectations: {
                    cityId: live.cityId,
                    lightingProfileId: live.lightingProfileId,
                    selectedCapabilityProfileId: capabilityProfileId,
                    resolvedSourceSha256: live.resolvedSourceSha256,
                    staticSunDepthSourceSha256: live.staticSunDepthSourceSha256
                }
            });
            for (let attempt = 0; attempt < 30; attempt++) {
                city.update(engine);
                engine.renderFrame();
                gl.finish();
                const diagnostics = pipeline.getDiagnostics();
                if (diagnostics.active) {
                    return withLabShaderFailures(pipeline.getDiagnostics());
                }
                const state = diagnostics.runtime?.controller?.state;
                if (state === 'failed' || state === 'fallback' || state === 'stale') {
                    return withLabShaderFailures(diagnostics);
                }
                await new Promise((resolve) => setTimeout(resolve, 0));
            }
            return withLabShaderFailures(pipeline.getDiagnostics());
        },
        async captureCurrent(validationCase, warmups) {
            applyCase(validationCase);
            renderFrames(warmups);
            const workload = renderMeasuredFrame();
            const capture = captureRgba();
            const receiverMask = captureDynamicBusReceiverMask();
            await putCurrent(validationCase.id, capture, receiverMask);
            const dynamicBusLiveShadowProof = validationCase.id
                === 'illum.lab.bus_grounding_default'
                ? proveDynamicBusLiveShadow(receiverMask)
                : null;
            const densityPhaseOracle = verifyPreparedDensityPhase(validationCase);
            const evidence = await publishEvidenceCapture('current', capture);
            return {
                workload,
                diagnostics: pipeline?.getDiagnostics?.() ?? null,
                dynamicBusLiveShadowProof,
                densityPhaseOracle,
                evidence
            };
        },
        async captureCache(validationCase, warmups) {
            if (!pipeline) throw new Error('Lab static-sun pipeline is absent');
            pipeline.setDebugMode('final');
            applyCase(validationCase);
            renderFrames(warmups);
            const workload = renderMeasuredFrame();
            const cache = captureRgba();
            await putCache(validationCase.id, cache);
            const readiness = hooks.getReadiness();
            const evidence = await publishEvidenceCapture('cache', cache);
            return {
                width: cache.width,
                height: cache.height,
                workload,
                diagnostics: pipeline.getDiagnostics(),
                dynamicBusOutsideStaticCity: readiness.dynamicBusOutsideStaticCity,
                dynamicBusCastShadow: readiness.dynamicBusCastShadow,
                evidence
            };
        },
        async captureComparisonAndCompare(validationCase, warmups) {
            if (!pipeline) throw new Error('Lab static-sun pipeline is absent');
            applyCase(validationCase);
            const stored = await getCurrent(validationCase.id);
            if (!stored?.pixels || !stored?.cachePixels) {
                throw new Error(
                    `Missing same-session Lab current/cache RGBA for '${validationCase.id}'`
                );
            }
            const current = {
                width: stored.width,
                height: stored.height,
                pixels: new Uint8Array(stored.pixels)
            };
            const cache = {
                width: stored.cacheWidth,
                height: stored.cacheHeight,
                pixels: new Uint8Array(stored.cachePixels)
            };
            const receiverMask = {
                width: stored.width,
                height: stored.height,
                pixels: new Uint8Array(stored.receiverMaskPixels),
                receiverPixelCount: stored.receiverMaskPixelCount,
                method: stored.receiverMaskMethod
            };
            pipeline.setDebugMode('seam');
            renderFrames(1);
            const seam = captureRgba();
            const missingOccluderSamples = [];
            const metrics = compareRgba(
                current,
                cache,
                seam,
                receiverMask,
                missingOccluderSamples
            );
            const raycaster = new THREE.Raycaster();
            for (const sample of missingOccluderSamples) {
                raycaster.setFromCamera(new THREE.Vector2(
                    sample.pixel[0] / Math.max(1, current.width - 1) * 2 - 1,
                    sample.pixel[1] / Math.max(1, current.height - 1) * 2 - 1
                ), engine.camera);
                sample.staticCityRayHits = raycaster.intersectObject(city.group, true)
                    .slice(0, 4)
                    .map((hit) => ({
                        distance: hit.distance,
                        objectName: String(hit.object?.name || ''),
                        pointWorld: hit.point.toArray()
                    }));
            }
            pipeline.setDebugMode('currentDifference');
            renderFrames(warmups);
            const workload = renderMeasuredFrame();
            const comparison = captureRgba();
            await deleteCurrent(validationCase.id);
            const readiness = hooks.getReadiness();
            const evidence = await publishEvidenceCapture('comparison', comparison);
            return {
                metrics,
                missingOccluderSamples,
                workload,
                width: comparison.width,
                height: comparison.height,
                diagnostics: pipeline.getDiagnostics(),
                dynamicBusOutsideStaticCity: readiness.dynamicBusOutsideStaticCity,
                dynamicBusCastShadow: readiness.dynamicBusCastShadow,
                evidence
            };
        },
        getEvidenceCanvasState,
        traceResidualTap,
        async captureVisibilityDebugProof(validationCase) {
            if (!pipeline?._active?.binding) {
                throw new Error('Lab static-sun profile is not active for visibility proof');
            }
            applyCase(validationCase);
            const fixture = city.group.getObjectByName('illumination_overhang_receiver_v1');
            if (!fixture) throw new Error('Lab overhang receiver fixture is absent');
            const previousDebugMode = pipeline.getDiagnostics().debugMode;
            try {
                pipeline.setDebugMode('visibility');
                renderFrames(2);
                const capture = captureRgba();
                const fractions = [0.15, 0.325, 0.5, 0.675, 0.85];
                const samplePixels = [];
                const receivers = [
                    ['OverhangRoadReceiver', 'horizontal'],
                    ['OverhangRoofAndUndersideReceiver', 'horizontal'],
                    ['OverhangVerticalWallReceiver', 'vertical']
                ];
                for (const [name, surface] of receivers) {
                    const receiver = fixture.getObjectByName(name);
                    if (!receiver) {
                        throw new Error("Lab visibility receiver '" + name + "' is absent");
                    }
                    const box = new THREE.Box3().setFromObject(receiver);
                    for (const first of fractions) {
                        for (const second of fractions) {
                            const world = surface === 'horizontal'
                                ? new THREE.Vector3(
                                    THREE.MathUtils.lerp(box.min.x, box.max.x, first),
                                    box.max.y,
                                    THREE.MathUtils.lerp(box.min.z, box.max.z, second)
                                )
                                : new THREE.Vector3(
                                    THREE.MathUtils.lerp(box.min.x, box.max.x, first),
                                    THREE.MathUtils.lerp(box.min.y, box.max.y, second),
                                    box.max.z
                                );
                            const projected = world.project(engine.camera);
                            if (Math.abs(projected.x) > 1 || Math.abs(projected.y) > 1) continue;
                            const x = Math.min(capture.width - 1, Math.max(
                                0,
                                Math.round((projected.x * 0.5 + 0.5) * (capture.width - 1))
                            ));
                            const y = Math.min(capture.height - 1, Math.max(
                                0,
                                Math.round((projected.y * 0.5 + 0.5) * (capture.height - 1))
                            ));
                            const offset = (y * capture.width + x) * 4;
                            samplePixels.push({
                                receiver: name,
                                x,
                                y,
                                rgba: Array.from(capture.pixels.subarray(offset, offset + 4))
                            });
                        }
                    }
                }
                let coloredSampleCount = 0;
                let litSampleCount = 0;
                let maxSampleChannelSpread = 0;
                for (const sample of samplePixels) {
                    const [red, green, blue] = sample.rgba;
                    const maximum = Math.max(red, green, blue);
                    const minimum = Math.min(red, green, blue);
                    const spread = maximum - minimum;
                    maxSampleChannelSpread = Math.max(maxSampleChannelSpread, spread);
                    if (maximum > 8) {
                        litSampleCount++;
                        if (spread > 4) coloredSampleCount++;
                    }
                }
                const bindingDirection = [
                    ...pipeline._active.binding.descriptor.identity.sunPointDirectionWorld
                ];
                const sampleBytes = new Uint8Array(samplePixels.length * 4);
                samplePixels.forEach((sample, index) => {
                    sampleBytes.set(sample.rgba, index * 4);
                });
                return {
                    bindingDirection,
                    bindingVariantKey: pipeline._active.binding.variantKey,
                    citySunDirection: city.sunRef.direction.toArray(),
                    coloredSampleCount,
                    litSampleCount,
                    maxSampleChannelSpread,
                    sampleCount: samplePixels.length,
                    samplePixels,
                    visibilitySampleSha256: await packageApi.rawSha256Hex(sampleBytes)
                };
            } finally {
                pipeline.setDebugMode(previousDebugMode);
                renderFrames(1);
            }
        },
        async proveCurrentFallback() {
            if (!pipeline || !prepared) throw new Error('No prepared Lab Scene fixture');
            const live = prepared.liveIdentity;
            let requestThrew = false;
            try {
                await pipeline.setMode('auto', {
                    url: 'memory://ai531-lab-fixture/corrupt',
                    expectations: {
                        cityId: live.cityId,
                        lightingProfileId: live.lightingProfileId,
                        selectedCapabilityProfileId: capabilityProfileId,
                        resolvedSourceSha256: live.resolvedSourceSha256,
                        staticSunDepthSourceSha256: live.staticSunDepthSourceSha256
                    }
                });
            } catch {
                requestThrew = true;
            }
            renderFrames(2);
            const diagnostics = pipeline.getDiagnostics();
            const restoredCasters = [...originalCasterStates.keys()]
                .filter((mesh) => mesh.castShadow === true).length;
            const readiness = hooks.getReadiness();
            const corruptPackageRejected = !diagnostics.active
                && diagnostics.runtime?.controller?.effectiveMode !== 'baked';
            return {
                passed: corruptPackageRejected
                    && restoredCasters === originalCasterStates.size
                    && readiness.dynamicBusOutsideStaticCity === true
                    && readiness.dynamicBusCastShadow === true,
                requestThrew,
                corruptPackageRejected,
                activeCacheAfterFailure: !!diagnostics.active,
                restoredCasterCount: restoredCasters,
                expectedRestoredCasterCount: originalCasterStates.size,
                dynamicBusOutsideStaticCity: readiness.dynamicBusOutsideStaticCity,
                dynamicBusCastShadow: readiness.dynamicBusCastShadow,
                diagnostics
            };
        },
        async dispose() {
            try {
                await disposePipeline();
                await clearCurrents();
            } finally {
                releaseEvidenceCanvas();
                renderer.renderBufferDirect = originalRenderBufferDirect;
                renderer.shadowMap.render = originalShadowRender;
                if (rendererDebug) {
                    if (ownsShaderErrorHandler) {
                        rendererDebug.onShaderError = originalShaderErrorHandler;
                    } else {
                        delete rendererDebug.onShaderError;
                    }
                }
                hooks.view.resumeAfterValidation();
                delete window.__ai531LabValidation;
            }
        }
    };
    mountEvidenceCanvas();
    window.__ai531LabValidation = Object.freeze(api);
    return hardware;
}
