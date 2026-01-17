// src/graphics/content3d/buildings/configs/StoneSetbackTower.js
// City building config: Stone setback tower.
export const STONE_SETBACK_TOWER_BUILDING_CONFIG = Object.freeze({
    id: "stone_setback_tower",
    name: "Stone setback tower",
    layers: Object.freeze(
        [
            {
                "id": "floor_34",
                "type": "floor",
                "floors": 8,
                "floorHeight": 4.2,
                "planOffset": 0,
                "style": "pbr.patterned_concrete_wall",
                "material": {
                    "kind": "texture",
                    "id": "pbr.patterned_concrete_wall"
                },
                "belt": {
                    "enabled": true,
                    "height": 0.18,
                    "extrusion": 0.48,
                    "material": {
                        "kind": "color",
                        "id": "offwhite"
                    }
                },
                "windows": {
                    "enabled": true,
                    "typeId": "window.style.light_blue",
                    "params": {
                        "frameWidth": 0.06,
                        "frameColor": 14673906,
                        "glassTop": 1063258,
                        "glassBottom": 399916
                    },
                    "width": 2.5,
                    "height": 3,
                    "sillHeight": 1,
                    "spacing": 1.8,
                    "cornerEps": 0.01,
                    "offset": 0.01,
                    "spaceColumns": {
                        "enabled": true,
                        "every": 2,
                        "width": 0.9,
                        "material": {
                            "kind": "texture",
                            "id": "pbr.patterned_concrete_wall"
                        },
                        "extrude": true,
                        "extrudeDistance": 0.47
                    }
                }
            },
            {
                "id": "roof_35",
                "type": "roof",
                "ring": {
                    "enabled": true,
                    "innerRadius": 1.5,
                    "outerRadius": 0.4,
                    "height": 2,
                    "material": {
                        "kind": "color",
                        "id": "offwhite"
                    }
                },
                "roof": {
                    "type": "Asphalt",
                    "material": {
                        "kind": "texture",
                        "id": "cement"
                    },
                    "color": "default"
                }
            },
            {
                "id": "floor_42",
                "type": "floor",
                "floors": 1,
                "floorHeight": 4.2,
                "planOffset": 8,
                "style": "pbr.patterned_concrete_wall",
                "material": {
                    "kind": "texture",
                    "id": "pbr.patterned_concrete_wall"
                },
                "belt": {
                    "enabled": true,
                    "height": 0.18,
                    "extrusion": 0.48,
                    "material": {
                        "kind": "color",
                        "id": "offwhite"
                    }
                },
                "windows": {
                    "enabled": true,
                    "typeId": "window.modern.v1",
                    "params": {
                        "frameWidth": 0.06,
                        "frameColor": 14673906,
                        "glassTop": 1063258,
                        "glassBottom": 399916
                    },
                    "width": 2.5,
                    "height": 3,
                    "sillHeight": 1,
                    "spacing": 4.9,
                    "cornerEps": 0.01,
                    "offset": 0.01,
                    "spaceColumns": {
                        "enabled": false,
                        "every": 2,
                        "width": 0.9,
                        "material": {
                            "kind": "color",
                            "id": "offwhite"
                        },
                        "extrude": true,
                        "extrudeDistance": 0.47
                    }
                }
            },
            {
                "id": "roof_43",
                "type": "roof",
                "ring": {
                    "enabled": true,
                    "innerRadius": 1.5,
                    "outerRadius": 0.4,
                    "height": 0.64,
                    "material": {
                        "kind": "texture",
                        "id": "pbr.patterned_concrete_wall"
                    }
                },
                "roof": {
                    "type": "Asphalt",
                    "material": {
                        "kind": "texture",
                        "id": "cement"
                    },
                    "color": "default"
                }
            },
            {
                "id": "roof_44",
                "type": "roof",
                "ring": {
                    "enabled": true,
                    "innerRadius": 3.95,
                    "outerRadius": 2.75,
                    "height": 0.82,
                    "material": {
                        "kind": "color",
                        "id": "offwhite"
                    }
                },
                "roof": {
                    "type": "Asphalt",
                    "material": {
                        "kind": "texture",
                        "id": "cement"
                    },
                    "color": "default"
                }
            }
        ]
    ),
    floors: 9,
    floorHeight: 4.2,
    style: "default",
    windows: Object.freeze({
        width: 2.5,
        gap: 1.8,
        height: 3,
        y: 1
    }),
});

export default STONE_SETBACK_TOWER_BUILDING_CONFIG;
