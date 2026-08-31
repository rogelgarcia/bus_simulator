// AI 537 browser regression: floor-layer continuity survives BF2 normalization,
// cloning, export generation, and generated-module reload without shared data.
import test, { expect } from '@playwright/test';

test('BF2: balcony continuity is default-off and round-trips as deep independent layer data', async ({ page }) => {
    test.setTimeout(180_000);
    const errors = [];
    page.on('pageerror', (error) => errors.push(error?.message ?? String(error)));
    page.on('console', (message) => {
        if (message.type() === 'error' && !message.text().includes('ResizeObserver loop limit exceeded')) {
            errors.push(message.text());
        }
    });

    await page.goto('/tests/headless/harness/index.html?ibl=0&bloom=0');
    await page.waitForFunction(() => window.__testHooks?.version === 1);

    const report = await page.evaluate(async () => {
        const [types, exporter] = await Promise.all([
            import('/src/graphics/assets3d/generators/building_fabrication/BuildingFabricationTypes.js'),
            import('/src/app/city/buildings/BuildingConfigExport.js')
        ]);
        const continuity = {
            links: [
                {
                    id: ' front_to_side ',
                    cornerPost: true,
                    endpoints: [
                        { faceId: 'a', bayId: ' front_outer ', edge: 'END', label: 'Front' },
                        { faceId: 'b', bayId: 'side_outer', edge: 'start' }
                    ]
                }
            ]
        };
        const expected = {
            links: [
                {
                    id: 'front_to_side',
                    endpoints: [
                        { faceId: 'A', bayId: 'front_outer', edge: 'end' },
                        { faceId: 'B', bayId: 'side_outer', edge: 'start' }
                    ]
                }
            ]
        };
        const defaultFloor = types.createDefaultFloorLayer({ id: 'floor_default_off' });
        const floor = types.createDefaultFloorLayer({
            id: 'floor_roundtrip',
            balconyContinuity: continuity
        });
        const cloned = types.cloneBuildingLayers([floor]);
        const cloneDistinct = cloned[0].balconyContinuity !== floor.balconyContinuity
            && cloned[0].balconyContinuity.links !== floor.balconyContinuity.links
            && cloned[0].balconyContinuity.links[0].endpoints !== floor.balconyContinuity.links[0].endpoints;
        cloned[0].balconyContinuity.links[0].endpoints[0].bayId = 'changed_in_clone';
        const cloneMutationIndependent = floor.balconyContinuity.links[0].endpoints[0].bayId === 'front_outer';

        const exported = exporter.createCityBuildingConfigFromFabrication({
            id: 'continuity_roundtrip',
            name: 'Continuity Roundtrip',
            layers: [floor]
        });
        const exportDistinct = exported.layers[0].balconyContinuity !== floor.balconyContinuity
            && exported.layers[0].balconyContinuity.links[0].endpoints !== floor.balconyContinuity.links[0].endpoints;
        const source = exporter.serializeCityBuildingConfigToEsModule(exported, {
            exportConstName: 'CONTINUITY_ROUNDTRIP_BUILDING_CONFIG',
            fileBaseName: 'ContinuityRoundtrip'
        });
        exported.layers[0].balconyContinuity.links[0].endpoints[0].bayId = 'changed_in_export';
        const exportMutationIndependent = floor.balconyContinuity.links[0].endpoints[0].bayId === 'front_outer';

        const moduleUrl = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }));
        let importedContinuity = null;
        try {
            const imported = await import(moduleUrl);
            importedContinuity = imported.CONTINUITY_ROUNDTRIP_BUILDING_CONFIG.layers[0].balconyContinuity;
        } finally {
            URL.revokeObjectURL(moduleUrl);
        }
        return {
            defaultOff: !Object.hasOwn(defaultFloor, 'balconyContinuity'),
            floorContinuity: floor.balconyContinuity,
            expected,
            cloneDistinct,
            cloneMutationIndependent,
            exportDistinct,
            exportMutationIndependent,
            importedContinuity,
            sourceHasContinuity: source.includes('"balconyContinuity"')
        };
    });

    expect(report.defaultOff).toBe(true);
    expect(report.floorContinuity).toEqual(report.expected);
    expect(report.cloneDistinct).toBe(true);
    expect(report.cloneMutationIndependent).toBe(true);
    expect(report.exportDistinct).toBe(true);
    expect(report.exportMutationIndependent).toBe(true);
    expect(report.importedContinuity).toEqual(report.expected);
    expect(report.sourceHasContinuity).toBe(true);
    expect(errors).toEqual([]);
});
