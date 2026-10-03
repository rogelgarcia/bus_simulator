#ifdef GRASS_IMPOSTOR_TRANSITION_CARD
vGrassImpostorBlend = grassImpostorBlend;
#else
vGrassImpostorBlend = texture2D(grassImpostorBlendMap, vec2((grassImpostorCell + 0.5) / grassImpostorCellCount, 0.5)).rg;
#endif
