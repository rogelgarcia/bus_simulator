// Registers the homogeneous CC0 moss cover material of the landscape surface model with its unchanged source maps.
export default Object.freeze({
    "materialId": "pbr.landscape_moss_v1",
    "label": "Landscape Moss",
    "classId": "ground",
    "root": "surface",
    "buildingEligible": false,
    "groundEligible": true,
    "tileMeters": 1.5,
    "mapFiles": {
        "baseColor": "basecolor.png",
        "normal": "normal_gl.png",
        "ao": "ao.png",
        "roughness": "roughness.png",
        "displacement": "displacement.png"
    },
    "allMapFiles": {
        "baseColor": "assets/public/pbr/landscape_moss_v1/basecolor.png",
        "normal": "assets/public/pbr/landscape_moss_v1/normal_gl.png",
        "ao": "assets/public/pbr/landscape_moss_v1/ao.png",
        "roughness": "assets/public/pbr/landscape_moss_v1/roughness.png",
        "displacement": "assets/public/pbr/landscape_moss_v1/displacement.png",
        "variants": {}
    },
    "source": {
        "provider": "ambientCG",
        "author": "Lennart Demes (ambientCG publisher; asset pages list no individual creator)",
        "assetId": "Moss002",
        "assetUrl": "https://ambientcg.com/a/Moss002",
        "license": "CC0-1.0",
        "licenseUrl": "https://docs.ambientcg.com/license/",
        "downloadedOn": "2026-10-16",
        "resolution": 1024,
        "technique": "Height field photogrammetry",
        "files": [
            {
                "file": "basecolor.png",
                "originalFile": "Moss002_1K-PNG_Color.png",
                "byteLength": 2278660,
                "sha256": "da1fe535b454ae39b46109cdc3e8f8a1797d73b23bdbce0e3f544bdedc8f407a",
                "url": "https://ambientcg.com/get?file=Moss002_1K-PNG.zip"
            },
            {
                "file": "normal_gl.png",
                "originalFile": "Moss002_1K-PNG_NormalGL.png",
                "byteLength": 6054769,
                "sha256": "7c51e0560d249c32b9a197cf05d9bb623a8c94a1bb21bdcad6a98bff52f897f1",
                "url": "https://ambientcg.com/get?file=Moss002_1K-PNG.zip"
            },
            {
                "file": "ao.png",
                "originalFile": "Moss002_1K-PNG_AmbientOcclusion.png",
                "byteLength": 870874,
                "sha256": "b8d48050fb527d96bb6f383bfc82966199d3270c2048aeec0d1794f45f08e339",
                "url": "https://ambientcg.com/get?file=Moss002_1K-PNG.zip"
            },
            {
                "file": "roughness.png",
                "originalFile": "Moss002_1K-PNG_Roughness.png",
                "byteLength": 695313,
                "sha256": "e2b0fb63befb5fa6c5dc9f009660fc5001ca6eb3f88e0520c045e24c92c0c092",
                "url": "https://ambientcg.com/get?file=Moss002_1K-PNG.zip"
            },
            {
                "file": "displacement.png",
                "originalFile": "Moss002_1K-PNG_Displacement.png",
                "byteLength": 1838811,
                "sha256": "9b95c8e158188d2bd7a31b4172449cbee52b021b03a486f1126a144ad57ae59d",
                "url": "https://ambientcg.com/get?file=Moss002_1K-PNG.zip"
            }
        ],
        "archive": {
            "file": "Moss002_1K-PNG.zip",
            "sha256": "97010f72c7a32fa1e1242cfe872822c7c8b2ac445b47aa2e53cc877ccb2ec87a",
            "byteLength": 19300675,
            "url": "https://ambientcg.com/get?file=Moss002_1K-PNG.zip"
        },
        "receipt": "downloads/landscape/ai598_d2/ambientcg_Moss002/source.json"
    },
    "normalization": {
        "notes": "Unchanged 1K source maps; the provider states no metric extent, the 1.5-meter tile is authored from the cushion size (2-6 cm at 1.46 mm per texel). Broad log-color blotches are removed by the registered landscape appearance bake (radius 16).",
        "albedoNotes": "Green moss cushions; single-material microdetail, broad drift removed by pbr.landscape.config.json, saturation reduced from the procedural source.",
        "roughnessIntent": "Matte velvety cushions; relative source relief is cushion relief, not measured terrain elevation."
    }
});
