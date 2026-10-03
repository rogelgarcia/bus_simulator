// LOD2 material-mask fit: eight bearings, three elevations and two distances.
// The separate 48-view holdout and the coefficient calibration are documented in GRASS_DEBUG_V2.md.
// Leaf and ground fits use the periodic 4K tile with separately baked self-shadow visibility.
float grassCanopyBearing = 0.0;
#if NUM_DIR_LIGHTS > 0
    vec3 grassCanopyUp = viewMatrix[1].xyz;
    vec3 grassCanopyLight = directionalLights[0].direction;
    vec3 grassCanopyLightHorizontal = grassCanopyLight - grassCanopyUp * dot(grassCanopyLight, grassCanopyUp);
    float grassCanopyAlignment = dot(grassCanopyView, grassCanopyLightHorizontal) / max(length(grassCanopyLightHorizontal), 0.00001);
    grassCanopyBearing = grassCanopyAlignment / max(sqrt(max(0.0, 1.0 - grassCanopyElevation * grassCanopyElevation)), 0.00001);
    grassCanopyBearing *= 1.0 - smoothstep(0.85, 0.99, grassCanopyElevation);
#endif
float grassCanopyBearing2 = grassCanopyBearing * grassCanopyBearing;
vec3 grassCanopyLeafScale = vec3(1.077166, 0.986938, 0.992491) + vec3(0.001427, 0.025878, 0.089601) * grassCanopyBearing + vec3(0.156324, 0.130462, 0.146344) * grassCanopyBearing2
    + grassCanopyElevation * (vec3(-0.790792, -0.606502, -0.668210) + vec3(0.647443, 0.557333, 0.414015) * grassCanopyBearing + vec3(-0.162855, -0.135037, -0.266431) * grassCanopyBearing2
    + grassCanopyElevation * (vec3(0.779332, 0.663404, 0.738781) + vec3(-0.369627, -0.335925, -0.305204) * grassCanopyBearing + vec3(0.027320, 0.022772, 0.149676) * grassCanopyBearing2));
grassCanopyLeafScale = clamp(grassCanopyLeafScale, vec3(0.1), vec3(1.5));
#if GRASS_FIELD_CANOPY_LITTER
    vec3 grassCanopySoilScale = vec3(1.042122, 1.108461, 1.241150) + vec3(-0.077856, -0.101082, -0.128386) * grassCanopyBearing + vec3(0.103731, 0.134515, 0.170752) * grassCanopyBearing2
        + grassCanopyElevation * (vec3(-0.273178, -0.412781, -0.705772) + vec3(0.236048, 0.289572, 0.355521) * grassCanopyBearing + vec3(-0.205803, -0.303523, -0.434929) * grassCanopyBearing2
        + grassCanopyElevation * (vec3(0.205195, 0.294359, 0.481465) + vec3(-0.143902, -0.185409, -0.240360) * grassCanopyBearing + vec3(0.199877, 0.285940, 0.406659) * grassCanopyBearing2));
#else
    vec3 grassCanopySoilScale = vec3(1.543381, 1.847986, 2.634679) + vec3(-0.755747, -0.972985, -1.373847) * grassCanopyBearing + vec3(0.934601, 1.199353, 1.685585) * grassCanopyBearing2
        + grassCanopyElevation * (vec3(-1.392602, -2.157717, -4.126015) + vec3(1.225152, 1.594980, 2.348266) * grassCanopyBearing + vec3(-1.346003, -1.826245, -2.801839) * grassCanopyBearing2
        + grassCanopyElevation * (vec3(1.226786, 1.791680, 3.189082) + vec3(-0.715125, -0.954235, -1.459412) * grassCanopyBearing + vec3(0.635685, 0.917061, 1.540585) * grassCanopyBearing2));
    // Correct low-elevation bare-soil energy; validated independently of the merged-litter fit.
    grassCanopySoilScale *= 1.0 - 0.185 * pow(1.0 - grassCanopyElevation, 2.0);
#endif
diffuseColor.rgb = max(diffuseColor.rgb - grassFloorSoilColor, vec3(0.0)) * grassCanopyLeafScale
    + grassFloorSoilColor * grassCanopySoilScale;
grassFloorSoilColor *= grassCanopySoilScale;
