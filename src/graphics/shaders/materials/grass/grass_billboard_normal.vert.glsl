vec3 objectNormal = vec3(sin(grassTriadYaw()), 0.0, cos(grassTriadYaw()));
#ifdef USE_TANGENT
    vec3 objectTangent = vec3(cos(grassTriadYaw()), 0.0, -sin(grassTriadYaw()));
#endif
