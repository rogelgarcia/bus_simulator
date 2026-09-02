// Terra & Mar catalog variant using the existing AI 489 recessed-balcony mode.
// AI 537 joins only the authored outer platforms/guards; this deliberately does
// not anticipate AI 540's full-height front treatments or connected cavities.
import { TERRA_MAR_BUILDING_CONFIG } from './terramar.js';

const RESIDENTIAL_LAYER_ID = 'floor_b8_residential';
const RECESSED_BALCONY_DEPTH_METERS = 1.5;
const RESIDENTIAL_BELT_EXTRUSION_METERS = 0.12;
const RECESSED_BALCONY_RUNOUT_METERS = 0.42;
const REAR_CONTINUITY_LINK_ID = 'b8_residential_rear_to_right_chamfer';

function clonePlainValue(value) {
    if (Array.isArray(value)) return value.map((entry) => clonePlainValue(entry));
    if (value && typeof value === 'object') {
        return Object.fromEntries(
            Object.entries(value).map(([key, entry]) => [key, clonePlainValue(entry)])
        );
    }
    return value;
}

function convertBalconyBayToRecessed(bay) {
    if (bay?.balcony?.enabled !== true) return bay;

    const platform = clonePlainValue(bay.balcony.platform ?? {});
    delete platform.depthMeters;

    return {
        ...bay,
        depth: {
            left: -RECESSED_BALCONY_DEPTH_METERS,
            right: -RECESSED_BALCONY_DEPTH_METERS,
            linked: true
        },
        balcony: {
            ...bay.balcony,
            presetId: 'balcony.modern_recessed',
            placement: 'recessed',
            platform,
            sides: { left: 'auto', front: 'always', right: 'auto' }
        }
    };
}

function mirrorRearContinuityEndpoint(link) {
    const mirrored = link?.id === REAR_CONTINUITY_LINK_ID
        ? {
            ...link,
            endpoints: [
            { faceId: 'E', bayId: 'b8_residential_front_balcony_right', edge: 'end' },
            { faceId: 'D', bayId: 'b8_residential_right_chamfer_balcony_adjacent_a', edge: 'start' }
            ]
        }
        : link;
    return {
        ...mirrored,
        cornerTransition: {
            type: 'rounded',
            leftRunoutMeters: RECESSED_BALCONY_RUNOUT_METERS,
            rightRunoutMeters: RECESSED_BALCONY_RUNOUT_METERS,
            runoutsLinked: true,
            meeting: 0.5
        }
    };
}

function convertResidentialFacadeToRecessed(facade) {
    const items = facade?.layout?.bays?.items;
    if (!Array.isArray(items)) return facade;
    return {
        ...facade,
        layout: {
            ...facade.layout,
            bays: {
                ...facade.layout.bays,
                items: items.map((bay) => convertBalconyBayToRecessed(bay))
            }
        }
    };
}

function buildTerraMarRecessedConfig() {
    const config = clonePlainValue(TERRA_MAR_BUILDING_CONFIG);
    config.id = 'terramar_recessed';
    config.name = 'Terra & Mar — Recessed Balconies';
    config.layers = config.layers.map((layer) => {
        if (layer.id !== RESIDENTIAL_LAYER_ID) return layer;
        const converted = {
            ...layer,
            faceLinking: {
                links: { C: 'G', D: 'B', E: 'A', F: 'H' },
                reverseByFace: { C: true, D: true, E: true }
            },
            belt: {
                ...layer.belt,
                extrusion: RESIDENTIAL_BELT_EXTRUSION_METERS
            },
            balconyContinuity: {
                ...layer.balconyContinuity,
                links: (layer?.balconyContinuity?.links ?? [])
                    .map((link) => mirrorRearContinuityEndpoint(link))
            }
        };
        return converted;
    });
    config.facades = {
        ...config.facades,
        [RESIDENTIAL_LAYER_ID]: Object.fromEntries(
            Object.entries(config.facades[RESIDENTIAL_LAYER_ID] ?? {})
                .map(([faceId, facade]) => [faceId, convertResidentialFacadeToRecessed(facade)])
        )
    };
    return config;
}

export const TERRA_MAR_RECESSED_BUILDING_CONFIG = Object.freeze(buildTerraMarRecessedConfig());

export default TERRA_MAR_RECESSED_BUILDING_CONFIG;
