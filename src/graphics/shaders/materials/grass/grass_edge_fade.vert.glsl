vec4 grassEdgePosition = vec4(transformed, 1.0);
#ifdef USE_INSTANCING
    grassEdgePosition = instanceMatrix * grassEdgePosition;
#endif
vGrassEdgePosition = grassEdgePosition.xyz;
