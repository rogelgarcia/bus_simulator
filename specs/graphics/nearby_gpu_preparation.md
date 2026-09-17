# Nearby GPU resource preparation

The engine prepares borrowed city resources after the visible frame, inside the
same GPU timing query. It never alters culling, source geometry, material settings,
lighting, shadows, texture resolution, tone mapping or rendered content. Visible
misses follow ordinary rendering immediately.

## Scheduling and ownership

`src/graphics/visuals/preparation/NearbyGpuPreparation.js` incrementally inspects
city meshes and plans work using distance and the final camera direction. The
lookahead is 220 m around the camera and 380 m ahead. Shared resources deduplicate;
texture jobs receive priority over small geometry jobs because their ordinary
first-use costs are much higher. A teleport cancels queued predictions.

The queue caps pending work at 256 jobs. CPU work targets 1 ms per frame, including
inspection/planning; it yields after 24 ms of existing CPU work or an asynchronous
GPU sample of 33 ms. Submission limits are 3 MiB and 16 units per frame. Texture
strips are individually limited to 256 KiB. Extra estimated resource residency is
capped at 256 MiB, plus one staging image of at most 32 MiB. These are logical
estimates, not measured driver allocations. Image decoding uses one worker and one
source bitmap with a single requested strip; encoded/decoded CPU memory is separate.

The CPU deadline is checked between units. WebGL allocation, copy/mip generation,
program link/first draw and a single buffer upload are not preemptible; overruns
are recorded. Oversize/unsupported resources fall back to ordinary rendering.
The module does not evict or dispose borrowed resources to satisfy its budget.

## Textures

Unsigned-byte RGBA file images decode in `TextureRowWorker.js`. Source
images are fetched using their existing URL. Generated canvases use ordinary
rendering: extracting their pixels can synchronously stall on GPU readback even
when `toBlob` has an asynchronous callback. The low-level adapter accepts canvases
for controlled pixel tests, but the gameplay scheduler never queues them.
Decoded rows transfer to the main thread and upload into a private staging texture.
Each upload requests the next strip without an extra animation-frame round trip.
Only after all rows are ready is the complete base image copied into the original
renderer-owned allocation and its original mip chain generated. No partial source
texture is ever exposed. A visible miss or changed/disposed source cancels staging.

The adapter is audited for Three r183 and preserves flip-Y, premultiplication,
color space, sampler identity and mips. Synthetic alpha conversion permits one
8-bit channel unit of browser rounding. Actual PBR image equivalence is tested.
Shared source/sampler allocations are tracked, including their version and
disposal. A material clone does not imply a separate native texture.

## Geometry and effects

A private 1x1 draw prepares the original geometry's buffers, one bounded geometry
per job. It uses an owned neutral material; original materials and visibility are
unchanged. Visible draw counters and shadow update flags are restored afterward.
Three's internal render-frame index stays monotonic: rewinding it would incorrectly
skip an attribute upload when prepared geometry changes before its next draw.

The final camera updates the sun emitter immediately before rendering. This fixes
false bloom activation when the old billboard crosses the new camera's near plane.
When the sun approaches the camera's field of view, the same queue allocates the
existing bloom targets one at a time and prepares its real shader programs and
first draws. Targets retain their configured dimensions. Resize/disposal cancels
stale jobs; actual effect use releases their *extra* residency accounting.

City changes, context loss and engine disposal cancel preparation and release only
owned staging objects and the worker. No separate polling loop survives teardown.
GL renderer-cache access is localized to the r183 adapters and covered by browser
tests. Rendering remains the fallback if preparation fails.

## Diagnostics and validation

`engine._nearbyGpuPreparation.diagnostics()` returns current/peak residency,
completed textures/geometries, misses, failures, queue depth, bytes, CPU costs,
nonpreemptible overruns and bloom preparation counts. The existing recording replay
stores these alongside submission-matched GPU timings. Expensive GL/ownership
profiling is opt-in and never pooled with ordinary timings.
The preparation CPU field covers scheduled scanning/planning/submissions; visible
draw observation also has a small cost, included in total frame CPU/FPS measurements.
`visibleMisses` counts resources whose queued preparation lost to a visible draw;
it does not count every unsupported or not-yet-discovered first use. Route-wide
resource growth and timing analysis remain necessary to catch those cases.

Tests: `tests/node/unit/nearby_preparation_queue.test.js` and
`tests/headless/e2e/nearby_gpu_preparation.pwtest.js`, with five-state pixel comparisons
in `tests/headless/e2e/nearby_gpu_preparation_images.pwtest.js`. AI572 holds the experiment
ledger and acceptance status. Artifacts live under
`tests/artifacts/screens/ai572_nearby_resource_preparation/` and remain ignored.
