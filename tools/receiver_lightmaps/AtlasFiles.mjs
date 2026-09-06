// Writes large offline chart inventories incrementally instead of exceeding JavaScript's string limit.
import { createReadStream, createWriteStream } from 'node:fs';
import { createHash } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { once } from 'node:events';
import { finished } from 'node:stream/promises';
import path from 'node:path';

export function receiverAtlasHashes(descriptor) {
    const { charts, ...header } = descriptor;
    const hash = createHash('sha256');
    for (const chart of charts) hash.update(JSON.stringify(chart) + '\n');
    return { atlasSha256: createHash('sha256').update(JSON.stringify({ ...header, chartFile: 'charts.ndjson' })).digest('hex'),
        chartsSha256: hash.digest('hex') };
}

export async function verifyReceiverAtlasFiles(stage, expected) {
    for (const [file, key] of [['atlas.json', 'atlasSha256'], ['charts.ndjson', 'chartsSha256']]) {
        const hash = createHash('sha256');
        for await (const chunk of createReadStream(path.join(stage, file))) hash.update(chunk);
        if (hash.digest('hex') !== expected[key]) throw new Error('Bake atlas file changed: ' + file);
    }
}

export async function writeReceiverAtlas(stage, descriptor) {
    if (!descriptor.profile.chartLayout) {
        await writeFile(path.join(stage, 'atlas.json'), JSON.stringify(descriptor));
        return;
    }
    const { charts, ...header } = descriptor;
    await writeFile(path.join(stage, 'atlas.json'), JSON.stringify({ ...header, chartFile: 'charts.ndjson' }));
    const stream = createWriteStream(path.join(stage, 'charts.ndjson'));
    const done = finished(stream);
    // Observe errors even before the final await.
    done.catch(() => {});
    try {
        for (let i = 0; i < charts.length; i += 1000) {
            const batch = charts.slice(i, i+1000).map(c => JSON.stringify(c)).join('\n') + '\n';
            if (!stream.write(batch)) await once(stream, 'drain');
        }
        stream.end(); await done;
    } catch (error) { stream.destroy(); throw error; }
}
