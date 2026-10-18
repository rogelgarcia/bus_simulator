// Per-material parameters of the terrain programs (AI 598 D3a, landscape-material-parameters-v1), mirroring LandscapeMaterialParameters.js.
// Include through the shaderlib directive for landscape/material_parameters before every chunk that reads a material's parameters
// (material_clumps, stochastic_tiling, macro_variation). The former six-entry per-soil uniform arrays live in one RGBA32F texture, one
// texel row per material (LANDSCAPE_MATERIAL_SLOTS_MAX rows) and one texel per parameter row (LANDSCAPE_MATERIAL_PARAMETER_ROWS wide), read with
// texelFetch by the material index, so the uniform vectors no longer grow with the material count. Row indices and the array tier resolutions
// are compile-time defines of landscapeMaterialParameterDefines(). Salts (uint32) travel as two exact 16-bit halves per salt.
//   uMaterialParameters   the parameter texture (nearest, no mips)
//   uMaterialTransition   vec4(material in transition or -1, progress, array tier it mixes from, slot it mixes from)
#ifndef LANDSCAPE_MATERIAL_PARAMETER_ROWS
#error LANDSCAPE_MATERIAL_PARAMETER_ROWS must be defined by LandscapeShaderLoader
#endif
uniform sampler2D uMaterialParameters;
uniform vec4 uMaterialTransition;

vec4 landscapeMaterialParameter(int material, int row) {
    return texelFetch(uMaterialParameters, ivec2(row, material), 0);
}

// the former uSoilScale: vec4(terrain role, normal strength, AO intensity, metalness)
vec4 landscapeMaterialScale(int material) { return landscapeMaterialParameter(material, LANDSCAPE_MATERIAL_ROW_SCALE); }
// the former uSoilTiling: vec4(physical period m, paired micro period m or 0, micro normal strength, micro luminance scale)
vec4 landscapeMaterialTiling(int material) { return landscapeMaterialParameter(material, LANDSCAPE_MATERIAL_ROW_TILING); }
// the former uSoilAlbedo: vec4(brightness with the landscape gain, hue radians, saturation, tint)
vec4 landscapeMaterialAlbedo(int material) { return landscapeMaterialParameter(material, LANDSCAPE_MATERIAL_ROW_ALBEDO); }
// the former uSoilRoughness: vec4(remap min, max, gamma, invert input)
vec4 landscapeMaterialRoughness(int material) { return landscapeMaterialParameter(material, LANDSCAPE_MATERIAL_ROW_ROUGHNESS); }
// the former uSoilRange: vec4(roughness input min, max, roughness scale, UV rotation radians)
vec4 landscapeMaterialRange(int material) { return landscapeMaterialParameter(material, LANDSCAPE_MATERIAL_ROW_RANGE); }
// the former uSoilState: vec4(relief declared, bound tier resolution, micro relief strength, opposition amplitude)
vec4 landscapeMaterialState(int material) { return landscapeMaterialParameter(material, LANDSCAPE_MATERIAL_ROW_STATE); }
// the former uSoilResponse: vec4(EON diffuse roughness, natural specular shadowing weight, page mean normal slope X, Y)
vec4 landscapeMaterialResponse(int material) { return landscapeMaterialParameter(material, LANDSCAPE_MATERIAL_ROW_RESPONSE); }
// the former uSoilClumps: vec4(1 / first wavelength, weight, texture relief gain, billow center or 0 for smooth)
vec4 landscapeMaterialClumps(int material) { return landscapeMaterialParameter(material, LANDSCAPE_MATERIAL_ROW_CLUMPS); }
// the former uSoilStochastic: vec4(lattice cells per period, rotation range radians, V offset spread, contrast exponent)
vec4 landscapeMaterialStochastic(int material) { return landscapeMaterialParameter(material, LANDSCAPE_MATERIAL_ROW_STOCHASTIC); }
// the former uSoilMacro: vec4(log2 value, saturation, hue radians, roughness) per unit field deviation
vec4 landscapeMaterialMacro(int material) { return landscapeMaterialParameter(material, LANDSCAPE_MATERIAL_ROW_MACRO); }
// residency: vec4(array tier 0 coarse / 1 mid / 2 fine, slot in that array, arriving array tier or -1, arriving slot)
vec4 landscapeMaterialResidency(int material) { return landscapeMaterialParameter(material, LANDSCAPE_MATERIAL_ROW_RESIDENCY); }

uint landscapeMaterialSaltFromHalves(vec2 halves) {
    return uint(halves.x) | (uint(halves.y) << 16u);
}

// the four clump octave salts (the former uSoilClumpSalts ivec4)
uint landscapeMaterialClumpSalt(int material, int octave) {
    vec4 halves = landscapeMaterialParameter(material, octave < 2 ? LANDSCAPE_MATERIAL_ROW_SALTS_A : LANDSCAPE_MATERIAL_ROW_SALTS_B);
    return landscapeMaterialSaltFromHalves((octave & 1) == 0 ? halves.xy : halves.zw);
}

// the top-projection lattice salt (the former uSoilStochasticSalts lane)
uint landscapeMaterialStochasticSalt(int material) {
    return landscapeMaterialSaltFromHalves(landscapeMaterialParameter(material, LANDSCAPE_MATERIAL_ROW_SALTS_C).xy);
}

// resolution of an array tier (the arriving tier's resolution during a transition)
float landscapeMaterialTierResolution(int tier) {
    vec3 resolutions = LANDSCAPE_MATERIAL_TIER_RESOLUTIONS;
    return tier <= 0 ? resolutions.x : tier == 1 ? resolutions.y : resolutions.z;
}

// the material a catalog soil draws (AI 598 D3a: the soil's own material; D3b composites the layered materials here)
int landscapeMaterialOfSoil(int soil) {
    return soil;
}
