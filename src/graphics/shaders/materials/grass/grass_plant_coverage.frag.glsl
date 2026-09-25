// Center MSAA coverage on the cutoff used to preserve the mip silhouettes.
#if defined(USE_ALPHATEST) && defined(ALPHA_TO_COVERAGE)
    float grassAlphaWidth = max(fwidth(diffuseColor.a), 1.0 / 255.0);
    if (diffuseColor.a == 0.0) discard;
    diffuseColor.a = smoothstep(alphaTest - 0.5 * grassAlphaWidth, alphaTest + 0.5 * grassAlphaWidth, diffuseColor.a);
    if (diffuseColor.a == 0.0) discard;
#else
    #include <alphatest_fragment>
#endif
