// src/graphics/content3d/buildings/configs/Beige1.js
// City building config: Beige 1.
export const BEIGE_1_BUILDING_CONFIG = Object.freeze({
    id: "beige_1",
    name: "Beige 1",
    layers: Object.freeze(
        [
            {
                "id": "floor_101",
                "type": "floor",
                "floors": 1,
                "floorHeight": 3.5,
                "planOffset": 0,
                "interior": {
                    "enabled": false
                },
                "style": "default",
                "material": {
                    "kind": "texture",
                    "id": "default"
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
                        "D": "A"
                    },
                    "reverseByFace": {
                        "D": true
                    }
                },
                "faceMaterials": {
                    "A": {
                        "material": {
                            "kind": "texture",
                            "id": "pbr.plastered_wall_02"
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
                            "rotationDegrees": 90
                        },
                        "materialVariation": {
                            "enabled": false,
                            "seedOffset": 0
                        }
                    },
                    "B": {
                        "material": {
                            "kind": "texture",
                            "id": "default"
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
                        },
                        "materialVariation": {
                            "enabled": false,
                            "seedOffset": 0
                        }
                    },
                    "C": {
                        "material": {
                            "kind": "texture",
                            "id": "default"
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
                        },
                        "materialVariation": {
                            "enabled": false,
                            "seedOffset": 0
                        }
                    }
                }
            },
            {
                "id": "floor_102",
                "type": "floor",
                "floors": 1,
                "floorHeight": 1,
                "planOffset": 0,
                "interior": {
                    "enabled": false
                },
                "style": "default",
                "material": {
                    "kind": "texture",
                    "id": "default"
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
                },
                "faceMaterials": {
                    "A": {
                        "material": {
                            "kind": "texture",
                            "id": "pbr.plastered_wall_02"
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
                            "rotationDegrees": 90
                        },
                        "materialVariation": {
                            "enabled": false,
                            "seedOffset": 0
                        }
                    }
                }
            },
            {
                "id": "floor_103",
                "type": "floor",
                "floors": 5,
                "floorHeight": 3.2,
                "planOffset": 0,
                "interior": {
                    "enabled": true
                },
                "style": "default",
                "material": {
                    "kind": "texture",
                    "id": "default"
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
                    },
                    "reverseByFace": {
                        "D": true
                    }
                },
                "faceMaterials": {
                    "A": {
                        "material": {
                            "kind": "texture",
                            "id": "pbr.plastered_wall_02"
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
                            "rotationDegrees": 90
                        },
                        "materialVariation": {
                            "enabled": false,
                            "seedOffset": 0
                        }
                    }
                }
            },
            {
                "id": "floor_104",
                "type": "floor",
                "floors": 1,
                "floorHeight": 1,
                "planOffset": 0,
                "interior": {
                    "enabled": false
                },
                "style": "default",
                "material": {
                    "kind": "texture",
                    "id": "default"
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
                },
                "faceMaterials": {
                    "A": {
                        "material": {
                            "kind": "texture",
                            "id": "pbr.plastered_wall_02"
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
                        },
                        "materialVariation": {
                            "enabled": false,
                            "seedOffset": 0
                        }
                    }
                }
            }
        ]
    ),
    footprintLoops: Object.freeze(
        [
            [
                {
                    "x": -8,
                    "z": 8
                },
                {
                    "x": 7.4506046902487615,
                    "z": 8
                },
                {
                    "x": 7.4506046902487615,
                    "z": -8
                },
                {
                    "x": -8,
                    "z": -8
                }
            ]
        ]
    ),
    floors: 8,
    floorHeight: 3.5,
    style: "default",
    windows: null,
    facades: Object.freeze(
        {
            "floor_101": {
                "A": {
                    "layout": {
                        "bays": {
                            "items": [
                                {
                                    "id": "bay_1",
                                    "size": {
                                        "mode": "range",
                                        "minMeters": 1,
                                        "maxMeters": 1.8
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
                                        "left": -0.55,
                                        "right": -0.55
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
                                            "leftMeters": 0,
                                            "rightMeters": 0
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
                                        "widthMeters": 3.4
                                    },
                                    "expandPreference": "prefer_expand",
                                    "wallMaterialOverride": null,
                                    "depth": {
                                        "left": -0.4,
                                        "right": -0.4
                                    },
                                    "window": {
                                        "enabled": true,
                                        "defId": "window_street_black_with_cover",
                                        "assetType": "window",
                                        "size": {
                                            "widthMeters": 1.7,
                                            "heightMeters": 2.5
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
                                            "interior": "none"
                                        },
                                        "top": {
                                            "enabled": true,
                                            "assetType": "window",
                                            "heightMode": "full",
                                            "heightMeters": 2.5,
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
                                },
                                {
                                    "id": "bay_6",
                                    "size": {
                                        "mode": "fixed",
                                        "widthMeters": 1.7
                                    },
                                    "expandPreference": "prefer_expand",
                                    "wallMaterialOverride": null,
                                    "depth": {
                                        "left": -0.4,
                                        "right": -0.4
                                    },
                                    "window": {
                                        "enabled": true,
                                        "defId": "window_street_black_with_cover",
                                        "assetType": "window",
                                        "size": {
                                            "widthMeters": 1.7,
                                            "heightMeters": 2.5
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
                                            "interior": "none"
                                        },
                                        "top": {
                                            "enabled": true,
                                            "assetType": "window",
                                            "heightMode": "full",
                                            "heightMeters": 2.5,
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
                                        "minMeters": 1,
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
                                        "bay_4",
                                        "bay_5",
                                        "bay_6"
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
            "floor_102": {
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
            "floor_103": {
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
                                        "mode": "range",
                                        "minMeters": 1.7,
                                        "maxMeters": null
                                    },
                                    "expandPreference": "prefer_expand",
                                    "wallMaterialOverride": null,
                                    "window": {
                                        "enabled": true,
                                        "defId": "window_street_black",
                                        "assetType": "window",
                                        "size": {
                                            "widthMeters": 1.7,
                                            "heightMeters": 2.5
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
                                            "interior": "none"
                                        },
                                        "top": {
                                            "enabled": false,
                                            "assetType": "window",
                                            "heightMode": "fixed",
                                            "heightMeters": 2.5,
                                            "verticalGapMeters": 0.1,
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
                                    },
                                    "depth": {
                                        "left": -0.45,
                                        "right": -0.45
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
                                        "mode": "range",
                                        "minMeters": 2,
                                        "maxMeters": null
                                    },
                                    "expandPreference": "prefer_expand",
                                    "wallMaterialOverride": null,
                                    "window": {
                                        "enabled": true,
                                        "defId": "window_black_6_panels_tall",
                                        "assetType": "window",
                                        "size": {
                                            "widthMeters": 2,
                                            "heightMeters": 1.7
                                        },
                                        "heightMode": "fixed",
                                        "verticalOffsetMeters": 0.7,
                                        "width": {
                                            "minMeters": 2,
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
                                    },
                                    "depth": {
                                        "left": -0.2,
                                        "right": -0.2
                                    }
                                },
                                {
                                    "id": "bay_7",
                                    "size": {
                                        "mode": "range",
                                        "minMeters": 1,
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
            }
        }
    ),
    wallDecorations: Object.freeze(
        {
            "sets": [
                {
                    "id": "set_1",
                    "target": {
                        "layerId": "floor_101",
                        "bayRefs": [
                            "A:bay_1",
                            "D:bay_1",
                            "A:bay_3",
                            "D:bay_3",
                            "A:bay_5",
                            "D:bay_5",
                            "A:bay_7",
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
                                "decoratorId": "simple_skirt",
                                "whereToApply": "entire_facade",
                                "mode": "face",
                                "position": "bottom",
                                "configuration": {
                                    "heightMeters": 0.5,
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
                                    "D:bay_1",
                                    "A:bay_3",
                                    "D:bay_3",
                                    "A:bay_5",
                                    "D:bay_5",
                                    "A:bay_7",
                                    "D:bay_7"
                                ],
                                "byBayRef": {
                                    "A:bay_1": {
                                        "start": true,
                                        "end": false,
                                        "continuationStartMeters": 0,
                                        "continuationEndMeters": 0,
                                        "startCornerStyle": "exterior",
                                        "endCornerStyle": null,
                                        "startCornerRelation": "face_boundary",
                                        "endCornerRelation": null
                                    }
                                }
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
                                    "offset": 0.03,
                                    "height": 0.05,
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
                                    "D:bay_1",
                                    "A:bay_3",
                                    "D:bay_3",
                                    "A:bay_5",
                                    "D:bay_5",
                                    "A:bay_7",
                                    "D:bay_7"
                                ],
                                "byBayRef": {
                                    "A:bay_1": {
                                        "start": true,
                                        "end": false,
                                        "continuationStartMeters": 0,
                                        "continuationEndMeters": 0,
                                        "startCornerStyle": "exterior",
                                        "endCornerStyle": null,
                                        "startCornerRelation": "face_boundary",
                                        "endCornerRelation": null
                                    }
                                }
                            }
                        }
                    ],
                    "nextDecorationIndex": 3
                },
                {
                    "id": "set_2",
                    "target": {
                        "layerId": "floor_103",
                        "bayRefs": [
                            "A:bay_4",
                            "B:bay_4",
                            "C:bay_4",
                            "D:bay_4",
                            "A:bay_2",
                            "B:bay_2",
                            "C:bay_2",
                            "D:bay_2"
                        ],
                        "allBays": false
                    },
                    "floorInterval": {
                        "every": 1,
                        "start": 5,
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
                                "decoratorId": "angled_support_profile",
                                "whereToApply": "entire_facade",
                                "mode": "face",
                                "position": "top",
                                "configuration": {
                                    "offset": 0.05,
                                    "height": 0.15,
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
                                    "A:bay_4",
                                    "B:bay_4",
                                    "C:bay_4",
                                    "D:bay_4",
                                    "A:bay_2",
                                    "B:bay_2",
                                    "C:bay_2",
                                    "D:bay_2"
                                ]
                            }
                        }
                    ],
                    "nextDecorationIndex": 2
                },
                {
                    "id": "set_3",
                    "target": {
                        "layerId": "floor_101",
                        "bayRefs": [
                            "A:bay_4",
                            "D:bay_4",
                            "A:bay_6",
                            "D:bay_6",
                            "A:bay_2",
                            "D:bay_2"
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
                                    "A:bay_4",
                                    "D:bay_4",
                                    "A:bay_6",
                                    "D:bay_6",
                                    "A:bay_2",
                                    "D:bay_2"
                                ]
                            }
                        }
                    ],
                    "nextDecorationIndex": 2
                }
            ],
            "nextSetIndex": 4
        }
    ),
});

export default BEIGE_1_BUILDING_CONFIG;
