// Hierarchical terminal logging with plain redirected output and honest work progress.
// @ts-check

/** @param {{stream?:any,env?:any,now?:()=>number}} [options] */
export function createBakeLog({ stream = process.stdout, env = process.env, now = Date.now } = {}) {
    const colored = !!stream.isTTY && env.NO_COLOR === undefined && env.TERM !== 'dumb';
    const start = now();
    function line(id, message, status = '') {
        const depth = id === 'all' ? 0 : id.split('/').length;
        const text = `${'  '.repeat(depth)}[${id}] ${message}`;
        const code = status === 'failed' ? 31 : status === 'success' ? 32 : 36;
        stream.write((colored ? `\x1b[${code}m${text}\x1b[0m` : text) + '\n');
    }
    return Object.freeze({ line, progress(id, done, total, active = 'validating') {
        const fraction = total ? done / total : 0;
        const bars = Math.floor(fraction * 20);
        line(id, `[${'#'.repeat(bars)}${'-'.repeat(20 - bars)}] ${done}/${total} validated jobs; ${active}; elapsed ${((now() - start) / 1000).toFixed(1)}s`);
    } });
}
