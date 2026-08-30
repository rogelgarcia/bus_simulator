// Deterministic production-city camera controller for AI 524 4K A/B captures.
// @ts-check

const LOCATIONS = Object.freeze([
    { id: 'northwest', region: 'R1C1', x: 4, y: 3 },
    { id: 'north_center', region: 'R1C3', x: 12, y: 3 },
    { id: 'northeast_inner', region: 'R2C4', x: 17, y: 6 },
    { id: 'city_center', region: 'R3C3', x: 12, y: 14 },
    { id: 'southwest_inner', region: 'R4C2', x: 7, y: 17 },
    { id: 'southeast', region: 'R5C5', x: 21, y: 22 }
]);

const DIRECTIONS = Object.freeze([
    { id: 'N', x: 0, z: -1 },
    { id: 'E', x: 1, z: 0 },
    { id: 'S', x: 0, z: 1 },
    { id: 'W', x: -1, z: 0 }
]);

const POSES = Object.freeze(LOCATIONS.flatMap((location) => DIRECTIONS.map((direction) => Object.freeze({
    id: `${location.id}_${direction.id.toLowerCase()}`,
    location: location.id,
    region: location.region,
    tile: { x: location.x, y: location.y },
    direction: direction.id,
    directionVector: { x: direction.x, z: direction.z }
}))));

const frame = document.getElementById('game-frame');
const statusElement = document.getElementById('capture-status');
const captureMetadataElement = document.getElementById('capture-metadata');
const CAPTURE_WIDTH = 3840;
const CAPTURE_HEIGHT = 2160;
let initialized = false;
let generation = 0;
let logicalNow = performance.now();

window.__ao524Capture = {
    status: 'booting',
    key: null,
    poses: POSES,
    result: null,
    error: null
};

function setStatus(status, details = {}) {
    Object.assign(window.__ao524Capture, { status, ...details });
    statusElement.textContent = status === 'ready' ? `ready:${details.key}` : status;
}

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForProductionGame() {
    for (let attempt = 0; attempt < 240; attempt += 1) {
        const gameWindow = frame?.contentWindow;
        const busSim = gameWindow?.__busSim;
        const state = busSim?.sm?.current;
        const visibility = state?.city?.getStaticVisibilityStatus?.();
        if (busSim?.sm?.currentName === 'game_mode' && visibility?.state === 'active') {
            return { gameWindow, engine: busSim.engine, state, city: state.city };
        }
        await sleep(500);
    }
    throw new Error('Production game did not reach active static visibility');
}

