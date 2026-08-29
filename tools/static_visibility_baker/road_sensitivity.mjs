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
    } else args.set(token, true);
}
const requestedPort = Math.max(1024, Number(args.get('--port')) || 4173);
const outputPath = path.resolve(repoRoot, String(args.get('--report') || 'tests/artifacts/static_visibility_roads/report.json'));
let server = null;
let browser = null;

function canListen(port) {
    return new Promise((resolve) => {
        const probe = net.createServer();
        probe.once('error', () => resolve(false));
        probe.listen(port, '127.0.0.1', () => probe.close(() => resolve(true)));
    });
}
async function findFreePort(start) {
    for (let port = start; port < start + 200; port += 1) if (await canListen(port)) return port;
    throw new Error(`No free road-sensitivity port found from ${start}`);
}
async function waitForServer(url) {
    for (let attempt = 0; attempt < 150; attempt += 1) {
        try {
            if ((await fetch(`${url}/__health`)).ok) return;
        } catch {}
        await new Promise((resolve) => setTimeout(resolve, 200));
    }
    throw new Error(`Road sensitivity could not reach ${url}`);
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
        if (message.text().startsWith('[RoadSensitivity]')) process.stdout.write(`${message.text()}\n`);
    });
    await page.goto(`${baseUrl}/?pose=civic_center_curve_front&coreTests=0&visibilityMap=0`);
    await page.waitForFunction(
        () => window.__busSim?.sm?.currentName === 'game_mode' && !!window.__busSim?.sm?.current?.city,
        null,
        { timeout: 120_000 }
    );

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
        engine.setShadowSettings({ ...engine.shadowSettings, type: 'single', quality: 'low' });
        city.applyShadowSettings(engine);

        const sources = [
            ['asphalt', city.roads.asphalt],
            ['asphalt_edge_wear', city.roads.asphaltEdgeWear],
            ['curbs', city.roads.curbBlocks],
            ['sidewalks', city.roads.sidewalk],
            ['sidewalk_edge_dirt', city.roads.sidewalkEdgeDirt],
            ['markings_white', city.roads.markingsWhite],
            ['markings_yellow', city.roads.markingsYellow],
            ['crosswalks', city.roads.group.getObjectByName('Crosswalks')],
            ['lane_arrows', city.roads.group.getObjectByName('LaneArrows')]
        ].filter(([, object]) => object?.isMesh);
        for (const [, source] of sources) source.updateWorldMatrix(true, false);

        const componentGetters = ['getX', 'getY', 'getZ', 'getW'];
        function readVertex(attribute, vertexIndex) {
            const output = [];
            for (let component = 0; component < attribute.itemSize; component += 1) {
                output.push(attribute[componentGetters[component]](vertexIndex));
            }
            return output;
        }
        function interpolate(a, b, t) {
            return a.map((value, index) => value + (b[index] - value) * t);
        }
        function average3(a, b, c) {
            return a.map((value, index) => (value + b[index] + c[index]) / 3);
        }
        function boundaryValue(a, b, c, segment) {
            if (segment <= 4) return interpolate(a, b, segment / 4);
            if (segment <= 7) return interpolate(b, c, (segment - 4) / 3);
            return interpolate(c, a, (segment - 7) / 3);
        }
        function append(values, entry) {
            values.push(...entry);
        }

        function createVariant({ density, chunkSpan }) {
            const group = new THREE.Group();
            group.name = `RoadSensitivity_${density}x_span${chunkSpan}`;
            const inventory = { density, chunkSpan, meshes: 0, triangles: 0, bytes: 0, buildMs: 0 };
            const started = performance.now();
            for (const [category, source] of sources) {
                const geometry = source.geometry;
                const position = geometry.attributes.position;
                const index = geometry.index;
                const referenceCount = index?.count ?? position.count;
                const buckets = new Map();
                const worldPoint = new THREE.Vector3();
                for (let reference = 0; reference < referenceCount; reference += 3) {
                    const vertexIndices = [0, 1, 2].map((corner) => index ? index.getX(reference + corner) : reference + corner);
                    const localPositions = vertexIndices.map((vertexIndex) => readVertex(position, vertexIndex));
                    worldPoint.set(
                        (localPositions[0][0] + localPositions[1][0] + localPositions[2][0]) / 3,
                        (localPositions[0][1] + localPositions[1][1] + localPositions[2][1]) / 3,
                        (localPositions[0][2] + localPositions[1][2] + localPositions[2][2]) / 3
                    ).applyMatrix4(source.matrixWorld);
                    const cellX = Math.max(0, Math.min(city.map.width - 1, Math.round((worldPoint.x - city.map.origin.x) / city.map.tileSize)));
                    const cellY = Math.max(0, Math.min(city.map.height - 1, Math.round((worldPoint.z - city.map.origin.z) / city.map.tileSize)));
                    const key = chunkSpan >= city.map.width
                        ? category
                        : `${category}:${Math.floor(cellX / chunkSpan)}:${Math.floor(cellY / chunkSpan)}`;
                    let bucket = buckets.get(key);
                    if (!bucket) {
                        bucket = Object.fromEntries(Object.keys(geometry.attributes).map((name) => [name, []]));
                        buckets.set(key, bucket);
                    }
                    for (const [name, attribute] of Object.entries(geometry.attributes)) {
                        const values = vertexIndices.map((vertexIndex) => readVertex(attribute, vertexIndex));
                        if (density === 1) {
                            for (const value of values) append(bucket[name], value);
                            continue;
                        }
                        const center = average3(values[0], values[1], values[2]);
                        for (let segment = 0; segment < 10; segment += 1) {
                            append(bucket[name], center);
                            append(bucket[name], boundaryValue(values[0], values[1], values[2], segment));
                            append(bucket[name], boundaryValue(values[0], values[1], values[2], segment + 1));
                        }
                    }
                }
                for (const [key, attributes] of buckets) {
                    const chunkGeometry = new THREE.BufferGeometry();
                    for (const [name, values] of Object.entries(attributes)) {
                        const itemSize = geometry.attributes[name].itemSize;
                        const attribute = new THREE.Float32BufferAttribute(values, itemSize);
                        chunkGeometry.setAttribute(name, attribute);
                        inventory.bytes += attribute.array.byteLength;
                    }
                    chunkGeometry.computeBoundingBox();
                    chunkGeometry.computeBoundingSphere();
                    const material = Array.isArray(source.material) ? source.material[0] : source.material;
                    const mesh = new THREE.Mesh(chunkGeometry, material);
                    mesh.name = key;
                    mesh.matrixAutoUpdate = false;
                    mesh.matrix.copy(source.matrixWorld);
                    mesh.matrixWorld.copy(source.matrixWorld);
                    mesh.castShadow = source.castShadow;
                    mesh.receiveShadow = source.receiveShadow;
                    group.add(mesh);
                    inventory.meshes += 1;
                    inventory.triangles += chunkGeometry.attributes.position.count / 3;
                }
            }
            inventory.buildMs = performance.now() - started;
            return { id: `${density}x_span${chunkSpan}`, group, inventory };
        }

        const variants = [
            { id: '1x_merged', group: null, inventory: { density: 1, chunkSpan: 25, meshes: 9, triangles: 71189, bytes: 0, buildMs: 0 } },
            createVariant({ density: 1, chunkSpan: 1 }),
            createVariant({ density: 1, chunkSpan: 2 }),
            createVariant({ density: 1, chunkSpan: 4 }),
            createVariant({ density: 1, chunkSpan: 5 }),
            createVariant({ density: 10, chunkSpan: 25 }),
            createVariant({ density: 10, chunkSpan: 1 }),
            createVariant({ density: 10, chunkSpan: 2 }),
            createVariant({ density: 10, chunkSpan: 4 }),
            createVariant({ density: 10, chunkSpan: 5 })
        ];
        console.log(`[RoadSensitivity] built ${variants.length} variants`);
        for (const variant of variants) if (variant.group) engine.scene.add(variant.group);

        const roadCells = [];
        for (let index = 0; index < city.map.width * city.map.height; index += 1) if (city.map.kind[index] === 1) roadCells.push(index);
        const selected = [roadCells[8], roadCells[Math.floor(roadCells.length / 2)], roadCells[roadCells.length - 9]];
        const poses = selected.map((cellIndex, index) => {
            const center = city.map.tileToWorldCenter(cellIndex % city.map.width, Math.floor(cellIndex / city.map.width));
            return { id: ['north_open', 'central', 'south_dense'][index], x: center.x, y: 3.68, z: center.z, yaw: [0.2, 2.1, 4.4][index] };
        });
        function applyPose(pose) {
            engine.camera.position.set(pose.x, pose.y, pose.z);
            engine.camera.lookAt(pose.x + Math.sin(pose.yaw) * 15, 1.12, pose.z + Math.cos(pose.yaw) * 15);
            engine.camera.updateMatrixWorld(true);
            engine.camera.updateProjectionMatrix();
        }
        function activate(variant) {
            const merged = variant.id === '1x_merged';
            for (const [, source] of sources) source.visible = merged;
            for (const entry of variants) if (entry.group) entry.group.visible = entry === variant;
        }
        function renderBurst(frames = 10) {
            const started = performance.now();
            for (let frame = 0; frame < frames; frame += 1) {
                city.update(engine);
                engine.renderFrame();
                gl.finish();
            }
            return {
                averageMs: (performance.now() - started) / frames,
                calls: renderer.info.render.calls,
                triangles: renderer.info.render.triangles
            };
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
        const results = [];
        const visualCorrectness = [];
        for (const pose of poses) {
            applyPose(pose);
            for (const variant of variants) {
                activate(variant);
                renderBurst(3);
            }
            const samples = Object.fromEntries(variants.map((variant) => [variant.id, []]));
            for (const order of [variants, [...variants].reverse(), variants, [...variants].reverse()]) {
                for (const variant of order) {
                    activate(variant);
                    samples[variant.id].push(renderBurst(10));
                }
            }
            for (const variant of variants) {
                const ordered = [...samples[variant.id]].sort((a, b) => a.averageMs - b.averageMs);
                const fastest = ordered[0];
                results.push({
                    pose: pose.id,
                    variant: variant.id,
                    ...fastest,
                    medianMs: ordered[Math.floor(ordered.length / 2)].averageMs,
                    samplesMs: samples[variant.id].map((sample) => sample.averageMs)
                });
            }
            activate(variants[0]);
            const reference = captureDirect();
            for (const variantId of ['1x_span5', '10x_span25', '10x_span4', '10x_span5']) {
                const variant = variants.find((entry) => entry.id === variantId);
                activate(variant);
                visualCorrectness.push({ pose: pose.id, variant: variantId, pixels: comparePixels(reference, captureDirect()) });
            }
        }
        activate(variants[0]);
        for (const variant of variants) {
            if (!variant.group) continue;
            variant.group.removeFromParent();
        }
        return {
            generatedAt: new Date().toISOString(),
            gpu: debugInfo ? gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER),
            rendererSize: renderer.getSize(new THREE.Vector2()).toArray(),
            note: 'Actual-material full-pipeline CPU+GPU synchronized A/B. Standard WebGL2 exposes neither a portable fragment counter nor separate CPU/GPU timers here. Chunk variants use normal Three.js per-chunk frustum culling only; the researched occlusion ratios remain a separate upper-bound opportunity, and roads stay disabled.',
            visualTolerance: {
                currentDensityMaxChangedPixels: 4,
                tenTimesMaxChangedPixelFraction: 0.04,
                tenTimesMaxMeanAbsoluteChannelDifference: 0.02,
                rationale: 'The 10x fan preserves every source corner and barycentrically interpolates every attribute, but extra raster edges produce small precision differences. This tolerance is evidence-only and cannot approve road PVS.'
            },
            variants: variants.map(({ id, inventory }) => ({ id, ...inventory })),
            results,
            visualCorrectness
        };
    });
    const pixelCount = 1280 * 720;
    const failedVisualCase = report.visualCorrectness.find((row) => row.variant.startsWith('1x_')
        ? row.pixels.changedPixels > report.visualTolerance.currentDensityMaxChangedPixels
        : row.pixels.changedPixels / pixelCount > report.visualTolerance.tenTimesMaxChangedPixelFraction
            || row.pixels.meanAbsoluteDifference > report.visualTolerance.tenTimesMaxMeanAbsoluteChannelDifference);
    await mkdir(path.dirname(outputPath), { recursive: true });
    await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    if (failedVisualCase) throw new Error(`Road geometry visual preservation exceeded tolerance: ${JSON.stringify(failedVisualCase)}`);
    process.stdout.write(`[RoadSensitivity] wrote ${path.relative(repoRoot, outputPath)}\n`);
} finally {
    await browser?.close?.();
    if (server && !server.killed) server.kill('SIGTERM');
}
