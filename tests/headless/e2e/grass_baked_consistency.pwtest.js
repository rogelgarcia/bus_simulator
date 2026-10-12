// Matched before/after and adjacent LOD views without the shelter, including distant bus views.
import test, { expect } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { writeGrassBakedConsistencyReport } from '../visual/grass_baked_consistency_report.mjs';

const output = 'tests/artifacts/screens/grass_debug_v2/baked_lighting/consistency';
const poses = ['bus_14m_front', 'bus_19m_rear', 'bus_24m_side', ...[20, 25, 30, 35, 40, 45, 48, 64].flatMap(range => ['front', 'rear', 'side'].map(direction => `bus_${range}m_${direction}`)), 'overview', 'roots_close'];
const levels = ['LOD0', 'LOD1', 'LOD2', 'LOD3', 'LOD4', 'LOD5', 'AUTO'];
const versions = [
    { id: 'detailed', label: 'Detailed canopy v10', strategy: 'baked', appearance: 'detailed' },
    { id: 'ranged', label: 'Range matched v9', strategy: 'baked', appearance: 'ranged' },
    { id: 'midrange', label: 'Fine cards v8', strategy: 'baked', appearance: 'midrange' },
    { id: 'natural', label: 'Natural v7', strategy: 'baked', appearance: 'natural' },
    { id: 'previous', label: 'Earlier baked v4', strategy: 'baked', appearance: 'previous' },
    { id: 'lit', label: 'Original lit', strategy: 'current', appearance: 'soft' }
];
test.use({ viewport: { width: 1360, height: 900 }, deviceScaleFactor: 1, video: 'off', trace: 'off' });

