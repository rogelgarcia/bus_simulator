// src/graphics/gui/mesh_fabrication/primitives/helpers/faceLabelAliasResolver.js

export function resolveFaceLabel(faceAliasesByCanonical, canonicalLabel) {
    const canonical = String(canonicalLabel ?? '').trim();
    if (!canonical) return canonical;
    if (faceAliasesByCanonical?.has?.(canonical)) {
        return String(faceAliasesByCanonical.get(canonical));
    }
    return canonical;
}

export function sanitizeFaceAliases(table) {
    if (!table || typeof table !== 'object' || Array.isArray(table)) return new Map();
    const out = new Map();
    const aliasToCanonical = new Map();
    for (const [canonicalKey, aliasValue] of Object.entries(table)) {
        const canonical = String(canonicalKey ?? '').trim();
        const alias = String(aliasValue ?? '').trim();
        if (!canonical || !alias) continue;
        if (out.has(canonical)) {
            throw new Error(`[PrimitiveFaceAliasResolver] Duplicate canonical key "${canonical}".`);
        }
        const existingCanonical = aliasToCanonical.get(alias);
        if (existingCanonical) {
            throw new Error(
                `[PrimitiveFaceAliasResolver] Alias "${alias}" collides between "${existingCanonical}" and "${canonical}".`
            );
        }
        out.set(canonical, alias);
        aliasToCanonical.set(alias, canonical);
    }
    return out;
}
