vec3 grassSourceNormal = normalize(texture2D(normalMap, vNormalMapUv).xyz * 2.0 - 1.0);
vec2 grassFacing = vGrassTriadSourceFacing;
grassSourceNormal = vec3(
    grassFacing.y * grassSourceNormal.x + grassFacing.x * grassSourceNormal.z,
    grassSourceNormal.y,
    -grassFacing.x * grassSourceNormal.x + grassFacing.y * grassSourceNormal.z
);
normal = normalize(mat3(viewMatrix) * grassSourceNormal);
vec3 grassCardView = isOrthographic ? vec3(0.0, 0.0, 1.0) : normalize(vViewPosition);
normal *= dot(normal, grassCardView) >= 0.0 ? 1.0 : -1.0;
