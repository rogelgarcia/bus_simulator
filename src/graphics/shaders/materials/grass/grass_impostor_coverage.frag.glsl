// Filtered alpha is pixel coverage, so preserve it for multisample coverage instead of thresholding its mean.
if (diffuseColor.a <= 0.001) discard;
