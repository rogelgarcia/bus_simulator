// Creates strict canonical AI 529 static-depth proof fixtures for tool tests.

import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { canonicalJsonStringify } from '../../../../src/app/illumination/bake_source/CanonicalJson.js';
import {
    INTERMEDIATE_CANONICAL_ENCODING,
    INTERMEDIATE_MANIFEST_SCHEMA,
    INTERMEDIATE_RAW_FORMAT
} from '../../../../tools/illumination_bake_compiler/src/IntermediateManifest.mjs';

const HASH = 'a'.repeat(64);

export function depthDescriptor() {
    return {
        alphaCutout: {
            comparison: 'coverage_greater_or_equal_threshold_is_present',
            compiledRepresentation: 'deterministic_silhouette_geometry',
            coveredCellCount: 2,
            maskDimensions: [2, 2],
            threshold: '0.5',
            transparentCellCount: 2
        },
        authoritativeBackend: 'cycles_cpu',
        camera: {
            clipFarMeters: '11',
            clipNearMeters: '1',
            locationMeters: ['0', '0', '6'],
            orthographicBoundsMeters: { bottom: '-1.0', left: '-1.0', right: '1.0', top: '1.0' },
            projection: 'right_handed_orthographic_camera_looks_negative_z'
        },
        colorSpace: 'raw_non_color_linear_float32',
        components: [
            'light_space_x_meters',
            'light_space_y_meters',
            'nearest_positive_depth_meters',
            'occupancy'
        ],
        emptySentinel: ['0', '0', '0', '0'],
        nearestVisibilityRule: 'cycles_camera_primary_visibility_first_surface',
        occupiedAlpha: '1_at_unfiltered_interior_samples',
        semantic: 'orthographic_light_space_position_and_nearest_depth'
    };
}

export function defaultPixels() {
    return [
        [0, 0, 0, 0],
        [0.5, -0.5, 1, 1],
        [-0.5, 0.5, 6, 1],
        [0.5, 0.5, 11, 1]
    ];
}

function proofPixels() {
    return Array.from({ length: 32 * 32 }, (_, index) => {
        if (index === 0) return [0, 0, 0, 0];
        if (index === 1) return [0.5, -0.5, 1, 1];
        if (index === 2) return [-0.5, 0.5, 6, 1];
        return [0.5, 0.5, 11, 1];
    });
}

/** @param {readonly (readonly number[])[]} pixels */
export function encodeRgba32f(pixels) {
    const bytes = Buffer.alloc(pixels.length * 16);
    pixels.forEach((pixel, pixelIndex) => {
        pixel.forEach((value, componentIndex) => {
            bytes.writeFloatLE(value, pixelIndex * 16 + componentIndex * 4);
        });
    });
    return bytes;
}

/**
 * @param {{pixels?: readonly (readonly number[])[], mutateManifest?: (manifest: any) => void}} [options]
 */
export async function createIntermediateFixture(options = {}) {
    const root = await mkdtemp(path.join(os.tmpdir(), 'static-sun-depth-tool-'));
    const rawBytes = Buffer.from('fixture-openexr-diagnostic');
    const canonicalBytes = encodeRgba32f(options.pixels ?? proofPixels());
    const output = {
        canonical: {
            byteLength: canonicalBytes.byteLength,
            components: 4,
            encoding: INTERMEDIATE_CANONICAL_ENCODING,
            height: 32,
            path: 'canonical/proof_static_sun_depth_position.rgba.f32le',
            rowOrigin: 'lower_left',
            sha256: digest(canonicalBytes),
            width: 32
        },
        channel: 'static_sun_depth',
        descriptor: depthDescriptor(),
        id: 'proof_static_sun_depth_position',
        raw: {
            byteLength: rawBytes.byteLength,
            format: INTERMEDIATE_RAW_FORMAT,
            path: 'raw/proof_static_sun_depth_position.raw.exr',
            sha256: digest(rawBytes)
        }
    };
    const manifest = {
        checks: [
            { id: 'canonical_pixels_hashed', passed: true },
            { id: 'outputs_complete', passed: true }
        ],
        compiler: {
            archiveSha256: HASH,
            architecture: 'x86_64',
            backend: 'cycles_cpu',
            buildHash: '9e2066aef7ef',
            buildPlatform: 'Windows',
            executableSha256: 'b'.repeat(64),
            threadCount: 12,
            version: [5, 2, 1],
            versionString: '5.2.1 LTS'
        },
        configuration: {
            compilerScriptSha256: 'c'.repeat(64),
            profileSha256: 'd'.repeat(64),
            toolchainSha256: 'e'.repeat(64)
        },
        input: {
            channelSources: [{ id: 'static_sun_depth', sha256: '1'.repeat(64) }],
            format: 'bus-sim-illumination-bake-input-v1',
            geometrySha256: '2'.repeat(64),
            packageRawSha256: '3'.repeat(64),
            resolvedSourceSha256: '4'.repeat(64),
            schemaVersion: 1,
            usedMaterialsSha256: '5'.repeat(64)
        },
        outputs: [output],
        profile: { id: 'ai529.proof.cycles_cpu.threads_12.v1', sha256: '6'.repeat(64) },
        reconstruction: {
            alphaInputCount: 1,
            geometryCount: 1,
            materialCount: 1,
            meshInstanceCount: 1,
            mode: 'full',
            objectOrder: 'stable_id_ascending',
            stableIdsPreserved: true,
            textureCount: 1
        },
        schema: INTERMEDIATE_MANIFEST_SCHEMA
    };
    options.mutateManifest?.(manifest);
    const manifestPath = path.join(root, 'intermediate_manifest.json');
    await mkdir(path.join(root, 'canonical'));
    await mkdir(path.join(root, 'raw'));
    await writeFile(path.join(root, output.canonical.path), canonicalBytes);
    await writeFile(path.join(root, output.raw.path), rawBytes);
    await writeFile(manifestPath, canonicalJsonStringify(manifest));
    return Object.freeze({
        canonicalBytes,
        cleanup: () => rm(root, { force: true, recursive: true }),
        manifest,
        manifestPath,
        root
    });
}

/** @param {Uint8Array} bytes */
function digest(bytes) {
    return createHash('sha256').update(bytes).digest('hex');
}
