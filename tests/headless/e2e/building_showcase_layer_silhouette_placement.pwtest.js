// Browser regression: the showcase must place the default footprint and every
// detached floor silhouette with one shared design-to-world translation.
import test, { expect } from '@playwright/test';

const TOLERANCE = 1e-6;

test('Building showcase keeps detached upper-floor silhouettes on their base', async ({ page }) => {
    test.setTimeout(240_000);
    await page.goto('/tests/headless/harness/index.html?ibl=0&bloom=0');
    await page.waitForFunction(() => window.__testHooks?.version === 1);

    const report = await page.evaluate(async () => {
        const [{ getBuildingConfigById }, { resolveBuildingLayerSilhouettes }] = await Promise.all([
            import('/src/graphics/content3d/catalogs/BuildingConfigCatalog.js'),
            import('/src/app/buildings/silhouette_authoring/BuildingLayerSilhouetteModel.js')
        ]);
        await window.__testHooks.loadScenario('building_showcase', {
            seed: 'showcase-layer-placement',
            buildingId: 'bglass',
            mergeBuildingGeometry: false
        });

        const authored = getBuildingConfigById('bglass');
        const runtime = window.__testHooks.getEngine()?.context?.city?.map?.buildings
            ?.find((entry) => entry?.id === 'showcase_bglass');
        if (!authored || !runtime) throw new Error('B Glass showcase entry was not available');

        const authoredFootprint = authored.footprintLoops[0];
        const runtimeFootprint = runtime.footprintLoops[0];
        const offset = {
            x: runtimeFootprint[0].x - authoredFootprint[0].x,
            z: runtimeFootprint[0].z - authoredFootprint[0].z
        };
        const pointDelta = (worldPoint, designPoint) => ({
            x: worldPoint.x - designPoint.x,
            z: worldPoint.z - designPoint.z
        });
        const boundsOf = (loop) => {
            const xs = loop.map((point) => point.x);
            const zs = loop.map((point) => point.z);
            return {
                minX: Math.min(...xs),
                maxX: Math.max(...xs),
                minZ: Math.min(...zs),
                maxZ: Math.max(...zs)
            };
        };

        const authoredResolved = resolveBuildingLayerSilhouettes({
            layers: authored.layers,
            footprintLoops: authored.footprintLoops
        });
        const runtimeResolved = resolveBuildingLayerSilhouettes({
            layers: runtime.layers,
            footprintLoops: runtime.footprintLoops
        });
        const layers = authoredResolved.ordered.map((designLayer) => {
            const worldLayer = runtimeResolved.byLayerId[designLayer.layerId];
            return {
                layerId: designLayer.layerId,
                mode: designLayer.mode,
                pointCount: worldLayer?.loop?.length ?? 0,
                designPointCount: designLayer.loop.length,
                deltas: worldLayer?.loop?.map((point, index) => pointDelta(point, designLayer.loop[index])) ?? []
            };
        });
        const detachedIndex = authoredResolved.ordered.findIndex((entry) => entry.mode === 'detached');
        const lowerLayerId = authoredResolved.ordered[detachedIndex - 1]?.layerId;
        const upperLayerId = authoredResolved.ordered[detachedIndex]?.layerId;
        const lowerBounds = boundsOf(runtimeResolved.byLayerId[lowerLayerId].loop);
        const upperBounds = boundsOf(runtimeResolved.byLayerId[upperLayerId].loop);

        return {
            offset,
            footprintDeltas: runtimeFootprint.map((point, index) => pointDelta(point, authoredFootprint[index])),
            layers,
            detachedIndex,
            lowerLayerId,
            upperLayerId,
            lowerBounds,
            upperBounds
        };
    });

    expect(Math.hypot(report.offset.x, report.offset.z)).toBeGreaterThan(1);
    for (const delta of report.footprintDeltas) {
        expect(delta.x).toBeCloseTo(report.offset.x, 6);
        expect(delta.z).toBeCloseTo(report.offset.z, 6);
    }
    expect(report.detachedIndex).toBeGreaterThan(0);
    expect(report.layers.some((layer) => layer.mode === 'detached')).toBe(true);
    for (const layer of report.layers) {
        expect(layer.pointCount).toBe(layer.designPointCount);
        for (const delta of layer.deltas) {
            expect(Math.abs(delta.x - report.offset.x)).toBeLessThanOrEqual(TOLERANCE);
            expect(Math.abs(delta.z - report.offset.z)).toBeLessThanOrEqual(TOLERANCE);
        }
    }

    expect(report.upperBounds.minX).toBeGreaterThanOrEqual(report.lowerBounds.minX - TOLERANCE);
    expect(report.upperBounds.maxX).toBeLessThanOrEqual(report.lowerBounds.maxX + TOLERANCE);
    expect(report.upperBounds.minZ).toBeGreaterThanOrEqual(report.lowerBounds.minZ - TOLERANCE);
    expect(report.upperBounds.maxZ).toBeLessThanOrEqual(report.lowerBounds.maxZ + TOLERANCE);
});
