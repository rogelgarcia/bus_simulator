// Verify a wrapped leaf sheath, enclosed shoot and seamless soil without changing the upper blade.
import test, { expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

test.use({ viewport: { width: 1600, height: 1200 }, deviceScaleFactor: 1, video: 'off' });
test('Single leaf keeps raised soil in LOD0 and bakes a small soil stain into LOD3', async ({ page }) => {
    const folder = path.resolve('tests/artifacts/screens/grass_debug_v2/speckled_root');
    await mkdir(folder, { recursive: true });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    await page.goto('/debug_tools/grass_plant_study.html?layout=leaf');
    await page.waitForFunction(() => !!window.__plantCardsReadiness);
    await page.evaluate(() => window.__plantCardsReadiness);
    const result = await page.evaluate(async () => {
        const THREE = await import('three');
        const { createGrassDebugV2DetailedBladeSampler } = await import('/src/graphics/gui/grass_debugger_v2/GrassDebugV2DetailedBlade.js');
        const { sampleGrassDebugV2SingleLeafHalfWidth } = await import('/src/graphics/gui/grass_debugger_v2/GrassDebugV2SingleLeaf.js');
        const study = window.__plantCardsStudy, geometry = study.plant.leaves[0].geometry;
        const { position: p, normal: n, uv } = geometry.attributes, index = geometry.index;
        const definition = study.plant.getSnapshot().definition, stride = definition.acrossSegments + 1;
        const curve = new THREE.CubicBezierCurve3(...definition.curve.map(point => new THREE.Vector3(...point)));
        const sample = createGrassDebugV2DetailedBladeSampler(curve, sampleGrassDebugV2SingleLeafHalfWidth);
        const expected = new THREE.Vector3(), actual = new THREE.Vector3(), groundXs = [];
        let upperShapeError = 0, minArea = Infinity, rootMaxY = -Infinity, maxNormalTurn = 0;
        for (let i = 0; i < p.count; i++) {
            if (uv.getY(i) === 0) rootMaxY = Math.max(rootMaxY, p.getY(i));
            if (uv.getY(i) >= 0.22) {
                sample(uv.getY(i), uv.getX(i) * 2 - 1, expected).applyAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI);
                upperShapeError = Math.max(upperShapeError, expected.distanceTo(actual.fromBufferAttribute(p, i)));
            }
            if (i >= stride && uv.getY(i) < 0.22) {
                maxNormalTurn = Math.max(maxNormalTurn, new THREE.Vector3().fromBufferAttribute(n, i)
                    .angleTo(new THREE.Vector3().fromBufferAttribute(n, i - stride)) * 180 / Math.PI);
            }
        }
        for (let i = 0; i < index.count; i += 3) {
            const vertices = [0, 1, 2].map(j => new THREE.Vector3().fromBufferAttribute(p, index.getX(i + j)));
            minArea = Math.min(minArea, vertices[1].clone().sub(vertices[0]).cross(vertices[2].clone().sub(vertices[0])).length() * 0.5);
            for (let j = 0; j < 3; j++) {
                const a = vertices[j], b = vertices[(j + 1) % 3];
                if ((a.y < 0) !== (b.y < 0)) groundXs.push(THREE.MathUtils.lerp(a.x, b.x, -a.y / (b.y - a.y)));
            }
        }
        const rootWidths = [];
        for (let row = 0; row * stride < p.count && uv.getY(row * stride) <= 0.22; row++) {
            const xs = Array.from({ length: stride }, (_, i) => p.getX(row * stride + i));
            rootWidths.push(Math.max(...xs) - Math.min(...xs));
        }
        const minimumWidthIncrease = Math.min(...rootWidths.slice(1).map((width, i) => width - rootWidths[i]));
        const row = 4 * stride, first = new THREE.Vector3().fromBufferAttribute(p, row);
        const last = new THREE.Vector3().fromBufferAttribute(p, row + stride - 1);
        const rowXs = Array.from({ length: stride }, (_, i) => p.getX(row + i));
        const sheathDiameter = Math.max(...rowXs) - Math.min(...rowXs);
        const openingGap = first.distanceTo(last);
        const soilGeometry = study.soil.surface.geometry, soilPosition = soilGeometry.attributes.position, soilUv = soilGeometry.attributes.uv;
        let outerSoilHeight = 0, uvError = 0;
        for (let i = 0; i < soilPosition.count; i++) {
            const x = soilPosition.getX(i), z = soilPosition.getZ(i);
            uvError = Math.max(uvError, Math.abs(soilUv.getX(i) - (0.5 + x / 20)),
                Math.abs(soilUv.getY(i) - (0.5 - (z - 0.1) / 20)));
            if (Math.abs(x) > 9 || Math.abs(z) > 9) outerSoilHeight = Math.max(outerSoilHeight, Math.abs(soilPosition.getY(i)));
        }
        return { bladeOpeningHeight: curve.getPoint(definition.sheathOpeningEnd).y, minimumWidthIncrease, sheathDiameter, openingGap, outerSoilHeight, uvError, groundWidth: Math.max(...groundXs) - Math.min(...groundXs), rootMaxY, minArea, upperShapeError, maxNormalTurn,
            rootSoilEnabled: study.getSnapshot().rootSoilEnabled, soil: study.soil.getSnapshot(),
            remoteSoilHeight: study.soil.getHeightAt(0.1, 0), shootCount: study.plant.crowns.length, bakeMeshes: study.plant.bakeMeshes.length };
    });
    await page.evaluate(() => window.__plantCardsStudy.setPose('crown_close'));
    await page.screenshot({ path: path.join(folder, 'lod0-base.png') });
    await writeFile(path.join(folder, 'validation.json'), JSON.stringify({ ...result, errors }, null, 2));
    expect(result.bladeOpeningHeight).toBeLessThan(0.02);
    expect(result.groundWidth).toBeGreaterThan(0.003);
    expect(result.groundWidth).toBeLessThan(0.005);
    expect(result.rootMaxY).toBeLessThan(-0.004);
    expect(result.upperShapeError).toBeLessThan(1e-7);
    expect(result.minArea).toBeGreaterThan(1e-14);
    expect(result.maxNormalTurn).toBeLessThan(12);
    expect(result.rootSoilEnabled).toBe(true);
    expect(result.shootCount).toBe(1);
    expect(result.bakeMeshes).toBe(2);
    expect(result.soil.maxHeight).toBeGreaterThan(0.0015);
    expect(result.soil.maxHeight).toBeLessThan(0.0025);
    expect(result.remoteSoilHeight).toBe(0);
    expect(result.outerSoilHeight).toBe(0);
    expect(result.uvError).toBeLessThan(1e-7);
    expect(result.minimumWidthIncrease).toBeGreaterThanOrEqual(-1e-9);
    expect(result.sheathDiameter).toBeGreaterThan(0.0034);
    expect(result.openingGap).toBeLessThan(result.sheathDiameter * 0.25);
    const soilAtlas = await page.evaluate(async () => {
        const { createGrassDebugV2PlantCardAtlas } = await import('/src/graphics/gui/grass_debugger_v2/GrassDebugV2PlantCardAtlas.js');
        const study = window.__plantCardsStudy, layout = study.cards.layout;
        const bare = createGrassDebugV2PlantCardAtlas(study.renderer, study.plant, layout);
        const image = study.cards.atlas.albedo.image, original = bare.albedo.image.data;
        let changedRootPixels = 0, changedUpperPixels = 0, changedAlphaPixels = 0;
        const rootBands = Object.fromEntries(['refined', 'detailed', 'curved', 'split'].map(mode => {
            const sides = mode === 'curved' ? layout.sides : layout[mode + 'Sides'];
            const [root, join] = Object.values(sides)[0].stations;
            return [mode, { root, slope: (join.y - root.y) / (join.z - root.z), cleanPixels: 0, dirtyPixels: 0, maximumHeight: 0 }];
        }));
        for (let y = 0; y < image.height; y++) {
            const z = layout.frame.maxZ - (y + 0.5) / image.height * (layout.frame.maxZ - layout.frame.minZ);
            for (let x = 0; x < image.width; x++) {
                const i = (y * image.width + x) * 4;
                if (image.data[i + 3] !== original[i + 3]) changedAlphaPixels++;
                if (!image.data[i + 3]) continue;
                const changed = [0, 1, 2].some(channel => image.data[i + channel] !== original[i + channel]);
                if (changed) {
                    if (Math.abs(z) > 0.02) changedUpperPixels++; else changedRootPixels++;
                }
                if (image.data[i + 3] < 250) continue;
                for (const band of Object.values(rootBands)) {
                    const height = band.root.y + (z - band.root.z) * band.slope;
                    if (height < 0 || height > 0.015) continue;
                    if (changed) { band.dirtyPixels++; band.maximumHeight = Math.max(band.maximumHeight, height); }
                    else band.cleanPixels++;
                }
            }
        }
        const definition = study.cards.atlas.definition.rootSoil;
        bare.dispose();
        return { changedRootPixels, changedUpperPixels, changedAlphaPixels, definition, rootBands };
    });
    expect(soilAtlas.changedRootPixels).toBeGreaterThan(0);
    expect(soilAtlas.changedUpperPixels).toBe(0);
    expect(soilAtlas.changedAlphaPixels).toBe(0);
    expect(soilAtlas.definition.material).toBe('Brown Earth');
    for (const band of Object.values(soilAtlas.rootBands)) {
        expect(band.dirtyPixels).toBeGreaterThan(0);
        expect(band.cleanPixels).toBeGreaterThan(band.dirtyPixels);
        expect(band.maximumHeight).toBeLessThan(0.012);
    }
    await writeFile(path.join(folder, 'soil-atlas.json'), JSON.stringify(soilAtlas, null, 2));
    for (const mode of ['LOD0', 'refined', 'detailed', 'curved', 'split']) {
        await page.evaluate(mode => window.__plantCardsStudy.setMode(mode), mode);
        expect(await page.evaluate(() => {
            const study = window.__plantCardsStudy;
            return { raisedSoil: study.soil.group.visible, flatGround: study.scene.getObjectByName('GrassV2DirtTerrain').visible,
                soilEnabled: study.getSnapshot().rootSoilEnabled };
        })).toEqual({ raisedSoil: mode === 'LOD0', flatGround: mode !== 'LOD0', soilEnabled: mode === 'LOD0' });
        for (const pose of ['crown_close', 'three_quarter']) {
            await page.evaluate(pose => window.__plantCardsStudy.setPose(pose), pose);
            await page.screenshot({ path: path.join(folder, mode + '-' + pose + '.png') });
        }
    }
    expect(errors).toEqual([]);
});
