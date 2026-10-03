// Registers a homogeneous landscape material and the unchanged CC0 source maps.
export default Object.freeze({
    "materialId": "pbr.landscape_rock_uniform_v1",
    "label": "Landscape Fine Rock",
    "classId": "stone",
    "root": "surface",
    "buildingEligible": false,
    "groundEligible": true,
    "tileMeters": 4,
    "mapFiles": {
        "baseColor": "basecolor.png",
        "normal": "normal_gl.png",
        "roughness": "roughness.png",
        "displacement": "displacement.png"
    },
    "allMapFiles": {
        "baseColor": "assets/public/pbr/landscape_rock_uniform_v1/basecolor.png",
        "normal": "assets/public/pbr/landscape_rock_uniform_v1/normal_gl.png",
        "roughness": "assets/public/pbr/landscape_rock_uniform_v1/roughness.png",
        "displacement": "assets/public/pbr/landscape_rock_uniform_v1/displacement.png",
        "variants": {}
    },
    "source": {
        "provider": "ambientCG",
        "author": "Lennart Demes",
        "assetId": "Granite005A",
        "assetUrl": "https://ambientcg.com/a/Granite005A",
        "license": "CC0-1.0",
        "licenseUrl": "https://docs.ambientcg.com/license/",
        "downloadedOn": "2026-10-03",
        "resolution": 1024,
        "technique": "procedural",
        "files": [
            {
                "file": "basecolor.png",
                "originalFile": "Granite005A_1K-PNG_Color.png",
                "byteLength": 2565216,
                "sha256": "6ced5fb902098ac091811c8ac2501ddf5c0852e5e139833cbef250d4c1340921",
                "url": "https://ambientcg.com/get?file=Granite005A_1K-PNG.zip"
            },
            {
                "file": "normal_gl.png",
                "originalFile": "Granite005A_1K-PNG_NormalGL.png",
                "byteLength": 3723630,
                "sha256": "5085aa86dbdd667a445cb6c488f3a3f9859c6b7b1bcb69dfab938ae319fe7199",
                "url": "https://ambientcg.com/get?file=Granite005A_1K-PNG.zip"
            },
            {
                "file": "roughness.png",
                "originalFile": "Granite005A_1K-PNG_Roughness.png",
                "byteLength": 535164,
                "sha256": "3ee696d79aef43899196977d2b5605b8eea16c6f3bbab72d412bc19482ffa178",
                "url": "https://ambientcg.com/get?file=Granite005A_1K-PNG.zip"
            },
            {
                "file": "displacement.png",
                "originalFile": "Granite005A_1K-PNG_Displacement.png",
                "byteLength": 1489497,
                "sha256": "779b110b472d9031d180e417d98847b48cac0ab485b8b934f9d8fc543cab5ead",
                "url": "https://ambientcg.com/get?file=Granite005A_1K-PNG.zip"
            }
        ],
        "archive": {
            "file": "Granite005A_1K-PNG.zip",
            "sha256": "d461c9765b374539590ac06d4ca3dd9bc3089ede8a860a51a9b5b43079ff7750",
            "byteLength": 13619503,
            "url": "https://ambientcg.com/get?file=Granite005A_1K-PNG.zip"
        }
    },
    "normalization": {
        "notes": "Unchanged source maps; landscape derivative uses pbr.landscape.config.json. Four-meter tile is authored display scale; provider supplies no metric extent.",
        "albedoNotes": "Single-material microdetail; broad log-color drift is removed by the registered landscape appearance bake.",
        "roughnessIntent": "Authored matte nonmetal granite response; original source is a polished decorative granite. Relative authored source relief is not measured terrain elevation."
    }
});
