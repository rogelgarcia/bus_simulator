// Verifies, bakes, and packages optional receiver irradiance using AI 528/529/530.
import { readFile, writeFile, mkdir, copyFile, readdir, rename } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseBakeSourcePackage } from '../../src/app/illumination/bake_source/index.js';
import { validateResolvedCityBakePackage } from '../../src/graphics/illumination/bake_source/BakeSourceValidation.js';
import { createReceiverAtlas, RECEIVER_LIGHTMAP_PROFILE } from '../../src/app/illumination/receiver_lightmaps/ReceiverAtlas.js';
import { buildIlluminationBinaryPackage } from '../../src/app/illumination/package/index.js';
import { verifyBlenderToolchain, verifyBlenderExecutable } from '../illumination_bake_compiler/src/BlenderToolchain.mjs';
import { runBlenderProcess } from '../illumination_bake_compiler/src/BlenderProcess.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const args = new Map();
for (let i = 2; i < process.argv.length; i += 2) args.set(process.argv[i], process.argv[i + 1]);
if (args.has('--help')) {
    console.log('Usage: node tools/receiver_lightmaps/run.mjs [--enhanced true] [--input source.bsib] [--output tests/artifacts/.../bake] [--pages 4] [--samples 64] [--blender existing-blender.exe] [--archive existing-blender.zip | --installed true] [--resume partial-directory]');
    process.exit(0);
}
for (const [key, value] of args) if (!['--input', '--output', '--pages', '--samples', '--blender', '--archive', '--resume', '--enhanced', '--atlas-only', '--installed'].includes(key) || !value) throw new Error('Unknown or incomplete option: ' + key);
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const json = (value) => JSON.stringify(value);
const input = path.resolve(args.get('--input') ?? 'tests/artifacts/illumination_528/ai533_v3/bigcity2.bsib');
const output = path.resolve(args.get('--output') ?? 'tests/artifacts/screens/illumination_533/bake');
if (!output.startsWith(path.join(root, 'tests', 'artifacts') + path.sep)) throw new Error('Bake output must be a task directory inside tests/artifacts.');
const toolchainRoot = 'C:/Users/rogel/Projects/bus_simulator/tests/artifacts/illumination_529/toolchain';
const executablePath = path.resolve(args.get('--blender') ?? `${toolchainRoot}/portable/blender-5.2.1-windows-x64/blender.exe`);
const archivePath = path.resolve(args.get('--archive') ?? `${toolchainRoot}/blender-5.2.1-windows-x64.zip`);
const contract = JSON.parse(await readFile(path.join(root, 'tools/illumination_bake_compiler/toolchain.v1.json')));
const installed = args.get('--installed') === 'true';
const verified = installed ? {
    archive: { sha256: contract.archive.officialSha256, verification: 'source_reference_only' },
    executable: await verifyBlenderExecutable({ executablePath, contract: { fileName: 'blender.exe',
        sha256: contract.blender.executableSha256, byteLength: contract.blender.executableByteLength } })
} : await verifyBlenderToolchain({ archivePath, executablePath, contract });
const bytes = await readFile(input);
await validateResolvedCityBakePackage(bytes);
const parsed = await parseBakeSourcePackage(bytes);
const profile = { ...RECEIVER_LIGHTMAP_PROFILE,
    samples: Number(args.get('--samples') ?? RECEIVER_LIGHTMAP_PROFILE.samples),
    maxPages: Number(args.get('--pages') ?? RECEIVER_LIGHTMAP_PROFILE.maxPages) };
if (!Number.isInteger(profile.samples) || profile.samples < 1 || profile.samples > 4096) throw new Error('Samples must be 1–4096.');
profile.id = `ai533.cycles.diffuse.preview${profile.samples}.v1`;
if (args.get('--enhanced') === 'true') Object.assign(profile, {
    id: `ai548.cycles.directional.preview${profile.samples}.v3`, directional: 'chart-affine-irradiance-v1', coefficientLayout: 'flat-first-rgb-v1', denoise: 'isolated-chart-oidn-v1',
    patchSizeMeters: 24, minimumChartArea: .5, focus: [-140, 0, 80], compact: true
});
const atlas = createReceiverAtlas(parsed, profile);
console.log(JSON.stringify({ phase: 'atlas', pages: atlas.pageCount, ...atlas.statistics }));
if (args.get('--atlas-only') === 'true') {
    await mkdir(output, { recursive: true });
    const { coordinates: ignored, ...description } = atlas;
    await writeFile(path.join(output, 'atlas-preview.json'), JSON.stringify(description));
    process.exit(0);
}
const resume = args.get('--resume');
const stage = resume ? path.resolve(resume) : path.join(output, `staging-${Date.now()}.partial`);
if (!stage.startsWith(output + path.sep) || !stage.endsWith('.partial')) throw new Error('Staging directory must be a .partial child of the output root.');
await mkdir(stage, { recursive: true });
const { coordinates, ...atlasDescriptor } = atlas;
const scripts = {};
for (const dir of ['tools/illumination_bake_compiler/blender', 'tools/receiver_lightmaps/blender']) {
    for (const file of (await readdir(path.join(root, dir))).filter((v) => v.endsWith('.py')).sort()) {
        scripts[`${dir}/${file}`] = sha(await readFile(path.join(root, dir, file)));
    }
}
const job = { packageSha256: sha(bytes), archiveSha256: verified.archive.sha256,
    executableSha256: verified.executable.sha256, scripts,
    toolchainVerification: installed ? 'installed_executable_sha256_and_runtime_signature' : 'archive_and_executable_sha256',
    archiveVerification: installed ? 'source_reference_only' : 'sha256', isolatedPythonCache: true };