test('prepared colors and coverage agree across adjacent LODs at bus height', async ({ page }) => {
    test.setTimeout(480000); await mkdir(output, { recursive: true });
    const selected = process.env.GRASS_COMPARE_VERSION;
    if (selected && !versions.some(version => version.id === selected)) throw new Error('Unknown comparison capture version: ' + selected);
    const cached = selected ? JSON.parse(await readFile(`${output}/results.json`, 'utf8')) : null;
    if (cached) {
        expect(cached.poses).toEqual(poses); expect(cached.errors).toEqual([]);
        for (const version of versions.filter(item => item.id !== selected)) {
            expect(cached.versions.find(item => item.id === version.id)).toEqual(version);
            expect(cached.rows.filter(row => row.version === version.id)).toHaveLength(poses.length * levels.length);
        }
    }
    const rows = cached ? cached.rows.filter(row => row.version !== selected) : [], errors = [], appearance = cached ? { ...cached.appearance } : {};
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    await page.route('**/GrassDebugV2BakedLightingScene.js*', async route => {
        const response = await route.fetch();
        await route.fulfill({ response, body: (await response.text()).replace('const api = Object.freeze', 'window.__consistency = { renderer, camera, sets, bakedAssets };\nconst api = Object.freeze') });
    });
    for (const { id: version, strategy, appearance: preset } of versions.filter(version => !selected || version.id === selected)) {
        await page.goto(`/debug_tools/grass_baked_lighting_scene.html?strategy=${strategy}&shelter=0&appearance=${preset}`);
        const initial = await page.evaluate(() => window.__grassBakedReadiness); appearance[version] = initial.appearance;
        appearance[version].cardAlphaSignatures = await page.evaluate(() => window.__consistency.bakedAssets.cards.map(card => {
            const pixels = card.maps.albedo.image.data; let signature = 2166136261;
            for (let i = 3; i < pixels.length; i += 4) signature = Math.imul(signature ^ pixels[i], 16777619);
            return signature >>> 0;
        }));
        expect(initial.shelter).toBe(false); expect(initial.shadows.externalCasters).toBe(0);
        await page.evaluate(() => {
            window.__grassBakedScene.setAnimating(false);
            for (const id of ['scene-panel', 'split-labels', 'scene-performance']) document.getElementById(id).hidden = true;
        });
        for (const pose of poses) for (const lod of levels) {
            const result = await page.evaluate(({ pose, lod }) => {
                const viewer = window.__grassBakedScene, { renderer, camera, sets } = window.__consistency;
                if (pose === 'roots_close') viewer.setCamera([3, .4, 5], [3, .05, 3.2]); else viewer.setPose(pose);
                viewer.setLod(lod); viewer.step(0);
                const gl = renderer.getContext(), { width, height } = renderer.domElement, pixels = new Uint8Array(width * height * 4);
                gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
                const fields = sets.baked.getSnapshot().fields, point = camera.position.clone(), rgb = [0, 0, 0];
                const distance = pose.startsWith('bus_') ? Number(pose.split('_')[1].slice(0, -1)) : null;
                let count = 0, green = 0, detail = 0, minY = height, maxY = 0;
                for (let y = 0; y < height; y += 4) for (let x = 0; x < width; x += 4) {
                    point.set((x + .5) / width * 2 - 1, (y + .5) / height * 2 - 1, 1).unproject(camera).sub(camera.position);
                    const t = (.05 - camera.position.y) / point.y, wx = camera.position.x + point.x * t, wz = camera.position.z + point.z * t;
                    if (t <= 0 || !fields.some(field => wx > field.minX + .4 && wx < field.maxX - .4 && wz > field.minZ + .4 && wz < field.maxZ - .4)) continue;
                    const range = Math.hypot(wx - camera.position.x, wz - camera.position.z);
                    if (distance && (range < distance - 5 || range > distance + 5)) continue;
                    if (x >= width / 4 && x <= width * .75) { minY = Math.min(minY, height - y); maxY = Math.max(maxY, height - y); }
                    const i = (y * width + x) * 4, [r, g, b] = pixels.subarray(i, i + 3);
                    count++; rgb[0] += r; rgb[1] += g; rgb[2] += b;
                    const difference = (r - pixels[i + 4]) * .2126 + (g - pixels[i + 5]) * .7152 + (b - pixels[i + 6]) * .0722;
                    detail += difference * difference;
                    if (g > r * 1.04 && g > b * 1.2) green++;
                }
                const snapshot = viewer.getSnapshot();
                return { rgb: rgb.map(value => value / count), detailContrast: Math.sqrt(detail / count), greenCoverage: green / count, pixels: count, draw: snapshot.draw,
                    band: distance ? [distance - 5, distance + 5] : null, crop: distance && maxY > minY ? { top: Math.max(0, minY - 8), height: maxY - minY + 16 } : null,
                    camera: snapshot.camera, activeLevels: snapshot.fields.baked.levels };
            }, { pose, lod });
            rows.push({ version, pose, lod, ...result });
            await page.locator('#scene-canvas').screenshot({ path: `${output}/${pose}-${version}-${lod}.png` });
        }
    }
    const data = { timestamp: new Date().toISOString(), poses, levels, versions, rows, appearance, errors };
    await writeFile(`${output}/results.json`, JSON.stringify(data, null, 2)); await writeGrassBakedConsistencyReport(output, data);
    expect(errors).toEqual([]);
    expect(appearance.midrange.colorTextureBytes).toBe(appearance.natural.colorTextureBytes);
    expect(appearance.midrange.runtimeNormalMaps).toBe(0); expect(appearance.midrange.runtimeRoughnessMaps).toBe(0);
    expect(appearance.ranged.colorTextureBytes).toBeLessThan(appearance.midrange.colorTextureBytes);
    expect(appearance.ranged.runtimeNormalMaps).toBe(0); expect(appearance.ranged.runtimeRoughnessMaps).toBe(0);
    expect(appearance.ranged.cardProfiles).toHaveLength(0);
    expect(appearance.detailed.colorTextureBytes).toBe(appearance.ranged.colorTextureBytes);
    expect(appearance.detailed.bladeProfiles).toEqual(appearance.ranged.bladeProfiles);
    expect(appearance.detailed.canopyFiltering.linearMagnification).toBe(true);
    expect(appearance.natural.runtimeNormalMaps).toBe(0); expect(appearance.natural.runtimeRoughnessMaps).toBe(0);
    expect(appearance.previous.cardProfiles[1].cardWidthMeters).toBe(.45);
    expect(appearance.natural.cardProfiles[1].cardWidthMeters).toBe(.5);
    for (const row of rows.filter(row => row.pose.startsWith('bus_'))) {
        expect(row.pixels).toBeGreaterThan(150); expect(row.camera.position[1]).toBe(4.5);
        expect(row.camera).toEqual(rows.find(other => other.version === 'midrange' && other.pose === row.pose && other.lod === row.lod).camera);
    }
});

