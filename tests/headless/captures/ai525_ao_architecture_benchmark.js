// Runs AI 525 architecture experiments against the production city without changing shipped code.
// @ts-check

import * as THREE from 'three';
import {
    isWholeObjectAoExcludedReceiver,
    shouldApplyAoAlphaCutout
} from '/src/graphics/visuals/postprocessing/AoAlphaCutoutSupport.js';

const frame = /** @type {HTMLIFrameElement} */ (document.getElementById('game-frame'));
const statusElement = document.getElementById('benchmark-status');
const resultElement = document.getElementById('benchmark-result');
const params = new URLSearchParams(window.location.search);
const action = params.get('action') ?? 'profile';
const mode = params.get('mode') ?? 'retained';
const width = Math.max(320, Math.floor(Number(params.get('width')) || 1280));
const height = Math.max(180, Math.floor(Number(params.get('height')) || 696));
const repeatCount = Math.max(1, Math.min(4, Math.floor(Number(params.get('repeats')) || 2)));
const framesPerPose = Math.max(1, Math.min(8, Math.floor(Number(params.get('frames')) || 2)));
const aoMode = params.get('ao') === 'ssao' ? 'ssao' : 'gtao';
const aaMode = ['off', 'msaa', 'taa'].includes(params.get('aa') ?? '') ? params.get('aa') : 'msaa';

const DIRECTIONS = Object.freeze([
    { id: 'N', x: 0, z: -1 },
    { id: 'E', x: 1, z: 0 },
    { id: 'S', x: 0, z: 1 },
    { id: 'W', x: -1, z: 0 }
]);

const CAPTURE_POSES = Object.freeze({
    northwest_s: { x: 4, y: 3, direction: 'S' },
    north_center_w: { x: 12, y: 3, direction: 'W' },
    northeast_inner_w: { x: 17, y: 6, direction: 'W' },
    city_center_e: { x: 12, y: 14, direction: 'E' },
    city_center_w: { x: 12, y: 14, direction: 'W' },
    southwest_inner_n: { x: 7, y: 17, direction: 'N' },
    southwest_inner_e: { x: 7, y: 17, direction: 'E' },
    southeast_n: { x: 21, y: 22, direction: 'N' }
});

function setStatus(status, detail = '') {
    statusElement.textContent = detail ? `${status}:${detail}` : status;
}

function publishResult(result) {
    resultElement.textContent = JSON.stringify(result);
    setStatus('complete', `${action}:${mode}`);
}

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForGame() {
    for (let attempt = 0; attempt < 600; attempt += 1) {
        const gameWindow = frame?.contentWindow;
        const busSim = gameWindow?.__busSim;
        const state = busSim?.sm?.current;
        const visibility = state?.city?.getStaticVisibilityStatus?.();
        if (busSim?.sm?.currentName === 'game_mode' && visibility?.state === 'active') {
            return { gameWindow, engine: busSim.engine, state, city: state.city };
        }
        await sleep(250);
    }
    throw new Error('Production game did not reach active static visibility');
}

function installCapturePresentation(gameWindow) {
    const gameDocument = gameWindow.document;
    if (gameDocument.getElementById('ai525-capture-style')) return;
    const style = gameDocument.createElement('style');
    style.id = 'ai525-capture-style';
    style.textContent = `
        html, body, #game-viewport {
            height: 100% !important;
            margin: 0 !important;
            overflow: hidden !important;
            padding: 0 !important;
            width: 100% !important;
        }
        body > :not(#game-viewport),
        #game-viewport > :not(#game-canvas) {
            display: none !important;
        }
        #game-canvas {
            display: block !important;
            height: ${height}px !important;
            inset: 0 !important;
            margin: 0 !important;
            max-height: none !important;
            max-width: none !important;
            position: fixed !important;
            width: ${width}px !important;
        }
    `;
    gameDocument.head.appendChild(style);
}

