// AI 597 one radix-2 stage of the inverse FFT over the cascade atlas (both complex pairs of every texel): the butterfly table gives the twiddle
// and the two source indices of the stage (bit-reversed at stage 0); horizontal stages index within the cascade's own N-texel segment, vertical
// stages index rows. Mirror: landscapeOceanInverseFftRow in LandscapeOceanSpectrum.js.
uniform sampler2D uOceanPing;
uniform sampler2D uOceanButterfly;
uniform float uOceanTexels;
uniform int uOceanStage;
uniform float uOceanHorizontal;

vec4 oceanButterflyStep(vec4 butterfly, vec4 top, vec4 bottom) {
    vec2 w = butterfly.xy;
    vec2 a = vec2(w.x * bottom.x - w.y * bottom.y, w.x * bottom.y + w.y * bottom.x);
    vec2 b = vec2(w.x * bottom.z - w.y * bottom.w, w.x * bottom.w + w.y * bottom.z);
    return top + vec4(a, b);
}

void main() {
    ivec2 texel = ivec2(gl_FragCoord.xy);
    int texels = int(uOceanTexels);
    if (uOceanHorizontal > 0.5) {
        int base = (texel.x / texels) * texels, local = texel.x - base;
        vec4 butterfly = texelFetch(uOceanButterfly, ivec2(local, uOceanStage), 0);
        vec4 top = texelFetch(uOceanPing, ivec2(base + int(butterfly.z), texel.y), 0), bottom = texelFetch(uOceanPing, ivec2(base + int(butterfly.w), texel.y), 0);
        gl_FragColor = oceanButterflyStep(butterfly, top, bottom);
    } else {
        vec4 butterfly = texelFetch(uOceanButterfly, ivec2(texel.y, uOceanStage), 0);
        vec4 top = texelFetch(uOceanPing, ivec2(texel.x, int(butterfly.z)), 0), bottom = texelFetch(uOceanPing, ivec2(texel.x, int(butterfly.w)), 0);
        gl_FragColor = oceanButterflyStep(butterfly, top, bottom);
    }
}
