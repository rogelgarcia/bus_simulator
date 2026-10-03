// Registers a homogeneous landscape material and the unchanged CC0 source maps.
export default Object.freeze({
    "materialId": "pbr.landscape_soil_uniform_v1",
    "label": "Landscape Fine Soil",
    "classId": "ground",
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
        "baseColor": "assets/public/pbr/landscape_soil_uniform_v1/basecolor.png",
        "normal": "assets/public/pbr/landscape_soil_uniform_v1/normal_gl.png",
        "ao": "assets/public/pbr/landscape_soil_uniform_v1/ao.png",
        "roughness": "assets/public/pbr/landscape_soil_uniform_v1/roughness.png",
        "displacement": "assets/public/pbr/landscape_soil_uniform_v1/displacement.png",
        "variants": {}
    },
    "source": {
        "provider": "ambientCG",
        "author": "Lennart Demes",
        "assetId": "Ground006",
        "assetUrl": "https://ambientcg.com/a/Ground006",
        "license": "CC0-1.0",
        "licenseUrl": "https://docs.ambientcg.com/license/",
        "downloadedOn": "2026-10-03",
        "resolution": 1024,
        "technique": "approximation",
        "files": [
            {
                "file": "basecolor.png",
                "originalFile": "Ground006_1K-PNG_Color.png",
                "byteLength": 2007273,
                "sha256": "8fb1a87d4e38dcfe7a550bb9c9a1ca3518cc685306a8a8debe8010ec01497863",
                "url": "https://ambientcg.com/get?file=Ground006_1K-PNG.zip"
            },
            {
                "file": "normal_gl.png",
                "originalFile": "Ground006_1K-PNG_NormalGL.png",
                "byteLength": 6093223,
                "sha256": "0e5647077094f837c321ca510198851adf9da5f77c0bb194e32bace9ab600fa0",
                "url": "https://ambientcg.com/get?file=Ground006_1K-PNG.zip"
            },
            {
                "file": "ao.png",
                "originalFile": "Ground006_1K-PNG_AmbientOcclusion.png",
                "byteLength": 542177,
                "sha256": "d352d3e14c433fa6902ce9013afff3b719449755b9ca714751dbfe4405dd0e57",
                "url": "https://ambientcg.com/get?file=Ground006_1K-PNG.zip"
            },
            {
                "file": "roughness.png",
                "originalFile": "Ground006_1K-PNG_Roughness.png",
                "byteLength": 751581,
                "sha256": "e36244c49725cf2d0d1f0dc9163bb3a6a74fe24455a68555d65d2ee80180ef37",
                "url": "https://ambientcg.com/get?file=Ground006_1K-PNG.zip"
            },
            {
                "file": "displacement.png",
                "originalFile": "Ground006_1K-PNG_Displacement.png",
                "byteLength": 1681385,
                "sha256": "569c0ecc1ca3d11044a9fb8185eae948bb761c093173498519c985c44cce7181",
                "url": "https://ambientcg.com/get?file=Ground006_1K-PNG.zip"
            }
        ],
        "archive": {
            "file": "Ground006_1K-PNG.zip",
            "sha256": "330435b514d5862671c828baf3c017df6103d4834809fe2caa1b0aceed2be538",
            "byteLength": 18616610,
            "url": "https://ambientcg.com/get?file=Ground006_1K-PNG.zip"
        }
    },
    "normalization": {
        "notes": "Unchanged source maps; landscape derivative uses pbr.landscape.config.json. Four-meter tile is authored display scale; provider supplies no metric extent.",
        "albedoNotes": "Single-material microdetail; broad log-color drift is removed by the registered landscape appearance bake.",
        "roughnessIntent": "Matte nonmetal surface; relative source height is artistic material relief, not measured terrain elevation."
    }
});
