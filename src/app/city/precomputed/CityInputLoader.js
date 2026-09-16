// Checks installed planner code independently before allowing exact-input city plan reuse.
// @ts-check
import { CITY_INPUT_ALGORITHMS, CITY_INPUT_SCHEMA, createCityInputPlans } from './CityInputPlans.js';
import { rawSha256Hex } from '../../illumination/package/RawSha256.js';

export const CITY_INPUT_INDEX = '/src/app/city/precomputed/bakes/bigcity2.index.json';

async function decodePlans(bytes, length) {
    const reader = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip')).getReader();
    const output = new Uint8Array(length);
    let offset = 0;
    try {
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            if (offset + value.length > length) throw new Error('City input expansion exceeds declared size');
            output.set(value, offset); offset += value.length;
        }
    } finally { await reader.cancel(); }
    if (offset !== length) throw new Error('City input expansion is incomplete');
    return JSON.parse(new TextDecoder().decode(output));
}

/** Missing/stale acceleration data falls back to the unchanged runtime algorithm, with a diagnostic. */
export async function loadCityInputPlans({ fetchImpl = globalThis.fetch, warn = console.warn } = {}) {
    const started = performance.now();
    try {
        const response = await fetchImpl(CITY_INPUT_INDEX, { signal: AbortSignal.timeout(5000) });
        if (response.status === 404) return createCityInputPlans();
        if (!response.ok) throw new Error(`index HTTP ${response.status}`);
        const index = await response.json();
        if (index.schema !== CITY_INPUT_SCHEMA || !/^bigcity2\.[a-f0-9]{64}\.json\.gz$/.test(index.file)
            || !Number.isSafeInteger(index.bytes) || index.bytes < 1 || index.bytes > 4 * 1024 * 1024
            || !Number.isSafeInteger(index.decodedBytes) || index.decodedBytes < 1 || index.decodedBytes > 16 * 1024 * 1024
            || index.file !== `bigcity2.${index.sha256}.json.gz`
            || JSON.stringify(Object.keys(index.algorithms ?? {}).sort()) !== JSON.stringify([...CITY_INPUT_ALGORITHMS].sort())) {
            throw new Error('Invalid city input index');
        }
        await Promise.all(CITY_INPUT_ALGORITHMS.map(async file => {
            const source = await fetchImpl('/' + file, { signal: AbortSignal.timeout(5000) });
            if (!source.ok || await rawSha256Hex(await source.arrayBuffer()) !== index.algorithms[file]) throw new Error(`Planner changed: ${file}`);
        }));
        const payload = await fetchImpl(CITY_INPUT_INDEX.replace('bigcity2.index.json', index.file), { signal: AbortSignal.timeout(5000) });
        if (!payload.ok) throw new Error(`payload HTTP ${payload.status}`);
        const bytes = await payload.arrayBuffer();
        if (bytes.byteLength !== index.bytes || await rawSha256Hex(bytes) !== index.sha256) throw new Error('City input integrity mismatch');
        const plans = createCityInputPlans(await decodePlans(bytes, index.decodedBytes));
        const loadMs = performance.now() - started;
        return Object.freeze({ ...plans, diagnostics: () => ({ ...plans.diagnostics(), bytes: index.bytes, decodedBytes: index.decodedBytes, loadMs }) });
    } catch (error) {
        warn(`[CityInputs] Runtime calculation retained: ${error.message}`);
        return createCityInputPlans(null, { reason: error.message });
    }
}
