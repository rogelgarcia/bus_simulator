// src/app/road_debugger/RoadDebuggerTileOffset.js
// Backwards-compatible wrapper around tile-offset utilities for road authoring tools.

export {
    ROAD_ENGINE_TILE_OFFSET_EPS as ROAD_DEBUGGER_TILE_OFFSET_EPS,
    normalizeRoadTileOffsetBoundary as normalizeRoadDebuggerTileOffsetBoundary,
    normalizeRoadTileOffsetBoundaryInPlace as normalizeRoadDebuggerTileOffsetBoundaryInPlace,
    normalizeRoadTileOffsetForMap as normalizeRoadDebuggerTileOffsetForMap,
    clampRoadTileOffsetForMap as clampRoadDebuggerTileOffsetForMap
} from '../road_engine/RoadEngineTileOffset.js';
