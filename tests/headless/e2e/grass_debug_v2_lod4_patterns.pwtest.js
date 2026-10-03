// Review periodic source placement at identical close cameras before and after redistribution.
import test, { expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const output = path.resolve('tests/artifacts/screens/grass_debug_v2/lod4_rendered_feedback_views');
test.use({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1, video: 'off', trace: 'off',
    launchOptions: { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH || undefined, args: ['--force-color-profile=srgb'] } });

test('LOD4 periodic shoots reduce pattern formation across close camera angles', async ({ browser }) => {
    test.setTimeout(600000);
    const errors = [], captures = [], publishedMatches = [];
    const sourceModule = '**/GrassDebugV2CanopyRenderedOptimizer.js';
    for (const phase of ['before', 'after']) {
        const context = await browser.newContext({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1 });
        const page = await context.newPage();
        page.on('pageerror', error => errors.push(error.message));
        page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
        page.on('requestfailed', request => errors.push(request.url() + ': ' + request.failure()?.errorText));
        const folder = path.join(output, phase);
        await mkdir(folder, { recursive: true });
        // Keep the material response and initial placement identical; disable only the feedback pass.
        if (phase === 'before') await page.route(sourceModule, route => route.fulfill({ contentType: 'text/javascript',
            body: `import { createGrassDebugV2CanopyRenderedProbe } from './GrassDebugV2CanopyRenderedProbe.js';
                export async function refineGrassDebugV2CanopyRenderedPattern(mesh, options) {
                    const probe = createGrassDebugV2CanopyRenderedProbe(options);
                    try {
                        const initial = await probe.evaluate(mesh, 4096, 8192);
                        const views = initial.views.map(({heat,...view}) => view);
                        return { algorithm: 'rendered-feedback', published: false, verificationResolution: 4096,
                            verificationShadowResolution: 8192, renderPipeline: initial.renderPipeline,
                            views, finalViews: views, verification: { control: true, initial: views, candidate: views,
                                initialMasks: initial.masks, candidateMasks: initial.masks } };
                    } finally { probe.dispose(); }
                }` }));
        const compileQuery = phase === 'before' ? '&compileLod4Layout=1' : '';
        await page.goto('/debug_tools/grass_litter_scene.html?revision=lod4-paired-2m-1&lod=LOD4&fields=9' + compileQuery + '#03_rear');
        await page.waitForFunction(() => !!window.__grassLitterReadiness, null, { timeout: 120000 });
        await page.evaluate(() => window.__grassLitterReadiness);
        if (phase === 'after') {
            publishedMatches.push(...await page.evaluate(async () => {
                const layout = window.__grassLitterScene.canopy.getSnapshot().layout;
                const published = await (await fetch('/assets/public/grass/lod4/layout.json')).json();
                return published.variants.map((variant, i) => ({
                    variant: i, sourceHash: variant.source.hash, sourceMatches: variant.source.hash === layout.sourceHash,
                    geometryMatches: variant.positions.length === layout.vertices * 3 && variant.source.leaves === layout.leaves,
                    compatibilityMatches: JSON.stringify(layout.compatibility) === JSON.stringify(published.compatibility)
                }));
            }));
        }
        await page.addStyleTag({ content: '#scene-panel,#scene-performance{visibility:hidden!important}' });
        for (const distance of [21, 42]) for (const elevation of [12, 35, 65]) for (const azimuth of [22.5, 45, 112.5, 135, 202.5, 225, 292.5, 315]) {
            const pose = { elevation, azimuth, distance };
            const result = await page.evaluate(async pose => {
                const THREE = await import('three');
                const scene = window.__grassLitterScene;
                scene.setFieldCount(9); scene.setMode('all'); scene.setView(2); scene.setLod('LOD4');
                // Isolate source-layout changes; distance enlargement has its own radiance regression.
                for (const material of Object.values(scene.canopy.materials)) material.userData.grassCanopyDistance.value.set(100000,200000,2);
                const az = pose.azimuth * Math.PI / 180, el = pose.elevation * Math.PI / 180;
                scene.camera.position.set(Math.sin(az) * Math.cos(el) * pose.distance,
                    .1 + Math.sin(el) * pose.distance, -13 + Math.cos(az) * Math.cos(el) * pose.distance);
                scene.camera.up.set(0, 1, 0); scene.camera.lookAt(0, .1, -13); scene.camera.fov = 45;
                scene.camera.updateProjectionMatrix(); scene.camera.updateMatrixWorld(); scene.lighting.render(0);
                const renderer = scene.renderer, width = renderer.domElement.width, height = renderer.domElement.height;
                // Measure the displayed image after the scene's real HDR output
                // pass; a separate 8-bit scene render clips before tone mapping.
                const pixels = new Uint8Array(width * height * 4), gl = renderer.getContext();
                gl.readPixels(0,0,width,height,gl.RGBA,gl.UNSIGNED_BYTE,pixels);
                // The alternating A/B pair repeats every 4 m along each axis. Fold
                // a complete 2×2 set of supertiles inside the 12 m field interior.
                const size = 32, subdivisions = 8, period = scene.canopy.getSnapshot().definition.tileMeters * 2;
                const sums = new Float64Array(size * size), counts = new Uint16Array(size * size), point = new THREE.Vector3();
                const canopy = scene.scene.getObjectByName('GrassFieldTile_2').getObjectByName('GrassField-LOD4-Canopy');
                const position = canopy.geometry.attributes.position;
                const xs = [...new Set(Array.from({ length: position.count }, (_, i) => position.getX(i)))].sort((a, b) => a - b);
                const zs = [...new Set(Array.from({ length: position.count }, (_, i) => position.getZ(i)))].sort((a, b) => a - b);
                canopy.updateWorldMatrix(true, false);
                // Integrate each phase cell so blade-scale detail cannot alias
                // into low-frequency patterns; follow the actual canopy triangles.
                const coordinate = Array.from({ length: 2 * size * subdivisions }, (_, i) => ((i + .5) / (size * subdivisions) - 1) * period);
                const locate = (axis, value) => {
                    const index = axis.findIndex(n => n > value) - 1;
                    return { index, fraction: (value - axis[index]) / (axis[index + 1] - axis[index]) };
                };
                const columns = coordinate.map(value => locate(xs, value)), rows = coordinate.map(value => locate(zs, value));
                for (let z = 0; z < coordinate.length; z++) for (let x = 0; x < coordinate.length; x++) {
                    const tx = columns[x].fraction, tz = rows[z].fraction, vertex = rows[z].index * xs.length + columns[x].index;
                    const y00 = position.getY(vertex), y10 = position.getY(vertex + 1), y01 = position.getY(vertex + xs.length), y11 = position.getY(vertex + xs.length + 1);
                    const y = tx + tz <= 1 ? (1 - tx - tz) * y00 + tx * y10 + tz * y01 : (1 - tz) * y10 + (1 - tx) * y01 + (tx + tz - 1) * y11;
                    point.set(coordinate[x], y, coordinate[z]).applyMatrix4(canopy.matrixWorld).project(scene.camera);
                    const px = Math.floor((point.x * .5 + .5) * width), py = Math.floor((point.y * .5 + .5) * height);
                    if (px < 0 || px >= width || py < 0 || py >= height) continue;
                    const i = (py * width + px) * 4, cell = (Math.floor(z / subdivisions) % size) * size + Math.floor(x / subdivisions) % size;
                    sums[cell] += .2126 * pixels[i] + .7152 * pixels[i + 1] + .0722 * pixels[i + 2]; counts[cell]++;
                }
                if (counts.some(count => count === 0)) throw new Error('Pattern camera misses a phase of the 4 m tile pair.');
                const phase = sums.map((sum, i) => sum / counts[i]), contrast = [];
                for (const radius of [1, 2, 4]) {
                    const smooth = phase.map((_, i) => {
                        let sum = 0; const x = i % size, y = Math.floor(i / size);
                        for (let dy = -radius; dy <= radius; dy++) for (let dx = -radius; dx <= radius; dx++) sum += phase[((y + dy + size) % size) * size + (x + dx + size) % size];
                        return sum / ((radius * 2 + 1) ** 2);
                    });
                    const mean = smooth.reduce((a, b) => a + b) / smooth.length;
                    contrast.push(Math.sqrt(smooth.reduce((sum, n) => sum + (n - mean) ** 2, 0) / smooth.length) / mean);
                }
                return { snapshot: scene.canopy.getSnapshot(), phasePeriodMeters: period, samplesPerCell: Math.min(...counts), contrast };
            }, pose);
            const filename = `d${distance}_e${elevation}_a${azimuth}.png`;
            await page.screenshot({ path: path.join(folder, filename) });
            expect(result.snapshot.bake.renderedOptimization.algorithm).toBe('rendered-feedback');
            expect(result.snapshot.bake.renderedOptimization.verification.control === true).toBe(phase === 'before');
            expect(result.snapshot.layout.mode).toBe(phase === 'before' ? 'offline-compilation' : 'compiled');
            expect(result.phasePeriodMeters).toBe(4);
            expect(result.samplesPerCell).toBe(4 * 8 * 8);
            captures.push({ phase, pose, filename, ...result });
        }
        await context.close();
    }
    await writeFile(path.join(output, 'validation.json'), JSON.stringify({ errors, publishedMatches, captures }, null, 2));
    expect(errors).toEqual([]);
    expect(publishedMatches).toHaveLength(2);
    for (const match of publishedMatches) {
        expect(match.sourceMatches).toBe(true); expect(match.geometryMatches).toBe(true); expect(match.compatibilityMatches).toBe(true);
    }
    const optimization = captures.find(c => c.phase === 'after').snapshot.bake.renderedOptimization;
    expect(optimization.published).toBe(true);
    expect(optimization.verification.worstRatio).toBeLessThanOrEqual(1.05);
    expect(optimization.verification.meanRatio).toBeLessThan(1);
    const before = captures.filter(c => c.phase === 'before'), after = captures.filter(c => c.phase === 'after');
    const mean = rows => rows.reduce((sum, row) => sum + row.contrast[1], 0) / rows.length;
    expect(mean(after)).toBeLessThan(mean(before) * .97);
    for (let i = 0; i < after.length; i++) expect(after[i].contrast[1], JSON.stringify(after[i].pose)).toBeLessThan(before[i].contrast[1] * 1.05);
});
