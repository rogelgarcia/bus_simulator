// Relight separately filtered grass and soil contributions without treating a mixed texel as one material.
uniform vec3 grassFloorLeafColorScale;
#ifdef GRASS_FLOOR_CAPTURE_FRAME
uniform mat3 grassFloorCaptureToCard;
#endif
float grassFloorLeafMask;
vec3 grassFloorSoilColor;
float grassFloorCanopyExposure = 1.0;
void RE_Direct_GrassFloor(const in IncidentLight directLight, const in vec3 geometryPosition,
    const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal,
    const in PhysicalMaterial material, inout ReflectedLight reflectedLight) {
    vec3 up = viewMatrix[1].xyz;
    vec3 viewHorizontal = geometryViewDir - up * dot(geometryViewDir, up);
    vec3 lightHorizontal = directLight.direction - up * dot(directLight.direction, up);
    float alignment = dot(viewHorizontal, lightHorizontal) / max(length(lightHorizontal), 0.00001);
    float elevation = abs(dot(geometryViewDir, up));
    float angularStrength = mix(0.15, 0.40, smoothstep(0.30, 0.65, elevation));
    float leafVisibility = 0.44 + 0.36 * (1.0 - elevation) + angularStrength * alignment;
    leafVisibility = min(1.0, leafVisibility * mix(1.0, grassFloorCanopyExposure, smoothstep(0.20, 0.65, elevation)));
    #ifdef GRASS_FLOOR_DIRECTIONAL
        // Oblique views contain different occluders. Use their captured sun visibility instead of the overhead approximation.
        leafVisibility = mix(leafVisibility, grassViewSunVisibility(vMapUv), 1.0 - grassViewWeights.x);
    #endif
    leafVisibility = mix(1.0, leafVisibility, GRASS_FLOOR_OCCLUSION_STRENGTH);
    vec3 previousDiffuse = reflectedLight.directDiffuse;
    IncidentLight canopyLight = directLight;
    canopyLight.color *= mix(1.0, leafVisibility, grassFloorLeafMask);
    RE_Direct_Grass(canopyLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight);
    float cosine = dot(grassFacingSourceNormal, directLight.direction);
    float front = saturate(cosine) + 0.35 * saturate(-cosine);
    float back = saturate(-cosine) + 0.35 * saturate(cosine);
    vec3 grassColor = max(material.diffuseColor - grassFloorSoilColor, vec3(0.0));
    vec3 soilNormal = normalize(mix(geometryNormal, up, grassFloorLeafMask));
    reflectedLight.directDiffuse = previousDiffuse + directLight.color * (
        mix(back, front, grassFacingFrontWeight) * leafVisibility * BRDF_Lambert(grassColor)
        + saturate(dot(soilNormal, directLight.direction)) * BRDF_Lambert(grassFloorSoilColor));
}
#undef RE_Direct
#define RE_Direct RE_Direct_GrassFloor
