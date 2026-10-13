// AI-generated botanical PBR; exact source hashes and scale assumptions are retained.
export default Object.freeze({
    "materialId": "pbr.tree_ai_american_elm_bark",
    "label": "American elm — bark",
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
        "baseColor": "assets/public/pbr/tree_ai_american_elm_bark/basecolor.png",
        "normal": "assets/public/pbr/tree_ai_american_elm_bark/normal_opengl.png",
        "orm": "assets/public/pbr/tree_ai_american_elm_bark/orm.png",
        "variants": {
            "ao": "assets/public/pbr/tree_ai_american_elm_bark/ao.png",
            "basecolor": "assets/public/pbr/tree_ai_american_elm_bark/basecolor.png",
            "height_16bit": "assets/public/pbr/tree_ai_american_elm_bark/height_16bit.png",
            "metallic": "assets/public/pbr/tree_ai_american_elm_bark/metallic.png",
            "normal_directx": "assets/public/pbr/tree_ai_american_elm_bark/normal_directx.png",
            "normal_opengl": "assets/public/pbr/tree_ai_american_elm_bark/normal_opengl.png",
            "orm": "assets/public/pbr/tree_ai_american_elm_bark/orm.png",
            "roughness": "assets/public/pbr/tree_ai_american_elm_bark/roughness.png"
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
            "asset": "American elm bark",
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
            "scale_m": 0.025,
            "bias_m": -0.0125,
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
                "source": "american_elm/bark/ao.png",
                "sha256": "48e3ed35535a95046518dd3123a35e04bc49838e1ca8f49c7c04bc81c5f47b7a",
                "bytes": 466141
            },
            {
                "file": "basecolor.png",
                "source": "american_elm/bark/basecolor.png",
                "sha256": "08678247295eea5e9e4c387786f8a4a675ba9f784a405f1a10b42623c5fa9f53",
                "bytes": 2376620
            },
            {
                "file": "height_16bit.png",
                "source": "american_elm/bark/height_16bit.png",
                "sha256": "fdd33e6ff0fdbdfef779f0ad83c5c818a0c888cea328fb2421bf95f54ed8cb43",
                "bytes": 1854129
            },
            {
                "file": "material.json",
                "source": "american_elm/bark/material.json",
                "sha256": "033ab541ee89c6d99eaa80ecd4109067eaee0a4e5f9782b42759b506b03e97ea",
                "bytes": 3149
            },
            {
                "file": "metallic.png",
                "source": "american_elm/bark/metallic.png",
                "sha256": "c8b6bb3e837f846489438b47ae42f3960b820a17095ea66df3c5fa00fcd60665",
                "bytes": 1097
            },
            {
                "file": "normal_directx.png",
                "source": "american_elm/bark/normal_directx.png",
                "sha256": "3139927c81ccadee1ae9e9b97780df464185c63c12178cb6e75448e061f261a7",
                "bytes": 2384730
            },
            {
                "file": "normal_opengl.png",
                "source": "american_elm/bark/normal_opengl.png",
                "sha256": "7c77fd454ed13059a8a10e94df0b4fcb1ef46ccfb7277ce20cc29b07f2934ee7",
                "bytes": 2384690
            },
            {
                "file": "orm.png",
                "source": "american_elm/bark/orm.png",
                "sha256": "a838bbec9f9761ded91e4594c09e27bcd07aee16ea67bd9710d77a93b0412b17",
                "bytes": 936210
            },
            {
                "file": "roughness.png",
                "source": "american_elm/bark/roughness.png",
                "sha256": "f4b3322a56b8369b7b5aa245bb6f5e93e7832566a3c9cab6788ee3684d6a3109",
                "bytes": 304622
            }
        ]
    }
});
