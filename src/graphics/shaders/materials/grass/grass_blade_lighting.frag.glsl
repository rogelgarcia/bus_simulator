// Thin grass transmits part of the shadowed direct light that reaches its far side.
#include <lights_physical_pars_fragment>

#ifdef GRASS_CANOPY
uniform vec4 grassCanopyBounds;
uniform float grassCanopyHeight;
uniform float grassCanopyOpticalDepth;

// Integrate a canopy whose leaf density decreases toward its top. A ray may
// escape through the sunward field edge before reaching the canopy ceiling.
float grassSunVisibility(const in vec3 viewPosition, const in vec3 viewLightDirection) {
    vec3 position = cameraPosition + viewPosition * mat3(viewMatrix);
    vec3 direction = viewLightDirection * mat3(viewMatrix);
    vec3 safeDirection = mix(vec3(-1.0), vec3(1.0), step(vec3(0.0), direction))
        * max(abs(direction), vec3(0.0001));
    vec3 nearHit = (vec3(grassCanopyBounds.x, 0.0, grassCanopyBounds.y) - position) / safeDirection;
    vec3 farHit = (vec3(grassCanopyBounds.z, grassCanopyHeight, grassCanopyBounds.w) - position) / safeDirection;
    vec3 entry = min(nearHit, farHit);
    vec3 exit = max(nearHit, farHit);
    float start = max(0.0, max(entry.x, max(entry.y, entry.z)));
    float end = min(exit.x, min(exit.y, exit.z));
    float distanceInGrass = max(0.0, end - start);
    float startDensity = 1.0 - clamp((position.y + direction.y * start) / grassCanopyHeight, 0.0, 1.0);
    float endDensity = 1.0 - clamp((position.y + direction.y * end) / grassCanopyHeight, 0.0, 1.0);
    float opticalDepth = grassCanopyOpticalDepth * distanceInGrass / grassCanopyHeight
        * (startDensity + endDensity) * 0.5;
    return exp(-opticalDepth);
}
#endif

void RE_Direct_Grass(const in IncidentLight directLight, const in vec3 geometryPosition,
    const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal,
    const in PhysicalMaterial material, inout ReflectedLight reflectedLight) {
    IncidentLight canopyLight = directLight;
    #ifdef GRASS_CANOPY
        canopyLight.color *= grassSunVisibility(geometryPosition, directLight.direction);
    #endif
    #ifdef GRASS_PLANT_FACING
        vec3 grassPreviousDiffuse = reflectedLight.directDiffuse;
    #endif
    IncidentLight grassReflectedLight = canopyLight;
    #ifdef GRASS_LEAF_TRANSLUCENCY
        grassReflectedLight.color *= 0.72;
    #endif
    RE_Direct_Physical(grassReflectedLight, geometryPosition, geometryNormal, geometryViewDir,
        geometryClearcoatNormal, material, reflectedLight);
    #ifdef GRASS_PLANT_FACING
        float grassLightCosine = dot(grassFacingSourceNormal, directLight.direction);
        float grassFrontDiffuse = saturate(grassLightCosine) + 0.35 * saturate(-grassLightCosine);
        float grassBackDiffuse = saturate(-grassLightCosine) + 0.35 * saturate(grassLightCosine);
        reflectedLight.directDiffuse = grassPreviousDiffuse
            + mix(grassBackDiffuse, grassFrontDiffuse, grassFacingFrontWeight)
            * canopyLight.color * BRDF_Lambert(material.diffuseColor);
    #elif defined(GRASS_LEAF_TRANSLUCENCY)
        float grassBlade = smoothstep(0.12, 0.28, vUv.y);
        float grassMargin = smoothstep(0.1, 0.8, abs(2.0 * vUv.x - 1.0));
        float grassTransmission = mix(0.35, mix(0.50, 0.64, grassMargin), grassBlade);
        vec3 grassTransmissionColor = material.diffuseColor * mix(vec3(1.0), vec3(1.12, 1.0, 0.70), grassBlade);
        reflectedLight.directDiffuse += grassTransmission * saturate(dot(-geometryNormal, directLight.direction))
            * canopyLight.color * BRDF_Lambert(grassTransmissionColor);
    #else
        reflectedLight.directDiffuse += 0.35 * saturate(dot(-geometryNormal, directLight.direction))
            * canopyLight.color * BRDF_Lambert(material.diffuseColor);
    #endif
}

#undef RE_Direct
#define RE_Direct RE_Direct_Grass
