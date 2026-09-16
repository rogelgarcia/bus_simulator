// Optional, read-only host telemetry. Keep sampling outside the browser/GPU query path.
import { spawn } from 'node:child_process';
import { freemem } from 'node:os';

export function startBakedGpuTelemetry({ onRow = () => {} } = {}) {
    const columns = ['timestamp', 'pstate', 'temperature.gpu', 'utilization.gpu', 'utilization.memory',
        'memory.used', 'clocks.current.graphics', 'clocks.current.memory', 'power.draw'];
    const rows = [], errors = [];
    const child = spawn('nvidia-smi', [`--query-gpu=${columns.join(',')}`, '--format=csv,noheader,nounits', '-lms', '500'],
        { windowsHide: true });
    let pending = '';
    child.stdout.on('data', data => {
        pending += data.toString();
        const lines = pending.split('\n'); pending = lines.pop();
        for (const line of lines) if (line.trim()) {
            const row = { hostTimeMs: Date.now(), availableMemoryMiB: freemem() / 2 ** 20, values: line.trim().split(/,\s*/) };
            rows.push(row); onRow(row);
        }
    });
    child.stderr.on('data', data => errors.push(data.toString()));
    child.on('error', error => errors.push(error.message));
    const closed = new Promise(resolve => child.once('close', resolve));
    return { async stop() {
        if (child.exitCode === null) child.kill();
        await closed;
        return { columns, rows, errors };
    } };
}
