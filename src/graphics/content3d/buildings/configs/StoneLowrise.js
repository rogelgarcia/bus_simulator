// src/graphics/content3d/buildings/configs/StoneLowrise.js
// City building config: Stone lowrise.
export const STONE_LOWRISE_BUILDING_CONFIG = Object.freeze({
    id: 'stone_lowrise',
    name: 'Stone lowrise',
    layers: Object.freeze(
        [
            {
                id: 'floor_1',
                type: 'floor',
                floors: 4,
                floorHeight: 3,
                planOffset: 0,
                style: 'stone_1',
                material: {
                    kind: 'texture',
                    id: 'stone_1'
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
                    width: 1.8,
                    height: 1.2,
                    sillHeight: 0.9,
                    spacing: 1.4,
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
    floors: 4,
    floorHeight: 3,
    style: 'stone_1',
    windows: Object.freeze({ width: 1.8, gap: 1.4, height: 1.2, y: 0.9 })
});

export default STONE_LOWRISE_BUILDING_CONFIG;
