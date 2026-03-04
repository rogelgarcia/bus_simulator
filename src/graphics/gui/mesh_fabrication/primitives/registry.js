// src/graphics/gui/mesh_fabrication/primitives/registry.js

export function createPrimitiveCompilerRegistry(entries) {
    const source = entries && typeof entries === 'object' ? entries : {};
    const map = new Map();
    for (const [key, value] of Object.entries(source)) {
        if (typeof value !== 'function') continue;
        map.set(String(key).trim(), value);
    }
    return Object.freeze({
        get(type) {
            return map.get(String(type ?? '').trim()) ?? null;
        },
        has(type) {
            return map.has(String(type ?? '').trim());
        },
        listTypes() {
            return Object.freeze([...map.keys()].sort());
        }
    });
}
