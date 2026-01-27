// src/graphics/content3d/buildings/configs/BlueBeltTower.js
// City building config: Blue belt tower.
export const BLUE_BELT_TOWER_BUILDING_CONFIG = Object.freeze({
    id: "blue_belt_tower",
    name: "Blue belt tower",
    layers: Object.freeze(
        [
            {
                "id": "floor_36",
                "type": "floor",
                "floors": 8,
                "floorHeight": 3.8,
                "planOffset": 0,
                "style": "pbr.painted_plaster_wall",
                "material": {
                    "kind": "texture",
                    "id": "pbr.painted_plaster_wall"
                },
                "belt": {
                    "enabled": true,
                    "height": 1.2,
                    "extrusion": 1.37,
                    "material": {
                        "kind": "color",
                        "id": "offwhite"
                    }
                },
                "windows": {
                    "enabled": true,
                    "typeId": "window.style.light_blue",
                    "params": {},
                    "fakeDepth": {
                        "enabled": true,
                        "strength": 0.06,
                        "insetStrength": 0.25
                    },
                    "width": 2.2,
                    "height": 3.1,
                    "sillHeight": 0.8,
                    "spacing": 1.8,
                    "spaceColumns": {
                        "enabled": true,
                        "every": 4,
                        "width": 1,
                        "material": {
                            "kind": "color",
                            "id": "offwhite"
                        },
                        "extrude": true,
                        "extrudeDistance": 1
                    }
                }
            },
            {
                "id": "roof_37",
                "type": "roof",
                "ring": {
                    "enabled": false,
                    "innerRadius": 0,
                    "outerRadius": 0.4,
                    "height": 0,
                    "material": {
                        "kind": "color",
                        "id": "offwhite"
                    }
                },
                "roof": {
                    "type": "Asphalt",
                    "material": {
                        "kind": "color",
                        "id": "default"
                    },
                    "color": "default"
                }
            }
        ]
    ),
    floors: 8,
    floorHeight: 3.8,
    style: "default",
    windows: Object.freeze({
        width: 2.2,
        gap: 1.8,
        height: 3.1,
        y: 0.8
    }),
});

export default BLUE_BELT_TOWER_BUILDING_CONFIG;
