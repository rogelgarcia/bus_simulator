// Headless browser regression: mixed per-run local-u must not relabel the physical shell.
import test, { expect } from '@playwright/test';

test('BF2: mixed silhouette run orientation preserves stable runtime facade identities', async ({ page }) => {
    test.setTimeout(180_000);
    const errors = [];
    page.on('pageerror', (error) => errors.push(error?.message ?? String(error)));
    page.on('console', (message) => {
        if (message.type() === 'error' && !message.text().includes('ResizeObserver loop limit exceeded')) {
            errors.push(message.text());
        }
    });

    await page.goto('/index.html?screen=building_fabrication2&ibl=0&bloom=0&coreTests=0');
    await page.waitForSelector('#building-fab2-hud');
    await page.getByRole('button', { name: 'Create Building' }).click();

    const result = await page.evaluate(async () => {
        const view = window.__busSim?.sm?.current?.view;
        const config = structuredClone(view?._currentConfig ?? null);
        const layer = config?.layers?.find((entry) => entry?.type === 'floor');
        const loop = config?.footprintLoops?.[0];
        if (!view || !layer || !Array.isArray(loop) || loop.length !== 4) return null;
        loop.forEach((point, index) => {
            point.cornerId = `corner_${index + 1}`;
            point.runId = String.fromCharCode(65 + index);
            point.runForward = index !== 1;
        });
        loop[1].arc = { bulge: -0.25, segments: 12 };
        layer.silhouette = {
            version: 1,
            mode: 'detached',
            sourceLayerId: 'building_default',
            loop: structuredClone(loop),
            idState: { nextCornerSerial: 5, retiredCornerIds: [], retiredRunIds: [] }
        };
        view._currentConfig = config;

        const generator = await import('/src/graphics/assets3d/generators/building_fabrication/BuildingFabricationGenerator.js');
        const frames = generator.computeFacadeFramesFromLoop(loop, { warnings: [] });
        const loaded = view.scene.loadBuildingConfig(config, { preserveCamera: true });
        const wallKinds = view.scene?._building?.solidGroup?.children
            ?.filter((mesh) => mesh?.userData?.buildingFab2Role === 'wall')
            .map((mesh) => mesh.userData.buildingFab2WallKind ?? 'legacy') ?? [];
        return {
            loaded,
            order: frames?.order ?? null,
            bRunForward: frames?.B?.runForward,
            bHasCurve: !!frames?.B?.curve,
            aPhysicalEnd: frames?.A?.end ?? null,
            bPhysicalStart: frames?.B?.end ?? null,
            wallKinds
        };
    });

    expect(result).not.toBeNull();
    expect(result.loaded).toBe(true);
    expect(result.order).toEqual(['A', 'B', 'C', 'D']);
    expect(result.bRunForward).toBe(false);
    expect(result.bHasCurve).toBe(true);
    expect(result.aPhysicalEnd).toEqual(result.bPhysicalStart);
    expect(result.wallKinds).toContain('facade');
    expect(errors).toEqual([]);
});
