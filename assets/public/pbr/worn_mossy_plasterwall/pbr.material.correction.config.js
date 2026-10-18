export default Object.freeze({
    "analysis": {
        "captures": [],
        "discrepancyFlags": [],
        "map": {
            "fileSanity": {},
            "metrics": {}
        },
        "mode": "none",
        "qaSummary": {},
        "recommendations": {
            "notes": [],
            "pluginOptions": {}
        },
        "render": {}
    },
    "classId": "plaster_stucco",
    "label": "Worn Mossy Plasterwall",
    "mapFiles": {
        "baseColor": "basecolor.jpg",
        "normal": "normal_gl.png",
        "orm": "arm.png"
    },
    "materialId": "pbr.worn_mossy_plasterwall",
    "presets": {
        "aces": {
            "adjustments": {
                "albedo": {
                    "brightness": 1,
                    "hueDegrees": 0,
                    "mode": "gain_tint",
                    "saturation": 1,
                    "tintStrength": 0
                },
                "metalness": {
                    "mode": "constant",
                    "value": 0
                },
                "normal": {
                    "mode": "scale",
                    "strength": 1
                },
                "roughness": {
                    "gamma": 1,
                    "max": 0.88,
                    "min": 0.48,
                    "normalizeInputPercentiles": [
                        5,
                        95
                    ],
                    "sourceChannel": "g",
                    "sourceMap": "orm"
                }
            },
            "enabledPlugins": [
                "roughness_inversion_guard",
                "scalar_map_clipping_guard",
                "roughness_interval_remap",
                "albedo_balance",
                "normal_intensity",
                "metalness_policy"
            ],
            "pluginOutputs": {
                "albedo_balance": {
                    "brightness": 1,
                    "hueDegrees": 0,
                    "mode": "gain_tint",
                    "saturation": 1,
                    "tintStrength": 0
                },
                "metalness_policy": {
                    "mode": "constant",
                    "value": 0
                },
                "normal_intensity": {
                    "mode": "scale",
                    "strength": 1
                },
                "roughness_interval_remap": {
                    "inputNormalization": {
                        "highPercentile": 95,
                        "lowPercentile": 5,
                        "mode": "percentile_window"
                    },
                    "inputTransform": {
                        "mode": "identity"
                    },
                    "mode": "interval_remap",
                    "outputRange": {
                        "max": 0.88,
                        "min": 0.48
                    },
                    "response": {
                        "gamma": 1,
                        "type": "gamma"
                    },
                    "source": {
                        "channel": "g",
                        "map": "orm"
                    }
                }
            },
            "profileId": "terrain_baseline_v1",
            "warnings": []
        }
    },
    "resolvedMapFiles": {
        "baseColor": "assets/public/pbr/worn_mossy_plasterwall/basecolor.jpg",
        "normal": "assets/public/pbr/worn_mossy_plasterwall/normal_gl.png",
        "orm": "assets/public/pbr/worn_mossy_plasterwall/arm.png"
    },
    "schema": "bus_sim.pbr_material_correction",
    "sourceConfigFile": "assets/public/pbr/worn_mossy_plasterwall/pbr.material.config.js",
    "textureFolder": "assets/public/pbr/worn_mossy_plasterwall",
    "toolEntry": "tools/texture_correction_pipeline/run.mjs",
    "toolId": "texture_correction_pipeline",
    "version": 1
});
