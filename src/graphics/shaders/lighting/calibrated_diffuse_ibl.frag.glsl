uniform float calibratedDiffuseIblIntensity;

#ifdef USE_ENVMAP
vec3 getCalibratedIBLIrradiance(const in vec3 normal) {
    if (calibratedDiffuseIblIntensity < 0.0) return getIBLIrradiance(normal);
    #ifdef ENVMAP_TYPE_CUBE_UV
        vec3 worldNormal = inverseTransformDirection(normal, viewMatrix);
        vec4 sky = textureCubeUV(envMap, envMapRotation * worldNormal, 1.0);
        return PI * sky.rgb * calibratedDiffuseIblIntensity;
    #else
        return vec3(0.0);
    #endif
}
#endif
