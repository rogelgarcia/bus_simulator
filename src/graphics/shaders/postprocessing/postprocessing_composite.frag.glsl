#include <shaderlib:luma>

uniform sampler2D baseTexture;
uniform sampler2D uGlobalBloomTexture;
uniform sampler2D uSunBloomTexture;
uniform float uSunBrightnessOnly;
varying vec2 vUv;

void main() {
    vec4 base = texture2D(baseTexture, vUv);
    vec3 bloom = texture2D(uGlobalBloomTexture, vUv).rgb;
    vec3 sun = texture2D(uSunBloomTexture, vUv).rgb;
    if (uSunBrightnessOnly > 0.5) {
        float y = luma(sun);
        sun = vec3(y);
    }
    vec3 outColor = base.rgb + bloom + sun;
    gl_FragColor = vec4(outColor, base.a);
}
