uniform float calibratedDiffuseIblIntensity;

#ifdef USE_ENVMAP
vec3 getCalibratedIBLIrradiance(const in vec3 normal) {
    #ifdef ENVMAP_TYPE_CUBE_UV
        float intensity = calibratedDiffuseIblIntensity < 0.0 ? envMapIntensity : calibratedDiffuseIblIntensity;
        vec3 worldNormal = inverseTransformDirection(normal, viewMatrix);
        vec4 sky = textureCubeUV(envMap, envMapRotation * worldNormal, 1.0);
        return PI * sky.rgb * intensity;
    #else
        return vec3(0.0);
    #endif
}
#endif
