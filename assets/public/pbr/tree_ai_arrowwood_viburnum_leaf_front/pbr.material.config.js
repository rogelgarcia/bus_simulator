// AI-generated botanical PBR; exact source hashes and scale assumptions are retained.
export default Object.freeze({
    "materialId": "pbr.tree_ai_arrowwood_viburnum_leaf_front",
    "label": "Arrowwood viburnum — leaf front",
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
        "baseColor": "assets/public/pbr/tree_ai_arrowwood_viburnum_leaf_front/basecolor.png",
        "normal": "assets/public/pbr/tree_ai_arrowwood_viburnum_leaf_front/normal_opengl.png",
        "orm": "assets/public/pbr/tree_ai_arrowwood_viburnum_leaf_front/orm.png",
        "variants": {
            "ao": "assets/public/pbr/tree_ai_arrowwood_viburnum_leaf_front/ao.png",
            "basecolor": "assets/public/pbr/tree_ai_arrowwood_viburnum_leaf_front/basecolor.png",
            "height_16bit": "assets/public/pbr/tree_ai_arrowwood_viburnum_leaf_front/height_16bit.png",
            "metallic": "assets/public/pbr/tree_ai_arrowwood_viburnum_leaf_front/metallic.png",
            "normal_directx": "assets/public/pbr/tree_ai_arrowwood_viburnum_leaf_front/normal_directx.png",
            "normal_opengl": "assets/public/pbr/tree_ai_arrowwood_viburnum_leaf_front/normal_opengl.png",
            "opacity": "assets/public/pbr/tree_ai_arrowwood_viburnum_leaf_front/opacity.png",
            "orm": "assets/public/pbr/tree_ai_arrowwood_viburnum_leaf_front/orm.png",
            "roughness": "assets/public/pbr/tree_ai_arrowwood_viburnum_leaf_front/roughness.png",
            "translucency": "assets/public/pbr/tree_ai_arrowwood_viburnum_leaf_front/translucency.png"
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
            "asset": "Arrowwood viburnum leaf_front",
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
        "role": "leaf_front",
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
                "source": "arrowwood_viburnum/leaf_front/ao.png",
                "sha256": "3a62daca110b3a34a77e1e148cd8719ef845d61c4ed6a50c3eeda134ea5d5ce5",
                "bytes": 166097
            },
            {
                "file": "basecolor.png",
                "source": "arrowwood_viburnum/leaf_front/basecolor.png",
                "sha256": "aa311c0ca0ba909ae592bed1fddb1f4d10bb01341d034c6d75a0e2409a3a7f5f",
                "bytes": 1393622
            },
            {
                "file": "height_16bit.png",
                "source": "arrowwood_viburnum/leaf_front/height_16bit.png",
                "sha256": "049435924b750871e6dd61c4000cbd0f0ebc86d15942669efe06a9d56370e8dc",
                "bytes": 759701
            },
            {
                "file": "material.json",
                "source": "arrowwood_viburnum/leaf_front/material.json",
                "sha256": "e40dc017f35b0cbe0d3b60ee284d150fe772b888eb39cbc6c38c5c12ccc0694c",
                "bytes": 4021
            },
            {
                "file": "metallic.png",
                "source": "arrowwood_viburnum/leaf_front/metallic.png",
                "sha256": "c8b6bb3e837f846489438b47ae42f3960b820a17095ea66df3c5fa00fcd60665",
                "bytes": 1097
            },
            {
                "file": "normal_directx.png",
                "source": "arrowwood_viburnum/leaf_front/normal_directx.png",
                "sha256": "1833843f04b8290259db38b59f22eb8848ee694730e73ed1d99574feb1004183",
                "bytes": 685115
            },
            {
                "file": "normal_opengl.png",
                "source": "arrowwood_viburnum/leaf_front/normal_opengl.png",
                "sha256": "42fe87d8911e08245b4dd4cbba46fda1a02b2e88f9d0d7281f49903bcb8d17cd",
                "bytes": 685387
            },
            {
                "file": "opacity.png",
                "source": "arrowwood_viburnum/leaf_front/opacity.png",
                "sha256": "8ba296d7bc72ee17788a30b709e31b0dd3497ee04cd96d53f01efa8357dfc585",
                "bytes": 19943
            },
            {
                "file": "orm.png",
                "source": "arrowwood_viburnum/leaf_front/orm.png",
                "sha256": "f22523c75762767b17c4294e72a3bc551cd5ee8c05bb745f17072e5249b9f32d",
                "bytes": 351579
            },
            {
                "file": "roughness.png",
                "source": "arrowwood_viburnum/leaf_front/roughness.png",
                "sha256": "7d947a8494bec4d59c41cbebd97bad82bb9bd15b0e05e508a29c44609cd9ae25",
                "bytes": 137466
            },
            {
                "file": "translucency.png",
                "source": "arrowwood_viburnum/leaf_front/translucency.png",
                "sha256": "058356104f6f30cc62a1de7a3e81110923392b4d4976a455597607aa313c8c11",
                "bytes": 314423
            }
        ]
    }
});
