// Matched architectural glass evidence and completed-frame performance samples.
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import test, { expect } from '@playwright/test';
import { bootHarness } from './_harness_visual_helpers.js';
import { loadBakeConfiguration } from '../../../../tools/baking/Configuration.mjs';

const phase = process.env.GLASS_PHASE || 'after';
const captureLabel = process.env.GLASS_CAPTURE_LABEL || phase;
if (!/^[a-z0-9-]+$/.test(captureLabel)) throw new Error('GLASS_CAPTURE_LABEL must contain lowercase letters, digits or hyphens');
const environment = process.env.GLASS_ENV || 'daylight';
const viewport = { width: 1920, height: 1080 };
const root = path.resolve('tests/artifacts/screens/buildings');
const shots = [
    { name: 'front-wide', cameraDir: { x: 0, y: 0.02, z: 1 }, cameraPadding: 1.12, cameraTargetYFrac: 0.48 },
    { name: 'three-quarter-wide', cameraDir: { x: 0.7, y: 0.12, z: 1 }, cameraPadding: 1.12, cameraTargetYFrac: 0.48 },
    { name: 'base-up-close', cameraDir: { x: 0.25, y: -0.32, z: 1 }, cameraPadding: 0.58, cameraTargetYFrac: 0.42 },
    { name: 'grazing-close', cameraDir: { x: 1, y: 0.01, z: 0.3 }, cameraPadding: 0.58, cameraTargetYFrac: 0.35 }
];
const sweep = [0.15, 0.65, 1.2].flatMap((x, i) => [
    { name: `sweep-lower-${i}`, cameraDir: { x, y: 0, z: 1 }, cameraPadding: 0.38, cameraTargetYFrac: 0.11 },
    { name: `sweep-upper-${i}`, cameraDir: { x, y: 0, z: 1 }, cameraPadding: 0.46, cameraTargetYFrac: 0.66 }
]);

const config = await loadBakeConfiguration(undefined, { requiredPaths: ['browserExecutable'], checkedPaths: ['browserExecutable'] });
test.use({ launchOptions: { executablePath: config.browserExecutable, args: ['--force-color-profile=srgb', '--enable-precise-memory-info'] } });