test('comparison menus expose every LOD from every preserved version on either side', async ({ page }) => {
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.goto('/' + output + '/index.html');
    await expect(page.locator('#pose')).toHaveValue('bus_25m_front');
    await expect(page.locator('#left-label')).toHaveText('Detailed canopy v10 · LOD2');
    await expect(page.locator('#right-label')).toHaveText('Detailed canopy v10 · LOD3');
    expect(await page.locator('option[value^="tuned:"],option[value^="soft:"]').count()).toBe(0);
    for (const id of ['left-lod', 'lod']) for (const version of versions) for (const lod of levels) {
        await page.locator('#' + id).selectOption(version.id + ':' + lod);
        await expect(page.locator(id === 'left-lod' ? '#left' : '#right')).toHaveAttribute('src', `bus_25m_front-${version.id}-${lod}.png`);
        await page.waitForFunction(side => { const image = document.getElementById(side); return image.complete && image.naturalWidth === 1360; }, id === 'left-lod' ? 'left' : 'right');
    }
    await page.locator('#left-lod').selectOption('lit:LOD2'); await page.locator('#lod').selectOption('natural:LOD4');
    await page.locator('#pose').selectOption('bus_48m_rear'); await page.locator('#swap').click();
    await expect(page.locator('#left-label')).toHaveText('Natural v7 · LOD4');
    await expect(page.locator('#right-label')).toHaveText('Original lit · LOD2');
    await expect(page.locator('#live')).toHaveAttribute('href', /strategy=current&appearance=soft&lod=LOD2&pose=bus_48m_rear/);
    await page.locator('#left-lod').selectOption('previous:LOD5'); await page.locator('#lod').selectOption('natural:LOD5');
    await expect(page.locator('#left')).toHaveAttribute('src', 'bus_48m_rear-previous-LOD5.png');
    await expect(page.locator('#right')).toHaveAttribute('src', 'bus_48m_rear-natural-LOD5.png');
    await expect(page.locator('#live')).toHaveAttribute('href', /shelter=0&strategy=baked&appearance=natural&lod=LOD5&pose=bus_48m_rear/);
    await page.locator('#band4').click();
    await expect(page.locator('#pose')).toHaveValue('bus_35m_rear');
    await expect(page.locator('#lod')).toHaveValue('detailed:LOD4');
    await page.locator('#full-scene').check(); await expect(page.locator('#full-scene')).toBeChecked();
    await page.locator('#pose').selectOption('bus_25m_front'); await page.locator('#band3').click();
    await expect(page.locator('#live')).toHaveAttribute('href', /shelter=0&strategy=baked&appearance=detailed&lod=LOD3&pose=bus_25m_front/);
    await page.waitForFunction(() => [...document.querySelectorAll('figure img')].every(image => image.complete && image.naturalWidth === 1360));
    await page.screenshot({ path: `${output}/comparison.png`, fullPage: true });
    await page.goto('/' + output + '/index.html#lod5');
    await expect(page.locator('#pose')).toHaveValue('bus_45m_front');
    await expect(page.locator('#lod')).toHaveValue('detailed:LOD5');
    await page.waitForFunction(() => [...document.querySelectorAll('figure img')].every(image => image.complete && image.naturalWidth === 1360));
    await page.screenshot({ path: `${output}/comparison-lod5.png`, fullPage: true });
    expect(errors).toEqual([]);
});
