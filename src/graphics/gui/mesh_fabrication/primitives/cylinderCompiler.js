// src/graphics/gui/mesh_fabrication/primitives/cylinderCompiler.js

export function compileCylinderPrimitiveSeedState({
    componentPath,
    primitive,
    faceAliasesByCanonical,
    compileSeedState
}) {
    if (typeof compileSeedState !== 'function') {
        throw new Error('[CylinderPrimitiveCompiler] compileSeedState callback is required.');
    }
    return compileSeedState(componentPath, primitive, { faceAliasesByCanonical });
}
