// Blend lit captures, not their normals. Include azimuth relative to the wall:
// a diagonal view sees less distance through the grass for the same elevation.
#undef main
void main() {
    grassWallLitterWeight = grassWallLitterBlend.z * smoothstep(grassWallLitterBlend.x, grassWallLitterBlend.y, vGrassWallHeight);
    grassWallDx = dFdx(vMapUv);
    grassWallDy = dFdy(vMapUv);
    vec3 view = normalize(vViewPosition) * mat3(viewMatrix);
    float angle = degrees(atan(abs(view.y), max(abs(dot(view.xz, normalize(vGrassWallFacing))), 0.00001)));
    float capture = angle <= 30.0 ? angle / 15.0 : 2.0 + (angle - 30.0) / 30.0;
    capture = clamp(capture, 0.0, 3.0);
    float first = floor(capture), weight = fract(capture);
    grassWallCaptureOffset = first * 0.25;
    grassWallShade();
    vec4 radiance = gl_FragColor;
    if (weight > 0.0) {
        grassWallCaptureOffset += 0.25;
        grassWallShade();
        gl_FragColor = mix(radiance, gl_FragColor, weight);
    }
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    #include <fog_fragment>
    #include <premultiplied_alpha_fragment>
    #include <dithering_fragment>
}
