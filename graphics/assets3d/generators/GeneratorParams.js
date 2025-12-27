// graphics/assets3d/generators/GeneratorParams.js

/**
 * Generator-owned visual parameters (sizes/proportions).
 * CityConfig should focus on layout (seed/map dims), not art scale.
 */

export const ROAD_DEFAULTS = {
    // Vertical placement
    surfaceY: 0.02,

    // Lanes
    laneWidth: 3.2,
    shoulder: 0.35,

    sidewalk: {
        // Extra sidewalk beyond the tile half-extent
        extraWidth: 1.25,

        // Intersection curb fillet radius (visual)
        cornerRadius: 1.8,

        // Small lift to avoid z-fighting with ground
        lift: 0.001,

        // Small intersection-only snug to remove tiny grass wedges
        inset: 0.06
    },

    // Smooth street turns (visual-only)
    curves: {
        // For tileSize=16, usable max is ~8. We intentionally allow large pref values; RoadGenerator clamps.
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
        height: 0.17,
        extraHeight: 0.0,
        sink: 0.03,

        // Overlap straight curb boxes into curved curb arcs to avoid visible seams at joins.
        joinOverlap: 0.24
    }
};

export const GROUND_DEFAULTS = {
    // By default, ground/sidewalk top sits at curb top (roadY + curbHeight)
    surfaceY: ROAD_DEFAULTS.surfaceY + ROAD_DEFAULTS.curb.height
};