function configureProductionSettings({ gameWindow, engine, state }) {
    engine.stop();
    state._updateChaseCamera = () => {};
    installCapturePresentation(gameWindow);
    engine.setShadowSettings({
        type: 'single',
        quality: 'high',
        cascades: 0,
        splitScale: 1,
        mergeCasters: true,
        instancedCasters: false
    });
    engine.setAntiAliasingSettings({
        mode: aaMode,
        msaa: { samples: 8 },
        taa: { jitter: 1, historyWeight: 0.9 }
    });
    const currentAo = engine._ambientOcclusion?.settings ?? {};
    engine.setAmbientOcclusionSettings({
        ...currentAo,
        mode: aoMode,
        alpha: { ...(currentAo.alpha ?? {}), handling: 'exclude', threshold: 0.36 },
        staticAo: { ...(currentAo.staticAo ?? {}), mode: 'off' },
        busContactShadow: { ...(currentAo.busContactShadow ?? {}), enabled: false },
        gtao: {
            ...(currentAo.gtao ?? {}),
            quality: 'high',
            denoise: false,
            debugView: false,
            updateMode: 'every_frame'
        },
        ssao: {
            ...(currentAo.ssao ?? {}),
            quality: 'high'
        }
    });
    engine._syncPixelRatio = () => {};
    engine.renderer.setPixelRatio(1);
    engine._post?.pipeline?.setPixelRatio?.(1);
    engine.setViewportSize(width, height);
}

function disableTextureMask(pipeline) {
    pipeline._aoExclusionPass.enabled = false;
    const originalSync = pipeline._syncGtaoFrameRuntime.bind(pipeline);
    pipeline._syncGtaoFrameRuntime = (...args) => {
        const result = originalSync(...args);
        const uniforms = pipeline._gtaoCache?.blendPass?.material?.uniforms;
        if (uniforms?.uUseAoExclusionMask) uniforms.uUseAoExclusionMask.value = 0;
        return result;
    };
    pipeline._syncAoReceiverMaskSupport?.({ enabled: false });
}

function createDepthStencilTexture(target) {
    const depthTexture = new THREE.DepthTexture(
        Math.max(1, Math.floor(target.width)),
        Math.max(1, Math.floor(target.height)),
        THREE.UnsignedInt248Type
    );
    depthTexture.format = THREE.DepthStencilFormat;
    depthTexture.magFilter = THREE.NearestFilter;
    depthTexture.minFilter = THREE.NearestFilter;
    depthTexture.generateMipmaps = false;
    depthTexture.name = 'ai525-visible-depth-stencil';
    return depthTexture;
}

function enableComposerStencil(pipeline) {
    for (const target of [pipeline.composer.renderTarget1, pipeline.composer.renderTarget2]) {
        const oldDepth = target.depthTexture;
        target.stencilBuffer = true;
        target.depthTexture = createDepthStencilTexture(target);
        target.dispose?.();
        oldDepth?.dispose?.();
    }
}

function collectReceiverUsage(scene) {
    const usages = [];
    const materialFlags = new Map();
    let receiverObjects = 0;
    let receiverGroups = 0;
    let transparentGroups = 0;
    scene.traverse((object) => {
        if (!object?.isMesh || !object.material) return;
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        const wholeObject = isWholeObjectAoExcludedReceiver(object);
        const flags = materials.map((material) => wholeObject || shouldApplyAoAlphaCutout(material, object));
        if (flags.some(Boolean)) receiverObjects += 1;
        receiverGroups += flags.filter(Boolean).length;
        transparentGroups += materials.filter((material) => material?.transparent === true && Number(material?.opacity ?? 1) < 1).length;
        usages.push({ object, materials, flags, isArray: Array.isArray(object.material) });
        materials.forEach((material, index) => {
            const flagsForMaterial = materialFlags.get(material) ?? new Set();
            flagsForMaterial.add(flags[index] ? 1 : 0);
            materialFlags.set(material, flagsForMaterial);
        });
    });
    return { usages, materialFlags, receiverObjects, receiverGroups, transparentGroups };
}