function installCapturePresentation(gameWindow) {
    const gameDocument = gameWindow.document;
    if (gameDocument.getElementById('ao524-capture-style')) return;
    const style = gameDocument.createElement('style');
    style.id = 'ao524-capture-style';
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
            height: ${CAPTURE_HEIGHT}px !important;
            inset: 0 !important;
            margin: 0 !important;
            max-height: none !important;
            max-width: none !important;
            position: fixed !important;
            width: ${CAPTURE_WIDTH}px !important;
        }
    `;
    gameDocument.head.appendChild(style);
}

function applyStableProductionSettings(engine) {
    engine.setShadowSettings({
        type: 'single',
        quality: 'high',
        cascades: 0,
        splitScale: 1,
        mergeCasters: true,
        instancedCasters: false
    });
    engine.setAntiAliasingSettings({ mode: 'msaa', msaa: { samples: 8 } });
    const currentAo = engine.ambientOcclusionSettings ?? {};
    engine.setAmbientOcclusionSettings({
        ...currentAo,
        mode: 'gtao',
        alpha: { ...(currentAo.alpha ?? {}), handling: 'exclude', threshold: 0.36 },
        staticAo: { ...(currentAo.staticAo ?? {}), mode: 'off' },
        busContactShadow: { ...(currentAo.busContactShadow ?? {}), enabled: false },
        gtao: {
            ...(currentAo.gtao ?? {}),
            quality: 'high',
            denoise: false,
            debugView: false,
            updateMode: 'every_frame'
        }
    });
}

function parseCaptureRequest() {
    const params = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    const poseId = params.get('pose') ?? POSES[0].id;
    const mode = params.get('mode') === 'legacy' ? 'legacy' : 'optimized';
    const pose = POSES.find((entry) => entry.id === poseId);
    if (!pose) throw new Error(`Unknown capture pose: ${poseId}`);
    return { pose, mode, key: `${mode}:${pose.id}` };
}

async function renderCaptureRequest() {
    const requestGeneration = ++generation;
    const request = parseCaptureRequest();
    setStatus('rendering', { key: request.key, error: null });

    const { gameWindow, engine, state, city } = await waitForProductionGame();
    if (requestGeneration !== generation) return;

    if (!initialized) {
        engine.stop();
        state._updateChaseCamera = () => {};
        installCapturePresentation(gameWindow);
        applyStableProductionSettings(engine);
        engine._syncPixelRatio = () => {};
        engine.renderer.setPixelRatio(1);
        engine._post?.pipeline?.setPixelRatio?.(1);
        engine.setViewportSize(CAPTURE_WIDTH, CAPTURE_HEIGHT);
        await sleep(3000);
        initialized = true;
    }

    const center = city.map.tileToWorldCenter(request.pose.tile.x, request.pose.tile.y);
    const cameraHeight = 3.6831812721965655;
    const pitchRadians = -9.67328903369499 * Math.PI / 180;
    const horizontal = Math.cos(pitchRadians) * 20;
    const target = {
        x: center.x + request.pose.directionVector.x * horizontal,
        y: cameraHeight + Math.sin(pitchRadians) * 20,
        z: center.z + request.pose.directionVector.z * horizontal
    };

    engine.camera.position.set(center.x, cameraHeight, center.z);
    engine.camera.lookAt(target.x, target.y, target.z);
    engine.camera.fov = 55;
    engine.camera.updateProjectionMatrix();
    engine.camera.updateMatrixWorld(true);
    engine._post?.pipeline?.setAoExclusionDepthReuseEnabledForDebug?.(request.mode !== 'legacy');

    logicalNow += 1000;
    city.updateStaticVisibility(engine.camera, logicalNow);
    logicalNow += 1000;
    city.updateStaticVisibility(engine.camera, logicalNow);

    for (let frameIndex = 0; frameIndex < 8; frameIndex += 1) {
        engine.renderFrame();
    }
    const gl = engine.renderer.getContext();
    gl.finish();

    const result = {
        key: request.key,
        mode: request.mode,
        pose: request.pose,
        camera: {
            position: { x: center.x, y: cameraHeight, z: center.z },
            target,
            fov: 55,
            near: engine.camera.near,
            far: engine.camera.far
        },
        renderer: {
            width: engine.renderer.domElement.width,
            height: engine.renderer.domElement.height,
            pixelRatio: engine.renderer.getPixelRatio(),
            drawingBuffer: {
                width: gl.drawingBufferWidth,
                height: gl.drawingBufferHeight,
                viewport: Array.from(gl.getParameter(gl.VIEWPORT)),
                scissor: Array.from(gl.getParameter(gl.SCISSOR_BOX)),
                scissorEnabled: gl.isEnabled(gl.SCISSOR_TEST),
                framebufferBound: !!gl.getParameter(gl.FRAMEBUFFER_BINDING)
            }
        },
        antiAliasing: engine.getAntiAliasingDebugInfo(),
        ambientOcclusion: engine.getAmbientOcclusionDebugInfo(),
        visibility: city.getStaticVisibilityStatus(),
        visibilityDiagnostics: city.getStaticVisibilityDiagnostics()
    };
    if (requestGeneration !== generation) return;
    captureMetadataElement.textContent = JSON.stringify(result);
    setStatus('ready', { key: request.key, result, error: null });
}

window.addEventListener('hashchange', () => {
    renderCaptureRequest().catch((error) => {
        setStatus('error', { error: error?.stack ?? error?.message ?? String(error) });
    });
});

renderCaptureRequest().catch((error) => {
    setStatus('error', { error: error?.stack ?? error?.message ?? String(error) });
});
