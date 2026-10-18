// Supplies the authored landscape response of the shell-grit substrate material through the shared PBR resolver.
export default Object.freeze({
    "schema": "bus_sim.pbr_material_correction",
    "version": 1,
    "materialId": "pbr.landscape_shell_grit_v1",
    "label": "Landscape Shell Grit",
    "classId": "ground",
    "textureFolder": "assets/public/pbr/landscape_shell_grit_v1",
    "sourceConfigFile": "assets/public/pbr/landscape_shell_grit_v1/pbr.material.config.js",
    "mapFiles": {
        "baseColor": "basecolor.png",
        "normal": "normal_gl.png",
        "ao": "ao.png",
        "roughness": "roughness.png",
        "displacement": "displacement.png"
    },
    "analysis": {
        "mode": "authored",
        "captures": [],
        "notes": [
            "Authored matte substrate response for the landscape surface model; no measured calibration claimed. Shell grit is granular like sand with a little more sheen from shell faces."
        ]
    },
    "presets": {
        "aces": {
            "profileId": "landscape_layer_v1",
            "adjustments": {
                "albedo": {
                    "mode": "gain_tint",
                    "brightness": 1,
                    "hueDegrees": 0,
                    "saturation": 0.75,
                    "tintStrength": 0
                },
                "normal": {
                    "mode": "scale",
                    "strength": 0.75
                },
                "metalness": {
                    "mode": "constant",
                    "value": 0
                },
                "roughness": {
                    "sourceMap": "roughness",
                    "sourceChannel": "r",
                    "normalizeInputPercentiles": [
                        5,
                        95
                    ],
                    "min": 0.7,
                    "max": 0.98,
                    "gamma": 1
                }
            }
        }
    }
});
