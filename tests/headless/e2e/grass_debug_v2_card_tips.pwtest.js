// Regression for stable opaque tip height and a shared upper card across authoring LODs.
import test, { expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

test.use({ viewport: { width: 1400, height: 1000 }, deviceScaleFactor: 1, video: 'off', trace: 'off' });
test('Grass card LODs keep the same occupied tip plane without extrapolated top padding', async ({ page }) => {
    test.setTimeout(120000);
    const folder = path.resolve('tests/artifacts/screens/grass_debug_v2/aligned_card_tips');
    await mkdir(folder, { recursive: true });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto('/debug_tools/grass_plant_study.html?layout=random');
    await page.waitForFunction(() => !!window.__plantCardsReadiness);
    await page.evaluate(() => window.__plantCardsReadiness);
    const profiles = await page.evaluate(async () => {
        const { createGrassDebugV2SingleLeaf } = await import('/src/graphics/gui/grass_debugger_v2/GrassDebugV2SingleLeaf.js');
        const { varyGrassDebugV2LeafBend } = await import('/src/graphics/gui/grass_debugger_v2/GrassDebugV2LeafBend.js');
        const { createGrassDebugV2PlantCardLayout } = await import('/src/graphics/gui/grass_debugger_v2/GrassDebugV2PlantCardLayout.js');
        return [[1, 0], [0.76, 0.15], [0.80, 0.40], [0.84, 0.70]].map(([tipFraction, upperBend]) => {
            const plant = createGrassDebugV2SingleLeaf({ material: window.__plantCardsStudy.plant.leaves[0].material, tipFraction });
            varyGrassDebugV2LeafBend(plant, 1, { upperBend });
            const layout = createGrassDebugV2PlantCardLayout(plant, { nested: true });
            const bounds = plant.leaves[0].geometry.boundingBox;
            const heightAt = (stations, z) => {
                const index = stations.findIndex((point, i) => i > 0 && Math.abs(point.z) >= Math.abs(z) - 1e-9);
                const start = stations[index - 1], end = stations[index];
                return start.y + (end.y - start.y) * (z - start.z) / (end.z - start.z);
            };
            const levels = ['refined', 'detailed', 'curved', 'split'].map(mode => {
                const side = Object.values(layout[mode === 'curved' ? 'sides' : mode + 'Sides'])[0];
                const tipCard = Object.values(layout[mode + 'Cards']).at(-1);
                return { mode, stations: side.stations, angles: side.anglesDegrees, cards: layout[mode].index.count / 6,
                    maximumHeight: layout[mode].boundingBox.max.y,
                    visibleTipHeight: heightAt(side.stations, bounds.min.z),
                    tipPositions: Array.from(tipCard.attributes.position.array), tipUvs: Array.from(tipCard.attributes.uv.array) };
            });
            const result = { tipFraction, upperBend, sourceTipZ: bounds.min.z, sourceHeight: bounds.max.y, levels };
            layout.dispose(); plant.dispose(); return result;
        });
    });
    await writeFile(path.join(folder, 'geometry.json'), JSON.stringify(profiles, null, 2));
    for (const profile of profiles) {
        const reference = profile.levels[0];
        expect(profile.levels.map(level => level.cards)).toEqual([10, 5, 3, 2]);
        for (const level of profile.levels) {
            expect(level.stations.at(-1).z, 'No empty extension above the source tip').toBeCloseTo(profile.sourceTipZ, 7);
            expect(level.maximumHeight).toBeCloseTo(profile.sourceHeight, 7);
            expect(level.visibleTipHeight).toBeCloseTo(profile.sourceHeight, 7);
            expect(level.tipPositions, 'The visible upper curve must not move between LODs').toEqual(reference.tipPositions);
            expect(level.tipUvs).toEqual(reference.tipUvs);
            expect(level.angles.at(-1)).toBeLessThanOrEqual(level.angles.at(-2) + 0.1);
        }
    }
    await page.evaluate(() => {
        const s = window.__plantCardsStudy;
        s.comparison.group.visible = false;
        document.querySelector('#patch-labels').click();
        s.camera.position.set(1.4, 0.16, 1.4); s.controls.target.set(0, 0.045, 0); s.controls.update();
    });
    for (const mode of ['LOD0', 'refined', 'detailed', 'curved', 'split']) {
        await page.evaluate(mode => window.__plantCardsStudy.setMode(mode), mode);
        await page.screenshot({ path: path.join(folder, mode + '-patch.png') });
    }
    expect(errors).toEqual([]);
});
