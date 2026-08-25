// src/graphics/content3d/buildings/configs/GovCenter2.js
// City building config: Gov Center 2 — monumental civic building in the fabrication engine.
export const GOV_CENTER_2_BUILDING_CONFIG = Object.freeze({
    id: "gov_center_2",
    name: "Gov Center 2",
    layers: Object.freeze(
        [
            {
                "id": "floor_301",
                "type": "floor",
                "floors": 1,
                "floorHeight": 5.2,
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
                    "offsetV": 0,
                    "rotationDegrees": 0
                },
                "materialVariation": {
                    "enabled": true,
                    "seedOffset": 21,
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
                            "intensity": 0.55,
                            "value": 0.18,
                            "scale": 6.5
                        },
                        {
                            "enabled": false
                        },
                        {
                            "enabled": true,
                            "value": -0.14,
                            "intensity": 0.4,
                            "scale": 1.4,
                            "coverage": 0.4,
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
                        "intensity": 0.22
                    },
                    "wearBottom": {
                        "enabled": true,
                        "intensity": 0.25,
                        "hueDegrees": -35
                    },
                    "wearSide": {
                        "enabled": true,
                        "intensity": 0.7,
                        "value": -0.4,
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
                "id": "floor_302",
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
                "id": "floor_303",
                "type": "floor",
                "floors": 2,
                "floorHeight": 4.3,
                "planOffset": 0,
                "interior": {
                    "enabled": false
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
                    "tintSaturation": 0.07,
                    "tintValue": 0.985,
                    "tintIntensity": 1,
                    "tintBrightness": 1,
                    "tintHex": 16512490
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
                    "seedOffset": 7,
                    "root": "wall",
                    "space": "world",
                    "worldSpaceScale": 0.16,
                    "objectSpaceScale": 0.16,
                    "globalIntensity": 1,
                    "aoAmount": 0.45,
                    "normalMap": {
                        "flipX": false,
                        "flipY": false,
                        "flipZ": false
                    },
                    "macroLayers": [
                        {
                            "enabled": true,
                            "intensity": 0.45,
                            "value": 0.15,
                            "scale": 6
                        },
                        {
                            "enabled": false
                        },
                        {
                            "enabled": true,
                            "value": -0.12,
                            "intensity": 0.35,
                            "scale": 1.5,
                            "coverage": 0.38,
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
                        "value": -0.24,
                        "intensity": 0.25
                    },
                    "wearBottom": {
                        "enabled": true,
                        "intensity": 0.1,
                        "hueDegrees": -30
                    },
                    "wearSide": {
                        "enabled": true,
                        "intensity": 0.6,
                        "value": -0.35,
                        "width": 0.9,
                        "scale": 5,
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
                "id": "floor_304",
                "type": "floor",
                "floors": 1,
                "floorHeight": 0.8,
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
                "id": "roof_305",
                "type": "roof",
                "ring": {
                    "enabled": true,
                    "innerRadius": 0.3,
                    "outerRadius": 0.2,
                    "height": 1,
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
                    "x": -26,
                    "z": 13
                },
                {
                    "x": 26,
                    "z": 13
                },
                {
                    "x": 26,
                    "z": -13
                },
                {
                    "x": -26,
                    "z": -13
                }
            ]
        ]
    ),
    floors: 4,
    floorHeight: 4,
    style: "default",
    windows: null,
    facades: Object.freeze(
        {
            "floor_301": {
                "A": {
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
                                        "widthMeters": 2.4
                                    },
                                    "expandPreference": "prefer_expand",
                                    "wallMaterialOverride": null,
                                    "depth": {
                                        "left": -0.15,
                                        "right": -0.15
                                    },
                                    "window": {
                                        "enabled": true,
                                        "defId": "window_arch_civic",
                                        "assetType": "window",
                                        "size": {
                                            "widthMeters": 1.8,
                                            "heightMeters": 3.4
                                        },
                                        "heightMode": "fixed",
                                        "verticalOffsetMeters": 0.9,
                                        "width": {
                                            "minMeters": 1.8,
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
                                            "interior": "office"
                                        },
                                        "top": {
                                            "enabled": false,
                                            "assetType": "window",
                                            "heightMode": "fixed",
                                            "heightMeters": 3.4,
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
                                        "minMeters": 1.3,
                                        "maxMeters": null
                                    },
                                    "expandPreference": "prefer_expand",
                                    "wallMaterialOverride": null
                                },
                                {
                                    "id": "bay_4",
                                    "size": {
                                        "mode": "fixed",
                                        "widthMeters": 2.4
                                    },
                                    "expandPreference": "prefer_expand",
                                    "wallMaterialOverride": null,
                                    "depth": {
                                        "left": -0.15,
                                        "right": -0.15
                                    },
                                    "window": {
                                        "enabled": true,
                                        "defId": "window_arch_civic",
                                        "assetType": "window",
                                        "size": {
                                            "widthMeters": 1.8,
                                            "heightMeters": 3.4
                                        },
                                        "heightMode": "fixed",
                                        "verticalOffsetMeters": 0.9,
                                        "width": {
                                            "minMeters": 1.8,
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
                                            "interior": "office"
                                        },
                                        "top": {
                                            "enabled": false,
                                            "assetType": "window",
                                            "heightMode": "fixed",
                                            "heightMeters": 3.4,
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
                                        "minMeters": 1.6,
                                        "maxMeters": null
                                    },
                                    "expandPreference": "prefer_expand",
                                    "wallMaterialOverride": null
                                },
                                {
                                    "id": "bay_6",
                                    "size": {
                                        "mode": "fixed",
                                        "widthMeters": 4.4
                                    },
                                    "expandPreference": "prefer_expand",
                                    "wallMaterialOverride": null,
                                    "depth": {
                                        "left": -0.45,
                                        "right": -0.45
                                    },
                                    "window": {
                                        "enabled": true,
                                        "defId": "door_wood_arch",
                                        "assetType": "door",
                                        "size": {
                                            "widthMeters": 2.8,
                                            "heightMeters": 4
                                        },
                                        "heightMode": "fixed",
                                        "verticalOffsetMeters": null,
                                        "width": {
                                            "minMeters": 2.8,
                                            "maxMeters": null
                                        },
                                        "padding": {
                                            "leftMeters": 0.8,
                                            "rightMeters": 0.8
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
                                            "interior": "office"
                                        },
                                        "top": {
                                            "enabled": false,
                                            "assetType": "door",
                                            "heightMode": "fixed",
                                            "heightMeters": 3.6,
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
                                    "id": "bay_7",
                                    "size": {
                                        "mode": "range",
                                        "minMeters": 1.6,
                                        "maxMeters": null
                                    },
                                    "expandPreference": "prefer_expand",
                                    "wallMaterialOverride": null
                                },
                                {
                                    "id": "bay_8",
                                    "size": {
                                        "mode": "fixed",
                                        "widthMeters": 2.4
                                    },
                                    "expandPreference": "prefer_expand",
                                    "wallMaterialOverride": null,
                                    "depth": {
                                        "left": -0.15,
                                        "right": -0.15
                                    },
                                    "window": {
                                        "enabled": true,
                                        "defId": "window_arch_civic",
                                        "assetType": "window",
                                        "size": {
                                            "widthMeters": 1.8,
                                            "heightMeters": 3.4
                                        },
                                        "heightMode": "fixed",
                                        "verticalOffsetMeters": 0.9,
                                        "width": {
                                            "minMeters": 1.8,
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
                                            "interior": "office"
                                        },
                                        "top": {
                                            "enabled": false,
                                            "assetType": "window",
                                            "heightMode": "fixed",
                                            "heightMeters": 3.4,
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
                                    "id": "bay_9",
                                    "size": {
                                        "mode": "range",
                                        "minMeters": 1.3,
                                        "maxMeters": null
                                    },
                                    "expandPreference": "prefer_expand",
                                    "wallMaterialOverride": null
                                },
                                {
                                    "id": "bay_10",
                                    "size": {
                                        "mode": "range",
                                        "minMeters": 1.2,
                                        "maxMeters": null
                                    },
                                    "expandPreference": "prefer_expand",
                                    "wallMaterialOverride": null
                                }
                            ],
                            "nextBayIndex": 11
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
                                },
                                {
                                    "id": "group_2",
                                    "bayIds": [
                                        "bay_8",
                                        "bay_9"
                                    ],
                                    "repeat": {
                                        "minRepeats": 1,
                                        "maxRepeats": "auto"
                                    }
                                }
                            ],
                            "nextGroupIndex": 3
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
                                        "widthMeters": 2.4
                                    },
                                    "expandPreference": "prefer_expand",
                                    "wallMaterialOverride": null,
                                    "depth": {
                                        "left": -0.15,
                                        "right": -0.15
                                    },
                                    "window": {
                                        "enabled": true,
                                        "defId": "window_arch_civic",
                                        "assetType": "window",
                                        "size": {
                                            "widthMeters": 1.8,
                                            "heightMeters": 3.4
                                        },
                                        "heightMode": "fixed",
                                        "verticalOffsetMeters": 0.9,
                                        "width": {
                                            "minMeters": 1.8,
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
                                            "interior": "office"
                                        },
                                        "top": {
                                            "enabled": false,
                                            "assetType": "window",
                                            "heightMode": "fixed",
                                            "heightMeters": 3.4,
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
                                        "minMeters": 1.3,
                                        "maxMeters": null
                                    },
                                    "expandPreference": "prefer_expand",
                                    "wallMaterialOverride": null
                                },
                                {
                                    "id": "bay_4",
                                    "size": {
                                        "mode": "fixed",
                                        "widthMeters": 2.4
                                    },
                                    "expandPreference": "prefer_expand",
                                    "wallMaterialOverride": null,
                                    "depth": {
                                        "left": -0.15,
                                        "right": -0.15
                                    },
                                    "window": {
                                        "enabled": true,
                                        "defId": "window_arch_civic",
                                        "assetType": "window",
                                        "size": {
                                            "widthMeters": 1.8,
                                            "heightMeters": 3.4
                                        },
                                        "heightMode": "fixed",
                                        "verticalOffsetMeters": 0.9,
                                        "width": {
                                            "minMeters": 1.8,
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
                                            "interior": "office"
                                        },
                                        "top": {
                                            "enabled": false,
                                            "assetType": "window",
                                            "heightMode": "fixed",
                                            "heightMeters": 3.4,
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
            "floor_302": {
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
            },
            "floor_303": {
                "A": {
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
                                        "widthMeters": 2.4
                                    },
                                    "expandPreference": "prefer_expand",
                                    "wallMaterialOverride": null,
                                    "window": {
                                        "enabled": true,
                                        "defId": "window_arch_civic",
                                        "assetType": "window",
                                        "size": {
                                            "widthMeters": 1.8,
                                            "heightMeters": 3
                                        },
                                        "heightMode": "fixed",
                                        "verticalOffsetMeters": 0.8,
                                        "width": {
                                            "minMeters": 1.8,
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
                                            "interior": "office"
                                        },
                                        "top": {
                                            "enabled": false,
                                            "assetType": "window",
                                            "heightMode": "fixed",
                                            "heightMeters": 3,
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
                                        "minMeters": 1.3,
                                        "maxMeters": null
                                    },
                                    "expandPreference": "prefer_expand",
                                    "wallMaterialOverride": null
                                },
                                {
                                    "id": "bay_4",
                                    "size": {
                                        "mode": "fixed",
                                        "widthMeters": 2.4
                                    },
                                    "expandPreference": "prefer_expand",
                                    "wallMaterialOverride": null,
                                    "window": {
                                        "enabled": true,
                                        "defId": "window_arch_civic",
                                        "assetType": "window",
                                        "size": {
                                            "widthMeters": 1.8,
                                            "heightMeters": 3
                                        },
                                        "heightMode": "fixed",
                                        "verticalOffsetMeters": 0.8,
                                        "width": {
                                            "minMeters": 1.8,
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
                                            "interior": "office"
                                        },
                                        "top": {
                                            "enabled": false,
                                            "assetType": "window",
                                            "heightMode": "fixed",
                                            "heightMeters": 3,
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
            "floor_304": {
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
                                        "left": 0.18,
                                        "right": 0.18
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
                        "layerId": "floor_301",
                        "bayRefs": [
                            "A:bay_1",
                            "A:bay_3",
                            "A:bay_5",
                            "A:bay_7",
                            "A:bay_9",
                            "A:bay_10",
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
                                    "heightMeters": 0.6,
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
                                    "A:bay_7",
                                    "A:bay_9",
                                    "A:bay_10",
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
                                    "offset": 0.06,
                                    "height": 0.14,
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
                                    "A:bay_7",
                                    "A:bay_9",
                                    "A:bay_10",
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
                        "layerId": "floor_303",
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
                                    "endY": 4.3,
                                    "brickHeight": 0.4,
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
                        "layerId": "floor_303",
                        "bayRefs": [
                            "A:bay_5",
                            "B:bay_5",
                            "C:bay_5",
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
                                "decoratorId": "edge_brick_chain",
                                "whereToApply": "entire_facade",
                                "mode": "face",
                                "position": "bottom",
                                "configuration": {
                                    "edgeTarget": "right",
                                    "startY": 0,
                                    "endY": 4.3,
                                    "brickHeight": 0.4,
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
                                    "A:bay_5",
                                    "B:bay_5",
                                    "C:bay_5",
                                    "D:bay_5"
                                ]
                            }
                        }
                    ],
                    "nextDecorationIndex": 2
                },
                {
                    "id": "set_4",
                    "target": {
                        "layerId": "floor_304",
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
                                "decoratorId": "cornice_basic_block",
                                "whereToApply": "entire_facade",
                                "mode": "face",
                                "position": "bottom",
                                "configuration": {
                                    "blockSizeMeters": 0.2,
                                    "spacingMode": "fixed",
                                    "spacingMeters": 0.42,
                                    "frontBottomLiftScale": 0.35,
                                    "snapToFit": true
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
                                    "B:bay_1",
                                    "C:bay_1",
                                    "D:bay_1"
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
                                    "offset": 0.09,
                                    "height": 0.2,
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
                                    "B:bay_1",
                                    "C:bay_1",
                                    "D:bay_1"
                                ]
                            }
                        }
                    ],
                    "nextDecorationIndex": 3
                }
            ],
            "nextSetIndex": 5
        }
    ),
});

export default GOV_CENTER_2_BUILDING_CONFIG;
