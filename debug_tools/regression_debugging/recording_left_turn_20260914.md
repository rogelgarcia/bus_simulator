# September 14 recording: left-turn and later-view slowness

Status: recording analyzed, two route segments replayed three times each in fresh
private browsers, AI 572 updated and AI 574/575 created. No production fix was
implemented in this investigation. Measurements used current code at `0873f2b`.

## Source and interpretation

- Attachment: `C:/Users/rogel/.codex/attachments/ef8e0f13-8b94-4060-ad12-cdd66662c408/pasted-text.txt`.
- Exact copy: `tests/artifacts/screens/recording_left_turn_20260914/route.busrec`.
- SHA-256: `47e1ca96c62f5b4f92088cec745f2f97b301834fde3ef9d8c60cf923fa316ae6`.
- 9,836 samples, frames **0x132–0x279D**, approximately 214.216 seconds.
- Start timestamp: `2026-09-15T03:09:00.949Z` (September 14, 23:09 EDT).
- RTX 3060 / ANGLE D3D11, Chrome 151, Three r183, device scale 2.
- One configuration event, using recorded default values; full settings snapshot
  included. Defaults fingerprint:
  `02c6c512db517776e5047d3fa951ddd53f6707458bbdfc97c5ec98e781820002`.
- Drawing buffer 3390x1540 during driving. Four width changes during loading:
  2506 at 89.88 s, 3390 at 95.13 s, 2506 at 97.03 s, 3390 at 100.10 s.
- The capture does not identify its loaded source revision or shader hashes.
  It was supplied after the shader-cost fix; this does not prove the tab had
  reloaded that code. Keep original and current-code replay findings distinct.

All frame IDs below are hexadecimal. Times are recording elapsed sample times;
they are not necessarily frame-start times. CPU is `GameEngine.updateFrame` wall
time; GPU samples belong to the originating submission, not the frame when the
asynchronous query resolved. `dtMs` is the frame-start interval, so an expensive
update normally affects the next interval. Do not add CPU and GPU times. CPU
phase instrumentation can overlap and must not be summed blindly. FPS below is
calculated from actual frame intervals, never from inverse GPU time.

Separate these phases rather than pooling their statistics:

| Source frames | Elapsed time | State |
|---|---|---|
| 132–270 | 0.024–17.774 s | Current lighting rendered while baked data loads |
| 271–1223 | 18.524–105.526 s | 4,019 baked + viewHeld frames, not newly rendered gameplay |
| 1224–279D | 105.792–214.216 s | 5,498 rendered baked frames |

Baked generation stays 2. There is one Current-to-baked transition and no repeated
fallback during driving. The page stays visible and GPU samples are not disjoint.
Eleven GPU values are missing in the initial Current segment; all rendered baked
frames have valid samples. Low GPU time while the view is held is not evidence
that rendering the gameplay view is cheap.

## 1. Confirmed first-use stalls: update AI 572

First throttle above 0.1 occurs at **128D / 109.376 s**, sustained movement at
12A6 / 109.911 s and moving left steering at 130F / 112.151 s. The user's reported
left-turn hesitation is measurable, roughly 3.5–5 seconds after throttle starts.

| Frame | Time | Original CPU / GPU (ms) | New Geo / Tex / Progs | CPU on three fresh cold laps (ms) | GPU on three fresh cold laps (ms) |
|---|---:|---:|---:|---:|---:|
| 1326 | 112.851 s | 78.30 / 68.99 | 3 / 3 / 0 | 73.4–76.0 | 66.13–75.37 |
| 133F | 113.444 s | 78.90 / 58.43 | 12 / 3 / 0 | 63.3–64.6 | 63.31–65.39 |
| 136E | 114.412 s | 104.40 / 70.31 | 384 / 0 / 0 | 85.2–87.5 | 51.78–58.67 |
| 145B | 119.335 s | 46.20 / 29.03 | 188 / 0 / 0 | 50.7–53.3 | 26.43–34.17 |

All four events repeat at the exact source frame on each fresh lap, with identical
resource increments. Those increments disappear on the following warm laps;
event CPU time falls to approximately 19–30 ms and GPU time to 15–22 ms. The cold
render phase costs 43–80 ms. No new programs appear, sun bloom draws nothing and
shadow-stream upload cost is zero except isolated 0.3/0.4 ms overlaps. This
supports the existing first-use resource issue in AI 572 rather than a new
shadow-filter, bloom or repeated-lighting-activation ticket. Individual resource
ownership can be traced during implementation; counters are not allocation bytes.

