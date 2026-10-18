// Registers the homogeneous CC0 algae cover material of the landscape surface model with its unchanged source maps.
export default Object.freeze({
    "materialId": "pbr.landscape_algae_rock_v1",
    "label": "Landscape Algae Rock",
    "classId": "stone",
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
        "baseColor": "assets/public/pbr/landscape_algae_rock_v1/basecolor.png",
        "normal": "assets/public/pbr/landscape_algae_rock_v1/normal_gl.png",
        "orm": "assets/public/pbr/landscape_algae_rock_v1/arm.png",
        "displacement": "assets/public/pbr/landscape_algae_rock_v1/displacement.png",
        "variants": {}
    },
    "source": {
        "provider": "Poly Haven",
        "author": "Dimitrios Savva",
        "assetId": "seaside_rock",
        "assetUrl": "https://polyhaven.com/a/seaside_rock",
        "license": "CC0-1.0",
        "licenseUrl": "https://polyhaven.com/license",
        "downloadedOn": "2026-10-16",
        "resolution": 1024,
        "technique": "Poly Haven asset page; the provider does not state the capture method per asset",
        "physicalSize": {
            "widthMeters": 2,
            "heightMeters": 2,
            "statedAs": "API dimensions [2000, 2000] mm"
        },
        "files": [
            {
                "file": "basecolor.png",
                "originalFile": "seaside_rock_diff_1k.png",
                "byteLength": 5764427,
                "sha256": "145f98fca8d0ef60086ac13d4c226316bfd90a2b7761c4161d640cb77b8a3deb",
                "url": "https://dl.polyhaven.org/file/ph-assets/Textures/png/1k/seaside_rock/seaside_rock_diff_1k.png"
            },
            {
                "file": "normal_gl.png",
                "originalFile": "seaside_rock_nor_gl_1k.png",
                "byteLength": 5835087,
                "sha256": "571cc58dcf6504e897e835a918919c7e9c4af1075383b8c8be62af120df326f5",
                "url": "https://dl.polyhaven.org/file/ph-assets/Textures/png/1k/seaside_rock/seaside_rock_nor_gl_1k.png"
            },
            {
                "file": "arm.png",
                "originalFile": "seaside_rock_arm_1k.png",
                "byteLength": 4169375,
                "sha256": "fcde935ef8f21f01e1e9ce4ef17a5e363ec0c569676068ffc0526fc9fba904ca",
                "url": "https://dl.polyhaven.org/file/ph-assets/Textures/png/1k/seaside_rock/seaside_rock_arm_1k.png"
            },
            {
                "file": "displacement.png",
                "originalFile": "seaside_rock_disp_1k.png",
                "byteLength": 1624623,
                "sha256": "7d3f4fbba33408d6cad1bfceec1137255b43a2a0f6466be8225900a89b6ac531",
                "url": "https://dl.polyhaven.org/file/ph-assets/Textures/png/1k/seaside_rock/seaside_rock_disp_1k.png"
            }
        ],
        "receipt": "downloads/landscape/ai598_d2/polyhaven_seaside_rock/source.json"
    },
    "normalization": {
        "notes": "Unchanged 1K source maps; the 2-meter tile is the provider's stated size (2000 x 2000 mm). Dark wet coastal rock; the green biofilm tint is a surface-model parameter of the algae class (a hue rotation cannot add chroma to grey), and the faint tile-scale gradient is removed by the registered landscape appearance bake (radius 16).",
        "albedoNotes": "Dark grey-brown coastal rock, effective albedo inside the wet-biofilm range without a gain.",
        "roughnessIntent": "Wet rock film: lower roughness than dry rock; the surface model's wetness lowers it further."
    }
});
