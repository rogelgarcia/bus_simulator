// Average subpixel leaf orientations smoothly instead of preserving full-strength
// bright/dark angular lobes when individual blades can no longer be resolved.
void RE_Direct_GrassDistance(const in IncidentLight light, const in vec3 position,
    const in vec3 normal, const in vec3 viewDir, const in vec3 clearcoatNormal,
    const in PhysicalMaterial material, inout ReflectedLight reflectedLight) {
    vec3 previous = reflectedLight.directDiffuse;
    RE_Direct_Grass(light, position, normal, viewDir, clearcoatNormal, material, reflectedLight);
    float fade = smoothstep(grassFieldDistance.x, grassFieldDistance.y, length(position));
    vec3 average = light.color * BRDF_Lambert(material.diffuseColor) * vec3(0.32, 0.30, 0.255);
    reflectedLight.directDiffuse = previous + mix(reflectedLight.directDiffuse - previous,
        average, fade * grassFieldDistance.z);
}
#undef RE_Direct
#define RE_Direct RE_Direct_GrassDistance