const started = performance.now();
if (resume) {
    if (json(JSON.parse(await readFile(path.join(stage, 'job.json')))) !== json(job)
        || json(JSON.parse(await readFile(path.join(stage, 'atlas.json')))) !== json(atlasDescriptor)
        || sha(await readFile(path.join(stage, 'source.bsib'))) !== job.packageSha256) throw new Error('Resume inputs or compiler do not match the completed bake.');
} else {
    await copyFile(input, path.join(stage, 'source.bsib'));
    await writeFile(path.join(stage, 'atlas.json'), json(atlasDescriptor));
    await writeFile(path.join(stage, 'job.json'), json(job));
}
const directions = profile.directional ? ['0', '1', '2', '3', 'assemble'] : (resume ? [] : [null]);
for (const direction of directions) {
    const checkpoint = direction && direction !== 'assemble' ? path.join(stage, `direction.${direction}.json`) : null;
    if (checkpoint && existsSync(checkpoint)) {
        const completed = JSON.parse(await readFile(checkpoint));
        if (completed.jobSha256 !== sha(Buffer.from(json(job))) || completed.direction !== Number(direction)) throw new Error('Directional checkpoint job mismatch');
        for (const file of completed.files) {
            if (path.basename(file.name) !== file.name) throw new Error('Invalid checkpoint path');
            const data = await readFile(path.join(stage, file.name));
            if (data.byteLength !== file.bytes || sha(data) !== file.sha256) throw new Error('Directional checkpoint output mismatch');
        }
        console.log(JSON.stringify({ phase: 'reuse_direction', direction }));
        continue;
    }
    console.log(JSON.stringify({ phase: 'blender', direction, stage }));
    try {
        const processResult = await runBlenderProcess({ executablePath,
            pythonScriptPath: path.join(root, profile.directional ? 'tools/receiver_lightmaps/blender/bake_directional.py' : 'tools/receiver_lightmaps/blender/bake.py'),
            scriptArgs: direction ? [stage, direction] : [stage],
            cwd: root, env: { ...process.env, TEMP: stage, TMP: stage, BLENDER_USER_CONFIG: path.join(stage, 'config'),
                PYTHONPATH: '', PYTHONHOME: '', PYTHONPYCACHEPREFIX: path.join(stage, 'python-cache'), PYTHONDONTWRITEBYTECODE: '1' },
            timeoutMs: 7_200_000 }, {
            // Avoid shared installation bytecode caches without modifying an occupied Blender installation.
            spawnImpl: (executable, argv, options) => spawn(executable, ['--python-use-system-env', ...argv], options)
        });
        await writeFile(path.join(stage, `blender.${direction ?? 'scalar'}.log`), processResult.stdout + processResult.stderr);
    } catch (error) {
        await writeFile(path.join(stage, 'failure.json'), JSON.stringify({ code: error.code, context: error.context }));
        throw error;
    }
}
for (const [file, hash] of Object.entries(scripts)) if (sha(await readFile(path.join(root, file))) !== hash) throw new Error('Compiler script changed during bake: ' + file);
if (sha(await readFile(input)) !== job.packageSha256) throw new Error('Input changed during bake.');
const receipt = JSON.parse(await readFile(path.join(stage, 'receipt.json')));
const { charts, ...mapping } = atlasDescriptor;
mapping.charts = charts.map(({ id, page, x, y, width, height, chunkId }) => ({ id, page, x, y, width, height, chunkId }));
const mappingBytes = Buffer.from(json(mapping));
const mappingHash = sha(Buffer.concat([mappingBytes, Buffer.from(coordinates.buffer)]));
const profileHash = sha(Buffer.from(json(profile)));
const index = { schema: 'bus-sim-receiver-lightmap-index-v1', cityId: parsed.manifest.source.cityId,
    profileId: profile.id, mapping, channels: {}, sourceProfiles: parsed.manifest.lightingProfiles,
    sourceHash: parsed.manifest.hashes.resolvedSource };
