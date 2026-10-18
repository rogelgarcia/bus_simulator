// Registers the homogeneous CC0 dune-sand substrate material of the landscape surface model with its unchanged source maps.
export default Object.freeze({
    "materialId": "pbr.landscape_dune_sand_v1",
    "label": "Landscape Dune Sand",
    "classId": "ground",
    "root": "surface",
    "buildingEligible": false,
    "groundEligible": true,
    "tileMeters": 2,
    "mapFiles": {
        "baseColor": "basecolor.png",
        "normal": "normal_gl.png",
        "ao": "ao.png",
        "roughness": "roughness.png",
        "displacement": "displacement.png"
    },
    "allMapFiles": {
        "baseColor": "assets/public/pbr/landscape_dune_sand_v1/basecolor.png",
        "normal": "assets/public/pbr/landscape_dune_sand_v1/normal_gl.png",
        "ao": "assets/public/pbr/landscape_dune_sand_v1/ao.png",
        "roughness": "assets/public/pbr/landscape_dune_sand_v1/roughness.png",
        "displacement": "assets/public/pbr/landscape_dune_sand_v1/displacement.png",
        "variants": {}
    },
    "source": {
        "provider": "ambientCG",
        "author": "Lennart Demes (ambientCG publisher; asset pages list no individual creator)",
        "assetId": "Ground093A",
        "assetUrl": "https://ambientcg.com/a/Ground093A",
        "license": "CC0-1.0",
        "licenseUrl": "https://docs.ambientcg.com/license/",
        "downloadedOn": "2026-10-16",
        "resolution": 1024,
        "technique": "Height field photogrammetry",
        "files": [
            {
                "file": "basecolor.png",
                "originalFile": "Ground093A_1K-PNG_Color.png",
                "byteLength": 1034279,
                "sha256": "5a2bb339cede99d8629484908161ff86e9f541fcca9e009a92ed0253b548decf",
                "url": "https://ambientcg.com/get?file=Ground093A_1K-PNG.zip"
            },
            {
                "file": "normal_gl.png",
                "originalFile": "Ground093A_1K-PNG_NormalGL.png",
                "byteLength": 5689744,
                "sha256": "01830ec5511567f909c7f94397bf8bbacc1a45a6cc5400effe457e3b48447dc3",
                "url": "https://ambientcg.com/get?file=Ground093A_1K-PNG.zip"
            },
            {
                "file": "ao.png",
                "originalFile": "Ground093A_1K-PNG_AmbientOcclusion.png",
                "byteLength": 223054,
                "sha256": "54b42b3f82ef93cc18a09a974154eddd9296625b478a74e6090211410d386933",
                "url": "https://ambientcg.com/get?file=Ground093A_1K-PNG.zip"
            },
            {
                "file": "roughness.png",
                "originalFile": "Ground093A_1K-PNG_Roughness.png",
                "byteLength": 582720,
                "sha256": "c49cd6d69e4a72d7b467b697497065dc93093bd8f8f113e296ab2f72f5938e34",
                "url": "https://ambientcg.com/get?file=Ground093A_1K-PNG.zip"
            },
            {
                "file": "displacement.png",
                "originalFile": "Ground093A_1K-PNG_Displacement.png",
                "byteLength": 1659750,
                "sha256": "68db47dfb060496a2d5ed99cfc3afd6fc2f7d6251a73690d8e472fdfeebbbefb",
                "url": "https://ambientcg.com/get?file=Ground093A_1K-PNG.zip"
            }
        ],
        "archive": {
            "file": "Ground093A_1K-PNG.zip",
            "sha256": "3ab88d4123e0602afe917e99574738069f7c02c5009c9830ad79148ab5bd28ec",
            "byteLength": 16279278,
            "url": "https://ambientcg.com/get?file=Ground093A_1K-PNG.zip"
        },
        "receipt": "downloads/landscape/ai598_d2/ambientcg_Ground093A/source.json"
    },
    "normalization": {
        "notes": "Unchanged 1K source maps; the provider states no metric extent, the 2-meter tile is authored from the wind-ripple spacing (about 15 cm at 1.95 mm per texel).",
        "albedoNotes": "Pale dry quartz sand with soft wind ripples; the landscape calibration keeps it inside the dry-sand range.",
        "roughnessIntent": "Matte nonmetal dry sand; relative source relief is ripple relief, not measured terrain elevation."
    }
});
