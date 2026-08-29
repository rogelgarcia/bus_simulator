import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '../..');
const args = new Map();
for (let index = 2; index < process.argv.length; index += 1) {
    const token = process.argv[index];
    if (!token.startsWith('--')) continue;
    const next = process.argv[index + 1];
    if (next && !next.startsWith('--')) {
        args.set(token, next);
        index += 1;
    } else {
        args.set(token, true);
    }
}

const requestedPort = Math.max(1024, Number(args.get('--port')) || 4173);
const outputPath = path.resolve(repoRoot, String(args.get('--report') || 'tests/artifacts/static_visibility_runtime/report.json'));
let server = null;
let browser = null;

function canListen(port) {
    return new Promise((resolve) => {
        const probe = net.createServer();
        probe.once('error', () => resolve(false));
        probe.listen(port, '127.0.0.1', () => probe.close(() => resolve(true)));
    });
}

async function findFreePort(startPort) {
    for (let port = startPort; port < startPort + 200; port += 1) if (await canListen(port)) return port;
    throw new Error(`No free runtime-validation port found from ${startPort}`);
}

async function waitForServer(url) {
    for (let attempt = 0; attempt < 150; attempt += 1) {
        try {
            const response = await fetch(`${url}/__health`);
            if (response.ok) return;
        } catch {}
        await new Promise((resolve) => setTimeout(resolve, 200));
    }
    throw new Error(`Runtime validator could not reach ${url}`);
}

