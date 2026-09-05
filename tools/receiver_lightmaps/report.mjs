// Summarizes measured first-pass bake, transport, frame and precision evidence.
import { readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const artifacts = path.join(root, 'tests/artifacts/screens/illumination_533');
const json = async (file) => JSON.parse(await readFile(file));
const latest = await json(path.join(artifacts, 'bake/latest.json'));
const baked = path.join(artifacts, 'bake', latest.directory);
const metrics = await json(path.join(baked, 'metrics.json'));
const index = await json(path.join(baked, 'package_index.json'));
const precision = await json(path.join(artifacts, 'atlas/precision.json'));
const captureDifferences = await json(path.join(artifacts, 'capture-differences.json'));
const measurements = await json(path.join(artifacts, 'city-measurements.json'));
if (measurements.length !== 5 || measurements.some((v) => v.name.startsWith('baked-') && v.diagnostics.receiverLightmaps.state !== 'active')) throw new Error('Five successful city modes are required.');
const rows = measurements.map((entry) => {
    const times = entry.frameTimes;
    const mean = times.reduce((a, b) => a + b, 0) / times.length;
    return { name: entry.name, medianMs: entry.medianMs, meanMs: mean,
        standardDeviationMs: Math.sqrt(times.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (times.length - 1)),
        equivalentFps: 1000 / entry.medianMs, draw: entry.draw, textures: entry.memory.textures,
        illumination: entry.diagnostics.receiverLightmaps, gpu: entry.gpu };
});
const summary = { schema: 'bus-sim-receiver-assessment-v1', bakeIdentity: latest.directory,
    cpu: os.cpus()[0].model, logicalCpus: os.cpus().length, platform: os.platform(), memoryBytes: os.totalmem(),
    profile: index.mapping.profile, metrics, precision, captureDifferences, rows };
await writeFile(path.join(artifacts, 'summary.json'), JSON.stringify(summary, null, 2));
const f = (v) => Number(v).toFixed(2);
const lines = [
    '# AI 533 — first-pass assessment', '',
    'Receiver illumination defaults off; the existing engine remains available. Blender brightness/color differences are intentional. This is partial scalar-receiver coverage, with no AO retuning or dynamic GI for the bus.', '',
    `Hardware: ${summary.cpu}; ${rows[0].gpu}. Existing Blender 5.2.1 LTS build 9e2066aef7ef, Cycles CPU, 12 threads, 64 samples, four diffuse bounces, seed 533.`, '',
    `Bake: ${f(metrics.bakeSeconds)} seconds. Atlas: ${index.mapping.pageCount} × ${index.mapping.profile.pageSize}²; ${f(metrics.atlas.occupancy * 100)}% occupancy; ${metrics.atlas.charts} charts, ${metrics.atlas.triangles} triangles, ${f(metrics.atlas.surfaceArea)} m². Texel density: ${index.mapping.profile.texelSizeMeters} m/texel; padding 16; explicit mips 0–3.`, '',
    '## Same-condition frame measurements', '',
    '1280×720, civic_center_curve_front, visibility map disabled, paused simulation; 10 warm-up and 30 measured frames per mode. Each sample calls gl.finish; RAF waiting is excluded. Equivalent FPS is 1000/median, not an observed display refresh rate. Rooftop captures use a second fixed camera and are not included in these timings.', '',
    '| Mode | Median ms | Mean ms | Std. dev. ms | Equivalent FPS | Draw calls | Triangles | Receiver GPU MiB |',
    '|---|---:|---:|---:|---:|---:|---:|---:|',
    ...rows.map((v) => `| ${v.name} | ${f(v.medianMs)} | ${f(v.meanMs)} | ${f(v.standardDeviationMs)} | ${f(v.equivalentFps)} | ${v.draw.calls} | ${v.draw.triangles} | ${f(Object.values(v.illumination.channels).reduce((s, c) => s + c.gpuBytes, 0) / 1048576)} |`), '',
    'Direct-only was measured after combined mode, so its inactive indirect channel remains cached. A fresh direct-only activation uses 173.5 MiB. Switching both receiver channels off releases their resources.', '',
    '## Channels', '',
    '| Channel | Raw float32 atlas bytes | Package bytes | Gzip bytes | Float16 relative RMSE | Maximum absolute error |',
    '|---|---:|---:|---:|---:|---:|',
    ...Object.entries(index.channels).map(([id, v]) => `| ${id} | ${metrics.receipt.outputs.filter((v) => v.channel === id).reduce((s, v) => s + v.width * v.height * 16, 0)} | ${v.bytes} | ${v.compressedBytes} | ${precision[id].relativeRmse} | ${precision[id].maximumAbsoluteError} |`), '',
    '| Channel | Download ms | Inflate ms | Validate/decode ms | Upload submission ms |',
    '|---|---:|---:|---:|---:|',
    ...Object.keys(index.channels).map((id) => {
        const v = rows.find((row) => row.illumination.channels[id]).illumination.channels[id];
        return `| ${id} | ${f(v.downloadMs)} | ${f(v.inflateMs)} | ${f(v.validateDecodeMs)} | ${f(v.uploadMs)} |`;
    }), '',
    `Initial live-city source validation: ${f(rows.find((row) => row.illumination.timings.sourceValidationMs).illumination.timings.sourceValidationMs / 1000)} seconds.`, '',
    'Download, inflate, validation/decode, upload submission, source-validation and shader-preparation timings are recorded per configuration in [summary.json](summary.json). Upload timing measures submission, not isolated GPU completion. CPU texture backing arrays are retained at roughly the reported receiver GPU byte count.', '',
    '## Decision and limits', '',
    `The rooftop coverage mask marks ${captureDifferences.mappedPixels} pixels (${f(captureDifferences.mappedScreenFraction * 100)}% of the image). Display-space changes against cached sun plus live diffuse are recorded in [capture-differences.json](capture-differences.json). These are visible-change measurements, not accuracy metrics.`, '',
    `On those bright mapped roof pixels, indirect changes RGB by ${f(captureDifferences.modes['baked-indirect'].mappedMeanAbsoluteRgb8Difference)} levels on average out of 255; direct changes it by ${f(captureDifferences.modes['baked-direct'].mappedMeanAbsoluteRgb8Difference)}. The effect in this sunny view is modest. Broader shaded-surface coverage is needed for the next visual assessment.`, '',
    'Indirect is available as an opt-in assessment preview. Direct is available experimentally with active baked shadows; it is not recommended as a default replacement for runtime direct lighting. Partial coverage and these captures do not establish a production-quality or performance benefit. Increasing samples is a separate later bake.', '',
    'Not measured: high-sample convergence/perceptual error (deferred by the initial-bake request); isolated shader/pass GPU cost (no separate timer scopes); peak CPU/GPU memory (no reliable scoped peak capture); full AI 527 route/lab and bus/seam matrix (outside the completed preview validation). Quantization RMSE measures packing only, not lighting fidelity.', '',
    '## Evidence', '',
    '- [Exact live/source comparison](source-comparison-v3.json)',
    '- [Exact live/source comparison with cached shadows](source-comparison-cached.json)',
    '- [Installed-assets city validation](installed-city-validation.log)',
    '- [52 focused Node checks](node-validation.log)',
    '- [Shader, mip and diffuse/specular check](material-stage-check.json)',
    '- [Current roofs](current-roofs.png)',
    '- [Cached sun with live diffuse lighting](cached-sun-roofs.png)',
    '- [Indirect roofs](baked-indirect-roofs.png)',
    '- [Both channels, roofs](baked-both-roofs.png)',
    '- [Direct roofs](baked-direct-roofs.png)',
    '- [Mapped surfaces (green), unmapped on hooked materials (magenta)](debug-unmapped-roofs.png)',
    '- [Indirect irradiance view](debug-indirect-roofs.png)',
    '- [Absolute diffuse difference view](debug-difference-roofs.png)',
    '- [Atlas precision](atlas/precision.json)',
    '- [Receiver provenance](atlas/receiver-provenance.json)', ''
];
await writeFile(path.join(artifacts, 'report.md'), lines.join('\n'));
console.log(JSON.stringify({ report: path.join(artifacts, 'report.md'), rows: rows.map(({ name, medianMs, meanMs, standardDeviationMs }) => ({ name, medianMs, meanMs, standardDeviationMs })) }));