function installStencilCandidate(pipeline, scene) {
    if (aoMode !== 'gtao') {
        return { supported: false, reason: 'ssao_output_target_does_not_retain_visible_scene_stencil' };
    }
    const start = performance.now();
    enableComposerStencil(pipeline);
    const usage = collectReceiverUsage(scene);
    const cloneCache = new Map();
    let materialClones = 0;
    for (const entry of usage.usages) {
        const replacements = entry.materials.map((material, index) => {
            if (!entry.flags[index]) return material;
            let clone = cloneCache.get(material);
            if (clone) return clone;
            clone = material.clone();
            clone.name = `${material.name || material.type}:ai525-stencil-receiver`;
            clone.stencilWrite = true;
            clone.stencilRef = 1;
            clone.stencilFunc = THREE.AlwaysStencilFunc;
            clone.stencilFail = THREE.KeepStencilOp;
            clone.stencilZFail = THREE.KeepStencilOp;
            clone.stencilZPass = THREE.ReplaceStencilOp;
            clone.stencilFuncMask = 0xff;
            clone.stencilWriteMask = 0xff;
            cloneCache.set(material, clone);
            materialClones += 1;
            return clone;
        });
        entry.object.material = entry.isArray ? replacements : replacements[0];
    }
    const blendMaterial = pipeline._gtaoCache?.blendPass?.material;
    if (!blendMaterial) return { supported: false, reason: 'missing_gtao_blend_material' };
    blendMaterial.stencilWrite = true;
    blendMaterial.stencilRef = 1;
    blendMaterial.stencilFunc = THREE.NotEqualStencilFunc;
    blendMaterial.stencilFail = THREE.KeepStencilOp;
    blendMaterial.stencilZFail = THREE.KeepStencilOp;
    blendMaterial.stencilZPass = THREE.KeepStencilOp;
    blendMaterial.stencilFuncMask = 0xff;
    blendMaterial.stencilWriteMask = 0x00;
    disableTextureMask(pipeline);
    return {
        supported: true,
        installMs: performance.now() - start,
        receiverObjects: usage.receiverObjects,
        receiverGroups: usage.receiverGroups,
        materialClones,
        transparentGroups: usage.transparentGroups,
        extraPasses: 0,
        extraRenderTargetBytes: 0
    };
}

function patchPackedAlphaMaterial(material, marker) {
    const originalOnBeforeCompile = material.onBeforeCompile;
    const originalCacheKey = material.customProgramCacheKey?.bind(material);
    let patched = false;
    material.onBeforeCompile = (shader, renderer) => {
        originalOnBeforeCompile?.(shader, renderer);
        const token = '#include <opaque_fragment>';
        if (shader.fragmentShader.includes(token)) {
            shader.fragmentShader = shader.fragmentShader.replace(
                token,
                `${token}\n\tgl_FragColor.a = ${marker ? '1.0' : '0.0'};`
            );
            patched = true;
        }
    };
    material.customProgramCacheKey = () => `${originalCacheKey?.() ?? ''}|ai525-packed-alpha:${marker ? 1 : 0}`;
    material.needsUpdate = true;
    return () => patched;
}

