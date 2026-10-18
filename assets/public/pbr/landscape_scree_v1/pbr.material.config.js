// Registers the homogeneous CC0 scree substrate material of the landscape surface model with its unchanged source maps.
export default Object.freeze({
    "materialId": "pbr.landscape_scree_v1",
    "label": "Landscape Scree",
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
        "baseColor": "assets/public/pbr/landscape_scree_v1/basecolor.png",
        "normal": "assets/public/pbr/landscape_scree_v1/normal_gl.png",
        "ao": "assets/public/pbr/landscape_scree_v1/ao.png",
        "roughness": "assets/public/pbr/landscape_scree_v1/roughness.png",
        "displacement": "assets/public/pbr/landscape_scree_v1/displacement.png",
        "variants": {}
    },
    "source": {
        "provider": "ambientCG",
        "author": "Lennart Demes (ambientCG publisher; asset pages list no individual creator)",
        "assetId": "Gravel040",
        "assetUrl": "https://ambientcg.com/a/Gravel040",
        "license": "CC0-1.0",
        "licenseUrl": "https://docs.ambientcg.com/license/",
        "downloadedOn": "2026-10-16",
        "resolution": 1024,
        "technique": "Height field photogrammetry",
        "files": [
            {
                "file": "basecolor.png",
                "originalFile": "Gravel040_1K-PNG_Color.png",
                "byteLength": 2109600,
                "sha256": "905a821970b6e2927c9020f344f2f0a0afb724fe8bcdf153447d19e31b1e176f",
                "url": "https://ambientcg.com/get?file=Gravel040_1K-PNG.zip"
            },
            {
                "file": "normal_gl.png",
                "originalFile": "Gravel040_1K-PNG_NormalGL.png",
                "byteLength": 5892553,
                "sha256": "b3750dd8c498ae323a8906da924d3a0a78226ba91653d67b16488151608feacd",
                "url": "https://ambientcg.com/get?file=Gravel040_1K-PNG.zip"
            },
            {
                "file": "ao.png",
                "originalFile": "Gravel040_1K-PNG_AmbientOcclusion.png",
                "byteLength": 785061,
                "sha256": "2a84ab71019bc5a063233e8e608d416d89aace15cdba4bd11b5560ac2bca56dd",
                "url": "https://ambientcg.com/get?file=Gravel040_1K-PNG.zip"
            },
            {
                "file": "roughness.png",
                "originalFile": "Gravel040_1K-PNG_Roughness.png",
                "byteLength": 721442,
                "sha256": "08229f859f59f44d30e15d2ce9012be89d4869071d0821c152b8455be4b0d3bf",
                "url": "https://ambientcg.com/get?file=Gravel040_1K-PNG.zip"
            },
            {
                "file": "displacement.png",
                "originalFile": "Gravel040_1K-PNG_Displacement.png",
                "byteLength": 1859697,
                "sha256": "3d3b20438c76569207623cf8d8be5880d4ef3fed4057188fb4a2a13ff016cd3b",
                "url": "https://ambientcg.com/get?file=Gravel040_1K-PNG.zip"
            }
        ],
        "archive": {
            "file": "Gravel040_1K-PNG.zip",
            "sha256": "741067e9a32c7b1bd01be25ce9bd2511da1362eb260befa36ad16606ed92378f",
            "byteLength": 18903321,
            "url": "https://ambientcg.com/get?file=Gravel040_1K-PNG.zip"
        },
        "receipt": "downloads/landscape/ai598_d2/ambientcg_Gravel040/source.json"
    },
    "normalization": {
        "notes": "Unchanged 1K source maps; the provider states no metric extent, the 2-meter tile is authored from the fragment size (angular slate fragments 2-5 cm at 1.95 mm per texel).",
        "albedoNotes": "Dark grey angular stone fragments; single-material microdetail.",
        "roughnessIntent": "Matte nonmetal broken stone; relative source relief is fragment relief, not measured terrain elevation."
    }
});