Other coverage added to AI 572:

- **19F2 / 147.002 s**: CPU 40.9 / GPU 31.63 ms, +95 geometries in the original.
  This point has not been independently replayed.
- **25CE / 200.095 s**: original CPU 96.6 / GPU 30.30 ms, +1 geometry,
  +13 textures, +10 programs. Not reproduced by the short later-view replays:
  their cold CPU cost here is 33.4–36.1 ms, without new resources or bloom draws.
  A nearby starting pose prepares different dependencies and omits the preceding
  route. Determine the original owning pass/history before attributing this to
  buildings or effects. It is an unresolved original event, not a confirmed fix.
- Short later-view replays create their own cold-only resource spikes at **25B6**
  (+6 geo, +3 tex), **25C1** (+164 geo), **25C5** (+192 geo). All three fresh
  processes reproduce these at 64.0–65.1, 57.7–58.4 and 69.3–78.1 ms CPU;
  warm costs are 20.1–24.5, 29.2–33.1 and 32.9–36.8 ms. Programs stay at 135.
  These supplement preparation coverage but do not recreate the original route's
  resource history or the 25CE event.

## 2. Loading and first-visible stalls: new AI 574

The original capture contains approximately **87 seconds of held view**, with
substantial CPU stalls during and immediately after preparation:

| Frame | CPU / GPU (ms) | Evidence |
|---|---:|---|
| 271 | 652.4 / 2.13 | First held frame; next interval 750.1 ms |
| 492 / 4FC / 500 | 263.2 / 275.7 / 354.0 CPU | Additional preparation stalls |
| 1224 | 256.1 / 612.98 | First visible baked frame; +702 geometries, +3 textures |
| 1226 | 524.5 / 34.36 | Separate CPU stall; 1227 interval 533.5 ms |

The initial Current segment also has a 583.4 ms interval at 252 which is not
explained by its own CPU sample. Investigate startup work outside the instrumented
engine update as well; do not assign every interval to GPU or shader work.

Current-code replays have `viewPreparationMs` of **29.30–30.58 seconds** and
loading-to-activation timers of **27.22–28.00 seconds** across the six fresh runs.
Those timers are not an end-to-end startup measurement; do not equate them to the
recorded held interval or attribute all preparation to compilation. The replays
begin at different poses, do not reproduce interactive garage startup/resizes
and wait for readiness before measurement. Startup profiling remains required.

AI 574 must preserve the Final shader specialization and fixed X3595/X4000 paths
from `0873f2b`, capture loaded-source fingerprints and preparation revisions, and
compare ordinary startup with/without the recorded resizes. AI 572 owns shared
resource preparation for the first visible draw. Do not duplicate its fix or
hide stalls by extending a black/loading screen.

## 3. Sustained frame cost: new AI 575

The original recording becomes slower and then faster as the workload changes:

| Interval | Frames | Samples | CPU / GPU median (ms) | FPS | Calls / triangles median |
|---|---|---:|---:|---:|---:|
| 110–112 s | 12AB–1307 | 93 | 20.20 / 20.20 | 46.88 | 913 / 835,387 |
| 142–150 s | 1924–1A67 | 324 | 23.40 / 22.42 | 40.58 | 1,175 / 657,028 |
| 154–182 s | 1B2F–21B2 | 1,668 | 14.50 / 15.75 | 59.53 | 491 / 538,700 |
| 200–214 s | 25CE–2795 | 456 | 29.00 / 20.25 | 32.57 | 1,577 / 1,195,654 |

These are different views, not optimization before/after numbers. The increase
already starts before 25CE: frames 25C9–25CC reach CPU 33.5–34.3 ms and around
1,960 calls before that isolated allocation/program event. Heavy-view performance
remains lower on all warm replay laps. A 16.7 ms budget is exceeded often enough
for uneven 60/30 FPS presentation intervals; a separate periodic defect is not
established by this trace.

Each row below summarizes one private process: cold median, then the range of
the two warm-lap medians (or actual lap FPS). Timings are milliseconds.