function installPackedAlphaCandidate(pipeline, scene) {
    if (aoMode !== 'gtao') {
        return { supported: false, reason: 'ssao_output_target_does_not_preserve_visible_scene_destination_alpha' };
    }
    const start = performance.now();
    const usage = collectReceiverUsage(scene);
    const cloneCache = new Map();
    const patchChecks = [];
    let materialClones = 0;
    for (const entry of usage.usages) {
        const replacements = entry.materials.map((material, index) => {
            const marker = entry.flags[index] ? 1 : 0;
            const key = `${material.uuid}:${marker}`;
            let clone = cloneCache.get(key);
            if (clone) return clone;
            clone = material.clone();
            clone.name = `${material.name || material.type}:ai525-packed-${marker}`;
            patchChecks.push(patchPackedAlphaMaterial(clone, marker));
            cloneCache.set(key, clone);
            materialClones += 1;
            return clone;
        });
        entry.object.material = entry.isArray ? replacements : replacements[0];
    }
    const blendMaterial = pipeline._gtaoCache?.blendPass?.material;
    if (!blendMaterial) return { supported: false, reason: 'missing_gtao_blend_material' };
    blendMaterial.transparent = true;
    blendMaterial.blending = THREE.CustomBlending;
    blendMaterial.blendEquation = THREE.AddEquation;
    blendMaterial.blendSrc = THREE.OneMinusDstAlphaFactor;
    blendMaterial.blendDst = THREE.DstAlphaFactor;
    blendMaterial.blendEquationAlpha = THREE.AddEquation;
    blendMaterial.blendSrcAlpha = THREE.ZeroFactor;
    blendMaterial.blendDstAlpha = THREE.OneFactor;
    blendMaterial.needsUpdate = true;
    disableTextureMask(pipeline);
    return {
        supported: true,
        installMs: performance.now() - start,
        receiverObjects: usage.receiverObjects,
        receiverGroups: usage.receiverGroups,
        materialClones,
        transparentGroups: usage.transparentGroups,
        patchChecks,
        extraPasses: 0,
        extraRenderTargetBytes: 0
    };
}

function installArchitecture(engine) {
    const pipeline = engine._post?.pipeline;
    if (!pipeline) throw new Error('Post-processing pipeline unavailable');
    if (mode === 'legacy') {
        pipeline.setAoExclusionDepthReuseEnabledForDebug(false);
        return { supported: true, architecture: 'legacy_full_scene_mask' };
    }
    if (mode === 'retained') {
        pipeline.setAoExclusionDepthReuseEnabledForDebug(true);
        return { supported: true, architecture: 'retained_depth_receiver_mask' };
    }
    if (mode === 'ideal') {
        disableTextureMask(pipeline);
        return {
            supported: true,
            architecture: 'no_mask_upper_bound',
            visuallyCorrect: false,
            reason: 'excluded receivers intentionally receive AO'
        };
    }
    if (mode === 'stencil') return { architecture: 'visible_scene_stencil', ...installStencilCandidate(pipeline, engine.scene) };
    if (mode === 'packed') return { architecture: 'visible_scene_packed_alpha', ...installPackedAlphaCandidate(pipeline, engine.scene) };
    throw new Error(`Unknown AI 525 mode: ${mode}`);
}

function applyPose(engine, city, tileX, tileY, directionId, fov = 55) {
    const direction = DIRECTIONS.find((entry) => entry.id === directionId);
    if (!direction) throw new Error(`Unknown direction: ${directionId}`);
    const center = city.map.tileToWorldCenter(tileX, tileY);
    const cameraHeight = 3.6831812721965655;
    const pitch = THREE.MathUtils.degToRad(-9.67328903369499);
    const horizontal = Math.cos(pitch) * 20;
    engine.camera.position.set(center.x, cameraHeight, center.z);
    engine.camera.lookAt(
        center.x + direction.x * horizontal,
        cameraHeight + Math.sin(pitch) * 20,
        center.z + direction.z * horizontal
    );
    engine.camera.fov = fov;
    engine.camera.updateProjectionMatrix();
    engine.camera.updateMatrixWorld(true);
    return {
        position: { x: center.x, y: cameraHeight, z: center.z },
        direction: direction.id,
        tile: { x: tileX, y: tileY },
        fov
    };
}

