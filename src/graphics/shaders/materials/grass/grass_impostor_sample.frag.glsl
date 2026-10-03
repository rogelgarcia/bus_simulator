// The cache already constrains view error. Sample its image directly instead of ray-marching thin leaves.
vec2 grassImpostorUv = grassImpostorProject(vGrassImpostorProxy);
vec2 grassImpostorDx = dFdx(grassImpostorUv), grassImpostorDy = dFdy(grassImpostorUv);
if (!grassImpostorInside(grassImpostorUv)) discard;
vec4 grassImpostorColor = textureGrad(grassImpostorAlbedo, grassImpostorUv, grassImpostorDx, grassImpostorDy);
if (grassImpostorColor.a < 0.01) discard;
float grassImpostorBestDepth = texture2D(grassImpostorDepth, grassImpostorUv).r;
if (grassImpostorBestDepth >= 0.999999) {
    for (int grassImpostorTap = 0; grassImpostorTap < 4; grassImpostorTap++) {
        vec2 grassImpostorOffset = vec2(float(grassImpostorTap % 2), float(grassImpostorTap / 2)) - 0.5;
        vec2 grassImpostorDepthUv = grassImpostorUv + (grassImpostorDx * grassImpostorOffset.x + grassImpostorDy * grassImpostorOffset.y) * 0.7;
        grassImpostorBestDepth = min(grassImpostorBestDepth, texture2D(grassImpostorDepth, grassImpostorDepthUv).r);
    }
    // Filtered color may contain subpixel leaves even when the depth taps land in gaps.
    if (grassImpostorBestDepth >= 0.999999) {
        vec4 grassImpostorProxyClip = grassImpostorViewProjection * vec4(vGrassImpostorProxy, 1.0);
        grassImpostorBestDepth = grassImpostorProxyClip.z / grassImpostorProxyClip.w * 0.5 + 0.5;
    }
}
vec3 grassImpostorWorldHit = vGrassImpostorOrigin + grassImpostorUnproject(grassImpostorUv, grassImpostorBestDepth);
vec3 grassImpostorViewPosition = -(viewMatrix * vec4(grassImpostorWorldHit, 1.0)).xyz;
diffuseColor *= vec4(grassImpostorColor.rgb / max(grassImpostorColor.a, 0.0001), grassImpostorColor.a);
