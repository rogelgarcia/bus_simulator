// Registers a homogeneous landscape material and the unchanged CC0 source maps.
export default Object.freeze({
    "materialId": "pbr.landscape_grass_uniform_v1",
    "label": "Landscape Short Grass",
    "classId": "grass",
    "root": "surface",
    "buildingEligible": false,
    "groundEligible": true,
    "tileMeters": 4,
    "mapFiles": {
        "baseColor": "basecolor.png",
        "normal": "normal_gl.png",
        "ao": "ao.png",
        "roughness": "roughness.png",
        "displacement": "displacement.png"
    },
    "allMapFiles": {
        "baseColor": "assets/public/pbr/landscape_grass_uniform_v1/basecolor.png",
        "normal": "assets/public/pbr/landscape_grass_uniform_v1/normal_gl.png",
        "ao": "assets/public/pbr/landscape_grass_uniform_v1/ao.png",
        "roughness": "assets/public/pbr/landscape_grass_uniform_v1/roughness.png",
        "displacement": "assets/public/pbr/landscape_grass_uniform_v1/displacement.png",
        "variants": {}
    },
    "source": {
        "provider": "ambientCG",
        "author": "Lennart Demes",
        "assetId": "Grass008",
        "assetUrl": "https://ambientcg.com/a/Grass008",
        "license": "CC0-1.0",
        "licenseUrl": "https://docs.ambientcg.com/license/",
        "downloadedOn": "2026-10-03",
        "resolution": 1024,
        "technique": "procedural-with-bitmap-elements",
        "files": [
            {
                "file": "basecolor.png",
                "originalFile": "Grass008_1K-PNG_Color.png",
                "byteLength": 2064401,
                "sha256": "3009bbf0465863ce19fbd7ed1da932b4092502e6c2ae5330bdc962413a252034",
                "url": "https://ambientcg.com/get?file=Grass008_1K-PNG.zip"
            },
            {
                "file": "normal_gl.png",
                "originalFile": "Grass008_1K-PNG_NormalGL.png",
                "byteLength": 5833363,
                "sha256": "c27ad4167419edf845951b7b2dc99f42b11fe8807fa58aa21532e735d8f38426",
                "url": "https://ambientcg.com/get?file=Grass008_1K-PNG.zip"
            },
            {
                "file": "ao.png",
                "originalFile": "Grass008_1K-PNG_AmbientOcclusion.png",
                "byteLength": 955237,
                "sha256": "fc35eb614368add0907fec81e67553b11750378650b81ba2e0a403b569130fc4",
                "url": "https://ambientcg.com/get?file=Grass008_1K-PNG.zip"
            },
            {
                "file": "roughness.png",
                "originalFile": "Grass008_1K-PNG_Roughness.png",
                "byteLength": 804259,
                "sha256": "d66df7d6b25c40ae2bbe1a6a681544d6d3a5bf1471f727f52a4a1388284a0056",
                "url": "https://ambientcg.com/get?file=Grass008_1K-PNG.zip"
            },
            {
                "file": "displacement.png",
                "originalFile": "Grass008_1K-PNG_Displacement.png",
                "byteLength": 1977898,
                "sha256": "d0a7bdcd0eb489fd8a16c49a9fc9849b901d1b379092049240183454950ed836",
                "url": "https://ambientcg.com/get?file=Grass008_1K-PNG.zip"
            }
        ],
        "archive": {
            "file": "Grass008_1K-PNG.zip",
            "sha256": "bcf399c9156c3fb4f7ec43c2c5eb81857b76d0932ee54ef16225f9caae6e0513",
            "byteLength": 19075048,
            "url": "https://ambientcg.com/get?file=Grass008_1K-PNG.zip"
        }
    },
    "normalization": {
        "notes": "Unchanged source maps; landscape derivative uses pbr.landscape.config.json. Four-meter tile is authored display scale; provider supplies no metric extent.",
        "albedoNotes": "Single-material microdetail; broad log-color drift is removed by the registered landscape appearance bake.",
        "roughnessIntent": "Matte nonmetal surface; relative source height is artistic material relief, not measured terrain elevation."
    }
});
