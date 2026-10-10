// @section pars
varying vec2 vBakedGrassWorld;
// @section project
vec4 bakedGrassWorld = vec4(transformed, 1.0);
#ifdef USE_INSTANCING
    bakedGrassWorld = instanceMatrix * bakedGrassWorld;
#endif
vBakedGrassWorld = (modelMatrix * bakedGrassWorld).xz;
