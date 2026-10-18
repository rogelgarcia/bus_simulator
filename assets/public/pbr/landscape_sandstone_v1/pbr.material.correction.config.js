// Supplies the authored landscape response of the sandstone substrate material through the shared PBR resolver.
export default Object.freeze({
    "schema": "bus_sim.pbr_material_correction",
    "version": 1,
    "materialId": "pbr.landscape_sandstone_v1",
    "label": "Landscape Coastal Sandstone",
    "classId": "stone",
    "textureFolder": "assets/public/pbr/landscape_sandstone_v1",
    "sourceConfigFile": "assets/public/pbr/landscape_sandstone_v1/pbr.material.config.js",
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
            "Authored matte substrate response for the landscape surface model; no measured calibration claimed. Sandstone keeps a slightly smoother diffuse response than soil and little specular sheen."
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
                    "sourceMap": "orm",
                    "sourceChannel": "g",
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
