// AI-generated botanical PBR; exact source hashes and scale assumptions are retained.
export default Object.freeze({
    "materialId": "pbr.tree_ai_american_elm_leaf_back",
    "label": "American elm — leaf back",
    "classId": "foliage",
    "root": "surface",
    "buildingEligible": false,
    "groundEligible": false,
    "tileMeters": 0.14364729458917838,
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
        "baseColor": "assets/public/pbr/tree_ai_american_elm_leaf_back/basecolor.png",
        "normal": "assets/public/pbr/tree_ai_american_elm_leaf_back/normal_opengl.png",
        "orm": "assets/public/pbr/tree_ai_american_elm_leaf_back/orm.png",
        "variants": {
            "ao": "assets/public/pbr/tree_ai_american_elm_leaf_back/ao.png",
            "basecolor": "assets/public/pbr/tree_ai_american_elm_leaf_back/basecolor.png",
            "height_16bit": "assets/public/pbr/tree_ai_american_elm_leaf_back/height_16bit.png",
            "metallic": "assets/public/pbr/tree_ai_american_elm_leaf_back/metallic.png",
            "normal_directx": "assets/public/pbr/tree_ai_american_elm_leaf_back/normal_directx.png",
            "normal_opengl": "assets/public/pbr/tree_ai_american_elm_leaf_back/normal_opengl.png",
            "opacity": "assets/public/pbr/tree_ai_american_elm_leaf_back/opacity.png",
            "orm": "assets/public/pbr/tree_ai_american_elm_leaf_back/orm.png",
            "roughness": "assets/public/pbr/tree_ai_american_elm_leaf_back/roughness.png",
            "translucency": "assets/public/pbr/tree_ai_american_elm_leaf_back/translucency.png"
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
            "asset": "American elm leaf_back",
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
        "species": "Ulmus americana",
        "role": "leaf_back",
        "physicalMeasurement": false,
        "physicalSize": {
            "width": 0.14364729458917838,
            "height": 0.14364729458917838,
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
                232,
                14,
                853,
                1012
            ],
            "front_back_share_identical_opacity": true,
            "back_is_uv_registered_not_mirrored": true,
            "alignment": "common silhouette intersection; source vein alignment is approximate",
            "original_front_back_silhouette_iou": 0.984816444978628
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
                "source": "american_elm/leaf_back/ao.png",
                "sha256": "cf69cd6a0d720de59daae1df13e190943f66cf47d7087418cbec6955bf6ca18f",
                "bytes": 193874
            },
            {
                "file": "basecolor.png",
                "source": "american_elm/leaf_back/basecolor.png",
                "sha256": "868857b657eff841851bc906b9a915bda12bb078725a49acbf68192924eceac3",
                "bytes": 1280219
            },
            {
                "file": "height_16bit.png",
                "source": "american_elm/leaf_back/height_16bit.png",
                "sha256": "b09cd39a1edf199865a79148e66a772635ae8b2767f31f361df089838a0953fb",
                "bytes": 739350
            },
            {
                "file": "material.json",
                "source": "american_elm/leaf_back/material.json",
                "sha256": "36f8ca17c8765014161b024f064d37332aa50fdbcadb35d49307b23efa9c0a95",
                "bytes": 4010
            },
            {
                "file": "metallic.png",
                "source": "american_elm/leaf_back/metallic.png",
                "sha256": "c8b6bb3e837f846489438b47ae42f3960b820a17095ea66df3c5fa00fcd60665",
                "bytes": 1097
            },
            {
                "file": "normal_directx.png",
                "source": "american_elm/leaf_back/normal_directx.png",
                "sha256": "6aab22c263f4aca7ab1e159adba20640ec68d58015033a513a2250f5a0cfb4d4",
                "bytes": 759809
            },
            {
                "file": "normal_opengl.png",
                "source": "american_elm/leaf_back/normal_opengl.png",
                "sha256": "2e9a3fd04c9e06b2f34daa8ba9d9fd3bdbfa44581cd1916d3ca6d8288aa889c5",
                "bytes": 760216
            },
            {
                "file": "opacity.png",
                "source": "american_elm/leaf_back/opacity.png",
                "sha256": "ba0f20cac9615590c08e33bf49074fefc4eec37485ec354b728f656e16530395",
                "bytes": 22764
            },
            {
                "file": "orm.png",
                "source": "american_elm/leaf_back/orm.png",
                "sha256": "5c189a1863ab7b42d1f56037c1ce406cf6e1c3259ab20368e7c28f37ad68bc01",
                "bytes": 430583
            },
            {
                "file": "roughness.png",
                "source": "american_elm/leaf_back/roughness.png",
                "sha256": "c45f90354d2202827727cb1c6f6fa819ed9a9e467272dbaba5e194084db82f21",
                "bytes": 163995
            },
            {
                "file": "translucency.png",
                "source": "american_elm/leaf_back/translucency.png",
                "sha256": "82755311391f4bd05540a9989544fd9e1ec30308c0acc0383b62d20f8af237ea",
                "bytes": 301262
            }
        ]
    }
});
