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
                    "enabled": false,
                    "height": 0.31,
                    "extrusion": 1.34,
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
                    "typeId": "window.style.dark",
                    "params": {},
                    "width": 2.7,
                    "height": 5.6,
                    "sillHeight": 0.1,
                    "spacing": 0,
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
                            "strength": 1.44
                        },
                        "roughness": {
                            "enabled": true,
                            "contrast": 0.9
                        },
                        "border": {
                            "enabled": true,
                            "thickness": 0.018,
                            "strength": 0.65
                        }
                    },
                    "windowVisuals": {
                        "reflective": {
                            "enabled": true,
                            "opacity": 0.82,
                            "layerOffset": 0,
                            "glass": {
                                "colorHex": 16777215,
                                "metalness": 1,
                                "roughness": 0.1,
                                "transmission": 0,
                                "ior": 2.2,
                                "envMapIntensity": 0.22
                            }
                        }
                    },
                    "spaceColumns": {
                        "enabled": false,
                        "every": 4,
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
                        "kind": "color",
                        "id": "default"
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
                "id": "roof_40",
                "type": "roof",
                "ring": {
                    "enabled": true,
                    "innerRadius": 2.4,
                    "outerRadius": 1.5,
                    "height": 2,
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
                    "extrusion": 0.1,
                    "material": {
                        "kind": "texture",
                        "id": "pbr.plastered_wall_02"
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
                    "typeId": "window.style.dark",
                    "params": {},
                    "width": 2.1,
                    "height": 2.4,
                    "sillHeight": 0.4,
                    "spacing": 1.1,
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
                            "opacity": 0.52,
                            "layerOffset": 0.007,
                            "glass": {
                                "colorHex": 16777215,
                                "metalness": 1,
                                "roughness": 0.14,
                                "transmission": 0,
                                "ior": 1.91,
                                "envMapIntensity": 0.64
                            }
                        }
                    },
                    "spaceColumns": {
                        "enabled": true,
                        "every": 4,
                        "width": 1.6,
                        "material": {
                            "kind": "texture",
                            "id": "stone_1"
                        },
                        "tiling": {
                            "enabled": true,
                            "tileMeters": 2,
                            "tileMetersU": 0.25,
                            "tileMetersV": 0.99,
                            "uvEnabled": false,
                            "offsetU": 0.22,
                            "offsetV": 0.81,
                            "rotationDegrees": 0
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
                        "kind": "color",
                        "id": "default"
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
    floors: 10,
    floorHeight: 5,
    style: "default",
    windows: Object.freeze({
        width: 2.7,
        gap: 0,
        height: 5.6,
        y: 0.1
    }),
});

export default GOV_CENTER_BUILDING_CONFIG;
