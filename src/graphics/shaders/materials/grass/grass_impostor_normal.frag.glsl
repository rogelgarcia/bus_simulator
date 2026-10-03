vec4 grassImpostorNormalSample = textureGrad(grassImpostorNormal, grassImpostorUv, grassImpostorDx, grassImpostorDy);
vec3 grassImpostorWorldNormal = normalize(grassImpostorNormalSample.rgb / max(grassImpostorNormalSample.a, 0.0001) * 2.0 - 1.0);
normal = normalize(mat3(viewMatrix) * grassImpostorWorldNormal);
vec3 grassImpostorView = isOrthographic ? vec3(0.0, 0.0, 1.0) : normalize(grassImpostorViewPosition);
float grassImpostorCosine = dot(normal, grassImpostorView);
float grassImpostorFacing = 2.0 * smoothstep(-0.08, 0.08, grassImpostorCosine) - 1.0;
vec3 grassImpostorTangent = grassImpostorView - normal * grassImpostorCosine;
normal = normalize(normal * grassImpostorFacing + grassImpostorTangent * (1.0 - abs(grassImpostorFacing)));
