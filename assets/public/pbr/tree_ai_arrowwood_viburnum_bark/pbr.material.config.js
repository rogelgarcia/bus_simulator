// AI-generated botanical PBR; exact source hashes and scale assumptions are retained.
export default Object.freeze({
    "materialId": "pbr.tree_ai_arrowwood_viburnum_bark",
    "label": "Arrowwood viburnum — bark",
    "classId": "bark",
    "root": "surface",
    "buildingEligible": false,
    "groundEligible": false,
    "tileMeters": 0.25,
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
        "baseColor": "assets/public/pbr/tree_ai_arrowwood_viburnum_bark/basecolor.png",
        "normal": "assets/public/pbr/tree_ai_arrowwood_viburnum_bark/normal_opengl.png",
        "orm": "assets/public/pbr/tree_ai_arrowwood_viburnum_bark/orm.png",
        "variants": {
            "ao": "assets/public/pbr/tree_ai_arrowwood_viburnum_bark/ao.png",
            "basecolor": "assets/public/pbr/tree_ai_arrowwood_viburnum_bark/basecolor.png",
            "height_16bit": "assets/public/pbr/tree_ai_arrowwood_viburnum_bark/height_16bit.png",
            "metallic": "assets/public/pbr/tree_ai_arrowwood_viburnum_bark/metallic.png",
            "normal_directx": "assets/public/pbr/tree_ai_arrowwood_viburnum_bark/normal_directx.png",
            "normal_opengl": "assets/public/pbr/tree_ai_arrowwood_viburnum_bark/normal_opengl.png",
            "orm": "assets/public/pbr/tree_ai_arrowwood_viburnum_bark/orm.png",
            "roughness": "assets/public/pbr/tree_ai_arrowwood_viburnum_bark/roughness.png"
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
            "asset": "Arrowwood viburnum bark",
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
        "role": "bark",
        "physicalMeasurement": false,
        "physicalSize": {
            "width": 0.25,
            "height": 0.25,
            "basis": "artist-selected approximate scale; not measured"
        },
        "displacement": {
            "white_is_high": true,
            "midlevel": 0.5,
            "scale_m": 0.003,
            "bias_m": -0.0015,
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
                "source": "arrowwood_viburnum/bark/ao.png",
                "sha256": "ec74eb6853cc96b8f853718ab0d20396b7ebecd96b899acf960bfadec2c18f81",
                "bytes": 469101
            },
            {
                "file": "basecolor.png",
                "source": "arrowwood_viburnum/bark/basecolor.png",
                "sha256": "e387350adcb422d10fe49c110ba0433c4d753b0d5409f5497686fec798dc6d34",
                "bytes": 2401574
            },
            {
                "file": "height_16bit.png",
                "source": "arrowwood_viburnum/bark/height_16bit.png",
                "sha256": "c1a225f6196e872dc780e3721cf5c599855d6e9aab174cc897ed5e7621579f75",
                "bytes": 1848461
            },
            {
                "file": "material.json",
                "source": "arrowwood_viburnum/bark/material.json",
                "sha256": "87d5ce911cb4271f276c51f5310c02162334bbd61360f1847e6ae355f0b2fe21",
                "bytes": 3165
            },
            {
                "file": "metallic.png",
                "source": "arrowwood_viburnum/bark/metallic.png",
                "sha256": "c8b6bb3e837f846489438b47ae42f3960b820a17095ea66df3c5fa00fcd60665",
                "bytes": 1097
            },
            {
                "file": "normal_directx.png",
                "source": "arrowwood_viburnum/bark/normal_directx.png",
                "sha256": "2df918cde8dca543be95edbd304ad232daa99b87eef7c08fce9db94071cfa020",
                "bytes": 1984959
            },
            {
                "file": "normal_opengl.png",
                "source": "arrowwood_viburnum/bark/normal_opengl.png",
                "sha256": "01eb92296b83f210c55bab536d1a40cb3971184eccbcc39149daa72776779020",
                "bytes": 1985036
            },
            {
                "file": "orm.png",
                "source": "arrowwood_viburnum/bark/orm.png",
                "sha256": "5a56fbd24dccf3fd50a66e9dc54da2f180d3bebe20fdf7258420659743a7ad7d",
                "bytes": 939303
            },
            {
                "file": "roughness.png",
                "source": "arrowwood_viburnum/bark/roughness.png",
                "sha256": "323914db078b9b3ccdc17a7cce09f3052add5bfd5cb9c028009a1f4ea32d555b",
                "bytes": 306159
            }
        ]
    }
});
