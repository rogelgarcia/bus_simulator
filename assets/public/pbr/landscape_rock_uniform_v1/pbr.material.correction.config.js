// Supplies authored uniform landscape response through the shared PBR resolver.
export default Object.freeze({
    "schema": "bus_sim.pbr_material_correction",
    "version": 1,
    "materialId": "pbr.landscape_rock_uniform_v1",
    "label": "Landscape Fine Rock",
    "classId": "stone",
    "textureFolder": "assets/public/pbr/landscape_rock_uniform_v1",
    "sourceConfigFile": "assets/public/pbr/landscape_rock_uniform_v1/pbr.material.config.js",
    "mapFiles": {
        "baseColor": "basecolor.png",
        "normal": "normal_gl.png",
        "roughness": "roughness.png",
        "displacement": "displacement.png"
    },
    "analysis": {
        "mode": "authored",
        "captures": [],
        "notes": [
            "Uniform single-material landscape response; no measured calibration claimed."
        ]
    },
    "presets": {
        "aces": {
            "profileId": "landscape_uniform_v1",
            "adjustments": {
                "albedo": {
                    "mode": "gain_tint",
                    "brightness": 1,
                    "hueDegrees": 0,
                    "saturation": 0.7,
                    "tintStrength": 0
                },
                "normal": {
                    "mode": "scale",
                    "strength": 0.6
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
                    "min": 0.72,
                    "max": 0.98,
                    "gamma": 1
                }
            }
        }
    }
});
