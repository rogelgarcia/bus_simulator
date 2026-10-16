// Registers the homogeneous CC0 shell-grit substrate material of the landscape surface model with its unchanged source maps.
export default Object.freeze({
    "materialId": "pbr.landscape_shell_grit_v1",
    "label": "Landscape Shell Grit",
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
        "baseColor": "assets/public/pbr/landscape_shell_grit_v1/basecolor.png",
        "normal": "assets/public/pbr/landscape_shell_grit_v1/normal_gl.png",
        "ao": "assets/public/pbr/landscape_shell_grit_v1/ao.png",
        "roughness": "assets/public/pbr/landscape_shell_grit_v1/roughness.png",
        "displacement": "assets/public/pbr/landscape_shell_grit_v1/displacement.png",
        "variants": {}
    },
    "source": {
        "provider": "ambientCG",
        "author": "Lennart Demes (ambientCG publisher; asset pages list no individual creator)",
        "assetId": "Shells001",
        "assetUrl": "https://ambientcg.com/a/Shells001",
        "license": "CC0-1.0",
        "licenseUrl": "https://docs.ambientcg.com/license/",
        "downloadedOn": "2026-10-16",
        "resolution": 1024,
        "technique": "Height field photogrammetry",
        "files": [
            {
                "file": "basecolor.png",
                "originalFile": "Shells001_1K-PNG_Color.png",
                "byteLength": 2284978,
                "sha256": "85cf849862afe4af2691ff17664ff50f3d00b3d83f9267a12d79bebb8dfe4f47",
                "url": "https://ambientcg.com/get?file=Shells001_1K-PNG.zip"
            },
            {
                "file": "normal_gl.png",
                "originalFile": "Shells001_1K-PNG_NormalGL.png",
                "byteLength": 6038441,
                "sha256": "c240ed9c323d603f1c809d1d619f26e4682bdb0d3a02b26b637a6dd0c3b362a0",
                "url": "https://ambientcg.com/get?file=Shells001_1K-PNG.zip"
            },
            {
                "file": "ao.png",
                "originalFile": "Shells001_1K-PNG_AmbientOcclusion.png",
                "byteLength": 753553,
                "sha256": "9f985f4c19672a3cc36c01f44d5b05ecaeafcfcfeb67ac27ae9ac4beb64a1542",
                "url": "https://ambientcg.com/get?file=Shells001_1K-PNG.zip"
            },
            {
                "file": "roughness.png",
                "originalFile": "Shells001_1K-PNG_Roughness.png",
                "byteLength": 645072,
                "sha256": "d37cfa4985463f0bbf8a17d4a602d951412802a8d939ca42a3881571c24077ba",
                "url": "https://ambientcg.com/get?file=Shells001_1K-PNG.zip"
            },
            {
                "file": "displacement.png",
                "originalFile": "Shells001_1K-PNG_Displacement.png",
                "byteLength": 1808085,
                "sha256": "b8b081d3d1a741ed79f607c2f5df2079018b72e89e7151e5b7740f79a775bb10",
                "url": "https://ambientcg.com/get?file=Shells001_1K-PNG.zip"
            }
        ],
        "archive": {
            "file": "Shells001_1K-PNG.zip",
            "sha256": "f03a937ffdb31c402d644cf2fafccc6ca839e4e17973ed6f37f8a1a2c94f0ecf",
            "byteLength": 19188968,
            "url": "https://ambientcg.com/get?file=Shells001_1K-PNG.zip"
        },
        "receipt": "downloads/landscape/ai598_d2/ambientcg_Shells001/source.json"
    },
    "normalization": {
        "notes": "Unchanged 1K source maps; the provider states no metric extent, the 1.5-meter tile is authored from the fragment size (shell fragments 1-3 cm at 1.46 mm per texel).",
        "albedoNotes": "Pale shell and gravel grit; saturation reduced so the source's cool cast reads as pale grit, the landscape calibration lifts it into the shell-grit range.",
        "roughnessIntent": "Matte nonmetal grit; relative source relief is fragment relief, not measured terrain elevation."
    }
});
