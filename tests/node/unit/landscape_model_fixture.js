// Creates a deterministic small landscape with flat ground, a slope/hill, and soil regions.
import { createHash } from 'node:crypto';
import { createLandscapeChunkId, createLandscapeManifest, encodeLandscapeChannel } from '../../../src/app/landscape/index.js';

export function createLandscapeModelFixture({ chunkIntervals = 4, maxLevel = 1, minX = -8, minZ = 10, spacing = 2, heightAt, coverAt } = {}) {
    const intervals = chunkIntervals * 2 ** maxLevel;
    const bounds = { minX, maxX: minX + intervals * spacing, minZ, maxZ: minZ + intervals * spacing };
    const sourceHeights = new Float32Array((intervals + 1) ** 2);
    const sourceCover = new Uint8Array(sourceHeights.length);
    for (let row = 0; row <= intervals; row++) {
        for (let column = 0; column <= intervals; column++) {
            sourceHeights[row * (intervals + 1) + column] = heightAt
                ? heightAt(column, row)
                : column <= 2 ? -2 : 0.5 * (column - 2) + Math.max(0, 2 - Math.hypot(column - 6, row - 4));
            sourceCover[row * (intervals + 1) + column] = coverAt ? coverAt(column, row) : column <= 2 ? 1 : row < 4 ? 2 : 3;
        }
    }
    const minHeight = Math.min(...sourceHeights);
    const maxHeight = Math.max(...sourceHeights);
    const chunks = [];
    const decoded = new Map();
    const resources = new Map();
    const levels = maxLevel === 0 ? [0] : [0, maxLevel];
    for (const level of levels) {
        const stride = 2 ** (maxLevel - level);
        for (let row = 0; row < 2 ** level; row++) {
            for (let column = 0; column < 2 ** level; column++) {
                const id = createLandscapeChunkId(level, column, row);
                const startColumn = column * chunkIntervals * stride;
                const startRow = row * chunkIntervals * stride;
                const heights = new Float32Array((chunkIntervals + 1) ** 2);
                const landCover = new Uint8Array(heights.length);
                for (let r = 0; r <= chunkIntervals; r++) {
                    for (let c = 0; c <= chunkIntervals; c++) {
                        const sourceIndex = (startRow + r * stride) * (intervals + 1) + startColumn + c * stride;
                        heights[r * (chunkIntervals + 1) + c] = sourceHeights[sourceIndex];
                        landCover[r * (chunkIntervals + 1) + c] = sourceCover[sourceIndex];
                    }
                }
                const descriptor = {
                    id, level, column, row, startColumn, startRow, sampleStride: stride,
                    columns: chunkIntervals + 1, rows: chunkIntervals + 1,
                    bounds: {
                        minX: minX + startColumn * spacing,
                        maxX: minX + (startColumn + chunkIntervals * stride) * spacing,
                        minZ: bounds.maxZ - (startRow + chunkIntervals * stride) * spacing,
                        maxZ: bounds.maxZ - startRow * spacing
                    },
                    minHeight: level === 0 ? minHeight : Math.min(...heights),
                    maxHeight: level === 0 ? maxHeight : Math.max(...heights),
                    geometricError: stride > 1 ? maxHeight - minHeight : 0,
                    revision: 'fixture-r1', parentId: level === 0 ? null : 'l0/c0/r0', channels: {}
                };
                for (const [name, values, encoding] of [['height', heights, 'float32-le'], ['landCover', landCover, 'uint8']]) {
                    const bytes = encodeLandscapeChannel(values, encoding);
                    const url = `chunks/${id}.${name}.bin`;
                    descriptor.channels[name] = {
                        url, encoding, byteLength: bytes.byteLength, decodedByteLength: bytes.byteLength,
                        sha256: createHash('sha256').update(bytes).digest('hex'), revision: 'fixture-r1'
                    };
                    resources.set(url, bytes);
                }
                chunks.push(descriptor);
                decoded.set(id, { descriptor, heights, landCover });
            }
        }
    }
    const manifest = createLandscapeManifest({
        id: 'synthetic-hill', name: 'Synthetic flat, slope, and hill', revision: 'fixture-r1', bounds,
        grid: { columns: intervals + 1, rows: intervals + 1, spacingX: spacing, spacingZ: spacing, chunkIntervals, maxLevel },
        chunks,
        provenance: {
            kind: 'synthetic-fixture', sourceName: 'deterministic-hill-v1',
            sourceSha256: createHash('sha256').update(new Uint8Array(sourceHeights.buffer)).digest('hex'),
            nativeResolutionMeters: spacing,
            preparation: { algorithm: 'synthetic-hill-v1', chunkIntervals, overviewStride: 2 ** maxLevel }
        }
    });
    for (const descriptor of manifest.chunks) decoded.get(descriptor.id).descriptor = descriptor;
    resources.set('manifest.json', new TextEncoder().encode(JSON.stringify(manifest)));
    const requests = [];
    const fetchImpl = async (url) => {
        const relative = new URL(url).pathname.replace('/fixture/', '');
        requests.push(relative);
        const bytes = resources.get(relative);
        return bytes ? new Response(bytes, { status: 200 }) : new Response('', { status: 404 });
    };
    return { manifest, decoded, resources, requests, fetchImpl, sourceHeights, sourceCover };
}
