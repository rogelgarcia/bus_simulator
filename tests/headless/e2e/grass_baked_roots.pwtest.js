// Regression for roots being brightened back into the leaf body and hidden by a bright floor.
import test, { expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';

const output = 'tests/artifacts/screens/grass_debug_v2/baked_lighting/natural_depth';
test.use({ viewport: { width: 1360, height: 900 }, deviceScaleFactor: 1, video: 'off', trace: 'off' });

test('prepared root cavities and the understory remain dark without hiding grass', async ({ page }) => {
    test.setTimeout(180000); await mkdir(output, { recursive: true });
    const rows = [], materials = {}, errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    await page.route('**/GrassDebugV2BakedLightingScene.js', async route => {
        const response = await route.fetch();
        await route.fulfill({ response, body: (await response.text()).replace('const api = Object.freeze', 'window.__rootsTest = { renderer, camera, sets, bakedAssets };\nconst api = Object.freeze') });
    });
    for (const version of ['tuned', 'natural']) {
        await page.goto(`/debug_tools/grass_baked_lighting_scene.html?strategy=baked&shelter=0&appearance=${version}`);
        await page.evaluate(() => window.__grassBakedReadiness);
        materials[version] = await page.evaluate(() => {
            const viewer = window.__grassBakedScene, { bakedAssets } = window.__rootsTest;
            viewer.setAnimating(false);
            for (const id of ['scene-panel', 'split-labels', 'scene-performance']) document.getElementById(id).hidden = true;
            const rootRatios = {};
            for (const lod of ['LOD0', 'LOD1', 'LOD2']) {
                const geometry = bakedAssets.sources[lod].geometry, { position, color } = geometry.attributes;
                const height = geometry.boundingBox.max.y; let root = 0, rootCount = 0, tip = 0, tipCount = 0;
                for (let i = 0; i < color.count; i++) {
                    if (position.getY(i) < height * .1) { root += color.getY(i); rootCount++; }
                    if (position.getY(i) > height * .8) { tip += color.getY(i); tipCount++; }
                }
                rootRatios[lod] = (root / rootCount) / (tip / tipCount);
            }
            const base = bakedAssets.litterMaterial.map.image.data; let baseMean = 0;
            for (let i = 0; i < base.length; i += 4) baseMean += base[i] * .2126 + base[i + 1] * .7152 + base[i + 2] * .0722;
            const alpha = bakedAssets.cards.map(card => {
                const pixels = card.maps.albedo.image.data; let hash = 2166136261;
                for (let i = 3; i < pixels.length; i += 4) hash = Math.imul(hash ^ pixels[i], 16777619);
                return hash >>> 0;
            });
            return { rootRatios, baseMean: baseMean / (base.length / 4), alpha, appearance: bakedAssets.getSnapshot() };
        });
        for (const pose of ['bus_32m_front', 'bus_32m_rear', 'bus_32m_side', 'roots_close', 'overview']) for (const lod of ['LOD0', 'LOD2', 'LOD3', 'LOD4', 'LOD5']) {
            rows.push({ version, pose, lod, ...await page.evaluate(({ pose, lod }) => {
                const viewer = window.__grassBakedScene, { renderer, camera, sets } = window.__rootsTest;
                if (pose === 'roots_close') viewer.setCamera([3, .4, 5], [3, .05, 3.2]); else viewer.setPose(pose);
                viewer.setLod(lod); viewer.step(0);
                const gl = renderer.getContext(), { width, height } = renderer.domElement, pixels = new Uint8Array(width * height * 4);
                gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
                const fields = sets.baked.getSnapshot().fields, point = camera.position.clone(), rgb = [0, 0, 0];
                let count = 0, dark = 0, detail = 0;
                for (let y = 0; y < height; y += 4) for (let x = 0; x < width; x += 4) {
                    point.set((x + .5) / width * 2 - 1, (y + .5) / height * 2 - 1, 1).unproject(camera).sub(camera.position);
                    const t = (.05 - camera.position.y) / point.y, wx = camera.position.x + point.x * t, wz = camera.position.z + point.z * t;
                    if (t <= 0 || !fields.some(field => wx > field.minX + .4 && wx < field.maxX - .4 && wz > field.minZ + .4 && wz < field.maxZ - .4)) continue;
                    const i = (y * width + x) * 4, [r, g, b] = pixels.subarray(i, i + 3), luma = r * .2126 + g * .7152 + b * .0722;
                    rgb[0] += r; rgb[1] += g; rgb[2] += b; count++; if (luma < 65) dark++;
                    const difference = luma - (pixels[i + 4] * .2126 + pixels[i + 5] * .7152 + pixels[i + 6] * .0722);
                    detail += difference * difference;
                }
                return { rgb: rgb.map(value => value / count), darkFraction: dark / count, detailContrast: Math.sqrt(detail / count), draw: viewer.getSnapshot().draw };
            }, { pose, lod }) });
            await page.locator('#scene-canvas').screenshot({ path: `${output}/${pose}-${version}-${lod}.png` });
        }
    }
    await writeFile(`${output}/results.json`, JSON.stringify({ rows, materials, errors }, null, 2));
    expect(errors).toEqual([]);
    expect(materials.natural.alpha, 'Dark roots must not remove blade coverage').toEqual(materials.tuned.alpha);
    expect(materials.natural.appearance.colorTextureBytes).toBe(materials.tuned.appearance.colorTextureBytes);
    expect(materials.natural.baseMean, 'The prepared floor must sit below the illuminated leaves').toBeLessThan(materials.tuned.baseMean * .5);
    for (const lod of ['LOD0', 'LOD1', 'LOD2']) expect(materials.natural.rootRatios[lod], `${lod}: roots stay substantially darker than exposed tips`).toBeLessThan(.15);
    for (const row of rows.filter(row => row.version === 'natural')) {
        const previous = rows.find(old => old.version === 'tuned' && old.pose === row.pose && old.lod === row.lod);
        expect(row.draw).toEqual(previous.draw);
        if (row.pose.startsWith('bus_')) expect(row.detailContrast, `${row.pose} ${row.lod}: stronger visible blade separation`).toBeGreaterThan(previous.detailContrast * 1.15);
    }
    for (const pose of ['bus_32m_front', 'bus_32m_rear', 'bus_32m_side']) {
        const lumas = rows.filter(row => row.version === 'natural' && row.pose === pose).map(row => row.rgb[0] * .2126 + row.rgb[1] * .7152 + row.rgb[2] * .0722);
        expect(Math.max(...lumas) - Math.min(...lumas), `${pose}: root contrast should not create a brightness jump between adjacent LODs`).toBeLessThan(10);
    }
});
