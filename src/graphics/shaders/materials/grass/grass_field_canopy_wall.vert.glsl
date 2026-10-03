// Preserve the top-to-bottom blend through the carrier's small height variation.
attribute float grassWallHeight;
varying float vGrassWallHeight;
varying vec2 vGrassWallWorldXZ;
varying vec2 vGrassWallUv;
varying vec2 vGrassWallFacing;
#ifdef GRASS_CANOPY_WALL_LITTER
varying vec2 vGrassWallLocalXZ;
varying vec2 vGrassWallLocalFacing;
#endif
void grassWallVertex(vec3 position, vec3 normal, vec2 uv) {
    vGrassWallHeight = grassWallHeight;
    vGrassWallWorldXZ = (modelMatrix * vec4(position, 1.0)).xz;
    #ifdef GRASS_CANOPY_WALL_LITTER
    vGrassWallLocalXZ = position.xz;
    vGrassWallLocalFacing = normalize(normal.xz);
    #endif
    vGrassWallUv = uv;
    vGrassWallFacing = normalize((mat3(modelMatrix) * normal).xz);
}
