// The terminal canopy is sampled at the same point on the ray as its ground
// surface. Match its cell transform and derivatives, including across cells.
#ifdef GRASS_CANOPY_COLOR_HANDOFF
vec2 handoffWorld = cameraPosition.xz + vGrassTransitionCanopyRay.xz
    * ((GRASS_HANDOFF_HEIGHT - cameraPosition.y) / vGrassTransitionCanopyRay.y);
// Derivatives must be evaluated before the varying fade branch.
vec2 handoffWorldDx = dFdx(handoffWorld), handoffWorldDy = dFdy(handoffWorld);
if (grassCanopyFade > 0.0) {
    vec2 handoffCenter = vGrassTransitionCellOrigin + floor(handoffWorld - vGrassTransitionCellOrigin + 0.5);
    mat2 handoffTransform;
    vec3 handoffTile = grassBakedCanopyTile(handoffWorld, handoffCenter, GRASS_HANDOFF_UV_SCALE, handoffTransform);
    vec2 handoffDx = handoffTransform * handoffWorldDx, handoffDy = handoffTransform * handoffWorldDy;
    vec3 handoffTexel;
    if (handoffTile.z > 0.5) handoffTexel = textureGrad(grassHandoffAlternate, handoffTile.xy, handoffDx, handoffDy).rgb;
    else handoffTexel = textureGrad(grassHandoffMap, handoffTile.xy, handoffDx, handoffDy).rgb;
    vec3 handoffViewColor = grassBakedCanopyViewColor(vGrassTransitionCanopyRay);
    vec3 handoffLight = handoffTexel * grassHandoffColor * handoffViewColor * bakedGrassBrightness
        * mix(1.0, mix(0.35, 1.0, bakedGrassShadow), bakedGrassShadowStrength * bakedGrassInside);
    outgoingLight = mix(outgoingLight, handoffLight, grassCanopyFade);
}
#endif