const metrics = { bakeSeconds: receipt.seconds, receipt, atlas: atlas.statistics, channels: {} };
for (const channel of ['direct_receiver', 'indirect_irradiance']) {
    const outputs = receipt.outputs.filter((v) => v.channel === channel);
    const ranges = new Map();
    if (profile.compact) for (const item of outputs.filter((v) => v.mip === 0)) {
        const raw = await readFile(path.join(stage, item.file));
        const data = new Float32Array(raw.buffer, raw.byteOffset, raw.byteLength / 4);
        const low = [Infinity, Infinity, Infinity, Infinity], high = [-Infinity, -Infinity, -Infinity, -Infinity];
        for (let i = 0; i < data.length; i++) { const c = i % 4; low[c] = Math.min(low[c], data[i]); high[c] = Math.max(high[c], data[i]); }
        ranges.set(item.page, { bias: low, scale: high.map((v, c) => v - low[c]) });
    }
    const chunks = [{ id: 'mapping.coordinates', channelId: 'receiver_mapping', data: coordinates,
        resourceType: 'texture_2d', encoding: 'rgba32f_le', precision: 'float32',
        dimensions: { width: atlas.tableWidth, height: atlas.tableHeight, depth: 1, components: 4 },
        rowOrigin: 'lower_left', coordinateTransform: { schema: 'bus-sim-receiver-mapping-coordinates-v1', mapping },
        mipLevel: 0, requiredRuntimeCapabilities: [] }];
    for (const item of outputs) {
        const raw = await readFile(path.join(stage, item.file));
        let data = new Float32Array(raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength));
        const decode = ranges.get(item.page);
        if (decode) {
            const packed = new Uint8Array(data.length);
            for (let i = 0; i < data.length; i++) { const c = i % 4; packed[i] = decode.scale[c] ? Math.max(0, Math.min(255, Math.round((data[i] - decode.bias[c]) / decode.scale[c] * 255))) : 0; }
            data = packed;
        }
        chunks.push({ id: `${channel}.page${String(item.page).padStart(4, '0')}.mip${item.mip}`, channelId: channel,
            data, resourceType: 'texture_2d', encoding: decode ? 'rgba8_unorm' : 'rgba16f_le', precision: decode ? 'unorm8' : 'float16',
            dimensions: { width: item.width, height: item.height, depth: 1, components: 4 }, rowOrigin: 'lower_left',
            coordinateTransform: { schema: decode ? 'bus-sim-directional-lightmap-page-v1' : 'bus-sim-receiver-lightmap-page-v1', page: item.page,
                irradianceUnits: 'pi_times_unit_white_lambert_radiance', ...(decode ? { decode } : {}) },
            mipLevel: item.mip, requiredRuntimeCapabilities: decode ? ['receiver_directional_sampling_v1',
                ...(profile.coefficientLayout === 'flat-first-rgb-v1' ? ['receiver_directional_flat_first_v1'] : [])] : [] });
    }
    const sourceHash = parsed.manifest.hashes.channelSources.find((v) => v.id === channel).sha256;
    const capability = profile.directional ? `development.directional_${channel === 'direct_receiver' ? 'direct' : 'indirect'}_v1`
        : channel === 'direct_receiver' ? 'development.receiver_direct_v1' : 'development.receiver_indirect_v1';
    const packaged = await buildIlluminationBinaryPackage({ cityId: parsed.manifest.source.cityId,
        lightingProfileId: profile.id, selectedCapabilityProfileId: capability,
        source: { resolvedSourceSha256: parsed.manifest.hashes.resolvedSource, sourcePackageSha256: job.packageSha256 },
        compilerDescriptor: { signature: receipt.signature, executableSha256: job.executableSha256, scripts, profile },
        channels: [{ id: channel, required: true, sourceSha256: sourceHash, profileSha256: profileHash },
            { id: 'receiver_mapping', required: true, sourceSha256: mappingHash, profileSha256: profileHash }], chunks });
    const packed = gzipSync(packaged.bytes, { level: 9 });
    await writeFile(path.join(stage, `${channel}.ilpkg.gz`), packed);
    index.channels[channel] = { url: `${channel}.ilpkg.gz`, sourceSha256: sourceHash, aggregateSha256: packaged.aggregateSha256,
        profileSha256: profileHash, mappingSha256: mappingHash, bytes: packaged.bytes.length, compressedBytes: packed.length };
    metrics.channels[channel] = { ...packaged.metrics, gzipBytes: packed.length };
}
await writeFile(path.join(stage, 'package_index.json'), json(index));
await writeFile(path.join(stage, 'metrics.json'), JSON.stringify(metrics, null, 2));
const promoted = path.join(output, sha(Buffer.from(json(index))));
await rename(stage, promoted);
await writeFile(path.join(output, 'latest.json'), JSON.stringify({ directory: path.basename(promoted) }));
console.log(JSON.stringify({ promoted, metrics: { bakeSeconds: metrics.bakeSeconds, channels: metrics.channels } }));
