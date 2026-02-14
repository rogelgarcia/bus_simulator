# DONE

# Problem

In the Big City map, the intersection at tile `6:14` should be controlled by semaphores (traffic lights). It is a 4-way crossing where a `3x3` road crosses two `2x2` roads, but the current intersection/junction classification can misinterpret it as two separate `T` junctions (likely due to how connectivity is clustered or how lane groups are analyzed). This prevents semaphores from being selected for that intersection.

# Request

Improve intersection detection/classification so that this situation is treated as a single 4-way crossing (not two `T` junctions), and semaphores are used for traffic control at tile `6:14` in Big City.

Tasks:
- Detect when what looks like two `T` junctions are actually a single 4-way crossing in the same tile (or effectively the same intersection cluster) and classify it as a crossing.
- Ensure the updated classification drives traffic-control placement so a crossing at tile `6:14` in Big City uses semaphores.
- Avoid hardcoding tile coordinates; the detection should be based on road connectivity/topology (and lane widths/counts if needed) so similar layouts are handled correctly in other maps.
- Preserve existing behavior for true `T` junctions and other junction types.
- Add a small test (or deterministic validation hook) to prevent regressions: Big City tile `6:14` should be classified as a crossing and should select semaphore traffic control.

Nice to have:
- Add a debug readout/overlay that shows the intersection type classification per junction so it’s easy to verify when a cluster is treated as a crossing vs. multiple `T` junctions.

## On completion
- When complete mark the AI document as DONE by adding a marker in the first line
- Also rename the AI file to `AI_DONE_178_TRAFFIC_big_city_crossing_detection_for_semaphores_DONE`
- Provide a summary of the changes made in the AI document (very high level, one liner for each change)

## Summary
- RoadEngine traffic control placement now merges nearby split `T` junction pairs into an effective 4-way crossing for semaphore selection (no hardcoded tiles).
- Traffic light/stop sign props now fall back to segment-based half-widths when endpoint widths are missing, keeping placements on the sidewalk.
- Added a regression test asserting Big City tile `6:14` selects traffic lights and that placements land beyond the curb on sidewalk height.
