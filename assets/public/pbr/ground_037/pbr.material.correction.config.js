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
    "classId": "ground",
    "label": "Ground 037",
    "mapFiles": {
        "ao": "ao.png",
        "baseColor": "basecolor.png",
        "displacement": "displacement.png",
        "normal": "normal_gl.png",
        "roughness": "roughness.png"
    },
    "materialId": "pbr.ground_037",
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
                    "strength": 0.95
                },
                "roughness": {
                    "gamma": 1,
                    "max": 0.95,
                    "min": 0.58,
                    "normalizeInputPercentiles": [
                        5,
                        95
                    ],
                    "sourceChannel": "r",
                    "sourceMap": "roughness"
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
                    "strength": 0.95
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
                        "max": 0.95,
                        "min": 0.58
                    },
                    "response": {
                        "gamma": 1,
                        "type": "gamma"
                    },
                    "source": {
                        "channel": "r",
                        "map": "roughness"
                    }
                }
            },
            "profileId": "terrain_baseline_v1",
            "warnings": []
        }
    },
    "resolvedMapFiles": {
        "ao": "assets/public/pbr/ground_037/ao.png",
        "baseColor": "assets/public/pbr/ground_037/basecolor.png",
        "displacement": "assets/public/pbr/ground_037/displacement.png",
        "normal": "assets/public/pbr/ground_037/normal_gl.png",
        "roughness": "assets/public/pbr/ground_037/roughness.png"
    },
    "schema": "bus_sim.pbr_material_correction",
    "sourceConfigFile": "assets/public/pbr/ground_037/pbr.material.config.js",
    "textureFolder": "assets/public/pbr/ground_037",
    "toolEntry": "tools/texture_correction_pipeline/run.mjs",
    "toolId": "texture_correction_pipeline",
    "version": 1
});
