// AI 597 slopes and folding of one cascade from its displacement texture by central differences on the wrapped grid: the slopes of the
// horizontally displaced surface (dh/dx over 1 + dDx/dx, dh/dz over 1 + dDz/dz), the Jacobian of the horizontal displacement (folding below
// zero: whitecaps, AI 597 D3) and the squared slope magnitude, whose mip average minus the squared mean slope is the filtered slope variance of
// the LEAN roughness.
uniform sampler2D uOceanDisplacement;
uniform float uOceanTexels;
uniform float uOceanTexelMeters;

vec4 oceanTexel(ivec2 texel) {
    int texels = int(uOceanTexels);
    return texelFetch(uOceanDisplacement, ivec2((texel.x + texels) % texels, (texel.y + texels) % texels), 0);
}

void main() {
    ivec2 texel = ivec2(gl_FragCoord.xy);
    float spacing = 2.0 * uOceanTexelMeters;
    vec4 dx = (oceanTexel(texel + ivec2(1, 0)) - oceanTexel(texel - ivec2(1, 0))) / spacing;
    vec4 dz = (oceanTexel(texel + ivec2(0, 1)) - oceanTexel(texel - ivec2(0, 1))) / spacing;
    float jacobian = (1.0 + dx.x) * (1.0 + dz.z) - dz.x * dx.z;
    vec2 slope = vec2(dx.y / max(1.0 + dx.x, 0.25), dz.y / max(1.0 + dz.z, 0.25));
    gl_FragColor = vec4(slope, jacobian, dot(slope, slope));
}
