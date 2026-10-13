// AI-generated botanical PBR; exact source hashes and scale assumptions are retained.
export default Object.freeze({
    "materialId": "pbr.tree_ai_northern_red_oak_leaf_back",
    "label": "Northern red oak — leaf back",
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
        "baseColor": "assets/public/pbr/tree_ai_northern_red_oak_leaf_back/basecolor.png",
        "normal": "assets/public/pbr/tree_ai_northern_red_oak_leaf_back/normal_opengl.png",
        "orm": "assets/public/pbr/tree_ai_northern_red_oak_leaf_back/orm.png",
        "variants": {
            "ao": "assets/public/pbr/tree_ai_northern_red_oak_leaf_back/ao.png",
            "basecolor": "assets/public/pbr/tree_ai_northern_red_oak_leaf_back/basecolor.png",
            "height_16bit": "assets/public/pbr/tree_ai_northern_red_oak_leaf_back/height_16bit.png",
            "metallic": "assets/public/pbr/tree_ai_northern_red_oak_leaf_back/metallic.png",
            "normal_directx": "assets/public/pbr/tree_ai_northern_red_oak_leaf_back/normal_directx.png",
            "normal_opengl": "assets/public/pbr/tree_ai_northern_red_oak_leaf_back/normal_opengl.png",
            "opacity": "assets/public/pbr/tree_ai_northern_red_oak_leaf_back/opacity.png",
            "orm": "assets/public/pbr/tree_ai_northern_red_oak_leaf_back/orm.png",
            "roughness": "assets/public/pbr/tree_ai_northern_red_oak_leaf_back/roughness.png",
            "translucency": "assets/public/pbr/tree_ai_northern_red_oak_leaf_back/translucency.png"
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
            "asset": "Northern red oak leaf_back",
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
        "role": "leaf_back",
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
                "source": "northern_red_oak/leaf_back/ao.png",
                "sha256": "4b7e8b0c695e219f84dc93fca9c1c0365aefa7945e4e364a6a640dd3178a8891",
                "bytes": 144785
            },
            {
                "file": "basecolor.png",
                "source": "northern_red_oak/leaf_back/basecolor.png",
                "sha256": "d38043d96e5292ef5c682fb5d708f32fe045e80f7d38bf9ba53152e79fec9805",
                "bytes": 1100444
            },
            {
                "file": "height_16bit.png",
                "source": "northern_red_oak/leaf_back/height_16bit.png",
                "sha256": "bba4fa975911648ab9e79b46a829d909304e22e6888681d7cbf16f5db8b9aeed",
                "bytes": 559787
            },
            {
                "file": "material.json",
                "source": "northern_red_oak/leaf_back/material.json",
                "sha256": "4d95d1480842ee4853deb470c7341f68d8501756b337980132508b50f3854eee",
                "bytes": 4017
            },
            {
                "file": "metallic.png",
                "source": "northern_red_oak/leaf_back/metallic.png",
                "sha256": "c8b6bb3e837f846489438b47ae42f3960b820a17095ea66df3c5fa00fcd60665",
                "bytes": 1097
            },
            {
                "file": "normal_directx.png",
                "source": "northern_red_oak/leaf_back/normal_directx.png",
                "sha256": "7ef73398879e1baa188f5fd17d33bd2c95b8b9656116eb11663249ed73497022",
                "bytes": 482396
            },
            {
                "file": "normal_opengl.png",
                "source": "northern_red_oak/leaf_back/normal_opengl.png",
                "sha256": "450155c7cac06f71ec807567109457010074fe813680dc5419071948a9dda598",
                "bytes": 482753
            },
            {
                "file": "opacity.png",
                "source": "northern_red_oak/leaf_back/opacity.png",
                "sha256": "a060a1a886fdb2181d8ff438363b81bff2fc38dc604a05b3f063ac965b912563",
                "bytes": 24801
            },
            {
                "file": "orm.png",
                "source": "northern_red_oak/leaf_back/orm.png",
                "sha256": "81347ff171342dc81029a29670e9da0c9621b078889fd53bea6622eef7a73ec3",
                "bytes": 320582
            },
            {
                "file": "roughness.png",
                "source": "northern_red_oak/leaf_back/roughness.png",
                "sha256": "2da2f47bfb5811426adf50b61d8fb18379bd9746adff1424b171ab788b62c758",
                "bytes": 125447
            },
            {
                "file": "translucency.png",
                "source": "northern_red_oak/leaf_back/translucency.png",
                "sha256": "5ac8ea417c6c5f3f2e1f0ab5f52461a0cd75a05d25d75556e6c186c88279d7c0",
                "bytes": 231387
            }
        ]
    }
});
