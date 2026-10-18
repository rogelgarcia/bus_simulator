// Registers the homogeneous CC0 dry-grass cover material of the landscape surface model with its unchanged source maps.
export default Object.freeze({
    "materialId": "pbr.landscape_dry_grass_v1",
    "label": "Landscape Dry Grass",
    "classId": "ground",
    "root": "surface",
    "buildingEligible": false,
    "groundEligible": true,
    "tileMeters": 2,
    "mapFiles": {
        "baseColor": "basecolor.png",
        "normal": "normal_gl.png",
        "orm": "arm.png",
        "displacement": "displacement.png"
    },
    "allMapFiles": {
        "baseColor": "assets/public/pbr/landscape_dry_grass_v1/basecolor.png",
        "normal": "assets/public/pbr/landscape_dry_grass_v1/normal_gl.png",
        "orm": "assets/public/pbr/landscape_dry_grass_v1/arm.png",
        "displacement": "assets/public/pbr/landscape_dry_grass_v1/displacement.png",
        "variants": {}
    },
    "source": {
        "provider": "Poly Haven",
        "author": "Charlotte Baglioni",
        "assetId": "withered_grass",
        "assetUrl": "https://polyhaven.com/a/withered_grass",
        "license": "CC0-1.0",
        "licenseUrl": "https://polyhaven.com/license",
        "downloadedOn": "2026-10-16",
        "resolution": 1024,
        "technique": "Poly Haven asset page; the provider does not state the capture method per asset",
        "physicalSize": {
            "widthMeters": 1.9999996423721313,
            "heightMeters": 1.9999996423721313,
            "statedAs": "API dimensions [1999.9996423721313, 1999.9996423721313] mm"
        },
        "files": [
            {
                "file": "basecolor.png",
                "originalFile": "withered_grass_diff_1k.png",
                "byteLength": 5999305,
                "sha256": "30bdaa96e88b7194d7d6b5f9c385d1155b34843c5e4eb4da3b93b48f328f4198",
                "url": "https://dl.polyhaven.org/file/ph-assets/Textures/png/1k/withered_grass/withered_grass_diff_1k.png"
            },
            {
                "file": "normal_gl.png",
                "originalFile": "withered_grass_nor_gl_1k.png",
                "byteLength": 6142710,
                "sha256": "96a6c76dc4e98824bea0e091b749d13b87fbab53b85c5bc95779111b1b0301f4",
                "url": "https://dl.polyhaven.org/file/ph-assets/Textures/png/1k/withered_grass/withered_grass_nor_gl_1k.png"
            },
            {
                "file": "arm.png",
                "originalFile": "withered_grass_arm_1k.png",
                "byteLength": 4744452,
                "sha256": "93fdcfe462f3282e9e6a0860fea88966458bcd1f72ce6dfbe01a7be7ad1d4677",
                "url": "https://dl.polyhaven.org/file/ph-assets/Textures/png/1k/withered_grass/withered_grass_arm_1k.png"
            },
            {
                "file": "displacement.png",
                "originalFile": "withered_grass_disp_1k.png",
                "byteLength": 1885120,
                "sha256": "681c1d5af85df99d5f27cde8fdac40ecce51dbbe7cfc567daeb0e59cb448bd1d",
                "url": "https://dl.polyhaven.org/file/ph-assets/Textures/png/1k/withered_grass/withered_grass_disp_1k.png"
            }
        ],
        "receipt": "downloads/landscape/ai598_d2/polyhaven_withered_grass/source.json"
    },
    "normalization": {
        "notes": "Unchanged 1K source maps; the 2-meter tile is the provider's stated size (2000 x 2000 mm). Senescent sward with dead tufts.",
        "albedoNotes": "Pale straw-coloured dead grass; the landscape calibration keeps it inside the senescent-grass range.",
        "roughnessIntent": "Matte dry canopy; relative source relief is tuft relief, not measured terrain elevation."
    }
});
