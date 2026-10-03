vec2 soilNormalUv = (litterSoilNormalTransform * soilUv).xy;
vec3 soilMapNormal = texture2D(litterSoilNormal, soilNormalUv).xyz * 2.0 - 1.0;
soilMapNormal.xy *= litterSoilNormalScale;
vec3 soilUp = normalize(mat3(viewMatrix) * vec3(0.0, 1.0, 0.0));
mat3 soilTbn = getTangentFrame(-vViewPosition, soilUp, soilNormalUv);
vec3 soilNormal = normalize(soilTbn * soilMapNormal);
normal = normalize(mix(soilNormal, normal, litterCoverage));
