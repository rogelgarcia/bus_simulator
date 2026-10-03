// Blend before material lighting, preserving independent leaf/background colors.
grassWallSurface(diffuseColor.rgb, grassFloorLeafMask, grassFloorSoilColor, roughnessFactor);
// The revealed litter receives the same upward-facing environment lighting as the substrate.
normal = normalize(mix(normal, viewMatrix[1].xyz, 1.0 - grassFloorLeafMask));
