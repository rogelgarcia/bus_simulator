// Adjacent native viewports can disagree at raster edges through float rounding.
// Give every duplicate world texel the nearest measured blocker, never an average.
import path from 'node:path';
import { readFile, writeFile } from 'node:fs/promises';
import { gunzipSync, gzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
const hash = bytes => createHash('sha256').update(bytes).digest('hex');

export function reconcileGuardBuffers(manifest, buffers) {
    const edge = manifest.interiorTexels, overlap = manifest.guardTexels * 2;
    const size = edge + overlap, width = manifest.tileCount[0];
    if (overlap >= edge) throw new Error('Guard consolidation requires less than one interior of overlap');
    const report = { policy: 'nearest measured blocker at identical world texel', changedCopies: 0, maximumCodeCorrection: 0 };
    // A texel occurs in at most four pages. Two axis sweeps propagate the same
    // conservative minimum through all four copies at a corner.
    for (let pass = 0; pass < 2; pass++) for (const [id, a] of buffers) for (const axis of [0, 1]) {
        if (axis === 0 && id % width === width - 1) continue;
        const b = buffers.get(id + (axis === 0 ? 1 : width));
        if (!b) continue;
        for (let i = 0; i < size; i++) for (let j = 0; j < overlap; j++) {
            const ai = (axis === 0 ? i * size + edge + j : (edge + j) * size + i) * 2;
            const bi = (axis === 0 ? i * size + j : j * size + i) * 2;
            const av = a[ai] * 256 + a[ai + 1], bv = b[bi] * 256 + b[bi + 1];
            if (av === bv) continue;
            const nearest = Math.min(av, bv);
            report.changedCopies++;
            report.maximumCodeCorrection = Math.max(report.maximumCodeCorrection, Math.abs(av - bv));
            a[ai] = b[bi] = nearest >> 8; a[ai + 1] = b[bi + 1] = nearest & 255;
        }
    }
    return report;
}

export async function reconcileShadowPageGuards(root, manifest) {
    const buffers = new Map();
    const width = manifest.tileCount[0], rows = new Map();
    for (const page of manifest.pages) {
        const row = Math.floor(page.id / width);
        if (!rows.has(row)) rows.set(row, []);
        rows.get(row).push(page);
    }
    const report = { policy: 'nearest measured blocker at identical world texel', changedCopies: 0, maximumCodeCorrection: 0, peakWorkingBytes: 0 };
    const load = async page => {
        if (buffers.has(page.id)) return;
        let raw;
        if (page.empty) raw = Buffer.alloc(page.byteLength, 255);
        else {
            const zipped = await readFile(path.join(root, page.path));
            if (hash(zipped) !== page.compressedSha256) throw new Error('Unverified native page');
            raw = gunzipSync(zipped, { maxOutputLength: page.byteLength });
        }
        if (raw.length !== page.byteLength || hash(raw) !== page.sha256) throw new Error('Unverified native depth');
        buffers.set(page.id, raw);
    };
    const save = async page => {
        const raw = buffers.get(page.id);
        page.sha256 = hash(raw); page.empty = raw.every(v => v === 255);
        if (page.empty) { page.path = null; delete page.compressedBytes; delete page.compressedSha256; }
        else {
            const zipped = gzipSync(raw, { level: 6 });
            page.path = `pages/${page.id}.rg8.gz`;
            page.compressedBytes = zipped.length; page.compressedSha256 = hash(zipped);
            await writeFile(path.join(root, page.path), zipped);
        }
        buffers.delete(page.id);
    };
    // Neighbour overlaps occupy less than half a page. Two adjacent rows
    // contain every four-page corner; later rows cannot alter a flushed row.
    if (manifest.guardTexels * 4 >= manifest.interiorTexels) throw new Error('Row batching requires disjoint opposite guards');
    for (const row of [...rows.keys()].sort((a,b) => a-b)) {
        const pages = [...rows.get(row), ...(rows.get(row + 1) ?? [])];
        const bytes = pages.reduce((sum, page) => sum + page.byteLength, 0);
        if (bytes > 512 * 1024 * 1024) throw new Error('Guard row working set exceeds 512 MiB');
        for (const page of pages) await load(page);
        report.peakWorkingBytes = Math.max(report.peakWorkingBytes, bytes);
        const update = reconcileGuardBuffers(manifest, buffers);
        report.changedCopies += update.changedCopies;
        report.maximumCodeCorrection = Math.max(report.maximumCodeCorrection, update.maximumCodeCorrection);
        for (const page of rows.get(row)) await save(page);
    }
    return report;
}
