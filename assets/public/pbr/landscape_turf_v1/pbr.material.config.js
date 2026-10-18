// Registers the homogeneous CC0 turf cover material of the landscape surface model with its unchanged source maps.
export default Object.freeze({
    "materialId": "pbr.landscape_turf_v1",
    "label": "Landscape Turf Sward",
    "classId": "ground",
    "root": "surface",
    "buildingEligible": false,
    "groundEligible": true,
    "tileMeters": 1.4,
    "mapFiles": {
        "baseColor": "basecolor.png",
        "normal": "normal_gl.png",
        "ao": "ao.png",
        "roughness": "roughness.png",
        "displacement": "displacement.png"
    },
    "allMapFiles": {
        "baseColor": "assets/public/pbr/landscape_turf_v1/basecolor.png",
        "normal": "assets/public/pbr/landscape_turf_v1/normal_gl.png",
        "ao": "assets/public/pbr/landscape_turf_v1/ao.png",
        "roughness": "assets/public/pbr/landscape_turf_v1/roughness.png",
        "displacement": "assets/public/pbr/landscape_turf_v1/displacement.png",
        "variants": {}
    },
    "source": {
        "provider": "ambientCG",
        "author": "Lennart Demes (ambientCG publisher; asset pages list no individual creator)",
        "assetId": "Grass001",
        "assetUrl": "https://ambientcg.com/a/Grass001",
        "license": "CC0-1.0",
        "licenseUrl": "https://docs.ambientcg.com/license/",
        "downloadedOn": "2026-10-16",
        "resolution": 1024,
        "technique": "Height field photogrammetry",
        "physicalSize": {
            "widthMeters": 1.4,
            "heightMeters": 1.4,
            "statedAs": "API dimensionX/Y 140 x 140 cm (0 = not stated)"
        },
        "files": [
            {
                "file": "basecolor.png",
                "originalFile": "Grass001_1K-PNG_Color.png",
                "byteLength": 1937763,
                "sha256": "c79fda29c8a1249157e5e90b033cde2b126905ef2961de3edca1255f322e64ae",
                "url": "https://ambientcg.com/get?file=Grass001_1K-PNG.zip"
            },
            {
                "file": "normal_gl.png",
                "originalFile": "Grass001_1K-PNG_NormalGL.png",
                "byteLength": 5984854,
                "sha256": "671d017230245d39e16b9a6bdf0b77b4f98f9158850e03745eff0cd7f12a7f5d",
                "url": "https://ambientcg.com/get?file=Grass001_1K-PNG.zip"
            },
            {
                "file": "ao.png",
                "originalFile": "Grass001_1K-PNG_AmbientOcclusion.png",
                "byteLength": 878336,
                "sha256": "cd295bfc5c4e87ed561e0084ecf88ec1d811e01cdfc721ff01cd9f05a596bd6e",
                "url": "https://ambientcg.com/get?file=Grass001_1K-PNG.zip"
            },
            {
                "file": "roughness.png",
                "originalFile": "Grass001_1K-PNG_Roughness.png",
                "byteLength": 797863,
                "sha256": "badbb391fa314817d71d43f591ddb5c5caecb8f40dc3394bb49b276d30a3f582",
                "url": "https://ambientcg.com/get?file=Grass001_1K-PNG.zip"
            },
            {
                "file": "displacement.png",
                "originalFile": "Grass001_1K-PNG_Displacement.png",
                "byteLength": 2013981,
                "sha256": "b6de07741f59f3ede0ed76286b59d1ef849186438829307c29157492b57d460f",
                "url": "https://ambientcg.com/get?file=Grass001_1K-PNG.zip"
            }
        ],
        "archive": {
            "file": "Grass001_1K-PNG.zip",
            "sha256": "43e6807e6fab786978a967a74b0a3abae9b43fadcce0f269e2e8045c758d5a3e",
            "byteLength": 19229149,
            "url": "https://ambientcg.com/get?file=Grass001_1K-PNG.zip"
        },
        "receipt": "downloads/landscape/ai598_d2/ambientcg_Grass001/source.json"
    },
    "normalization": {
        "notes": "Unchanged 1K source maps; the 1.4-meter tile is the provider's stated size (140 x 140 cm). Dense short sward; it beats the installed Grass008 lawn on the audit (effective albedo inside the grass range without a gain, 0.7 degree lean against 2.2).",
        "albedoNotes": "Dense green sward; single-material microdetail.",
        "roughnessIntent": "Matte canopy; relative source relief is blade relief, not measured terrain elevation."
    }
});
