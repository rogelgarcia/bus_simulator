// Reproduces facade darkening and shaded cornices at fixed city cameras.
import test, { expect } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

test.use({ launchOptions: { executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', args: ['--use-angle=d3d11'] } });

test('Receiver refinement: facade and sidewalk channel comparison', async ({ page }) => {
    test.setTimeout(600000);
    const root = path.resolve('tests/artifacts/screens/illumination_refinement/' + (process.env.RECEIVER_CAPTURE ?? 'before'));
    await mkdir(root, { recursive: true });
    if (process.env.RECEIVER_BAKE_ROOT) {
        const bakeRoot = path.resolve(process.env.RECEIVER_BAKE_ROOT);
        const latest = JSON.parse(await readFile(path.join(bakeRoot, 'latest.json')));
        const directory = path.join(bakeRoot, latest.directory);
        const index = JSON.parse(await readFile(path.join(directory, 'package_index.json')));
        expect(index.mapping.coverage.complete).toBe(true);
        await page.route('**/assets/baked_lighting/receivers/enhanced/**', route => route.fulfill({ status: 302,
            headers: { location: '/' + path.relative(process.cwd(), path.join(directory,
                path.basename(new URL(route.request().url()).pathname))).replaceAll('\\', '/') } }));
    }
    const errors = [], requests = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => {
        if (message.type() === 'error' && /shader|WebGLProgram/i.test(message.text())) errors.push(message.text());
    });
    page.on('request', request => { if (/\.ilpkg\.gz/.test(request.url())) requests.push(request.url()); });
    await page.setViewportSize({ width: 1600, height: 900 });
    await page.addInitScript(() => localStorage.setItem('bus_sim.bakedLighting.v1', JSON.stringify({ shadows: { enabled: true, dynamicResolution: 'high' }, receivers: { enhanced: true, direct: true, indirect: true } })));
    await page.goto('/?coreTests=0');
    await page.waitForFunction(() => window.__busSim?.sm?.currentName === 'welcome', null, { timeout: 120000 });
    await page.locator('#btn-start').click();
    await page.waitForFunction(() => window.__busSim.sm.currentName === 'bus_select', null, { timeout: 120000 });
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => window.__busSim.sm.currentName === 'game_mode', null, { timeout: 120000 });
    await page.waitForFunction(() => {
        const d = window.__busSim.engine.getBakedLightingDebugInfo().receiverLightmaps;
        if (d.state === 'fallback') throw new Error(JSON.stringify(d));
        return d.state === 'active' && d.activationBlend === 1;
    }, null, { timeout: 300000 });
    await page.evaluate(async () => {
        const { engine: e, sm } = window.__busSim;
        await e.waitForLightingReady();
        e.stop(); sm.current.gameLoop.paused = true;
        sm.current.update = () => { e.context.city.update(e); e.context.city.updateStaticVisibility(e.camera); };
        for (const id of ['hud-game', 'ui-perf-bar']) document.getElementById(id).style.visibility = 'hidden';
        window.refinementMode = async receivers => {
            let done = false;
            const work = e.setBakedLightingSettings({ shadows: { enabled: true, dynamicResolution: 'high' }, receivers: { enhanced: true, direct: false, indirect: false, debug: 'final', ...receivers } }).finally(() => done = true);
            for (let frame = 0;; frame++) {
                e.updateFrame(0); await new Promise(requestAnimationFrame);
                const d = e.getBakedLightingDebugInfo().receiverLightmaps;
                if (done && d.state === 'fallback') throw new Error(JSON.stringify(d));
                if (done && frame > 12 && (!(receivers.direct || receivers.indirect) || d.activationBlend === 1)) break;
            }
            await work;
        };
    });
    for (const [topic, position, target] of [
        ['lowrise-west', [25, 10, 145], [47, 9, 145]],
        ['lowrise-north', [47, 11, 120], [47, 9, 145]],
        ['lowrise-shadow', [18, 15, 120], [43, 1, 143]],
        ['platform', [-35, 18, 39], [-47, 1, 21]],
        ['sidewalk', [-36, 10, 41], [-23, .2, 32]],
        ['tower', [-191, 12, 45], [-169, 30, 23]],
        ['cornice', [-24, 29, 171], [-24, 41, 191]]
    ]) {
        if (process.env.RECEIVER_TOPICS && !process.env.RECEIVER_TOPICS.split(',').includes(topic)) continue;
        await page.evaluate(({ position, target }) => {
            const e = window.__busSim.engine;
            e.camera.position.fromArray(position); e.camera.lookAt(...target); e.camera.updateMatrixWorld(true);
        }, { position, target });
        const modes = [['off', {}], ['on', { direct: true, indirect: true }], ['indirect', { direct: true, indirect: true, debug: 'indirect' }]];
        if (topic === 'cornice') modes.push(['direct', { direct: true, indirect: true, debug: 'direct' }],
            ['original-direct', { enhanced: false, direct: true }],
            ['original-indirect', { enhanced: false, indirect: true }], ['original', { enhanced: false, direct: true, indirect: true }]);
        for (const [name, mode] of modes) {
            await page.evaluate(mode => window.refinementMode(mode), mode);
            const capture = await page.screenshot({ path: path.join(root, topic + '-' + name + '.png') });
            if ((topic === 'lowrise-north' && name === 'indirect') || (topic === 'cornice' && ['direct', 'indirect'].includes(name))) {
                const pixel = await page.evaluate(async ({ encoded, cornice }) => {
                    const bitmap = await createImageBitmap(await (await fetch('data:image/png;base64,' + encoded)).blob());
                    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height), context = canvas.getContext('2d');
                    context.drawImage(bitmap, 0, 0);
                    return [...context.getImageData(bitmap.width * (cornice ? .57 : .5), bitmap.height * (cornice ? .5175 : .5), 1, 1).data];
                }, { encoded: capture.toString('base64'), cornice: topic === 'cornice' });
                await writeFile(path.join(root, topic + '-' + name + '-pixel.json'), JSON.stringify(pixel));
                if (name === 'indirect') expect(Math.min(...pixel.slice(0, 3))).toBeGreaterThan(40);
                else expect(Math.max(...pixel.slice(0, 3))).toBeLessThan(12);
            }
        }
        await page.evaluate(() => window.refinementMode({ direct: true, indirect: true }));
        if (topic === 'lowrise-shadow') {
            const irradiance = await page.evaluate(async () => {
                const T = await import('three'), e = window.__busSim.engine;
                const uniforms = e._bakedLighting.receiverModes.enhanced.uniforms;
                const camera = new T.OrthographicCamera(-.025, .025, .025, -.025, .1, 10);
                camera.up.set(0, 0, -1);
                const rt = new T.WebGLRenderTarget(16, 16, { type: T.FloatType });
                const target = e.renderer.getRenderTarget(), tone = e.renderer.toneMapping;
                const debug = uniforms.receiverDebugMode.value;
                const samples = [];
                try {
                    uniforms.receiverDebugMode.value = 2;
                    e.renderer.toneMapping = T.NoToneMapping;
                    for (const z of [131.875, 132.125, 133]) {
                        camera.position.set(30, 5, z); camera.lookAt(30, 0, z); camera.updateMatrixWorld(true);
                        e.renderer.setRenderTarget(rt); e.renderer.render(e.scene, camera);
                        const pixel = new Float32Array(4);
                        e.renderer.readRenderTargetPixels(rt, 8, 8, 1, 1, pixel);
                        samples.push({ point: [30, z], rgb: [...pixel.slice(0, 3)] });
                    }
                } finally {
                    uniforms.receiverDebugMode.value = debug; e.renderer.toneMapping = tone;
                    e.renderer.setRenderTarget(target); rt.dispose(); e.updateFrame(0);
                }
                return samples;
            });
            await writeFile(path.join(root, 'ground-boundary-irradiance.json'), JSON.stringify(irradiance, null, 2));
            for (let channel = 0; channel < 3; channel++) {
                const ratio = irradiance[0].rgb[channel] / irradiance[1].rgb[channel];
                expect(ratio).toBeGreaterThan(.8); expect(ratio).toBeLessThan(1.25);
            }
        }
        const probes = await page.evaluate(async topic => {
            const T = await import('three'), e = window.__busSim.engine;
            return [[0, 0], [-.4, 0], [.4, 0], ...(topic === 'cornice' ? [[.14, -.035]] : [])].map(([x, y]) => {
                const ray = new T.Raycaster(); ray.setFromCamera(new T.Vector2(x, y), e.camera);
                const hit = ray.intersectObject(e.scene, true).find(h => h.object.isMesh && h.object.visible);
                if (!hit) return null;
                const o = hit.object, g = o.geometry, m = Array.isArray(o.material) ? o.material[hit.face.materialIndex] : o.material;
                const corners = [hit.face.a, hit.face.b, hit.face.c], a = g.attributes.receiverAtlasCoordinate;
                const p = corners.map(i => new T.Vector3().fromBufferAttribute(g.attributes.position, i));
                const b = T.Triangle.getBarycoord(o.worldToLocal(hit.point.clone()), ...p, new T.Vector3());
                const entry = e._bakedLighting.receiverModes.enhanced.bindings?.geometries.find(item => item.object === o);
                return { name: o.name, point: hit.point.toArray(), face: hit.faceIndex, instance: hit.instanceId,
                    normal: hit.face.normal.clone().transformDirection(o.matrixWorld).toArray(), side: m.side,
                    shaderNormal: corners.map(i => new T.Vector3().fromBufferAttribute(g.attributes.normal, i).transformDirection(o.matrixWorld).toArray()),
                    atlas: a ? [0, 1, 2, 3].map(c => corners.reduce((sum, v, i) => sum + a.getComponent(v, c) * b.getComponent(i), 0)) : null,
                    material: { name: m.name, map: m.map?.userData, ao: m.aoMapIntensity, color: m.color?.toArray(), metalness: m.metalness },
                    sourceGeometry: entry?.original.uuid, userData: o.userData };
            });
        }, topic);
        if (topic === 'cornice') expect(probes.at(-1).normal[1]).toBeLessThan(-.99);
        await writeFile(path.join(root, topic + '.json'), JSON.stringify(probes, null, 2));
    }
    await page.evaluate(() => window.refinementMode({ direct: true, indirect: true }));
    const warmRequests = [...requests], counts = [];
    for (let cycle = 0; cycle < 4; cycle++) {
        await page.evaluate(() => window.refinementMode({}));
        await page.evaluate(() => window.refinementMode({ direct: true, indirect: true }));
        counts.push(await page.evaluate(() => {
            const r = window.__busSim.engine.renderer;
            return { programs: r.info.programs.length, textures: r.info.memory.textures, geometries: r.info.memory.geometries };
        }));
    }
    expect(requests).toEqual(warmRequests);
    expect(new Set(counts.map(value => JSON.stringify(value))).size).toBe(1);
    await writeFile(path.join(root, 'toggles.json'), JSON.stringify({ counts, requests, errors }, null, 2));
    expect(errors).toEqual([]);
});
