#if defined(USE_SHADOWMAP) && NUM_DIR_LIGHT_SHADOWS > 0
if (grassCanopyShadowPass == 1) gl_FragColor = vec4(vec3(grassCanopyCapturedVisibility), 1.0);
#endif
