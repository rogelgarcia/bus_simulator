// Registers the homogeneous CC0 close-up sand source used only for landscape micro detail, with its unchanged maps and real scale.
export default Object.freeze({
    "materialId": "pbr.landscape_sand_micro_v1",
    "label": "Landscape Sand Micro Detail",
    "classId": "ground",
    "root": "surface",
    "buildingEligible": false,
    "groundEligible": false,
    "tileMeters": 3.5,
    "mapFiles": {
        "baseColor": "basecolor.png",
        "normal": "normal_gl.png",
        "displacement": "displacement.png"
    },
    "allMapFiles": {
        "baseColor": "assets/public/pbr/landscape_sand_micro_v1/basecolor.png",
        "normal": "assets/public/pbr/landscape_sand_micro_v1/normal_gl.png",
        "displacement": "assets/public/pbr/landscape_sand_micro_v1/displacement.png",
        "variants": {}
    },
    "source": {
        "provider": "ambientCG",
        "author": "Lennart Demes",
        "authorNote": "ambientCG publisher; the Ground054 asset page lists no individual creator.",
        "assetId": "Ground054",
        "assetUrl": "https://ambientcg.com/a/Ground054",
        "license": "CC0-1.0",
        "licenseUrl": "https://docs.ambientcg.com/license/",
        "downloadedOn": "2026-10-04",
        "resolution": 1024,
        "technique": "surface-photogrammetry",
        "physicalSize": {
            "widthMeters": 3.5,
            "heightMeters": 3.5,
            "statedAs": "ca. 3.5 m x 3.5 m (asset page Dimensions; API dimensionX/Y 350 cm)"
        },
        "files": [
            {
                "file": "basecolor.png",
                "originalFile": "Ground054_1K-PNG_Color.png",
                "byteLength": 2088335,
                "sha256": "bb3b8b28e2a03f6a448a042880532da732e0b00bb3978b912be98001e85c2151",
                "url": "https://ambientcg.com/get?file=Ground054_1K-PNG.zip"
            },
            {
                "file": "normal_gl.png",
                "originalFile": "Ground054_1K-PNG_NormalGL.png",
                "byteLength": 5766891,
                "sha256": "331258541860948a77d1b47f6a2435344fcd0100e6b789208f5637e77b3bc53f",
                "url": "https://ambientcg.com/get?file=Ground054_1K-PNG.zip"
            },
            {
                "file": "displacement.png",
                "originalFile": "Ground054_1K-PNG_Displacement.png",
                "byteLength": 1660206,
                "sha256": "ee83f71d95e1bd3ac48781ceb8a6c418251df2d007210e6cfd08637db28e45f1",
                "url": "https://ambientcg.com/get?file=Ground054_1K-PNG.zip"
            }
        ],
        "archive": {
            "file": "Ground054_1K-PNG.zip",
            "sha256": "19aafb7d257cff80eca5374b097abacb714149aa899891be82572e82fbac1326",
            "byteLength": 17930839,
            "url": "https://ambientcg.com/get?file=Ground054_1K-PNG.zip"
        }
    },
    "normalization": {
        "notes": "Unchanged 1K source maps; 3.5-meter tile is the provider's stated capture size (3.418 mm per source pixel). Not a standalone ground material.",
        "albedoNotes": "Only relative luminance is used, after declared periodic scale separation; the source hue never reaches the rendered sand.",
        "roughnessIntent": "Relief is relative micro relief from photogrammetry, not measured terrain elevation or collision."
    }
});
