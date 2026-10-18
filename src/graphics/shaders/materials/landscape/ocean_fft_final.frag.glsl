// AI 597 last (vertical) FFT stage of one cascade, written into its own wrapped displacement texture: the centred-spectrum sign (-1)^(x + y)
// and the cascade's choppiness give (Dx, h, Dz, 0) in meters at texel (x, y) = patch position (x, y) L / N.
uniform sampler2D uOceanPing;
uniform sampler2D uOceanButterfly;
uniform float uOceanTexels;
uniform int uOceanStage;
uniform int uOceanCascadeIndex;
uniform float uOceanChoppiness;

void main() {
    ivec2 texel = ivec2(gl_FragCoord.xy);
    int texels = int(uOceanTexels), x = uOceanCascadeIndex * texels + texel.x;
    vec4 butterfly = texelFetch(uOceanButterfly, ivec2(texel.y, uOceanStage), 0);
    vec4 top = texelFetch(uOceanPing, ivec2(x, int(butterfly.z)), 0), bottom = texelFetch(uOceanPing, ivec2(x, int(butterfly.w)), 0);
    vec2 w = butterfly.xy;
    vec2 a = top.xy + vec2(w.x * bottom.x - w.y * bottom.y, w.x * bottom.y + w.y * bottom.x);
    vec2 b = top.zw + vec2(w.x * bottom.z - w.y * bottom.w, w.x * bottom.w + w.y * bottom.z);
    float parity = ((texel.x + texel.y) & 1) == 0 ? 1.0 : -1.0;
    gl_FragColor = vec4(parity * a.y * uOceanChoppiness, parity * a.x, parity * b.x * uOceanChoppiness, 0.0);
}
