// src/graphics/content3d/buildings/configs/MainStreetBlock.js
// City building config: Main Street Block — whitewashed-brick mixed-use block with storefronts.
export const MAIN_STREET_BLOCK_BUILDING_CONFIG = Object.freeze({
    id: "mainstreet_block",
    name: "Main Street Block",
    layers: Object.freeze(
        [
            {
                "id": "floor_401",
                "type": "floor",
                "floors": 1,
                "floorHeight": 4.2,
                "planOffset": 0,
                "interior": {
                    "enabled": true
                },
                "style": "default",
                "material": {
                    "kind": "texture",
                    "id": "pbr.whitewashed_brick"
                },
                "wallBase": {
                    "roughness": 0.85,
                    "normalStrength": 0.9,
                    "tintHueDeg": 0,
                    "tintSaturation": 0,
                    "tintValue": 1,
                    "tintIntensity": 1,
                    "tintBrightness": 1,
                    "tintHex": 16777215
                },
                "tiling": {
                    "enabled": true,
                    "tileMeters": 2,
                    "tileMetersU": 2,
                    "tileMetersV": 2,
                    "uvEnabled": true,
                    "offsetU": 0,
                    "offsetV": 0,
                    "rotationDegrees": 0
                },
                "materialVariation": {
                    "enabled": true,
                    "seedOffset": 31,
                    "root": "wall",
                    "space": "world",
                    "worldSpaceScale": 0.16,
                    "objectSpaceScale": 0.16,
                    "globalIntensity": 1,
                    "aoAmount": 0.55,
                    "normalMap": {
                        "flipX": false,
                        "flipY": false,
                        "flipZ": false
                    },
                    "macroLayers": [
                        {
                            "enabled": true,
                            "intensity": 0.6,
                            "value": 0.22,
                            "scale": 7
                        },
                        {
                            "enabled": false
                        },
                        {
                            "enabled": true,
                            "value": -0.18,
                            "intensity": 0.5,
                            "scale": 1.4,
                            "coverage": 0.45,
                            "hueDegrees": -2,
                            "saturation": 0.02
                        },
                        {
                            "enabled": false
                        }
                    ],
                    "streaks": {
                        "enabled": false,
                        "strength": 1,
                        "value": -0.5,
                        "scale": 7
                    },
                    "exposure": {
                        "enabled": false
                    },
                    "wearTop": {
                        "enabled": true,
                        "value": -0.25,
                        "intensity": 0.3
                    },
                    "wearBottom": {
                        "enabled": true,
                        "intensity": 0.3,
                        "hueDegrees": -40
                    },
                    "wearSide": {
                        "enabled": true,
                        "intensity": 0.9,
                        "value": -0.5,
                        "width": 0.95,
                        "scale": 5.8,
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
                    "enabled": false,
                    "typeId": "window.style.default",
                    "params": {},
                    "width": 2.2,
                    "height": 1.4,
                    "sillHeight": 1,
                    "spacing": 1.6,
                    "cornerEps": 0.01,
                    "offset": 0.01,
                    "fakeDepth": {
                        "enabled": false,
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
                },
                "faceLinking": {
                    "links": {
                        "C": "B",
                        "D": "B"
                    }
                }
            },
            {
                "id": "floor_402",
                "type": "floor",
                "floors": 1,
                "floorHeight": 0.35,
                "planOffset": 0,
                "interior": {
                    "enabled": false
                },
                "style": "default",
                "material": {
                    "kind": "texture",
                    "id": "pbr.rough_concrete"
                },
                "wallBase": {
                    "roughness": 0.85,
                    "normalStrength": 0.9,
                    "tintHueDeg": 0,
                    "tintSaturation": 0,
                    "tintValue": 1,
                    "tintIntensity": 1,
                    "tintBrightness": 1,
                    "tintHex": 16777215
                },
                "tiling": {
                    "enabled": true,
                    "tileMeters": 2,
                    "tileMetersU": 2,
                    "tileMetersV": 2,
                    "uvEnabled": true,
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
                    "enabled": false,
                    "typeId": "window.style.default",
                    "params": {},
                    "width": 2.2,
                    "height": 1.4,
                    "sillHeight": 1,
                    "spacing": 1.6,
                    "cornerEps": 0.01,
                    "offset": 0.01,
                    "fakeDepth": {
                        "enabled": false,
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
                },
                "faceLinking": {
                    "links": {
                        "B": "A",
                        "C": "A",
                        "D": "A"
                    }
                }
            },
            {
                "id": "floor_403",
                "type": "floor",
                "floors": 3,
                "floorHeight": 3,
                "planOffset": 0,
                "interior": {
                    "enabled": true
                },
                "style": "default",
                "material": {
                    "kind": "texture",
                    "id": "pbr.whitewashed_brick"
                },
                "wallBase": {
                    "roughness": 0.85,
                    "normalStrength": 0.9,
                    "tintHueDeg": 0,
                    "tintSaturation": 0,
                    "tintValue": 1,
                    "tintIntensity": 1,
                    "tintBrightness": 1,
                    "tintHex": 16777215
                },
                "tiling": {
                    "enabled": true,
                    "tileMeters": 2,
                    "tileMetersU": 2,
                    "tileMetersV": 2,
                    "uvEnabled": true,
                    "offsetU": 0,
                    "offsetV": 0,
                    "rotationDegrees": 0
                },
                "materialVariation": {
                    "enabled": true,
                    "seedOffset": 32,
                    "root": "wall",
                    "space": "world",
                    "worldSpaceScale": 0.16,
                    "objectSpaceScale": 0.16,
                    "globalIntensity": 1,
                    "aoAmount": 0.5,
                    "normalMap": {
                        "flipX": false,
                        "flipY": false,
                        "flipZ": false
                    },
                    "macroLayers": [
                        {
                            "enabled": true,
                            "intensity": 0.6,
                            "value": 0.2,
                            "scale": 7.2
                        },
                        {
                            "enabled": false
                        },
                        {
                            "enabled": true,
                            "value": -0.16,
                            "intensity": 0.45,
                            "scale": 1.35,
                            "coverage": 0.42,
                            "hueDegrees": -2,
                            "saturation": 0.02
                        },
                        {
                            "enabled": false
                        }
                    ],
                    "streaks": {
                        "enabled": false,
                        "strength": 1,
                        "value": -0.5,
                        "scale": 7
                    },
                    "exposure": {
                        "enabled": false
                    },
                    "wearTop": {
                        "enabled": true,
                        "value": -0.3,
                        "intensity": 0.35
                    },
                    "wearBottom": {
                        "enabled": true,
                        "intensity": 0.1,
                        "hueDegrees": -35
                    },
                    "wearSide": {
                        "enabled": true,
                        "intensity": 0.9,
                        "value": -0.5,
                        "width": 0.95,
                        "scale": 5.8,
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
                    "enabled": false,
                    "typeId": "window.style.default",
                    "params": {},
                    "width": 2.2,
                    "height": 1.4,
                    "sillHeight": 1,
                    "spacing": 1.6,
                    "cornerEps": 0.01,
                    "offset": 0.01,
                    "fakeDepth": {
                        "enabled": false,
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
                },
                "faceLinking": {
                    "links": {
                        "B": "A",
                        "C": "A",
                        "D": "A"
                    }
                }
            },
            {
                "id": "floor_404",
                "type": "floor",
                "floors": 1,
                "floorHeight": 0.5,
                "planOffset": 0,
                "interior": {
                    "enabled": false
                },
                "style": "default",
                "material": {
                    "kind": "texture",
                    "id": "pbr.rough_concrete"
                },
                "wallBase": {
                    "roughness": 0.85,
                    "normalStrength": 0.9,
                    "tintHueDeg": 0,
                    "tintSaturation": 0,
                    "tintValue": 1,
                    "tintIntensity": 1,
                    "tintBrightness": 1,
                    "tintHex": 16777215
                },
                "tiling": {
                    "enabled": true,
                    "tileMeters": 2,
                    "tileMetersU": 2,
                    "tileMetersV": 2,
                    "uvEnabled": true,
                    "offsetU": 0,
                    "offsetV": 0.2,
                    "rotationDegrees": 0
                },
                "materialVariation": {
                    "enabled": false,
                    "seedOffset": 0
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
                    "enabled": false,
                    "typeId": "window.style.default",
                    "params": {},
                    "width": 2.2,
                    "height": 1.4,
                    "sillHeight": 1,
                    "spacing": 1.6,
                    "cornerEps": 0.01,
                    "offset": 0.01,
                    "fakeDepth": {
                        "enabled": false,
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
                },
                "faceLinking": {
                    "links": {
                        "B": "A",
                        "C": "A",
                        "D": "A"
                    }
                }
            },
            {
                "id": "roof_405",
                "type": "roof",
                "ring": {
                    "enabled": true,
                    "innerRadius": 0.25,
                    "outerRadius": 0.15,
                    "height": 0.8,
                    "material": {
                        "kind": "texture",
                        "id": "pbr.whitewashed_brick"
                    },
                    "tiling": {
                        "enabled": true,
                        "tileMeters": 2,
                        "tileMetersU": 2,
                        "tileMetersV": 2,
                        "uvEnabled": true,
                        "offsetU": 0,
                        "offsetV": 0,
                        "rotationDegrees": 0
                    }
                },
                "roof": {
                    "type": "Asphalt",
                    "material": {
                        "kind": "texture",
                        "id": "pbr.rough_concrete"
                    },
                    "tiling": {
                        "enabled": true,
                        "tileMeters": 4,
                        "tileMetersU": 4,
                        "tileMetersV": 4,
                        "uvEnabled": true,
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
    footprintLoops: Object.freeze(
        [
            [
                {
                    "x": -22,
                    "z": 8
                },
                {
                    "x": 22,
                    "z": 8
                },
                {
                    "x": 22,
                    "z": -8
                },
                {
                    "x": -22,
                    "z": -8
                }
            ]
        ]
    ),
    floors: 5,
    floorHeight: 3,
    style: "default",
    windows: null,
    facades: Object.freeze(
        {
            "floor_401": {
                "A": {
                    "layout": {
                        "bays": {
                            "items": [
                                {
                                    "id": "bay_1",
                                    "size": {
                                        "mode": "range",
                                        "minMeters": 1,
                                        "maxMeters": null
                                    },
                                    "expandPreference": "prefer_expand",
                                    "wallMaterialOverride": null
                                },
                                {
                                    "id": "bay_2",
                                    "size": {
                                        "mode": "fixed",
                                        "widthMeters": 2.2
                                    },
                                    "expandPreference": "prefer_expand",
                                    "wallMaterialOverride": null,
                                    "depth": {
                                        "left": -0.35,
                                        "right": -0.35
                                    },
                                    "window": {
                                        "enabled": true,
                                        "defId": "door_black_tall",
                                        "assetType": "door",
                                        "size": {
                                            "widthMeters": 2,
                                            "heightMeters": 2.7
                                        },
                                        "heightMode": "fixed",
                                        "verticalOffsetMeters": null,
                                        "width": {
                                            "minMeters": 2,
                                            "maxMeters": null
                                        },
                                        "padding": {
                                            "leftMeters": 0.1,
                                            "rightMeters": 0.1
                                        },
                                        "repeat": {
                                            "count": 1
                                        },
                                        "muntins": {
                                            "bottomEnabled": false,
                                            "topEnabled": true
                                        },
                                        "visual": {
                                            "disableShades": true,
                                            "interior": "shop"
                                        },
                                        "top": {
                                            "enabled": true,
                                            "assetType": "door",
                                            "heightMode": "full",
                                            "heightMeters": 2.7,
                                            "verticalGapMeters": 0,
                                            "frameWidthMeters": null
                                        },
                                        "garageFacade": {
                                            "state": "closed",
                                            "closedMaterialId": "pbr.corrugated_iron_02",
                                            "rotationDegrees": 0
                                        },
                                        "wall": {
                                            "cutWidthLerp": 0,
                                            "cutHeightLerp": 0
                                        }
                                    }
                                },
                                {
                                    "id": "bay_3",
                                    "size": {
                                        "mode": "range",
                                        "minMeters": 1,
                                        "maxMeters": null
                                    },
                                    "expandPreference": "prefer_expand",
                                    "wallMaterialOverride": null
                                },
                                {
                                    "id": "bay_4",
                                    "size": {
                                        "mode": "fixed",
                                        "widthMeters": 3.6
                                    },
                                    "expandPreference": "prefer_expand",
                                    "wallMaterialOverride": null,
                                    "depth": {
                                        "left": -0.25,
                                        "right": -0.25
                                    },
                                    "window": {
                                        "enabled": true,
                                        "defId": "window_street_black_with_cover",
                                        "assetType": "window",
                                        "size": {
                                            "widthMeters": 1.7,
                                            "heightMeters": 2.6
                                        },
                                        "heightMode": "fixed",
                                        "verticalOffsetMeters": null,
                                        "width": {
                                            "minMeters": 1.7,
                                            "maxMeters": null
                                        },
                                        "padding": {
                                            "leftMeters": 0,
                                            "rightMeters": 0
                                        },
                                        "repeat": {
                                            "count": 2
                                        },
                                        "muntins": {
                                            "bottomEnabled": true,
                                            "topEnabled": true
                                        },
                                        "visual": {
                                            "disableShades": true,
                                            "interior": "shop"
                                        },
                                        "top": {
                                            "enabled": true,
                                            "assetType": "window",
                                            "heightMode": "full",
                                            "heightMeters": 2.6,
                                            "verticalGapMeters": 0,
                                            "frameWidthMeters": null
                                        },
                                        "garageFacade": {
                                            "state": "closed",
                                            "closedMaterialId": "pbr.corrugated_iron_02",
                                            "rotationDegrees": 0
                                        },
                                        "wall": {
                                            "cutWidthLerp": 0,
                                            "cutHeightLerp": 0
                                        }
                                    }
                                },
                                {
                                    "id": "bay_5",
                                    "size": {
                                        "mode": "range",
                                        "minMeters": 1,
                                        "maxMeters": null
                                    },
                                    "expandPreference": "prefer_expand",
                                    "wallMaterialOverride": null
                                }
                            ],
                            "nextBayIndex": 6
                        },
                        "groups": {
                            "items": [
                                {
                                    "id": "group_1",
                                    "bayIds": [
                                        "bay_3",
                                        "bay_4"
                                    ],
                                    "repeat": {
                                        "minRepeats": 1,
                                        "maxRepeats": "auto"
                                    }
                                }
                            ],
                            "nextGroupIndex": 2
                        }
                    }
                },
                "B": {
                    "layout": {
                        "bays": {
                            "items": [
                                {
                                    "id": "bay_1",
                                    "size": {
                                        "mode": "range",
                                        "minMeters": 1.2,
                                        "maxMeters": null
                                    },
                                    "expandPreference": "prefer_expand",
                                    "wallMaterialOverride": null
                                },
                                {
                                    "id": "bay_2",
                                    "size": {
                                        "mode": "fixed",
                                        "widthMeters": 1.9
                                    },
                                    "expandPreference": "prefer_expand",
                                    "wallMaterialOverride": null,
                                    "depth": {
                                        "left": -0.25,
                                        "right": -0.25
                                    },
                                    "window": {
                                        "enabled": true,
                                        "defId": "window_street_black_with_cover",
                                        "assetType": "window",
                                        "size": {
                                            "widthMeters": 1.7,
                                            "heightMeters": 2.6
                                        },
                                        "heightMode": "fixed",
                                        "verticalOffsetMeters": null,
                                        "width": {
                                            "minMeters": 1.7,
                                            "maxMeters": null
                                        },
                                        "padding": {
                                            "leftMeters": 0,
                                            "rightMeters": 0
                                        },
                                        "repeat": {
                                            "count": 1
                                        },
                                        "muntins": {
                                            "bottomEnabled": true,
                                            "topEnabled": true
                                        },
                                        "visual": {
                                            "disableShades": true,
                                            "interior": "shop"
                                        },
                                        "top": {
                                            "enabled": true,
                                            "assetType": "window",
                                            "heightMode": "full",
                                            "heightMeters": 2.6,
                                            "verticalGapMeters": 0,
                                            "frameWidthMeters": null
                                        },
                                        "garageFacade": {
                                            "state": "closed",
                                            "closedMaterialId": "pbr.corrugated_iron_02",
                                            "rotationDegrees": 0
                                        },
                                        "wall": {
                                            "cutWidthLerp": 0,
                                            "cutHeightLerp": 0
                                        }
                                    }
                                },
                                {
                                    "id": "bay_3",
                                    "size": {
                                        "mode": "range",
                                        "minMeters": 1,
                                        "maxMeters": null
                                    },
                                    "expandPreference": "prefer_expand",
                                    "wallMaterialOverride": null
                                },
                                {
                                    "id": "bay_4",
                                    "size": {
                                        "mode": "fixed",
                                        "widthMeters": 1.9
                                    },
                                    "expandPreference": "prefer_expand",
                                    "wallMaterialOverride": null,
                                    "depth": {
                                        "left": -0.25,
                                        "right": -0.25
                                    },
                                    "window": {
                                        "enabled": true,
                                        "defId": "window_street_black_with_cover",
                                        "assetType": "window",
                                        "size": {
                                            "widthMeters": 1.7,
                                            "heightMeters": 2.6
                                        },
                                        "heightMode": "fixed",
                                        "verticalOffsetMeters": null,
                                        "width": {
                                            "minMeters": 1.7,
                                            "maxMeters": null
                                        },
                                        "padding": {
                                            "leftMeters": 0,
                                            "rightMeters": 0
                                        },
                                        "repeat": {
                                            "count": 1
                                        },
                                        "muntins": {
                                            "bottomEnabled": true,
                                            "topEnabled": true
                                        },
                                        "visual": {
                                            "disableShades": true,
                                            "interior": "shop"
                                        },
                                        "top": {
                                            "enabled": true,
                                            "assetType": "window",
                                            "heightMode": "full",
                                            "heightMeters": 2.6,
                                            "verticalGapMeters": 0,
                                            "frameWidthMeters": null
                                        },
                                        "garageFacade": {
                                            "state": "closed",
                                            "closedMaterialId": "pbr.corrugated_iron_02",
                                            "rotationDegrees": 0
                                        },
                                        "wall": {
                                            "cutWidthLerp": 0,
                                            "cutHeightLerp": 0
                                        }
                                    }
                                },
                                {
                                    "id": "bay_5",
                                    "size": {
                                        "mode": "range",
                                        "minMeters": 1.2,
                                        "maxMeters": null
                                    },
                                    "expandPreference": "prefer_expand",
                                    "wallMaterialOverride": null
                                }
                            ],
                            "nextBayIndex": 6
                        },
                        "groups": {
                            "items": [
                                {
                                    "id": "group_1",
                                    "bayIds": [
                                        "bay_3",
                                        "bay_4"
                                    ],
                                    "repeat": {
                                        "minRepeats": 1,
                                        "maxRepeats": "auto"
                                    }
                                }
                            ],
                            "nextGroupIndex": 2
                        }
                    }
                }
            },
            "floor_402": {
                "A": {
                    "layout": {
                        "bays": {
                            "items": [
                                {
                                    "id": "bay_1",
                                    "size": {
                                        "mode": "range",
                                        "minMeters": 1,
                                        "maxMeters": null
                                    },
                                    "expandPreference": "prefer_expand",
                                    "wallMaterialOverride": null,
                                    "depth": {
                                        "left": 0.08,
                                        "right": 0.08
                                    }
                                }
                            ],
                            "nextBayIndex": 2
                        }
                    }
                }
            },
            "floor_403": {
                "A": {
                    "layout": {
                        "bays": {
                            "items": [
                                {
                                    "id": "bay_1",
                                    "size": {
                                        "mode": "range",
                                        "minMeters": 0.8,
                                        "maxMeters": null
                                    },
                                    "expandPreference": "prefer_expand",
                                    "wallMaterialOverride": null
                                },
                                {
                                    "id": "bay_2",
                                    "size": {
                                        "mode": "fixed",
                                        "widthMeters": 1.8
                                    },
                                    "expandPreference": "prefer_expand",
                                    "wallMaterialOverride": null,
                                    "window": {
                                        "enabled": true,
                                        "defId": "window_white_sash_2x2",
                                        "assetType": "window",
                                        "size": {
                                            "widthMeters": 1.5,
                                            "heightMeters": 1.7
                                        },
                                        "heightMode": "fixed",
                                        "verticalOffsetMeters": 0.85,
                                        "width": {
                                            "minMeters": 1.5,
                                            "maxMeters": null
                                        },
                                        "padding": {
                                            "leftMeters": 0,
                                            "rightMeters": 0
                                        },
                                        "repeat": {
                                            "count": 1
                                        },
                                        "muntins": {
                                            "bottomEnabled": true,
                                            "topEnabled": true
                                        },
                                        "visual": {
                                            "disableShades": false,
                                            "interior": "res"
                                        },
                                        "top": {
                                            "enabled": false,
                                            "assetType": "window",
                                            "heightMode": "fixed",
                                            "heightMeters": 1.7,
                                            "verticalGapMeters": 0.1,
                                            "frameWidthMeters": null
                                        },
                                        "garageFacade": null,
                                        "wall": {
                                            "cutWidthLerp": 0,
                                            "cutHeightLerp": 0
                                        }
                                    }
                                },
                                {
                                    "id": "bay_3",
                                    "size": {
                                        "mode": "range",
                                        "minMeters": 0.9,
                                        "maxMeters": null
                                    },
                                    "expandPreference": "prefer_expand",
                                    "wallMaterialOverride": null
                                },
                                {
                                    "id": "bay_4",
                                    "size": {
                                        "mode": "fixed",
                                        "widthMeters": 1.8
                                    },
                                    "expandPreference": "prefer_expand",
                                    "wallMaterialOverride": null,
                                    "window": {
                                        "enabled": true,
                                        "defId": "window_white_sash_2x2",
                                        "assetType": "window",
                                        "size": {
                                            "widthMeters": 1.5,
                                            "heightMeters": 1.7
                                        },
                                        "heightMode": "fixed",
                                        "verticalOffsetMeters": 0.85,
                                        "width": {
                                            "minMeters": 1.5,
                                            "maxMeters": null
                                        },
                                        "padding": {
                                            "leftMeters": 0,
                                            "rightMeters": 0
                                        },
                                        "repeat": {
                                            "count": 1
                                        },
                                        "muntins": {
                                            "bottomEnabled": true,
                                            "topEnabled": true
                                        },
                                        "visual": {
                                            "disableShades": false,
                                            "interior": "res"
                                        },
                                        "top": {
                                            "enabled": false,
                                            "assetType": "window",
                                            "heightMode": "fixed",
                                            "heightMeters": 1.7,
                                            "verticalGapMeters": 0.1,
                                            "frameWidthMeters": null
                                        },
                                        "garageFacade": null,
                                        "wall": {
                                            "cutWidthLerp": 0,
                                            "cutHeightLerp": 0
                                        }
                                    }
                                },
                                {
                                    "id": "bay_5",
                                    "size": {
                                        "mode": "range",
                                        "minMeters": 0.9,
                                        "maxMeters": null
                                    },
                                    "expandPreference": "prefer_expand",
                                    "wallMaterialOverride": null
                                },
                                {
                                    "id": "bay_6",
                                    "size": {
                                        "mode": "fixed",
                                        "widthMeters": 1
                                    },
                                    "expandPreference": "prefer_expand",
                                    "wallMaterialOverride": null,
                                    "window": {
                                        "enabled": true,
                                        "defId": "window_white_bathroom_narrow",
                                        "assetType": "window",
                                        "size": {
                                            "widthMeters": 0.7,
                                            "heightMeters": 1.1
                                        },
                                        "heightMode": "fixed",
                                        "verticalOffsetMeters": 1.3,
                                        "width": {
                                            "minMeters": 0.7,
                                            "maxMeters": null
                                        },
                                        "padding": {
                                            "leftMeters": 0,
                                            "rightMeters": 0
                                        },
                                        "repeat": {
                                            "count": 1
                                        },
                                        "muntins": {
                                            "bottomEnabled": true,
                                            "topEnabled": true
                                        },
                                        "visual": {
                                            "disableShades": true,
                                            "interior": "none"
                                        },
                                        "top": {
                                            "enabled": false,
                                            "assetType": "window",
                                            "heightMode": "fixed",
                                            "heightMeters": 1.1,
                                            "verticalGapMeters": 0.1,
                                            "frameWidthMeters": null
                                        },
                                        "garageFacade": null,
                                        "wall": {
                                            "cutWidthLerp": 0,
                                            "cutHeightLerp": 0
                                        }
                                    }
                                },
                                {
                                    "id": "bay_7",
                                    "size": {
                                        "mode": "range",
                                        "minMeters": 0.8,
                                        "maxMeters": null
                                    },
                                    "expandPreference": "prefer_expand",
                                    "wallMaterialOverride": null
                                }
                            ],
                            "nextBayIndex": 8
                        },
                        "groups": {
                            "items": [
                                {
                                    "id": "group_1",
                                    "bayIds": [
                                        "bay_3",
                                        "bay_4"
                                    ],
                                    "repeat": {
                                        "minRepeats": 1,
                                        "maxRepeats": "auto"
                                    }
                                }
                            ],
                            "nextGroupIndex": 2
                        }
                    }
                }
            },
            "floor_404": {
                "A": {
                    "layout": {
                        "bays": {
                            "items": [
                                {
                                    "id": "bay_1",
                                    "size": {
                                        "mode": "range",
                                        "minMeters": 1,
                                        "maxMeters": null
                                    },
                                    "expandPreference": "prefer_expand",
                                    "wallMaterialOverride": null,
                                    "depth": {
                                        "left": 0.12,
                                        "right": 0.12
                                    }
                                }
                            ],
                            "nextBayIndex": 2
                        }
                    }
                }
            }
        }
    ),
    // AI 490: Bradbury-style fire escape down the face-A sash column, plus a
    // light AC scatter over the shaft windows.
    attachments: Object.freeze({
        items: [
            {
                id: 'attachment_1',
                type: 'fire_escape',
                target: { layerId: 'floor_403', faceId: 'A', bayId: 'bay_2' },
                floors: { start: 1, end: 0 },
                platform: { widthMeters: 2.6, depthMeters: 0.95 }
            },
            {
                id: 'attachment_2',
                type: 'ac_unit',
                probability: 0.22,
                seedOffset: 5,
                eligibility: { layerIds: ['floor_403'], assetTypes: ['window'], minFloor: 1 }
            }
        ]
    }),
    wallDecorations: Object.freeze(
        {
            "sets": [
                {
                    "id": "set_1",
                    "target": {
                        "layerId": "floor_401",
                        "bayRefs": [
                            "A:bay_1",
                            "A:bay_3",
                            "A:bay_5",
                            "B:bay_1",
                            "B:bay_3",
                            "B:bay_5",
                            "C:bay_1",
                            "C:bay_3",
                            "C:bay_5",
                            "D:bay_1",
                            "D:bay_3",
                            "D:bay_5"
                        ],
                        "allBays": false
                    },
                    "floorInterval": {
                        "every": 1,
                        "start": 1,
                        "end": null
                    },
                    "decorations": [
                        {
                            "id": "decoration_1",
                            "span": {
                                "start": 0,
                                "end": 1
                            },
                            "state": {
                                "version": 1,
                                "decoratorId": "simple_skirt",
                                "whereToApply": "entire_facade",
                                "mode": "face",
                                "position": "bottom",
                                "configuration": {
                                    "heightMeters": 0.4,
                                    "offsetScale": 1,
                                    "nearEdgeOffsetMeters": 0.1
                                },
                                "materialSelection": {
                                    "kind": "match_wall",
                                    "id": "match_wall"
                                },
                                "wallBase": {
                                    "roughness": 0.85,
                                    "normalStrength": 0.9,
                                    "tintHueDeg": 0,
                                    "tintSaturation": 0,
                                    "tintValue": 1,
                                    "tintIntensity": 1,
                                    "tintBrightness": 1,
                                    "tintHex": 16777215
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
                            "autoCorner": {
                                "rule": "outmost_depth",
                                "resolvedBayRefs": [
                                    "A:bay_1",
                                    "A:bay_3",
                                    "A:bay_5",
                                    "B:bay_1",
                                    "B:bay_3",
                                    "B:bay_5",
                                    "C:bay_1",
                                    "C:bay_3",
                                    "C:bay_5",
                                    "D:bay_1",
                                    "D:bay_3",
                                    "D:bay_5"
                                ]
                            }
                        },
                        {
                            "id": "decoration_2",
                            "span": {
                                "start": 0,
                                "end": 1
                            },
                            "state": {
                                "version": 1,
                                "decoratorId": "angled_support_profile",
                                "whereToApply": "entire_facade",
                                "mode": "face",
                                "position": "top",
                                "configuration": {
                                    "offset": 0.04,
                                    "height": 0.1,
                                    "topCapAngleDeg": 45,
                                    "bottomCapAngleDeg": 45
                                },
                                "materialSelection": {
                                    "kind": "match_wall",
                                    "id": "match_wall"
                                },
                                "wallBase": {
                                    "roughness": 0.85,
                                    "normalStrength": 0.9,
                                    "tintHueDeg": 0,
                                    "tintSaturation": 0,
                                    "tintValue": 1,
                                    "tintIntensity": 1,
                                    "tintBrightness": 1,
                                    "tintHex": 16777215
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
                            "autoCorner": {
                                "rule": "outmost_depth",
                                "resolvedBayRefs": [
                                    "A:bay_1",
                                    "A:bay_3",
                                    "A:bay_5",
                                    "B:bay_1",
                                    "B:bay_3",
                                    "B:bay_5",
                                    "C:bay_1",
                                    "C:bay_3",
                                    "C:bay_5",
                                    "D:bay_1",
                                    "D:bay_3",
                                    "D:bay_5"
                                ]
                            }
                        }
                    ],
                    "nextDecorationIndex": 3
                },
                {
                    "id": "set_2",
                    "target": {
                        "layerId": "floor_401",
                        "bayRefs": [
                            "A:bay_2",
                            "A:bay_4"
                        ],
                        "allBays": false
                    },
                    "floorInterval": {
                        "every": 1,
                        "start": 1,
                        "end": null
                    },
                    "decorations": [
                        {
                            "id": "decoration_1",
                            "span": {
                                "start": 0,
                                "end": 1
                            },
                            "state": {
                                "version": 1,
                                "decoratorId": "awning",
                                "whereToApply": "entire_facade",
                                "mode": "face",
                                "position": "near_top",
                                "configuration": {
                                    "projectionMeters": 0.8,
                                    "frontHeightMeters": 0.3,
                                    "slopeDegrees": 25,
                                    "rodRadiusMeters": 0.015,
                                    "rodInsetMeters": 0.08,
                                    "rodMaterialId": "metal_dark",
                                    "nearEdgeOffsetMeters": 0.1
                                },
                                "materialSelection": {
                                    "kind": "match_wall",
                                    "id": "match_wall"
                                },
                                "wallBase": {
                                    "roughness": 0.85,
                                    "normalStrength": 0.9,
                                    "tintHueDeg": 0,
                                    "tintSaturation": 0,
                                    "tintValue": 1,
                                    "tintIntensity": 1,
                                    "tintBrightness": 1,
                                    "tintHex": 16777215
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
                            "autoCorner": {
                                "rule": "outmost_depth",
                                "resolvedBayRefs": [
                                    "A:bay_2",
                                    "A:bay_4"
                                ]
                            }
                        }
                    ],
                    "nextDecorationIndex": 2
                }
            ],
            "nextSetIndex": 3
        }
    ),
});

export default MAIN_STREET_BLOCK_BUILDING_CONFIG;
