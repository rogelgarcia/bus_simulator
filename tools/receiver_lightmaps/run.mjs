// Verifies, bakes, and packages optional receiver irradiance using AI 528/529/530.
import { readFile, writeFile, mkdir, copyFile, readdir, rename, link } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { existsSync, createReadStream } from 'node:fs';
import { gzipSync } from 'node:zlib';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseBakeSourcePackage } from '../../src/app/illumination/bake_source/index.js';
import { validateResolvedCityBakePackage } from '../../src/graphics/illumination/bake_source/BakeSourceValidation.js';
import { createReceiverAtlas, RECEIVER_LIGHTMAP_PROFILE } from '../../src/app/illumination/receiver_lightmaps/ReceiverAtlas.js';
import { COMPLETE_RECEIVER_COVERAGE, assertCompleteReceiverCoverage } from '../../src/app/illumination/receiver_lightmaps/ReceiverCoverageContract.js';
import { resolveReceiverTransport, RECEIVER_ALPHA_TRANSPORT } from '../../src/app/illumination/receiver_lightmaps/ReceiverTransportPolicy.js';
import { buildIlluminationBinaryPackage } from '../../src/app/illumination/package/index.js';
import { verifyBlenderToolchain, verifyBlenderExecutable } from '../illumination_bake_compiler/src/BlenderToolchain.mjs';
import { runBlenderProcess } from '../illumination_bake_compiler/src/BlenderProcess.mjs';
import { writeReceiverAtlas, receiverAtlasHashes, verifyReceiverAtlasFiles } from './AtlasFiles.mjs';
import { encodeReceiverRgb9e5 } from '../../src/app/illumination/receiver_lightmaps/ReceiverHdrEncoding.js';
import { readReceiverNpy, extendReceiverPage, downsampleReceiverPage } from './ReceiverPagePadding.mjs';
import { createReceiverHiddenTexelMasks } from './ReceiverSurfaceOverlap.mjs';
import { receiverChartSeams, stitchReceiverPageFiles } from './ReceiverSeamStitching.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const args = new Map();
for (let i = 2; i < process.argv.length; i += 2) args.set(process.argv[i], process.argv[i + 1]);
if (args.has('--help')) {
    console.log('Usage: node tools/receiver_lightmaps/run.mjs [--enhanced true --layout receiver-layout.json --device CPU|OPTIX] [--atlas-only true] [--input source.bsib] [--output tests/artifacts/.../bake] [--pages 4] [--samples 64] [--blender existing-blender.exe] [--archive existing-blender.zip | --installed true] [--resume partial-directory | --reprocess recovered-publication-directory]');
    process.exit(0);
}
for (const [key, value] of args) if (!['--input', '--output', '--pages', '--samples', '--blender', '--archive', '--resume', '--reprocess', '--enhanced', '--atlas-only', '--installed', '--layout', '--device', '--prepare-only'].includes(key) || !value) throw new Error('Unknown or incomplete option: ' + key);
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
const bytes = await readFile(input);
await validateResolvedCityBakePackage(bytes);
const parsed = await parseBakeSourcePackage(bytes);
const profile = { ...RECEIVER_LIGHTMAP_PROFILE,
    coverage: COMPLETE_RECEIVER_COVERAGE,
    samples: Number(args.get('--samples') ?? (args.get('--enhanced') === 'true' ? 256 : RECEIVER_LIGHTMAP_PROFILE.samples)),
    maxPages: Number(args.get('--pages') ?? RECEIVER_LIGHTMAP_PROFILE.maxPages) };
