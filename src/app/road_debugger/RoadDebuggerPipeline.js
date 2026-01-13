// src/app/road_debugger/RoadDebuggerPipeline.js
// Backwards-compatible wrapper around the standalone road engine compute module.

export {
    resolveRoadEngineSettings as resolveRoadDebuggerSettings,
    computeRoadEngineEdges as rebuildRoadDebuggerPipeline
} from '../road_engine/RoadEngineCompute.js';
