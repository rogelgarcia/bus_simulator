// src/graphics/content3d/buildings/configs/StoneLowrise2.js
// City building config: Stone lowrise 2 — new-engine recreation of the legacy stone lowrise.
export const STONE_LOWRISE_2_BUILDING_CONFIG = Object.freeze({
    id: "stone_lowrise_2",
    name: "Stone Lowrise 2",
    layers: Object.freeze(
        [
            {
                "id": "floor_201",
                "type": "floor",
                "floors": 1,
                "floorHeight": 4,
                "planOffset": 0,
                "interior": {
                    "enabled": true
                },
                "style": "default",
                "material": {
                    "kind": "texture",
                    "id": "pbr.seaworn_sandstone_brick"
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
                    "tileMeters": 2.5,
                    "tileMetersU": 2.5,
                    "tileMetersV": 2.5,
                    "uvEnabled": true,
                    "offsetU": 0,
                    "offsetV": 0,
                    "rotationDegrees": 0
                },
                "materialVariation": {
                    "enabled": true,
                    "seedOffset": 11,
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
                            "value": 0.2,
                            "scale": 6.5
                        },
                        {
                            "enabled": false
                        },
                        {
                            "enabled": true,
                            "value": -0.16,
                            "intensity": 0.45,
                            "scale": 1.4,
                            "coverage": 0.42,
                            "hueDegrees": 3,
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
                        "value": -0.2,
                        "intensity": 0.25
                    },
                    "wearBottom": {
                        "enabled": true,
                        "intensity": 0.3,
                        "hueDegrees": -35
                    },
                    "wearSide": {
                        "enabled": true,
                        "intensity": 0.8,
                        "value": -0.45,
                        "width": 0.95,
                        "scale": 5.5,
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
                "id": "floor_202",
                "type": "floor",
                "floors": 1,
                "floorHeight": 0.45,
                "planOffset": 0,
                "interior": {
                    "enabled": false
                },
                "style": "default",
                "material": {
                    "kind": "texture",
                    "id": "pbr.seaworn_sandstone_brick"
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
                    "tileMeters": 2.5,
                    "tileMetersU": 2.5,
                    "tileMetersV": 2.5,
                    "uvEnabled": true,
                    "offsetU": 0,
                    "offsetV": 0.55,
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
                "cornice": {
                    "enabled": true,
                    "profile": "crown_molding",
                    "height": 0.42,
                    "projection": 0.24,
                    "material": {
                        "kind": "match_wall",
                        "id": "match_wall"
                    },
                    "ornament": {
                        "type": "dentils",
                        "width": 0.14,
                        "depth": 0.11,
                        "spacing": 0.15,
                        "height": 0.15,
                        "material": {
                            "kind": "match_wall",
                            "id": "match_wall"
                        }
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
                "id": "floor_203",
                "type": "floor",
                "floors": 3,
                "floorHeight": 3.05,
                "planOffset": 0,
                "interior": {
                    "enabled": true
                },
                "style": "default",
                "material": {
                    "kind": "texture",
                    "id": "pbr.painted_plaster_wall"
                },
                "wallBase": {
                    "roughness": 0.85,
                    "normalStrength": 0.9,
                    "tintHueDeg": 40,
                    "tintSaturation": 0.11,
                    "tintValue": 0.975,
                    "tintIntensity": 1,
                    "tintBrightness": 1,
                    "tintHex": 16314333
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
                    "seedOffset": 3,
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
                            "intensity": 0.5,
                            "value": 0.18,
                            "scale": 6.2
                        },
                        {
                            "enabled": false
                        },
                        {
                            "enabled": true,
                            "value": -0.14,
                            "intensity": 0.4,
                            "scale": 1.5,
                            "coverage": 0.4,
                            "hueDegrees": 2,
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
                        "value": -0.28,
                        "intensity": 0.3
                    },
                    "wearBottom": {
                        "enabled": true,
                        "intensity": 0.12,
                        "hueDegrees": -30
                    },
                    "wearSide": {
                        "enabled": true,
                        "intensity": 0.7,
                        "value": -0.4,
                        "width": 0.9,
                        "scale": 5.2,
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
                "id": "floor_204",
                "type": "floor",
                "floors": 1,
                "floorHeight": 0.55,
                "planOffset": 0,
                "interior": {
                    "enabled": false
                },
                "style": "default",
                "material": {
                    "kind": "texture",
                    "id": "pbr.seaworn_sandstone_brick"
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
                    "tileMeters": 2.5,
                    "tileMetersU": 2.5,
                    "tileMetersV": 2.5,
                    "uvEnabled": true,
                    "offsetU": 0,
                    "offsetV": 0.3,
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
                "id": "roof_205",
                "type": "roof",
                "ring": {
                    "enabled": true,
                    "innerRadius": 0.3,
                    "outerRadius": 0.18,
                    "height": 0.85,
                    "material": {
                        "kind": "texture",
                        "id": "pbr.seaworn_sandstone_brick"
                    },
                    "tiling": {
                        "enabled": true,
                        "tileMeters": 2.5,
                        "tileMetersU": 2.5,
                        "tileMetersV": 2.5,
                        "uvEnabled": true,
                        "offsetU": 0,
                        "offsetV": 0,
                        "rotationDegrees": 0
                    }
                },
                "cornice": {
                    "enabled": true,
                    "profile": "stepped",
                    "height": 0.55,
                    "projection": 0.28,
                    "material": {
                        "kind": "match_wall",
                        "id": "match_wall"
                    },
                    "ornament": {
                        "type": "brackets",
                        "width": 0.16,
                        "depth": 0.2,
                        "spacing": 0.5,
                        "height": 0.26,
                        "material": {
                            "kind": "match_wall",
                            "id": "match_wall"
                        }
                    },
                    "parapet": {
                        "coping": {
                            "enabled": true,
                            "height": 0.1,
                            "overhang": 0.06,
                            "material": {
                                "kind": "match_wall",
                                "id": "match_wall"
                            }
                        },
                        "stepped": {
                            "enabled": false,
                            "mode": "corners",
                            "blockWidth": 0.9,
                            "raise": 0.45
                        }
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
                    "x": -9,
                    "z": 7
                },
                {
                    "x": 9,
                    "z": 7
                },
                {
                    "x": 9,
                    "z": -7
                },
                {
                    "x": -9,
                    "z": -7
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
            "floor_201": {
                "A": {
                    "layout": {
                        "bays": {
                            "items": [
                                {
                                    "id": "bay_1",
                                    "size": {
                                        "mode": "range",
                                        "minMeters": 2,
                                        "maxMeters": null
                                    },
                                    "expandPreference": "prefer_expand",
                                    "wallMaterialOverride": null
                                },
                                {
                                    "id": "bay_2",
                                    "size": {
                                        "mode": "fixed",
                                        "widthMeters": 2
                                    },
                                    "expandPreference": "prefer_expand",
                                    "wallMaterialOverride": null,
                                    "depth": {
                                        "left": -0.3,
                                        "right": -0.3
                                    },
                                    "window": {
                                        "enabled": true,
                                        "defId": "door_wood_arch",
                                        "assetType": "door",
                                        "size": {
                                            "widthMeters": 1.6,
                                            "heightMeters": 2.6
                                        },
                                        "heightMode": "fixed",
                                        "verticalOffsetMeters": null,
                                        "width": {
                                            "minMeters": 1.6,
                                            "maxMeters": null
                                        },
                                        "padding": {
                                            "leftMeters": 0.2,
                                            "rightMeters": 0.2
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
                                            "interior": "none"
                                        },
                                        "top": {
                                            "enabled": false,
                                            "assetType": "door",
                                            "heightMode": "fixed",
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
                                        "left": -0.12,
                                        "right": -0.12
                                    },
                                    "window": {
                                        "enabled": true,
                                        "defId": "window_white_sash_2x2",
                                        "assetType": "window",
                                        "size": {
                                            "widthMeters": 1.5,
                                            "heightMeters": 2.2
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
                                            "heightMeters": 2.2,
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
                                        "minMeters": 0.8,
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
                                        "minMeters": 0.9,
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
                                        "left": -0.12,
                                        "right": -0.12
                                    },
                                    "window": {
                                        "enabled": true,
                                        "defId": "window_white_sash_2x2",
                                        "assetType": "window",
                                        "size": {
                                            "widthMeters": 1.5,
                                            "heightMeters": 2.2
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
                                            "heightMeters": 2.2,
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
                                        "left": -0.12,
                                        "right": -0.12
                                    },
                                    "window": {
                                        "enabled": true,
                                        "defId": "window_white_sash_2x2",
                                        "assetType": "window",
                                        "size": {
                                            "widthMeters": 1.5,
                                            "heightMeters": 2.2
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
                                            "heightMeters": 2.2,
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
            "floor_202": {
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
                                        "left": 0.1,
                                        "right": 0.1
                                    }
                                }
                            ],
                            "nextBayIndex": 2
                        }
                    }
                }
            },
            "floor_203": {
                "A": {
                    "layout": {
                        "bays": {
                            "items": [
                                {
                                    "id": "bay_1",
                                    "size": {
                                        "mode": "range",
                                        "minMeters": 0.75,
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
                                    "window": {
                                        "enabled": true,
                                        "defId": "window_white_sash_2x2_stone_surround",
                                        "assetType": "window",
                                        "size": {
                                            "widthMeters": 1.5,
                                            "heightMeters": 1.8
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
                                            "heightMeters": 1.8,
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
                                        "widthMeters": 1.9
                                    },
                                    "expandPreference": "prefer_expand",
                                    "wallMaterialOverride": null,
                                    "window": {
                                        "enabled": true,
                                        "defId": "window_white_sash_2x2_stone_surround",
                                        "assetType": "window",
                                        "size": {
                                            "widthMeters": 1.5,
                                            "heightMeters": 1.8
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
                                            "heightMeters": 1.8,
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
                                        "verticalOffsetMeters": 1.35,
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
                                        "minMeters": 0.75,
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
            "floor_204": {
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
                                        "left": 0.14,
                                        "right": 0.14
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
    wallDecorations: Object.freeze(
        {
            "sets": [
                {
                    "id": "set_1",
                    "target": {
                        "layerId": "floor_201",
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
                                    "heightMeters": 0.45,
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
                                    "offset": 0.05,
                                    "height": 0.12,
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
                        "layerId": "floor_203",
                        "bayRefs": [
                            "A:bay_1",
                            "B:bay_1",
                            "C:bay_1",
                            "D:bay_1"
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
                                "decoratorId": "edge_brick_chain",
                                "whereToApply": "entire_facade",
                                "mode": "face",
                                "position": "bottom",
                                "configuration": {
                                    "edgeTarget": "left",
                                    "startY": 0,
                                    "endY": 3.05,
                                    "brickHeight": 0.32,
                                    "depthScaleMultiplier": 1,
                                    "snapToFit": true
                                },
                                "materialSelection": {
                                    "kind": "texture",
                                    "id": "pbr.seaworn_sandstone_brick"
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
                                    "tileMeters": 2.5,
                                    "tileMetersU": 2.5,
                                    "tileMetersV": 2.5,
                                    "uvEnabled": true,
                                    "offsetU": 0,
                                    "offsetV": 0,
                                    "rotationDegrees": 0
                                }
                            },
                            "autoCorner": {
                                "rule": "outmost_depth",
                                "resolvedBayRefs": [
                                    "A:bay_1",
                                    "B:bay_1",
                                    "C:bay_1",
                                    "D:bay_1"
                                ]
                            }
                        }
                    ],
                    "nextDecorationIndex": 2
                },
                {
                    "id": "set_3",
                    "target": {
                        "layerId": "floor_203",
                        "bayRefs": [
                            "A:bay_7",
                            "B:bay_7",
                            "C:bay_7",
                            "D:bay_7"
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
                                "decoratorId": "edge_brick_chain",
                                "whereToApply": "entire_facade",
                                "mode": "face",
                                "position": "bottom",
                                "configuration": {
                                    "edgeTarget": "right",
                                    "startY": 0,
                                    "endY": 3.05,
                                    "brickHeight": 0.32,
                                    "depthScaleMultiplier": 1,
                                    "snapToFit": true
                                },
                                "materialSelection": {
                                    "kind": "texture",
                                    "id": "pbr.seaworn_sandstone_brick"
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
                                    "tileMeters": 2.5,
                                    "tileMetersU": 2.5,
                                    "tileMetersV": 2.5,
                                    "uvEnabled": true,
                                    "offsetU": 0,
                                    "offsetV": 0,
                                    "rotationDegrees": 0
                                }
                            },
                            "autoCorner": {
                                "rule": "outmost_depth",
                                "resolvedBayRefs": [
                                    "A:bay_7",
                                    "B:bay_7",
                                    "C:bay_7",
                                    "D:bay_7"
                                ]
                            }
                        }
                    ],
                    "nextDecorationIndex": 2
                },
            ],
            "nextSetIndex": 5
        }
    ),
});

export default STONE_LOWRISE_2_BUILDING_CONFIG;
