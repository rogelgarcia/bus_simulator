#!/usr/bin/env node
// Authenticates and lists every native textureGrad candidate at selected texels.

import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import {fileURLToPath} from 'node:url';
import {
    canonicalJsonBytes,
    canonicalJsonStringify
} from '../../src/app/illumination/bake_source/CanonicalJson.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '../..');
const artifactRoot = path.join(repoRoot, 'tests/artifacts/illumination_531');

async function run(argv) {
    const options = parseArguments(argv);
    const fieldRoot = resolveArtifact(options.fieldRoot);
    const field = await readCanonical(
        path.join(fieldRoot, 'native_cutout_field_receipt.json'),
        'native field receipt'
    );
    const candidateRoot = path.join(fieldRoot, 'candidates');
    const candidate = await readCanonical(
        path.join(candidateRoot, 'capture_receipt.json'),
        'candidate receipt'
    );
    const triangleSource = await readCanonical(
        path.join(candidateRoot, 'source_triangles.json'),
        'source triangles'
    );
    const [width, height] = field.layout.layout.interiorPixels;
    const tileCountX = field.layout.layout.tileCount[0];
    const reports = [];
    for (const texel of options.texels) {
        const tileX = Math.floor(texel[0] / width);
        const tileY = Math.floor(texel[1] / height);
        const tileIndex = tileY * tileCountX + tileX;
        const tileId = `tile_${String(tileX).padStart(4, '0')}_${String(tileY).padStart(4, '0')}`;
        const candidateOutput = candidate.capture.outputs[tileIndex];
        const fieldOutput = field.outputs[tileIndex];
        if (candidateOutput?.tileId !== tileId || fieldOutput?.tileId !== tileId) {
            throw new Error(`Texel ${texel} escaped the authenticated tile inventory`);
        }
        const matches = [];
        const resultProjection = [];
        for (const chunk of candidateOutput.chunks) {
            const candidatePath = resolveInside(candidateRoot, chunk.path);
            const candidateBytes = new Uint8Array(await readFile(candidatePath));
            if (candidateBytes.byteLength !== chunk.byteLength
                || sha256(candidateBytes) !== chunk.sha256) {
                throw new Error(`Candidate chunk ${tileId}:${chunk.chunkIndex} failed authentication`);
            }
            const resultRelative = `${tileId}/result_${String(chunk.chunkIndex).padStart(6, '0')}.f32le`;
            const resultPath = path.join(fieldRoot, 'native_results', resultRelative);
            const resultBytes = new Uint8Array(await readFile(resultPath));
            if (resultBytes.byteLength !== chunk.recordCount * 4) {
                throw new Error(`Result chunk ${tileId}:${chunk.chunkIndex} has invalid length`);
            }
            resultProjection.push({
                byteLength: resultBytes.byteLength,
                candidateSha256: chunk.sha256,
                chunkIndex: chunk.chunkIndex,
                path: `native_results/${resultRelative}`,
                recordCount: chunk.recordCount,
                sha256: sha256(resultBytes),
                tileId,
                tileIndex
            });
            const candidates = new DataView(
                candidateBytes.buffer,
                candidateBytes.byteOffset,
                candidateBytes.byteLength
            );
            const results = new DataView(
                resultBytes.buffer,
                resultBytes.byteOffset,
                resultBytes.byteLength
            );
            for (let index = 0; index < chunk.recordCount; index += 1) {
                const offset = index * 40;
                if (candidates.getUint32(offset, true) !== texel[0]
                    || candidates.getUint32(offset + 4, true) !== texel[1]) continue;
                const sourceTriangleIndex = candidates.getUint32(offset + 12, true);
                const triangle = triangleSource.triangles[sourceTriangleIndex];
                const coverage = results.getFloat32(index * 4, true);
                matches.push({
                    accepted: coverage >= 0.5,
                    chunkIndex: chunk.chunkIndex,
                    coverage,
                    dUVdx: [
                        candidates.getFloat32(offset + 24, true),
                        candidates.getFloat32(offset + 28, true)
                    ],
                    dUVdy: [
                        candidates.getFloat32(offset + 32, true),
                        candidates.getFloat32(offset + 36, true)
                    ],
                    depthMeters: candidates.getFloat32(offset + 8, true),
                    geometryId: triangle.geometryId,
                    instanceId: triangle.instanceId,
                    polygonIndex: triangle.polygonIndex,
                    recordIndex: index,
                    sourceTriangleIndex,
                    uv: [
                        candidates.getFloat32(offset + 16, true),
                        candidates.getFloat32(offset + 20, true)
                    ]
                });
            }
        }
        if (sha256(canonicalJsonBytes(resultProjection))
                !== fieldOutput.nativeCapture.candidateAuthority.resultProjectionSha256) {
            throw new Error(`Result projection ${tileId} failed authentication`);
        }
        matches.sort((left, right) => left.depthMeters - right.depthMeters
            || left.sourceTriangleIndex - right.sourceTriangleIndex);
        const localX = texel[0] - tileX * width;
        const localY = texel[1] - tileY * height;
        const fieldBytes = new Uint8Array(await readFile(path.join(fieldRoot, fieldOutput.path)));
        if (fieldBytes.byteLength !== fieldOutput.byteLength
            || sha256(fieldBytes) !== fieldOutput.sha256) {
            throw new Error(`Field tile ${tileId} failed authentication`);
        }
        const fieldDepthMeters = new DataView(
            fieldBytes.buffer,
            fieldBytes.byteOffset,
            fieldBytes.byteLength
        ).getFloat32((localY * width + localX) * 4, true);
        reports.push({
            acceptedFirstHit: matches.find((entry) => entry.accepted) ?? null,
            fieldDepthMeters,
            matches,
            texel,
            tileId
        });
    }
    process.stdout.write(canonicalJsonStringify({
        fieldReceiptSha256: sha256(await readFile(
            path.join(fieldRoot, 'native_cutout_field_receipt.json')
        )),
        reports,
        schema: 'ai531-native-field-texel-diagnostic-v1'
    }) + '\n');
}

