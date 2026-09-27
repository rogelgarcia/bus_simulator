// Blend visibility captures in their common floor UV frame before relighting.
uniform sampler2D grassViewAlbedoA;
uniform sampler2D grassViewAlbedoB;
uniform sampler2D grassViewNormalA;
uniform sampler2D grassViewNormalB;
uniform sampler2D grassViewRoughnessA;
uniform sampler2D grassViewRoughnessB;
uniform vec3 grassViewWeights;
uniform sampler2D grassViewVisibilityA;
uniform sampler2D grassViewVisibilityB;
float grassViewSunVisibility(vec2 uv) {
    return (texture2D(grassViewVisibilityA, uv).r * grassViewWeights.y
        + texture2D(grassViewVisibilityB, uv).r * grassViewWeights.z) / max(1.0 - grassViewWeights.x, 0.0001);
}
vec4 grassViewSample(sampler2D topMap, sampler2D viewA, sampler2D viewB, vec2 uv) {
    return texture2D(topMap, uv) * grassViewWeights.x
        + texture2D(viewA, uv) * grassViewWeights.y
        + texture2D(viewB, uv) * grassViewWeights.z;
}
