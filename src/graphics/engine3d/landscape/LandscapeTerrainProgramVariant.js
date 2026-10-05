// Declares the compile-time variants of the terrain program (AI577 D6) shared by the shader loader, the terrain tiles and the streamer.
// @ts-check
// The default program draws the shaded surface only: the inspection views selected by uDiagnostic are compiled into the diagnostics variant, and
// the terrain-driven natural appearance is compiled in while its switch is on (its body then runs unconditionally). A variant changes no uniform
// interface, so every variant shares the coverage slot sizing and the uniform objects of the default program.

export const LANDSCAPE_TERRAIN_PROGRAM_VARIANT = Object.freeze({
    defaults: Object.freeze({ diagnostics: false, terrainAppearance: true }),
    defines: Object.freeze({ diagnostics: 'LANDSCAPE_TERRAIN_DIAGNOSTICS', terrainAppearance: 'LANDSCAPE_TERRAIN_APPEARANCE' })
});

/**
 * @param {{diagnostics?:boolean,terrainAppearance?:boolean}} [variant] omitted switches take the defaults
 * @returns {Readonly<{diagnostics:boolean,terrainAppearance:boolean}>}
 */
export function landscapeProgramVariant({ diagnostics = LANDSCAPE_TERRAIN_PROGRAM_VARIANT.defaults.diagnostics,
    terrainAppearance = LANDSCAPE_TERRAIN_PROGRAM_VARIANT.defaults.terrainAppearance } = {}) {
    if (typeof diagnostics !== 'boolean' || typeof terrainAppearance !== 'boolean') throw new Error('[Landscape] Terrain program variant switches must be boolean');
    return Object.freeze({ diagnostics, terrainAppearance });
}

/** @param {{diagnostics:boolean,terrainAppearance:boolean}} a @param {{diagnostics:boolean,terrainAppearance:boolean}} b */
export function sameLandscapeProgramVariant(a, b) {
    return a.diagnostics === b.diagnostics && a.terrainAppearance === b.terrainAppearance;
}

/**
 * Valueless flag defines of a variant (a defined name enables its code).
 * @param {{diagnostics?:boolean,terrainAppearance?:boolean}} variant @returns {Readonly<Record<string, true>>}
 */
export function landscapeProgramVariantDefines(variant) {
    const resolved = landscapeProgramVariant(variant), names = LANDSCAPE_TERRAIN_PROGRAM_VARIANT.defines;
    return Object.freeze({ ...(resolved.diagnostics ? { [names.diagnostics]: true } : {}), ...(resolved.terrainAppearance ? { [names.terrainAppearance]: true } : {}) });
}