| Segment / fresh run | Cold CPU / GPU | Warm CPU | Warm GPU | Warm FPS | Warm validation | Warm CPU render phase |
|---|---:|---:|---:|---:|---:|---:|
| Left / 1 | 22.15 / 21.70 | 21.15–21.70 | 21.09–21.56 | 44.92–46.05 | 6.0 | 13.55–14.00 |
| Left / 2 | 22.20 / 21.76 | 21.60–22.05 | 21.25–21.51 | 43.68–44.81 | 6.3 | 13.80–14.00 |
| Left / 3 | 20.90 / 21.06 | 21.35–22.00 | 21.16–21.37 | 45.01–45.69 | 6.0 | 13.75–13.90 |
| Later / 1 | 34.30 / 21.52 | 33.40 | 21.39–21.51 | 29.62–29.85 | 6.2 | 25.70–25.80 |
| Later / 2 | 35.10 / 21.96 | 33.30–33.70 | 21.31–21.42 | 29.63–29.70 | 6.2 | 25.80 |
| Later / 3 | 32.40 / 20.49 | 31.90–32.60 | 20.55–20.60 | 30.80–30.92 | 6.3–6.4 | 24.00–24.80 |

Receiver validation remains roughly 6 ms per frame even without source changes.
The late CPU render phase roughly doubles compared with the turn, alongside more
draw calls. Profile both; neither phase alone is proven to explain all cost.
AI 548 already optimized per-frame JSON/profile rebuilding, so this is follow-up
on remaining work, not a request to reimplement the completed optimization.
AI 497 concerns a different shadow/cascade scope. The new task must preserve bake
freshness correctness and visibility/lighting quality. Left-turn GPU time is
already about 21 ms, so eliminating CPU validation cannot alone guarantee 60 FPS.

## Other outliers and limits

- Original 1317: CPU 43.1 ms, heap drop about 25 MiB; 1580: CPU 47.4 ms, heap
  drop about 538 MiB; 265E: CPU 53.8 ms, heap drop about 123 MiB. Without a GC/CPU
  trace, heap drops are correlations only. No proven memory leak or separate GC
  ticket was created. AI 575 retains these investigation points.
- Recorder CPU median is about 0.1 ms, p95 0.4 ms, p99 0.9 ms; the 23 ms maximum
  occurs during held loading. This does not establish the recorder as the driving
  slowdown cause. External work is not fully covered by the engine CPU timer.
- First-use and persistent costs can overlap. Warm laps remove demonstrated
  resource increments; they do not make a heavy view equivalent to a light view.
- Draw/triangle ranges differ slightly between cold and warm laps: asynchronous
  state and visibility history are not reset on a lap boundary. Left-turn calls
  reach 1,100 cold versus 1,189 warm; later calls reach 1,956 versus 1,960. Do not
  use the cold/warm median difference as a controlled code-change saving.
- Shader ownership for 25CE, full startup attribution, actual GPU residency and
  source-level causes of recurring render/validation cost remain unmeasured.

## Reproduction and artifacts

The existing `tests/headless/e2e/gameplay_recording_replay.pwtest.js` ran through
`node tools/run_selected_test/run.mjs`, sequentially in six fresh private Chrome
processes, three laps per process. No production source was edited. Settings
equality against the recording was asserted (URLs normalized), including DPR 2
and 3390x1540 drawing buffer. No diagnostic draw-list/GL resource profiling was
enabled in these timing runs; lightweight CPU phase wrappers were enabled.

- Left-turn: `REPLAY_FIRST=0x12AB`, `REPLAY_LAST=0x14A0`, 502 poses/lap,
  4,518 measured frames total.
- Later-view: `REPLAY_FIRST=0x25B0`, `REPLAY_LAST=0x26C0`, 273 poses/lap,
  2,457 measured frames total.
- Both use `REPLAY_SETTINGS=recorded`, `REPLAY_LAPS=3`, 90 stationary warm-up
  frames at the first pose and no pre-driving. All 6,975 measured frames have
  unique submissions, valid GPU timing, stable baked generation 2 and visible
  page status. Bloom is irrelevant and emits zero draws throughout both replays.
- Replays apply recorded visual bus/camera poses while physics is paused. They
  do not reproduce original timing, all dynamic-actor history or the preceding
  route. Fresh test processes reset their own resources, not OS/driver caches.

Environment/settings, per-frame measurements and summaries are gitignored under
`tests/artifacts/screens/recorded_slowdown/left-turn-20260915-fresh-01/` through
`03/`, and `late-view-20260915-fresh-01/` through `03/`.

Input analysis is under `tests/artifacts/screens/recording_left_turn_20260914/`:
`expanded.json`, `rows.json`, `analysis.json`, `replays-summary.json`, extraction
poses, and one-off artifact analysis scripts. Decode through
`node tools/gameplay_recording/decode.mjs <recording> --frame 0x1326 --out <pose>`.
Keep captures/profiles/full traces out of Git. This concise research log and the
three prompts are tracked documentation; implementation and commits were not
requested in this turn.
