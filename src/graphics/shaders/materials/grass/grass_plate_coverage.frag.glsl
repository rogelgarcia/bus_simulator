// The atlas alpha already measures coverage; preserve it through MSAA instead of widening or eroding leaf edges.
#ifdef ALPHA_TO_COVERAGE
    if (diffuseColor.a <= 0.0) discard;
#else
    #include <alphatest_fragment>
#endif