for (const buildingId of (process.env.GLASS_BUILDING ? [process.env.GLASS_BUILDING] : ['burban', 'bglass', 'terramar'])) {
    test(`AI549: ${buildingId} ${phase} matched poses and performance`, async ({ page }) => {
        test.setTimeout(600_000);
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        page.on('console', message => { if (message.type() === 'error') console.log(message.text()); });
        if (phase === 'before') {
            const ref = process.env.GLASS_BASELINE_REF;
            if (!ref) throw new Error('Historical before captures require GLASS_BASELINE_REF');
            for (const file of ['src/app/buildings/window_mesh/WindowMeshSettings.js', 'src/graphics/engine3d/buildings/window_mesh/WindowMeshMaterials.js',
                ...['Burban', 'BGlass', 'terramar'].map(name => `src/graphics/content3d/buildings/configs/${name}.js`)]) {
                const body = execFileSync('git', ['show', `${ref}:${file}`], { encoding: 'utf8' });
                await page.route(`**/${file}`, route => route.fulfill({ contentType: 'text/javascript', body }));
            }
        }
        await bootHarness(page, { query: '' });
        await page.setViewportSize(viewport);
        const out = path.join(root, buildingId, 'ai549', `${captureLabel}-${environment}`);
        await fs.mkdir(out, { recursive: true });
        const report = { phase, captureLabel, buildingId, viewport, cpu: os.cpus()[0]?.model, shots: [], errors };
        for (const shot of [...shots, ...(buildingId === 'burban' ? sweep : [])]) {
            await page.evaluate(async ({ buildingId, shot, viewport, environment }) => {
                const hooks = window.__testHooks;
                await hooks.getEngine().waitForLightingReady();
                if (environment === 'street') hooks.getEngine().setLightingSettings({ ...hooks.getEngine().lightingSettings, exposure: 1.6 });
                hooks.setViewport(viewport.width, viewport.height);
                await hooks.loadScenario('building_showcase', {
                    seed: 'ai549', buildingId, ...shot, waitForGroundTextures: true,
                    sun: { azimuthDeg: 55, elevationDeg: 38 },
                    ...(environment === 'street' ? { lighting: { sunIntensity: 5.75, hemiIntensity: 1.46 } } : {}),
                    hdri: { iblId: environment === 'street' ? 'ibl.hdri.german_town_street_2k' : 'ibl.calibrated.clear_afternoon_55', backgroundRotationDeg: 125, environmentRotationDeg: 125 }
                });
                hooks.step(30, { render: true });
                document.getElementById('harness-ui').style.display = 'none';
            }, { buildingId, shot, viewport, environment });
            await page.waitForFunction(() => {
                window.__testHooks.stepAdvanced(1, { renderEachTick: true });
                const m = window.__testHooks.getMetrics().scenario;
                return m.textures.total > 0 && m.textures.ready === m.textures.total && m.environment.present && m.environment.backgroundPresent
                    && !window.__testHooks.getEngine()._bakedLighting.shouldHoldView();
            }, null, { timeout: 90000 });
            const diagnostic = await page.evaluate(() => {
                const hooks = window.__testHooks, engine = hooks.getEngine();
                hooks.step(5, { render: true });
                const materials = new Map(), geometry = [];
                let parallaxInteriorMeshes = 0;
                engine.scene.traverse(object => {
                    for (const mat of [].concat(object.material || [])) {
                        if (mat.userData?.windowInterior) parallaxInteriorMeshes++;
                        if (!mat.userData?.windowGlass && !mat.userData?.buildingWindowGlass) continue;
                        materials.set(mat.uuid, {
                            tint: mat.color.getHexString(), metalness: mat.metalness, roughness: mat.roughness,
                            transmission: mat.transmission, opacity: mat.opacity, ior: mat.ior, thickness: mat.thickness,
                            transparent: mat.transparent, depthWrite: mat.depthWrite, side: mat.side,
                            envMapIntensity: mat.envMapIntensity, normalMap: !!mat.normalMap, userData: mat.userData
                        });
                        const pos = object.geometry.attributes.position, normals = object.geometry.attributes.normal;
                        let minNormal = Infinity, maxNormal = 0;
                        for (let i = 0; i < normals.count; i++) {
                            const length = Math.hypot(normals.getX(i), normals.getY(i), normals.getZ(i));
                            minNormal = Math.min(minNormal, length); maxNormal = Math.max(maxNormal, length);
                        }
                        geometry.push({ name: object.name, vertices: pos.count, instances: object.count || 1,
                            minNormal, maxNormal, castShadow: object.castShadow, scale: object.scale.toArray() });
                    }
                });
                return { metrics: hooks.getMetrics(), materials: [...materials.values()], geometry, parallaxInteriorMeshes,
                    settings: { lighting: engine.lightingSettings, shadows: engine.shadowSettings, ao: engine.ambientOcclusionSettings,
                        aa: engine.antiAliasingSettings, bloom: engine.bloomSettings, grading: engine.colorGradingSettings } };
            });
            expect(diagnostic.materials.length).toBeGreaterThan(0);
            expect(diagnostic.metrics.renderer.render.triangles).toBeGreaterThan(1000);
            if (phase === 'after') {
                const before = JSON.parse(await fs.readFile(path.join(root, buildingId, 'ai549', `before-${environment}/report.json`), 'utf8'));
                const matching = before.shots.find(item => item.name === shot.name);
                expect(diagnostic.metrics.scenario.camera).toEqual(matching.diagnostic.metrics.scenario.camera);
                expect(diagnostic.metrics.scenario.render).toEqual(matching.diagnostic.metrics.scenario.render);
                expect(diagnostic.metrics.scenario.environment).toEqual(matching.diagnostic.metrics.scenario.environment);
                if (matching.diagnostic.settings) expect(diagnostic.settings).toEqual(matching.diagnostic.settings);
            }
            await page.locator('#harness-canvas').screenshot({ path: path.join(out, `${shot.name}.png`) });
            report.shots.push({ name: shot.name, diagnostic });
            console.log(`[AI549] ${buildingId} ${phase} ${shot.name}`);
        }
        report.performance = await page.evaluate(async () => {
            const hooks = window.__testHooks, engine = hooks.getEngine(), renderer = engine.renderer;
            const gl = renderer.getContext(), debug = gl.getExtension('WEBGL_debug_renderer_info');
            const samples = [], cpuSamples = [], draws = [], triangles = [];
            hooks.setViewport(1280, 720);
            for (let i = 0; i < 30; i++) { hooks.stepAdvanced(1, { renderEachTick: true }); gl.finish(); }
            for (let i = 0; i < 90; i++) {
                const start = performance.now();
                hooks.stepAdvanced(1, { renderEachTick: true });
                cpuSamples.push(performance.now() - start);
                gl.finish(); samples.push(performance.now() - start);
                draws.push(renderer.info.render.calls); triangles.push(renderer.info.render.triangles);
                await new Promise(resolve => setTimeout(resolve, 0));
            }
            const stats = values => {
                const sorted = values.slice().sort((a, b) => a - b);
                return { mean: values.reduce((a, b) => a + b, 0) / values.length, median: sorted[Math.floor(sorted.length / 2)], p95: sorted[Math.ceil(sorted.length * .95) - 1] };
            };
            return { renderer: debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER),
                viewport: { width: 1280, height: 720 }, warmup: 30, count: 90,
                completedFrameMs: stats(samples), cpuSubmitMs: stats(cpuSamples), calls: stats(draws), triangles: stats(triangles),
                memory: { ...renderer.info.memory, programs: renderer.info.programs.length, jsHeapBytes: performance.memory?.usedJSHeapSize },
                gpuPassMs: null, gpuPassReason: 'Completed-frame gl.finish timing includes GPU work; individual passes are not separately timed.',
                metrics: hooks.getMetrics(), samples, cpuSamples };
        });
        await fs.writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2));
        expect(errors).toEqual([]);
    });
}
