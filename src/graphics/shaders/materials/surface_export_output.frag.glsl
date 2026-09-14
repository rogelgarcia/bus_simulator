vec3 surfaceValue = diffuseColor.rgb;
if (surfaceExportPass == 1) {
    float surfaceAo = 1.0;
    #ifdef USE_AOMAP
    surfaceAo = (texture2D(aoMap, vAoMapUv).r - 1.0) * aoMapIntensity + 1.0;
    #ifdef USE_MATVAR
    surfaceAo = (mvMatVarSampleTexture2D(aoMap, vAoMapUv).r - 1.0) * aoMapIntensity + 1.0;
    #endif
    #endif
    surfaceValue = vec3(roughnessFactor, metalnessFactor, surfaceAo);
}
if (surfaceExportPass == 2) surfaceValue = inverseTransformDirection(normal, viewMatrix) * 0.5 + 0.5;
gl_FragColor = vec4(surfaceValue, 1.0);
