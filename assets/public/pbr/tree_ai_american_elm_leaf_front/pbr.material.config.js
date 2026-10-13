// AI-generated botanical PBR; exact source hashes and scale assumptions are retained.
export default Object.freeze({
    "materialId": "pbr.tree_ai_american_elm_leaf_front",
    "label": "American elm — leaf front",
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
        "baseColor": "assets/public/pbr/tree_ai_american_elm_leaf_front/basecolor.png",
        "normal": "assets/public/pbr/tree_ai_american_elm_leaf_front/normal_opengl.png",
        "orm": "assets/public/pbr/tree_ai_american_elm_leaf_front/orm.png",
        "variants": {
            "ao": "assets/public/pbr/tree_ai_american_elm_leaf_front/ao.png",
            "basecolor": "assets/public/pbr/tree_ai_american_elm_leaf_front/basecolor.png",
            "height_16bit": "assets/public/pbr/tree_ai_american_elm_leaf_front/height_16bit.png",
            "metallic": "assets/public/pbr/tree_ai_american_elm_leaf_front/metallic.png",
            "normal_directx": "assets/public/pbr/tree_ai_american_elm_leaf_front/normal_directx.png",
            "normal_opengl": "assets/public/pbr/tree_ai_american_elm_leaf_front/normal_opengl.png",
            "opacity": "assets/public/pbr/tree_ai_american_elm_leaf_front/opacity.png",
            "orm": "assets/public/pbr/tree_ai_american_elm_leaf_front/orm.png",
            "roughness": "assets/public/pbr/tree_ai_american_elm_leaf_front/roughness.png",
            "translucency": "assets/public/pbr/tree_ai_american_elm_leaf_front/translucency.png"
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
            "asset": "American elm leaf_front",
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
        "role": "leaf_front",
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
                "source": "american_elm/leaf_front/ao.png",
                "sha256": "31cf9359cb541c6874e04fcd111fbbe689d50ec59ee890c113a730fe95f5865f",
                "bytes": 163392
            },
            {
                "file": "basecolor.png",
                "source": "american_elm/leaf_front/basecolor.png",
                "sha256": "a2b312b15c69aed24fb8824eb3b145b6561a5abd9d286340b3910f6a7c7f4eb1",
                "bytes": 1277809
            },
            {
                "file": "height_16bit.png",
                "source": "american_elm/leaf_front/height_16bit.png",
                "sha256": "d142c9b03320bbf271ed24d5f3095366724171294758af2606d4244f19a71320",
                "bytes": 712420
            },
            {
                "file": "material.json",
                "source": "american_elm/leaf_front/material.json",
                "sha256": "03990a858660b581a30458c28681c305cb726d267fa2982063955cb3e206af5f",
                "bytes": 4008
            },
            {
                "file": "metallic.png",
                "source": "american_elm/leaf_front/metallic.png",
                "sha256": "c8b6bb3e837f846489438b47ae42f3960b820a17095ea66df3c5fa00fcd60665",
                "bytes": 1097
            },
            {
                "file": "normal_directx.png",
                "source": "american_elm/leaf_front/normal_directx.png",
                "sha256": "52c5fba13ce505a14a194e71b26cfa8b1c50a29197f39c367a084400f9780145",
                "bytes": 631180
            },
            {
                "file": "normal_opengl.png",
                "source": "american_elm/leaf_front/normal_opengl.png",
                "sha256": "d805ec4c95ae1baab107e97d835bd8f1efdac9ba7156a14bccb049f3098986ea",
                "bytes": 631402
            },
            {
                "file": "opacity.png",
                "source": "american_elm/leaf_front/opacity.png",
                "sha256": "ba0f20cac9615590c08e33bf49074fefc4eec37485ec354b728f656e16530395",
                "bytes": 22764
            },
            {
                "file": "orm.png",
                "source": "american_elm/leaf_front/orm.png",
                "sha256": "cf8f298a388a4041e1b5ed777942c8741314f51f4627025c1dcfdb9103b53a6f",
                "bytes": 344111
            },
            {
                "file": "roughness.png",
                "source": "american_elm/leaf_front/roughness.png",
                "sha256": "3463ecbef22fa2f5c800931104e7db8d4100ef1ef8a40b10cc07b12d5a93eee9",
                "bytes": 132668
            },
            {
                "file": "translucency.png",
                "source": "american_elm/leaf_front/translucency.png",
                "sha256": "82755311391f4bd05540a9989544fd9e1ec30308c0acc0383b62d20f8af237ea",
                "bytes": 301262
            }
        ]
    }
});
