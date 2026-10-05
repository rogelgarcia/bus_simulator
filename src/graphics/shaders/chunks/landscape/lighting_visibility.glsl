// AI577 D5 terrain-scale visibility hooks of the landscape lighting (contract in specs/landscape/LANDSCAPE_APPEARANCE_RUNTIME.md, Lighting).
// Each hook returns a value in [0, 1] that is continuous across tiles, LOD and page arrival, depends only on world position and its arguments
// (never on the camera) and reads only the terrain-field sampler (the terrain program's sixteenth and last guaranteed sampler) or uniforms. The
// terrain and the water surface both evaluate them.
// Frame: world, normal and sunDirection are landscape world space (+X landscape east, +Y up, +Z landscape north, the axes the terrain renders
// in). sunDirection = uLandscapeSun.xyz is the game's azimuthElevationDegToDir(azimuth, elevation) turned by the city binding yaw only
// (x' = cos(yaw)·x - sin(yaw)·z, z' = sin(yaw)·x + cos(yaw)·z; translation never applies to directions), so its azimuth counterclockwise from
// +X toward +Z, atan(sunDirection.z, sunDirection.x), equals the game sun azimuth plus the binding yaw: the terrain-field horizon convention.
//
// landscapeSunVisibility: fraction of the solar disc (direction sunDirection, angular radius LANDSCAPE_SUN_ANGULAR_RADIUS) visible from the
// surface point world (terrain shadows). It multiplies the direct sun irradiance only; sky light and the aerial perspective are unaffected. The
// facet's own cosine and self-shadowing are already in the BRDF, so the hook reports only what distant terrain hides.
// landscapeSkyVisibility: share of the sky that the facet's own tangent plane would see but surrounding terrain hides, as a cosine-weighted
// ratio (1 on an open slope of any steepness and on open flat ground). The sky harmonics evaluated at the normal already weight the sky by the
// facet's cosine and drop everything below its tangent plane, so the terrain-field sky view, which includes the open-slope term (1 + cos S) / 2,
// is divided by that term. It multiplies, together with the material ambient occlusion, the ambient diffuse sky light and drives Lagarde's
// specular occlusion of the ambient specular light; it does not change the sky irradiance used by the aerial perspective or the water column.
//
// AI577 D5c binding (landscape-terrain-visibility-v1): a program that includes the terrain-field chunk (LANDSCAPE_TERRAIN_FIELDS: the terrain
// program, tiers standard and high) evaluates its fields once per fragment in uniform control flow (landscapeEvaluateTerrainVisibility in
// lighting.glsl) into the values below, so the hooks ignore their arguments: every caller passes the fragment and uLandscapeSun. Stale, absent
// or arriving fields blend toward the neutral 1.0 with their availability. Other programs (the water surface) keep the neutral hooks.
// The occluders of terrain-reflected light are reduced to two scalars at the same time (the cosine of the sun on them and their sky view).
// The terrain program evaluates right before lighting, after its material evaluation, so none of these values is live through the soil lattices.
#ifdef LANDSCAPE_TERRAIN_FIELDS
float landscapeFragmentSunVisibility = 1.0;
float landscapeFragmentSkyVisibility = 1.0;
float landscapeFragmentFieldWeight = 0.0;
float landscapeFragmentOccluderSun = 0.0;
float landscapeFragmentOccluderSky = 1.0;
#endif

float landscapeSunVisibility(vec3 world, vec3 normal, vec3 sunDirection) {
#ifdef LANDSCAPE_TERRAIN_FIELDS
    return landscapeFragmentSunVisibility;
#else
    return 1.0;
#endif
}

float landscapeSkyVisibility(vec3 world, vec3 normal) {
#ifdef LANDSCAPE_TERRAIN_FIELDS
    return landscapeFragmentSkyVisibility;
#else
    return 1.0;
#endif
}

// the terrain hiding the fragment's sky, as seen by terrain-reflected light: the mean cosine of the sun on the occluders and their mean sky
// view (weighted by the cosine-weighted solid angle each stored horizon azimuth hides); false without terrain fields or occluders
bool landscapeTerrainOccluders(out float sun, out float sky) {
#ifdef LANDSCAPE_TERRAIN_FIELDS
    sun = landscapeFragmentOccluderSun;
    sky = landscapeFragmentOccluderSky;
    return landscapeFragmentFieldWeight > 0.0 && landscapeFragmentSkyVisibility < 1.0;
#else
    sun = 0.0;
    sky = 1.0;
    return false;
#endif
}
