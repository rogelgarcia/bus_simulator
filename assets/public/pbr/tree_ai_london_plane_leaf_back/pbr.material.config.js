// AI-generated botanical PBR; exact source hashes and scale assumptions are retained.
export default Object.freeze({
    "materialId": "pbr.tree_ai_london_plane_leaf_back",
    "label": "London plane — leaf back",
    "classId": "foliage",
    "root": "surface",
    "buildingEligible": false,
    "groundEligible": false,
    "tileMeters": 0.2510316649642492,
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
        "baseColor": "assets/public/pbr/tree_ai_london_plane_leaf_back/basecolor.png",
        "normal": "assets/public/pbr/tree_ai_london_plane_leaf_back/normal_opengl.png",
        "orm": "assets/public/pbr/tree_ai_london_plane_leaf_back/orm.png",
        "variants": {
            "ao": "assets/public/pbr/tree_ai_london_plane_leaf_back/ao.png",
            "basecolor": "assets/public/pbr/tree_ai_london_plane_leaf_back/basecolor.png",
            "height_16bit": "assets/public/pbr/tree_ai_london_plane_leaf_back/height_16bit.png",
            "metallic": "assets/public/pbr/tree_ai_london_plane_leaf_back/metallic.png",
            "normal_directx": "assets/public/pbr/tree_ai_london_plane_leaf_back/normal_directx.png",
            "normal_opengl": "assets/public/pbr/tree_ai_london_plane_leaf_back/normal_opengl.png",
            "opacity": "assets/public/pbr/tree_ai_london_plane_leaf_back/opacity.png",
            "orm": "assets/public/pbr/tree_ai_london_plane_leaf_back/orm.png",
            "roughness": "assets/public/pbr/tree_ai_london_plane_leaf_back/roughness.png",
            "translucency": "assets/public/pbr/tree_ai_london_plane_leaf_back/translucency.png"
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
            "asset": "London plane leaf_back",
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
        "species": "Platanus × acerifolia",
        "role": "leaf_back",
        "physicalMeasurement": false,
        "physicalSize": {
            "width": 0.2510316649642492,
            "height": 0.2510316649642492,
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
                66,
                25,
                961,
                1004
            ],
            "front_back_share_identical_opacity": true,
            "back_is_uv_registered_not_mirrored": true,
            "alignment": "common silhouette intersection; source vein alignment is approximate",
            "original_front_back_silhouette_iou": 0.9799663839583309
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
                "source": "london_plane/leaf_back/ao.png",
                "sha256": "66334103d0c61e91624ff8afeacad70f893405c34b1f0dc0196a01b0aebf0441",
                "bytes": 177211
            },
            {
                "file": "basecolor.png",
                "source": "london_plane/leaf_back/basecolor.png",
                "sha256": "a7663a41b684b0d3ea81194b8eb27a81aff4bed1a61db308ff61befe57974829",
                "bytes": 1292191
            },
            {
                "file": "height_16bit.png",
                "source": "london_plane/leaf_back/height_16bit.png",
                "sha256": "b23ad7c67c5e3bb6ee4a96fac8c6a264a0effc6ca054563c858257de7f680b89",
                "bytes": 721689
            },
            {
                "file": "material.json",
                "source": "london_plane/leaf_back/material.json",
                "sha256": "ff684ec6dad03d06bb7bc3d536833c149305ead4696576c49087b7d2ab74eaa2",
                "bytes": 4015
            },
            {
                "file": "metallic.png",
                "source": "london_plane/leaf_back/metallic.png",
                "sha256": "c8b6bb3e837f846489438b47ae42f3960b820a17095ea66df3c5fa00fcd60665",
                "bytes": 1097
            },
            {
                "file": "normal_directx.png",
                "source": "london_plane/leaf_back/normal_directx.png",
                "sha256": "f3114a4422cb5dd11065c7f8a8cabac6e50a3b3275fa92350ff703c2d078172a",
                "bytes": 585480
            },
            {
                "file": "normal_opengl.png",
                "source": "london_plane/leaf_back/normal_opengl.png",
                "sha256": "faeb270e31fb55c09c411685e1045d71d0f86bad3e5f32a1af83b0ba611d7e2a",
                "bytes": 585800
            },
            {
                "file": "opacity.png",
                "source": "london_plane/leaf_back/opacity.png",
                "sha256": "4d46402ce13bf5c9b3eee893276b1b491480493a4349c592505616f1f5620965",
                "bytes": 25127
            },
            {
                "file": "orm.png",
                "source": "london_plane/leaf_back/orm.png",
                "sha256": "fe945917263c85d4ed02df7750cbac54a12eba1c0ca6b903c5bdf8a2dc534403",
                "bytes": 384458
            },
            {
                "file": "roughness.png",
                "source": "london_plane/leaf_back/roughness.png",
                "sha256": "74aa212cd0819241352a663b31dc8868c92c8d84a204cf0cb8036ae731e80034",
                "bytes": 151044
            },
            {
                "file": "translucency.png",
                "source": "london_plane/leaf_back/translucency.png",
                "sha256": "34500b1797b26b13ab7df31e855548d0b0bba11b62e86b8619be56ddfeacdfcb",
                "bytes": 283255
            }
        ]
    }
});
