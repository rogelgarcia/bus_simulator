// Consolidates the controlled AI 548 runs without treating smoke captures as benchmarks.
import { readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
const root = path.resolve('tests/artifacts/screens/illumination_548');
const json = async (name) => JSON.parse(await readFile(path.join(root, name)));
const stats = (values) => {
    if (!values.length) return { count: 0, mean: null, median: null, p95: null, stddev: null };
    const sorted = [...values].sort((a, b) => a - b), mean = values.reduce((a, b) => a + b, 0) / values.length;
    return { count: values.length, mean, median: (sorted[Math.floor((values.length - 1) / 2)] + sorted[Math.ceil((values.length - 1) / 2)]) / 2,
        p95: sorted[Math.ceil(values.length * .95) - 1], stddev: Math.sqrt(values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length) };
};
const rows = [], contexts = {};
for (const variant of ['baseline', 'same-coverage', 'enhanced']) {
    const data = await json(`${variant}-measurements.json`); contexts[variant] = data.context;
    if (data.errors.length || data.results.length !== 15 || data.results.some((r) => r.frames.length !== 300 || r.intervals.length !== 300)) throw new Error('Incomplete benchmark: ' + variant);
    if (variant !== 'baseline' && data.context.benchmarkContract !== 'ai548.engine-timer.uniform-rebind.v2') throw new Error('Pre-fix enhanced benchmark: ' + variant);
    for (const name of ['current', 'cached-sun', 'indirect', 'direct', 'combined']) {
        const runs = data.results.filter((r) => r.name === name);
        const receiver = runs[0].diagnostics.receiverLightmaps;
        rows.push({ variant, name, cpu: stats(runs.flatMap((r) => r.frames)), interval: stats(runs.flatMap((r) => r.intervals)),
            gpu: stats(runs.flatMap((r) => r.disjoint ? [] : r.gpu)), validation: stats(runs.flatMap((r) => r.validation)),
            synchronized: stats(runs.flatMap((r) => r.synchronized)), runCpuMeans: runs.map((r) => stats(r.frames).mean),
            draw: runs[0].draw, activationMs: runs.map((r) => r.activationMs), receiver,
            firstRunResidentGpuBytes: receiver.residentGpuBytes ?? Object.values(receiver.channels).reduce((sum, c) => sum + c.gpuBytes, 0),
            sampledHeapPeakBytes: Math.max(...runs.map((r) => r.observedHeapPeakBytes ?? 0)) });
    }
}
const loading = await json('loading/result.json');
const textureRequests = (loading.resources ?? []).filter((entry) => /\.(png|jpe?g|webp|hdr)(\?|$)/i.test(entry.name));
const loadingSummary = { pageUrl: loading.pageUrl, activationMs: loading.elapsedMs, timings: loading.diagnostics.timings,
    bindingPreparations: loading.bindingPreparations ?? [], textureRequestCount: textureRequests.length,
    textureRequestDurations: stats(textureRequests.map((entry) => entry.duration)),
    textureRequestWaits: stats(textureRequests.filter((entry) => entry.requestStart > 0).map((entry) => entry.requestStart - entry.fetchStart)),
    longestTextureRequests: [...textureRequests].sort((a, b) => b.duration - a.duration).slice(0, 10) };
const visual = await json('capture-differences.json');
const summary = { cpu: os.cpus()[0].model, contexts, rows, loading: loadingSummary, visual, precision: await json('quantization.json'), angular: await json('angular-reference.json') };
await writeFile(path.join(root, 'summary.json'), JSON.stringify(summary, null, 2));
const f = (value) => value === null || value === undefined ? 'not measured' : Number(value).toFixed(2);
const lines = ['# AI 548 measured assessment', '',
    `${summary.cpu}; ${contexts.baseline.gpu}. Chrome/D3D11, 1280×720, paused civic_center_curve_front, visibility map disabled, default lighting, final view.`, '',
    'Three alternating-order runs per mode: 30 warm-up + 300 measured frames per run. CPU submission, observed RAF frame intervals, the existing engine GPU timer (shadow preparation through postprocessing), and separate GPU-finished samples are reported separately. GPU queries cover the render command span, not individual shader instructions. Invalid/disjoint samples are omitted.', '',
    '| Implementation | Mode | CPU mean ms | CPU median ms | CPU p95 ms | Observed frame ms | Observed FPS | GPU mean ms | Validation mean ms | GPU-finished mean ms |',
    '|---|---|---:|---:|---:|---:|---:|---:|---:|---:|',
    ...rows.map((r) => `| ${r.variant} | ${r.name} | ${f(r.cpu.mean)} | ${f(r.cpu.median)} | ${f(r.cpu.p95)} | ${f(r.interval.mean)} | ${f(1000 / r.interval.mean)} | ${f(r.gpu.mean)} | ${f(r.validation.mean)} | ${f(r.synchronized.mean)} |`), '',
    'The same-coverage fixture changes storage/runtime only, using the original bake and atlas. The enhanced publication also changes coverage and stores directional coefficients, so it is a separate quality/cost comparison. RAF pacing quantizes observed FPS; CPU time alone is not displayed FPS.', '',
    '| Implementation | Combined draw calls | Triangles | Receiver GPU MiB | CPU backing MiB | CPU means across runs (ms) |',
    '|---|---:|---:|---:|---:|---|',
    ...rows.filter((r) => r.name === 'combined').map((r) => `| ${r.variant} | ${r.draw.calls} | ${r.draw.triangles} | ${f(r.firstRunResidentGpuBytes / 1048576)} | ${f(r.firstRunResidentGpuBytes / 1048576)} | ${r.runCpuMeans.map(f).join(', ')} |`), '',
    'Resident figures count owned texture storage, including explicit mips and coordinate arrays; they are not driver VRAM telemetry. Both implementations stay cached after use, so visiting both adds their resident storage. CPU geometry/source snapshots and renderer allocations are additional. Peak driver GPU memory, per-shader GPU duration and process-wide peak native CPU memory: not measured; the browser exposes no reliable dedicated counters here. Sampled JS heap peaks are recorded in summary.json and are not total process peaks. Isolated geometry-processing duration and memory-bandwidth utilization were not instrumented; draw counts and whole-render GPU timers cannot identify those costs independently.', '',
    '| Implementation | Mode | CPU stddev ms | Frame p95 ms | Frame stddev ms | GPU median ms | GPU p95 ms | GPU stddev ms | GPU samples |',
    '|---|---|---:|---:|---:|---:|---:|---:|---:|',
    ...rows.map((r) => `| ${r.variant} | ${r.name} | ${f(r.cpu.stddev)} | ${f(r.interval.p95)} | ${f(r.interval.stddev)} | ${f(r.gpu.median)} | ${f(r.gpu.p95)} | ${f(r.gpu.stddev)} | ${r.gpu.count} |`), '',
    '| Implementation | Channel mode | First activation ms | Warm activation ms, runs 2/3 | Source validation ms |',
    '|---|---|---:|---|---:|',
    ...rows.map((r) => `| ${r.variant} | ${r.name} | ${f(r.activationMs[0])} | ${r.activationMs.slice(1).map(f).join(', ')} | ${f(r.receiver.timings.sourceValidationMs)} |`), '',
    'These mode transitions also change the shadow setting. In particular, returning to current/live shadows can trigger long shader preparation; those activation times are not receiver-only warm-toggle latency. The real Options cache test below keeps the shadow setting fixed.', '',
    'Per-channel compressed bytes, download, inflate, validation/decode and upload-submission timings are in summary.json. Upload submission is not isolated GPU completion. The localhost:8001 default-page test is recorded separately under loading/. Its receiver activation timer starts after gameplay and shadow preparation, immediately before opening Options; it is not total page-startup time.', '',
    `Default-page activation: ${f(loading.elapsedMs)} ms; source validation ${f(loading.diagnostics.timings.sourceValidationMs)} ms; shader preparation ${f(loading.diagnostics.timings.prewarmMs)} ms. Geometry/attribute and hook preparation: ${loadingSummary.bindingPreparations.map((entry) => f(entry.durationMs) + ' ms, ' + entry.receivers + ' receivers, ' + entry.indexed + ' indexed, ' + f(entry.attributeBackingBytes / 1048576) + ' MiB attribute backing').join('; ') || 'not measured'}.`, '',
    `${textureRequests.length} texture resource requests began during that check. Mean request duration ${f(loadingSummary.textureRequestDurations.mean)} ms; mean pre-request interval (browser queue/connection setup) ${f(loadingSummary.textureRequestWaits.mean)} ms where exposed. Parallel request durations overlap and must not be added as serial wall time. Detailed request/response intervals are in loading/result.json; source phase timings distinguish extraction from hashing and package preparation.`, '',
    '## Decisions', '',
    '- Retain compact linear storage, shared coordinates and indexed receivers where possible. Repacked scalar maps use roughly half the original texture memory at unchanged resolution; directional indirect spends that saving on three coefficient layers.',
    '- Retain directional indirect as an opt-in quality preview. It preserves mapped normal/bump response; the 256-sample wall/overhang reference has about 3–13% RMS angular error. Full-precision flat-normal agreement and quantization error are separate metrics.',
    '- Keep direct separately optional. Its expected benefit remains limited for surfaces already receiving cached sun shadows; no automatic direct adoption or claimed speedup.',
    '- Rejected property-accessor and per-property reader optimizations after regressions. Enhanced exact source checks remain a CPU cost. A broader mutation/revision API is deferred; do not claim this implementation is faster overall.',
    '- Retain bounded publication residency and both caches on disable. Demand paging, eviction and CPU-backing disposal are deferred until expanded coverage justifies them and context recovery can preserve the requested warm toggles.',
    '- Keep individual oversized triangles, unsupported custom materials, alpha and metallic receivers live. Four pages prioritize ground and selected trims/overhangs, but most facades remain outside this publication. Secondary-bounce materials retain the existing reconstruction limits, including incomplete custom-shader and normal/bump detail. AO migration stays in AI 534; larger sample counts and higher-order angular fits remain later convergence work.', '',
    '## Validation', '',
    'The 38 focused Node checks, GPU material readbacks, context restoration, cache lifecycle, linked UI, caster identity, saved startup, real localhost:8001 cache reuse and controlled 20-second shadow-response delay passed. The actual page retained both caches through rapid switching, reopening Options and Cancel, with one enhanced source export and no repeat enhanced-map downloads.', '',
    'One earlier full-core profiling run rejected static shadows at the existing live-city/sun identity guard (activation_failure); indirect stayed active and direct retained live lighting. A repeat and the deliberate-delay regression passed, but the intermittent cause remains unisolated. Its diagnostics and trace are retained in shadow-activation-failure/. The automatic core suite also reports unrelated atmosphere/building/fog and renderer-less postprocessing fixture errors. This is not full AI 533 release validation.', '',
    '## Visual evidence', '',
    'Exposure, materials, HDRI and AO are unchanged. Green in coverage views marks mapped pixels. Ground/threshold/overhang comparisons are separate poses from the timing workload. Partial coverage produces visible boundaries where a baked triangle meets live fallback, including the overhang underside; the new publication is not a complete quality replacement for the original. More samples alone cannot repair missing coverage.', '',
    '| Pose | Mapped screen % | Mapped RGB8 change, live → indirect | Mapped RGB8 change, indirect → combined | Unmapped RGB8 change from live |',
    '|---|---:|---:|---:|---:|',
    ...Object.entries(visual.poses).map(([name, value]) => `| ${name} | ${f(value.mappedScreenFraction * 100)} | ${f(value.comparisons.live_to_indirect.mappedMeanRgb8Difference)} | ${f(value.comparisons.indirect_to_enhanced.mappedMeanRgb8Difference)} | ${f(value.unmappedMeanRgb8DifferenceFromLive)} |`), '',
    'RGB8 differences measure display visibility, not GI accuracy. Direct contributes little in these selected shaded views; the stronger visible changes come from indirect illumination.', '',
    ...['ground', 'threshold', 'overhang'].flatMap((name) => [`### ${name}`, '', `![Original preview](${path.join(root, name + '-legacy.png').replaceAll('\\', '/')})`, '', `![Enhanced preview](${path.join(root, name + '-enhanced.png').replaceAll('\\', '/')})`, ''])];
await writeFile(path.join(root, 'report.md'), lines.join('\n'));
console.log(JSON.stringify({ report: path.join(root, 'report.md'), rows: rows.filter((r) => r.name === 'combined').map((r) => ({ variant: r.variant, cpu: r.cpu.mean, gpu: r.gpu.mean, fps: 1000 / r.interval.mean })) }));