try {
    const port = args.has('--url') ? requestedPort : await findFreePort(requestedPort);
    const baseUrl = String(args.get('--url') || `http://127.0.0.1:${port}`);
    if (!args.has('--url')) {
        server = spawn(process.execPath, ['tests/headless/e2e/static_server.mjs'], {
            cwd: repoRoot,
            env: { ...process.env, PORT: String(port) },
            stdio: ['ignore', 'ignore', 'inherit']
        });
        await waitForServer(baseUrl);
    }

    const chromePath = String(process.env.PLAYWRIGHT_EXECUTABLE_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe');
    browser = await chromium.launch({
        headless: true,
        ...(existsSync(chromePath) ? { executablePath: chromePath } : {}),
        args: ['--disable-background-timer-throttling', '--disable-renderer-backgrounding']
    });
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    page.setDefaultTimeout(0);
    page.on('console', (message) => {
        if (message.text().startsWith('[StaticVisibilityRuntime]')) process.stdout.write(`${message.text()}\n`);
    });
    await page.addInitScript(() => localStorage.removeItem('bus_sim.staticVisibility.v1'));
    await page.goto(`${baseUrl}/?pose=civic_center_curve_front&coreTests=0`);
    await page.waitForFunction(() => {
        const city = window.__busSim?.sm?.current?.city;
        return window.__busSim?.sm?.currentName === 'game_mode'
            && city?.getStaticVisibilityStatus?.().state === 'active';
    }, null, { timeout: 120_000 });

    const report = await page.evaluate(async () => {
        const THREE = await import('three');
        const { engine, sm } = window.__busSim;
        const state = sm.current;
        const city = state.city;
        const renderer = engine.renderer;
        const gl = renderer.getContext();
        const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
        engine.stop();
        state._updateChaseCamera = () => {};

        const roots = [
            ...city.buildings.group.children.filter((root) => root.name !== 'BuildingSlabs'),
            ...city.trafficControls.group.children,
            ...city.world.trees.group.children
        ];
        const roadCells = [];
        for (let index = 0; index < city.map.width * city.map.height; index += 1) {
            if (city.map.kind[index] === 1) roadCells.push(index);
        }
        const chosenCells = [roadCells[8], roadCells[Math.floor(roadCells.length / 2)], roadCells[roadCells.length - 9]];
        const poses = chosenCells.map((cellIndex, index) => {
            const center = city.map.tileToWorldCenter(cellIndex % city.map.width, Math.floor(cellIndex / city.map.width));
            return {
                id: ['north_open', 'central_intersection', 'south_dense'][index],
                x: center.x,
                y: [1.22, 3.6831812721965655, 6.146362544393131][index],
                z: center.z,
                yaw: [0.2, 2.1, 4.4][index],
                pitchDeg: [20, -10, -35][index]
            };
        });

        function applyPose(pose) {
            const pitch = THREE.MathUtils.degToRad(pose.pitchDeg);
            engine.camera.position.set(pose.x, pose.y, pose.z);
            engine.camera.lookAt(
                pose.x + Math.sin(pose.yaw) * Math.cos(pitch) * 15,
                pose.y + Math.sin(pitch) * 15,
                pose.z + Math.cos(pose.yaw) * Math.cos(pitch) * 15
            );
            engine.camera.updateMatrixWorld(true);
            engine.camera.updateProjectionMatrix();
        }

        function setPvs(enabled) {
            city.setStaticVisibilitySettings({
                enabled,
                categories: { buildings: true, traffic_lights: true, traffic_signs: true, trees: true },
                diagnostics: true
            });
            if (enabled) {
                const now = performance.now();
                city.updateStaticVisibility(engine.camera, now);
                city.updateStaticVisibility(engine.camera, now + 1000);
            }
        }

        function renderFrames(count) {
            const started = performance.now();
            for (let frame = 0; frame < count; frame += 1) {
                city.update(engine);
                city.updateStaticVisibility(engine.camera, performance.now() + frame);
                engine.renderFrame();
                gl.finish();
            }
            const elapsedMs = performance.now() - started;
            return {
                frames: count,
                totalMs: elapsedMs,
                averageMs: elapsedMs / count,
                calls: renderer.info.render.calls,
                triangles: renderer.info.render.triangles,
                points: renderer.info.render.points,
                lines: renderer.info.render.lines,
                hiddenRoots: roots.filter((root) => root.visible === false).length,
                diagnostics: city.getStaticVisibilityDiagnostics()
            };
        }

        const benchmark = [];
        engine.setShadowSettings({ ...engine.shadowSettings, type: 'single', quality: 'low' });
        city.applyShadowSettings(engine);
        function summarizeSamples(samples) {
            const ordered = [...samples].sort((a, b) => a.averageMs - b.averageMs);
            const fastest = ordered[0];
            const median = ordered[Math.floor(ordered.length / 2)].averageMs;
            return {
                ...fastest,
                medianMs: median,
                samplesMs: samples.map((sample) => sample.averageMs)
            };
        }
        for (const pose of poses) {
            applyPose(pose);
            setPvs(false);
            renderFrames(5);
            setPvs(true);
            renderFrames(5);
            const samples = { off: [], on: [] };
            for (const enabled of [false, true, true, false, false, true, true, false]) {
                setPvs(enabled);
                samples[enabled ? 'on' : 'off'].push(renderFrames(12));
            }
            benchmark.push({ pose, off: summarizeSamples(samples.off), on: summarizeSamples(samples.on) });
        }

        function captureDirect() {
            const width = 1280;
            const height = 720;
            const target = new THREE.WebGLRenderTarget(width, height, {
                minFilter: THREE.NearestFilter,
                magFilter: THREE.NearestFilter,
                format: THREE.RGBAFormat,
                type: THREE.UnsignedByteType,
                depthBuffer: true,
                stencilBuffer: false
            });
            const pixels = new Uint8Array(width * height * 4);
            const previous = renderer.getRenderTarget();
            renderer.setRenderTarget(target);
            renderer.clear(true, true, true);
            renderer.shadowMap.needsUpdate = true;
            renderer.render(engine.scene, engine.camera);
            renderer.readRenderTargetPixels(target, 0, 0, width, height, pixels);
            renderer.setRenderTarget(previous);
            target.dispose();
            return pixels;
        }

        function comparePixels(a, b) {
            let changedPixels = 0;
            let changedChannels = 0;
            let absoluteDifference = 0;
            let maxDifference = 0;
            for (let index = 0; index < a.length; index += 4) {
                let pixelChanged = false;
                for (let channel = 0; channel < 4; channel += 1) {
                    const difference = Math.abs(a[index + channel] - b[index + channel]);
                    if (!difference) continue;
                    pixelChanged = true;
                    changedChannels += 1;
                    absoluteDifference += difference;
                    maxDifference = Math.max(maxDifference, difference);
                }
                if (pixelChanged) changedPixels += 1;
            }
            return {
                changedPixels,
                changedChannels,
                maxDifference,
                meanAbsoluteDifference: absoluteDifference / a.length
            };
        }

        const shadowPreservation = [];
        const shadowCases = [
            { type: 'single', quality: 'low', elevationDeg: 38, azimuthDeg: 35 },
            { type: 'single', quality: 'low', elevationDeg: 10, azimuthDeg: 220 },
            { type: 'cascade', quality: 'low', elevationDeg: 38, azimuthDeg: 120 },
            { type: 'cascade', quality: 'low', elevationDeg: 10, azimuthDeg: 300 }
        ];
        for (const shadowCase of shadowCases) {
            engine.setShadowSettings({ ...engine.shadowSettings, type: shadowCase.type, quality: shadowCase.quality });
            city.applyShadowSettings(engine);
            const elevation = THREE.MathUtils.degToRad(shadowCase.elevationDeg);
            const azimuth = THREE.MathUtils.degToRad(shadowCase.azimuthDeg);
            city.sunRef.direction.set(Math.sin(azimuth) * Math.cos(elevation), Math.sin(elevation), Math.cos(azimuth) * Math.cos(elevation));
            for (const pose of poses) {
                applyPose(pose);
                city.update(engine);
                setPvs(false);
                const off = captureDirect();
                setPvs(true);
                const hiddenRoots = roots.filter((root) => root.visible === false).length;
                const bridgeBefore = { ...city.staticVisibility._bridge.stats };
                const on = captureDirect();
                const bridgeAfter = { ...city.staticVisibility._bridge.stats };
                shadowPreservation.push({
                    ...shadowCase,
                    pose: pose.id,
                    hiddenRoots,
                    pixels: comparePixels(off, on),
                    shadowRestoreWrites: bridgeAfter.shadowRestoreWrites - bridgeBefore.shadowRestoreWrites
                });
            }
        }

        setPvs(true);
        const lookupIterations = 10_000;
        const bridgeWritesBeforeLookup = city.staticVisibility._bridge.stats.colorWrites;
        const lookupStarted = performance.now();
        for (let index = 0; index < lookupIterations; index += 1) {
            const pose = poses[index % poses.length];
            applyPose(pose);
            city.updateStaticVisibility(engine.camera, lookupStarted + index * 1000);
        }
        const lookupTotalMs = performance.now() - lookupStarted;
        const runtimeLookup = {
            iterations: lookupIterations,
            totalMs: lookupTotalMs,
            averageMs: lookupTotalMs / lookupIterations,
            visibilityWrites: city.staticVisibility._bridge.stats.colorWrites - bridgeWritesBeforeLookup,
            averageVisibilityWrites: (city.staticVisibility._bridge.stats.colorWrites - bridgeWritesBeforeLookup) / lookupIterations
        };
        return {
            generatedAt: new Date().toISOString(),
            gpu: debugInfo ? gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER),
            rendererSize: renderer.getSize(new THREE.Vector2()).toArray(),
            rendererPixelRatio: renderer.getPixelRatio(),
            benchmark,
            shadowPreservation,
            runtimeLookup,
            status: city.getStaticVisibilityStatus(),
            diagnostics: city.getStaticVisibilityDiagnostics()
        };
    });

    const failedShadowCase = report.shadowPreservation.find((row) => row.pixels.changedPixels !== 0 || row.shadowRestoreWrites <= 0);
    if (failedShadowCase) throw new Error(`Shadow/color preservation failed: ${JSON.stringify(failedShadowCase)}`);
    await mkdir(path.dirname(outputPath), { recursive: true });
    await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    process.stdout.write(`[StaticVisibilityRuntime] wrote ${path.relative(repoRoot, outputPath)}\n`);
} finally {
    await browser?.close?.();
    if (server && !server.killed) server.kill('SIGTERM');
}
