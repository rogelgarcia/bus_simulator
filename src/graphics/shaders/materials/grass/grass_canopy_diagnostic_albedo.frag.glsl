// Keep paired tile sampling, the distance-scale wrapper and the output pipeline.
gl_FragColor = vec4(grassFieldCanopySample(map, grassCanopyAlbedoB, vMapUv).rgb, 1.0);
return;
