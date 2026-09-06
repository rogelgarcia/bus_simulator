// Streams artifact hashes and writes durable bake checkpoints.
// @ts-check
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, readdir, rename, open } from 'node:fs/promises';
import path from 'node:path';

/** @param {unknown} value */
export const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
/** @param {string} file */
export async function hashFile(file) {
    const hash = createHash('sha256');
    let bytes = 0;
    for await (const chunk of createReadStream(file)) { hash.update(chunk); bytes += chunk.length; }
    return { sha256: hash.digest('hex'), bytes };
}
/** @param {string} directory */
export async function listFiles(directory) {
    const result = [];
    for (const entry of (await readdir(directory, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
        const file = path.join(directory, entry.name);
        if (entry.isDirectory()) result.push(...await listFiles(file));
        else if (entry.isFile()) result.push(file);
    }
    return result;
}
/** @param {string} file @param {unknown} value */
export async function writeJson(file, value) {
    await mkdir(path.dirname(file), { recursive: true });
    const temporary = `${file}.${process.pid}.partial`;
    const handle = await open(temporary, 'w');
    try { await handle.writeFile(JSON.stringify(value, null, 2) + '\n'); await handle.sync(); }
    finally { await handle.close(); }
    await rename(temporary, file);
}