if (!Number.isInteger(profile.samples) || profile.samples < 1 || profile.samples > 4096) throw new Error('Samples must be 1–4096.');
profile.id = `ai533.cycles.diffuse.complete${profile.samples}.v2`;
if (args.get('--enhanced') === 'true') Object.assign(profile, {
    id: `ai553.cycles.surface.complete${profile.samples}.v4`, irradianceRepresentation: 'surface-diffuse-v1',
    worldDirection: 'outward-blender-z-up-v1',
    environmentSun: 'single-authored-sun-v1', environmentSunRadiusDegrees: 4,
    directRepresentation: 'hybrid-sun-visibility-v1', transportPolicy: RECEIVER_ALPHA_TRANSPORT,
    chartLayout: 'blender-smart-project-v1', packing: 'height-shelves-v1',
    coordinateLayout: 'row-chunks-v1',
    indirectEncoding: 'rgb9e5_le',
    device: args.get('--device') ?? 'CPU',
    targetBatching: 'joined-receivers-v1', rasterCoverage: 'independent-triangle-centroids-v1',
    pageTransport: 'bounded-page-shards-v1',
    pageSize: 4096, texelSizeMeters: .5, padding: 2, mipLevels: 2, compact: true,
    maxPages: Number(args.get('--pages') ?? 9)
});
const surface = profile.irradianceRepresentation === 'surface-diffuse-v1';
if (surface && !['CPU','OPTIX'].includes(profile.device)) throw new Error('Complete receiver device must be CPU or OPTIX.');
if (!surface && args.has('--device')) throw new Error('--device is supported only for the complete enhanced bake.');
if (surface && !args.has('--layout')) throw new Error('Complete enhanced baking requires --layout from tools/receiver_lightmaps/unwrap.mjs.');
let layout = surface ? JSON.parse(await readFile(path.resolve(args.get('--layout')))) : null;
const interpretedSource = surface ? { ...parsed, manifest: resolveReceiverTransport(parsed.manifest) } : parsed;
await mkdir(output, { recursive: true });
let atlas;
try {
    atlas = createReceiverAtlas(interpretedSource, profile, layout);
} catch (error) {
    if (error.code !== 'receiver_coverage_incomplete') throw error;
    await writeFile(path.join(output, 'coverage-report.json'), JSON.stringify({ sourceHash: parsed.manifest.hashes.resolvedSource, profile, ...error.coverage }, null, 2));
    console.error(error.message);
    console.error('Coverage report: ' + path.join(output, 'coverage-report.json'));
    process.exit(2);
}
await writeFile(path.join(output, 'coverage-report.json'), JSON.stringify({ sourceHash: parsed.manifest.hashes.resolvedSource, profile, ...atlas.coverage }, null, 2));
console.log(JSON.stringify({ phase: 'atlas', pages: atlas.pageCount, ...atlas.statistics }));
layout = null;
if (args.get('--atlas-only') === 'true') {
    await mkdir(output, { recursive: true });
    const { coordinates: ignored, ...description } = atlas;
    await writeReceiverAtlas(output, description);
    process.exit(0);
}
if (profile.directional && atlas.pageCount * 3 > 24) throw new Error('Complete atlas exceeds the enhanced runtime layer limit. Streaming or a revised atlas layout is required before baking.');
const mipPixels = Array.from({ length: profile.mipLevels }, (_, mip) => (profile.pageSize >> mip) ** 2).reduce((n, v) => n + v, 0);
const minimumChannelBytes = atlas.coordinates.byteLength + mipPixels * atlas.pageCount * (profile.directional ? 12 : profile.compact ? 4 : 8);
if (minimumChannelBytes > (surface ? 1024 : 512) * 1024 * 1024) throw new Error('Complete atlas exceeds the declared runtime allocation budget. A revised atlas layout is required before baking.');
const verified = installed ? {
    archive: { sha256: contract.archive.officialSha256, verification: 'source_reference_only' },
    executable: await verifyBlenderExecutable({ executablePath, contract: { fileName: 'blender.exe',
        sha256: contract.blender.executableSha256, byteLength: contract.blender.executableByteLength } })
} : await verifyBlenderToolchain({ archivePath, executablePath, contract });
const resume = args.get('--resume');
const reprocess = args.get('--reprocess');
if(reprocess && (resume || !surface))throw new Error('Reprocessing requires a complete enhanced bake, without --resume.');
const stage = resume ? path.resolve(resume) : path.join(output, `staging-${Date.now()}.partial`);
if (!stage.startsWith(output + path.sep) || !stage.endsWith('.partial')) throw new Error('Staging directory must be a .partial child of the output root.');
await mkdir(stage, { recursive: true });
if (surface) for (const name of ['optix-cache','cuda-cache']) await mkdir(path.join(stage,name),{recursive:true});
const { coordinates, ...atlasDescriptor } = atlas;
let scripts = {};
for (const dir of ['tools/illumination_bake_compiler/blender', 'tools/receiver_lightmaps/blender']) {
    for (const file of (await readdir(path.join(root, dir))).filter((v) => v.endsWith('.py')).sort()) {
        scripts[`${dir}/${file}`] = sha(await readFile(path.join(root, dir, file)));
    }
}
let job = { packageSha256: sha(bytes), archiveSha256: verified.archive.sha256,
    executableSha256: verified.executable.sha256, scripts,
    toolchainVerification: installed ? 'installed_executable_sha256_and_runtime_signature' : 'archive_and_executable_sha256',
    archiveVerification: installed ? 'source_reference_only' : 'sha256', isolatedPythonCache: true,
    ...(surface ? { layoutSha256: sha(await readFile(path.resolve(args.get('--layout')))), profileSha256: sha(Buffer.from(json(profile))),
        ...receiverAtlasHashes(atlasDescriptor) } : {}) };
