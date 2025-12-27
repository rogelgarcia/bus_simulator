// src/city/CityConfig.js
export function createCityConfig({
                                     size = 800,
                                     tileMeters = 2,
                                     mapTileSize = 16,
                                     seed = 'city-demo'
                                 } = {}) {
    const gridW = Math.max(1, Math.floor(size / mapTileSize));
    const gridH = gridW;

    const originX = -size / 2 + mapTileSize / 2;
    const originZ = -size / 2 + mapTileSize / 2;

    // Scale references:
    // - Typical bus wheel radius knowing this project’s conventions is ~0.55m
    // - Good visible curb height is ~0.15–0.18m => pick 0.17m (~31% of wheel radius)
    const curbHeight = 0.17;

    const roadSurfaceY = 0.02;
    const groundSurfaceY = roadSurfaceY + curbHeight;

    return {
        size,
        tileMeters,
        seed,
        map: {
            tileSize: mapTileSize,
            width: gridW,
            height: gridH,
            origin: { x: originX, z: originZ }
        },

        road: {
            surfaceY: roadSurfaceY,
            laneWidth: 3.2,
            shoulder: 0.35,

            sidewalk: {
                extraWidth: 1.25,
                cornerRadius: 1.8,
                lift: 0.001
            },

            // Smooth street turns (visual-only)
            curves: {
                // IMPORTANT: For tileSize=16, max usable is ~8. We intentionally allow large radius.
                // Big radius makes corner connections read like proper curved streets.
                turnRadius: 6.8,

                // Smoothness
                asphaltArcSegments: 40,
                curbArcSegments: 24
            },

            markings: {
                lineWidth: 0.12,
                edgeInset: 0.22,
                lift: 0.003
            },

            curb: {
                thickness: 0.32,
                height: curbHeight,
                extraHeight: 0.0,
                sink: 0.03
            }
        },

        ground: {
            surfaceY: groundSurfaceY
        }
    };
}
