// @section pars
uniform vec4 grassViewCardShape;
varying vec2 vGrassCardUv;
varying vec3 vGrassCardRight;
float grassCardBlade;
float grassCardTransmission;
vec3 grassCardWorldNormal(vec3 captured, vec3 right) {
    vec3 horizontal = vec3(-right.z, 0.0, right.x);
    vec3 up = vec3(0.0, grassViewCardShape.w, 0.0) - horizontal * grassViewCardShape.z;
    vec3 forward = horizontal * grassViewCardShape.w + vec3(0.0, grassViewCardShape.z, 0.0);
    return right * captured.x + up * captured.y + forward * captured.z;
}
// @section map
// One stable leaf image per card: no partially transparent, disjoint silhouettes
// from cross-fading different source leaves as the camera turns.
diffuseColor *= texture2D(map, vGrassCardUv);
// @section roughness
vec4 grassCardSurface = texture2D(roughnessMap, vGrassCardUv);
grassCardBlade = grassCardSurface.r;
grassCardTransmission = grassCardSurface.b;
float roughnessFactor = grassCardSurface.g;
// @section normal
vec3 grassCardCapturedNormal = texture2D(normalMap, vGrassCardUv).xyz * 2.0 - 1.0;
vec3 grassCardWorld = grassCardWorldNormal(grassCardCapturedNormal, vGrassCardRight);
normal = normalize(mat3(viewMatrix) * grassCardWorld);
