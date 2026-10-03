vec3 grassImpostorProxy = grassImpostorCaptureCenter
    + grassImpostorRight * position.x * grassImpostorSize.x
    + grassImpostorUp * position.y * grassImpostorSize.y;
vec3 transformed = grassImpostorCenter + grassImpostorProxy;
vGrassImpostorOrigin = (modelMatrix * vec4(grassImpostorCenter, 1.0)).xyz;
vGrassImpostorProxy = grassImpostorProxy;