function buildRegions(city) {
    const regions = [];
    const regionWidth = city.map.width / 5;
    const regionHeight = city.map.height / 5;
    if (!Number.isInteger(regionWidth) || !Number.isInteger(regionHeight)) {
        throw new Error(`Expected map dimensions divisible by five, got ${city.map.width}x${city.map.height}`);
    }
    for (let regionRow = 0; regionRow < 5; regionRow += 1) {
        for (let regionColumn = 0; regionColumn < 5; regionColumn += 1) {
            const minX = regionColumn * regionWidth;
            const maxX = minX + regionWidth - 1;
            const minY = regionRow * regionHeight;
            const maxY = minY + regionHeight - 1;
            const centerX = (minX + maxX) * 0.5;
            const centerY = (minY + maxY) * 0.5;
            const candidates = [];
            for (let y = minY; y <= maxY; y += 1) {
                for (let x = minX; x <= maxX; x += 1) {
                    if (city.map.kind[city.map.index(x, y)] !== 1) continue;
                    candidates.push({ x, y, distance: Math.hypot(x - centerX, y - centerY) });
                }
            }
            candidates.sort((a, b) => a.distance - b.distance || a.y - b.y || a.x - b.x);
            if (!candidates.length) throw new Error(`Region R${regionRow + 1}C${regionColumn + 1} has no road camera cell`);
            regions.push({
                id: `R${regionRow + 1}C${regionColumn + 1}`,
                cameraCell: { x: candidates[0].x, y: candidates[0].y }
            });
        }
    }
    return regions;
}

function percentile(sorted, fraction) {
    if (!sorted.length) return 0;
    const position = (sorted.length - 1) * fraction;
    const lower = Math.floor(position);
    const upper = Math.ceil(position);
    if (lower === upper) return sorted[lower];
    return sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower);
}

function statistics(values) {
    const numbers = values.map(Number).filter(Number.isFinite).sort((a, b) => a - b);
    const mean = numbers.reduce((sum, value) => sum + value, 0) / Math.max(1, numbers.length);
    const variance = numbers.reduce((sum, value) => sum + (value - mean) ** 2, 0) / Math.max(1, numbers.length);
    return {
        count: numbers.length,
        mean,
        median: percentile(numbers, 0.5),
        p10: percentile(numbers, 0.1),
        p90: percentile(numbers, 0.9),
        min: numbers[0] ?? 0,
        max: numbers.at(-1) ?? 0,
        standardDeviation: Math.sqrt(variance)
    };
}

function average(values) {
    return values.reduce((sum, value) => sum + Number(value || 0), 0) / Math.max(1, values.length);
}

