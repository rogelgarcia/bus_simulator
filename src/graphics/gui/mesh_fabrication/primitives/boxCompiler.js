// src/graphics/gui/mesh_fabrication/primitives/boxCompiler.js

export function compileBoxPrimitiveSeedState({
    componentPath,
    primitive,
    faceAliasesByCanonical,
    compileSeedState
}) {
    if (typeof compileSeedState !== 'function') {
        throw new Error('[BoxPrimitiveCompiler] compileSeedState callback is required.');
    }
    return compileSeedState(componentPath, primitive, { faceAliasesByCanonical });
}
