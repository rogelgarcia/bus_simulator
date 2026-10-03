vec4 litterTexel = texture2D(map, vMapUv);
float litterCoverage = smoothstep(0.5, 0.5 + max(fwidth(litterTexel.a), 0.000001), litterTexel.a);
vec3 soilUv = litterSoilUv * vec3(vLitterSoilWorld.xz, 1.0);
vec3 soilAlbedo = texture2D(litterSoilMap, (litterSoilMapTransform * soilUv).xy).rgb * litterSoilColor;
diffuseColor.rgb = mix(soilAlbedo, diffuseColor.rgb * litterTexel.rgb, litterCoverage);
diffuseColor.a = 1.0;