async function runProfile(context, architecture) {
    const { engine, city } = context;
    const renderer = engine.renderer;
    const gl = renderer.getContext();
    const regions = buildRegions(city);
    const frames = [];
    const runMeans = [];
    let logicalNow = performance.now();

    function updateVisibility() {
        city.setStaticVisibilitySettings({
            enabled: true,
            categories: { buildings: true, traffic_lights: true, traffic_signs: true, trees: true },
            diagnostics: true
        });
        logicalNow += 1000;
        city.updateStaticVisibility(engine.camera, logicalNow);
        logicalNow += 1000;
        city.updateStaticVisibility(engine.camera, logicalNow);
    }

    function renderFrame() {
        const start = performance.now();
        city.update(engine);
        logicalNow += 16.6667;
        city.updateStaticVisibility(engine.camera, logicalNow);
        engine.renderFrame();
        gl.finish();
        const frameMs = performance.now() - start;
        const info = renderer.info.render;
        const aoStats = engine.getAmbientOcclusionDebugInfo?.()?.alpha?.frameStats ?? null;
        return {
            frameMs,
            calls: Number(info.calls || 0),
            triangles: Number(info.triangles || 0),
            lines: Number(info.lines || 0),
            points: Number(info.points || 0),
            maskCalls: Number(aoStats?.maskCalls || 0),
            maskTriangles: Number(aoStats?.maskTriangles || 0),
            candidateTestMs: Number(aoStats?.candidateTestMs || 0),
            maskStrategy: aoStats?.maskStrategy ?? (mode === 'stencil' ? 'visible_scene_stencil' : mode === 'packed' ? 'visible_scene_packed_alpha' : mode)
        };
    }

    const firstFrameStart = performance.now();
    renderFrame();
    gl.finish();
    const firstFrameMs = performance.now() - firstFrameStart;
    const initialPrograms = renderer.info?.programs?.length ?? 0;

    for (let repeat = 0; repeat < repeatCount; repeat += 1) {
        const runFrames = [];
        for (let regionIndex = 0; regionIndex < regions.length; regionIndex += 1) {
            const region = regions[regionIndex];
            for (const direction of DIRECTIONS) {
                applyPose(engine, city, region.cameraCell.x, region.cameraCell.y, direction.id);
                updateVisibility();
                renderFrame();
                for (let frameIndex = 0; frameIndex < framesPerPose; frameIndex += 1) {
                    const measurement = renderFrame();
                    const row = { repeat, region: region.id, direction: direction.id, ...measurement };
                    frames.push(row);
                    runFrames.push(row);
                }
            }
            setStatus('profiling', `${mode}:run${repeat + 1}:${regionIndex + 1}/25`);
            await sleep(0);
        }
        runMeans.push({
            repeat,
            frameMs: average(runFrames.map((row) => row.frameMs)),
            calls: average(runFrames.map((row) => row.calls)),
            triangles: average(runFrames.map((row) => row.triangles))
        });
    }

    const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
    const rendererName = debugInfo
        ? gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL)
        : gl.getParameter(gl.RENDERER);
    const patchedChecks = Array.isArray(architecture.patchChecks) ? architecture.patchChecks : [];
    const patchedMaterialCount = patchedChecks.filter((check) => check()).length;
    const unsupportedPatchedMaterialCount = patchedChecks.length - patchedMaterialCount;
    delete architecture.patchChecks;

    return {
        generatedAt: new Date().toISOString(),
        mode,
        architecture: {
            ...architecture,
            patchedMaterialCount,
            unsupportedPatchedMaterialCount
        },
        conditions: {
            hardware: rendererName,
            webgl2: renderer.capabilities?.isWebGL2 === true,
            width,
            height,
            pixelRatio: 1,
            aoMode,
            aaMode,
            msaaSamples: engine.getAntiAliasingDebugInfo?.()?.msaaActiveSamples ?? 0,
            shadows: 'high single, merged casters',
            visibility: city.getStaticVisibilityStatus?.(),
            regions: 25,
            directions: 4,
            repeats: repeatCount,
            framesPerPose,
            measuredFrames: frames.length,
            warmupFramesPerPose: 1,
            synchronization: 'gl.finish() after every measured frame'
        },
        summary: {
            frameMs: statistics(frames.map((row) => row.frameMs)),
            derivedFpsFromMean: 1000 / average(frames.map((row) => row.frameMs)),
            calls: statistics(frames.map((row) => row.calls)),
            triangles: statistics(frames.map((row) => row.triangles)),
            maskCalls: statistics(frames.map((row) => row.maskCalls)),
            maskTriangles: statistics(frames.map((row) => row.maskTriangles)),
            candidateTestMs: statistics(frames.map((row) => row.candidateTestMs)),
            firstFrameMs,
            initialPrograms,
            finalPrograms: renderer.info?.programs?.length ?? 0,
            runMeans
        },
        frames
    };
}

async function runCapture(context, architecture) {
    const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    const poseId = hashParams.get('pose') ?? params.get('pose') ?? 'southeast_n';
    const pose = CAPTURE_POSES[poseId];
    if (!pose) throw new Error(`Unknown capture pose: ${poseId}`);
    const fov = Math.max(15, Math.min(75, Number(hashParams.get('fov') ?? params.get('fov')) || 55));
    const camera = applyPose(context.engine, context.city, pose.x, pose.y, pose.direction, fov);
    let logicalNow = performance.now();
    for (let index = 0; index < 2; index += 1) {
        logicalNow += 1000;
        context.city.updateStaticVisibility(context.engine.camera, logicalNow);
    }
    for (let frameIndex = 0; frameIndex < 10; frameIndex += 1) context.engine.renderFrame();
    context.engine.renderer.getContext().finish();
    return {
        generatedAt: new Date().toISOString(),
        mode,
        poseId,
        camera,
        architecture: { ...architecture, patchChecks: undefined },
        renderer: {
            width: context.engine.renderer.domElement.width,
            height: context.engine.renderer.domElement.height,
            pixelRatio: context.engine.renderer.getPixelRatio()
        },
        ambientOcclusion: context.engine.getAmbientOcclusionDebugInfo?.(),
        antiAliasing: context.engine.getAntiAliasingDebugInfo?.(),
        visibility: context.city.getStaticVisibilityStatus?.()
    };
}

