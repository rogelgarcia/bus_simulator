uniform vec3 grassEnvironmentLobes[6];
vec3 grassEnvironmentAmbientCube(vec3 direction) {
    vec3 weights = direction * direction;
    return weights.x * (direction.x >= 0.0 ? grassEnvironmentLobes[0] : grassEnvironmentLobes[1])
        + weights.y * (direction.y >= 0.0 ? grassEnvironmentLobes[2] : grassEnvironmentLobes[3])
        + weights.z * (direction.z >= 0.0 ? grassEnvironmentLobes[4] : grassEnvironmentLobes[5]);
}
vec3 getIBLIrradiance(const in vec3 normal) {
    return PI * grassEnvironmentAmbientCube(envMapRotation * inverseTransformDirection(normal, viewMatrix)) * envMapIntensity;
}
vec3 getIBLRadiance(const in vec3 viewDir, const in vec3 normal, const in float roughness) {
    vec3 reflected = normalize(mix(reflect(-viewDir, normal), normal, pow4(roughness)));
    return grassEnvironmentAmbientCube(envMapRotation * inverseTransformDirection(reflected, viewMatrix)) * envMapIntensity;
}
