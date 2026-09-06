// Publishes staged files atomically and preserves complete material directories for rollback.
// @ts-check
import path from 'node:path';
import { copyFile, cp, mkdir, rename, stat } from 'node:fs/promises';

/** @param {string} source @param {string} destination */
export async function publishBakeFile(source, destination) {
    await mkdir(path.dirname(destination), { recursive: true });
    const temporary = `${destination}.${process.pid}.partial`;
    await copyFile(source, temporary);
    await rename(temporary, destination);
}

/** Directory replacement retains the previous version as an explicit rollback artifact.
 * @param {string} source @param {string} destination */
export async function publishBakeDirectory(source, destination) {
    const suffix = `${Date.now()}-${process.pid}`;
    const temporary = `${destination}.${suffix}.partial`;
    const previous = `${destination}.${suffix}.previous`;
    const exists = await stat(destination).catch(error => { if (error.code === 'ENOENT') return null; throw error; });
    if (exists) await cp(destination, temporary, { recursive: true });
    await cp(source, temporary, { recursive: true });
    if (exists) await rename(destination, previous);
    try { await rename(temporary, destination); }
    catch (error) { if (exists) await rename(previous, destination); throw error; }
    return exists ? previous : null;
}
