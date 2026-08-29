// AI 516 capture: the Burban catalog building from the tangent rounded corner.
import { scenarioBuildingShowcase } from './scenario_building_showcase.js';

export const scenarioAi516Burban = {
    id: 'ai516_burban',
    create(context) {
        return scenarioBuildingShowcase.create({
            ...context,
            options: {
                ...(context?.options ?? {}),
                buildingId: 'burban',
                cameraDir: { x: 0.82, y: 0.34, z: 1.0 },
                cameraPadding: 1.08,
                cameraTargetYFrac: 0.48,
                sun: { azimuthDeg: 55, elevationDeg: 38 }
            }
        });
    }
};

export const scenarioAi516BurbanCloseup = {
    id: 'ai516_burban_closeup',
    create(context) {
        return scenarioBuildingShowcase.create({
            ...context,
            options: {
                ...(context?.options ?? {}),
                buildingId: 'burban',
                cameraDir: { x: 0.92, y: 0.08, z: 1.0 },
                cameraPadding: 0.56,
                cameraTargetYFrac: 0.45,
                sun: { azimuthDeg: 55, elevationDeg: 38 }
            }
        });
    }
};