function parseArguments(argv) {
    const options = {texels: []};
    for (let index = 0; index < argv.length; index += 1) {
        const flag = argv[index];
        const value = argv[index + 1];
        if (!value) throw new TypeError(`Missing value for ${flag}`);
        index += 1;
        if (flag === '--field-root') options.fieldRoot = value;
        else if (flag === '--texel') {
            const parts = value.split(',').map(Number);
            if (parts.length !== 2
                || parts.some((entry) => !Number.isSafeInteger(entry) || entry < 0)) {
                throw new TypeError(`Invalid texel '${value}'`);
            }
            options.texels.push(parts);
        } else throw new TypeError(`Unknown option '${flag}'`);
    }
    if (!options.fieldRoot || options.texels.length === 0) {
        throw new TypeError('--field-root and at least one --texel are required');
    }
    return options;
}

async function readCanonical(filePath, label) {
    const bytes = await readFile(filePath);
    const value = JSON.parse(bytes);
    if (!Buffer.from(canonicalJsonBytes(value)).equals(bytes)) {
        throw new Error(`${label} is not canonical JSON`);
    }
    return value;
}

function resolveArtifact(value) {
    const resolved = path.resolve(repoRoot, value);
    const relative = path.relative(artifactRoot, resolved);
    if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
        throw new Error('Diagnostic field root must stay below illumination_531');
    }
    return resolved;
}

function resolveInside(root, relative) {
    const resolved = path.resolve(root, ...relative.split('/'));
    const relation = path.relative(root, resolved);
    if (!relation || relation.startsWith('..') || path.isAbsolute(relation)) {
        throw new Error('Diagnostic artifact path escaped its root');
    }
    return resolved;
}

function sha256(bytes) {
    return createHash('sha256').update(bytes).digest('hex');
}

run(process.argv.slice(2)).catch((error) => {
    process.stderr.write(`${error?.stack ?? error}\n`);
    process.exitCode = 1;
});
