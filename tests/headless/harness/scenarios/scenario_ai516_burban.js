// AI 516 capture: the Burban catalog building from the tangent rounded corner.
import { scenarioBuildingShowcase } from './scenario_building_showcase.js';

const COMMON_OPTIONS = Object.freeze({
    buildingId: 'burban',
    waitForGroundTextures: true,
    groundPresentation: Object.freeze({ color: 0xffffff }),
    lighting: Object.freeze({ hemiIntensity: 1.46, sunIntensity: 5.75 }),
    sun: Object.freeze({ azimuthDeg: 55, elevationDeg: 38 })
});

const OVERALL_CAMERA = Object.freeze({
    cameraDir: Object.freeze({ x: 0.18, y: 0.34, z: 1.0 }),
    cameraPadding: 1.08,
    cameraTargetYFrac: 0.48
});

const CLOSEUP_CAMERA = Object.freeze({
    // The source photo is predominantly frontal with only enough rightward
    // offset to describe the broad curve. A steep diagonal view makes the
    // straight entrance run read as a false third arc.
    cameraDir: Object.freeze({ x: 0.08, y: -0.12, z: 1.0 }),
    cameraPadding: 0.56,
    cameraTargetYFrac: 0.45
});

const HDRI_OPTIONS = Object.freeze({
    envMapIntensity: 0.82,
    backgroundBlurriness: 0,
    backgroundIntensity: 0.88,
    backgroundRotationDeg: 215,
    // Offset the reflection panorama from the visible backdrop so the front
    // glass catches a bright city-and-sky sector without flattening the stone.
    environmentRotationDeg: 125
});

function createBurbanScenario(context, camera, { hdri = false } = {}) {
    return scenarioBuildingShowcase.create({
        ...context,
        options: {
            ...(context?.options ?? {}),
            ...COMMON_OPTIONS,
            ...camera,
            ...(hdri ? { hdri: HDRI_OPTIONS } : {})
        }
    });
}

export const scenarioAi516Burban = {
    id: 'ai516_burban',
    create(context) {
        return createBurbanScenario(context, OVERALL_CAMERA, { hdri: true });
    }
};

export const scenarioAi516BurbanNeutral = {
    id: 'ai516_burban_neutral',
    create(context) {
        return createBurbanScenario(context, OVERALL_CAMERA);
    }
};

export const scenarioAi516BurbanCloseup = {
    id: 'ai516_burban_closeup',
    create(context) {
        return createBurbanScenario(context, CLOSEUP_CAMERA, { hdri: true });
    }
};

export const scenarioAi516BurbanCloseupNeutral = {
    id: 'ai516_burban_closeup_neutral',
    create(context) {
        return createBurbanScenario(context, CLOSEUP_CAMERA);
    }
};