const started = performance.now();
let reprocessing;
if(reprocess) {
    const source=path.resolve(reprocess);
    if(!source.startsWith(output+path.sep)||!/^[a-f0-9]{64}$/.test(path.basename(source)))throw new Error('Reprocessing source must be a completed publication under the output root.');
    const indexBytes=await readFile(path.join(source,'package_index.json'));
    if(sha(indexBytes)!==path.basename(source))throw new Error('Reprocessing publication identity mismatch');
    const originalJob=JSON.parse(await readFile(path.join(source,'job.json')));
    const {scripts:oldScripts,...oldInputs}=originalJob,{scripts:currentScripts,...newInputs}=job;
    if(json(oldInputs)!==json(newInputs))throw new Error('Reprocessing requires unchanged source, atlas, profile and Blender identity');
    await verifyReceiverAtlasFiles(source,originalJob);
    const receiptBytes=await readFile(path.join(source,'receipt.json')), receipt=JSON.parse(receiptBytes);
    const passFiles=receipt.recovery?.samples;
    if(receipt.recovery?.jobSha256!==sha(await readFile(path.join(source,'job.json')))
        ||passFiles?.length!==atlas.pageCount*2)throw new Error('Reprocessing requires authenticated recovered pass files');
    for(const pass of passFiles) {
        if(!/^(sky|bounce)\.[0-9]+\.npy$/.test(pass.file))throw new Error('Invalid recovered pass path');
        const hash=createHash('sha256');let count=0;
        for await(const bytes of createReadStream(path.join(source,pass.file))){hash.update(bytes);count+=bytes.length;}
        if(count!==pass.bytes||hash.digest('hex')!==pass.sha256)throw new Error('Recovered pass changed: '+pass.file);
        await link(path.join(source,pass.file),path.join(stage,pass.file));
    }
    for(const name of ['source.bsib','job.json','atlas.json','charts.ndjson','receipt.json','direct_receiver.0.mip0.f32'])await link(path.join(source,name),path.join(stage,name));
    job=originalJob;scripts=oldScripts;
    reprocessing={sourcePublication:path.basename(source),receiptSha256:sha(receiptBytes),
        scriptSha256:sha(await readFile(fileURLToPath(import.meta.url)))};
} else if (resume) {
    if (json(JSON.parse(await readFile(path.join(stage, 'job.json')))) !== json(job)
        || (!surface && json(JSON.parse(await readFile(path.join(stage, 'atlas.json')))) !== json(atlasDescriptor))
        || sha(await readFile(path.join(stage, 'source.bsib'))) !== job.packageSha256) throw new Error('Resume inputs or compiler do not match the completed bake.');
} else {
    await copyFile(input, path.join(stage, 'source.bsib'));
    await writeReceiverAtlas(stage, atlasDescriptor);
    await writeFile(path.join(stage, 'job.json'), json(job));
}
if (surface) await verifyReceiverAtlasFiles(stage, job);
if (args.get('--prepare-only') === 'true') {
    if (resume || reprocess) throw new Error('--prepare-only cannot resume or reprocess');
    await writeFile(path.join(output, 'prepared.json'), JSON.stringify({ stage, job }));
    process.exit(0);
}
const directions = reprocess ? [] : profile.directional ? ['0', '1', '2', '3', 'assemble'] : (resume ? [] : [null]);
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
            pythonScriptPath: path.join(root, surface ? 'tools/receiver_lightmaps/blender/bake_surface.py' : profile.directional ? 'tools/receiver_lightmaps/blender/bake_directional.py' : 'tools/receiver_lightmaps/blender/bake.py'),
            scriptArgs: direction ? [stage, direction] : [stage],
            cwd: root, env: { ...process.env, TEMP: stage, TMP: stage, BLENDER_USER_CONFIG: path.join(stage, 'config'),
                BLENDER_USER_EXTENSIONS: path.join(stage, 'extensions'),
                OPTIX_CACHE_PATH: path.join(stage,'optix-cache'), CUDA_CACHE_PATH: path.join(stage,'cuda-cache'),
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
if (surface) await verifyReceiverAtlasFiles(stage, job);
if(!reprocess)for (const [file, hash] of Object.entries(scripts)) if (sha(await readFile(path.join(root, file))) !== hash) throw new Error('Compiler script changed during bake: ' + file);
if (sha(await readFile(input)) !== job.packageSha256) throw new Error('Input changed during bake.');
const receipt = JSON.parse(await readFile(path.join(stage, 'receipt.json')));
const { charts, ...mapping } = atlasDescriptor;
let pageProcessing;
if (surface) {
    const overlap=createReceiverHiddenTexelMasks(interpretedSource,charts,profile);
    console.log(JSON.stringify({phase:'receiver_surface_overlap',...overlap.report}));
    pageProcessing = { policy: 'chart-isolated-nearest-sample-v1', overlap:overlap.report, ...(reprocessing ? {reprocessing} : {}), scripts: {} };
    for (const file of ['tools/receiver_lightmaps/ReceiverPagePadding.mjs', 'tools/receiver_lightmaps/ReceiverSurfaceOverlap.mjs', 'tools/receiver_lightmaps/ReceiverSeamStitching.mjs', 'tools/receiver_lightmaps/ReceiverVisibleSeams.mjs', 'src/app/illumination/receiver_lightmaps/ReceiverCoplanarOwnership.js', 'src/app/illumination/receiver_lightmaps/ReceiverHdrEncoding.js']) {
        pageProcessing.scripts[file] = sha(await readFile(path.join(root, file)));
    }
    const pages = [];
    for (let page = 0; page < atlas.pageCount; page++) {
        const sky = await readReceiverNpy(path.join(stage, `sky.${page}.npy`), profile.pageSize);
        const bounce = await readReceiverNpy(path.join(stage, `bounce.${page}.npy`), profile.pageSize);
        // Reassemble from the verified Cycles passes, including during offline
        // reprocessing. Never trust an interrupted assembled output by length alone.
        let data=new Float32Array(sky.length);
        for(let i=0;i<data.length;i++)data[i]=i%4===3 ? 1 : Math.fround(sky[i]+bounce[i])*Math.fround(Math.PI);
        const report = extendReceiverPage(data, sky, bounce, page, charts, profile,overlap.masks.get(page));
        report.mips = [];
        for (let mip = 0; mip < profile.mipLevels; mip++) {
            await writeFile(path.join(stage, `seam-input.${page}.mip${mip}.f32`), Buffer.from(data.buffer, data.byteOffset, data.byteLength));
            if (mip + 1 < profile.mipLevels) data = downsampleReceiverPage(data, profile.pageSize >> mip);
        }
        pages.push(report);
        console.log(JSON.stringify({ phase: 'receiver_page_extension', ...report }));
    }
    const seams = receiverChartSeams(interpretedSource, charts, profile);
    console.log(JSON.stringify({ phase: 'receiver_seams', sharedCoplanarEdges: seams.length }));
    // Atlas geometry is already authenticated on disk. The solve and package
    // need only filter edges and coordinate rows, not millions of source charts.
    charts.length = 0;
    overlap.masks.clear();
    pageProcessing.seams = await stitchReceiverPageFiles(stage, seams, profile, atlas.pageCount);
    for (const report of pageProcessing.seams) console.log(JSON.stringify({ phase: 'receiver_seam_stitching', ...report }));
    for (let page = 0; page < atlas.pageCount; page++) for (let mip = 0; mip < profile.mipLevels; mip++) {
        const source = await readFile(path.join(stage, `seam-input.${page}.mip${mip}.f32`));
        const encoded = encodeReceiverRgb9e5(new Float32Array(source.buffer, source.byteOffset, source.byteLength/4));
        const bytes = Buffer.from(encoded.buffer, encoded.byteOffset, encoded.byteLength);
        await writeFile(path.join(stage, `processed.${page}.mip${mip}.u32`), bytes);
        pages[page].mips.push({ mip, sha256: sha(bytes), bytes: bytes.length });
    }
    // This report is inside the authenticated mapping in every channel package.
    // Source atlas files remain unchanged and can still verify a resumed bake.
    mapping.coverage = { ...mapping.coverage, raster: {
        schema: 'bus-sim-receiver-raster-coverage-v1', policy: pageProcessing.policy,
        triangles: pages.reduce((n, p) => n + p.triangles, 0), charts: pages.reduce((n, p) => n + p.charts, 0),
        emptyCharts: 0, missingReceiverSamples: 0, seams: pageProcessing.seams, pages
    } };
    assertCompleteReceiverCoverage(mapping);
    await writeFile(path.join(stage, 'processed-coverage.json'), JSON.stringify(mapping.coverage.raster, null, 2));
}
// Chart geometry is an offline artifact; runtime addresses are entirely in the coordinate table.
if (!surface) mapping.charts = charts.map(({ id, page, x, y, width, height, chunkId }) => ({ id, page, x, y, width, height, chunkId }));
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
    if (profile.compact && !(surface && channel === 'indirect_irradiance')) for (const item of outputs.filter((v) => v.mip === 0)) {
        const raw = await readFile(path.join(stage, item.file));
        const data = new Float32Array(raw.buffer, raw.byteOffset, raw.byteLength / 4);
        const low = [Infinity, Infinity, Infinity, Infinity], high = [-Infinity, -Infinity, -Infinity, -Infinity];
        for (let i = 0; i < data.length; i++) { const c = i % 4; low[c] = Math.min(low[c], data[i]); high[c] = Math.max(high[c], data[i]); }
        ranges.set(item.page, { bias: low, scale: high.map((v, c) => v - low[c]) });
    }
    const chunks = surface ? Array.from({ length: Math.ceil(atlas.tableHeight/2048) }, (_, i) => {
        const firstRow = i*2048, height = Math.min(2048, atlas.tableHeight-firstRow);
        return { id: `mapping.coordinates.${String(i).padStart(4, '0')}`, channelId: 'receiver_mapping',
            data: coordinates.subarray(firstRow*atlas.tableWidth*4, (firstRow+height)*atlas.tableWidth*4),
            resourceType: 'texture_2d', encoding: 'rgba32f_le', precision: 'float32',
            dimensions: { width: atlas.tableWidth, height, depth: 1, components: 4 }, rowOrigin: 'lower_left',
            coordinateTransform: { schema: 'bus-sim-receiver-mapping-rows-v1', firstRow, ...(i === 0 ? { mapping } : {}) },
            mipLevel: 0, requiredRuntimeCapabilities: [] };
    }) : [{ id: 'mapping.coordinates', channelId: 'receiver_mapping', data: coordinates,
        resourceType: 'texture_2d', encoding: 'rgba32f_le', precision: 'float32',
        dimensions: { width: atlas.tableWidth, height: atlas.tableHeight, depth: 1, components: 4 },
        rowOrigin: 'lower_left', coordinateTransform: { schema: 'bus-sim-receiver-mapping-coordinates-v1', mapping },
        mipLevel: 0, requiredRuntimeCapabilities: [] }];
    for (const item of outputs) {
        if (surface && channel === 'indirect_irradiance') {
            const raw = await readFile(path.join(stage, `processed.${item.page}.mip${item.mip}.u32`));
            chunks.push({ id: `${channel}.page${String(item.page).padStart(4,'0')}.mip${item.mip}`, channelId: channel,
                data: new Uint32Array(raw.buffer, raw.byteOffset, raw.byteLength / 4), resourceType:'texture_2d', encoding:'rgb9e5_le', precision:'shared_exponent_rgb9',
                dimensions:{width:item.width,height:item.height,depth:1,components:1},rowOrigin:'lower_left',
                coordinateTransform:{schema:'bus-sim-rgb9e5-lightmap-page-v1',page:item.page,irradianceUnits:'pi_times_unit_white_lambert_radiance'},
                mipLevel:item.mip, requiredRuntimeCapabilities:['receiver_rgb9e5_sampling_v1'] });
            continue;
        }
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
    const build = (selectedChunks, receiverPageShards = []) => buildIlluminationBinaryPackage({ cityId: parsed.manifest.source.cityId,
        lightingProfileId: profile.id, selectedCapabilityProfileId: capability,
        source: { resolvedSourceSha256: parsed.manifest.hashes.resolvedSource, sourcePackageSha256: job.packageSha256,
            ...(receiverPageShards.length ? { receiverPageShards } : {}) },
        compilerDescriptor: { signature: receipt.signature, executableSha256: job.executableSha256, scripts, profile,
            ...(receipt.independentPasses ? { independentPasses: receipt.independentPasses } : {}),
            ...(receipt.recovery ? { recovery: {
                policy: receipt.recovery.policy, scriptSha256: receipt.recovery.scriptSha256,
                jobSha256: receipt.recovery.jobSha256,
                passFiles: receipt.recovery.samples.map(({ file, bytes, sha256 }) => ({ file, bytes, sha256 })),
                ...(receipt.recovery.resumedSky ? {
                    resumedSkyScriptSha256: receipt.recovery.resumedSky.scriptSha256,
                    referenceJobSha256: receipt.recovery.resumedSky.referenceJobSha256
                } : {})
            } } : {}),
            ...(pageProcessing ? { pageProcessing } : {}) },
        channels: [{ id: channel, required: true, sourceSha256: sourceHash, profileSha256: profileHash },
            { id: 'receiver_mapping', required: true, sourceSha256: mappingHash, profileSha256: profileHash }], chunks:selectedChunks });
    const shards = [];
    const groups = surface && channel === 'indirect_irradiance'
        ? Array.from({length:Math.ceil(atlas.pageCount/4)},(_,i)=>chunks.filter(c=>c.channelId==='receiver_mapping'
            || (c.coordinateTransform.page>=i*4 && c.coordinateTransform.page<(i+1)*4))) : [chunks];
    for(let part=1;part<groups.length;part++) {
        const child=await build(groups[part]), compressed=gzipSync(child.bytes,{level:9});
        const url=`${channel}.part${part}.ilpkg.gz`;
        await writeFile(path.join(stage,url),compressed);
        shards.push({url,aggregateSha256:child.aggregateSha256,bytes:child.bytes.length,compressedBytes:compressed.length});
    }
    // The root package authenticates every additional page package. Each file
    // retains the unchanged 512 MiB container limit and exact source identity.
    const packaged = await build(groups[0], shards);
    const packed = gzipSync(packaged.bytes, { level: 9 });
    await writeFile(path.join(stage, `${channel}.ilpkg.gz`), packed);
    index.channels[channel] = { url: `${channel}.ilpkg.gz`, sourceSha256: sourceHash, aggregateSha256: packaged.aggregateSha256,
        profileSha256: profileHash, mappingSha256: mappingHash, bytes: packaged.bytes.length, compressedBytes: packed.length };
    metrics.channels[channel] = { ...packaged.metrics, gzipBytes: packed.length,
        shards, totalGzipBytes:packed.length+shards.reduce((sum,s)=>sum+s.compressedBytes,0) };
}
await writeFile(path.join(stage, 'package_index.json'), json(index));
await writeFile(path.join(stage, 'metrics.json'), JSON.stringify(metrics, null, 2));
const promoted = path.join(output, sha(Buffer.from(json(index))));
await rename(stage, promoted);
await writeFile(path.join(output, 'latest.json'), JSON.stringify({ directory: path.basename(promoted) }));
console.log(JSON.stringify({ promoted, metrics: { bakeSeconds: metrics.bakeSeconds, channels: metrics.channels } }));
