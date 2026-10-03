// Match the shadow footprint to a screen pixel without adding comparison taps.
#if defined(USE_SHADOWMAP) && defined(SHADOWMAP_TYPE_PCF)
float grassFieldFilteredShadow(sampler2DShadow shadowMap, vec2 mapSize, float intensity, float bias, float radius, vec4 coordinate) {
    vec2 uv = coordinate.xy / coordinate.w;
    float footprint = max(length(dFdx(uv) * mapSize), length(dFdy(uv) * mapSize));
    float fade = smoothstep(grassFieldDistance.x, grassFieldDistance.y, length(vViewPosition));
    radius = mix(radius, max(radius, min(6.0, footprint)), fade * grassFieldShadowSoftness);
    return getShadow(shadowMap, mapSize, intensity, bias, radius, coordinate);
}
#else
#define grassFieldFilteredShadow getShadow
#endif
