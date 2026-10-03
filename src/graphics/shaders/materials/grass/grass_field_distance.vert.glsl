// Keep the rooted lower part fixed and gently compress the tips at distance.
vec3 grassFieldOriginalPosition = transformed;
vec4 grassFieldSamplePosition = vec4(transformed, 1.0);
#ifdef USE_INSTANCING
grassFieldSamplePosition = instanceMatrix * grassFieldSamplePosition;
#endif
float grassFieldRange = length((modelViewMatrix * grassFieldSamplePosition).xyz);
float grassFieldFade = smoothstep(grassFieldDistance.x, grassFieldDistance.y, grassFieldRange);
transformed.y -= max(0.0, transformed.y - 0.04) * grassFieldDistance.w * grassFieldFade;
