// Compare geometric shortening during forward travel, reversal and curved curb crossings.
import test, { expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';

const output = 'tests/artifacts/screens/grass/shorten_motion';
const record = process.env.GRASS_SHORTEN_CAPTURE_MOTION === '1';
test.use({ viewport: { width: 2147, height: 884 }, deviceScaleFactor: 2, video: 'off', trace: 'off' });

test('Shortening preserves matched return poses across straight fields and curved curbs', async ({ page }) => {
    test.setTimeout(record ? 360000 : 180000);
    const errors = [], results = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    await page.route('**/grass_debugger_v2/main.js*', async route => {
        const response = await route.fetch(), source = await response.text();
        expect(source).toContain('let copyFeedbackTimer;');
        await route.fulfill({ response, body: source.replace('let copyFeedbackTimer;', 'window.__grassTestView = view;\nlet copyFeedbackTimer;') });
    });
    await mkdir(output, { recursive: true });
    for (const radius of [null, 18, 30]) for (const transition of ['dissolve', 'shorten']) {
        await page.goto(`/debug_tools/grass_debug_v2.html?grass=patches&handoff=${transition}${radius ? '&curve=' + radius : ''}`);
        await page.waitForFunction(() => !!window.__grassDebugV2);
        await page.evaluate(() => window.__grassDebugV2.readiness);
        const routes = radius ? ['inner', 'outer'] : ['bus', 'field', 'reported-bus', 'reported-high'];
        for (const route of routes) {
            const result = await page.evaluate(async ({ route, record }) => {
                const view = window.__grassTestView, { renderer, camera, grass } = view;
                renderer.setAnimationLoop(null); view.benchmark.cancel(); view.keyboard.clear(); view.controls.enabled = false;
                const gl = renderer.getContext(), origin = view.busPose.position.clone();
                const direction = view.busPose.target.clone().sub(origin), placement = grass.getSnapshot().placement;
                if (route === 'field') origin.x = (placement.minX + placement.maxX) / 2;
                if (route.startsWith('reported-')) {
                    origin.set(-12.668, route === 'reported-high' ? 10.654 : 6.883, route === 'reported-high' ? 34.478 : -1.296);
                    const pitch = -19.206 * Math.PI / 180;
                    direction.set(0, Math.sin(pitch) * 20, Math.cos(pitch) * 20);
                }
                const curve = view.content.curve?.layout, total = 120;
                const pose = index => {
                    const fraction = index / total;
                    if (curve) {
                        const radius = curve.radius + (route === 'inner' ? -8 : 8), angle = .15 * Math.PI + 24 * fraction / radius;
                        const x = Math.cos(angle), z = Math.sin(angle);
                        camera.position.set(curve.center.x + radius * x, origin.y, curve.center.z + radius * z);
                        const heading = direction.clone().set(-z - .4 * x, 0, x - .4 * z).normalize().multiplyScalar(20);
                        heading.y = direction.y / Math.hypot(direction.x, direction.z) * 20;
                        camera.lookAt(camera.position.clone().add(heading));
                    } else {
                        camera.position.copy(origin); camera.position.z += 24 * fraction;
                        camera.lookAt(camera.position.clone().add(direction));
                    }
                    camera.updateMatrixWorld(true);
                };
                const draw = index => { pose(index); view.render(performance.now()); };
                grass.setMode('AUTO');
                for (let i = 0; i <= total; i += 4) draw(i);
                for (let i = 0; i < 4; i++) draw(0);
                const memory = () => ({ ...renderer.info.memory, programs: renderer.info.programs.length });
                const beforeMemory = memory(), uploads = { buffers: 0, textures: 0, allocations: 0 }, samples = [], forward = new Map();
                const originals = ['bufferData', 'bufferSubData', 'createBuffer', 'texImage2D', 'texSubImage2D', 'texImage3D', 'texSubImage3D', 'generateMipmap'].map(name => [name, gl[name]]);
                const pixels = new Uint8Array(renderer.domElement.width * renderer.domElement.height * 4);
                const signature = () => {
                    gl.readPixels(0, 0, renderer.domElement.width, renderer.domElement.height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
                    let hash = 2166136261;
                    for (const value of pixels) hash = Math.imul(hash ^ value, 16777619);
                    return hash >>> 0;
                };
                for (const [name, original] of originals) gl[name] = function (...args) {
                    uploads[name === 'createBuffer' ? 'allocations' : name.startsWith('buffer') ? 'buffers' : 'textures']++;
                    return original.apply(this, args);
                };
                try {
                    for (const phase of ['forward', 'reverse']) for (let frame = 0; frame <= total; frame++) {
                        const index = phase === 'forward' ? frame : total - frame;
                        draw(index);
                        if (index % 15 === 0) {
                            const sample = { phase, index, position: camera.position.toArray(), quaternion: camera.quaternion.toArray(),
                                hash: signature(), calls: renderer.info.render.calls, triangles: renderer.info.render.triangles,
                                patches: grass.group.children.filter(mesh => mesh.visible && mesh.userData.grassPatchLevel !== undefined)
                                    .map(mesh => [mesh.userData.grassPatchLevel, mesh.position.x, mesh.position.z]).sort((a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2]) };
                            if (phase === 'forward') forward.set(index, sample);
                            else sample.returnMatches = sample.hash === forward.get(index).hash
                                && JSON.stringify(sample.patches) === JSON.stringify(forward.get(index).patches);
                            samples.push(sample);
                        }
                    }
                } finally {
                    for (const [name, original] of originals) gl[name] = original;
                }
                const afterMemory = memory(), snapshot = view.getSnapshot(), captures = {}, referenceHashes = {};
                for (const mode of ['AUTO', 'LOD4', 'LOD5']) {
                    grass.setMode(mode); draw(total / 2);
                    referenceHashes[mode] = signature();
                    captures[mode] = renderer.domElement.toDataURL('image/png');
                }
                grass.setMode('AUTO'); draw(0);
                let video = null;
                if (record) {
                    const chunks = [], stream = renderer.domElement.captureStream(30);
                    const options = { mimeType: 'video/webm;codecs=vp9', videoBitsPerSecond: 16000000 };
                    const warmup = new MediaRecorder(stream, options), warmed = new Promise(resolve => { warmup.onstop = resolve; });
                    warmup.start();
                    for (let i = 0; i < 60; i++) { await new Promise(resolve => requestAnimationFrame(resolve)); draw(0); }
                    warmup.stop(); await warmed;
                    const recorder = new MediaRecorder(stream, options);
                    const stopped = new Promise(resolve => { recorder.onstop = resolve; });
                    recorder.ondataavailable = event => chunks.push(event.data);
                    recorder.start();
                    const start = performance.now();
                    let elapsed = 0;
                    while (elapsed < 16000) {
                        const time = await new Promise(resolve => requestAnimationFrame(resolve));
                        elapsed = Math.max(0, time - start);
                        const fraction = Math.min(1, elapsed / 16000);
                        draw(total * (fraction < .5 ? fraction * 2 : 2 - fraction * 2));
                    }
                    recorder.stop(); await stopped; stream.getTracks().forEach(track => track.stop());
                    video = await new Promise(resolve => {
                        const reader = new FileReader(); reader.onload = () => resolve(reader.result);
                        reader.readAsDataURL(new Blob(chunks, { type: recorder.mimeType }));
                    });
                }
                const debug = gl.getExtension('WEBGL_debug_renderer_info');
                return { samples, uploads, beforeMemory, afterMemory, viewport: snapshot.viewport, lighting: snapshot.lighting,
                    grass: snapshot.grass.field, packageHash: snapshot.grass.packageHash, leafFill: snapshot.grass.leafFill,
                    gpu: debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : null, glError: gl.getError(), referenceHashes, captures, video };
            }, { route, record });
            const name = radius ? `curve-${radius}-${route}` : route;
            for (const [mode, image] of Object.entries(result.captures)) await writeFile(`${output}/${name}-${transition}-${mode}.png`, Buffer.from(image.split(',')[1], 'base64'));
            if (result.video) await writeFile(`${output}/${name}-${transition}.webm`, Buffer.from(result.video.split(',')[1], 'base64'));
            delete result.captures; delete result.video;
            results.push({ name, transition, ...result });
            await writeFile(`${output}/validation.json`, JSON.stringify({ results, errors }, null, 2));
            expect(result.viewport).toEqual({ width: 3814, height: 1672, pixelRatio: 2 });
            expect(result.grass.terminalTransition).toBe(transition);
            expect(result.leafFill).toBeNull();
            expect(result.uploads).toEqual({ buffers: 0, textures: 0, allocations: 0 });
            expect(result.afterMemory).toEqual(result.beforeMemory);
            expect(result.samples.filter(sample => sample.phase === 'reverse').every(sample => sample.returnMatches)).toBe(true);
            expect(result.glError).toBe(0);
        }
        await page.evaluate(() => window.__grassTestView.destroy());
    }
    for (const candidate of results.filter(result => result.transition === 'shorten')) {
        const baseline = results.find(result => result.name === candidate.name && result.transition === 'dissolve');
        expect(candidate.lighting).toEqual(baseline.lighting);
        expect(candidate.packageHash).toBe(baseline.packageHash);
        for (const mode of ['LOD4', 'LOD5']) expect(candidate.referenceHashes[mode]).toBe(baseline.referenceHashes[mode]);
        const poses = row => row.samples.map(({ phase, index, position, quaternion, calls, triangles, patches }) => ({ phase, index, position, quaternion, calls, triangles, patches }));
        expect(poses(candidate)).toEqual(poses(baseline));
    }
    expect(errors).toEqual([]);
});
