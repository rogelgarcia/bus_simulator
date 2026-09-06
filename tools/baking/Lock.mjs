// Serializes bake ownership and stale-lock recovery without disturbing another live run.
// @ts-check
import { open, readFile, rename, unlink } from 'node:fs/promises';

/** @param {string} file */
export async function acquireBakeLock(file) {
    let handle;
    try { handle = await open(file, 'wx'); }
    catch (error) {
        if (error.code !== 'EEXIST') throw error;
        const recovery = `${file}.recovering`;
        let guard;
        try { guard = await open(recovery, 'wx'); }
        catch (e) { if (e.code === 'EEXIST') throw new Error(`Recovery guard exists: ${recovery}. If a recovery was interrupted, verify no bake process is running before removing that guard.`); throw e; }
        try {
            const owner = JSON.parse(await readFile(file, 'utf8'));
            if (!Number.isSafeInteger(owner.pid) || owner.pid <= 0) throw new Error(`Invalid lock owner in ${file}; inspect the lock before recovery`);
            let alive = true;
            try { process.kill(owner.pid, 0); } catch (e) { if (e.code === 'ESRCH') alive = false; }
            if (alive) throw new Error(`Another bake owns ${file} (PID ${owner.pid}). Let it finish or cancel that run.`);
            await rename(file, `${file}.${Date.now()}.interrupted`);
            handle = await open(file, 'wx');
        } finally { await guard.close(); await unlink(recovery); }
    }
    await handle.writeFile(JSON.stringify({ pid: process.pid, started: new Date().toISOString() }));
    return async () => { await handle.close(); await unlink(file); };
}
