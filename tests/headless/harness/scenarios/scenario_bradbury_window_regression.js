// Regression capture: Bradbury's deeply inset, parallax-backed windows must
// show only their brick facade reveals, never pale interior-shell fins.
import { scenarioBuildingShowcase } from './scenario_building_showcase.js';

const OPTIONS = Object.freeze({
    buildingId: 'bradbury_block',
    waitForGroundTextures: true,
    groundPresentation: Object.freeze({ color: 0xffffff }),
    lighting: Object.freeze({ hemiIntensity: 1.42, sunIntensity: 5.5 }),
    sun: Object.freeze({ azimuthDeg: 55, elevationDeg: 38 })
});

async function waitForShowcaseTextures(handle) {
    const deadline = performance.now() + 20_000;
    while (true) {
        const textures = handle?.getMetrics?.()?.textures ?? null;
        if (textures?.total > 0 && textures.ready >= textures.total) return;
        if (performance.now() >= deadline) {
            throw new Error(`Bradbury regression textures did not finish loading (${textures?.ready ?? 0}/${textures?.total ?? 0}).`);
        }
        await new Promise((resolve) => setTimeout(resolve, 16));
    }
}

function createShowcase(context) {
    return scenarioBuildingShowcase.create({
        ...context,
        options: { ...(context?.options ?? {}), ...OPTIONS }
    });
}

export const scenarioBradburyWindowRegression = {
    id: 'bradbury_window_regression',
    async create(context) {
        // Bradbury uses several calibrated PBR sets. Build once to warm their
        // decoded texture cache, then rebuild exactly as the visual spec does.
        const warmup = await createShowcase(context);
        await waitForShowcaseTextures(warmup);
        warmup.dispose();
        const handle = await createShowcase(context);
        await waitForShowcaseTextures(handle);
        const building = context.engine.scene.getObjectByName('showcase_bradbury_block');
        if (!building) throw new Error('Bradbury regression scenario could not find the showcase building.');
        building.updateMatrixWorld(true);
        const box = new context.THREE.Box3().setFromObject(building);
        const height = box.max.y - box.min.y;
        const depth = box.max.z - box.min.z;
        // Crop into the middle/arcade windows on the +x entry facade. A small
        // z offset keeps the reveal edges visible without turning the facade
        // into an unreadably compressed grazing shot.
        const target = new context.THREE.Vector3(
            box.max.x,
            box.min.y + height * 0.58,
            box.min.z + depth * 0.58
        );
        context.engine.camera.position.set(
            box.max.x + height * 1.1,
            target.y + height * 0.08,
            target.z + depth * 0.08
        );
        context.engine.camera.lookAt(target);
        context.engine.camera.updateProjectionMatrix();
        context.engine.camera.updateMatrixWorld(true);
        context.engine.renderFrame();
        const canvas = context.engine.renderer.domElement;
        canvas.setAttribute('data-bradbury-window-regression-png', canvas.toDataURL('image/png'));
        return {
            ...handle,
            dispose() {
                canvas.removeAttribute('data-bradbury-window-regression-png');
                handle.dispose();
            }
        };
    }
};
