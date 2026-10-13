// AI-generated botanical PBR; exact source hashes and scale assumptions are retained.
export default Object.freeze({
    "materialId": "pbr.tree_ai_silver_linden_leaf_front",
    "label": "Silver linden — leaf front",
    "classId": "foliage",
    "root": "surface",
    "buildingEligible": false,
    "groundEligible": false,
    "tileMeters": 0.14902286902286904,
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
        "baseColor": "assets/public/pbr/tree_ai_silver_linden_leaf_front/basecolor.png",
        "normal": "assets/public/pbr/tree_ai_silver_linden_leaf_front/normal_opengl.png",
        "orm": "assets/public/pbr/tree_ai_silver_linden_leaf_front/orm.png",
        "variants": {
            "ao": "assets/public/pbr/tree_ai_silver_linden_leaf_front/ao.png",
            "basecolor": "assets/public/pbr/tree_ai_silver_linden_leaf_front/basecolor.png",
            "height_16bit": "assets/public/pbr/tree_ai_silver_linden_leaf_front/height_16bit.png",
            "metallic": "assets/public/pbr/tree_ai_silver_linden_leaf_front/metallic.png",
            "normal_directx": "assets/public/pbr/tree_ai_silver_linden_leaf_front/normal_directx.png",
            "normal_opengl": "assets/public/pbr/tree_ai_silver_linden_leaf_front/normal_opengl.png",
            "opacity": "assets/public/pbr/tree_ai_silver_linden_leaf_front/opacity.png",
            "orm": "assets/public/pbr/tree_ai_silver_linden_leaf_front/orm.png",
            "roughness": "assets/public/pbr/tree_ai_silver_linden_leaf_front/roughness.png",
            "translucency": "assets/public/pbr/tree_ai_silver_linden_leaf_front/translucency.png"
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
            "asset": "Silver linden leaf_front",
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
        "species": "Tilia tomentosa",
        "role": "leaf_front",
        "physicalMeasurement": false,
        "physicalSize": {
            "width": 0.14902286902286904,
            "height": 0.14902286902286904,
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
                140,
                40,
                887,
                1002
            ],
            "front_back_share_identical_opacity": true,
            "back_is_uv_registered_not_mirrored": true,
            "alignment": "common silhouette intersection; source vein alignment is approximate",
            "original_front_back_silhouette_iou": 0.9745450577464722
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
                "source": "silver_linden/leaf_front/ao.png",
                "sha256": "9365239dc03d69aed11f0704a92209b827a2f709558a6e3758a75f3922a3e796",
                "bytes": 171306
            },
            {
                "file": "basecolor.png",
                "source": "silver_linden/leaf_front/basecolor.png",
                "sha256": "3a7ca715c2f93fdda864dcbea746ee336475b047f4aed5167e1acf7b5d2ccb7b",
                "bytes": 1350622
            },
            {
                "file": "height_16bit.png",
                "source": "silver_linden/leaf_front/height_16bit.png",
                "sha256": "843c57568011e084587f84ccbb3f1e6d4f6839905774b91c1297bf18ed56040b",
                "bytes": 746263
            },
            {
                "file": "material.json",
                "source": "silver_linden/leaf_front/material.json",
                "sha256": "e497b2668b1597a4b0824b3e0be09f52764fb2fe2bfcf7f559e828078a0fbdae",
                "bytes": 4011
            },
            {
                "file": "metallic.png",
                "source": "silver_linden/leaf_front/metallic.png",
                "sha256": "c8b6bb3e837f846489438b47ae42f3960b820a17095ea66df3c5fa00fcd60665",
                "bytes": 1097
            },
            {
                "file": "normal_directx.png",
                "source": "silver_linden/leaf_front/normal_directx.png",
                "sha256": "d1d569039ad8e28c0ec45f56a98454f96bc71fa9e06d11c2f8a7946371689700",
                "bytes": 646259
            },
            {
                "file": "normal_opengl.png",
                "source": "silver_linden/leaf_front/normal_opengl.png",
                "sha256": "35e20202785540d290bf7b2b636a2f2ab5b004f7473473f2b844a8a46e02f908",
                "bytes": 646474
            },
            {
                "file": "opacity.png",
                "source": "silver_linden/leaf_front/opacity.png",
                "sha256": "6a84bd7a89ff9e899f33eb8320a23141acef253c6091563c1640b320147eaafd",
                "bytes": 21997
            },
            {
                "file": "orm.png",
                "source": "silver_linden/leaf_front/orm.png",
                "sha256": "6ca5d6c2e1be726eaccaf16a89b9f11d3512039e6153553362ae9419dcda42be",
                "bytes": 361151
            },
            {
                "file": "roughness.png",
                "source": "silver_linden/leaf_front/roughness.png",
                "sha256": "d19341deb6fb6e475f9e497792cd4d98af11f32efe8e312f3323e4cfc840a819",
                "bytes": 139204
            },
            {
                "file": "translucency.png",
                "source": "silver_linden/leaf_front/translucency.png",
                "sha256": "07727925827d843db72bd05017f260fa357f089ff4e36156f664265eacfce187",
                "bytes": 316038
            }
        ]
    }
});
