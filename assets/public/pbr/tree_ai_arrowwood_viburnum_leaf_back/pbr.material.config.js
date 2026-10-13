// AI-generated botanical PBR; exact source hashes and scale assumptions are retained.
export default Object.freeze({
    "materialId": "pbr.tree_ai_arrowwood_viburnum_leaf_back",
    "label": "Arrowwood viburnum — leaf back",
    "classId": "foliage",
    "root": "surface",
    "buildingEligible": false,
    "groundEligible": false,
    "tileMeters": 0.1248780487804878,
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
        "baseColor": "assets/public/pbr/tree_ai_arrowwood_viburnum_leaf_back/basecolor.png",
        "normal": "assets/public/pbr/tree_ai_arrowwood_viburnum_leaf_back/normal_opengl.png",
        "orm": "assets/public/pbr/tree_ai_arrowwood_viburnum_leaf_back/orm.png",
        "variants": {
            "ao": "assets/public/pbr/tree_ai_arrowwood_viburnum_leaf_back/ao.png",
            "basecolor": "assets/public/pbr/tree_ai_arrowwood_viburnum_leaf_back/basecolor.png",
            "height_16bit": "assets/public/pbr/tree_ai_arrowwood_viburnum_leaf_back/height_16bit.png",
            "metallic": "assets/public/pbr/tree_ai_arrowwood_viburnum_leaf_back/metallic.png",
            "normal_directx": "assets/public/pbr/tree_ai_arrowwood_viburnum_leaf_back/normal_directx.png",
            "normal_opengl": "assets/public/pbr/tree_ai_arrowwood_viburnum_leaf_back/normal_opengl.png",
            "opacity": "assets/public/pbr/tree_ai_arrowwood_viburnum_leaf_back/opacity.png",
            "orm": "assets/public/pbr/tree_ai_arrowwood_viburnum_leaf_back/orm.png",
            "roughness": "assets/public/pbr/tree_ai_arrowwood_viburnum_leaf_back/roughness.png",
            "translucency": "assets/public/pbr/tree_ai_arrowwood_viburnum_leaf_back/translucency.png"
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
            "asset": "Arrowwood viburnum leaf_back",
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
        "species": "Viburnum dentatum",
        "role": "leaf_back",
        "physicalMeasurement": false,
        "physicalSize": {
            "width": 0.1248780487804878,
            "height": 0.1248780487804878,
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
                183,
                24,
                844,
                1008
            ],
            "front_back_share_identical_opacity": true,
            "back_is_uv_registered_not_mirrored": true,
            "alignment": "common silhouette intersection; source vein alignment is approximate",
            "original_front_back_silhouette_iou": 0.9917069950917674
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
                "source": "arrowwood_viburnum/leaf_back/ao.png",
                "sha256": "37e1a57b92a7778d6880fe275a93f0bafe9dbd6f24367f0633d87f7ce8e9122b",
                "bytes": 198618
            },
            {
                "file": "basecolor.png",
                "source": "arrowwood_viburnum/leaf_back/basecolor.png",
                "sha256": "fee3d9d2993c1413e6e92a356949f0d438dc9692c79f7eef9086b77d935e88a0",
                "bytes": 1337518
            },
            {
                "file": "height_16bit.png",
                "source": "arrowwood_viburnum/leaf_back/height_16bit.png",
                "sha256": "1483e447a9b974569ebdb68c4f0422d3490a6476934c0102aad5f772ca275f8d",
                "bytes": 789368
            },
            {
                "file": "material.json",
                "source": "arrowwood_viburnum/leaf_back/material.json",
                "sha256": "56a63b62e8cf1e3433a2820144e819af38cdc97ac477bfd2cc4773d12ed0b33e",
                "bytes": 4023
            },
            {
                "file": "metallic.png",
                "source": "arrowwood_viburnum/leaf_back/metallic.png",
                "sha256": "c8b6bb3e837f846489438b47ae42f3960b820a17095ea66df3c5fa00fcd60665",
                "bytes": 1097
            },
            {
                "file": "normal_directx.png",
                "source": "arrowwood_viburnum/leaf_back/normal_directx.png",
                "sha256": "63036d88d1402209a2a1d41d497b94962de3b42af3ad449f91a3a7dd3fb4b0f8",
                "bytes": 825448
            },
            {
                "file": "normal_opengl.png",
                "source": "arrowwood_viburnum/leaf_back/normal_opengl.png",
                "sha256": "bcdf24c4c756ce7cd8269e4172d1cdd7db503ae025cb066f0c74e2f5fcc519e2",
                "bytes": 825773
            },
            {
                "file": "opacity.png",
                "source": "arrowwood_viburnum/leaf_back/opacity.png",
                "sha256": "8ba296d7bc72ee17788a30b709e31b0dd3497ee04cd96d53f01efa8357dfc585",
                "bytes": 19943
            },
            {
                "file": "orm.png",
                "source": "arrowwood_viburnum/leaf_back/orm.png",
                "sha256": "2b1fd9e576247f6aecb443d13791fbe3b4ebee92fad11ac9924522c935c1357e",
                "bytes": 441070
            },
            {
                "file": "roughness.png",
                "source": "arrowwood_viburnum/leaf_back/roughness.png",
                "sha256": "09aa588db625aaf3437a3fea26e61ac48e4e6c447c23dac7b173bb73c132bd0a",
                "bytes": 170019
            },
            {
                "file": "translucency.png",
                "source": "arrowwood_viburnum/leaf_back/translucency.png",
                "sha256": "058356104f6f30cc62a1de7a3e81110923392b4d4976a455597607aa313c8c11",
                "bytes": 314423
            }
        ]
    }
});
