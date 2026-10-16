// Registers the homogeneous CC0 broadleaf-litter cover material of the landscape surface model with its unchanged source maps.
export default Object.freeze({
    "materialId": "pbr.landscape_broadleaf_litter_v1",
    "label": "Landscape Broadleaf Litter",
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
        "baseColor": "assets/public/pbr/landscape_broadleaf_litter_v1/basecolor.png",
        "normal": "assets/public/pbr/landscape_broadleaf_litter_v1/normal_gl.png",
        "orm": "assets/public/pbr/landscape_broadleaf_litter_v1/arm.png",
        "displacement": "assets/public/pbr/landscape_broadleaf_litter_v1/displacement.png",
        "variants": {}
    },
    "source": {
        "provider": "Poly Haven",
        "author": "Amal Kumar",
        "assetId": "dry_decay_leaves",
        "assetUrl": "https://polyhaven.com/a/dry_decay_leaves",
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
                "originalFile": "dry_decay_leaves_diff_1k.png",
                "byteLength": 6227360,
                "sha256": "e0f1c110318239a2f7fa2cceac280dd082120a3973879e5a622473901fd41bb8",
                "url": "https://dl.polyhaven.org/file/ph-assets/Textures/png/1k/dry_decay_leaves/dry_decay_leaves_diff_1k.png"
            },
            {
                "file": "normal_gl.png",
                "originalFile": "dry_decay_leaves_nor_gl_1k.png",
                "byteLength": 6529494,
                "sha256": "58829d98f8d4eea2ef1be96a4c6a37660af1cf1a425037f4ac68565b954b3ace",
                "url": "https://dl.polyhaven.org/file/ph-assets/Textures/png/1k/dry_decay_leaves/dry_decay_leaves_nor_gl_1k.png"
            },
            {
                "file": "arm.png",
                "originalFile": "dry_decay_leaves_arm_1k.png",
                "byteLength": 4294398,
                "sha256": "6de8e7965ddd42bee5ce3eadd2d3c9834a6b8c68b59e8f9beb7bedce9ef84afa",
                "url": "https://dl.polyhaven.org/file/ph-assets/Textures/png/1k/dry_decay_leaves/dry_decay_leaves_arm_1k.png"
            },
            {
                "file": "displacement.png",
                "originalFile": "dry_decay_leaves_disp_1k.png",
                "byteLength": 1682223,
                "sha256": "2509dab4c800f37c29dce8d728cbe33b197e7b77b54acfc1da3190eae78c0115",
                "url": "https://dl.polyhaven.org/file/ph-assets/Textures/png/1k/dry_decay_leaves/dry_decay_leaves_disp_1k.png"
            }
        ],
        "receipt": "downloads/landscape/ai598_d2/polyhaven_dry_decay_leaves/source.json"
    },
    "normalization": {
        "notes": "Unchanged 1K source maps; the 2-meter tile is the provider's stated size (2000 x 2000 mm): whole dry leaves 5-12 cm.",
        "albedoNotes": "Brown decaying broadleaf litter; the landscape calibration keeps it inside the dry-litter range.",
        "roughnessIntent": "Matte dry leaves; relative source relief is leaf relief, not measured terrain elevation."
    }
});
