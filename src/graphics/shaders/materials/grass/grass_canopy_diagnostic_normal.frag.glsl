// Preserve the coverage mask while removing the captured normal direction.
vec4 grassDiagnosticNormal(sampler2D sourceMap, sampler2D alternateMap, vec2 uv) {
    vec4 sampleValue = grassFieldCanopySample(sourceMap, alternateMap, uv);
    sampleValue.rgb = vec3(0.5, 0.5, 1.0);
    return sampleValue;
}
