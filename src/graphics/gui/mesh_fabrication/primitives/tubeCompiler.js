// src/graphics/gui/mesh_fabrication/primitives/tubeCompiler.js

export function compileTubePrimitiveSeedState({
    componentPath,
    primitive,
    faceAliasesByCanonical,
    compileSeedState
}) {
    if (typeof compileSeedState !== 'function') {
        throw new Error('[TubePrimitiveCompiler] compileSeedState callback is required.');
    }
    return compileSeedState(componentPath, primitive, { faceAliasesByCanonical });
}
