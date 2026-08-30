// Reference capture scenario for the B2 catalog building.
import { scenarioBuildingShowcase } from './scenario_building_showcase.js';

const OPTIONS = Object.freeze({
    buildingId: 'b2',
    waitForGroundTextures: true,
    groundPresentation: Object.freeze({ color: 0xffffff }),
    cameraDir: Object.freeze({ x: 0.03, y: 0.14, z: 1 }),
    cameraPadding: 1.04,
    cameraPaddingWide: 2,
    cameraTargetYFrac: 0.48,
    cameraTargetYFracWide: 0,
    cameraTargetOffset: Object.freeze({ x: 5, y: 0, z: 0 }),
    cameraTargetOffsetWide: Object.freeze({ x: 27, y: 0, z: 0 }),
    lighting: Object.freeze({ hemiIntensity: 1.4, sunIntensity: 5.4 }),
    sun: Object.freeze({ azimuthDeg: 48, elevationDeg: 38 })
});

export const scenarioB2Reference = {
    id: 'b2_reference',
    async create(context) {
        const handle = await scenarioBuildingShowcase.create({
            ...context,
            options: { ...(context?.options ?? {}), ...OPTIONS }
        });
        const deadline = performance.now() + 20_000;
        while (true) {
            const textures = handle?.getMetrics?.()?.textures ?? null;
            if (textures?.total > 0 && textures.ready >= textures.total) break;
            if (performance.now() >= deadline) {
                throw new Error(`B2 reference textures did not finish loading (${textures?.ready ?? 0}/${textures?.total ?? 0}).`);
            }
            await new Promise((resolve) => setTimeout(resolve, 16));
        }
        context.engine.renderFrame();
        return handle;
    }
};
