// AI-generated botanical PBR; exact source hashes and scale assumptions are retained.
export default Object.freeze({
    "materialId": "pbr.tree_ai_silver_linden_bark",
    "label": "Silver linden — bark",
    "classId": "bark",
    "root": "surface",
    "buildingEligible": false,
    "groundEligible": false,
    "tileMeters": 0.6,
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
    "auxiliaryMapFiles": {},
    "allMapFiles": {
        "baseColor": "assets/public/pbr/tree_ai_silver_linden_bark/basecolor.png",
        "normal": "assets/public/pbr/tree_ai_silver_linden_bark/normal_opengl.png",
        "orm": "assets/public/pbr/tree_ai_silver_linden_bark/orm.png",
        "variants": {
            "ao": "assets/public/pbr/tree_ai_silver_linden_bark/ao.png",
            "basecolor": "assets/public/pbr/tree_ai_silver_linden_bark/basecolor.png",
            "height_16bit": "assets/public/pbr/tree_ai_silver_linden_bark/height_16bit.png",
            "metallic": "assets/public/pbr/tree_ai_silver_linden_bark/metallic.png",
            "normal_directx": "assets/public/pbr/tree_ai_silver_linden_bark/normal_directx.png",
            "normal_opengl": "assets/public/pbr/tree_ai_silver_linden_bark/normal_opengl.png",
            "orm": "assets/public/pbr/tree_ai_silver_linden_bark/orm.png",
            "roughness": "assets/public/pbr/tree_ai_silver_linden_bark/roughness.png"
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
            "asset": "Silver linden bark",
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
        "role": "bark",
        "physicalMeasurement": false,
        "physicalSize": {
            "width": 0.6,
            "height": 0.6,
            "basis": "artist-selected approximate scale; not measured"
        },
        "displacement": {
            "white_is_high": true,
            "midlevel": 0.5,
            "scale_m": 0.014,
            "bias_m": -0.007,
            "leaf_displacement_recommended": null
        },
        "leafUv": null,
        "recommendedMaterial": {
            "metallic": 0,
            "roughness_multiplier": 1,
            "alpha_mode": "OPAQUE",
            "alpha_cutoff": null,
            "two_sided": false
        },
        "sourceFiles": [
            {
                "file": "ao.png",
                "source": "silver_linden/bark/ao.png",
                "sha256": "a838537f103bb04fcdd8f74e911dd733f5e44575b8bd7f5e86df856df95a30cc",
                "bytes": 434018
            },
            {
                "file": "basecolor.png",
                "source": "silver_linden/bark/basecolor.png",
                "sha256": "5178c2fb3f9a31bb0968946332fafaa8d8457914479d41cbb4652883c0b5f1b8",
                "bytes": 2331612
            },
            {
                "file": "height_16bit.png",
                "source": "silver_linden/bark/height_16bit.png",
                "sha256": "df4e6351e07ad32cf8cafd0d5b708e75ee6ee2ddd8bbdccc21c90f4d12242575",
                "bytes": 1831512
            },
            {
                "file": "material.json",
                "source": "silver_linden/bark/material.json",
                "sha256": "8349e185f3699d25a58ae0ac46341e9dec64bbb6b38470ef953e454fd03000f2",
                "bytes": 3150
            },
            {
                "file": "metallic.png",
                "source": "silver_linden/bark/metallic.png",
                "sha256": "c8b6bb3e837f846489438b47ae42f3960b820a17095ea66df3c5fa00fcd60665",
                "bytes": 1097
            },
            {
                "file": "normal_directx.png",
                "source": "silver_linden/bark/normal_directx.png",
                "sha256": "3baf31eaabff323ffc22e39f74a33ef79516ddb12ed75d6c8679d197f83b295f",
                "bytes": 2158976
            },
            {
                "file": "normal_opengl.png",
                "source": "silver_linden/bark/normal_opengl.png",
                "sha256": "6112e6e8b5fc3b95e7a4b15feb74b75020b84c2e3adaf71bc450f593a0117f8f",
                "bytes": 2159149
            },
            {
                "file": "orm.png",
                "source": "silver_linden/bark/orm.png",
                "sha256": "4f49a485bbc912536bb983ce3741926ccee107576acf1e3509138dc095037fb5",
                "bytes": 871923
            },
            {
                "file": "roughness.png",
                "source": "silver_linden/bark/roughness.png",
                "sha256": "0f4239b85f1815af6e26a205a29bd11218f2398b80ee29ea73e054f437ea462d",
                "bytes": 285149
            }
        ]
    }
});
