# Problem

The static sun-depth cache from AI 531 is incomplete until the moving bus can receive shadows from buildings, trees, overhangs, and other static objects. Conversely, the static cache cannot contain the bus because updating it would recreate the per-frame cost the cache is meant to remove.

The bus therefore needs two complementary paths: fragment-level sampling of cached static visibility, and a small dynamic shadow map containing the bus for self-shadowing and bus-to-world shadows.

# Request

Integrate the moving bus with the optional static sun cache and implement a separate bus-only dynamic shadow layer. Preserve the current shadow engine as the complete runtime fallback and do not implement a second competing bus-shadow system from AI 498.

## Execution gate

- Do not start until AI 527 through AI 531 are DONE.
- Audit the current Three.js version and AI 498 before coding. Reuse its verified shadow-lab cases, texel snapping, low-sun extent, bias, measurement pitfalls, and composition findings.
- AI 532 supersedes AI 498's overlapping bus-map and cascade-retuning phases when this prompt ships. If a Three.js upgrade is still required, isolate and complete that compatibility work first rather than silently combining it here.

Tasks:
- Register all bus materials/receivers with the arbitrary-world-position static visibility sampler from AI 531.
- Sample cached static depth per bus fragment so partial static shadows move correctly across the roof, sides, front, rear, windows where semantically valid, wheels, and other body parts as the bus drives.
- Preserve alpha/transparency, glass, emissive lights, normal maps, material variation, clear coat/specular behavior, and the direct-sun-only attenuation contract.
- Validate building, foliage, pole/sign, overhang, low-sun, and tile-boundary shadows crossing a moving bus. Avoid whole-bus binary darkening based only on its ground position.
- Implement a separate bus-only dynamic directional shadow render target and orthographic camera fitted to the bus plus the complete extent of its cast shadow at the active sun elevation.
- Render only registered dynamic bus caster geometry into that map; do not include the static city.
- Texel-snap the dynamic projection and interpolate from the render pose used by visible bus geometry so the shadow does not crawl, step, or lag under uneven frame rates.
- Composite dynamic and cached visibility through the illumination shader hook using mathematically explicit visibility composition. Avoid seams or bias mismatches where the two paths overlap.
- Let the bus dynamic map provide:
  - bus self-shadowing on the bus;
  - bus-to-road/terrain/curb/sidewalk/building/prop shadows on world receivers;
  - a registration path extensible to future moving vehicles or pedestrians without changing the static cache format.
- Define how transparent/cutout bus parts cast and receive, and prevent self-shadow acne or missing underside/roof detail.
- Keep the existing bus contact-shadow rig available until AI 534 decides its measured role. Do not remove it merely because a directional bus map exists.
- In `current` mode, use the existing live shadow path exactly as before and disable/dispose the optional static/dynamic add-on resources as defined by AI 530.
- In baked-development mode, use cached static visibility plus the dynamic bus layer; do not submit the static city to the bus dynamic map.
- Make missing/unready cache assets retain current shadows. Do not activate a bus-only baked mode that would leave the bus unable to receive static shadows.
- Add debug views for cached visibility on the bus, bus dynamic depth, projection bounds, cast-shadow extent, texel density, bias, receiver composition, and current-vs-hybrid differences.
- Add deterministic driving tests, not only fixed poses, at high and low FPS, multiple sun elevations, camera distances, route turns, tile boundaries, overhang entries/exits, and current/baked mode switches.
- Benchmark the full hybrid against the current single/cascade presets using the repository's controlled same-page methodology. Separate static-cache sampling cost, bus-map render cost, current shadow-pass work removed, and whole-frame results.

Acceptance requirements:
- Other static objects cast spatially correct partial shadows onto the moving bus.
- The bus casts and self-shadows without forcing any static-world shadow rerender.
- Camera/bus motion produces no lag, crawling, clipping, popping, or join seam above the documented tolerance.
- Current mode remains unchanged and always available; incomplete baked capability cannot activate.
- Only one bus-specific dynamic shadow implementation is authoritative after migration.

## On completion

- Mark the AI document as DONE in the first line.
- Rename it to `prompts/AI_DONE_532_VEHICLES_static_world_to_bus_and_dynamic_bus_shadows_DONE.md`.
- Do not move it to `prompts/archive/` automatically.
- Update/document AI 498's disposition so future work cannot implement the superseded bus-shadow path in parallel.
- Add a concise completion summary linking shader/runtime modules, tests, driving captures, debug views, migration notes, and fallback behavior.
- Include same-condition current-vs-hybrid tables with frame time/FPS, whole-frame and shadow-pass calls/triangles, CPU/GPU shadow time, bus-map cost, texture memory, payload/load cost, hardware, resolution, settings, route, warm-up, sample count, statistic, and variance. Mark unavailable metrics as `not measured` with a reason.
