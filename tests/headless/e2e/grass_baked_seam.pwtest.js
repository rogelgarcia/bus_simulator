// Reproduce the distant canopy seam and compare its coverage against both endpoint representations.
import test, { expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';

const tall = !!process.env.GRASS_SEAM_TALL;
const output = process.env.GRASS_SEAM_OUTPUT || 'tests/artifacts/screens/grass_debug_v2/baked_lighting/canopy_seam' + (tall ? '/tall' : '');
test.use({ viewport: tall ? { width: 910, height: 866 } : { width: 1812, height: 960 }, deviceScaleFactor: tall ? 2 : 1, video: 'off', trace: 'off' });
test('distant blend keeps the coverage of its endpoint LODs', async ({ page }) => {
    test.setTimeout(180000); await mkdir(output, { recursive: true });
    const errors = [], rows = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    await page.route('**/GrassDebugV2BakedLightingScene.js', async route => {
        const response = await route.fetch();
        let body = await response.text();
        if (process.env.GRASS_SEAM_NARROW) body = body.replace("transitionFraction: appearance === 'detailed' ? .3 : .1", 'transitionFraction: .1');
        await route.fulfill({ response, body: body.replace('const api = Object.freeze', 'window.__seamTest = { renderer, camera, sets, selection };\nconst api = Object.freeze') });
    });
    await page.goto('/debug_tools/grass_baked_lighting_scene.html?appearance=detailed&shelter=0&strategy=baked&lod=AUTO');
    await page.evaluate(() => window.__grassBakedReadiness);
    await page.evaluate(() => {
        window.__grassBakedScene.setAnimating(false);
        for (const id of ['scene-panel', 'split-labels', 'scene-performance']) document.getElementById(id).hidden = true;
    });
    for (const pose of ['bus_19m_front', 'bus_40m_front', 'bus_40m_rear', 'bus_40m_side']) for (const lod of ['LOD4', 'LOD5', 'AUTO-before', 'AUTO']) {
        const result = await page.evaluate(({ pose, lod }) => {
            const viewer = window.__grassBakedScene, { renderer, camera, sets } = window.__seamTest;
            viewer.setPose(pose); viewer.setLod(lod === 'AUTO-before' ? 'AUTO' : lod);
            sets.baked.group.traverse(mesh => {
                const material = mesh.material;
                if (!material?.userData.grassProjectedCanopyBlend || !(material.defines?.GRASS_TRANSITION_BLEND_LEVEL >= 4)) return;
                if (lod === 'AUTO-before') delete material.defines.GRASS_PROJECTED_CANOPY_BLEND;
                else material.defines.GRASS_PROJECTED_CANOPY_BLEND = 1;
                material.needsUpdate = true;
            });
            viewer.step(0);
            const gl = renderer.getContext(), { width, height } = renderer.domElement, pixels = new Uint8Array(width * height * 4);
            gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
            const fields = sets.baked.getSnapshot().fields, point = camera.position.clone();
            const bins = Array.from({ length: 24 }, (_, i) => ({ start: 36 + i / 4, pixels: 0, luma: 0, dark: 0, detail: 0 }));
            for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
                point.set((x + .5) / width * 2 - 1, (y + .5) / height * 2 - 1, 1).unproject(camera).sub(camera.position);
                const t = (.07 - camera.position.y) / point.y, wx = camera.position.x + point.x * t, wz = camera.position.z + point.z * t;
                const range = Math.hypot(wx - camera.position.x, wz - camera.position.z), bin = bins[Math.floor((range - 36) * 4)];
                if (t <= 0 || !bin || !fields.some(field => wx > field.minX + .8 && wx < field.maxX - .8 && wz > field.minZ + .8 && wz < field.maxZ - .8)) continue;
                const i = (y * width + x) * 4, luma = pixels[i] * .2126 + pixels[i + 1] * .7152 + pixels[i + 2] * .0722;
                const neighbor = pixels[i + 4] * .2126 + pixels[i + 5] * .7152 + pixels[i + 6] * .0722;
                bin.pixels++; bin.luma += luma; bin.dark += Number(luma < 70); bin.detail += (luma - neighbor) ** 2;
            }
            return { bins: bins.map(bin => ({ ...bin, luma: bin.luma / bin.pixels, dark: bin.dark / bin.pixels, detail: Math.sqrt(bin.detail / bin.pixels) })), snapshot: viewer.getSnapshot() };
        }, { pose, lod });
        rows.push({ pose, lod, ...result });
        await page.locator('#scene-canvas').screenshot({ path: `${output}/${pose}-${lod}.png` });
    }
    const wall = [];
    for (const shaded of [false, true]) {
        wall.push(await page.evaluate(shaded => {
            const viewer = window.__grassBakedScene, { renderer, camera, sets } = window.__seamTest;
            viewer.setLod('LOD5'); viewer.setCamera([3, .28, 6.8], [3, .06, 5.9]);
            sets.baked.group.traverse(mesh => {
                if (!mesh.userData.grassCanopyStrip) return;
                mesh.material.vertexColors = shaded; mesh.material.needsUpdate = true;
            });
            viewer.step(0);
            const gl = renderer.getContext(), { width, height } = renderer.domElement, pixels = new Uint8Array(width * height * 4);
            gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
            const ray = camera.position.clone(), bands = { wall: { count: 0, luma: 0 }, top: { count: 0, luma: 0 } };
            for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
                ray.set((x + .5) / width * 2 - 1, (y + .5) / height * 2 - 1, 1).unproject(camera).sub(camera.position);
                const rampT = (12 - camera.position.y - 2 * camera.position.z) / (ray.y + 2 * ray.z);
                const rampZ = camera.position.z + ray.z * rampT, rampX = camera.position.x + ray.x * rampT;
                const topT = (.1 - camera.position.y) / ray.y, topZ = camera.position.z + ray.z * topT, topX = camera.position.x + ray.x * topT;
                const band = rampT > 0 && rampZ > 5.96 && rampZ < 5.99 && Math.abs(rampX) < 5 ? bands.wall
                    : topT > 0 && topZ > 5.6 && topZ < 5.8 && Math.abs(topX) < 5 ? bands.top : null;
                if (!band) continue;
                const i = (y * width + x) * 4;
                band.count++; band.luma += pixels[i] * .2126 + pixels[i + 1] * .7152 + pixels[i + 2] * .0722;
            }
            return { shaded, bands: Object.fromEntries(Object.entries(bands).map(([key, band]) => [key, { count: band.count, luma: band.luma / band.count }])), draw: viewer.getSnapshot().draw };
        }, shaded));
        await page.locator('#scene-canvas').screenshot({ path: `${output}/wall-${shaded ? 'shaded' : 'unshaded'}.png` });
    }
    const costs = process.env.GRASS_SEAM_PERF ? await page.evaluate(async () => {
        const viewer = window.__grassBakedScene, { sets } = window.__seamTest, frame = () => new Promise(resolve => requestAnimationFrame(resolve));
        const mean = values => values.reduce((sum, value) => sum + value, 0) / values.length, results = [];
        const select = mode => {
            viewer.setLod(mode === 'soil' ? 'OFF' : 'AUTO');
            sets.baked.group.traverse(mesh => {
                const material = mesh.material;
                if (!material?.userData.grassProjectedCanopyBlend || !(material.defines?.GRASS_TRANSITION_BLEND_LEVEL >= 4)) return;
                if (mode === 'before') delete material.defines.GRASS_PROJECTED_CANOPY_BLEND;
                else material.defines.GRASS_PROJECTED_CANOPY_BLEND = 1;
                material.needsUpdate = true;
            });
        };
        viewer.setPose('bus_40m_front');
        for (const mode of ['soil', 'before', 'after']) { select(mode); for (let i = 0; i < 96; i++) { if (i % 4 === 0) await frame(); viewer.step(0); } }
        for (const [round, modes] of [['soil', 'before', 'after'], ['after', 'before', 'soil'], ['before', 'soil', 'after'], ['after', 'soil', 'before'], ['soil', 'after', 'before'], ['before', 'after', 'soil']].entries()) for (const mode of modes) {
            select(mode);
            for (let i = 0; i < 32; i++) { if (i % 4 === 0) await frame(); viewer.step(0); }
            const start = viewer.gpu.getDiagnostics();
            for (let i = 0; i < 96; i++) { if (i % 4 === 0) await frame(); viewer.step(0); }
            const end = viewer.gpu.getDiagnostics().submissionSequence;
            for (let i = 0; i < 12; i++) { await frame(); viewer.gpu.poll(); }
            const samples = viewer.gpu.getSamplesSince(start.sampleSequence).filter(sample => sample.submissionSequence > start.submissionSequence && sample.submissionSequence <= end);
            if (samples.length < 92 || viewer.gpu.getDiagnostics().disjointCount !== start.disjointCount) throw new Error('Invalid seam GPU measurements.');
            results.push({ round, mode, gpuMs: mean(samples.map(sample => sample.ms)), samples: samples.map(sample => sample.ms), draw: viewer.getSnapshot().draw });
        }
        select('after'); viewer.step(0); return results;
    }) : [];
    await writeFile(`${output}/results.json`, JSON.stringify({ rows, wall, costs, errors }, null, 2));
    expect(errors).toEqual([]);
    expect(wall[1].draw).toEqual(wall[0].draw);
    expect(wall[1].bands.wall.count).toBeGreaterThan(1000);
    expect(wall[1].bands.wall.luma / wall[0].bands.wall.luma).toBeLessThan(.9);
    expect(wall[1].bands.wall.luma / wall[0].bands.wall.luma).toBeGreaterThan(.5);
    expect(Math.abs(wall[1].bands.top.luma - wall[0].bands.top.luma)).toBeLessThan(.1);
    for (const row of rows.filter(row => row.lod === 'LOD5')) {
        const reference = rows.find(other => other.pose === row.pose && other.lod === 'LOD4');
        const average = (bins, key) => bins.reduce((sum, bin) => sum + bin[key] * bin.pixels, 0) / bins.reduce((sum, bin) => sum + bin.pixels, 0);
        expect(Math.abs(average(row.bins, 'luma') - average(reference.bins, 'luma')), `${row.pose}: canopy brightness matches blades`).toBeLessThan(3);
        expect(average(row.bins, 'detail') / average(reference.bins, 'detail'), `${row.pose}: canopy retains blade-scale contrast`).toBeGreaterThan(.9);
    }
    for (const row of rows.filter(row => row.lod === 'AUTO')) for (const [i, bin] of row.bins.entries()) {
        if (bin.pixels < 100) continue;
        const reference = ['LOD4', 'LOD5'].map(lod => rows.find(other => other.pose === row.pose && other.lod === lod).bins[i]);
        expect(bin.luma, `${row.pose} ${bin.start}m: no dark stripe below either endpoint`).toBeGreaterThan(Math.min(...reference.map(value => value.luma)) * .98);
        expect(bin.dark, `${row.pose} ${bin.start}m: no extra holes`).toBeLessThanOrEqual(Math.max(...reference.map(value => value.dark)) + .02);
    }
    for (const row of rows.filter(row => row.lod === 'AUTO')) {
        const before = rows.find(other => other.pose === row.pose && other.lod === 'AUTO-before');
        expect(row.snapshot.draw).toEqual(before.snapshot.draw);
        expect(row.snapshot.selection.effectiveDistances).toEqual([.6, .8, 20, 30, 40]);
        const endpoints = ['LOD4', 'LOD5'].map(lod => rows.find(other => other.pose === row.pose && other.lod === lod));
        // Prepared root cavities are intentional; measure only darkness introduced by the transition.
        const excessDark = values => Math.max(0, ...values.bins.flatMap((bin, i) => bin.pixels > 100
            ? [bin.dark - Math.max(...endpoints.map(endpoint => endpoint.bins[i].dark))] : []));
        expect(excessDark(row)).toBeLessThan(Math.max(.003, excessDark(before) * .35));
    }
    for (const row of costs.filter(row => row.mode === 'after')) expect(row.draw).toEqual(costs.find(other => other.mode === 'before' && other.round === row.round).draw);
});
