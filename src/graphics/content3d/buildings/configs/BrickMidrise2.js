// src/graphics/content3d/buildings/configs/BrickMidrise2.js
// City building config: Brick midrise 2.
export const BRICK_MIDRISE_2_BUILDING_CONFIG = Object.freeze({
    id: "brick_midrise_2",
    name: "Brick midrise 2",
    layers: Object.freeze(
        [
            {
                "id": "floor_1",
                "type": "floor",
                "floors": 5,
                "floorHeight": 3,
                "planOffset": 0,
                "style": "pbr.red_brick",
                "material": {
                    "kind": "texture",
                    "id": "pbr.red_brick"
                },
                "wallBase": {
                    "tintHex": 16777215,
                    "roughness": 0.85,
                    "normalStrength": 0.9
                },
                "tiling": {
                    "enabled": false,
                    "tileMeters": 2,
                    "tileMetersU": 2,
                    "tileMetersV": 2,
                    "uvEnabled": false,
                    "offsetU": 0,
                    "offsetV": 0,
                    "rotationDegrees": 0
                },
                "materialVariation": {
                    "enabled": true,
                    "seedOffset": 0,
                    "root": "wall",
                    "space": "world",
                    "worldSpaceScale": 0.16,
                    "objectSpaceScale": 0.16,
                    "globalIntensity": 1,
                    "aoAmount": 0.6,
                    "normalMap": {
                        "flipX": false,
                        "flipY": false,
                        "flipZ": false
                    },
                    "macroLayers": [
                        {
                            "enabled": true,
                            "intensity": 0.84,
                            "value": 0.29,
                            "scale": 7.38
                        },
                        {
                            "enabled": false
                        },
                        {
                            "enabled": true,
                            "value": -0.2,
                            "intensity": 0.58,
                            "scale": 1.31,
                            "coverage": 0.44,
                            "hueDegrees": -1,
                            "saturation": 0.01
                        },
                        {
                            "enabled": false
                        }
                    ],
                    "streaks": {
                        "enabled": false,
                        "strength": 1.38,
                        "value": -0.71,
                        "scale": 7.77
                    },
                    "exposure": {
                        "enabled": false
                    },
                    "wearTop": {
                        "enabled": true,
                        "value": -0.36,
                        "intensity": 0.44
                    },
                    "wearBottom": {
                        "enabled": true,
                        "intensity": 0.04,
                        "hueDegrees": -58
                    },
                    "wearSide": {
                        "enabled": true,
                        "intensity": 1.15,
                        "value": -0.54,
                        "width": 0.97,
                        "scale": 6.01,
                        "normal": 0.6,
                        "roughness": -0.6
                    },
                    "cracksLayer": {
                        "enabled": false
                    },
                    "antiTiling": {
                        "enabled": false
                    },
                    "stairShift": {
                        "enabled": false
                    },
                    "brick": {
                        "perBrick": {
                            "enabled": false,
                            "layout": {
                                "bricksPerTileX": 6,
                                "bricksPerTileY": 3,
                                "mortarWidth": 0.08,
                                "offsetX": 0,
                                "offsetY": 0
                            }
                        },
                        "mortar": {
                            "enabled": false,
                            "layout": {
                                "bricksPerTileX": 6,
                                "bricksPerTileY": 3,
                                "mortarWidth": 0.08,
                                "offsetX": 0,
                                "offsetY": 0
                            }
                        }
                    }
                },
                "belt": {
                    "enabled": false,
                    "height": 0.18,
                    "extrusion": 0,
                    "material": {
                        "kind": "color",
                        "id": "offwhite"
                    },
                    "tiling": {
                        "enabled": false,
                        "tileMeters": 2,
                        "tileMetersU": 2,
                        "tileMetersV": 2,
                        "uvEnabled": false,
                        "offsetU": 0,
                        "offsetV": 0,
                        "rotationDegrees": 0
                    }
                },
                "windows": {
                    "enabled": true,
                    "typeId": "window.style.default",
                    "params": {},
                    "width": 2.2,
                    "height": 1.4,
                    "sillHeight": 1,
                    "spacing": 1.6,
                    "cornerEps": 0.12,
                    "offset": 0.05,
                    "fakeDepth": {
                        "enabled": true,
                        "strength": 0.06,
                        "insetStrength": 0.25
                    },
                    "pbr": {
                        "normal": {
                            "enabled": true,
                            "strength": 0.85
                        },
                        "roughness": {
                            "enabled": true,
                            "contrast": 1
                        },
                        "border": {
                            "enabled": true,
                            "thickness": 0.018,
                            "strength": 0.35
                        }
                    },
                    "windowVisuals": null,
                    "spaceColumns": {
                        "enabled": true,
                        "every": 4,
                        "width": 0.9,
                        "material": {
                            "kind": "texture",
                            "id": "pbr.red_brick"
                        },
                        "tiling": {
                            "enabled": true,
                            "tileMeters": 2,
                            "tileMetersU": 3.5,
                            "tileMetersV": 0.27,
                            "uvEnabled": true,
                            "offsetU": 0.03,
                            "offsetV": -0.01,
                            "rotationDegrees": 0
                        },
                        "extrude": true,
                        "extrudeDistance": 0.12
                    }
                }
            },
            {
                "id": "roof_2",
                "type": "roof",
                "ring": {
                    "enabled": true,
                    "innerRadius": 0,
                    "outerRadius": 0.4,
                    "height": 0.46,
                    "material": {
                        "kind": "texture",
                        "id": "pbr.whitewashed_brick"
                    },
                    "tiling": {
                        "enabled": false,
                        "tileMeters": 2,
                        "tileMetersU": 2,
                        "tileMetersV": 2,
                        "uvEnabled": false,
                        "offsetU": 0,
                        "offsetV": 0,
                        "rotationDegrees": 0
                    }
                },
                "roof": {
                    "type": "Asphalt",
                    "material": {
                        "kind": "texture",
                        "id": "pbr.painted_plaster_wall"
                    },
                    "tiling": {
                        "enabled": false,
                        "tileMeters": 4,
                        "tileMetersU": 4,
                        "tileMetersV": 4,
                        "uvEnabled": false,
                        "offsetU": 0,
                        "offsetV": 0,
                        "rotationDegrees": 0
                    },
                    "materialVariation": {
                        "enabled": false,
                        "seedOffset": 0,
                        "root": "surface",
                        "space": "world",
                        "worldSpaceScale": 0.18,
                        "objectSpaceScale": 0.18,
                        "globalIntensity": 1,
                        "aoAmount": 0.45,
                        "normalMap": {
                            "flipX": false,
                            "flipY": false,
                            "flipZ": false
                        },
                        "macroLayers": [
                            {
                                "enabled": false
                            },
                            {
                                "enabled": false
                            },
                            {
                                "enabled": false
                            },
                            {
                                "enabled": false
                            }
                        ],
                        "streaks": {
                            "enabled": false
                        },
                        "exposure": {
                            "enabled": false
                        },
                        "wearTop": {
                            "enabled": false
                        },
                        "wearBottom": {
                            "enabled": false
                        },
                        "wearSide": {
                            "enabled": false
                        },
                        "cracksLayer": {
                            "enabled": false
                        },
                        "antiTiling": {
                            "enabled": false
                        },
                        "stairShift": {
                            "enabled": false
                        },
                        "brick": {
                            "perBrick": {
                                "enabled": false,
                                "layout": {
                                    "bricksPerTileX": 6,
                                    "bricksPerTileY": 3,
                                    "mortarWidth": 0.08,
                                    "offsetX": 0,
                                    "offsetY": 0
                                }
                            },
                            "mortar": {
                                "enabled": false,
                                "layout": {
                                    "bricksPerTileX": 6,
                                    "bricksPerTileY": 3,
                                    "mortarWidth": 0.08,
                                    "offsetX": 0,
                                    "offsetY": 0
                                }
                            }
                        }
                    },
                    "color": "default"
                }
            }
        ]
    ),
    floors: 5,
    floorHeight: 3,
    style: "default",
    windows: Object.freeze({
        width: 2.2,
        gap: 1.6,
        height: 1.4,
        y: 1
    }),
});

export default BRICK_MIDRISE_2_BUILDING_CONFIG;

