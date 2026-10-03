#if defined(USE_SHADOWMAP) && NUM_DIR_LIGHT_SHADOWS > 0
vGrassCanopyShadowY = directionalShadowMatrix[0] * vec4(0.0, 1.0, 0.0, 0.0);
vGrassCanopyWorldY = worldPosition.y;
vGrassCanopyWorldXZ = worldPosition.xz;
vGrassCanopyTileUv = vMapUv;
#endif
