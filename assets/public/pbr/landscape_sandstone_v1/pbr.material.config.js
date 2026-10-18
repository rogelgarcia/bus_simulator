// Registers the homogeneous CC0 sandstone substrate material of the landscape surface model with its unchanged source maps.
export default Object.freeze({
    "materialId": "pbr.landscape_sandstone_v1",
    "label": "Landscape Coastal Sandstone",
    "classId": "stone",
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
        "baseColor": "assets/public/pbr/landscape_sandstone_v1/basecolor.png",
        "normal": "assets/public/pbr/landscape_sandstone_v1/normal_gl.png",
        "orm": "assets/public/pbr/landscape_sandstone_v1/arm.png",
        "displacement": "assets/public/pbr/landscape_sandstone_v1/displacement.png",
        "variants": {}
    },
    "source": {
        "provider": "Poly Haven",
        "author": "Rob Tuytel, Dimitrios Savva",
        "assetId": "worn_rock_natural_01",
        "assetUrl": "https://polyhaven.com/a/worn_rock_natural_01",
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
                "originalFile": "worn_rock_natural_01_diff_1k.png",
                "byteLength": 1869454,
                "sha256": "4bd0e369a96a3e419df1b60c76ffb5429ffc9a5e4df9d1f00b6f1707c7d82651",
                "url": "https://dl.polyhaven.org/file/ph-assets/Textures/png/1k/worn_rock_natural_01/worn_rock_natural_01_diff_1k.png"
            },
            {
                "file": "normal_gl.png",
                "originalFile": "worn_rock_natural_01_nor_gl_1k.png",
                "byteLength": 1957554,
                "sha256": "f242473b1d739ade4882986e93162b3a80478784d032b1bdb82a52ff029600c8",
                "url": "https://dl.polyhaven.org/file/ph-assets/Textures/png/1k/worn_rock_natural_01/worn_rock_natural_01_nor_gl_1k.png"
            },
            {
                "file": "arm.png",
                "originalFile": "worn_rock_natural_01_arm_1k.png",
                "byteLength": 1192392,
                "sha256": "151f92ed9114db78cf3a2bc901d6f5f6e5e54afe5c5d91e8faf0c0838e7da625",
                "url": "https://dl.polyhaven.org/file/ph-assets/Textures/png/1k/worn_rock_natural_01/worn_rock_natural_01_arm_1k.png"
            },
            {
                "file": "displacement.png",
                "originalFile": "worn_rock_natural_01_disp_1k.png",
                "byteLength": 1596521,
                "sha256": "7da557ad08b8f0fa434a00a92ba6fc5035fcbc6068804e24513d68dfc5cac084",
                "url": "https://dl.polyhaven.org/file/ph-assets/Textures/png/1k/worn_rock_natural_01/worn_rock_natural_01_disp_1k.png"
            }
        ],
        "receipt": "downloads/landscape/ai598_d2/polyhaven_worn_rock_natural_01/source.json"
    },
    "normalization": {
        "notes": "Unchanged 1K source maps; the 2-meter tile is the provider's stated size (2000 x 2000 mm). Layered pale coastal sandstone; the strata banding comes from the surface model, not from the tile.",
        "albedoNotes": "Pale tan weathered sandstone; the landscape calibration keeps its effective albedo inside the sandstone range.",
        "roughnessIntent": "Matte nonmetal sandstone; relative source relief is bedding and grain, not measured terrain elevation."
    }
});
