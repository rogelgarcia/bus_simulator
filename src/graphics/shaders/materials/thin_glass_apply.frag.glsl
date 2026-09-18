vec2 thinGlassUv = (vThinGlassWorldXZ - thinGlassBounds.xy) / (thinGlassBounds.zw - thinGlassBounds.xy);
vec3 thinGlassVisibility = mix(vec3(1.0), texture2D(thinGlassMap, thinGlassUv).rgb, thinGlassEnabled);
reflectedLight.directDiffuse *= thinGlassVisibility;
reflectedLight.directSpecular *= thinGlassVisibility;
