// Both representations partition the same stable screen-space coverage mask.
float grassImpostorThreshold = fract(52.9829189 * fract(dot(floor(gl_FragCoord.xy), vec2(0.06711056, 0.00583715))));
if (grassImpostorThreshold < vGrassImpostorBlend.x || grassImpostorThreshold >= vGrassImpostorBlend.y) discard;
