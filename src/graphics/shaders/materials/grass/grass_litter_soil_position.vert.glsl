vec4 litterSoilPosition = vec4(transformed, 1.0);
#ifdef USE_INSTANCING
litterSoilPosition = instanceMatrix * litterSoilPosition;
#endif
vLitterSoilWorld = (modelMatrix * litterSoilPosition).xyz;
