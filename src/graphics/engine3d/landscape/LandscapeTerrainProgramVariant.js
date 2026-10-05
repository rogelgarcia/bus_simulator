// Declares the compile-time variants of the terrain program (AI577 D6) shared by the shader loader, the terrain tiles and the streamer.
// @ts-check
// The default program draws the shaded surface only: the inspection views selected by uDiagnostic are compiled into the diagnostics variant, and
// the terrain-driven natural appearance is compiled in while its switch is on (its body then runs unconditionally). The surface cache variant
// (AI577 D6 core, landscape-surface-cache-v1) reads the composited surface from the runtime cache instead of evaluating coverage and materials;
// the diagnostics variant always evaluates them, so it takes precedence while an inspection view is selected. The cache variant's own uniforms
// are declared only inside it and are accounted separately from the shared coverage slot sizing; every other uniform is shared.

export const LANDSCAPE_TERRAIN_PROGRAM_VARIANT = Object.freeze({
    defaults: Object.freeze({ diagnostics: false, terrainAppearance: true, surfaceCache: false }),
    defines: Object.freeze({ diagnostics: 'LANDSCAPE_TERRAIN_DIAGNOSTICS', terrainAppearance: 'LANDSCAPE_TERRAIN_APPEARANCE', surfaceCache: 'LANDSCAPE_SURFACE_CACHE' })
});

/**
 * @param {{diagnostics?:boolean,terrainAppearance?:boolean,surfaceCache?:boolean}} [variant] omitted switches take the defaults
 * @returns {Readonly<{diagnostics:boolean,terrainAppearance:boolean,surfaceCache:boolean}>}
 */
export function landscapeProgramVariant({ diagnostics = LANDSCAPE_TERRAIN_PROGRAM_VARIANT.defaults.diagnostics,
    terrainAppearance = LANDSCAPE_TERRAIN_PROGRAM_VARIANT.defaults.terrainAppearance, surfaceCache = LANDSCAPE_TERRAIN_PROGRAM_VARIANT.defaults.surfaceCache } = {}) {
    if (typeof diagnostics !== 'boolean' || typeof terrainAppearance !== 'boolean' || typeof surfaceCache !== 'boolean') throw new Error('[Landscape] Terrain program variant switches must be boolean');
    return Object.freeze({ diagnostics, terrainAppearance, surfaceCache });
}

/** @param {{diagnostics:boolean,terrainAppearance:boolean,surfaceCache?:boolean}} a @param {{diagnostics:boolean,terrainAppearance:boolean,surfaceCache?:boolean}} b */
export function sameLandscapeProgramVariant(a, b) {
    return a.diagnostics === b.diagnostics && a.terrainAppearance === b.terrainAppearance && !!a.surfaceCache === !!b.surfaceCache;
}

/**
 * Valueless flag defines of a variant (a defined name enables its code); the surface cache define is left out while diagnostics are compiled.
 * @param {{diagnostics?:boolean,terrainAppearance?:boolean,surfaceCache?:boolean}} variant @returns {Readonly<Record<string, true>>}
 */
export function landscapeProgramVariantDefines(variant) {
    const resolved = landscapeProgramVariant(variant), names = LANDSCAPE_TERRAIN_PROGRAM_VARIANT.defines;
    return Object.freeze({ ...(resolved.diagnostics ? { [names.diagnostics]: true } : {}), ...(resolved.terrainAppearance ? { [names.terrainAppearance]: true } : {}),
        ...(resolved.surfaceCache && !resolved.diagnostics ? { [names.surfaceCache]: true } : {}) });
}
