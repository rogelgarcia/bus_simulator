// Instanced grass uses orthogonal rotation and scale, without shear.
mat3 grassInstanceNormal = mat3(instanceMatrix);
grassInstanceNormal[0] /= dot(grassInstanceNormal[0], grassInstanceNormal[0]);
grassInstanceNormal[1] /= dot(grassInstanceNormal[1], grassInstanceNormal[1]);
grassInstanceNormal[2] /= dot(grassInstanceNormal[2], grassInstanceNormal[2]);
vGrassInstanceAtlasNormal = normalMatrix * grassInstanceNormal;
