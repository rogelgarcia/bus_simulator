// Registers the homogeneous CC0 mud substrate material of the landscape surface model with its unchanged source maps.
export default Object.freeze({
    "materialId": "pbr.landscape_mud_v1",
    "label": "Landscape Mud",
    "classId": "ground",
    "root": "surface",
    "buildingEligible": false,
    "groundEligible": true,
    "tileMeters": 3,
    "mapFiles": {
        "baseColor": "basecolor.png",
        "normal": "normal_gl.png",
        "orm": "arm.png",
        "displacement": "displacement.png"
    },
    "allMapFiles": {
        "baseColor": "assets/public/pbr/landscape_mud_v1/basecolor.png",
        "normal": "assets/public/pbr/landscape_mud_v1/normal_gl.png",
        "orm": "assets/public/pbr/landscape_mud_v1/arm.png",
        "displacement": "assets/public/pbr/landscape_mud_v1/displacement.png",
        "variants": {}
    },
    "source": {
        "provider": "Poly Haven",
        "author": "Rob Tuytel, Rico Cilliers",
        "assetId": "dry_mud_field_001",
        "assetUrl": "https://polyhaven.com/a/dry_mud_field_001",
        "license": "CC0-1.0",
        "licenseUrl": "https://polyhaven.com/license",
        "downloadedOn": "2026-10-16",
        "resolution": 1024,
        "technique": "Poly Haven asset page; the provider does not state the capture method per asset",
        "physicalSize": {
            "widthMeters": 3,
            "heightMeters": 3.000000238418579,
            "statedAs": "API dimensions [3000, 3000.000238418579] mm"
        },
        "files": [
            {
                "file": "basecolor.png",
                "originalFile": "dry_mud_field_001_diff_1k.png",
                "byteLength": 5853359,
                "sha256": "d5e3ea53ff69c2812278a5ee04cb8085dbbc2b651d24793cc766d5a655fd985d",
                "url": "https://dl.polyhaven.org/file/ph-assets/Textures/png/1k/dry_mud_field_001/dry_mud_field_001_diff_1k.png"
            },
            {
                "file": "normal_gl.png",
                "originalFile": "dry_mud_field_001_nor_gl_1k.png",
                "byteLength": 6122707,
                "sha256": "70fee818a705b08d77544d8a1fecf190c36cdd98d755fe4f0ca4dde210144997",
                "url": "https://dl.polyhaven.org/file/ph-assets/Textures/png/1k/dry_mud_field_001/dry_mud_field_001_nor_gl_1k.png"
            },
            {
                "file": "arm.png",
                "originalFile": "dry_mud_field_001_arm_1k.png",
                "byteLength": 4699031,
                "sha256": "750c9034b1ec8c0f427ddb0ffd85f002641038a914f8f818c0e264a4ccdfd026",
                "url": "https://dl.polyhaven.org/file/ph-assets/Textures/png/1k/dry_mud_field_001/dry_mud_field_001_arm_1k.png"
            },
            {
                "file": "displacement.png",
                "originalFile": "dry_mud_field_001_disp_1k.png",
                "byteLength": 2386917,
                "sha256": "3875ab199dbd5463cf06fc5d6b9743f98ae2126b6f3b24bb5057be8053dba052",
                "url": "https://dl.polyhaven.org/file/ph-assets/Textures/png/1k/dry_mud_field_001/dry_mud_field_001_disp_1k.png"
            }
        ],
        "receipt": "downloads/landscape/ai598_d2/polyhaven_dry_mud_field_001/source.json"
    },
    "normalization": {
        "notes": "Unchanged 1K source maps; the 3-meter tile is the provider's stated size (3000 x 3000 mm). Fine alluvial silt; wet darkening and the wet film come from the surface model's wetness, not from the tile.",
        "albedoNotes": "Dark brown fine silt; the landscape calibration keeps it inside the moist-mud range.",
        "roughnessIntent": "Matte nonmetal silt when dry; the surface model lowers roughness with wetness."
    }
});
