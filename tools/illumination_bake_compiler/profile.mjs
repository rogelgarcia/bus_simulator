// Validates the pinned AI 529 Blender toolchain and deterministic Cycles profiles.
// @ts-check

import { readFile } from 'node:fs/promises';
import { canonicalJsonStringify } from '../../src/app/illumination/bake_source/CanonicalJson.js';

export const COMPILER_PROFILE_SCHEMA = 'bus-sim-illumination-compiler-profile-v1';
export const TOOLCHAIN_SCHEMA = 'bus-sim-illumination-blender-toolchain-v1';

export const PINNED_TOOLCHAIN = Object.freeze({
    archiveByteLength: 404851964,
    archiveFileName: 'blender-5.2.1-windows-x64.zip',
    archiveSha256: '0e631dad7d0cad6d5d18abdd2e2550f6c0213215334eda00ddbd3d22b96ecb2c',
    architecture: 'x86_64',
    buildHash: '9e2066aef7ef',
    buildPlatform: 'Windows',
    executableByteLength: 113014232,
    executableRelativePath: 'blender-5.2.1-windows-x64/blender.exe',
    executableSha256: '8f7a131ad8bc148edc218b334f07d92a57f5a357fa66d913b290537fd8353c06',
    version: Object.freeze([5, 2, 1]),
    versionString: '5.2.1 LTS'
});

const SHA256 = /^[0-9a-f]{64}$/;

function fail(code, message) {
    const error = new Error(message);
    error.code = code;
    throw error;
}

function assertObject(value, label) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        fail('compiler_contract_invalid', `${label} must be an object.`);
    }
    return value;
}

function assertExactKeys(value, expected, label) {
    const actual = Object.keys(assertObject(value, label)).sort();
    const sortedExpected = [...expected].sort();
    if (actual.length !== sortedExpected.length || actual.some((key, index) => key !== sortedExpected[index])) {
        fail('compiler_contract_shape_invalid', `${label} has unsupported keys.`);
    }
}

function assertFinite(value, label, minimum = -Infinity) {
    if (!Number.isFinite(value) || value < minimum) {
        fail('compiler_profile_value_invalid', `${label} must be finite and at least ${minimum}.`);
    }
}

function assertEnum(value, allowed, label) {
    if (!allowed.includes(value)) {
        fail('compiler_profile_enum_invalid', `${label} must be one of ${allowed.join(', ')}.`);
    }
}

function assertBoolean(value, label) {
    if (typeof value !== 'boolean') fail('compiler_profile_value_invalid', `${label} must be boolean.`);
}

function assertVector(value, length, label) {
    if (!Array.isArray(value) || value.length !== length) {
        fail('compiler_profile_value_invalid', `${label} must contain ${length} values.`);
    }
    value.forEach((component, index) => assertFinite(component, `${label}[${index}]`));
}

export async function loadCompilerJson(filePath) {
    let parsed;
    try {
        parsed = JSON.parse(await readFile(filePath, 'utf8'));
    } catch (error) {
        fail('compiler_json_unreadable', `Unable to read compiler JSON '${filePath}': ${error.message}`);
    }
    canonicalJsonStringify(parsed);
    return parsed;
}

export function validateToolchainContract(value) {
    assertExactKeys(value, ['archive', 'blender', 'commandContract', 'id', 'schema'], 'toolchain');
    if (value.schema !== TOOLCHAIN_SCHEMA || value.id !== 'blender-5.2.1-lts-windows-x64-cycles-cpu-v1') {
        fail('toolchain_contract_unsupported', 'The Blender toolchain schema or ID is unsupported.');
    }
    assertExactKeys(value.archive, ['byteLength', 'fileName', 'officialIndexUrl', 'officialSha256', 'portableDownloadUrl'], 'toolchain.archive');
    assertExactKeys(value.blender, ['architecture', 'buildHash', 'buildPlatform', 'executableByteLength', 'executableRelativePath', 'executableSha256', 'version', 'versionString'], 'toolchain.blender');
    assertExactKeys(value.commandContract, ['prefix', 'separator', 'shell'], 'toolchain.commandContract');
    const comparisons = [
        [value.archive.byteLength, PINNED_TOOLCHAIN.archiveByteLength, 'archive byte length'],
        [value.archive.fileName, PINNED_TOOLCHAIN.archiveFileName, 'archive filename'],
        [value.archive.officialSha256, PINNED_TOOLCHAIN.archiveSha256, 'archive SHA-256'],
        [value.blender.architecture, PINNED_TOOLCHAIN.architecture, 'architecture'],
        [value.blender.buildHash, PINNED_TOOLCHAIN.buildHash, 'build hash'],
        [value.blender.buildPlatform, PINNED_TOOLCHAIN.buildPlatform, 'build platform'],
        [value.blender.executableByteLength, PINNED_TOOLCHAIN.executableByteLength, 'executable byte length'],
        [value.blender.executableRelativePath, PINNED_TOOLCHAIN.executableRelativePath, 'executable path'],
        [value.blender.executableSha256, PINNED_TOOLCHAIN.executableSha256, 'executable SHA-256'],
        [value.blender.versionString, PINNED_TOOLCHAIN.versionString, 'version string']
    ];
    for (const [actual, expected, label] of comparisons) {
        if (actual !== expected) fail('toolchain_contract_mismatch', `Pinned Blender ${label} does not match.`);
    }
    if (!SHA256.test(value.archive.officialSha256) || !SHA256.test(value.blender.executableSha256)
        || canonicalJsonStringify(value.blender.version) !== canonicalJsonStringify(PINNED_TOOLCHAIN.version)) {
        fail('toolchain_contract_mismatch', 'Pinned Blender digest or version tuple does not match.');
    }
    const expectedPrefix = ['--background', '--factory-startup', '--disable-autoexec', '--offline-mode', '--python-exit-code', '1', '--python'];
    if (canonicalJsonStringify(value.commandContract.prefix) !== canonicalJsonStringify(expectedPrefix)
        || value.commandContract.separator !== '--' || value.commandContract.shell !== false) {
        fail('toolchain_command_contract_mismatch', 'Pinned Blender command contract does not match the headless factory/offline policy.');
    }
    return value;
}

