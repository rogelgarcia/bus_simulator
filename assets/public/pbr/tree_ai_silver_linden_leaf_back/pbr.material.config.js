// AI-generated botanical PBR; exact source hashes and scale assumptions are retained.
export default Object.freeze({
    "materialId": "pbr.tree_ai_silver_linden_leaf_back",
    "label": "Silver linden — leaf back",
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
        "baseColor": "assets/public/pbr/tree_ai_silver_linden_leaf_back/basecolor.png",
        "normal": "assets/public/pbr/tree_ai_silver_linden_leaf_back/normal_opengl.png",
        "orm": "assets/public/pbr/tree_ai_silver_linden_leaf_back/orm.png",
        "variants": {
            "ao": "assets/public/pbr/tree_ai_silver_linden_leaf_back/ao.png",
            "basecolor": "assets/public/pbr/tree_ai_silver_linden_leaf_back/basecolor.png",
            "height_16bit": "assets/public/pbr/tree_ai_silver_linden_leaf_back/height_16bit.png",
            "metallic": "assets/public/pbr/tree_ai_silver_linden_leaf_back/metallic.png",
            "normal_directx": "assets/public/pbr/tree_ai_silver_linden_leaf_back/normal_directx.png",
            "normal_opengl": "assets/public/pbr/tree_ai_silver_linden_leaf_back/normal_opengl.png",
            "opacity": "assets/public/pbr/tree_ai_silver_linden_leaf_back/opacity.png",
            "orm": "assets/public/pbr/tree_ai_silver_linden_leaf_back/orm.png",
            "roughness": "assets/public/pbr/tree_ai_silver_linden_leaf_back/roughness.png",
            "translucency": "assets/public/pbr/tree_ai_silver_linden_leaf_back/translucency.png"
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
            "asset": "Silver linden leaf_back",
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
        "role": "leaf_back",
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
                "source": "silver_linden/leaf_back/ao.png",
                "sha256": "eee975c18d6dc3f274a968f376e37ae8f8881fa121d6e2b9662642d6d6120478",
                "bytes": 203893
            },
            {
                "file": "basecolor.png",
                "source": "silver_linden/leaf_back/basecolor.png",
                "sha256": "e9f76200699e2f757c06b9b75de71d6b8767a7cb045761a0d194eae92c7d88e8",
                "bytes": 1353570
            },
            {
                "file": "height_16bit.png",
                "source": "silver_linden/leaf_back/height_16bit.png",
                "sha256": "1a54315e7ae966fb2bdc5e8282548a3a9f9f1832f7d564df5f8172c218f7bae4",
                "bytes": 774466
            },
            {
                "file": "material.json",
                "source": "silver_linden/leaf_back/material.json",
                "sha256": "ef2f956d46668951d4c0b7d82a495ecf09c031a7ad031419d4eea7598d1b7413",
                "bytes": 4013
            },
            {
                "file": "metallic.png",
                "source": "silver_linden/leaf_back/metallic.png",
                "sha256": "c8b6bb3e837f846489438b47ae42f3960b820a17095ea66df3c5fa00fcd60665",
                "bytes": 1097
            },
            {
                "file": "normal_directx.png",
                "source": "silver_linden/leaf_back/normal_directx.png",
                "sha256": "24c7d2dce3a890de81cb61e5594e5180778aefeef825197bfb2c8843744158c1",
                "bytes": 782900
            },
            {
                "file": "normal_opengl.png",
                "source": "silver_linden/leaf_back/normal_opengl.png",
                "sha256": "4fffb9ef07593ca820dc61b3f97e3e873dbbe4d0e346e941e947a0baaa522e1f",
                "bytes": 783054
            },
            {
                "file": "opacity.png",
                "source": "silver_linden/leaf_back/opacity.png",
                "sha256": "6a84bd7a89ff9e899f33eb8320a23141acef253c6091563c1640b320147eaafd",
                "bytes": 21997
            },
            {
                "file": "orm.png",
                "source": "silver_linden/leaf_back/orm.png",
                "sha256": "e37c0c292644ca80eef1d5aa3f77ee4d9bd0b258ac1db70d67b93224bd7bdd9a",
                "bytes": 450401
            },
            {
                "file": "roughness.png",
                "source": "silver_linden/leaf_back/roughness.png",
                "sha256": "bc8485d7bf5d18f4d3b0ce5d22cce4ee85e16aacf8042444b3afacf06d1eb05c",
                "bytes": 169612
            },
            {
                "file": "translucency.png",
                "source": "silver_linden/leaf_back/translucency.png",
                "sha256": "07727925827d843db72bd05017f260fa357f089ff4e36156f664265eacfce187",
                "bytes": 316038
            }
        ]
    }
});
