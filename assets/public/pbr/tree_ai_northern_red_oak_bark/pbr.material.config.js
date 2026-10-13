// AI-generated botanical PBR; exact source hashes and scale assumptions are retained.
export default Object.freeze({
    "materialId": "pbr.tree_ai_northern_red_oak_bark",
    "label": "Northern red oak — bark",
    "classId": "bark",
    "root": "surface",
    "buildingEligible": false,
    "groundEligible": false,
    "tileMeters": 0.7,
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
        "baseColor": "assets/public/pbr/tree_ai_northern_red_oak_bark/basecolor.png",
        "normal": "assets/public/pbr/tree_ai_northern_red_oak_bark/normal_opengl.png",
        "orm": "assets/public/pbr/tree_ai_northern_red_oak_bark/orm.png",
        "variants": {
            "ao": "assets/public/pbr/tree_ai_northern_red_oak_bark/ao.png",
            "basecolor": "assets/public/pbr/tree_ai_northern_red_oak_bark/basecolor.png",
            "height_16bit": "assets/public/pbr/tree_ai_northern_red_oak_bark/height_16bit.png",
            "metallic": "assets/public/pbr/tree_ai_northern_red_oak_bark/metallic.png",
            "normal_directx": "assets/public/pbr/tree_ai_northern_red_oak_bark/normal_directx.png",
            "normal_opengl": "assets/public/pbr/tree_ai_northern_red_oak_bark/normal_opengl.png",
            "orm": "assets/public/pbr/tree_ai_northern_red_oak_bark/orm.png",
            "roughness": "assets/public/pbr/tree_ai_northern_red_oak_bark/roughness.png"
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
            "asset": "Northern red oak bark",
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
        "role": "bark",
        "physicalMeasurement": false,
        "physicalSize": {
            "width": 0.7,
            "height": 0.7,
            "basis": "artist-selected approximate scale; not measured"
        },
        "displacement": {
            "white_is_high": true,
            "midlevel": 0.5,
            "scale_m": 0.022,
            "bias_m": -0.011,
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
                "source": "northern_red_oak/bark/ao.png",
                "sha256": "4749d1048dd4c86c1e86094a222496810b15ae027b033f140ca69a7e8b66616b",
                "bytes": 424154
            },
            {
                "file": "basecolor.png",
                "source": "northern_red_oak/bark/basecolor.png",
                "sha256": "89baa37a79863d7a400c2440a960947bf0ed6e2546e043d5ff7de2cfc7ca6913",
                "bytes": 2257553
            },
            {
                "file": "height_16bit.png",
                "source": "northern_red_oak/bark/height_16bit.png",
                "sha256": "9a472eed8b612df47493c8314d71debbc64dab9bc4c441b965522bca9447be3c",
                "bytes": 1818070
            },
            {
                "file": "material.json",
                "source": "northern_red_oak/bark/material.json",
                "sha256": "198e83c7ee9989c3f43e6f13e2f2b32f15245c64353872ec016dac2fc93c08d7",
                "bytes": 3154
            },
            {
                "file": "metallic.png",
                "source": "northern_red_oak/bark/metallic.png",
                "sha256": "c8b6bb3e837f846489438b47ae42f3960b820a17095ea66df3c5fa00fcd60665",
                "bytes": 1097
            },
            {
                "file": "normal_directx.png",
                "source": "northern_red_oak/bark/normal_directx.png",
                "sha256": "374b40c52f724d2d5198ea181e1d7df8116db9286bb7d2923593f35809aa2ab9",
                "bytes": 2228179
            },
            {
                "file": "normal_opengl.png",
                "source": "northern_red_oak/bark/normal_opengl.png",
                "sha256": "e2a7e1a19c4d780fbb4d7de5d5d56d081c6e56e3a6e11a8b184738fc12087636",
                "bytes": 2228254
            },
            {
                "file": "orm.png",
                "source": "northern_red_oak/bark/orm.png",
                "sha256": "d8d4637a3363778e26e7225b7443f13142b0926935acfdffc0bdf0f703842218",
                "bytes": 849396
            },
            {
                "file": "roughness.png",
                "source": "northern_red_oak/bark/roughness.png",
                "sha256": "6d40b2b941dc2c3b111e296aa1783e15d74ac68956f3bad0277f7c53166a54c7",
                "bytes": 275070
            }
        ]
    }
});
