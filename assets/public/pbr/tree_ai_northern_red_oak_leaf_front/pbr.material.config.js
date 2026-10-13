// AI-generated botanical PBR; exact source hashes and scale assumptions are retained.
export default Object.freeze({
    "materialId": "pbr.tree_ai_northern_red_oak_leaf_front",
    "label": "Northern red oak — leaf front",
    "classId": "foliage",
    "root": "surface",
    "buildingEligible": false,
    "groundEligible": false,
    "tileMeters": 0.24255406797116377,
    "preferredVariant": "1k",
    "variants": [
        "1k"
    ],
    "mapFiles": {
        "baseColor": "basecolor.png",
        "normal": "normal_opengl.png",
        "orm": "orm.png",
        "displacement": "height_16bit.png"
    },
    "auxiliaryMapFiles": {
        "opacity": "opacity.png",
        "translucency": "translucency.png"
    },
    "allMapFiles": {
        "baseColor": "assets/public/pbr/tree_ai_northern_red_oak_leaf_front/basecolor.png",
        "normal": "assets/public/pbr/tree_ai_northern_red_oak_leaf_front/normal_opengl.png",
        "orm": "assets/public/pbr/tree_ai_northern_red_oak_leaf_front/orm.png",
        "variants": {
            "ao": "assets/public/pbr/tree_ai_northern_red_oak_leaf_front/ao.png",
            "basecolor": "assets/public/pbr/tree_ai_northern_red_oak_leaf_front/basecolor.png",
            "height_16bit": "assets/public/pbr/tree_ai_northern_red_oak_leaf_front/height_16bit.png",
            "metallic": "assets/public/pbr/tree_ai_northern_red_oak_leaf_front/metallic.png",
            "normal_directx": "assets/public/pbr/tree_ai_northern_red_oak_leaf_front/normal_directx.png",
            "normal_opengl": "assets/public/pbr/tree_ai_northern_red_oak_leaf_front/normal_opengl.png",
            "opacity": "assets/public/pbr/tree_ai_northern_red_oak_leaf_front/opacity.png",
            "orm": "assets/public/pbr/tree_ai_northern_red_oak_leaf_front/orm.png",
            "roughness": "assets/public/pbr/tree_ai_northern_red_oak_leaf_front/roughness.png",
            "translucency": "assets/public/pbr/tree_ai_northern_red_oak_leaf_front/translucency.png"
        }
    },
    "normalization": {
        "notes": "AI generated; supplied registered PNGs preserved exactly. Data maps are inferred artistic proxies, not measured scans.",
        "albedoNotes": "sRGB source appearance; no additional baked showroom lighting.",
        "roughnessIntent": "Source roughness, ORM green channel."
    },
    "provenance": {
        "schema": "bus-simulator.pbr-material-provenance",
        "version": 1,
        "source": {
            "type": "AI generated",
            "asset": "Northern red oak leaf_front",
            "url": null,
            "license": "Unspecified; user-supplied AI generated material",
            "archive": "trees_pbr_pack.zip"
        },
        "generation": {
            "tool": "AI generated (user-supplied pack)",
            "recipe": "tools/bake_vegetation/enhanced_reference/materials.mjs",
            "seed": null,
            "lightingInBaseColor": null
        },
        "importedOn": "2026-10-12",
        "species": "Quercus rubra",
        "role": "leaf_front",
        "physicalMeasurement": false,
        "physicalSize": {
            "width": 0.24255406797116377,
            "height": 0.24255406797116377,
            "basis": "artist-selected approximate scale; not measured"
        },
        "displacement": {
            "white_is_high": true,
            "midlevel": 0.5,
            "scale_m": 0.00065,
            "bias_m": -0.000325,
            "leaf_displacement_recommended": false
        },
        "leafUv": {
            "orientation": "apex up, petiole down",
            "bounds_px_xyxy": [
                157,
                33,
                895,
                1004
            ],
            "front_back_share_identical_opacity": true,
            "back_is_uv_registered_not_mirrored": true,
            "alignment": "common silhouette intersection; source vein alignment is approximate",
            "original_front_back_silhouette_iou": 0.9775840625123605
        },
        "recommendedMaterial": {
            "metallic": 0,
            "roughness_multiplier": 1,
            "alpha_mode": "MASK",
            "alpha_cutoff": 0.5,
            "two_sided": true
        },
        "sourceFiles": [
            {
                "file": "ao.png",
                "source": "northern_red_oak/leaf_front/ao.png",
                "sha256": "23b0a85cd273815b1738ad92a21c86945fd6bbda1c8edb7722ed766943b3f280",
                "bytes": 122993
            },
            {
                "file": "basecolor.png",
                "source": "northern_red_oak/leaf_front/basecolor.png",
                "sha256": "9469b15920c2a49ad5bf3952ba958bd29afa7f9b03f00c6c6fbc39e3456e9278",
                "bytes": 1040550
            },
            {
                "file": "height_16bit.png",
                "source": "northern_red_oak/leaf_front/height_16bit.png",
                "sha256": "07c58af8b3ffd2aa3d0fef9014365461606e920c5dc8d8721b4c5e0e7833a445",
                "bytes": 538941
            },
            {
                "file": "material.json",
                "source": "northern_red_oak/leaf_front/material.json",
                "sha256": "7848214f741f08ef8843b7ea529fa6d27721c7d16ed8ff22c7d0f6a0607cbbcf",
                "bytes": 4015
            },
            {
                "file": "metallic.png",
                "source": "northern_red_oak/leaf_front/metallic.png",
                "sha256": "c8b6bb3e837f846489438b47ae42f3960b820a17095ea66df3c5fa00fcd60665",
                "bytes": 1097
            },
            {
                "file": "normal_directx.png",
                "source": "northern_red_oak/leaf_front/normal_directx.png",
                "sha256": "0501a965a48cf46d5bc52eea8bdee40e2de920c45b942098823fcc2e48246bcc",
                "bytes": 392990
            },
            {
                "file": "normal_opengl.png",
                "source": "northern_red_oak/leaf_front/normal_opengl.png",
                "sha256": "c8ea78a9f90fee88800c6532e60e08f313afdf8e493b3548014158f1416645d0",
                "bytes": 393211
            },
            {
                "file": "opacity.png",
                "source": "northern_red_oak/leaf_front/opacity.png",
                "sha256": "a060a1a886fdb2181d8ff438363b81bff2fc38dc604a05b3f063ac965b912563",
                "bytes": 24801
            },
            {
                "file": "orm.png",
                "source": "northern_red_oak/leaf_front/orm.png",
                "sha256": "2ee00189c834c4659fdba82369d5aefc51da63bb32a3769c67bfbcbe03590408",
                "bytes": 254022
            },
            {
                "file": "roughness.png",
                "source": "northern_red_oak/leaf_front/roughness.png",
                "sha256": "5d1c89869b011b3f636b83486f52b13b0a18fce6d9d0d281ab25f7d967230d49",
                "bytes": 99181
            },
            {
                "file": "translucency.png",
                "source": "northern_red_oak/leaf_front/translucency.png",
                "sha256": "5ac8ea417c6c5f3f2e1f0ab5f52461a0cd75a05d25d75556e6c186c88279d7c0",
                "bytes": 231387
            }
        ]
    }
});
