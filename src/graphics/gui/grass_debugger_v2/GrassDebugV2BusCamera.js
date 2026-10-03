// Fixed gameplay bus height and pitch; changing range must not tilt the camera toward the grass.
// @ts-check
import { GRASS_LAB_CAMERA_PRESETS } from '../../../app/grass/GrassLabValidationContract.js';

const preset = GRASS_LAB_CAMERA_PRESETS.find(view => view.id === 'gameplay_bus');
export const GRASS_FIELD_BUS_CAMERA = Object.freeze({ heightMeters: preset.heightMeters,
    pitchDegrees: Math.atan2(preset.heightMeters - preset.targetHeightMeters, preset.distanceMeters) * 180 / Math.PI,
    fieldOfViewDegrees: 55 });

export const GRASS_FIELD_BUS_VIEWS = Object.freeze([14, 19, 24].flatMap(range =>
    [[40, 'front'], [220, 'rear'], [130, 'side']].map(([azimuth, direction]) => Object.freeze({
        id: 'bus_' + range + 'm_' + direction, label: 'Bus · ' + range + ' m · ' + direction,
        azimuth, elevation: GRASS_FIELD_BUS_CAMERA.pitchDegrees, fieldOfViewDegrees: GRASS_FIELD_BUS_CAMERA.fieldOfViewDegrees,
        distance: range / Math.cos(GRASS_FIELD_BUS_CAMERA.pitchDegrees * Math.PI / 180),
        target: Object.freeze([0, GRASS_FIELD_BUS_CAMERA.heightMeters - range * Math.tan(GRASS_FIELD_BUS_CAMERA.pitchDegrees * Math.PI / 180), 0]),
        horizontalRangeMeters: range
    }))));
