// Registers the homogeneous CC0 caprock substrate material of the landscape surface model with its unchanged source maps.
export default Object.freeze({
    "materialId": "pbr.landscape_caprock_v1",
    "label": "Landscape Caprock",
    "classId": "stone",
    "root": "surface",
    "buildingEligible": false,
    "groundEligible": true,
    "tileMeters": 1.5,
    "mapFiles": {
        "baseColor": "basecolor.png",
        "normal": "normal_gl.png",
        "orm": "arm.png",
        "displacement": "displacement.png"
    },
    "allMapFiles": {
        "baseColor": "assets/public/pbr/landscape_caprock_v1/basecolor.png",
        "normal": "assets/public/pbr/landscape_caprock_v1/normal_gl.png",
        "orm": "assets/public/pbr/landscape_caprock_v1/arm.png",
        "displacement": "assets/public/pbr/landscape_caprock_v1/displacement.png",
        "variants": {}
    },
    "source": {
        "provider": "Poly Haven",
        "author": "Rob Tuytel",
        "assetId": "rock_08",
        "assetUrl": "https://polyhaven.com/a/rock_08",
        "license": "CC0-1.0",
        "licenseUrl": "https://polyhaven.com/license",
        "downloadedOn": "2026-10-16",
        "resolution": 1024,
        "technique": "Poly Haven asset page; the provider does not state the capture method per asset",
        "physicalSize": {
            "widthMeters": 1.5,
            "heightMeters": 1.5,
            "statedAs": "API dimensions [1500, 1500] mm"
        },
        "files": [
            {
                "file": "basecolor.png",
                "originalFile": "rock_08_diff_1k.png",
                "byteLength": 2131279,
                "sha256": "dd59734396fd09732e8332150916412e31560f88fe5b018e1475ba131975be00",
                "url": "https://dl.polyhaven.org/file/ph-assets/Textures/png/1k/rock_08/rock_08_diff_1k.png"
            },
            {
                "file": "normal_gl.png",
                "originalFile": "rock_08_nor_gl_1k.png",
                "byteLength": 2055182,
                "sha256": "7fe6de00274107e143875e61a7e2e19e757eee5a7f6e10b89c7a8c648093aaf8",
                "url": "https://dl.polyhaven.org/file/ph-assets/Textures/png/1k/rock_08/rock_08_nor_gl_1k.png"
            },
            {
                "file": "arm.png",
                "originalFile": "rock_08_arm_1k.png",
                "byteLength": 1423431,
                "sha256": "81b316f91f2e71c59b302764dbb3e65bfb0a0f59b26feed4df7a23a38e598f5b",
                "url": "https://dl.polyhaven.org/file/ph-assets/Textures/png/1k/rock_08/rock_08_arm_1k.png"
            },
            {
                "file": "displacement.png",
                "originalFile": "rock_08_disp_1k.png",
                "byteLength": 2036609,
                "sha256": "3a44026cbc3138de45699de44fcb7241dda4b940a003526d9cf21c6d24a2194f",
                "url": "https://dl.polyhaven.org/file/ph-assets/Textures/png/1k/rock_08/rock_08_disp_1k.png"
            }
        ],
        "receipt": "downloads/landscape/ai598_d2/polyhaven_rock_08/source.json"
    },
    "normalization": {
        "notes": "Unchanged 1K source maps; the 1.5-meter tile is the provider's stated size (1500 x 1500 mm). Bare hard rock bed; broad log-color drift is removed by the registered landscape appearance bake (radius 16).",
        "albedoNotes": "Grey-brown bare rock face; single-material microdetail, broad drift removed by pbr.landscape.config.json.",
        "roughnessIntent": "Matte nonmetal hard rock; relative source relief is grain, not measured terrain elevation."
    }
});
