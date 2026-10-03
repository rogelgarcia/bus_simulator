// Field leaves use the live material's reflected-light weight and average warm transmission.
uniform vec3 grassFloorLeafColorScale;
#ifdef GRASS_FLOOR_CAPTURE_FRAME
uniform mat3 grassFloorCaptureToCard;
#endif
float grassFloorLeafMask;
vec3 grassFloorSoilColor;
float grassFloorCanopyExposure = 1.0;
vec3 grassCanopyAngularColor = vec3(1.0);
void RE_Direct_GrassFloor(const in IncidentLight directLight, const in vec3 geometryPosition,
    const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal,
    const in PhysicalMaterial material, inout ReflectedLight reflectedLight) {
    vec3 up = viewMatrix[1].xyz;
    vec3 previousDiffuse = reflectedLight.directDiffuse;
    RE_Direct_Grass(directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight);
    float cosine = dot(grassFacingSourceNormal, directLight.direction);
    vec3 transmission = vec3(1.12, 1.0, 0.70) * 0.55;
    vec3 front = vec3(0.72 * saturate(cosine)) + transmission * saturate(-cosine);
    vec3 back = vec3(0.72 * saturate(-cosine)) + transmission * saturate(cosine);
    vec3 grassColor = max(material.diffuseColor - grassFloorSoilColor, vec3(0.0));
    #ifdef GRASS_FIELD_CANOPY_WALL
        // Background visible through a side capture is horizontal litter/soil,
        // not a vertical surface with the nearest leaf's captured normal.
        vec3 soilNormal = up;
    #else
        vec3 soilNormal = normalize(mix(geometryNormal, up, grassFloorLeafMask));
    #endif
    reflectedLight.directDiffuse = previousDiffuse + directLight.color * (
        mix(back, front, grassFacingFrontWeight) * BRDF_Lambert(grassColor)
        + saturate(dot(soilNormal, directLight.direction)) * BRDF_Lambert(grassFloorSoilColor));
}
#undef RE_Direct
#define RE_Direct RE_Direct_GrassFloor
