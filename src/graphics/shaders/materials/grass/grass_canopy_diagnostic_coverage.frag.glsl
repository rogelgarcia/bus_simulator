// Retain view inputs needed by the color fit; leave the captured coverage unchanged.
vec3 grassCanopyView = isOrthographic ? vec3(0.0, 0.0, 1.0) : normalize(vViewPosition);
float grassCanopyElevation = abs(dot(grassCanopyView, viewMatrix[1].xyz));
