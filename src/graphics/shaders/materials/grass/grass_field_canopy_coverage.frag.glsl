// Oblique views travel through more of the upright foliage volume.
// Reconstruct uncovered ground using inverse view elevation; cap the path at the horizon.
float grassCanopyOriginalMask = grassFloorLeafMask;
vec3 grassCanopyLeafColor = max(diffuseColor.rgb - grassFloorSoilColor, vec3(0.0)) / max(grassCanopyOriginalMask, 0.0001);
vec3 grassCanopyGroundColor = grassFloorSoilColor / max(1.0 - grassCanopyOriginalMask, 0.0001);
vec3 grassCanopyView = isOrthographic ? vec3(0.0, 0.0, 1.0) : normalize(vViewPosition);
float grassCanopyElevation = abs(dot(grassCanopyView, viewMatrix[1].xyz));
// The paired 2 m source needs extra oblique overlap; retain its measured top-view coverage.
float grassCanopyObliqueDepth = 1.0 + 0.45 * pow(1.0 - grassCanopyElevation, 2.0);
float grassCanopyCoveragePower = 0.884 * grassCanopyObliqueDepth / max(grassCanopyElevation, 0.1);
float grassCanopyLocalMask = 1.0 - pow(max(0.0, 1.0 - grassCanopyOriginalMask), grassCanopyCoveragePower);
grassFloorLeafMask = grassCanopyLocalMask;
grassFloorSoilColor = grassCanopyGroundColor * (1.0 - grassFloorLeafMask);
diffuseColor.rgb = grassCanopyLeafColor * grassFloorLeafMask + grassFloorSoilColor;
