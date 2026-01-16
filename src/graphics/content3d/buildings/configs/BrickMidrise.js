// src/graphics/content3d/buildings/configs/BrickMidrise.js
// City building config: Brick midrise.
export const BRICK_MIDRISE_BUILDING_CONFIG = Object.freeze({
    id: 'brick_midrise',
    name: 'Brick midrise',
    layers: Object.freeze(
        [
            {
                id: 'floor_1',
                type: 'floor',
                floors: 5,
                floorHeight: 3,
                planOffset: 0,
                style: 'brick',
                material: {
                    kind: 'texture',
                    id: 'pbr.red_brick'
                },
                belt: {
                    enabled: false,
                    height: 0.18,
                    extrusion: 0,
                    material: {
                        kind: 'color',
                        id: 'offwhite'
                    }
                },
                windows: {
                    enabled: true,
                    typeId: 'window.style.default',
                    params: {},
                    width: 2.2,
                    height: 1.4,
                    sillHeight: 1.0,
                    spacing: 1.6,
                    cornerEps: 0.12,
                    offset: 0.05,
                    spaceColumns: {
                        enabled: false,
                        every: 4,
                        width: 0.9,
                        material: {
                            kind: 'color',
                            id: 'offwhite'
                        },
                        extrude: false,
                        extrudeDistance: 0.12
                    }
                }
            },
            {
                id: 'roof_2',
                type: 'roof',
                ring: {
                    enabled: false,
                    innerRadius: 0,
                    outerRadius: 0.4,
                    height: 0,
                    material: {
                        kind: 'color',
                        id: 'offwhite'
                    }
                },
                roof: {
                    type: 'Asphalt',
                    material: {
                        kind: 'color',
                        id: 'default'
                    },
                    color: 'default'
                }
            }
        ]
    ),
    floors: 5,
    floorHeight: 3,
    style: 'brick',
    windows: Object.freeze({ width: 2.2, gap: 1.6, height: 1.4, y: 1.0 })
});

export default BRICK_MIDRISE_BUILDING_CONFIG;
