// Filtered canopy normals overestimate low-angle sheen. Fit its energy separately
// from diffuse leaf color; retain the ground's existing PBR contribution.
float grassCanopySpecular = clamp(0.309250 + grassCanopyElevation * (0.301693 + 0.473623 * grassCanopyElevation), 0.0, 1.0);
totalSpecular *= mix(1.0, grassCanopySpecular, grassFloorLeafMask);
