// World-anchored landscape-scale variation of natural materials, mirroring LandscapeMacroVariation.js (landscape-macro-variation-v1).
// Include through the shaderlib directive for landscape/macro_variation after landscape/surface_warp, whose integer hash it reuses.
// Values come from landscapeMacroVariationUniforms(seed, soils):
//   uMacroOctaves[k]   vec4(1 / wavelength, amplitude, cos, sin) of octave k, longest first
//   uMacroSalts        ivec4 octave salts (uint32 stored as two's-complement integers); each drives both fields of its octave
//   uMacroSettings     vec4(enabled, fade start and end in wavelengths per pixel, reciprocal unfaded field deviation)
//   uSoilMacro[soil]   vec4(log2 value, saturation, hue radians, roughness) per unit field deviation
// landscapeMacroField(world, footprint) returns the footprint-filtered unit (tone, chroma) fields. D5 adds terrain-driven inputs to this
// field vector before landscapeMacroAlbedo and landscapeMacroRoughness apply the per-material responses.
uniform vec4 uMacroOctaves[4];
uniform ivec4 uMacroSalts;
uniform vec4 uMacroSettings;
uniform vec4 uSoilMacro[6];

// both fields of one lattice corner: the low and high 16 bits of its hash
vec2 landscapeMacroCorner(ivec2 index, uint salt) {
    uint h = landscapeWarpMix((uint(index.x) * 0x27d4eb2du) ^ (uint(index.y) * 0x165667b1u) ^ salt);
    return vec2(float(h & 0xffffu), float(h >> 16u)) / 65535.0 * 2.0 - 1.0;
}

vec2 landscapeMacroNoise(vec2 world, vec4 octave, uint salt) {
    vec2 lattice = vec2(octave.z * world.x - octave.w * world.y, octave.w * world.x + octave.z * world.y) * octave.x + vec2(float(salt & 0xffffu), float(salt >> 16u)) / 65536.0;
    vec2 cell = floor(lattice), f = lattice - cell;
    ivec2 index = ivec2(cell);
    vec2 s = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
    vec2 bottom = mix(landscapeMacroCorner(index, salt), landscapeMacroCorner(index + ivec2(1, 0), salt), s.x);
    vec2 top = mix(landscapeMacroCorner(index + ivec2(0, 1), salt), landscapeMacroCorner(index + ivec2(1, 1), salt), s.x);
    return mix(bottom, top, s.y);
}

vec2 landscapeMacroField(vec2 world, float footprint) {
    vec2 field = vec2(0.0);
    if (uMacroSettings.x < 0.5) return field;
    for (int k = 0; k < 4; k++) {
        vec4 octave = uMacroOctaves[k];
        float wavelength = 1.0 / octave.x;
        float amplitude = octave.y * (1.0 - smoothstep(wavelength * uMacroSettings.y, wavelength * uMacroSettings.z, footprint));
        if (amplitude <= 0.0) continue;
        int salt = k == 0 ? uMacroSalts.x : k == 1 ? uMacroSalts.y : k == 2 ? uMacroSalts.z : uMacroSalts.w;
        field += amplitude * landscapeMacroNoise(world, octave, uint(salt));
    }
    return field * uMacroSettings.w;
}

// hue rotates about the gray axis and saturation about Rec.709 luminance with chroma; the log2 value follows tone
vec3 landscapeMacroAlbedo(int soil, vec2 field, vec3 albedo) {
    if (uMacroSettings.x < 0.5) return albedo;
    const vec3 axis = vec3(0.57735026919);
    vec4 response = uSoilMacro[soil];
    float angle = response.z * field.y, cosine = cos(angle), sine = sin(angle);
    vec3 color = albedo * cosine + cross(axis, albedo) * sine + axis * dot(axis, albedo) * (1.0 - cosine);
    float luminance = dot(color, vec3(0.2126, 0.7152, 0.0722));
    color = mix(vec3(luminance), color, max(0.0, 1.0 + response.y * field.y));
    return max(vec3(0.0), color * exp2(response.x * field.x));
}

float landscapeMacroRoughness(int soil, vec2 field, float roughness) {
    return uMacroSettings.x < 0.5 ? roughness : clamp(roughness + uSoilMacro[soil].w * field.x, 0.05, 1.0);
}
