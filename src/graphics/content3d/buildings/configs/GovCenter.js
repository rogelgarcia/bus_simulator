// src/graphics/content3d/buildings/configs/GovCenter.js
// City building config: Gov center.
export const GOV_CENTER_BUILDING_CONFIG = Object.freeze({
    id: "gov_center",
    name: "Gov center",
    layers: Object.freeze(
        [
            {
                "id": "floor_36",
                "type": "floor",
                "floors": 2,
                "floorHeight": 5,
                "planOffset": 1.7,
                "style": "pbr.plaster_brick_pattern",
                "material": {
                    "kind": "texture",
                    "id": "pbr.plaster_brick_pattern"
                },
                "belt": {
                    "enabled": false,
                    "height": 0.18,
                    "extrusion": 0,
                    "material": {
                        "kind": "color",
                        "id": "offwhite"
                    }
                },
                "windows": {
                    "enabled": true,
                    "typeId": "window.style.dark",
                    "params": {},
                    "width": 2.7,
                    "height": 5.6,
                    "sillHeight": 0,
                    "spacing": 0,
                    "spaceColumns": {
                        "enabled": false,
                        "every": 4,
                        "width": 0.9,
                        "material": {
                            "kind": "color",
                            "id": "offwhite"
                        },
                        "extrude": false,
                        "extrudeDistance": 0.12
                    }
                }
            },
            {
                "id": "roof_37",
                "type": "roof",
                "ring": {
                    "enabled": true,
                    "innerRadius": 0,
                    "outerRadius": 0.55,
                    "height": 1.48,
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
            },
            {
                "id": "roof_40",
                "type": "roof",
                "ring": {
                    "enabled": true,
                    "innerRadius": 4.55,
                    "outerRadius": 1.5,
                    "height": 2,
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
            },
            {
                "id": "floor_41",
                "type": "floor",
                "floors": 8,
                "floorHeight": 3.4,
                "planOffset": 4.2,
                "style": "pbr.plaster_brick_pattern",
                "material": {
                    "kind": "texture",
                    "id": "pbr.plaster_brick_pattern"
                },
                "belt": {
                    "enabled": true,
                    "height": 0.18,
                    "extrusion": 0,
                    "material": {
                        "kind": "color",
                        "id": "offwhite"
                    }
                },
                "windows": {
                    "enabled": true,
                    "typeId": "window.style.dark",
                    "params": {},
                    "width": 2.1,
                    "height": 2.4,
                    "sillHeight": 0.6,
                    "spacing": 1.1,
                    "spaceColumns": {
                        "enabled": true,
                        "every": 4,
                        "width": 1.6,
                        "material": {
                            "kind": "color",
                            "id": "offwhite"
                        },
                        "extrude": true,
                        "extrudeDistance": 0.96
                    }
                }
            },
            {
                "id": "roof_42",
                "type": "roof",
                "ring": {
                    "enabled": true,
                    "innerRadius": 4.55,
                    "outerRadius": 1.5,
                    "height": 2,
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
    floors: 10,
    floorHeight: 5,
    style: "default",
    windows: Object.freeze({
        width: 2.7,
        gap: 0,
        height: 5.6,
        y: 0
    }),
});

export default GOV_CENTER_BUILDING_CONFIG;
