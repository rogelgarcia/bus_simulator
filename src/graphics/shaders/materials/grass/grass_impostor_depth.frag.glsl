vec4 grassImpostorClipHit = projectionMatrix * vec4(-grassImpostorViewPosition, 1.0);
#ifdef USE_LOGDEPTHBUF
    gl_FragDepth = isPerspectiveMatrix(projectionMatrix)
        ? log2(max(0.000001, grassImpostorClipHit.w + 1.0)) * logDepthBufFC * 0.5
        : grassImpostorClipHit.z / grassImpostorClipHit.w * 0.5 + 0.5;
#elif defined(USE_REVERSED_DEPTH_BUFFER)
    gl_FragDepth = grassImpostorClipHit.z / grassImpostorClipHit.w;
#else
    gl_FragDepth = grassImpostorClipHit.z / grassImpostorClipHit.w * 0.5 + 0.5;
#endif