export function validateCompilerProfile(value) {
    assertExactKeys(value, ['alpha', 'backend', 'bake', 'camera', 'colorManagement', 'frame', 'id', 'jobs', 'lighting', 'output', 'passes', 'paths', 'sampling', 'scene', 'schema'], 'profile');
    if (value.schema !== COMPILER_PROFILE_SCHEMA || typeof value.id !== 'string' || !value.id.startsWith('ai529.proof.')) {
        fail('compiler_profile_unsupported', 'The compiler profile schema or ID is unsupported.');
    }
    assertExactKeys(value.backend, ['authoritative', 'cyclesDevice', 'engine', 'gpuAllowed', 'threads', 'threadsMode'], 'profile.backend');
    if (value.backend.authoritative !== true || value.backend.engine !== 'CYCLES'
        || value.backend.cyclesDevice !== 'CPU' || value.backend.gpuAllowed !== false
        || value.backend.threadsMode !== 'FIXED' || !Number.isSafeInteger(value.backend.threads)
        || value.backend.threads < 1) {
        fail('compiler_profile_backend_invalid', 'Authoritative profiles require fixed-thread Cycles CPU and forbid GPU selection.');
    }
    if (!Number.isSafeInteger(value.frame)) fail('compiler_profile_value_invalid', 'profile.frame must be an integer.');
    assertExactKeys(value.sampling, ['adaptiveMinSamples', 'adaptiveSampling', 'adaptiveThreshold', 'animatedSeed', 'autoScramblingDistance', 'denoising', 'directLightSamplingType', 'pattern', 'previewDenoising', 'previewSamples', 'sampleOffset', 'samples', 'scramblingDistance', 'seed', 'timeLimitSeconds', 'useGuiding', 'useSampleSubset'], 'profile.sampling');
    if (value.sampling.adaptiveSampling !== false || value.sampling.animatedSeed !== false
        || value.sampling.denoising !== false || value.sampling.previewDenoising !== false
        || value.sampling.timeLimitSeconds !== 0 || value.sampling.useGuiding !== false
        || value.sampling.useSampleSubset !== false || value.sampling.pattern !== 'TABULATED_SOBOL'
        || value.sampling.directLightSamplingType !== 'MULTIPLE_IMPORTANCE_SAMPLING') {
        fail('compiler_profile_sampling_invalid', 'Sampling must use fixed tabulated Sobol with adaptive sampling, denoising, guiding, and time limits disabled.');
    }
    for (const field of ['previewSamples', 'samples', 'sampleOffset', 'seed', 'adaptiveMinSamples']) {
        if (!Number.isSafeInteger(value.sampling[field]) || value.sampling[field] < 0) {
            fail('compiler_profile_sampling_invalid', `profile.sampling.${field} must be a non-negative integer.`);
        }
    }
    assertExactKeys(value.paths, ['diffuseBounces', 'glossyBounces', 'maxBounces', 'minLightBounces', 'minTransparentBounces', 'transmissionBounces', 'transparentBounces', 'volumeBounces'], 'profile.paths');
    for (const [name, count] of Object.entries(value.paths)) {
        if (!Number.isSafeInteger(count) || count < 0) fail('compiler_profile_paths_invalid', `profile.paths.${name} must be a non-negative integer.`);
    }
    assertExactKeys(value.scene, ['causticsReflective', 'causticsRefractive', 'clampDirect', 'clampIndirect', 'depthOfField', 'lightTree', 'motionBlur', 'objectOrder', 'proceduralRandomness', 'transparentFilm'], 'profile.scene');
    for (const field of ['causticsReflective', 'causticsRefractive', 'depthOfField', 'lightTree', 'motionBlur', 'transparentFilm']) assertBoolean(value.scene[field], `profile.scene.${field}`);
    if (value.scene.objectOrder !== 'stable_id_ascending' || value.scene.proceduralRandomness !== 'forbidden_or_seeded') {
        fail('compiler_profile_scene_invalid', 'Scene object order and randomness policy are unsupported.');
    }
    assertExactKeys(value.bake, ['clearImage', 'marginPixels', 'marginType', 'resolution', 'target', 'uvLayer'], 'profile.bake');
    if (value.bake.target !== 'IMAGE_TEXTURES' || value.bake.marginType !== 'ADJACENT_FACES'
        || value.bake.clearImage !== true || !Number.isSafeInteger(value.bake.resolution)
        || value.bake.resolution < 4 || !Number.isSafeInteger(value.bake.marginPixels)
        || value.bake.marginPixels < 0 || value.bake.uvLayer !== 'uv_proof') {
        fail('compiler_profile_bake_invalid', 'Bake target, UV, resolution, or margin policy is unsupported.');
    }
    assertExactKeys(value.output, ['authoritativeColorSpace', 'canonicalDirectory', 'canonicalPixelEncoding', 'colorDepthBits', 'colorMode', 'exrCodec', 'fileFormat', 'lossy', 'pathPolicy', 'rawDirectory', 'rowOrigin'], 'profile.output');
    if (value.output.authoritativeColorSpace !== 'scene-linear-linear-srgb'
        || value.output.canonicalPixelEncoding !== 'float32_little_endian_rgba_lower_left_v1'
        || value.output.colorDepthBits !== 32 || value.output.colorMode !== 'RGBA'
        || value.output.fileFormat !== 'OPEN_EXR' || value.output.lossy !== false
        || value.output.rowOrigin !== 'lower_left'
        || value.output.pathPolicy !== 'stage_relative_stable_job_id') {
        fail('compiler_profile_output_invalid', 'Only scene-linear 32-bit EXR plus canonical lower-left float32 RGBA output is authoritative.');
    }
    assertExactKeys(value.camera, ['clipEndMeters', 'clipStartMeters', 'depthUnits', 'orthographicScaleMeters', 'projection', 'transform'], 'profile.camera');
    assertExactKeys(value.camera.transform, ['location', 'rotationEulerRadians'], 'profile.camera.transform');
    assertVector(value.camera.transform.location, 3, 'profile.camera.transform.location');
    assertVector(value.camera.transform.rotationEulerRadians, 3, 'profile.camera.transform.rotationEulerRadians');
    if (value.camera.projection !== 'orthographic' || value.camera.depthUnits !== 'meters') {
        fail('compiler_profile_camera_invalid', 'Depth proof requires an orthographic metre-space camera.');
    }
    assertExactKeys(value.lighting, ['receiverColorPolicy', 'sunAngleRadians', 'sunColorLinearSrgb', 'sunDirectionBlender', 'sunEnergy', 'worldColorLinearSrgb', 'worldStrength'], 'profile.lighting');
    assertVector(value.lighting.sunColorLinearSrgb, 3, 'profile.lighting.sunColorLinearSrgb');
    assertVector(value.lighting.sunDirectionBlender, 3, 'profile.lighting.sunDirectionBlender');
    assertVector(value.lighting.worldColorLinearSrgb, 3, 'profile.lighting.worldColorLinearSrgb');
    if (value.lighting.receiverColorPolicy !== 'unit_diffuse_white') {
        fail('compiler_profile_lighting_invalid', 'Proof receivers must use unit-white diffuse color semantics.');
    }
    assertExactKeys(value.alpha, ['backgroundDepthSentinel', 'cutoutThreshold', 'emptyCoverage', 'opaqueCoverage'], 'profile.alpha');
    assertExactKeys(value.colorManagement, ['displayDevice', 'exposure', 'gamma', 'look', 'sequencerColorSpace', 'viewTransform'], 'profile.colorManagement');
    assertExactKeys(value.passes, ['ambientOcclusion', 'diffuseDirect', 'diffuseIndirect', 'shadowBakeForbidden'], 'profile.passes');
    if (canonicalJsonStringify(value.passes.diffuseDirect) !== '["DIRECT"]'
        || canonicalJsonStringify(value.passes.diffuseIndirect) !== '["INDIRECT"]'
        || value.passes.ambientOcclusion !== 'AO' || value.passes.shadowBakeForbidden !== true) {
        fail('compiler_profile_pass_invalid', 'Direct, indirect, AO, or forbidden SHADOW bake policy is invalid.');
    }
    const expectedJobs = ['sun_depth_position', 'diffuse_direct', 'diffuse_indirect', 'ambient_occlusion', 'transform_normal_uv_alpha', 'channel_isolation'];
    if (canonicalJsonStringify(value.jobs) !== canonicalJsonStringify(expectedJobs)) {
        fail('compiler_profile_jobs_invalid', 'The proof job inventory is incomplete or reordered.');
    }
    return value;
}