async function runMrtMicrobenchmark(context) {
    const renderer = context.engine.renderer;
    const gl = renderer.getContext();
    const RuntimeTHREE = await context.gameWindow.eval('import("three")');
    const resolutions = [
        { width: 1280, height: 696 },
        { width: 1920, height: 1080 },
        { width: 3840, height: 2160 }
    ];
    const results = [];
    const scene = new RuntimeTHREE.Scene();
    const camera = new RuntimeTHREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const geometry = new RuntimeTHREE.PlaneGeometry(2, 2);
    const singleMaterial = new RuntimeTHREE.RawShaderMaterial({
        glslVersion: RuntimeTHREE.GLSL3,
        vertexShader: 'in vec3 position; void main(){ gl_Position = vec4(position, 1.0); }',
        fragmentShader: 'precision highp float; layout(location=0) out vec4 color0; void main(){ color0=vec4(0.31,0.47,0.73,1.0); }',
        depthTest: false,
        depthWrite: false
    });
    const mrtMaterial = new RuntimeTHREE.RawShaderMaterial({
        glslVersion: RuntimeTHREE.GLSL3,
        vertexShader: 'in vec3 position; void main(){ gl_Position = vec4(position, 1.0); }',
        fragmentShader: 'precision highp float; layout(location=0) out vec4 color0; layout(location=1) out vec4 mask1; void main(){ color0=vec4(0.31,0.47,0.73,1.0); mask1=vec4(1.0,0.0,0.0,1.0); }',
        depthTest: false,
        depthWrite: false
    });
    const quad = new RuntimeTHREE.Mesh(geometry, singleMaterial);
    scene.add(quad);

    for (const resolution of resolutions) {
        const singleTarget = new RuntimeTHREE.WebGLRenderTarget(resolution.width, resolution.height, {
            minFilter: RuntimeTHREE.NearestFilter,
            magFilter: RuntimeTHREE.NearestFilter,
            depthBuffer: false,
            stencilBuffer: false,
            count: 1
        });
        const mrtTarget = new RuntimeTHREE.WebGLRenderTarget(resolution.width, resolution.height, {
            minFilter: RuntimeTHREE.NearestFilter,
            magFilter: RuntimeTHREE.NearestFilter,
            depthBuffer: false,
            stencilBuffer: false,
            count: 2
        });
        const outputTarget = new RuntimeTHREE.WebGLRenderTarget(resolution.width, resolution.height, {
            minFilter: RuntimeTHREE.NearestFilter,
            magFilter: RuntimeTHREE.NearestFilter,
            depthBuffer: false,
            stencilBuffer: false
        });
        const compositeMaterial = new RuntimeTHREE.RawShaderMaterial({
            glslVersion: RuntimeTHREE.GLSL3,
            uniforms: {
                colorTexture: { value: mrtTarget.textures[0] },
                maskTexture: { value: mrtTarget.textures[1] }
            },
            vertexShader: 'in vec3 position; out vec2 uv525; void main(){ uv525=position.xy*0.5+0.5; gl_Position=vec4(position,1.0); }',
            fragmentShader: 'precision highp float; uniform sampler2D colorTexture; uniform sampler2D maskTexture; in vec2 uv525; layout(location=0) out vec4 color0; void main(){ vec4 c=texture(colorTexture,uv525); float m=texture(maskTexture,uv525).r; color0=vec4(mix(c.rgb,vec3(1.0),m*0.0),1.0); }',
            depthTest: false,
            depthWrite: false
        });

        function renderSingle() {
            quad.material = singleMaterial;
            renderer.setRenderTarget(singleTarget);
            renderer.clear();
            renderer.render(scene, camera);
        }
        function renderMrt() {
            quad.material = mrtMaterial;
            renderer.setRenderTarget(mrtTarget);
            renderer.clear();
            renderer.render(scene, camera);
        }
        function renderMrtComposite() {
            renderMrt();
            quad.material = compositeMaterial;
            renderer.setRenderTarget(outputTarget);
            renderer.clear();
            renderer.render(scene, camera);
        }
        for (let warmup = 0; warmup < 20; warmup += 1) {
            renderSingle();
            renderMrt();
            renderMrtComposite();
        }
        gl.finish();
        const sampleCount = 40;
        const iterationsPerSample = resolution.width >= 3840 ? 8 : 20;
        const modes = [
            ['single', renderSingle],
            ['mrt_write', renderMrt],
            ['mrt_write_and_composite', renderMrtComposite]
        ];
        const samples = {};
        for (const [id, render] of modes) {
            const values = [];
            for (let sample = 0; sample < sampleCount; sample += 1) {
                const start = performance.now();
                for (let iteration = 0; iteration < iterationsPerSample; iteration += 1) render();
                gl.finish();
                values.push((performance.now() - start) / iterationsPerSample);
            }
            samples[id] = statistics(values);
        }
        const pixel = new Uint8Array(4);
        renderer.setRenderTarget(mrtTarget);
        gl.readBuffer(gl.COLOR_ATTACHMENT1);
        gl.readPixels(Math.floor(resolution.width / 2), Math.floor(resolution.height / 2), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
        gl.readBuffer(gl.COLOR_ATTACHMENT0);
        const attachmentBytes = resolution.width * resolution.height * 4;
        results.push({
            ...resolution,
            sampleCount,
            iterationsPerSample,
            samples,
            maskAttachmentCenterPixel: Array.from(pixel),
            incrementalAttachmentBytes: attachmentBytes,
            extraCompositeTargetBytes: attachmentBytes,
            estimatedMinimumExtraBytesPerFrame: attachmentBytes * 3
        });
        singleTarget.dispose();
        mrtTarget.dispose();
        outputTarget.dispose();
        compositeMaterial.dispose();
        await sleep(0);
    }
    renderer.setRenderTarget(null);
    geometry.dispose();
    singleMaterial.dispose();
    mrtMaterial.dispose();
    return {
        generatedAt: new Date().toISOString(),
        architecture: 'mrt_dedicated_channel_microbenchmark',
        capabilities: {
            webgl2: renderer.capabilities?.isWebGL2 === true,
            maxColorAttachments: gl.getParameter(gl.MAX_COLOR_ATTACHMENTS),
            maxDrawBuffers: gl.getParameter(gl.MAX_DRAW_BUFFERS)
        },
        results
    };
}

async function main() {
    setStatus('loading', action);
    const context = await waitForGame();
    configureProductionSettings(context);
    await sleep(2500);
    if (action === 'mrt') {
        publishResult(await runMrtMicrobenchmark(context));
        return;
    }
    const architecture = installArchitecture(context.engine);
    if (architecture.supported === false) {
        publishResult({ generatedAt: new Date().toISOString(), action, mode, architecture });
        return;
    }
    await sleep(1500);
    if (action === 'capture') {
        const renderCurrentCapture = async () => publishResult(await runCapture(context, architecture));
        window.addEventListener('hashchange', () => {
            setStatus('rendering', `${mode}:${window.location.hash}`);
            renderCurrentCapture().catch((error) => {
                resultElement.textContent = JSON.stringify({ error: error?.stack ?? String(error) });
                setStatus('error', error?.message ?? String(error));
            });
        });
        await renderCurrentCapture();
        return;
    }
    publishResult(await runProfile(context, architecture));
}

main().catch((error) => {
    const result = {
        generatedAt: new Date().toISOString(),
        action,
        mode,
        error: error?.stack ?? error?.message ?? String(error)
    };
    resultElement.textContent = JSON.stringify(result);
    setStatus('error', error?.message ?? String(error));
});
