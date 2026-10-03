// Provides bounded file reads and manifest-last publication primitives for local landscape authoring.
// @ts-check
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, open, rename, unlink } from 'node:fs/promises';

/** @param {Uint8Array|string} bytes */
export const authoringHash = bytes => createHash('sha256').update(bytes).digest('hex');

/** @param {string} directory @param {string} relative */
export function authoringFile(directory, relative) {
    if (typeof relative !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9._/-]*$/.test(relative)
        || relative.split('/').some(part => !part || part === '.' || part === '..')) throw new Error(`[LandscapeAuthoring] Unsafe asset path: ${relative}`);
    return path.join(directory, relative);
}

/** @param {string} file @param {number} maximum */
export async function readAuthoringFile(file, maximum) {
    const handle = await open(file, 'r');
    try {
        const metadata = await handle.stat();
        if (!metadata.isFile() || metadata.size > maximum) throw new Error(`[LandscapeAuthoring] File exceeds ${maximum}-byte admission limit: ${path.basename(file)}`);
        const bytes = Buffer.alloc(metadata.size + 1);
        let total = 0;
        while (total < bytes.length) {
            const read = await handle.read(bytes, total, bytes.length - total, total);
            if (!read.bytesRead) break;
            total += read.bytesRead;
        }
        if (total !== metadata.size) throw new Error(`[LandscapeAuthoring] File changed size while reading: ${path.basename(file)}`);
        return bytes.subarray(0, total);
    } finally { await handle.close(); }
}

/** @param {string} destination @param {Uint8Array|string} bytes */
export async function atomicAuthoringWrite(destination, bytes) {
    await mkdir(path.dirname(destination), { recursive: true });
    const temporary = path.join(path.dirname(destination), `${path.basename(destination)}.${randomUUID()}.partial`);
    const handle = await open(temporary, 'wx');
    try {
        try { await handle.writeFile(bytes); await handle.sync(); }
        finally { await handle.close(); }
        await rename(temporary, destination);
    }
    catch (error) { await unlink(temporary).catch(() => {}); throw error; }
}

/** @param {string} destination @param {Uint8Array|string} input */
export async function writeImmutableAuthoringFile(destination, input) {
    const bytes = typeof input === 'string' ? Buffer.from(input) : Buffer.from(input.buffer, input.byteOffset, input.byteLength);
    try {
        const previous = await readAuthoringFile(destination, bytes.length);
        if (!previous.equals(bytes)) throw new Error(`[LandscapeAuthoring] Immutable content changed: ${path.basename(destination)}`);
        return;
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
    await atomicAuthoringWrite(destination, bytes);
}

/** @param {string} directory @returns {Promise<()=>Promise<void>>} */
export async function acquireAuthoringLock(directory) {
    const lock = path.join(directory, 'authoring.lock'), token = randomUUID();
    let handle;
    try { handle = await open(lock, 'wx'); }
    catch (error) {
        if (error.code !== 'EEXIST') throw error;
        let owner;
        try { owner = JSON.parse((await readAuthoringFile(lock, 512)).toString('utf8')); }
        catch { throw new Error('[LandscapeAuthoring] An incomplete authoring lock exists; confirm no authoring process is running before recovering it'); }
        if (!Number.isSafeInteger(owner.pid) || owner.pid <= 0 || !/^[a-f0-9-]{36}$/.test(owner.token)) throw new Error('[LandscapeAuthoring] Invalid authoring lock owner; inspect it before recovery');
        let alive = true;
        try { process.kill(owner.pid, 0); }
        catch (failure) { if (failure.code === 'ESRCH') alive = false; }
        if (alive) throw new Error('[LandscapeAuthoring] Another authoring transaction owns this landscape');
        const guard = `${lock}.recovering`;
        let recovery;
        try { recovery = await open(guard, 'wx'); }
        catch { throw new Error('[LandscapeAuthoring] Authoring lock recovery is already in progress'); }
        try {
            const current = JSON.parse((await readAuthoringFile(lock, 512)).toString('utf8'));
            if (current.token !== owner.token) throw new Error('[LandscapeAuthoring] Authoring lock changed during recovery');
            await rename(lock, path.join(directory, `authoring-interrupted-${owner.token}.json`));
        } finally { await recovery.close(); await unlink(guard); }
        return acquireAuthoringLock(directory);
    }
    await handle.writeFile(JSON.stringify({ pid: process.pid, token }) + '\n'); await handle.sync(); await handle.close();
    return async () => {
        const current = JSON.parse((await readAuthoringFile(lock, 512)).toString('utf8'));
        if (current.token !== token) throw new Error('[LandscapeAuthoring] Authoring lock ownership changed');
        await unlink(lock);
    };
}
