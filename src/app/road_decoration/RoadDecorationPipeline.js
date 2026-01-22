// src/app/road_decoration/RoadDecorationPipeline.js
// Defines the ordered Road Decoration Pipeline (placeholder steps only).

const DEFAULT_PIPELINE = Object.freeze([
    Object.freeze({
        id: 'markings',
        label: 'Markings',
        icon: 'edit_road',
        tooltip: 'Lane/center/corner markings (center line, lane dividers, edge lines, turn/corner markings).',
        enabled: true
    }),
    Object.freeze({
        id: 'curbs',
        label: 'Curbs',
        icon: 'rounded_corner',
        tooltip: 'Curb geometry along road edges.',
        enabled: false
    }),
    Object.freeze({
        id: 'crossings',
        label: 'Crossings',
        icon: 'crosswalk',
        tooltip: 'Crosswalks, stop bars, yield triangles (placeholder).',
        enabled: false
    }),
    Object.freeze({
        id: 'stop_signs',
        label: 'Stop signs',
        icon: 'stop_sign',
        tooltip: 'Stop sign placement at relevant approaches (placeholder).',
        enabled: false
    }),
    Object.freeze({
        id: 'traffic_lights',
        label: 'Traffic lights',
        icon: 'traffic',
        tooltip: 'Traffic light placement and phasing metadata (placeholder).',
        enabled: false
    }),
    Object.freeze({
        id: 'sidewalks',
        label: 'Sidewalks',
        icon: 'sidewalk',
        tooltip: 'Sidewalk geometry along road edges.',
        enabled: false
    }),
    Object.freeze({
        id: 'road_props',
        label: 'Road props',
        icon: 'construction',
        tooltip: 'Cones, barriers, bollards, guardrails, reflectors (placeholder).',
        enabled: false
    }),
    Object.freeze({
        id: 'street_lighting',
        label: 'Street lighting',
        icon: 'lightbulb',
        tooltip: 'Street lamps and lighting props (placeholder).',
        enabled: false
    }),
    Object.freeze({
        id: 'decals_wear',
        label: 'Decals / wear',
        icon: 'texture',
        tooltip: 'Tire marks, cracks, patched asphalt, manholes/drains (placeholder).',
        enabled: false
    }),
    Object.freeze({
        id: 'parking_bus_bike',
        label: 'Parking / bus / bike',
        icon: 'local_parking',
        tooltip: 'Parking/bus/bike lane markings and reserved areas (placeholder).',
        enabled: false
    }),
    Object.freeze({
        id: 'debug_overlay',
        label: 'Debug overlay',
        icon: 'bug_report',
        tooltip: 'Debug/metadata overlays for decoration steps (placeholder).',
        enabled: false
    })
]);

function normalizeStepId(value) {
    const id = typeof value === 'string' ? value.trim() : '';
    return id ? id : null;
}

export function getDefaultRoadDecorationPipeline() {
    return DEFAULT_PIPELINE.map((step) => ({ ...step }));
}

export function resolveRoadDecorationPipeline(input) {
    const enabledById = new Map();

    const readSteps = (steps) => {
        const list = Array.isArray(steps) ? steps : [];
        for (const step of list) {
            const id = normalizeStepId(step?.id);
            if (!id) continue;
            enabledById.set(id, !!step?.enabled);
        }
    };

    if (Array.isArray(input)) {
        readSteps(input);
    } else if (input && typeof input === 'object') {
        if (Array.isArray(input.steps)) readSteps(input.steps);
        else if (input.enabledById && typeof input.enabledById === 'object') {
            for (const [key, value] of Object.entries(input.enabledById)) {
                const id = normalizeStepId(key);
                if (!id) continue;
                enabledById.set(id, !!value);
            }
        } else {
            for (const [key, value] of Object.entries(input)) {
                const id = normalizeStepId(key);
                if (!id) continue;
                enabledById.set(id, !!value);
            }
        }
    }

    return DEFAULT_PIPELINE.map((step) => ({
        ...step,
        enabled: enabledById.has(step.id) ? enabledById.get(step.id) : !!step.enabled
    }));
}
