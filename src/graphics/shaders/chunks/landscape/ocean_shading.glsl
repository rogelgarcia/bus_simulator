// AI 597 shading helpers shared by the ocean surface and the D4 swash sheet (landscape-ocean-v1): the prefiltered sky lookup along a reflection
// (blurred by the mip of the angular spread beyond the map's own GGX lobe), the Cox-Munk sun glitter of a facet and the display-space mapping
// of a radiance. The surface declares the reflection uniforms before including this chunk.
#ifdef LANDSCAPE_WATER_REFLECTION
uniform sampler2D uLandscapeSkyReflection;
uniform mat3 uLandscapeSkyReflectionRotation;
#endif

// sky radiance along a direction, blurred by the mip of the angular spread beyond the map's own GGX lobe
vec3 oceanSkyRadiance(vec3 direction, float lod) {
#ifdef LANDSCAPE_WATER_REFLECTION
    vec3 game = uLandscapeSkyReflectionRotation * direction;
    vec2 uv = vec2(atan(game.z, game.x) * (0.5 * LANDSCAPE_RECIPROCAL_PI) + 0.5, asin(clamp(game.y, -1.0, 1.0)) * LANDSCAPE_RECIPROCAL_PI + 0.5);
    return textureLod(uLandscapeSkyReflection, uv, lod).rgb;
#else
    return landscapeSkyIrradiance(direction) * LANDSCAPE_RECIPROCAL_PI;
#endif
}

// Cox-Munk sun glitter of a facet: the slopes are Gaussian (Beckmann facet distribution with alpha^2 = the mean square slope), Schlick Fresnel
// and Smith-Beckmann masking (Walter et al. 2007), times the sun's cosine; unlike GGX its tail vanishes away from the mirror direction, so the
// glitter stays where the sea reflects the sun instead of veiling the whole sea when the camera looks toward the sun
float oceanBeckmannShadowing(float cosine, float alpha) {
    float a = cosine / (alpha * sqrt(max(1.0 - cosine * cosine, 1.0e-8)));
    return a < 1.6 ? (3.535 * a + 2.181 * a * a) / (1.0 + 2.276 * a + 2.577 * a * a) : 1.0;
}

vec3 oceanGlint(vec3 sun, vec3 v, vec3 n, float meanSquareSlope, float f0) {
    vec3 h = normalize(sun + v);
    float nh = max(dot(n, h), 1.0e-4), nl = max(dot(n, sun), 0.0), nv = max(dot(n, v), 1.0e-3), vh = max(dot(v, h), 0.0);
    float alpha2 = max(meanSquareSlope, 1.0e-5), alpha = sqrt(alpha2), tan2 = (1.0 - nh * nh) / (nh * nh);
    float d = exp(-tan2 / alpha2) / (LANDSCAPE_PI * alpha2 * nh * nh * nh * nh);
    float fresnel = f0 + (1.0 - f0) * pow(1.0 - vh, 5.0);
    float masking = oceanBeckmannShadowing(nl, alpha) * oceanBeckmannShadowing(nv, alpha);
    return uLandscapeSunIrradiance.rgb * d * fresnel * masking / (4.0 * nv);
}

vec3 oceanDisplay(vec3 radiance) {
#ifdef TONE_MAPPING
    radiance = toneMapping(radiance);
#endif
    return linearToOutputTexel(vec4(radiance, 1.0)).rgb;
}
