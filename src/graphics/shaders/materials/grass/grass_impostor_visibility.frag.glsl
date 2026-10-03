float grassImpostorVisibility = grassImpostorSourceVisibility;
if (grassCanopyShadowPass == 2) {
    vec2 grassImpostorShadowUv = vec2(grassImpostorWorldHit.x - grassCanopyShadowBounds.x,
        grassCanopyShadowBounds.y - grassImpostorWorldHit.z) * grassCanopyShadowBounds.zw;
    if (grassImpostorInside(grassImpostorShadowUv)) {
        grassImpostorVisibility *= textureGrad(grassCanopyShadowVisibility, grassImpostorShadowUv,
            dFdx(grassImpostorShadowUv) * 2.0, dFdy(grassImpostorShadowUv) * 2.0).r;
    }
}
reflectedLight.directDiffuse *= grassImpostorVisibility;
reflectedLight.directSpecular *= grassImpostorVisibility;
