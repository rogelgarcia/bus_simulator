// Computes the AI 597 D2 shore-wave statistics of a saved landscape offline, per sea state, from its level-2 chunks and geology sidecar on disk.
// Usage: node tools/landscape_review/shore_statistics.mjs --landscape <saved landscape directory> --output <json file> [--sea-states calm,moderate,rough]
// The same pure modules the viewer runs (LandscapeOceanField, LandscapeOceanCoast, LandscapeOceanShore) on the same rasters, so the numbers the
// browser suite asserts (crest angle, breaking depth, breaking per coastal zone) can be reproduced and tabulated without a GPU.
import path from 'node:path';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import { LANDSCAPE_OCEAN, landscapeOceanSeaState, landscapeOceanShoreInputs } from '../../src/graphics/engine3d/landscape/ocean/LandscapeOceanModel.js';
import { landscapeOceanSignificantWaveHeight } from '../../src/graphics/engine3d/landscape/ocean/LandscapeOceanSpectrum.js';
import { landscapeOceanFieldLayout, rasterizeLandscapeOceanDepth } from '../../src/graphics/engine3d/landscape/ocean/LandscapeOceanField.js';
import { landscapeOceanCoastBeachMask, landscapeOceanCoastZoneBreaking, rasterizeLandscapeOceanCoast } from '../../src/graphics/engine3d/landscape/ocean/LandscapeOceanCoast.js';
import { landscapeOceanShoreDistance, landscapeOceanShoreWaves } from '../../src/graphics/engine3d/landscape/ocean/LandscapeOceanShore.js';

const { values } = parseArgs({ options: { landscape: { type: 'string' }, output: { type: 'string' }, 'sea-states': { type: 'string', default: LANDSCAPE_OCEAN.seaStates.join(',') } } });
if (!values.landscape || !values.output) throw new Error('Usage: node tools/landscape_review/shore_statistics.mjs --landscape <directory> --output <json file> [--sea-states calm,moderate,rough]');
const directory = path.resolve(values.landscape), seaStates = values['sea-states'].split(',').map(id => landscapeOceanSeaState(id.trim()));
const manifest = JSON.parse(await readFile(path.join(directory, 'manifest.json'), 'utf8'));
const layout = landscapeOceanFieldLayout(manifest, LANDSCAPE_OCEAN.fields.extentLevel, LANDSCAPE_OCEAN.fields.texels);
const chunks = new Map();
for (const id of layout.chunkIds) {
    const descriptor = manifest.chunks.find(chunk => chunk.id === id);
    const bytes = await readFile(path.join(directory, descriptor.channels.height.url));
    chunks.set(id, { descriptor, heights: new Float32Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 4) });
}
const started = performance.now();
const { depth, statistics: depthStatistics } = rasterizeLandscapeOceanDepth(layout, manifest, chunks);
const geology = JSON.parse(await readFile(path.join(directory, LANDSCAPE_OCEAN.shore.sidecar), 'utf8'));
const pages = new Map();
for (const id of layout.chunkIds) {
    const page = geology.pages.find(entry => entry.id === id);
    pages.set(id, { fields: new Uint8Array(await readFile(path.join(directory, 'geology', page.fields.url))), categorical: new Uint8Array(await readFile(path.join(directory, 'geology', page.categorical.url))) });
}
const coast = rasterizeLandscapeOceanCoast(layout, geology, pages, manifest);
const shoreDistance = landscapeOceanShoreDistance(depth, layout.texels, layout.texelMetersX), crestMask = landscapeOceanCoastBeachMask(coast.zone);
const results = {};
for (const seaState of seaStates) {
    const inputs = landscapeOceanShoreInputs(seaState), heightMeters = landscapeOceanSignificantWaveHeight(seaState, LANDSCAPE_OCEAN.defaultQuality).continuousMeters, marchStarted = performance.now();
    const shore = landscapeOceanShoreWaves({ depth, texels: layout.texels, texelMeters: layout.texelMetersX, periodSeconds: inputs.periodSeconds, heightMeters, headingDegrees: inputs.headingDegrees, deepDepthMeters: inputs.deepDepthMeters, gamma: inputs.gamma, rock: coast.rock, shoreDistance, crestMask });
    let deepest = 0, heightMax = 0;
    for (let i = 0; i < depth.length; i++) { if (shore.breaking[i] && depth[i] > deepest) deepest = depth[i]; if (shore.waveHeight[i] > heightMax) heightMax = shore.waveHeight[i]; }
    results[seaState] = { inputs: { ...inputs, heightMeters }, statistics: shore.statistics, deepestBreakingMeters: deepest, expectedOuterBreakMeters: heightMeters / inputs.gamma, maxWaveHeightMeters: heightMax,
        zoneBreaking: landscapeOceanCoastZoneBreaking(shore.breaking, coast.zone), milliseconds: performance.now() - marchStarted };
    console.log(`${seaState}: H ${heightMeters.toFixed(2)} m, T ${inputs.periodSeconds} s, crest angle mean ${shore.statistics.crestAngle.meanDegrees.toFixed(1)} deg (p90 ${shore.statistics.crestAngle.p90Degrees.toFixed(1)}), breaking depth p90 ${shore.statistics.breakingDepth.p90.toFixed(2)} m, deepest ${deepest.toFixed(2)} m (H / gamma ${(heightMeters / inputs.gamma).toFixed(2)}), ${shore.statistics.breakingTexels} breaking texels, ${(performance.now() - marchStarted).toFixed(0)} ms`);
    for (const [zone, value] of Object.entries(results[seaState].zoneBreaking)) if (['offshore', 'reef', 'bar', 'surf', 'swash', 'platform', 'bluff-toe'].includes(zone)) console.log(`   ${zone}: ${value.breaking} / ${value.texels} breaking (${(100 * value.share).toFixed(1)} %)`);
}
const output = { format: 'landscape-ocean-shore-statistics-v1', landscape: { id: manifest.id, revision: manifest.revision, directory: values.landscape }, field: { texels: layout.texels, texelMeters: layout.texelMetersX, level: layout.level, ...depthStatistics },
    coast: coast.statistics, seaStates: results, milliseconds: performance.now() - started };
await mkdir(path.dirname(path.resolve(values.output)), { recursive: true });
await writeFile(path.resolve(values.output), `${JSON.stringify(output, null, 2)}\n`);
console.log(`written ${values.output}`);
