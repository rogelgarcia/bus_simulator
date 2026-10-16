// Registers the homogeneous CC0 cobble substrate material of the landscape surface model with its unchanged source maps.
export default Object.freeze({
    "materialId": "pbr.landscape_cobble_v1",
    "label": "Landscape Cobble Beach",
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
        "baseColor": "assets/public/pbr/landscape_cobble_v1/basecolor.png",
        "normal": "assets/public/pbr/landscape_cobble_v1/normal_gl.png",
        "orm": "assets/public/pbr/landscape_cobble_v1/arm.png",
        "displacement": "assets/public/pbr/landscape_cobble_v1/displacement.png",
        "variants": {}
    },
    "source": {
        "provider": "Poly Haven",
        "author": "Amal Kumar",
        "assetId": "dry_river_pebbles",
        "assetUrl": "https://polyhaven.com/a/dry_river_pebbles",
        "license": "CC0-1.0",
        "licenseUrl": "https://polyhaven.com/license",
        "downloadedOn": "2026-10-16",
        "resolution": 1024,
        "technique": "Poly Haven asset page; the provider does not state the capture method per asset",
        "physicalSize": {
            "widthMeters": 2.0009167194366455,
            "heightMeters": 2.000917911529541,
            "statedAs": "API dimensions [2000.9167194366455, 2000.917911529541] mm"
        },
        "files": [
            {
                "file": "basecolor.png",
                "originalFile": "dry_river_pebbles_diff_1k.png",
                "byteLength": 6522493,
                "sha256": "8b99323bb5db43ea51cadcdcb4df4117894c02de889d3ce27c048174ffa05063",
                "url": "https://dl.polyhaven.org/file/ph-assets/Textures/png/1k/dry_river_pebbles/dry_river_pebbles_diff_1k.png"
            },
            {
                "file": "normal_gl.png",
                "originalFile": "dry_river_pebbles_nor_gl_1k.png",
                "byteLength": 6662770,
                "sha256": "4a73e12db837afbe86a228731f3dfbd55f1129f93dc99400b0aa5306754b3880",
                "url": "https://dl.polyhaven.org/file/ph-assets/Textures/png/1k/dry_river_pebbles/dry_river_pebbles_nor_gl_1k.png"
            },
            {
                "file": "arm.png",
                "originalFile": "dry_river_pebbles_arm_1k.png",
                "byteLength": 4048061,
                "sha256": "5be158bf6fcb8b9c480c3a4f3bb303858d79df201c8887a366736bbcd2ed43d4",
                "url": "https://dl.polyhaven.org/file/ph-assets/Textures/png/1k/dry_river_pebbles/dry_river_pebbles_arm_1k.png"
            },
            {
                "file": "displacement.png",
                "originalFile": "dry_river_pebbles_disp_1k.png",
                "byteLength": 1656068,
                "sha256": "c37ab0e073991795e56aac89bc9a54ef1109cfa9dedc10b9a54d1f88b2f83bdd",
                "url": "https://dl.polyhaven.org/file/ph-assets/Textures/png/1k/dry_river_pebbles/dry_river_pebbles_disp_1k.png"
            }
        ],
        "receipt": "downloads/landscape/ai598_d2/polyhaven_dry_river_pebbles/source.json"
    },
    "normalization": {
        "notes": "Unchanged 1K source maps; the 2-meter tile is the provider's stated size (2000 x 2000 mm): rounded stones 6-15 cm. Broad density drift of the stone field is removed by the registered landscape appearance bake (radius 16).",
        "albedoNotes": "Rounded pale pebbles over dark gaps; single-material microdetail, broad drift removed by pbr.landscape.config.json.",
        "roughnessIntent": "Water-worn stones are smoother than broken scree; relative source relief is stone relief, not measured terrain elevation."
    }
});
