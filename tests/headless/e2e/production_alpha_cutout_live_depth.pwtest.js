// Chrome/ANGLE proof for cutout-only native Three r183 shadow-depth evidence.
import test, {expect} from '@playwright/test';

test('production cutout-only live depth is sparse, native, and fully restored', async ({page}) => {
    const pageErrors = [];
    const consoleErrors = [];
    page.on('pageerror', (error) => pageErrors.push(String(error?.message ?? error)));
    page.on('console', (message) => {
        if (message.type() === 'error') consoleErrors.push(message.text());
    });
    await page.goto('/tests/headless/e2e/fixtures/production_alpha_cutout_live_depth.html');
    const result = await page.evaluate(async () => {
        const fixture = await import(
            '/tests/headless/e2e/fixtures/ProductionAlphaCutoutLiveDepthFixture.js'
        );
        return fixture.runProductionAlphaCutoutLiveDepthFixture();
    });

    expect(result.schema).toBe('ai531-production-alpha-cutout-live-depth-gpu-fixture-v1');
    expect(result.counts.fullOccupied).toBeGreaterThan(result.counts.cutoutOccupied);
    expect(result.counts.cutoutOccupied).toBeGreaterThan(0);
    expect(result.counts.restoredOccupied).toBe(result.counts.fullOccupied);
    expect(result.exactRestoration).toBe(true);
    expect(result.evidence).toEqual({
        schema: 'ai531-production-alpha-cutout-live-depth-capture-v1',
        method: 'three-r183-cutout-only-native-shadow-depth-sparse-samples-v1',
        cutoutCasterMaterialSlotCount: 1,
        liveOccupiedSampleCount: result.counts.cutoutOccupied,
        sampleCount: 1024,
        stateRestoration: 'verified',
        transfer: {
            component: 'depth-r-float32-v1',
            pixelPackBuffer: 'not-used',
            synchronization: 'blocking-get-buffer-sub-data-v1',
            transformFeedbackPrimitive: 'POINTS',
            vertexIndex: 'integer-texel-attribute-v1'
        }
    });
    expect(result.sourceState).toEqual({
        opaqueCastShadow: true,
        opaqueMaterialIdentity: true,
        cutoutCastShadow: true,
        cutoutMaterialIdentity: true
    });
    expect(pageErrors).toEqual([]);
    expect(consoleErrors).toEqual([]);
});
