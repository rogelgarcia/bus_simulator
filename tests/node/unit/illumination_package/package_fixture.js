// Creates small deterministic AI 530 binary-package fixtures without tracked binary blobs.

import { buildIlluminationBinaryPackage } from '../../../../src/app/illumination/package/index.js';

export const HASHES = Object.freeze({
    source: '1'.repeat(64),
    package: '2'.repeat(64),
    directSource: '3'.repeat(64),
    directProfile: '4'.repeat(64),
    mappingSource: '5'.repeat(64),
    mappingProfile: '6'.repeat(64),
    sunSource: '7'.repeat(64),
    sunProfile: '8'.repeat(64)
});

export function baseBuildOptions() {
    return {
        cityId: 'fixture.city',
        lightingProfileId: 'fixture.lighting.v1',
        selectedCapabilityProfileId: 'transport.fixture_v1',
        source: {
            resolvedSourceSha256: HASHES.source,
            packageRawSha256: HASHES.package,
            schema: 'fixture-source-v1'
        },
        compilerDescriptor: {
            backend: 'cycles_cpu',
            buildHash: 'fixture-build',
            scriptSha256: '9'.repeat(64),
            version: '5.2.1 LTS'
        },
        channels: [
            {
                id: 'receiver_mapping',
                required: false,
                sourceSha256: HASHES.mappingSource,
                profileSha256: HASHES.mappingProfile
            },
            {
                id: 'direct_receiver',
                required: true,
                sourceSha256: HASHES.directSource,
                profileSha256: HASHES.directProfile
            }
        ],
        chunks: [
            {
                id: 'mapping.ids',
                channelId: 'receiver_mapping',
                data: new Uint32Array([7, 11, 13]),
                resourceType: 'buffer',
                encoding: 'uint32_le',
                precision: 'uint32',
                dimensions: { width: 3, height: 1, depth: 1, components: 1 },
                rowOrigin: 'not_applicable',
                coordinateTransform: null,
                mipLevel: 0,
                requiredRuntimeCapabilities: []
            },
            {
                id: 'direct.rgba32f',
                channelId: 'direct_receiver',
                data: new Float32Array([1, 0.5, 0.25, 1]),
                resourceType: 'texture_2d',
                encoding: 'rgba32f_le',
                precision: 'float32',
                dimensions: { width: 1, height: 1, depth: 1, components: 4 },
                rowOrigin: 'lower_left',
                coordinateTransform: {
                    id: 'identity_uv_v1',
                    matrix: [1, 0, 0, 0, 1, 0, 0, 0, 1]
                },
                mipLevel: 0,
                requiredRuntimeCapabilities: []
            }
        ]
    };
}

export async function buildPackageFixture(overrides = {}) {
    return buildIlluminationBinaryPackage({ ...baseBuildOptions(), ...overrides });
}

export function mutableJson(value) {
    return JSON.parse(JSON.stringify(value));
}
