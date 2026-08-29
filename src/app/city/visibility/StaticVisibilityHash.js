// Canonicalizes and hashes static-visibility configuration inputs deterministically.
// @ts-check

import { STATIC_VISIBILITY_HASH_SCHEMA } from './StaticVisibilityProfile.js';

const FNV_OFFSET = 0xcbf29ce484222325n;
const FNV_PRIME = 0x100000001b3n;
const UINT64_MASK = 0xffffffffffffffffn;

function canonicalize(value, inArray = false) {
    if (value === null) return 'null';
    const type = typeof value;
    if (type === 'string') return JSON.stringify(value);
    if (type === 'boolean') return value ? 'true' : 'false';
    if (type === 'number') {
        if (!Number.isFinite(value)) throw new Error('Static visibility hash input contains a non-finite number');
        return Object.is(value, -0) ? '0' : JSON.stringify(value);
    }
    if (type === 'bigint') return JSON.stringify(value.toString());
    if (type === 'undefined' || type === 'function' || type === 'symbol') {
        if (inArray) return 'null';
        return null;
    }
    if (Array.isArray(value)) {
        return `[${value.map((entry) => canonicalize(entry, true)).join(',')}]`;
    }
    if (type !== 'object') throw new Error(`Unsupported static visibility hash input type: ${type}`);

    const object = /** @type {Record<string, unknown>} */ (value);
    const entries = [];
    for (const key of Object.keys(object).sort()) {
        const encoded = canonicalize(object[key], false);
        if (encoded === null) continue;
        entries.push(`${JSON.stringify(key)}:${encoded}`);
    }
    return `{${entries.join(',')}}`;
}
export function canonicalStringify(value) {
    const encoded = canonicalize(value, false);
    if (encoded === null) throw new Error('Static visibility hash root cannot be omitted');
    return encoded;
}

export function hashCanonicalValue(value) {
    const bytes = new TextEncoder().encode(`${STATIC_VISIBILITY_HASH_SCHEMA}\n${canonicalStringify(value)}`);
    let hash = FNV_OFFSET;
    for (const byte of bytes) {
        hash ^= BigInt(byte);
        hash = (hash * FNV_PRIME) & UINT64_MASK;
    }
    return hash.toString(16).padStart(16, '0');
}
