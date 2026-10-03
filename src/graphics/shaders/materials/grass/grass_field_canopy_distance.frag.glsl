// Blend radiance after normal, coverage, roughness and shadow evaluation. Blending
// their inputs first changes lighting energy when averaged normals are normalized.
#undef main
void main() {
    grassCanopyUvDx = dFdx(vMapUv);
    grassCanopyUvDy = dFdy(vMapUv);
    #ifdef GRASS_RELIEF_NEAR_SCALE
        grassCanopyUvDx *= max(1.0, length(dFdx(vGrassReliefFootprintUv)) / max(length(grassCanopyUvDx), 0.0000001));
        grassCanopyUvDy *= max(1.0, length(dFdy(vGrassReliefFootprintUv)) / max(length(grassCanopyUvDy), 0.0000001));
    #endif
    float distant = 0.0;
    #ifdef GRASS_FIELD_CANOPY_PAIR
        distant = smoothstep(grassCanopyDistance.x, grassCanopyDistance.y, length(vViewPosition));
    #endif
    vec4 nearRadiance = vec4(0.0);
    if (distant < 1.0) {
        grassCanopySampleScale = 1.0;
        grassFieldCanopyShade();
        nearRadiance = gl_FragColor;
    }
    if (distant > 0.0) {
        grassCanopySampleScale = grassCanopyDistance.z;
        grassFieldCanopyShade();
        gl_FragColor = mix(nearRadiance, gl_FragColor, distant);
    }
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    #include <fog_fragment>
    #include <premultiplied_alpha_fragment>
    #include <dithering_fragment>
}
