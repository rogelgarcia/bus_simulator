// World-anchored per-material clump relief, mirroring landscapeMaterialClumpValue (landscape-material-clumps-v1).
// Include through the shaderlib directive for landscape/material_clumps after landscape/surface_warp, whose lattice
// noise it reuses, and landscape/material_parameters, whose per-material rows it reads. Values come from landscapeMaterialClumpUniforms(seed, soils):
//   clumps row (landscapeMaterialClumps)    vec4(1 / first wavelength, weight, texture relief gain, billow center or 0 for smooth) per material
//   clump salts (landscapeMaterialClumpSalt) the four uint32 octave salts per material
//   uClumpOctaves[k]       vec4(frequency relative to the first octave, amplitude, cos, sin); zero amplitude ends the list
//   uClumpSettings         vec4(gain, fade start, fade end in multiples of an octave wavelength, enabled)
//   uClumpConfidence       vec4(coverage confidence start, end, relief floor, unused)
// landscapeMaterialClump(material, world, footprint, detail) returns the faded centered clump value and, in detail, the first
// octave's footprint fade (zero once it is unresolved).
uniform vec4 uClumpOctaves[4];
uniform vec4 uClumpSettings;
uniform vec4 uClumpConfidence;

float landscapeClumpNoise(vec2 world, float inverseWavelength, vec2 rotation, int salt) {
    uint bits = uint(salt);
    vec2 lattice = vec2(rotation.x * world.x - rotation.y * world.y, rotation.y * world.x + rotation.x * world.y) * inverseWavelength;
    return landscapeWarpLattice(lattice + vec2(float(bits & 0xffffu), float(bits >> 16u)) / 65536.0, bits);
}

float landscapeClumpFade(float wavelength, float footprint) {
    return 1.0 - smoothstep(wavelength * uClumpSettings.y, wavelength * uClumpSettings.z, footprint);
}

float landscapeMaterialClump(int material, vec2 world, float footprint, out float detail) {
    vec4 clump = landscapeMaterialClumps(material);
    float wavelength = 1.0 / clump.x;
    float first = landscapeClumpFade(wavelength, footprint);
    detail = first;
    if (first <= 0.0) return 0.0;
    float sum = 0.0, power = 0.0;
    for (int k = 0; k < 4; k++) {
        vec4 octave = uClumpOctaves[k];
        float amplitude = octave.y * landscapeClumpFade(wavelength / max(octave.x, 1.0e-6), footprint);
        if (amplitude <= 0.0) break;
        int salt = int(landscapeMaterialClumpSalt(material, k));
        sum += amplitude * landscapeClumpNoise(world, clump.x * octave.x, octave.zw, salt);
        power += amplitude * amplitude;
    }
    float value = sum * inversesqrt(power);
    return first * (clump.w > 0.0 ? 2.0 * abs(value) - clump.w : value);
}
