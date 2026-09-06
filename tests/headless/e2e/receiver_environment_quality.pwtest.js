// Compares a replacement world-light bake with the installed maps at fixed cameras.
import test, { expect } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

test.use({ launchOptions: { executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', args: ['--use-angle=d3d11'] } });

test('Receiver world lighting: fixed direct light, corrected indirect maps and stable toggles', async ({ page }) => {
    test.setTimeout(900_000);
    const root = path.resolve('tests/artifacts/screens/illumination_quality/validation');
    await mkdir(root, { recursive: true });
    const bakeRoot = path.resolve('tests/artifacts/screens/illumination_quality/bake');
    const latest = JSON.parse(await readFile(path.join(bakeRoot, 'latest.json')));
    const indexUrl = '/' + path.relative(process.cwd(), path.join(bakeRoot, latest.directory, 'package_index.json')).replaceAll('\\', '/');
    const beforeUrl = '/tests/artifacts/screens/illumination_553/bake/20744ee4a1a8f9bccf5837f64f49b4e2f5e0366074e3c01290dd85d279697898/package_index.json';
    const errors = [], requests = [], captures = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error' && /shader|WebGLProgram/i.test(message.text())) errors.push(message.text()); });
    page.on('request', request => { if (/\.ilpkg\.gz/.test(request.url())) requests.push(request.url()); });
    await page.setViewportSize({ width: 1600, height: 900 });
    await page.addInitScript(() => localStorage.setItem('bus_sim.bakedLighting.v1', JSON.stringify({ shadows: { enabled: true, dynamicResolution: 'high' }, receivers: { enhanced: true, direct: false, indirect: false } })));
    await page.goto('/?coreTests=0');
    await page.waitForFunction(() => window.__busSim?.sm?.currentName === 'welcome', null, { timeout: 120000 });
    await page.locator('#btn-start').click();
    await page.waitForFunction(() => window.__busSim?.sm?.currentName === 'bus_select', null, { timeout: 120000 });
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => window.__busSim?.sm?.currentName === 'game_mode', null, { timeout: 120000 });
    const context = await page.evaluate(async ({ indexUrl, beforeUrl }) => {
        const { engine: e, sm } = window.__busSim;
        await e.waitForLightingReady();
        for (let frame = 0; frame < 120; frame++) await new Promise(requestAnimationFrame);
        e.stop(); sm.current.gameLoop.paused = true;
        sm.current.update = () => { e.context.city.update(e); e.context.city.updateStaticVisibility(e.camera); };
        for (const id of ['hud-game', 'ui-perf-bar']) document.getElementById(id).style.visibility = 'hidden';
        const { EnhancedReceiverLightmapRuntime } = await import('/src/graphics/illumination/receiver_lightmaps/EnhancedReceiverLightmapRuntime.js');
        window.qualityBanks = Object.fromEntries(Object.entries({ before: beforeUrl, after: indexUrl }).map(([key, url]) => {
            const bank = new EnhancedReceiverLightmapRuntime(e); bank.indexUrl = url; return [key, bank];
        }));
        window.qualitySettings = async settings => {
            let done = false;
            const start = performance.now();
            const work = e.setBakedLightingSettings({ shadows: { enabled: true, dynamicResolution: 'high' }, receivers: { enhanced: true, direct: false, indirect: false, debug: 'final', ...settings } }).finally(() => done = true);
            for (let frame = 0;; frame++) {
                e.updateFrame(0); await new Promise(requestAnimationFrame);
                const state = e.getBakedLightingDebugInfo().receiverLightmaps;
                if (done && state.state === 'fallback') throw new Error(JSON.stringify(state));
                if (performance.now() - start > 300000) throw new Error('Receiver activation timeout: ' + JSON.stringify(state));
                if (done && frame > 12 && (!(settings.direct || settings.indirect) || (state.state === 'active' && state.activationBlend === 1))) break;
            }
            await work;
            return e.getBakedLightingDebugInfo().receiverLightmaps;
        };
        window.qualityMode = async ({ bank, indirect = true }) => {
            await window.qualitySettings({});
            e._bakedLighting.receiverModes.enhanced = window.qualityBanks[bank];
            return window.qualitySettings({ direct: true, indirect });
        };
        return { lighting: e.lightingSettings, pixelRatio: e.renderer.getPixelRatio(), browser: navigator.userAgent };
    }, { indexUrl, beforeUrl });
    for (const [topic, position, target] of [
        ['platform', [-35, 18, 39], [-47, 1, 21]],
        ['spawn', [-47, 10, 40], [-47, 3, 19]],
        ['grass', [-195, 12, 3], [-176, 1, 15]],
        ['curb', [-149, 6, 44], [-161, .1, 29]],
        ['facades', [-43, 10, 15], [-31, 12, 15]]
    ]) {
        await page.evaluate(({ position, target }) => {
            const e = window.__busSim.engine;
            e.camera.position.fromArray(position); e.camera.lookAt(...target); e.camera.updateMatrixWorld(true); e.updateFrame(0);
        }, { position, target });
        const directImages = [];
        for (const bank of ['before', 'after']) for (const indirect of [false, true]) {
            console.log('WORLD_LIGHT_CAPTURE ' + topic + ' ' + bank + ' ' + indirect);
            const diagnostics = await page.evaluate(mode => window.qualityMode(mode), { bank, indirect });
            expect(diagnostics.state).toBe('active');
            expect(diagnostics.runtimeCoverage.omittedTriangles).toBe(0);
            const file = `${topic}-${bank}-${indirect ? 'baked' : 'direct'}.png`;
            const png = await page.screenshot({ path: path.join(root, file) });
            if (!indirect) directImages.push(png.toString('base64'));
            if (bank === 'after' && indirect) {
                const probes = await page.evaluate(async () => {
                    const T = await import('three'), e = window.__busSim.engine;
                    return [[.2, .4], [.5, .5], [.8, .4]].map(([x, y]) => {
                        const ray = new T.Raycaster(); ray.setFromCamera(new T.Vector2(x * 2 - 1, 1 - y * 2), e.camera);
                        const hit = ray.intersectObject(e.scene, true).find(h => h.object.isMesh && h.object.visible);
                        if (!hit) return { x, y };
                        const mesh = hit.object, material = Array.isArray(mesh.material) ? mesh.material[hit.face.materialIndex] : mesh.material;
                        const coordinate = mesh.geometry.getAttribute('receiverAtlasCoordinate'), normal = hit.face.normal.clone().transformDirection(mesh.matrixWorld);
                        const vertices = [hit.face.a, hit.face.b, hit.face.c];
                        const positions = vertices.map(i => new T.Vector3().fromBufferAttribute(mesh.geometry.attributes.position, i));
                        const bary = T.Triangle.getBarycoord(mesh.worldToLocal(hit.point.clone()), ...positions, new T.Vector3());
                        const atlas = coordinate ? [0, 1, 2, 3].map(c => vertices.reduce((sum, vertex, i) => sum + coordinate.getComponent(vertex, c) * bary.getComponent(i), 0)) : null;
                        return { x, y, name: mesh.name, point: hit.point.toArray(), normal: normal.toArray(), material: material.name, type: material.type, color: material.color?.toArray(), atlas, userData: mesh.userData };
                    });
                });
                await writeFile(path.join(root, topic + '-surface-probes.json'), JSON.stringify(probes, null, 2));
                if (topic === 'facades') {
                    await page.evaluate(() => window.qualitySettings({ enhanced: false }));
                    await page.screenshot({ path: path.join(root, 'facades-legacy.png') });
                    await page.evaluate(() => window.qualitySettings({ direct: true, indirect: true, debug: 'indirect' }));
                    await page.screenshot({ path: path.join(root, 'facades-indirect.png') });
                    await page.evaluate(() => window.qualitySettings({ direct: true, indirect: true }));
                    const materialAudit = await page.evaluate(async () => {
                        const T = await import('three'), e = window.__busSim.engine;
                        const ray = new T.Raycaster(); ray.setFromCamera(new T.Vector2(0, 0), e.camera);
                        const hit = ray.intersectObject(e.scene, true).find(h => h.object.isMesh && h.object.visible);
                        const material = Array.isArray(hit.object.material) ? hit.object.material[hit.face.materialIndex] : hit.object.material;
                        window.qualityFacadeMaterial = material;
                        const audit = { metalness: material.metalness, roughness: material.roughness, aoMapIntensity: material.aoMapIntensity,
                            map: material.map?.userData, aoMap: material.aoMap?.userData,
                            staticAo: { intensity: material.userData.staticAo?.intensity }, staticAoAttribute: !!hit.object.geometry.attributes.staticAo };
                        window.qualityFacadeRestore = { aoMapIntensity: material.aoMapIntensity, map: material.map, metalness: material.metalness };
                        material.aoMapIntensity = 0;
                        if (material.userData.staticAo?.shaderUniforms?.uStaticAoIntensity) material.userData.staticAo.shaderUniforms.uStaticAoIntensity.value = 0;
                        e.updateFrame(0); return audit;
                    });
                    await page.screenshot({ path: path.join(root, 'facades-no-material-ao.png') });
                    await page.evaluate(() => {
                        const e = window.__busSim.engine, m = window.qualityFacadeMaterial;
                        m.map = null; m.metalness = 0; m.needsUpdate = true; e.updateFrame(0);
                    });
                    await page.screenshot({ path: path.join(root, 'facades-white-material.png') });
                    await writeFile(path.join(root, 'facades-material-audit.json'), JSON.stringify(materialAudit, null, 2));
                    await page.evaluate(() => {
                        Object.assign(window.qualityFacadeMaterial, window.qualityFacadeRestore);
                        window.qualityFacadeMaterial.needsUpdate = true;
                        window.__busSim.engine.updateFrame(0);
                    });
                }
            }
            captures.push({ topic, bank, indirect, file, diagnostics });
            await writeFile(path.join(root, 'captures.json'), JSON.stringify({ context, captures, errors }, null, 2));
        }
        const difference = await page.evaluate(async encoded => {
            const data = [];
            for (const value of encoded) {
                const image = await createImageBitmap(await (await fetch('data:image/png;base64,' + value)).blob());
                const canvas = new OffscreenCanvas(image.width, image.height), ctx = canvas.getContext('2d');
                ctx.drawImage(image, 0, 0); data.push(ctx.getImageData(0, 0, image.width, image.height).data); image.close();
            }
            let total = 0;
            for (let i = 0; i < data[0].length; i++) total += Math.abs(data[0][i] - data[1][i]);
            return total / data[0].length;
        }, directImages);
        await writeFile(path.join(root, topic + '-direct-difference.json'), JSON.stringify({ meanAbsoluteChannelDifference: difference }));
        expect(difference).toBeLessThan(.5);
    }
    // The deliberate material edits invalidate source freshness. Warm the
    // restored source before measuring ordinary lighting-toggle retention.
    await page.evaluate(() => window.qualityMode({ bank: 'after' }));
    const warmRequests = [...requests], counts = [];
    for (let cycle = 0; cycle < 4; cycle++) {
        await page.evaluate(() => window.qualitySettings({}));
        await page.evaluate(() => window.qualitySettings({ direct: true, indirect: true }));
        counts.push(await page.evaluate(() => {
            const r = window.__busSim.engine.renderer;
            return { programs: r.info.programs.length, textures: r.info.memory.textures, geometries: r.info.memory.geometries };
        }));
    }
    expect(requests).toEqual(warmRequests);
    expect(new Set(counts.map(value => JSON.stringify(value))).size).toBe(1);
    expect(errors).toEqual([]);
    await writeFile(path.join(root, 'toggles.json'), JSON.stringify({ counts, requests, errors }, null, 2));
});
