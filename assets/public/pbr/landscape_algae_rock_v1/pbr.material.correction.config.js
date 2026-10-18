// Supplies the authored landscape response of the algae cover material through the shared PBR resolver.
export default Object.freeze({
    "schema": "bus_sim.pbr_material_correction",
    "version": 1,
    "materialId": "pbr.landscape_algae_rock_v1",
    "label": "Landscape Algae Rock",
    "classId": "stone",
    "textureFolder": "assets/public/pbr/landscape_algae_rock_v1",
    "sourceConfigFile": "assets/public/pbr/landscape_algae_rock_v1/pbr.material.config.js",
    "mapFiles": {
        "baseColor": "basecolor.png",
        "normal": "normal_gl.png",
        "orm": "arm.png",
        "displacement": "displacement.png"
    },
    "analysis": {
        "mode": "authored",
        "captures": [],
        "notes": [
            "Authored matte cover response for the landscape surface model; no measured calibration claimed. A wet biofilm keeps the GGX sheen (no natural-surface shadowing) and a small opposition."
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
                    "saturation": 0.9,
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
                    "sourceMap": "orm",
                    "sourceChannel": "g",
                    "normalizeInputPercentiles": [
                        5,
                        95
                    ],
                    "min": 0.45,
                    "max": 0.9,
                    "gamma": 1
                }
            }
        }
    }
});
