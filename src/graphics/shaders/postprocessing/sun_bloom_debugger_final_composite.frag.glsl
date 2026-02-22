uniform sampler2D baseTexture;
uniform sampler2D bloomTexture;
uniform float uBloomStrength;
uniform float uBloomBrightnessOnly;
uniform float uViewMode;
varying vec2 vUv;

#include <shaderlib:luma>

void main() {
    vec3 base = texture2D(baseTexture, vUv).rgb;
    vec3 bloom = texture2D(bloomTexture, vUv).rgb * uBloomStrength;
    if (uBloomBrightnessOnly > 0.5) {
        float y = luma(bloom);
        bloom = vec3(y);
    }
    vec3 outColor = base + bloom;
    if (uViewMode > 0.5) outColor = bloom;
    gl_FragColor = vec4(outColor, 1.0);
}
