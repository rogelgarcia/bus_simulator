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
                    "enabled": false,
                    "seedOffset": 0
                },
                "belt": {
                    "enabled": true,
                    "height": 0.18,
                    "extrusion": 0.5,
                    "material": {
                        "kind": "texture",
                        "id": "pbr.painted_plaster_wall"
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
                    "windowVisuals": {
                        "reflective": {
                            "enabled": true,
                            "opacity": 0.96,
                            "layerOffset": 0.02,
                            "glass": {
                                "colorHex": 16777215,
                                "metalness": 1,
                                "roughness": 0.19,
                                "transmission": 0,
                                "ior": 1.91,
                                "envMapIntensity": 0.28
                            }
                        }
                    },
                    "spaceColumns": {
                        "enabled": true,
                        "every": 2,
                        "width": 0.9,
                        "material": {
                            "kind": "texture",
                            "id": "pbr.patterned_concrete_wall"
                        },
                        "tiling": {
                            "enabled": true,
                            "tileMeters": 2,
                            "tileMetersU": 11.75,
                            "tileMetersV": 2.79,
                            "uvEnabled": true,
                            "offsetU": -2.54,
                            "offsetV": -1.93,
                            "rotationDegrees": 0
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
                        "kind": "texture",
                        "id": "pbr.plastered_wall_02"
                    },
                    "tiling": {
                        "enabled": true,
                        "tileMeters": 2,
                        "tileMetersU": 4.25,
                        "tileMetersV": 3.33,
                        "uvEnabled": true,
                        "offsetU": -0.85,
                        "offsetV": -0.03,
                        "rotationDegrees": -90
                    }
                },
                "roof": {
                    "type": "Asphalt",
                    "material": {
                        "kind": "texture",
                        "id": "cement"
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
                        "seedOffset": 0
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
                    "enabled": false,
                    "seedOffset": 0
                },
                "belt": {
                    "enabled": true,
                    "height": 0.18,
                    "extrusion": 0.48,
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
                    "windowVisuals": {
                        "reflective": {
                            "enabled": false,
                            "opacity": 1,
                            "layerOffset": 0.02,
                            "glass": {
                                "colorHex": 16777215,
                                "metalness": 0.95,
                                "roughness": 0.07,
                                "transmission": 0.82,
                                "ior": 1.91,
                                "envMapIntensity": 0.33
                            }
                        }
                    },
                    "spaceColumns": {
                        "enabled": false,
                        "every": 2,
                        "width": 0.9,
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
                        "id": "cement"
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
                        "seedOffset": 0
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
                        "id": "cement"
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
                        "seedOffset": 0
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
