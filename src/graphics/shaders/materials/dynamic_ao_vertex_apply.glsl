vDynamicAoParticipant = dynamicAoParticipant;
vec4 dynamicAoPosition = vec4(transformed, 1.0);
#ifdef USE_INSTANCING
dynamicAoPosition = instanceMatrix * dynamicAoPosition;
#endif
vDynamicAoWorldPosition = (modelMatrix * dynamicAoPosition).xyz;
