// Registers the homogeneous CC0 lichen cover material of the landscape surface model with its unchanged source maps.
export default Object.freeze({
    "materialId": "pbr.landscape_lichen_rock_v1",
    "label": "Landscape Lichen Rock",
    "classId": "stone",
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
        "baseColor": "assets/public/pbr/landscape_lichen_rock_v1/basecolor.png",
        "normal": "assets/public/pbr/landscape_lichen_rock_v1/normal_gl.png",
        "ao": "assets/public/pbr/landscape_lichen_rock_v1/ao.png",
        "roughness": "assets/public/pbr/landscape_lichen_rock_v1/roughness.png",
        "displacement": "assets/public/pbr/landscape_lichen_rock_v1/displacement.png",
        "variants": {}
    },
    "source": {
        "provider": "ambientCG",
        "author": "Lennart Demes (ambientCG publisher; asset pages list no individual creator)",
        "assetId": "Rock040",
        "assetUrl": "https://ambientcg.com/a/Rock040",
        "license": "CC0-1.0",
        "licenseUrl": "https://docs.ambientcg.com/license/",
        "downloadedOn": "2026-10-16",
        "resolution": 1024,
        "technique": "Height field photogrammetry",
        "files": [
            {
                "file": "basecolor.png",
                "originalFile": "Rock040_1K-PNG_Color.png",
                "byteLength": 2263927,
                "sha256": "5b748b4b27b19d8f3c5201c615e71f81cbe74e04c67ba0aa3a6bc13058b6cd0f",
                "url": "https://ambientcg.com/get?file=Rock040_1K-PNG.zip"
            },
            {
                "file": "normal_gl.png",
                "originalFile": "Rock040_1K-PNG_NormalGL.png",
                "byteLength": 5839362,
                "sha256": "d8a849a557bcfa5b6cfb4f04f94b13fdcd31f9775901895c8807fb4e16ea6ebb",
                "url": "https://ambientcg.com/get?file=Rock040_1K-PNG.zip"
            },
            {
                "file": "ao.png",
                "originalFile": "Rock040_1K-PNG_AmbientOcclusion.png",
                "byteLength": 390733,
                "sha256": "c1fd5ed056ad3fdf8d5380637cf754adeea3b3417704a8f6da8ed00c93a44bbc",
                "url": "https://ambientcg.com/get?file=Rock040_1K-PNG.zip"
            },
            {
                "file": "roughness.png",
                "originalFile": "Rock040_1K-PNG_Roughness.png",
                "byteLength": 510093,
                "sha256": "5c4cf2900339686ff877fd38b324a3a80986139c69a651a8a94d9d345cee0478",
                "url": "https://ambientcg.com/get?file=Rock040_1K-PNG.zip"
            },
            {
                "file": "displacement.png",
                "originalFile": "Rock040_1K-PNG_Displacement.png",
                "byteLength": 1682961,
                "sha256": "1bca78f55f8b9db323a05be11a373c581fb4a19d76eec772eaec9cccb61434f1",
                "url": "https://ambientcg.com/get?file=Rock040_1K-PNG.zip"
            }
        ],
        "archive": {
            "file": "Rock040_1K-PNG.zip",
            "sha256": "3e92c66b955cfa7b1a5c6bcaf56782e2a2f42be709fe12fe5d9d98ff353dd255",
            "byteLength": 18023014,
            "url": "https://ambientcg.com/get?file=Rock040_1K-PNG.zip"
        },
        "receipt": "downloads/landscape/ai598_d2/ambientcg_Rock040/source.json"
    },
    "normalization": {
        "notes": "Unchanged 1K source maps; the provider states no metric extent, the 2-meter tile is authored from the lichen speck size (1-3 cm at 1.95 mm per texel). Faint column drift is removed by the registered landscape appearance bake (radius 16).",
        "albedoNotes": "Pale crustose-lichen rock; the landscape calibration darkens it into the lichen-rock range.",
        "roughnessIntent": "Matte weathered rock with a lichen crust; relative source relief is grain, not measured terrain elevation."
    }
});
