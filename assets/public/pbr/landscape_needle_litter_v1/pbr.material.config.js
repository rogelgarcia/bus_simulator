// Registers the homogeneous CC0 needle-litter cover material of the landscape surface model with its unchanged source maps.
export default Object.freeze({
    "materialId": "pbr.landscape_needle_litter_v1",
    "label": "Landscape Needle Litter",
    "classId": "ground",
    "root": "surface",
    "buildingEligible": false,
    "groundEligible": true,
    "tileMeters": 2,
    "mapFiles": {
        "baseColor": "basecolor.png",
        "normal": "normal_gl.png",
        "orm": "arm.png",
        "displacement": "displacement.png"
    },
    "allMapFiles": {
        "baseColor": "assets/public/pbr/landscape_needle_litter_v1/basecolor.png",
        "normal": "assets/public/pbr/landscape_needle_litter_v1/normal_gl.png",
        "orm": "assets/public/pbr/landscape_needle_litter_v1/arm.png",
        "displacement": "assets/public/pbr/landscape_needle_litter_v1/displacement.png",
        "variants": {}
    },
    "source": {
        "provider": "Poly Haven",
        "author": "Rob Tuytel",
        "assetId": "forrest_ground_03",
        "assetUrl": "https://polyhaven.com/a/forrest_ground_03",
        "license": "CC0-1.0",
        "licenseUrl": "https://polyhaven.com/license",
        "downloadedOn": "2026-10-16",
        "resolution": 1024,
        "technique": "Poly Haven asset page; the provider does not state the capture method per asset",
        "physicalSize": {
            "widthMeters": 2,
            "heightMeters": 2,
            "statedAs": "API dimensions [2000, 2000] mm"
        },
        "files": [
            {
                "file": "basecolor.png",
                "originalFile": "forrest_ground_03_diff_1k.png",
                "byteLength": 2572936,
                "sha256": "a0a8ea8d4d8384f84bd59dce839ea56f8ef6e748995f4b2d04bc179491dc09d9",
                "url": "https://dl.polyhaven.org/file/ph-assets/Textures/png/1k/forrest_ground_03/forrest_ground_03_diff_1k.png"
            },
            {
                "file": "normal_gl.png",
                "originalFile": "forrest_ground_03_nor_gl_1k.png",
                "byteLength": 2726868,
                "sha256": "ef72d2cc4cba1f542e45ac262ca0b2c63fd2885e1ca8bd05d02f494662ca3fa1",
                "url": "https://dl.polyhaven.org/file/ph-assets/Textures/png/1k/forrest_ground_03/forrest_ground_03_nor_gl_1k.png"
            },
            {
                "file": "arm.png",
                "originalFile": "forrest_ground_03_arm_1k.png",
                "byteLength": 1879926,
                "sha256": "8fabfac11dc9f8d5799f829d1bc7f8e23d754f4b55c2bdbec22fb4177fc227cf",
                "url": "https://dl.polyhaven.org/file/ph-assets/Textures/png/1k/forrest_ground_03/forrest_ground_03_arm_1k.png"
            },
            {
                "file": "displacement.png",
                "originalFile": "forrest_ground_03_disp_1k.png",
                "byteLength": 2204691,
                "sha256": "2d21b134c79d6a7ea1d8ed8059facf54cc7220ab99dfa54e20db3dbebb43801b",
                "url": "https://dl.polyhaven.org/file/ph-assets/Textures/png/1k/forrest_ground_03/forrest_ground_03_disp_1k.png"
            }
        ],
        "receipt": "downloads/landscape/ai598_d2/polyhaven_forrest_ground_03/source.json"
    },
    "normalization": {
        "notes": "Unchanged 1K source maps; the 2-meter tile is the provider's stated size (2000 x 2000 mm). Pine-needle floor; the capture's top-to-bottom tonal drift is removed by the registered landscape appearance bake (radius 16).",
        "albedoNotes": "Pale needle floor photographed bright; the landscape calibration darkens it into the needle-litter range, broad drift removed by pbr.landscape.config.json.",
        "roughnessIntent": "Matte needle mat; relative source relief is needle relief, not measured terrain elevation."
    }
});
