// Thin leaf tissue transmits a fraction of shadowed direct light through the opposite face.
uniform float uLeafDiffuseTransmission;

void RE_Direct_Vegetation(
    const in IncidentLight directLight,
    const in vec3 geometryPosition,
    const in vec3 geometryNormal,
    const in vec3 geometryViewDir,
    const in vec3 geometryClearcoatNormal,
    const in PhysicalMaterial material,
    inout ReflectedLight reflectedLight
) {
    vec3 previousDiffuse = reflectedLight.directDiffuse;
    RE_Direct_Physical(directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight);
    float backIrradiance = max(dot(-geometryNormal, directLight.direction), 0.0);
    reflectedLight.directDiffuse = mix(reflectedLight.directDiffuse, previousDiffuse, uLeafDiffuseTransmission)
        + uLeafDiffuseTransmission * backIrradiance * directLight.color * BRDF_Lambert(material.diffuseColor);
}

#undef RE_Direct
#define RE_Direct RE_Direct_Vegetation
