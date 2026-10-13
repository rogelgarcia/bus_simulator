// AI-generated botanical PBR; exact source hashes and scale assumptions are retained.
export default Object.freeze({
    "materialId": "pbr.tree_ai_london_plane_leaf_front",
    "label": "London plane — leaf front",
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
        "baseColor": "assets/public/pbr/tree_ai_london_plane_leaf_front/basecolor.png",
        "normal": "assets/public/pbr/tree_ai_london_plane_leaf_front/normal_opengl.png",
        "orm": "assets/public/pbr/tree_ai_london_plane_leaf_front/orm.png",
        "variants": {
            "ao": "assets/public/pbr/tree_ai_london_plane_leaf_front/ao.png",
            "basecolor": "assets/public/pbr/tree_ai_london_plane_leaf_front/basecolor.png",
            "height_16bit": "assets/public/pbr/tree_ai_london_plane_leaf_front/height_16bit.png",
            "metallic": "assets/public/pbr/tree_ai_london_plane_leaf_front/metallic.png",
            "normal_directx": "assets/public/pbr/tree_ai_london_plane_leaf_front/normal_directx.png",
            "normal_opengl": "assets/public/pbr/tree_ai_london_plane_leaf_front/normal_opengl.png",
            "opacity": "assets/public/pbr/tree_ai_london_plane_leaf_front/opacity.png",
            "orm": "assets/public/pbr/tree_ai_london_plane_leaf_front/orm.png",
            "roughness": "assets/public/pbr/tree_ai_london_plane_leaf_front/roughness.png",
            "translucency": "assets/public/pbr/tree_ai_london_plane_leaf_front/translucency.png"
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
            "asset": "London plane leaf_front",
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
        "role": "leaf_front",
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
                "source": "london_plane/leaf_front/ao.png",
                "sha256": "e93213fb75a13b89f6667161564d7e2bc5b048e5b25a70f865f24b1ff4b84c57",
                "bytes": 147708
            },
            {
                "file": "basecolor.png",
                "source": "london_plane/leaf_front/basecolor.png",
                "sha256": "53ee3575c37cfc035ea8634ab5ed930052b377d1fd8443969e879f3f246aef2c",
                "bytes": 1305140
            },
            {
                "file": "height_16bit.png",
                "source": "london_plane/leaf_front/height_16bit.png",
                "sha256": "f1988efdaa3f89830d1ea0054f496ae00a769a2ea4ae185c129774c7c44abf3d",
                "bytes": 692492
            },
            {
                "file": "material.json",
                "source": "london_plane/leaf_front/material.json",
                "sha256": "f8d73c75acb53325e0b47cd60c347ef1760948544ecdece12cbf047df676cf0f",
                "bytes": 4013
            },
            {
                "file": "metallic.png",
                "source": "london_plane/leaf_front/metallic.png",
                "sha256": "c8b6bb3e837f846489438b47ae42f3960b820a17095ea66df3c5fa00fcd60665",
                "bytes": 1097
            },
            {
                "file": "normal_directx.png",
                "source": "london_plane/leaf_front/normal_directx.png",
                "sha256": "3c125eba530091db25db7521e94da1f33bf73f2a34e3c9f4a6d9ad9e62b7f10e",
                "bytes": 468131
            },
            {
                "file": "normal_opengl.png",
                "source": "london_plane/leaf_front/normal_opengl.png",
                "sha256": "ffac4b8d3dbc39970f5aeada816c09f2b9a09f6f881ca50c8bdebc7f00bfbc29",
                "bytes": 468376
            },
            {
                "file": "opacity.png",
                "source": "london_plane/leaf_front/opacity.png",
                "sha256": "4d46402ce13bf5c9b3eee893276b1b491480493a4349c592505616f1f5620965",
                "bytes": 25127
            },
            {
                "file": "orm.png",
                "source": "london_plane/leaf_front/orm.png",
                "sha256": "e617638a7a2bb194a79269baf59567a0ebfcb89d90ec9cd6b779357737dc4554",
                "bytes": 297033
            },
            {
                "file": "roughness.png",
                "source": "london_plane/leaf_front/roughness.png",
                "sha256": "1c52177c858383bbef26dbac10c45bd7fddcb11eb2c3b8344ac03c87602671f7",
                "bytes": 113379
            },
            {
                "file": "translucency.png",
                "source": "london_plane/leaf_front/translucency.png",
                "sha256": "34500b1797b26b13ab7df31e855548d0b0bba11b62e86b8619be56ddfeacdfcb",
                "bytes": 283255
            }
        ]
    }
});
