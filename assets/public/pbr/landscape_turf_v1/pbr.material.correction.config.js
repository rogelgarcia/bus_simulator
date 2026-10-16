// Supplies the authored landscape response of the turf cover material through the shared PBR resolver.
export default Object.freeze({
    "schema": "bus_sim.pbr_material_correction",
    "version": 1,
    "materialId": "pbr.landscape_turf_v1",
    "label": "Landscape Turf Sward",
    "classId": "ground",
    "textureFolder": "assets/public/pbr/landscape_turf_v1",
    "sourceConfigFile": "assets/public/pbr/landscape_turf_v1/pbr.material.config.js",
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
            "Authored matte cover response for the landscape surface model; no measured calibration claimed. Short grass canopy: shadowing canopy with a pronounced hot spot like the loam grass."
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
                    "saturation": 0.85,
                    "tintStrength": 0
                },
                "normal": {
                    "mode": "scale",
                    "strength": 0.7
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
                    "min": 0.75,
                    "max": 0.98,
                    "gamma": 1
                }
            }
        }
    }
});
