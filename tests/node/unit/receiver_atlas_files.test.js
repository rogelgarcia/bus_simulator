import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { writeReceiverAtlas, receiverAtlasHashes, verifyReceiverAtlasFiles } from '../../../tools/receiver_lightmaps/AtlasFiles.mjs';

test('A resumed bake rejects a changed chart inventory or atlas header', async () => {
    const directory = await mkdtemp(path.resolve('tests/artifacts/receiver-atlas-files-'));
    try {
        const atlas = { schema: 'bus-sim-receiver-atlas-v1', profile: { chartLayout: 'blender-smart-project-v1' },
            pageCount: 1, charts: [{ id: 'side', page: 0, x: 2, y: 2, triangles: [{ offset: 3 }] }] };
        const expected = receiverAtlasHashes(atlas);
        await writeReceiverAtlas(directory, atlas);
        await verifyReceiverAtlasFiles(directory, expected);
        const chartFile = path.join(directory, 'charts.ndjson'), headerFile = path.join(directory, 'atlas.json');
        const original = await readFile(chartFile, 'utf8');
        await writeFile(chartFile, original.replace('"offset":3', '"offset":6'));
        await assert.rejects(verifyReceiverAtlasFiles(directory, expected), /charts.ndjson/);
        await writeFile(chartFile, original);
        const header = JSON.parse(await readFile(headerFile, 'utf8'));
        await writeFile(headerFile, JSON.stringify({ ...header, pageCount: 2 }));
        await assert.rejects(verifyReceiverAtlasFiles(directory, expected), /atlas.json/);
    } finally {
        assert.ok(directory.startsWith(path.resolve('tests/artifacts') + path.sep));
        await rm(directory, { recursive: true, force: true });
    }
});
