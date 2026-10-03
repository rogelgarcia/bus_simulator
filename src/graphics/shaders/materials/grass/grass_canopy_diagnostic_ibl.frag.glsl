// Remove HDR environment convolution lookups, retaining hemisphere and direct light.
vec3 getIBLIrradiance(const in vec3 normal) { return vec3(0.0); }
vec3 getIBLRadiance(const in vec3 viewDir, const in vec3 normal, const in float roughness) { return vec3(0.0); }
