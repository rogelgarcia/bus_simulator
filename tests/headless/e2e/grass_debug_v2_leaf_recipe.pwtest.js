// A supplied leaf recipe must drive field variants and every generated card level.
import test, { expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

test.use({ viewport: { width: 1000, height: 800 }, deviceScaleFactor: 1, video: 'off', trace: 'off' });
test('Leaf height and width overrides propagate into deterministic field geometry and card atlases', async ({ page }) => {
    test.setTimeout(120000);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    await page.goto('/debug_tools/grass_plant_study.html?layout=leaf');
    await page.waitForFunction(() => !!window.__plantCardsReadiness, null, { timeout: 30000 })
        .catch(error => { throw new Error(errors.join('\n') || error.message); });
    await page.evaluate(() => window.__plantCardsReadiness);
    const result = await page.evaluate(async () => {
        const THREE = await import('three');
        const { createGrassDebugV2SingleLeaf, GRASS_V2_SINGLE_LEAF } = await import('/src/graphics/gui/grass_debugger_v2/GrassDebugV2SingleLeaf.js');
        const { GRASS_V2_DETAILED_BLADE } = await import('/src/graphics/gui/grass_debugger_v2/GrassDebugV2DetailedBlade.js');
        const { createGrassDebugV2RandomLeafPatch } = await import('/src/graphics/gui/grass_debugger_v2/GrassDebugV2RandomLeafPatch.js');
        const { createGrassDebugV2PlantCards } = await import('/src/graphics/gui/grass_debugger_v2/GrassDebugV2PlantCards.js');
        const { varyGrassDebugV2LeafBend } = await import('/src/graphics/gui/grass_debugger_v2/GrassDebugV2LeafBend.js');
        const s = window.__plantCardsStudy, material = s.plant.leaves[0].material;
        const profiles = [{ id: 'test', share: 10, tipFraction: 0.8, upperBend: 0.4, length: [0.5, 0.5], width: [0.5, 0.5] }];
        const curve = GRASS_V2_SINGLE_LEAF.curve.map(([x, y, z]) => [x, y * 1.5, z * 1.5]);
        const base = createGrassDebugV2SingleLeaf({ material });
        const changed = createGrassDebugV2SingleLeaf({ material, definition: { curve },
            shape: { widthMeters: GRASS_V2_DETAILED_BLADE.widthMeters * 1.7 } });
        curve[3][1] = 100;
        const measure = async plant => {
            const patch = await createGrassDebugV2RandomLeafPatch({ renderer: s.renderer, plant, cards: s.cards, rootSoil: null,
                count: 10, profiles, seed: 321 });
            const leaf = patch.lod0.children[0], sourceBounds = leaf.geometry.boundingBox;
            const levels = Object.fromEntries(Object.entries(patch.representations).map(([id, value]) => {
                const mesh = value.group.children.find(mesh => mesh.isInstancedMesh), box = mesh.geometry.boundingBox;
                const map = mesh.material.map.image.data;
                let checksum = 2166136261;
                for (let i = 0; i < map.length; i += 97) checksum = Math.imul(checksum ^ map[i], 16777619) >>> 0;
                return [id, { height: box.max.y, width: box.max.x - box.min.x, triangles: mesh.geometry.index.count / 3, atlasChecksum: checksum }];
            }));
            const snapshot = patch.getSnapshot();
            const measured = { source: snapshot.sourceLeaf, sourceBounds: { min: sourceBounds.min.toArray(), max: sourceBounds.max.toArray() },
                placements: snapshot.placements, bends: snapshot.bends, levels,
                matrices: Array.from(leaf.instanceMatrix.array), seed: snapshot.seed,
                definitionFrozen: Object.isFrozen(snapshot.sourceLeaf.definition) && Object.isFrozen(snapshot.sourceLeaf.definition.curve) };
            patch.dispose(); return measured;
        };
        const baseline = await measure(base), modified = await measure(changed);
        const rotated = createGrassDebugV2SingleLeaf({ material, definition: { azimuthDegrees: 0 }, tipFraction: 0.8 });
        const opposite = createGrassDebugV2SingleLeaf({ material, tipFraction: 0.8 });
        varyGrassDebugV2LeafBend(rotated, 1, { upperBend: 0.4 });
        varyGrassDebugV2LeafBend(opposite, 1, { upperBend: 0.4 });
        const rotatedPositions = rotated.leaves[0].geometry.attributes.position;
        const oppositePositions = opposite.leaves[0].geometry.attributes.position;
        let rotationError = 0;
        for (let i = 0; i < rotatedPositions.count; i++) {
            const a = new THREE.Vector3().fromBufferAttribute(rotatedPositions, i).applyAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI);
            rotationError = Math.max(rotationError, a.distanceTo(new THREE.Vector3().fromBufferAttribute(oppositePositions, i)));
        }
        const tall = createGrassDebugV2SingleLeaf({ material,
            definition: { curve: GRASS_V2_SINGLE_LEAF.curve.map(([x, y, z]) => [x, y * 6, z * 6]) } });
        const tallCards = createGrassDebugV2PlantCards(s.renderer, tall, { nested: true });
        const tallCurve = new THREE.CubicBezierCurve3(...tall.getSnapshot().definition.curve.map(point => new THREE.Vector3(...point)));
        const sample = tallCurve.getPoint(0.9).applyAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI);
        const frame = tallCards.layout.frame, { pageWidth, height, capture } = tallCards.atlas.definition;
        const column = Math.floor((sample.x - frame.minX) * pageWidth / (frame.maxX - frame.minX));
        const row = Math.floor((frame.maxZ - sample.z) * height / (frame.maxZ - frame.minZ));
        const tallCapture = { ...capture, sampleHeight: sample.y,
            alpha: tallCards.atlas.albedo.image.data[(row * pageWidth * 2 + column) * 4 + 3] };
        tallCards.dispose(); tall.dispose();
        base.dispose(); changed.dispose(); rotated.dispose(); opposite.dispose();
        const invalid = [];
        for (const options of [{ definition: { acrossSegments: 3 } }, { shape: { widthMeters: 0 } }, { definition: { curve: [[0, 0, 0]] } }]) {
            try { const plant = createGrassDebugV2SingleLeaf({ material, ...options }); plant.dispose(); invalid.push(false); }
            catch { invalid.push(true); }
        }
        let invalidAllocation = false;
        try { await createGrassDebugV2RandomLeafPatch({ renderer: s.renderer, plant: s.plant, cards: s.cards, rootSoil: null,
            count: 10, profiles: [{ ...profiles[0], share: 9 }] }); }
        catch { invalidAllocation = true; }
        return { baseline, modified, rotationError, invalid, invalidAllocation, tallCapture };
    });
    const folder = path.resolve('tests/artifacts/screens/grass_debug_v2/leaf_recipe');
    await mkdir(folder, { recursive: true });
    await writeFile(path.join(folder, 'propagation.json'), JSON.stringify(result, null, 2));
    expect(result.invalid).toEqual([true, true, true]);
    expect(result.invalidAllocation).toBe(true);
    expect(result.tallCapture.sampleHeight).toBeGreaterThan(1);
    expect(result.tallCapture.cameraHeight).toBeGreaterThan(result.tallCapture.sourceMaxHeight);
    expect(result.tallCapture.far).toBeGreaterThan(result.tallCapture.cameraHeight - result.tallCapture.sourceMinHeight);
    expect(result.tallCapture.alpha).toBeGreaterThan(200);
    expect(result.rotationError).toBeLessThan(1e-7);
    expect(result.modified.source.definition.curve[3][1]).toBeCloseTo(0.195 * 1.5, 8);
    expect(result.modified.source.shape.widthMeters).toBeCloseTo(0.015 * 1.7, 8);
    expect(result.modified.definitionFrozen).toBe(true);
    expect(result.baseline.seed).toBe(321);
    expect(result.modified.placements).toEqual(result.baseline.placements);
    expect(result.modified.matrices).toEqual(result.baseline.matrices);
    const width = value => value.sourceBounds.max[0] - value.sourceBounds.min[0];
    expect(width(result.modified) / width(result.baseline)).toBeCloseTo(1.7, 5);
    expect(result.modified.sourceBounds.max[1] / result.baseline.sourceBounds.max[1]).toBeGreaterThan(1.4);
    expect(result.modified.bends[0].lengthMeters / result.baseline.bends[0].lengthMeters).toBeCloseTo(1.5, 5);
    for (const mode of ['refined', 'detailed', 'curved', 'split']) {
        const baseline = result.baseline.levels[mode], modified = result.modified.levels[mode];
        expect(modified.height).toBeCloseTo(result.modified.sourceBounds.max[1], 6);
        expect(modified.height / baseline.height).toBeGreaterThan(1.4);
        expect(modified.width).toBeGreaterThan(baseline.width * 1.3);
        expect(modified.triangles).toBe(baseline.triangles);
        expect(modified.atlasChecksum).not.toBe(baseline.atlasChecksum);
    }
    expect(errors).toEqual([]);
});
