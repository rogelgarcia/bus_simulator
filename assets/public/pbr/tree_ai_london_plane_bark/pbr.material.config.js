// AI-generated botanical PBR; exact source hashes and scale assumptions are retained.
export default Object.freeze({
    "materialId": "pbr.tree_ai_london_plane_bark",
    "label": "London plane — bark",
    "classId": "bark",
    "root": "surface",
    "buildingEligible": false,
    "groundEligible": false,
    "tileMeters": 0.8,
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
        "baseColor": "assets/public/pbr/tree_ai_london_plane_bark/basecolor.png",
        "normal": "assets/public/pbr/tree_ai_london_plane_bark/normal_opengl.png",
        "orm": "assets/public/pbr/tree_ai_london_plane_bark/orm.png",
        "variants": {
            "ao": "assets/public/pbr/tree_ai_london_plane_bark/ao.png",
            "basecolor": "assets/public/pbr/tree_ai_london_plane_bark/basecolor.png",
            "height_16bit": "assets/public/pbr/tree_ai_london_plane_bark/height_16bit.png",
            "metallic": "assets/public/pbr/tree_ai_london_plane_bark/metallic.png",
            "normal_directx": "assets/public/pbr/tree_ai_london_plane_bark/normal_directx.png",
            "normal_opengl": "assets/public/pbr/tree_ai_london_plane_bark/normal_opengl.png",
            "orm": "assets/public/pbr/tree_ai_london_plane_bark/orm.png",
            "roughness": "assets/public/pbr/tree_ai_london_plane_bark/roughness.png"
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
            "asset": "London plane bark",
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
        "role": "bark",
        "physicalMeasurement": false,
        "physicalSize": {
            "width": 0.8,
            "height": 0.8,
            "basis": "artist-selected approximate scale; not measured"
        },
        "displacement": {
            "white_is_high": true,
            "midlevel": 0.5,
            "scale_m": 0.004,
            "bias_m": -0.002,
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
                "source": "london_plane/bark/ao.png",
                "sha256": "99676f752759ef7ee1e31b09aab69b0ee6decc8eaf1ae61cb02cf41aff39d376",
                "bytes": 343829
            },
            {
                "file": "basecolor.png",
                "source": "london_plane/bark/basecolor.png",
                "sha256": "e110617b4038528b54b38be8c8349c1c03355dab0050973196b63fa30d624f90",
                "bytes": 1900638
            },
            {
                "file": "height_16bit.png",
                "source": "london_plane/bark/height_16bit.png",
                "sha256": "84131a4333557a87956916668543c7a98dbc33396661a3dd5a8bda533dc5836c",
                "bytes": 1690633
            },
            {
                "file": "material.json",
                "source": "london_plane/bark/material.json",
                "sha256": "2c0911e4df827c8e83675d179641a1c05fe49b765f8771356ee509c451d5ac3f",
                "bytes": 3155
            },
            {
                "file": "metallic.png",
                "source": "london_plane/bark/metallic.png",
                "sha256": "c8b6bb3e837f846489438b47ae42f3960b820a17095ea66df3c5fa00fcd60665",
                "bytes": 1097
            },
            {
                "file": "normal_directx.png",
                "source": "london_plane/bark/normal_directx.png",
                "sha256": "f378f114829543d00bbe7d5430bacd861bdb9a62a93ce11cad394d7b63a8ff15",
                "bytes": 1100040
            },
            {
                "file": "normal_opengl.png",
                "source": "london_plane/bark/normal_opengl.png",
                "sha256": "9f2deaef857f33eb756d6899db24c4a18ba58a3a22b4ff0b10fb410605a8ed30",
                "bytes": 1100101
            },
            {
                "file": "orm.png",
                "source": "london_plane/bark/orm.png",
                "sha256": "52882ae85aec9f7bb792ae5c4b4eb8877524cc1b3e3ddad343438b3034a3492a",
                "bytes": 624782
            },
            {
                "file": "roughness.png",
                "source": "london_plane/bark/roughness.png",
                "sha256": "3bdb65b2abe35a42ba8174ab0b77bfd171dcc7a1cbdf335501e519234ee0c33b",
                "bytes": 189918
            }
        ]
    }
});
